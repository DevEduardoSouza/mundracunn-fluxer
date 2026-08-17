// SPDX-License-Identifier: AGPL-3.0-or-later

import {failureCode} from '@app/features/platform/utils/ResponseInspection';
import {isIndexing, searchMessages} from '@app/features/search/utils/SearchUtils';
import SocialHomeStories from '@app/features/social_home/state/SocialHomeStories';
import {getStoriesChannel} from '@app/features/social_home/utils/SocialHomeChannelDiscovery';
import {fetchStoriesByChannel} from '@app/features/social_home/utils/SocialHomeStoriesFallback';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {fromTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';
import type {I18n} from '@lingui/core';

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const STORY_HITS_PER_PAGE = 25;

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

async function fetchStoriesViaSearch(i18n: I18n, guildId: string, channelId: string, minId: string): Promise<void> {
	const result = await searchMessages(
		i18n,
		{contextGuildId: guildId},
		{
			channelId: [channelId],
			has: ['image', 'video'],
			sortBy: 'timestamp',
			sortOrder: 'desc',
			hitsPerPage: STORY_HITS_PER_PAGE,
			minId,
		},
	);
	if (isStale(guildId)) {
		return;
	}
	if (isIndexing(result)) {
		SocialHomeStories.setIndexing();
		return;
	}
	SocialHomeStories.setStories(result.messages);
}

async function fetchStoriesViaFallback(guildId: string, channelId: string, minId: string): Promise<void> {
	const messages = await fetchStoriesByChannel(channelId, minId);
	if (isStale(guildId)) {
		return;
	}
	SocialHomeStories.setStories(messages);
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
		await fetchStoriesViaSearch(i18n, guildId, storiesChannel.id, minId);
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
