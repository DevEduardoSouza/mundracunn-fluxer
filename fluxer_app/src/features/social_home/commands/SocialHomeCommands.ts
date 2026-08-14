// SPDX-License-Identifier: AGPL-3.0-or-later

import {isIndexing, searchMessages} from '@app/features/search/utils/SearchUtils';
import SocialHome from '@app/features/social_home/state/SocialHome';
import {discoverFeedChannelIds} from '@app/features/social_home/utils/SocialHomeChannelDiscovery';
import type {I18n} from '@lingui/core';

const FEED_HITS_PER_PAGE = 25;

interface FetchFeedOptions {
	before?: string;
}

export async function fetchFeed(i18n: I18n, guildId: string, options: FetchFeedOptions = {}): Promise<void> {
	const channelIds = discoverFeedChannelIds(guildId);
	if (channelIds.length === 0) {
		SocialHome.setPosts([], {append: false});
		return;
	}
	SocialHome.setLoading(true);
	try {
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
	} catch (error) {
		SocialHome.setError(error instanceof Error ? error.message : String(error));
	}
}

export function fetchNextFeedPage(i18n: I18n, guildId: string): Promise<void> {
	const oldestPostId = SocialHome.getOldestPostId();
	if (oldestPostId == null || !SocialHome.getHasMore() || SocialHome.getIsLoading()) {
		return Promise.resolve();
	}
	return fetchFeed(i18n, guildId, {before: oldestPostId});
}
