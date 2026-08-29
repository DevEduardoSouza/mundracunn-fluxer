// SPDX-License-Identifier: AGPL-3.0-or-later

import ForumCovers from '@app/features/forum/state/ForumCovers';
import {getForumPostChannels} from '@app/features/forum/utils/ForumChannelDiscovery';
import {fetchCoversByChannel} from '@app/features/forum/utils/ForumCoverFallback';
import {firstMessagePerChannel} from '@app/features/forum/utils/ForumCoverGrouping';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import {isIndexing, searchMessages} from '@app/features/search/utils/SearchUtils';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {compare as compareSnowflakes} from '@fluxer/snowflake/src/SnowflakeUtils';
import type {I18n} from '@lingui/core';
import {comparer, reaction} from 'mobx';

/**
 * With Meilisearch up, one `has:image` search across every forum channel id fills the whole cover
 * grid in one request; `hitsPerPage` is generous so a class with a few hundred channels resolves in
 * one or two pages. Without it, {@link ensureCoverLazy} fetches covers one channel at a time as
 * cards scroll into view.
 *
 * A channel that was never indexed (every new post is a new channel — `indexed_at = null`) makes
 * the API answer `{indexing: true}` for the WHOLE request and enqueue the indexing, which takes a
 * few seconds. Until this fix, that emptied the grid on every new post. Now an `indexing` answer
 * (a) fills the missing covers right away through the per-channel REST fallback, in small batches,
 * and (b) retries the search with a short backoff to leave the indexing state.
 */
// The search API caps hits_per_page at 25 (MessageRequestSchemas) — anything above is a 400.
const COVER_HITS_PER_PAGE = 25;
const MAX_COVER_PAGES = 20;
/** Backoff between search retries after an `indexing` answer; the length is the attempt cap. */
export const INDEXING_RETRY_DELAYS_MS: ReadonlyArray<number> = [3_000, 8_000, 20_000];
/** Per-channel fallback requests in flight at once — a big class can have 100+ post channels. */
export const FALLBACK_BATCH_SIZE = 6;

interface PendingWork {
	guildId: string;
	retryTimer: ReturnType<typeof setTimeout> | null;
	disposeWatcher: (() => void) | null;
}

let pending: PendingWork | null = null;

function isSearchUnavailableError(error: unknown): boolean {
	return failureCode(error) === APIErrorCodes.FEATURE_TEMPORARILY_DISABLED;
}

function isStale(guildId: string): boolean {
	return ForumCovers.getGuildId() !== guildId;
}

function messageHasImage(message: Message): boolean {
	return message.attachments.some((attachment) => (attachment.content_type ?? '').startsWith('image/'));
}

function applyFound(missing: Set<string>, found: Map<string, Message>): void {
	const entries: Array<readonly [string, Message]> = [];
	for (const [channelId, message] of found) {
		if (missing.has(channelId)) {
			entries.push([channelId, message]);
			missing.delete(channelId);
		}
	}
	ForumCovers.setCovers(entries);
}

/** Clears the retry timer and the new-message watcher. Call on unmount and before starting over. */
export function cancelCoverWork(): void {
	if (!pending) return;
	if (pending.retryTimer != null) clearTimeout(pending.retryTimer);
	pending.disposeWatcher?.();
	pending = null;
}

/**
 * Runs the batched search for the given channels. Returns the channels the search could not
 * resolve, and whether the API is still indexing (in which case nothing was resolved).
 */
async function fetchCoversViaSearch(
	i18n: I18n,
	guildId: string,
	channelIds: ReadonlyArray<string>,
): Promise<{indexing: boolean; missing: Set<string>}> {
	const missing = new Set(channelIds);
	let maxId: string | undefined;
	for (let page = 0; page < MAX_COVER_PAGES && missing.size > 0; page++) {
		const result = await searchMessages(
			i18n,
			{contextGuildId: guildId},
			{
				channelId: [...missing],
				has: ['image'],
				sortBy: 'timestamp',
				sortOrder: 'desc',
				hitsPerPage: COVER_HITS_PER_PAGE,
				maxId,
			},
		);
		if (isStale(guildId)) return {indexing: false, missing};
		if (isIndexing(result)) {
			return {indexing: true, missing};
		}
		applyFound(missing, firstMessagePerChannel(result.messages));
		if (result.messages.length < COVER_HITS_PER_PAGE) break;
		maxId = result.messages[result.messages.length - 1]!.id;
	}
	return {indexing: false, missing};
}

/** Per-channel REST fallback for channels still without a cover, `FALLBACK_BATCH_SIZE` at a time. */
async function fillMissingViaFallback(guildId: string, channelIds: ReadonlyArray<string>): Promise<void> {
	const todo = channelIds.filter((id) => !ForumCovers.hasCover(id) && !ForumCovers.wasRequested(id));
	for (let i = 0; i < todo.length; i += FALLBACK_BATCH_SIZE) {
		if (isStale(guildId)) return;
		const batch = todo.slice(i, i + FALLBACK_BATCH_SIZE);
		ForumCovers.markRequested(batch);
		try {
			const found = await fetchCoversByChannel(batch);
			if (isStale(guildId)) return;
			ForumCovers.setCovers([...found]);
		} catch (error) {
			console.warn('[forum] per-channel cover fetch failed', error);
		}
	}
}

