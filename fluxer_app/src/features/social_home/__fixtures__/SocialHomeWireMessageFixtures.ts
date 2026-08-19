// SPDX-License-Identifier: AGPL-3.0-or-later

import {compare} from '@fluxer/snowflake/src/SnowflakeUtils';
import type {Mock} from 'vitest';

/**
 * Minimal WireMessage-shaped fixtures for tests that exercise `SocialHomeFeedFallback.ts`'s real
 * `fetchFeedByChannel` — only `http` and the `Message` class are mocked there (see that test file
 * for why: `Message` construction needs `RuntimeConfig`, which is expensive to stand up in a test —
 * same reasoning as `SocialHomeCommandMocks.ts`). Deliberately not the full zod-schema-perfect wire
 * shape used elsewhere: `fetchFeedByChannel` only ever reads `id`, `channel_id`, `content`, and
 * `attachments[].content_type`.
 */
export interface WireMessageFixture {
	id: string;
	channel_id: string;
	content: string;
	author: {username: string};
	attachments: Array<{content_type?: string | null}>;
}

export function buildWireImageMessage(overrides: {
	id: string;
	channelId: string;
	content?: string;
	author?: {username: string};
}): WireMessageFixture {
	return {
		id: overrides.id,
		channel_id: overrides.channelId,
		content: overrides.content ?? 'meu desenho de hoje',
		author: overrides.author ?? {username: 'aluna_ana'},
		attachments: [{content_type: 'image/png'}],
	};
}

export function buildWireTextMessage(overrides: {
	id: string;
	channelId: string;
	content?: string;
	author?: {username: string};
}): WireMessageFixture {
	return {
		id: overrides.id,
		channel_id: overrides.channelId,
		content: overrides.content ?? 'alguem viu a tarefa de hoje?',
		author: overrides.author ?? {username: 'aluna_ana'},
		attachments: [],
	};
}

export function buildWireLinkMessage(overrides: {id: string; channelId: string; content?: string}): WireMessageFixture {
	return {
		id: overrides.id,
		channel_id: overrides.channelId,
		content: overrides.content ?? 'https://exemplo.com/referencia',
		author: {username: 'aluna_ana'},
		attachments: [],
	};
}

type ChannelHandler = (before: string | null) => ReadonlyArray<WireMessageFixture>;

/**
 * `mockChannelHistories`/`mockPaginatedChannelHistory` both need to configure the *same* `http.get`
 * mock for different channels within one test (e.g. one channel paginated, another just empty) —
 * plain back-to-back `getMock.mockImplementation(...)` calls would each replace the whole
 * implementation and silently drop the other channel's handler. Both register into this shared
 * per-mock registry instead; the dispatcher below is installed once and reads from it lazily.
 */
function getChannelHandlerRegistry(getMock: Mock): Map<string, ChannelHandler> {
	const mockWithRegistry = getMock as Mock & {__socialHomeChannelHandlers?: Map<string, ChannelHandler>};
	if (!mockWithRegistry.__socialHomeChannelHandlers) {
		const registry = new Map<string, ChannelHandler>();
		mockWithRegistry.__socialHomeChannelHandlers = registry;
		getMock.mockImplementation(async (path: string, options?: {query?: {before?: string | null}}) => {
			const match = /^\/channels\/([^/]+)\/messages$/.exec(path);
			const channelId = match?.[1];
			const handler = channelId ? registry.get(channelId) : undefined;
			if (!handler) {
				throw new Error(`no fixture channel history registered for GET ${path}`);
			}
			return {body: handler(options?.query?.before ?? null)};
		});
	}
	return mockWithRegistry.__socialHomeChannelHandlers;
}

/** Every call to `GET /channels/:id/messages` for a registered channel returns the same array. */
export function mockChannelHistories(
	getMock: Mock,
	historiesByChannelId: Readonly<Record<string, ReadonlyArray<WireMessageFixture>>>,
): void {
	const registry = getChannelHandlerRegistry(getMock);
	for (const [channelId, messages] of Object.entries(historiesByChannelId)) {
		registry.set(channelId, () => messages);
	}
}

/**
 * A single channel's full history (already sorted newest-first, same as the real endpoint), with
 * the mock honoring `before` the same way the real `CHANNEL_MESSAGES` endpoint does. Lets a test
 * drive two sequential `fetchFeedByChannel` calls through real pagination instead of hand-scripting
 * two unrelated responses. `pageSize` caps each page at a small size for the test's own purposes —
 * unrelated to CHANNEL_FETCH_LIMIT (the real endpoint's page size), which only matters for hasMore.
 */
export function mockPaginatedChannelHistory(
	getMock: Mock,
	channelId: string,
	fullHistoryNewestFirst: ReadonlyArray<WireMessageFixture>,
	options: {pageSize?: number} = {},
): void {
	const registry = getChannelHandlerRegistry(getMock);
	const pageSize = options.pageSize ?? fullHistoryNewestFirst.length;
	registry.set(channelId, (before) => {
		const remaining =
			before == null
				? fullHistoryNewestFirst
				: fullHistoryNewestFirst.filter((message) => compare(message.id, before) < 0);
		return remaining.slice(0, pageSize);
	});
}

/** Clears registered per-channel handlers — call from `afterEach` alongside `vi.clearAllMocks()`. */
export function resetChannelHistoryMocks(getMock: Mock): void {
	const mockWithRegistry = getMock as Mock & {__socialHomeChannelHandlers?: Map<string, ChannelHandler>};
	mockWithRegistry.__socialHomeChannelHandlers?.clear();
}
