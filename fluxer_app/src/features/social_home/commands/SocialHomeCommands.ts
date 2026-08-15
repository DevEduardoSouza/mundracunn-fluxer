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

function isSearchUnavailableError(error: unknown): boolean {
	return failureCode(error) === APIErrorCodes.FEATURE_TEMPORARILY_DISABLED;
}

/**
 * A request issued for a guild the store no longer points at (the user switched classes while it
 * was in flight) must not land — its posts belong to another class.
 */
function isStale(guildId: string): boolean {
	return SocialHome.getGuildId() !== guildId;
}

function applyError(guildId: string, error: unknown): void {
	if (isStale(guildId)) {
		return;
	}
	SocialHome.setError(error instanceof Error ? error.message : String(error));
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
	if (isStale(guildId)) {
		return;
	}
	if (isIndexing(result)) {
		SocialHome.setIndexing();
		return;
	}
	SocialHome.setPosts(result.messages, {append: options.before != null});
	SocialHome.setHasMore(result.messages.length === FEED_HITS_PER_PAGE);
}

async function fetchFeedViaFallback(
	guildId: string,
	channelIds: Array<string>,
	options: FetchFeedOptions,
): Promise<void> {
	const result = await fetchFeedByChannel(channelIds, options.before);
	if (isStale(guildId)) {
		return;
	}
	SocialHome.setPosts(result.messages, {append: options.before != null});
	SocialHome.setHasMore(result.hasMore);
}

export async function fetchFeed(i18n: I18n, guildId: string, options: FetchFeedOptions = {}): Promise<void> {
	if (SocialHome.getGuildId() !== guildId) {
		SocialHome.reset();
		SocialHome.setGuildId(guildId);
	}
	const channelIds = discoverFeedChannelIds(guildId);
	if (channelIds.length === 0) {
		SocialHome.setPosts([], {append: false});
		SocialHome.setHasMore(false);
		return;
	}
	SocialHome.setLoading(true);
	if (SocialHome.isSearchUnavailable()) {
		try {
			await fetchFeedViaFallback(guildId, channelIds, options);
		} catch (error) {
			applyError(guildId, error);
		}
		return;
	}
	try {
		await fetchFeedViaSearch(i18n, guildId, channelIds, options);
	} catch (error) {
		if (!isSearchUnavailableError(error)) {
			applyError(guildId, error);
			return;
		}
		SocialHome.markSearchUnavailable();
		try {
			await fetchFeedViaFallback(guildId, channelIds, options);
		} catch (fallbackError) {
			applyError(guildId, fallbackError);
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
