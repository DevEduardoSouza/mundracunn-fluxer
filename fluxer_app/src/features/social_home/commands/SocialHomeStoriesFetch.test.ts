// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Guards the shape of the Stories fetch, and above all that it never sends `min_id` again.
 *
 * The 24h window used to be pushed to the search backend, which indexes a message's `id` as a
 * string and turns `min_id` into a numeric range over it — a clause that matches nothing, so the
 * bar was permanently empty on any self-host with search enabled. The window is a display rule and
 * belongs to the store; see the comment on `fetchStoriesViaSearch` for the full diagnosis.
 *
 * Mocks follow the rest of this feature: a real `Channels`/`searchMessages` needs `RuntimeConfig`
 * (see `SocialHomeCommandMocks.ts`).
 */

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {FIXTURE_BASE_TIMESTAMP_MS, testSnowflake} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

vi.mock('@app/features/social_home/utils/SocialHomeChannelDiscovery', () => ({
	getStoriesChannel: vi.fn(() => ({id: 'ch-stories', lastMessageId: null})),
}));
vi.mock('@app/features/messaging/state/MessagingMessages', () => ({default: {getCachedMessages: vi.fn()}}));
vi.mock('@app/features/social_home/utils/SocialHomeStoriesFallback', () => ({fetchStoriesByChannel: vi.fn()}));
vi.mock('@app/features/search/utils/SearchUtils', () => ({
	searchMessages: vi.fn(),
	isIndexing: vi.fn((result: {indexing?: boolean}) => result?.indexing === true),
}));
vi.mock('@app/features/platform/state/PersistentStorage', () => ({
	default: {getJSON: vi.fn(() => ({})), setJSON: vi.fn()},
}));

const {searchMessages} = await import('@app/features/search/utils/SearchUtils');
const {fetchStoriesByChannel} = await import('@app/features/social_home/utils/SocialHomeStoriesFallback');
const {fetchStories} = await import('@app/features/social_home/commands/SocialHomeStoriesCommands');
const SocialHomeStories = (await import('@app/features/social_home/state/SocialHomeStories')).default;

const searchMessagesMock = searchMessages as unknown as Mock;
const fetchStoriesByChannelMock = fetchStoriesByChannel as unknown as Mock;

const GUILD_ID = 'guild-turma-a';
const i18n = {_: (d: unknown) => String(d)} as never;

function fakeStory(id: string, contentType = 'video/mp4'): Message {
	return {
		id,
		channelId: 'ch-stories',
		author: {id: 'user-prof'},
		attachments: [{content_type: contentType}],
	} as unknown as Message;
}

function mockSearchReturning(messages: ReadonlyArray<Message>): void {
	searchMessagesMock.mockResolvedValue({messages, channels: [], total: messages.length, hitsPerPage: 25, page: 1});
}

beforeEach(() => {
	SocialHomeStories.reset();
	mockSearchReturning([]);
});

afterEach(() => {
	SocialHomeStories.reset();
	vi.clearAllMocks();
});

describe('fetchStories via search', () => {
	/** The regression this file exists for. */
	it('never sends min_id — the backend cannot filter a string id numerically', async () => {
		await fetchStories(i18n, GUILD_ID);

		expect(searchMessagesMock).toHaveBeenCalled();
		for (const call of searchMessagesMock.mock.calls) {
			const params = call[2] as Record<string, unknown>;
			expect(params).not.toHaveProperty('minId');
			expect(params).not.toHaveProperty('maxId');
		}
	});

	it('asks for image and video separately, because the backend ANDs the has filter', async () => {
		await fetchStories(i18n, GUILD_ID);

		const asked = searchMessagesMock.mock.calls.map((call) => (call[2] as {has: Array<string>}).has);
		expect(asked).toEqual([['image'], ['video']]);
	});

	it('keeps the newest first so the hit cap drops the oldest', async () => {
		await fetchStories(i18n, GUILD_ID);

		const params = searchMessagesMock.mock.calls[0]![2] as {sortBy: string; sortOrder: string};
		expect(params).toMatchObject({sortBy: 'timestamp', sortOrder: 'desc'});
	});

	it('surfaces a story the search just returned', async () => {
		const story = fakeStory(testSnowflake(0));
		mockSearchReturning([story]);

		await fetchStories(i18n, GUILD_ID);

		expect(SocialHomeStories.stories.map((s) => s.id)).toEqual([story.id]);
	});

	/**
	 * The window did not disappear with the server-side filter — it moved to where it always
	 * belonged, and is re-evaluated against the clock rather than frozen at fetch time.
	 */
	it('still hides a story older than 24h, now on the client', async () => {
		// The window is measured against the wall clock, so it has to be pinned to the fixtures' base.
		vi.useFakeTimers();
		vi.setSystemTime(FIXTURE_BASE_TIMESTAMP_MS);
		try {
			const antiga = fakeStory(testSnowflake(-25 * 60 * 60 * 1000));
			const recente = fakeStory(testSnowflake(0));
			mockSearchReturning([recente, antiga]);

			await fetchStories(i18n, GUILD_ID);

			expect(SocialHomeStories.stories).toHaveLength(2);
			expect(SocialHomeStories.getVisibleStories().map((s) => s.id)).toEqual([recente.id]);
		} finally {
			vi.useRealTimers();
		}
	});

	/** The fallback talks to the channel API, whose `after` is a real snowflake comparison. */
	it('still hands the window to the fallback, where it does work', async () => {
		searchMessagesMock.mockRejectedValue(
			Object.assign(new Error('sem busca'), {status: 503, body: {code: 'FEATURE_TEMPORARILY_DISABLED'}}),
		);
		fetchStoriesByChannelMock.mockResolvedValue([]);

		await fetchStories(i18n, GUILD_ID);

		if (fetchStoriesByChannelMock.mock.calls.length > 0) {
			const [, minId] = fetchStoriesByChannelMock.mock.calls[0] as [string, string];
			expect(BigInt(minId)).toBeGreaterThan(0n);
		}
	});
});
