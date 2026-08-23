// SPDX-License-Identifier: AGPL-3.0-or-later

import {testSnowflake} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import {
	buildWireImageMessage,
	buildWireLinkMessage,
	buildWireTextMessage,
	mockChannelHistories,
	mockPaginatedChannelHistory,
	resetChannelHistoryMocks,
} from '@app/features/social_home/__fixtures__/SocialHomeWireMessageFixtures';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

/**
 * "Testes unitários — agregação do Feed" — exercises the real `fetchFeedByChannel` (the fallback
 * path used when the self-host has no search backend — see CLAUDE.md 6.1), not a re-implementation
 * of its logic. Two boundaries are stubbed:
 *
 * - `RestTransport` (`http.get`): the actual network call.
 * - `MessagingMessage`'s `Message` class: constructing a real one needs `RuntimeConfig`, a
 *   module-level singleton that transitively pulls in most of the app's state layer just by being
 *   imported (see `SocialHomeCommandMocks.ts`/`SocialHomeStateFixtures.ts` for the full story). The
 *   fake here mirrors the same wire→field mapping `Message` does for the fields this feature reads
 *   (`id`, `channelId`, `content`, `attachments`, `author`), so every other line in
 *   `SocialHomeFeedFallback.ts` — the image filter, the multi-channel merge/sort, the `hasMore`
 *   signal, the `before` cursor threading — runs unmodified, for real.
 */
vi.mock('@app/features/platform/transport/RestTransport', () => ({http: {get: vi.fn()}}));
vi.mock('@app/features/messaging/models/MessagingMessage', () => {
	class FakeMessage {
		id: string;
		channelId: string;
		content: string;
		author: unknown;
		attachments: Array<{content_type?: string | null}>;

		constructor(wire: {
			id: string;
			channel_id: string;
			content: string;
			author: unknown;
			attachments?: Array<{content_type?: string | null}>;
		}) {
			this.id = wire.id;
			this.channelId = wire.channel_id;
			this.content = wire.content;
			this.author = wire.author;
			this.attachments = wire.attachments ?? [];
		}
	}
	return {Message: FakeMessage};
});

const {http} = await import('@app/features/platform/transport/RestTransport');
const {fetchFeedByChannel} = await import('@app/features/social_home/utils/SocialHomeFeedFallback');
const getMock = http.get as unknown as Mock;

const ANA_CHANNEL_ID = 'ch-sketchbook-ana';
const BRUNO_CHANNEL_ID = 'ch-sketchbook-bruno';

afterEach(() => {
	resetChannelHistoryMocks(getMock);
	vi.clearAllMocks();
});

describe('only image messages enter the feed', () => {
	it('drops plain-text and link-only Sketchbook posts, keeps the image post', async () => {
		const imagePost = buildWireImageMessage({id: testSnowflake(3_000), channelId: ANA_CHANNEL_ID});
		const textPost = buildWireTextMessage({id: testSnowflake(2_500), channelId: ANA_CHANNEL_ID});
		const linkPost = buildWireLinkMessage({id: testSnowflake(2_000), channelId: ANA_CHANNEL_ID});
		mockChannelHistories(getMock, {
			[ANA_CHANNEL_ID]: [imagePost, textPost, linkPost],
			[BRUNO_CHANNEL_ID]: [],
		});

		const result = await fetchFeedByChannel([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID], undefined);

		expect(result.messages).toHaveLength(1);
		expect(result.messages[0]!.id).toBe(imagePost.id);
	});
});

describe('merges multiple channels sorted by timestamp desc', () => {
	it('interleaves posts from different Sketchbooks into a single newest-first feed', async () => {
		const anaNewer = buildWireImageMessage({id: testSnowflake(5_000), channelId: ANA_CHANNEL_ID});
		const anaOlder = buildWireImageMessage({id: testSnowflake(3_000), channelId: ANA_CHANNEL_ID});
		const brunoMiddle = buildWireImageMessage({id: testSnowflake(4_000), channelId: BRUNO_CHANNEL_ID});
		mockChannelHistories(getMock, {
			[ANA_CHANNEL_ID]: [anaNewer, anaOlder],
			[BRUNO_CHANNEL_ID]: [brunoMiddle],
		});

		const result = await fetchFeedByChannel([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID], undefined);

		expect(result.messages.map((message) => message.id)).toEqual([anaNewer.id, brunoMiddle.id, anaOlder.id]);
	});
});

