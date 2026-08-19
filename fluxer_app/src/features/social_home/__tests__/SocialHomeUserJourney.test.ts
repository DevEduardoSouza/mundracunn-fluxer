// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	mockFallbackMessages,
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
 * "Infraestrutura de testes do fluxer_app" checklist item — a full session driven entirely through
 * the real production call chain (discoverFeedChannelIds -> SocialHomeCommands -> SocialHome state),
 * the way a student actually experiences it: open the class, scroll, live through a backend hiccup,
 * switch classes mid-request.
 *
 * Boundaries stubbed, and why: `Channels`/`Permission` (constructing real ones needs `RuntimeConfig`,
 * a module-level singleton that transitively pulls in most of the app's state layer — see
 * `SocialHomeStateFixtures.ts`) and `SearchUtils.searchMessages`/`SocialHomeFeedFallback.fetchFeedByChannel`
 * (both construct a real `Message` from wire JSON, same `RuntimeConfig` problem — see
 * `SocialHomeCommandMocks.ts`). Everything else — channel discovery, command orchestration, feed
 * state — is the real feature code.
 *
 * This intentionally stops at the command/state layer rather than mounting <SocialHomePage>: nothing
 * in this codebase mounts a full feature page in tests (ChannelHeader/ChannelViewScaffold/ChannelMessage
 * pull in markdown rendering, reactions, guild state, routing...), and doing so here would make this
 * "infra" card own fixtures for all of that instead of the feature cards that actually need them.
 * Component-level "as a user clicks" coverage for the Feed/Stories UI belongs to their own cards.
 *
 * Not covered here (belongs to card "Testes unitários — agregação do Feed", which already lists it):
 * image-only filtering inside `SocialHomeFeedFallback.fetchFeedByChannel`. Testing it for real means
 * constructing a `Message` from wire JSON, i.e. the same `RuntimeConfig` cost described above — a
 * plausible fix when that card comes up is exporting `messageHasImageAttachment` for direct testing
 * instead of exercising the real `fetchFeedByChannel` end-to-end.
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

const TURMA_A = 'guild-turma-a';
const TURMA_B = 'guild-turma-b';
const CATEGORY_ID = 'cat-sketchbooks';
const ANA_CHANNEL_ID = 'ch-sketchbook-ana';
const BRUNO_CHANNEL_ID = 'ch-sketchbook-bruno';
const PROFESSOR_FEED_CHANNEL_ID = 'ch-feed-do-professor';
const FEED_VIEW_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;

