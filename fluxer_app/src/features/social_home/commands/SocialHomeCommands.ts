// SPDX-License-Identifier: AGPL-3.0-or-later

import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import {isIndexing, searchMessages} from '@app/features/search/utils/SearchUtils';
import SocialHome from '@app/features/social_home/state/SocialHome';
import {discoverFeedChannelIds} from '@app/features/social_home/utils/SocialHomeChannelDiscovery';
import {fetchFeedByChannel} from '@app/features/social_home/utils/SocialHomeFeedFallback';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import type {I18n} from '@lingui/core';

const FEED_HITS_PER_PAGE = 25;

interface FetchFeedOptions {
	before?: string;
}

/**
 * Sticky for the session: once the search backend is confirmed unavailable (self-host without
 * Meilisearch/Elasticsearch — CLAUDE.md section 6.1), skip straight to the per-channel fallback
 * instead of re-probing the search endpoint on every page load.
 */
let searchUnavailable = false;

function isSearchUnavailableError(error: unknown): boolean {
	return failureCode(error) === APIErrorCodes.FEATURE_TEMPORARILY_DISABLED;
}

async function fetchFeedViaSearch(
	i18n: I18n,
	guildId: string,
	channelIds: Array<string>,
	options: FetchFeedOptions,
): Promise<void> {
	const result = await searchMessages(
		i18n,
		{contextGuildId: guildId},
		{
			channelId: channelIds,
			has: ['image'],
			sortBy: 'timestamp',
			sortOrder: 'desc',
			hitsPerPage: FEED_HITS_PER_PAGE,
			maxId: options.before,
		},
	);
	if (isIndexing(result)) {
		SocialHome.setIndexing();
		return;
	}
	SocialHome.setPosts(result.messages, {append: options.before != null});
}

async function fetchFeedViaFallback(channelIds: Array<string>, options: FetchFeedOptions): Promise<void> {
	const result = await fetchFeedByChannel(channelIds, options.before);
	SocialHome.setPosts(result.messages, {append: options.before != null});
	SocialHome.setHasMore(result.hasMore);
}

export async function fetchFeed(i18n: I18n, guildId: string, options: FetchFeedOptions = {}): Promise<void> {
	const channelIds = discoverFeedChannelIds(guildId);
	if (channelIds.length === 0) {
		SocialHome.setPosts([], {append: false});
		return;
	}
	SocialHome.setLoading(true);
	if (searchUnavailable) {
		try {
			await fetchFeedViaFallback(channelIds, options);
		} catch (error) {
			SocialHome.setError(error instanceof Error ? error.message : String(error));
		}
		return;
	}
	try {
		await fetchFeedViaSearch(i18n, guildId, channelIds, options);
	} catch (error) {
		if (!isSearchUnavailableError(error)) {
			SocialHome.setError(error instanceof Error ? error.message : String(error));
			return;
		}
		searchUnavailable = true;
		try {
			await fetchFeedViaFallback(channelIds, options);
		} catch (fallbackError) {
			SocialHome.setError(fallbackError instanceof Error ? fallbackError.message : String(fallbackError));
		}
	}
}

export function fetchNextFeedPage(i18n: I18n, guildId: string): Promise<void> {
	const oldestPostId = SocialHome.getOldestPostId();
	if (oldestPostId == null || !SocialHome.getHasMore() || SocialHome.getIsLoading()) {
		return Promise.resolve();
	}
	return fetchFeed(i18n, guildId, {before: oldestPostId});
}
