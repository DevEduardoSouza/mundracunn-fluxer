// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Exercises the real cover plumbing — `firstMessagePerChannel` (the "keep the newest image per
 * channel" grouping both the search and fallback paths run through) and `fetchCoversByChannel` (the
 * no-Meilisearch fallback) — plus the store's search-unavailable TTL. Two boundaries are stubbed,
 * same as social_home's fallback test: `RestTransport` (the network call) and `MessagingMessage`
 * (constructing a real `Message` needs `RuntimeConfig`, a module singleton that pulls in most of the
 * app). The fake mirrors the `id`/`channel_id`/`attachments` mapping this feature reads.
 */

vi.mock('@app/features/platform/transport/RestTransport', () => ({http: {get: vi.fn()}}));
vi.mock('@app/features/messaging/models/MessagingMessage', () => {
	class FakeMessage {
		id: string;
		channelId: string;
		attachments: Array<{content_type?: string | null}>;
		constructor(wire: {id: string; channel_id: string; attachments?: Array<{content_type?: string | null}>}) {
			this.id = wire.id;
			this.channelId = wire.channel_id;
			this.attachments = wire.attachments ?? [];
		}
	}
	return {Message: FakeMessage};
});

import {fromTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

const {http} = await import('@app/features/platform/transport/RestTransport');
const {Message} = await import('@app/features/messaging/models/MessagingMessage');
const {firstMessagePerChannel} = await import('@app/features/forum/utils/ForumCoverGrouping');
const {fetchCoversByChannel} = await import('@app/features/forum/utils/ForumCoverFallback');
const ForumCovers = (await import('@app/features/forum/state/ForumCovers')).default;

const getMock = http.get as unknown as Mock;
const BASE_MS = Date.UTC(2026, 0, 15, 12, 0, 0);

function snowflake(offsetMs: number): string {
	return fromTimestamp(BASE_MS + offsetMs);
}

function image(overrides: {id: string; channelId: string}): {
	id: string;
	channel_id: string;
	attachments: Array<{content_type: string}>;
} {
	return {id: overrides.id, channel_id: overrides.channelId, attachments: [{content_type: 'image/png'}]};
}

function textOnly(overrides: {id: string; channelId: string}): {
	id: string;
	channel_id: string;
	attachments: Array<{content_type: string}>;
} {
	return {id: overrides.id, channel_id: overrides.channelId, attachments: []};
}

afterEach(() => {
	getMock.mockReset();
	ForumCovers.reset();
});

describe('firstMessagePerChannel — newest image per channel', () => {
	it('keeps the first message seen for each channel and drops the rest', () => {
		const messages = [
			new Message(image({id: snowflake(5_000), channelId: 'a'})),
			new Message(image({id: snowflake(4_000), channelId: 'b'})),
			new Message(image({id: snowflake(3_000), channelId: 'a'})),
		] as never[];

		const byChannel = firstMessagePerChannel(messages);

		expect(byChannel.size).toBe(2);
		expect((byChannel.get('a') as unknown as {id: string}).id).toBe(snowflake(5_000));
		expect((byChannel.get('b') as unknown as {id: string}).id).toBe(snowflake(4_000));
	});
});

describe('fetchCoversByChannel — fallback without a search backend', () => {
	it('takes the newest image message per channel and skips channels with no image', async () => {
		getMock.mockImplementation((path: string) => {
			if (path.includes('chan-with-images')) {
				return Promise.resolve({
					body: [
						textOnly({id: snowflake(9_000), channelId: 'chan-with-images'}),
						image({id: snowflake(8_000), channelId: 'chan-with-images'}),
						image({id: snowflake(2_000), channelId: 'chan-with-images'}),
					],
				});
			}
			return Promise.resolve({body: [textOnly({id: snowflake(1_000), channelId: 'chan-text-only'})]});
		});

		const covers = await fetchCoversByChannel(['chan-with-images', 'chan-text-only']);

		expect(covers.size).toBe(1);
		expect((covers.get('chan-with-images') as unknown as {id: string}).id).toBe(snowflake(8_000));
		expect(covers.has('chan-text-only')).toBe(false);
	});

	it('requests each channel exactly once', async () => {
		getMock.mockResolvedValue({body: []});

		await fetchCoversByChannel(['a', 'b', 'c']);

		expect(getMock).toHaveBeenCalledTimes(3);
	});
});

describe('ForumCovers store — search-unavailable TTL', () => {
	it('reports unavailable for 5 minutes after markSearchUnavailable, and reset does not clear it', () => {
		vi.useFakeTimers();
		try {
			ForumCovers.markSearchUnavailable();
			expect(ForumCovers.isSearchUnavailable()).toBe(true);

			vi.advanceTimersByTime(4 * 60 * 1000);
			ForumCovers.reset();
			expect(ForumCovers.isSearchUnavailable()).toBe(true);

			vi.advanceTimersByTime(2 * 60 * 1000);
			expect(ForumCovers.isSearchUnavailable()).toBe(false);
		} finally {
			vi.useRealTimers();
		}
	});
});
