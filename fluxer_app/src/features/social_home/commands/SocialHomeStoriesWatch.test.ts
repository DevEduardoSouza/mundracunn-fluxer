// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `watchNewStories` is the fix for "o stories parece ter parado de funcionar" (30/08/2026): the bar
 * fetched only on mount, so publishing a story and staying on the Gallery showed nothing.
 *
 * `getStoriesChannel` is mocked over an observable box so the reaction has something real to track —
 * that is exactly what the `Channels` store gives it in production, where MESSAGE_CREATE bumps
 * `lastMessageId`. Everything else is mocked for the usual reason in this feature: a real
 * `Channels`/`Messages`/`searchMessages` needs `RuntimeConfig` (see `SocialHomeCommandMocks.ts`).
 */

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {testSnowflake} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import {observable, runInAction} from 'mobx';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

const storiesChannel = observable.box<{id: string; lastMessageId: string | null} | undefined>(undefined);

vi.mock('@app/features/social_home/utils/SocialHomeChannelDiscovery', () => ({
	getStoriesChannel: vi.fn(() => storiesChannel.get()),
}));
vi.mock('@app/features/messaging/state/MessagingMessages', () => ({default: {getCachedMessages: vi.fn()}}));
vi.mock('@app/features/social_home/utils/SocialHomeStoriesFallback', () => ({fetchStoriesByChannel: vi.fn()}));
vi.mock('@app/features/search/utils/SearchUtils', () => ({searchMessages: vi.fn(), isIndexing: vi.fn(() => false)}));
vi.mock('@app/features/platform/state/PersistentStorage', () => ({
	default: {getJSON: vi.fn(() => ({})), setJSON: vi.fn()},
}));

const Messages = (await import('@app/features/messaging/state/MessagingMessages')).default;
const {fetchStoriesByChannel} = await import('@app/features/social_home/utils/SocialHomeStoriesFallback');
const {watchNewStories} = await import('@app/features/social_home/commands/SocialHomeStoriesCommands');
const SocialHomeStories = (await import('@app/features/social_home/state/SocialHomeStories')).default;

const getCachedMessagesMock = Messages.getCachedMessages as unknown as Mock;
const fetchStoriesByChannelMock = fetchStoriesByChannel as unknown as Mock;

const GUILD_ID = 'guild-turma-a';
const CHANNEL_ID = 'ch-stories';

function fakeStory(overrides: {id: string; contentType?: string | null}): Message {
	return {
		id: overrides.id,
		channelId: CHANNEL_ID,
		author: {id: 'user-prof'},
		attachments: overrides.contentType == null ? [] : [{content_type: overrides.contentType}],
	} as unknown as Message;
}

/** What MESSAGE_CREATE does to the Channels store: the channel's lastMessageId moves. */
function postMessage(messageId: string): void {
	runInAction(() => storiesChannel.set({id: CHANNEL_ID, lastMessageId: messageId}));
}

let stopWatching: (() => void) | null = null;

beforeEach(() => {
	runInAction(() => storiesChannel.set({id: CHANNEL_ID, lastMessageId: null}));
	SocialHomeStories.reset();
	SocialHomeStories.setGuildId(GUILD_ID);
	getCachedMessagesMock.mockReturnValue(undefined);
	fetchStoriesByChannelMock.mockResolvedValue([]);
	stopWatching = watchNewStories(GUILD_ID);
});

afterEach(() => {
	stopWatching?.();
	stopWatching = null;
	SocialHomeStories.reset();
	vi.clearAllMocks();
});

describe('watchNewStories', () => {
	it('adds a story the gateway already delivered, without touching the network', () => {
		const story = fakeStory({id: testSnowflake(1), contentType: 'video/mp4'});
		getCachedMessagesMock.mockReturnValue(new Map([[story.id, story]]));

		postMessage(story.id);

		expect(SocialHomeStories.stories.map((s) => s.id)).toEqual([story.id]);
		expect(fetchStoriesByChannelMock).not.toHaveBeenCalled();
	});

	it('ignores a comment — a reply in the same channel carries no media', () => {
		const comment = fakeStory({id: testSnowflake(2), contentType: null});
		getCachedMessagesMock.mockReturnValue(new Map([[comment.id, comment]]));

		postMessage(comment.id);

		expect(SocialHomeStories.stories).toEqual([]);
		expect(fetchStoriesByChannelMock).not.toHaveBeenCalled();
	});

	/**
	 * The Gallery never opens the Stories channel, so its history usually isn't cached. Resolving it
	 * goes straight to the channel rather than to search: Meilisearch indexes asynchronously, and a
	 * story posted a second ago is routinely not searchable yet — the very reason the client saw
	 * only some of the videos.
	 */
	it('falls back to a channel fetch when the message is not cached', async () => {
		const story = fakeStory({id: testSnowflake(3), contentType: 'image/png'});
		fetchStoriesByChannelMock.mockResolvedValue([story]);

		postMessage(story.id);
		await vi.waitFor(() => expect(SocialHomeStories.stories.map((s) => s.id)).toEqual([story.id]));

		expect(fetchStoriesByChannelMock).toHaveBeenCalledWith(CHANNEL_ID, expect.any(String));
	});

	it('keeps the stories the initial fetch already resolved, newest first', () => {
		const older = fakeStory({id: testSnowflake(1), contentType: 'image/png'});
		const newer = fakeStory({id: testSnowflake(2), contentType: 'video/mp4'});
		SocialHomeStories.setStories([older]);
		getCachedMessagesMock.mockReturnValue(new Map([[newer.id, newer]]));

		postMessage(newer.id);

		expect(SocialHomeStories.stories.map((s) => s.id)).toEqual([newer.id, older.id]);
	});

	it('does not add the same story twice', () => {
		const story = fakeStory({id: testSnowflake(4), contentType: 'image/png'});
		getCachedMessagesMock.mockReturnValue(new Map([[story.id, story]]));

		postMessage(story.id);
		SocialHomeStories.addStories([story]);

		expect(SocialHomeStories.stories).toHaveLength(1);
	});

	it('drops a late arrival for a class the reader already left', () => {
		const story = fakeStory({id: testSnowflake(5), contentType: 'image/png'});
		getCachedMessagesMock.mockReturnValue(new Map([[story.id, story]]));
		SocialHomeStories.setGuildId('guild-outra-turma');

		postMessage(story.id);

		expect(SocialHomeStories.stories).toEqual([]);
	});

	it('stops watching once disposed', () => {
		const story = fakeStory({id: testSnowflake(6), contentType: 'image/png'});
		getCachedMessagesMock.mockReturnValue(new Map([[story.id, story]]));

		stopWatching?.();
		stopWatching = null;
		postMessage(story.id);

		expect(SocialHomeStories.stories).toEqual([]);
	});
});
