// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import {isIndexing, searchMessages} from '@app/features/search/utils/SearchUtils';
import SocialHomeStories from '@app/features/social_home/state/SocialHomeStories';
import {getStoriesChannel} from '@app/features/social_home/utils/SocialHomeChannelDiscovery';
import {fetchStoriesByChannel} from '@app/features/social_home/utils/SocialHomeStoriesFallback';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {fromTimestamp, sortBySnowflakeDesc} from '@fluxer/snowflake/src/SnowflakeUtils';
import type {I18n} from '@lingui/core';
import {reaction} from 'mobx';

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;
/**
 * The Stories bar has no "load more" of its own — whatever comes back here is the whole 24h
 * window — so more than 25 stories in a day silently truncates to the most recent 25 (search's
 * `sortOrder: 'desc'`). Fine for the expected posting volume (only professor/staff post stories),
 * but worth knowing if that assumption ever changes. Applied per media type and again after the
 * merge below, so the bar never renders more than this many circles.
 */
const STORY_HITS_PER_PAGE = 25;

/**
 * Queried one at a time, never as a single `has: ['image', 'video']`. The search API turns every
 * entry of `has` into its own filter clause and joins them with AND (fluxer_api's
 * `compactMeiliFilters`), so asking for both in one request matches only a message carrying an
 * image *and* a video — in practice, nothing. Merging one request per type gives the OR the bar
 * actually wants, and matches what the fallback path already does (SocialHomeStoriesFallback.ts).
 */
const STORY_MEDIA_TYPES = ['image', 'video'] as const;

function isSearchUnavailableError(error: unknown): boolean {
	return failureCode(error) === APIErrorCodes.FEATURE_TEMPORARILY_DISABLED;
}

/**
 * A request issued for a guild the store no longer points at (the user switched classes while it
 * was in flight) must not land — its stories belong to another class.
 */
function isStale(guildId: string): boolean {
	return SocialHomeStories.getGuildId() !== guildId;
}

function applyError(guildId: string, error: unknown): void {
	if (isStale(guildId)) {
		return;
	}
	SocialHomeStories.setError(error instanceof Error ? error.message : String(error));
}

/**
 * Deliberately without `minId`, even though a 24h window is exactly what it is for.
 *
 * The search backend indexes a message's `id` as a string (it is the Meilisearch document's primary
 * key), while `min_id`/`max_id` are turned into a *numeric* range filter over that same field —
 * `meiliRangeFilter('id', {gt: minId})` in fluxer_api's MeilisearchDomainAdapters. Meilisearch does
 * not compare a string field numerically, so the clause matches nothing and every windowed search
 * comes back empty. Verified against production on 31/08/2026: the identical query returns the
 * story with `min_id` dropped and zero results with it present.
 *
 * That is an upstream bug, not something this fork introduced, and it is why the Stories bar looked
 * "broken" from the moment the self-host gained a search backend (before that the fallback path
 * below did the work and the window was honoured by the channel API instead). Filtering here would
 * be the wrong place to fix it anyway — the window is a *display* rule, and
 * SocialHomeStories.getVisibleStories already re-applies it every minute against the clock, so
 * dropping the server-side filter changes nothing a reader can see. `sortOrder: 'desc'` still means
 * the newest stories are the ones that survive the hit cap.
 *
 * The real fix belongs in the API (range over the numeric `createdAt` the index already carries) and
 * is a candidate for an upstream PR — note the same clause backs `max_id` pagination elsewhere.
 */
async function fetchStoriesViaSearch(i18n: I18n, guildId: string, channelId: string): Promise<void> {
	const results = await Promise.all(
		STORY_MEDIA_TYPES.map((mediaType) =>
			searchMessages(
				i18n,
				{contextGuildId: guildId},
				{
					channelId: [channelId],
					has: [mediaType],
					sortBy: 'timestamp',
					sortOrder: 'desc',
					hitsPerPage: STORY_HITS_PER_PAGE,
				},
			),
		),
	);
	if (isStale(guildId)) {
		return;
	}
	if (results.some(isIndexing)) {
		SocialHomeStories.setIndexing();
		return;
	}
	const byId = new Map<string, Message>();
	for (const result of results) {
		if (isIndexing(result)) {
			continue;
		}
		for (const message of result.messages) {
			byId.set(message.id, message);
		}
	}
	SocialHomeStories.setStories(sortBySnowflakeDesc([...byId.values()]).slice(0, STORY_HITS_PER_PAGE));
}