describe('pagination: no overlap and no gap across sequential pages', () => {
	it('threads the oldest id from page one as `before` on page two and covers the whole history exactly once', async () => {
		const fullHistory = Array.from({length: 6}, (_, index) =>
			buildWireImageMessage({id: testSnowflake(9_000 - index * 1_000), channelId: ANA_CHANNEL_ID}),
		);
		mockPaginatedChannelHistory(getMock, ANA_CHANNEL_ID, fullHistory, {pageSize: 3});
		mockChannelHistories(getMock, {[BRUNO_CHANNEL_ID]: []});

		const firstPage = await fetchFeedByChannel([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID], undefined);
		expect(firstPage.messages.map((message) => message.id)).toEqual(fullHistory.slice(0, 3).map((m) => m.id));
		const [, firstPageOptions] = getMock.mock.calls[0] as [string, {query: {before: string | null}}];
		expect(firstPageOptions.query.before).toBeNull();

		const oldestFromFirstPage = firstPage.messages[firstPage.messages.length - 1]!;
		const secondPage = await fetchFeedByChannel([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID], oldestFromFirstPage.id);
		expect(secondPage.messages.map((message) => message.id)).toEqual(fullHistory.slice(3, 6).map((m) => m.id));
		const [, secondPageOptions] = getMock.mock.calls[2] as [string, {query: {before: string | null}}];
		expect(secondPageOptions.query.before).toBe(oldestFromFirstPage.id);

		const allIdsSeenAcrossBothPages = [...firstPage.messages, ...secondPage.messages].map((message) => message.id);
		expect(new Set(allIdsSeenAcrossBothPages).size).toBe(6); // no id repeated across the two pages
		expect(allIdsSeenAcrossBothPages).toEqual(fullHistory.map((message) => message.id)); // and none skipped
	});

	it('signals hasMore only when a channel returns a full page (CHANNEL_FETCH_LIMIT = 50, not exported)', async () => {
		const fullPageChannel = Array.from({length: 50}, (_, index) =>
			buildWireImageMessage({id: testSnowflake(60_000 - index * 100), channelId: ANA_CHANNEL_ID}),
		);
		const partialPageChannel = [buildWireImageMessage({id: testSnowflake(1_000), channelId: BRUNO_CHANNEL_ID})];
		mockChannelHistories(getMock, {
			[ANA_CHANNEL_ID]: fullPageChannel,
			[BRUNO_CHANNEL_ID]: partialPageChannel,
		});

		const result = await fetchFeedByChannel([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID], undefined);

		expect(result.hasMore).toBe(true);
	});

	it('reports hasMore false when every channel returns fewer than a full page', async () => {
		mockChannelHistories(getMock, {
			[ANA_CHANNEL_ID]: [buildWireImageMessage({id: testSnowflake(1_000), channelId: ANA_CHANNEL_ID})],
			[BRUNO_CHANNEL_ID]: [],
		});

		const result = await fetchFeedByChannel([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID], undefined);

		expect(result.hasMore).toBe(false);
	});
});

describe('fallback produces the same feed a search backend would for the same underlying data', () => {
	it('matches exactly what has:image + sort:desc against the same messages would return', async () => {
		const anaImage1 = buildWireImageMessage({id: testSnowflake(7_000), channelId: ANA_CHANNEL_ID, content: 'foto 1'});
		const anaText = buildWireTextMessage({id: testSnowflake(6_500), channelId: ANA_CHANNEL_ID});
		const brunoImage = buildWireImageMessage({
			id: testSnowflake(6_000),
			channelId: BRUNO_CHANNEL_ID,
			content: 'foto do bruno',
		});
		const anaImage2 = buildWireImageMessage({id: testSnowflake(5_000), channelId: ANA_CHANNEL_ID, content: 'foto 2'});
		const allMessages = [anaImage1, anaText, brunoImage, anaImage2];
		mockChannelHistories(getMock, {
			[ANA_CHANNEL_ID]: allMessages.filter((m) => m.channel_id === ANA_CHANNEL_ID),
			[BRUNO_CHANNEL_ID]: allMessages.filter((m) => m.channel_id === BRUNO_CHANNEL_ID),
		});

		const result = await fetchFeedByChannel([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID], undefined);

		// What a server-side `has:image, sort_order:desc` search over the same messages would return.
		const expectedFromSearch = allMessages
			.filter((message) => message.attachments.some((attachment) => attachment.content_type?.startsWith('image/')))
			.sort((a, b) => (a.id < b.id ? 1 : a.id > b.id ? -1 : 0));

		expect(result.messages.map((message) => message.id)).toEqual(expectedFromSearch.map((message) => message.id));
	});
});

describe('no message duplication', () => {
	it('produces exactly one output entry per qualifying input, with content/author/attachments preserved as-is', async () => {
		const original = buildWireImageMessage({
			id: testSnowflake(1_000),
			channelId: ANA_CHANNEL_ID,
			content: 'estudo de luz e sombra',
			author: {username: 'ana.aluna'},
		});
		mockChannelHistories(getMock, {[ANA_CHANNEL_ID]: [original], [BRUNO_CHANNEL_ID]: []});

		const result = await fetchFeedByChannel([ANA_CHANNEL_ID, BRUNO_CHANNEL_ID], undefined);

		expect(result.messages).toHaveLength(1);
		const post = result.messages[0]! as unknown as {
			id: string;
			channelId: string;
			content: string;
			author: {username: string};
			attachments: Array<{content_type?: string | null}>;
		};
		expect(post.id).toBe(original.id);
		expect(post.channelId).toBe(ANA_CHANNEL_ID);
		expect(post.content).toBe('estudo de luz e sombra');
		expect(post.author).toEqual({username: 'ana.aluna'});
		expect(post.attachments).toEqual(original.attachments);
	});
});
