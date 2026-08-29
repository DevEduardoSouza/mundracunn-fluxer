// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Drives `fetchCovers` through its three search outcomes — resolved, `indexing` (a never-indexed
 * new post channel makes the API answer that for the whole request), and unavailable — plus the
 * new-message watcher. The network boundaries (`searchMessages`, `fetchCoversByChannel`), the
 * channel discovery and the messages cache are stubbed; the `ForumCovers` store is real.
 */

import {fixtureSnowflake} from '@app/features/forum/__fixtures__/ForumWireMessageFixtures';
import {observable, runInAction} from 'mobx';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

interface FakeChannel {
	id: string;
	lastMessageId: string | null;
}

interface FakeMessage {
	id: string;
	channelId: string;
	attachments: Array<{content_type?: string | null}>;
}

const channels = observable.array<FakeChannel>([], {deep: false});
const cachedMessages = new Map<string, FakeMessage>();

vi.mock('@app/features/search/utils/SearchUtils', () => ({
	searchMessages: vi.fn(),
	isIndexing: (result: {indexing?: boolean}) => result.indexing === true,
}));
vi.mock('@app/features/forum/utils/ForumCoverFallback', () => ({fetchCoversByChannel: vi.fn()}));
vi.mock('@app/features/forum/utils/ForumChannelDiscovery', () => ({
	getForumPostChannels: vi.fn(() => channels.slice()),
}));
vi.mock('@app/features/messaging/state/MessagingMessages', () => ({
	default: {
		getCachedMessages: (channelId: string) => ({
			get: (messageId: string) => {
				const message = cachedMessages.get(messageId);
				return message?.channelId === channelId ? message : undefined;
			},
		}),
	},
}));
vi.mock('@app/features/platform/utils/ResponseInspection', () => ({
	failureCode: (error: unknown) => (error as {code?: string} | null)?.code,
}));

const {searchMessages} = await import('@app/features/search/utils/SearchUtils');
const {fetchCoversByChannel} = await import('@app/features/forum/utils/ForumCoverFallback');
const ForumCovers = (await import('@app/features/forum/state/ForumCovers')).default;
const {cancelCoverWork, ensureCoverLazy, fetchCovers, INDEXING_RETRY_DELAYS_MS, FALLBACK_BATCH_SIZE} = await import(
	'@app/features/forum/commands/ForumCoverCommands'
);

const searchMock = searchMessages as unknown as Mock;
const fallbackMock = fetchCoversByChannel as unknown as Mock;
const i18n = {_: (descriptor: unknown) => String(descriptor)} as never;
const GUILD = 'guild-a';

function image(channelId: string, offsetMs: number): FakeMessage {
	return {id: fixtureSnowflake(offsetMs), channelId, attachments: [{content_type: 'image/png'}]};
}

function text(channelId: string, offsetMs: number): FakeMessage {
	return {id: fixtureSnowflake(offsetMs), channelId, attachments: []};
}

function setChannels(ids: ReadonlyArray<string>): void {
	runInAction(() => {
		channels.replace(ids.map((id) => ({id, lastMessageId: null})));
	});
}

function bumpLastMessage(channelId: string, lastMessageId: string): void {
	runInAction(() => {
		const index = channels.findIndex((channel) => channel.id === channelId);
		channels[index] = {id: channelId, lastMessageId};
	});
}

/** Resolves `fetchCoversByChannel` from a per-channel table; channels absent from it have no image. */
function fallbackFrom(table: Record<string, FakeMessage>): void {
	fallbackMock.mockImplementation((ids: ReadonlyArray<string>) =>
		Promise.resolve(new Map(ids.filter((id) => id in table).map((id) => [id, table[id]] as const))),
	);
}

async function flush(): Promise<void> {
	for (let i = 0; i < 10; i++) {
		await Promise.resolve();
	}
}

async function advance(ms: number): Promise<void> {
	await vi.advanceTimersByTimeAsync(ms);
	await flush();
}

beforeEach(() => {
	vi.useFakeTimers();
	cachedMessages.clear();
	setChannels([]);
});

afterEach(() => {
	cancelCoverWork();
	ForumCovers.reset();
	ForumCovers.searchUnavailableUntil = null;
	searchMock.mockReset();
	fallbackMock.mockReset();
	vi.useRealTimers();
});

