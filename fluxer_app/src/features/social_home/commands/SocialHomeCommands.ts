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

/**
 * @returns false when the search backend answered "still indexing", so the caller can serve the
 * same posts from the channels instead. Nothing is written to the store in that case.
 */
async function fetchFeedViaSearch(
	i18n: I18n,
	guildId: string,
	channelIds: Array<string>,
	options: FetchFeedOptions,
): Promise<boolean> {
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
		return true;
	}
	if (isIndexing(result)) {
		return false;
	}
	SocialHome.setPosts(result.messages, {append: options.before != null});
	SocialHome.setHasMore(result.messages.length === FEED_HITS_PER_PAGE);
	return true;
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
		if (await fetchFeedViaSearch(i18n, guildId, channelIds, options)) {
			return;
		}
		// "Preparando a busca desta turma pela primeira vez": the index is still being built, which
		// happens right after a class posts into a brand-new channel. Reading the channels directly
		// answers the same question without the index, so the reader gets the Gallery now instead of
		// a message telling them to try again — reported on 31/08/2026 ("toda primeira postagem de
		// uma pasta do fórum aparece essa mensagem... daí tem que atualizar"). Search is deliberately
		// NOT marked unavailable: the next load should use it again, once the index catches up.
		// Only if reading the channels fails too does the "still indexing" message earn its place.
		try {
			await fetchFeedViaFallback(guildId, channelIds, options);
		} catch {
			if (!isStale(guildId)) SocialHome.setIndexing();
		}
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
