// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	mockFallbackMessages,
	mockSearchIndexing,
	mockSearchSuccess,
	mockSearchUnavailable,
} from '@app/features/social_home/__fixtures__/SocialHomeCommandMocks';
import {seedGuildChannels, stubViewableChannels} from '@app/features/social_home/__fixtures__/SocialHomeStateFixtures';
import {
	buildFakeCategory,
	buildFakeTextChannel,
	buildSketchbookImagePost,
	FIXTURE_BASE_TIMESTAMP_MS,
	testSnowflake,
} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import {fetchFeed, fetchNextFeedPage} from '@app/features/social_home/commands/SocialHomeCommands';
import SocialHome from '@app/features/social_home/state/SocialHome';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {I18n} from '@lingui/core';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

/**
 * Real `Channels`/`Permission`/`Message` construction needs `RuntimeConfig`, which is a module-level
 * singleton that transitively pulls in most of the app's state layer (see
 * `SocialHomeStateFixtures.ts` / `SocialHomeCommandMocks.ts` for the full reasoning). So this test
 * exercises the real `discoverFeedChannelIds` + `fetchFeed`/`fetchNextFeedPage` orchestration, with
 * only those two boundaries stubbed.
 */
vi.mock('@app/features/channel/state/Channels', () => ({default: {getGuildChannels: vi.fn(), getChannel: vi.fn()}}));
vi.mock('@app/features/permissions/state/Permission', () => ({default: {getChannelPermissions: vi.fn()}}));
vi.mock('@app/features/search/utils/SearchUtils', () => ({
	searchMessages: vi.fn(),
	isIndexing: (result: unknown) =>
		Boolean(result) &&
		typeof result === 'object' &&
		'indexing' in (result as object) &&
		(result as {indexing: unknown}).indexing === true,
}));
vi.mock('@app/features/social_home/utils/SocialHomeFeedFallback', () => ({fetchFeedByChannel: vi.fn()}));

const Channels = (await import('@app/features/channel/state/Channels')).default;
const Permission = (await import('@app/features/permissions/state/Permission')).default;
const {searchMessages} = await import('@app/features/search/utils/SearchUtils');
const {fetchFeedByChannel} = await import('@app/features/social_home/utils/SocialHomeFeedFallback');
const getGuildChannelsMock = Channels.getGuildChannels as unknown as Mock;
const getChannelPermissionsMock = Permission.getChannelPermissions as unknown as Mock;
const searchMessagesMock = searchMessages as unknown as Mock;
const fetchFeedByChannelMock = fetchFeedByChannel as unknown as Mock;

const fakeI18n = {_: () => ''} as unknown as I18n;

const GUILD_ID = 'guild-turma-1';
const CATEGORY_ID = 'cat-sketchbooks';
const ANA_CHANNEL_ID = 'ch-sketchbook-ana';
const BRUNO_CHANNEL_ID = 'ch-sketchbook-bruno';
const PROFESSOR_FEED_CHANNEL_ID = 'ch-feed-do-professor';
const FEED_VIEW_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;

function seedClassChannels(): void {
	seedGuildChannels(getGuildChannelsMock, GUILD_ID, [
		buildFakeCategory({id: CATEGORY_ID}),
		buildFakeTextChannel({id: ANA_CHANNEL_ID, parentId: CATEGORY_ID, name: 'sketchbook-ana'}),
		buildFakeTextChannel({id: BRUNO_CHANNEL_ID, parentId: CATEGORY_ID, name: 'sketchbook-bruno'}),
		buildFakeTextChannel({id: PROFESSOR_FEED_CHANNEL_ID, parentId: null, name: 'feed-do-professor'}),
	]);
	stubViewableChannels(
		getChannelPermissionsMock,
		[ANA_CHANNEL_ID, BRUNO_CHANNEL_ID, PROFESSOR_FEED_CHANNEL_ID],
		FEED_VIEW_PERMISSIONS,
	);
}

