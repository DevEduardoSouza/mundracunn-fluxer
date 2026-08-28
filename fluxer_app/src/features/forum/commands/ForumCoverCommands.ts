// SPDX-License-Identifier: AGPL-3.0-or-later

import ForumCovers from '@app/features/forum/state/ForumCovers';
import {getForumPostChannels} from '@app/features/forum/utils/ForumChannelDiscovery';
import {fetchCoversByChannel} from '@app/features/forum/utils/ForumCoverFallback';
import {firstMessagePerChannel} from '@app/features/forum/utils/ForumCoverGrouping';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import {isIndexing, searchMessages} from '@app/features/search/utils/SearchUtils';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import type {I18n} from '@lingui/core';

/**
 * With Meilisearch up, one `has:image` search across every forum channel id fills the whole cover
 * grid in one request; `hitsPerPage` is generous so a class with a few hundred channels resolves in
 * one or two pages. Without it, {@link ensureCoverLazy} fetches covers one channel at a time as
 * cards scroll into view.
 */
// The search API caps hits_per_page at 25 (MessageRequestSchemas) — anything above is a 400.
const COVER_HITS_PER_PAGE = 25;
const MAX_COVER_PAGES = 20;

function isSearchUnavailableError(error: unknown): boolean {
	return failureCode(error) === APIErrorCodes.FEATURE_TEMPORARILY_DISABLED;
}

function isStale(guildId: string): boolean {
	return ForumCovers.getGuildId() !== guildId;
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

async function fetchCoversViaSearch(i18n: I18n, guildId: string, channelIds: ReadonlyArray<string>): Promise<void> {
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
		if (isStale(guildId)) return;
		if (isIndexing(result)) {
			ForumCovers.setIndexing();
			return;
		}
		applyFound(missing, firstMessagePerChannel(result.messages));
		if (result.messages.length < COVER_HITS_PER_PAGE) break;
		maxId = result.messages[result.messages.length - 1]!.id;
	}
}

/**
 * Prefetch covers for every forum post channel of a guild. Call once when the forum page mounts;
 * the post list renders immediately without waiting on this.
 */
export async function fetchCovers(i18n: I18n, guildId: string): Promise<void> {
	if (ForumCovers.getGuildId() !== guildId) {
		ForumCovers.reset();
		ForumCovers.setGuildId(guildId);
	}
	const channelIds = getForumPostChannels(guildId).map((channel) => channel.id);
	if (channelIds.length === 0) return;
	if (ForumCovers.isSearchUnavailable()) {
		// No batched fetch without search — ensureCoverLazy fills covers as cards become visible.
		return;
	}
	ForumCovers.setLoading(true);
	try {
		await fetchCoversViaSearch(i18n, guildId, channelIds);
	} catch (error) {
		// Search down (FEATURE_TEMPORARILY_DISABLED) or any other failure: don't leave the grid
		// without covers — switch to the per-channel lazy fallback for this guild.
		if (!isSearchUnavailableError(error)) {
			console.warn('[forum] cover search failed, falling back to per-channel fetch', error);
		}
		ForumCovers.markSearchUnavailable();
	} finally {
		ForumCovers.setLoading(false);
	}
}

/**
 * Fetch one channel's cover if the search-backed prefetch can't (search unavailable) and it hasn't
 * been tried yet. Driven by an IntersectionObserver on each card.
 */
export async function ensureCoverLazy(guildId: string, channelId: string): Promise<void> {
	if (!ForumCovers.isSearchUnavailable()) return;
	if (isStale(guildId)) return;
	if (ForumCovers.hasCover(channelId) || ForumCovers.wasRequested(channelId)) return;
	ForumCovers.markRequested([channelId]);
	const found = await fetchCoversByChannel([channelId]);
	if (isStale(guildId)) return;
	ForumCovers.setCovers([...found]);
}