async function fetchStoriesViaFallback(guildId: string, channelId: string, minId: string): Promise<void> {
	const messages = await fetchStoriesByChannel(channelId, minId);
	if (isStale(guildId)) {
		return;
	}
	SocialHomeStories.setStories(messages);
}

function isStoryMessage(message: Message): boolean {
	return message.attachments.some((attachment) => {
		const contentType = attachment.content_type ?? '';
		return contentType.startsWith('image/') || contentType.startsWith('video/');
	});
}

/**
 * Keeps the bar current after the initial fetch. Without this the bar only ever loaded on mount, so
 * publishing a story and coming straight back to the Gallery showed nothing until the reader
 * navigated away and returned — which is what the class owner hit on 30/08/2026 ("o stories parece
 * ter parado de funcionar", right after posting three videos).
 *
 * Watches the Stories channel's `lastMessageId` (the `Channels` store bumps it on MESSAGE_CREATE),
 * the same no-subscription technique ForumCoverCommands.watchNewMessages uses for covers. The new
 * message is taken from the message cache when the gateway already delivered it; otherwise one
 * per-channel history request resolves it. Deliberately *not* the search path: Meilisearch indexes
 * a message asynchronously, so a story is routinely not searchable yet at the moment it is posted.
 *
 * A comment also bumps `lastMessageId`; it simply carries no media and is dropped by
 * {@link isStoryMessage}.
 */
export function watchNewStories(guildId: string): () => void {
	return reaction(
		() => getStoriesChannel(guildId)?.lastMessageId ?? null,
		(lastMessageId) => {
			if (lastMessageId == null || isStale(guildId)) return;
			if (SocialHomeStories.hasStory(lastMessageId)) return;
			const channelId = getStoriesChannel(guildId)?.id;
			if (channelId == null) return;
			const cached = Messages.getCachedMessages(channelId)?.get(lastMessageId);
			if (cached) {
				if (isStoryMessage(cached)) SocialHomeStories.addStories([cached]);
				return;
			}
			void mergeStoriesFromChannel(guildId, channelId);
		},
	);
}

async function mergeStoriesFromChannel(guildId: string, channelId: string): Promise<void> {
	try {
		const messages = await fetchStoriesByChannel(channelId, fromTimestamp(Date.now() - STORY_WINDOW_MS));
		if (isStale(guildId)) return;
		SocialHomeStories.addStories(messages);
	} catch {
		// A refresh that fails leaves the bar exactly as it was; the next post tries again.
	}
}

export async function fetchStories(i18n: I18n, guildId: string): Promise<void> {
	if (SocialHomeStories.getGuildId() !== guildId) {
		SocialHomeStories.reset();
		SocialHomeStories.setGuildId(guildId);
	}
	const storiesChannel = getStoriesChannel(guildId);
	if (!storiesChannel) {
		SocialHomeStories.setStories([]);
		return;
	}
	const minId = fromTimestamp(Date.now() - STORY_WINDOW_MS);
	SocialHomeStories.setLoading(true);
	if (SocialHomeStories.isSearchUnavailable()) {
		try {
			await fetchStoriesViaFallback(guildId, storiesChannel.id, minId);
		} catch (error) {
			applyError(guildId, error);
		}
		return;
	}
	try {
		await fetchStoriesViaSearch(i18n, guildId, storiesChannel.id);
	} catch (error) {
		if (!isSearchUnavailableError(error)) {
			applyError(guildId, error);
			return;
		}
		SocialHomeStories.markSearchUnavailable();
		try {
			await fetchStoriesViaFallback(guildId, storiesChannel.id, minId);
		} catch (fallbackError) {
			applyError(guildId, fallbackError);
		}
	}
}