// SocialHome.searchUnavailableUntil is deliberately not cleared by SocialHome.reset() (it models a
// real outage window — see the comment on markSearchUnavailable in SocialHome.ts), so it survives
// across `it()` blocks in this file same as it would across guild switches in the app. Faking Date
// and advancing it further every test keeps that window from leaking into unrelated assertions
// while still exercising the real 5-minute-window logic (just not real wall-clock time).
let clockTick = 0;

beforeEach(() => {
	vi.useFakeTimers({toFake: ['Date']});
	vi.setSystemTime(FIXTURE_BASE_TIMESTAMP_MS + clockTick * 10 * 60 * 1000);
	clockTick += 1;
	seedClassChannels();
});

afterEach(() => {
	SocialHome.reset();
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe('fetchFeed — search path', () => {
	it('scopes the search request to the discovered Sketchbook + professor channels and stores the results as-is', async () => {
		const professorPost = buildSketchbookImagePost({
			id: testSnowflake(2_000),
			channelId: PROFESSOR_FEED_CHANNEL_ID,
			content: 'Aula de hoje gravada!',
		});
		const anaPost = buildSketchbookImagePost({id: testSnowflake(1_000), channelId: ANA_CHANNEL_ID});
		mockSearchSuccess(searchMessagesMock, [professorPost, anaPost]);

		await fetchFeed(fakeI18n, GUILD_ID);

		expect(searchMessagesMock).toHaveBeenCalledTimes(1);
		const [, , params] = searchMessagesMock.mock.calls[0] as [
			unknown,
			unknown,
			{channelId: Array<string>; has: Array<string>},
		];
		expect(params.has).toEqual(['image']);
		expect(params.channelId).toEqual(
			expect.arrayContaining([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID, PROFESSOR_FEED_CHANNEL_ID]),
		);

		const posts = SocialHome.getPosts();
		expect(posts.map((post) => post.id)).toEqual([professorPost.id, anaPost.id]);
		expect(posts[0]!.content).toBe('Aula de hoje gravada!');
		expect(SocialHome.getIsLoading()).toBe(false);
		expect(SocialHome.getError()).toBeNull();
	});

	/**
	 * "Preparando a busca desta turma pela primeira vez" used to be a dead end: the reader had to
	 * reload by hand, which is what the class owner hit every time a forum post opened a brand-new
	 * channel (31/08/2026). Reading the channels needs no index, so the Gallery just loads.
	 */
	it('serves the Gallery from the channels while the index is still being built', async () => {
		mockSearchIndexing(searchMessagesMock);
		const imagePost = buildSketchbookImagePost({id: testSnowflake(2_000), channelId: ANA_CHANNEL_ID});
		mockFallbackMessages(fetchFeedByChannelMock, [imagePost]);

		await fetchFeed(fakeI18n, GUILD_ID);

		expect(SocialHome.getPosts().map((post) => post.id)).toEqual([imagePost.id]);
		expect(SocialHome.getIsIndexing()).toBe(false);
		// The index will catch up; the next load must go back to search.
		expect(SocialHome.isSearchUnavailable()).toBe(false);
	});

	it('falls back to the indexing message only when the channels fail too', async () => {
		mockSearchIndexing(searchMessagesMock);
		fetchFeedByChannelMock.mockRejectedValueOnce(new Error('sem rede'));

		await fetchFeed(fakeI18n, GUILD_ID);

		expect(SocialHome.getIsIndexing()).toBe(true);
		expect(SocialHome.getPosts()).toEqual([]);
		expect(SocialHome.isSearchUnavailable()).toBe(false);
	});
});

describe('fetchFeed — fallback path', () => {
	it('falls back to per-channel history when search reports itself unavailable', async () => {
		mockSearchUnavailable(searchMessagesMock);
		const imagePost = buildSketchbookImagePost({id: testSnowflake(1_000), channelId: ANA_CHANNEL_ID});
		mockFallbackMessages(fetchFeedByChannelMock, [imagePost]);

		await fetchFeed(fakeI18n, GUILD_ID);

		expect(SocialHome.isSearchUnavailable()).toBe(true);
		expect(fetchFeedByChannelMock).toHaveBeenCalledWith(
			expect.arrayContaining([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID, PROFESSOR_FEED_CHANNEL_ID]),
			undefined,
		);
		const posts = SocialHome.getPosts();
		expect(posts).toHaveLength(1);
		expect(posts[0]!.id).toBe(imagePost.id);
	});

	it('stays on the fallback for the rest of the outage window instead of re-probing search on every fetch', async () => {
		mockSearchUnavailable(searchMessagesMock);
		mockFallbackMessages(fetchFeedByChannelMock, [
			buildSketchbookImagePost({id: testSnowflake(1_000), channelId: ANA_CHANNEL_ID}),
		]);
		await fetchFeed(fakeI18n, GUILD_ID);
		expect(searchMessagesMock).toHaveBeenCalledTimes(1);

		mockFallbackMessages(fetchFeedByChannelMock, [
			buildSketchbookImagePost({id: testSnowflake(1_100), channelId: ANA_CHANNEL_ID}),
		]);
		await fetchFeed(fakeI18n, GUILD_ID);

		expect(searchMessagesMock).toHaveBeenCalledTimes(1);
		expect(fetchFeedByChannelMock).toHaveBeenCalledTimes(2);
	});
});

describe('fetchNextFeedPage', () => {
	it('pages backward from the oldest visible post once a full page signals more history, and appends instead of replacing', async () => {
		// FEED_HITS_PER_PAGE (SocialHomeCommands.ts) is 25 and isn't exported — a full page of 25 is
		// what flips SocialHome.getHasMore() to true, so the fixture page must match that exactly.
		const firstPage = Array.from({length: 25}, (_, index) =>
			buildSketchbookImagePost({
				id: testSnowflake(50_000 - index * 1_000),
				channelId: index % 2 === 0 ? ANA_CHANNEL_ID : BRUNO_CHANNEL_ID,
			}),
		);
		mockSearchSuccess(searchMessagesMock, firstPage);
		await fetchFeed(fakeI18n, GUILD_ID);
		expect(SocialHome.getHasMore()).toBe(true);
		const oldestFromFirstPage = firstPage[firstPage.length - 1]!;

		const older = buildSketchbookImagePost({id: testSnowflake(1_000), channelId: BRUNO_CHANNEL_ID});
		mockSearchSuccess(searchMessagesMock, [older]);
		await fetchNextFeedPage(fakeI18n, GUILD_ID);

		expect(searchMessagesMock).toHaveBeenCalledTimes(2);
		const [, , secondParams] = searchMessagesMock.mock.calls[1] as [unknown, unknown, {maxId?: string}];
		expect(secondParams.maxId).toBe(oldestFromFirstPage.id);
		expect(SocialHome.getHasMore()).toBe(false);
		const posts = SocialHome.getPosts();
		expect(posts).toHaveLength(26);
		expect(posts[0]!.id).toBe(firstPage[0]!.id);
		expect(posts[posts.length - 1]!.id).toBe(older.id);
	});
});

describe('fetchFeed — stale guild switch', () => {
	it('drops a response that arrives after the user has already navigated to another class', async () => {
		let resolveSearch: (value: unknown) => void = () => {};
		searchMessagesMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveSearch = resolve;
				}),
		);

		const pending = fetchFeed(fakeI18n, GUILD_ID);
		const anaPost = buildSketchbookImagePost({id: testSnowflake(1_000), channelId: ANA_CHANNEL_ID});
		resolveSearch({messages: [anaPost], channels: [], total: 1, hitsPerPage: 25, page: 1});

		SocialHome.reset();
		SocialHome.setGuildId('guild-turma-2');
		await pending;

		expect(SocialHome.getGuildId()).toBe('guild-turma-2');
		expect(SocialHome.getPosts()).toEqual([]);
	});
});