function scheduleIndexingRetry(i18n: I18n, guildId: string, attempt: number): void {
	const delay = INDEXING_RETRY_DELAYS_MS[attempt];
	if (delay == null || !pending || pending.guildId !== guildId) {
		return;
	}
	pending.retryTimer = setTimeout(() => {
		if (pending) pending.retryTimer = null;
		if (isStale(guildId)) return;
		void runSearch(i18n, guildId, attempt + 1);
	}, delay);
}

/**
 * One search pass over every forum channel of the guild, with the `indexing` handling described
 * at the top of the file. `attempt` counts search retries after `indexing` answers.
 */
async function runSearch(i18n: I18n, guildId: string, attempt: number): Promise<void> {
	const channelIds = getForumPostChannels(guildId).map((channel) => channel.id);
	if (channelIds.length === 0) return;
	ForumCovers.setLoading(true);
	let indexing = false;
	let missing: Set<string> = new Set();
	try {
		({indexing, missing} = await fetchCoversViaSearch(i18n, guildId, channelIds));
	} catch (error) {
		// Search down (FEATURE_TEMPORARILY_DISABLED) or any other failure: don't leave the grid
		// without covers — switch to the per-channel lazy fallback for this guild.
		if (!isSearchUnavailableError(error)) {
			console.warn('[forum] cover search failed, falling back to per-channel fetch', error);
		}
		ForumCovers.markSearchUnavailable();
		ForumCovers.setLoading(false);
		return;
	}
	if (isStale(guildId)) return;
	if (!indexing) {
		// Channels the search resolved don't need the per-channel fallback ever again.
		ForumCovers.markRequested(channelIds);
		ForumCovers.setIndexing(false);
		ForumCovers.setLoading(false);
		return;
	}
	const willRetry = attempt < INDEXING_RETRY_DELAYS_MS.length;
	ForumCovers.setIndexing(willRetry);
	if (willRetry) {
		scheduleIndexingRetry(i18n, guildId, attempt);
	}
	// Fill the gaps now; the retry (if any) completes whatever the fallback didn't find.
	await fillMissingViaFallback(guildId, [...missing]);
}

/**
 * Keeps covers fresh after the initial fetch: when a forum channel's `lastMessageId` moves (the
 * `Channels` store bumps it on MESSAGE_CREATE) and the new message is a newer image, it becomes the
 * cover. The message is taken from the messages cache when the gateway already delivered it;
 * otherwise one small per-channel history request resolves it. No gateway subscription needed.
 */
function watchNewMessages(guildId: string): () => void {
	return reaction(
		() => getForumPostChannels(guildId).map((channel) => [channel.id, channel.lastMessageId] as const),
		(current, previous) => {
			if (isStale(guildId)) return;
			const before = new Map(previous ?? []);
			const toFetch: Array<string> = [];
			const fromCache: Array<readonly [string, Message]> = [];
			for (const [channelId, lastMessageId] of current) {
				if (!lastMessageId || before.get(channelId) === lastMessageId) continue;
				const cover = ForumCovers.getCover(channelId);
				if (cover && compareSnowflakes(lastMessageId, cover.id) <= 0) continue;
				const cached = Messages.getCachedMessages(channelId)?.get(lastMessageId);
				if (cached) {
					if (messageHasImage(cached)) fromCache.push([channelId, cached]);
					continue;
				}
				toFetch.push(channelId);
			}
			if (fromCache.length > 0) ForumCovers.setCovers(fromCache);
			if (toFetch.length > 0) void refreshCovers(guildId, toFetch);
		},
		{equals: comparer.structural},
	);
}

async function refreshCovers(guildId: string, channelIds: ReadonlyArray<string>): Promise<void> {
	for (let i = 0; i < channelIds.length; i += FALLBACK_BATCH_SIZE) {
		const batch = channelIds.slice(i, i + FALLBACK_BATCH_SIZE);
		try {
			const found = await fetchCoversByChannel(batch);
			if (isStale(guildId)) return;
			const newer = [...found].filter(([channelId, message]) => {
				const cover = ForumCovers.getCover(channelId);
				return !cover || compareSnowflakes(message.id, cover.id) > 0;
			});
			ForumCovers.setCovers(newer);
		} catch (error) {
			console.warn('[forum] cover refresh failed', error);
		}
	}
}

/**
 * Prefetch covers for every forum post channel of a guild. Call once when the forum page mounts;
 * the post list renders immediately without waiting on this.
 */
export async function fetchCovers(i18n: I18n, guildId: string): Promise<void> {
	cancelCoverWork();
	if (ForumCovers.getGuildId() !== guildId) {
		ForumCovers.reset();
		ForumCovers.setGuildId(guildId);
	}
	pending = {guildId, retryTimer: null, disposeWatcher: watchNewMessages(guildId)};
	if (ForumCovers.isSearchUnavailable()) {
		// No batched fetch without search — ensureCoverLazy fills covers as cards become visible.
		return;
	}
	await runSearch(i18n, guildId, 0);
}

/**
 * Fetch one channel's cover if the search-backed prefetch can't (search unavailable, or still
 * indexing) and it hasn't been tried yet. Driven by an IntersectionObserver on each card.
 */
export async function ensureCoverLazy(guildId: string, channelId: string): Promise<void> {
	if (!ForumCovers.isSearchUnavailable() && !ForumCovers.getIsIndexing()) return;
	if (isStale(guildId)) return;
	if (ForumCovers.hasCover(channelId) || ForumCovers.wasRequested(channelId)) return;
	ForumCovers.markRequested([channelId]);
	const found = await fetchCoversByChannel([channelId]);
	if (isStale(guildId)) return;
	ForumCovers.setCovers([...found]);
}