describe('fetchCovers — search resolves', () => {
	it('fills covers from the search and never touches the per-channel fallback', async () => {
		setChannels(['a', 'b']);
		searchMock.mockResolvedValue({messages: [image('a', 5_000), image('b', 4_000)]});

		await fetchCovers(i18n, GUILD);

		expect(ForumCovers.getCover('a')?.id).toBe(fixtureSnowflake(5_000));
		expect(ForumCovers.getCover('b')?.id).toBe(fixtureSnowflake(4_000));
		expect(fallbackMock).not.toHaveBeenCalled();
		expect(ForumCovers.getIsIndexing()).toBe(false);
		expect(ForumCovers.getIsLoading()).toBe(false);
	});

	it('does not lazy-fetch when the search worked', async () => {
		setChannels(['a', 'b']);
		searchMock.mockResolvedValue({messages: [image('a', 5_000)]});
		await fetchCovers(i18n, GUILD);

		await ensureCoverLazy(GUILD, 'b');

		expect(fallbackMock).not.toHaveBeenCalled();
	});
});

describe('fetchCovers — search answers indexing', () => {
	it('fills covers immediately through the fallback, then a retry completes the rest', async () => {
		setChannels(['a', 'b', 'c']);
		searchMock.mockResolvedValueOnce({indexing: true}).mockResolvedValueOnce({
			messages: [image('a', 9_000), image('b', 8_000), image('c', 7_000)],
		});
		// The fallback only sees a and b — c's history has no image within its 20-message slice.
		fallbackFrom({a: image('a', 5_000), b: image('b', 4_000)});

		await fetchCovers(i18n, GUILD);
		await flush();

		expect(ForumCovers.getIsIndexing()).toBe(true);
		expect(fallbackMock).toHaveBeenCalledTimes(1);
		expect(ForumCovers.getCover('a')?.id).toBe(fixtureSnowflake(5_000));
		expect(ForumCovers.getCover('b')?.id).toBe(fixtureSnowflake(4_000));
		expect(ForumCovers.hasCover('c')).toBe(false);
		expect(searchMock).toHaveBeenCalledTimes(1);

		await advance(INDEXING_RETRY_DELAYS_MS[0]!);

		expect(searchMock).toHaveBeenCalledTimes(2);
		expect(ForumCovers.getIsIndexing()).toBe(false);
		expect(ForumCovers.getCover('c')?.id).toBe(fixtureSnowflake(7_000));
		// The retry re-applies the search result for every channel, so a newer image wins.
		expect(ForumCovers.getCover('a')?.id).toBe(fixtureSnowflake(9_000));
	});

	it('fetches the fallback in batches of FALLBACK_BATCH_SIZE', async () => {
		const ids = Array.from({length: FALLBACK_BATCH_SIZE * 2 + 1}, (_, i) => `ch-${i}`);
		setChannels(ids);
		searchMock.mockResolvedValue({indexing: true});
		fallbackFrom({});

		await fetchCovers(i18n, GUILD);
		await flush();

		expect(fallbackMock).toHaveBeenCalledTimes(3);
		expect(fallbackMock.mock.calls.map((call) => (call[0] as Array<string>).length)).toEqual([
			FALLBACK_BATCH_SIZE,
			FALLBACK_BATCH_SIZE,
			1,
		]);
		expect(fallbackMock.mock.calls.flatMap((call) => call[0] as Array<string>)).toEqual(ids);
	});

	it('stops retrying after the backoff schedule is exhausted', async () => {
		setChannels(['a']);
		searchMock.mockResolvedValue({indexing: true});
		fallbackFrom({});

		await fetchCovers(i18n, GUILD);
		for (const delay of INDEXING_RETRY_DELAYS_MS) {
			await advance(delay);
		}
		await advance(60_000);

		expect(searchMock).toHaveBeenCalledTimes(INDEXING_RETRY_DELAYS_MS.length + 1);
		expect(ForumCovers.getIsIndexing()).toBe(false);
		// The fallback ran once for the channel; it is not re-requested on every retry.
		expect(fallbackMock).toHaveBeenCalledTimes(1);
	});

	it('lets cards entering the viewport lazy-fetch while indexing', async () => {
		setChannels(['a']);
		searchMock.mockResolvedValue({indexing: true});
		fallbackFrom({});
		await fetchCovers(i18n, GUILD);
		await flush();
		fallbackMock.mockClear();
		// A post created after the prefetch — nothing has been requested for it yet.
		setChannels(['a', 'new']);
		fallbackFrom({new: image('new', 1_000)});

		await ensureCoverLazy(GUILD, 'new');

		expect(fallbackMock).toHaveBeenCalledWith(['new']);
		expect(ForumCovers.getCover('new')?.id).toBe(fixtureSnowflake(1_000));
	});

	it('switching guild cancels the pending retry', async () => {
		setChannels(['a']);
		searchMock.mockResolvedValue({indexing: true});
		fallbackFrom({});
		await fetchCovers(i18n, GUILD);
		await flush();
		expect(searchMock).toHaveBeenCalledTimes(1);

		searchMock.mockResolvedValue({messages: []});
		await fetchCovers(i18n, 'guild-b');
		expect(searchMock).toHaveBeenCalledTimes(2);

		await advance(INDEXING_RETRY_DELAYS_MS[0]! + INDEXING_RETRY_DELAYS_MS[1]!);

		// Only guild-b's own search ran; guild-a's retry never fired.
		expect(searchMock).toHaveBeenCalledTimes(2);
		expect(searchMock.mock.calls[1]![1]).toEqual({contextGuildId: 'guild-b'});
	});

	it('leaving the page (cancelCoverWork + reset) cancels the pending retry', async () => {
		setChannels(['a']);
		searchMock.mockResolvedValue({indexing: true});
		fallbackFrom({});
		await fetchCovers(i18n, GUILD);
		await flush();

		cancelCoverWork();
		ForumCovers.reset();
		await advance(INDEXING_RETRY_DELAYS_MS[0]!);

		expect(searchMock).toHaveBeenCalledTimes(1);
	});
});