function seedTurmaA(): void {
	seedGuildChannels(getGuildChannelsMock, TURMA_A, [
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
// real outage window — see the comment on markSearchUnavailable in SocialHome.ts). Faking Date keeps
// that window from leaking between it() blocks without touching production code.
let clockTick = 0;

beforeEach(() => {
	vi.useFakeTimers({toFake: ['Date']});
	vi.setSystemTime(FIXTURE_BASE_TIMESTAMP_MS + clockTick * 10 * 60 * 1000);
	clockTick += 1;
	seedTurmaA();
});

afterEach(() => {
	SocialHome.reset();
	vi.clearAllMocks();
	vi.useRealTimers();
});

describe('a student opening the class Home for a full session', () => {
	it('loads a de-duplicated feed, pages older posts, survives a search outage mid-session, and ignores stale responses after switching classes', async () => {
		// --- Phase 1: Ana opens Turma A's Home for the first time -----------------------------------
		// She posted two photos in her own Sketchbook; the search backend already applies has:image
		// server-side, so only qualifying posts reach the response — the assertion here is that
		// fetchFeed stores exactly what search returned, once each, with content/author/attachment
		// intact (nothing duplicated or rewritten).
		const anaPhoto1 = buildSketchbookImagePost({
			id: testSnowflake(20_000),
			channelId: ANA_CHANNEL_ID,
			author: {username: 'ana.aluna'},
			content: 'terminei o estudo de sombra hoje',
		});
		const anaPhoto2 = buildSketchbookImagePost({
			id: testSnowflake(19_000),
			channelId: ANA_CHANNEL_ID,
			author: {username: 'ana.aluna'},
			content: 'segunda tentativa',
		});
		const professorPost = buildSketchbookImagePost({
			id: testSnowflake(21_000),
			channelId: PROFESSOR_FEED_CHANNEL_ID,
			content: 'Referencia de hoje',
		});
		// FEED_HITS_PER_PAGE (SocialHomeCommands.ts) is 25 and isn't exported — a full 25-message page
		// is what flips SocialHome.getHasMore() to true, so the class's history needs to be that deep
		// for her to actually see a "load more" scroll in phase 2. The 22 filler posts are older than
		// the three named ones and never individually asserted on.
		const olderFillerPosts = Array.from({length: 22}, (_, index) =>
			buildSketchbookImagePost({id: testSnowflake(18_990 - index * 40), channelId: ANA_CHANNEL_ID}),
		);
		mockSearchSuccess(searchMessagesMock, [professorPost, anaPhoto1, anaPhoto2, ...olderFillerPosts]);

		await fetchFeed(fakeI18n, TURMA_A);

		const firstLoad = SocialHome.getPosts();
		expect(firstLoad).toHaveLength(25);
		expect(firstLoad.slice(0, 3).map((post) => post.id)).toEqual([professorPost.id, anaPhoto1.id, anaPhoto2.id]);
		const anaCard = firstLoad.find((post) => post.id === anaPhoto1.id)!;
		expect(anaCard.content).toBe('terminei o estudo de sombra hoje');
		expect(anaCard.author.username).toBe('ana.aluna');
		expect(anaCard.attachments[0]?.url).toBe(anaPhoto1.attachments[0]!.url);

		// --- Phase 2: she scrolls to the bottom and the list pages in older posts --------------------
		const fullPage = Array.from({length: 25}, (_, index) =>
			buildSketchbookImagePost({id: testSnowflake(18_000 - index * 10), channelId: BRUNO_CHANNEL_ID}),
		);
		mockSearchSuccess(searchMessagesMock, fullPage);
		await fetchNextFeedPage(fakeI18n, TURMA_A);
		expect(SocialHome.getPosts()).toHaveLength(25 + 25);
		expect(SocialHome.getHasMore()).toBe(true);

		// --- Phase 3: mid-scroll the self-host's search backend goes down -----------------------------
		// The next page request fails with FEATURE_TEMPORARILY_DISABLED; the command must recover via
		// the per-channel fallback transparently — she keeps scrolling, sees no error, just older posts.
		mockSearchUnavailable(searchMessagesMock);
		const brunoOlderPhoto = buildSketchbookImagePost({id: testSnowflake(5_000), channelId: BRUNO_CHANNEL_ID});
		mockFallbackMessages(fetchFeedByChannelMock, [brunoOlderPhoto], {hasMore: true});
		await fetchNextFeedPage(fakeI18n, TURMA_A);

		expect(SocialHome.getError()).toBeNull();
		expect(SocialHome.isSearchUnavailable()).toBe(true);
		expect(SocialHome.getHasMore()).toBe(true);
		const afterOutage = SocialHome.getPosts();
		expect(afterOutage).toHaveLength(25 + 25 + 1);
		expect(afterOutage[afterOutage.length - 1]!.id).toBe(brunoOlderPhoto.id);

		// --- Phase 4: she switches to Turma B while a request for Turma A is still in flight ----------
		let resolveLateFallback: (value: unknown) => void = () => {};
		fetchFeedByChannelMock.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					resolveLateFallback = resolve;
				}),
		);
		const lateRequest = fetchNextFeedPage(fakeI18n, TURMA_A);
		SocialHome.reset();
		SocialHome.setGuildId(TURMA_B);
		resolveLateFallback({
			messages: [buildSketchbookImagePost({id: testSnowflake(1_000), channelId: BRUNO_CHANNEL_ID})],
			hasMore: false,
		});
		await lateRequest;

		expect(SocialHome.getGuildId()).toBe(TURMA_B);
		expect(SocialHome.getPosts()).toEqual([]);
	});
});

describe('channel discovery honors the Sketchbooks convention for real', () => {
	it("excludes a Sketchbook the student can't view and channels outside the convention", async () => {
		const outsiderChannelId = 'ch-random-chat';
		seedGuildChannels(getGuildChannelsMock, TURMA_A, [
			buildFakeCategory({id: CATEGORY_ID}),
			buildFakeTextChannel({id: ANA_CHANNEL_ID, parentId: CATEGORY_ID, name: 'sketchbook-ana'}),
			buildFakeTextChannel({id: BRUNO_CHANNEL_ID, parentId: CATEGORY_ID, name: 'sketchbook-bruno'}),
			buildFakeTextChannel({id: PROFESSOR_FEED_CHANNEL_ID, parentId: null, name: 'feed-do-professor'}),
			buildFakeTextChannel({id: outsiderChannelId, parentId: null, name: 'papo-livre'}),
		]);
		// Only Ana's Sketchbook and the professor's channel are viewable — Bruno's Sketchbook (private
		// per-student, see SocialHomeChannelDiscovery.ts) and the unrelated "papo-livre" channel aren't.
		stubViewableChannels(getChannelPermissionsMock, [ANA_CHANNEL_ID, PROFESSOR_FEED_CHANNEL_ID], FEED_VIEW_PERMISSIONS);
		mockSearchSuccess(searchMessagesMock, []);

		await fetchFeed(fakeI18n, TURMA_A);

		const [, , params] = searchMessagesMock.mock.calls[0] as [unknown, unknown, {channelId: Array<string>}];
		expect(params.channelId).toEqual(expect.arrayContaining([ANA_CHANNEL_ID, PROFESSOR_FEED_CHANNEL_ID]));
		expect(params.channelId).not.toEqual(expect.arrayContaining([BRUNO_CHANNEL_ID, outsiderChannelId]));
	});
});