describe('fetchCovers — search unavailable', () => {
	it('marks search unavailable and leaves covers to ensureCoverLazy', async () => {
		setChannels(['a']);
		searchMock.mockRejectedValue({code: 'FEATURE_TEMPORARILY_DISABLED'});
		fallbackFrom({a: image('a', 1_000)});

		await fetchCovers(i18n, GUILD);

		expect(ForumCovers.isSearchUnavailable()).toBe(true);
		expect(fallbackMock).not.toHaveBeenCalled();

		await ensureCoverLazy(GUILD, 'a');
		expect(ForumCovers.getCover('a')?.id).toBe(fixtureSnowflake(1_000));
		await ensureCoverLazy(GUILD, 'a');
		expect(fallbackMock).toHaveBeenCalledTimes(1);
	});
});

describe('new messages after the prefetch', () => {
	it('uses the cached message as cover when it is a newer image, with no request', async () => {
		setChannels(['a']);
		searchMock.mockResolvedValue({messages: [image('a', 1_000)]});
		await fetchCovers(i18n, GUILD);

		const incoming = image('a', 2_000);
		cachedMessages.set(incoming.id, incoming);
		bumpLastMessage('a', incoming.id);

		expect(ForumCovers.getCover('a')?.id).toBe(incoming.id);
		expect(fallbackMock).not.toHaveBeenCalled();
	});

	it('keeps the old cover when the cached new message has no image', async () => {
		setChannels(['a']);
		searchMock.mockResolvedValue({messages: [image('a', 1_000)]});
		await fetchCovers(i18n, GUILD);

		const incoming = text('a', 2_000);
		cachedMessages.set(incoming.id, incoming);
		bumpLastMessage('a', incoming.id);

		expect(ForumCovers.getCover('a')?.id).toBe(fixtureSnowflake(1_000));
		expect(fallbackMock).not.toHaveBeenCalled();
	});

	it('falls back to one channel history request when the message is not cached', async () => {
		setChannels(['a']);
		searchMock.mockResolvedValue({messages: [image('a', 1_000)]});
		await fetchCovers(i18n, GUILD);
		fallbackFrom({a: image('a', 3_000)});

		bumpLastMessage('a', fixtureSnowflake(3_000));
		await flush();

		expect(fallbackMock).toHaveBeenCalledWith(['a']);
		expect(ForumCovers.getCover('a')?.id).toBe(fixtureSnowflake(3_000));
	});

	it('stops watching once cancelCoverWork ran', async () => {
		setChannels(['a']);
		searchMock.mockResolvedValue({messages: []});
		await fetchCovers(i18n, GUILD);
		cancelCoverWork();

		bumpLastMessage('a', fixtureSnowflake(3_000));
		await flush();

		expect(fallbackMock).not.toHaveBeenCalled();
	});
});
