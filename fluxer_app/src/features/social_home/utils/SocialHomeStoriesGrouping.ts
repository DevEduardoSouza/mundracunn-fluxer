// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import type {User} from '@app/features/user/models/User';
import {compare} from '@fluxer/snowflake/src/SnowflakeUtils';

export interface StoryGroup {
	author: User;
	stories: Array<Message>;
	latestStoryId: string;
	isSeen: boolean;
}

/**
 * One circle per author, stories ordered oldest-to-newest within the group so opening it plays
 * back like Instagram stories. Groups are ordered unseen-first (most recently posted unseen group
 * first), then seen groups by recency — matching the client's mockup, where unseen stories stand
 * out from already-viewed ones.
 */
export function groupStoriesByAuthor(
	stories: ReadonlyArray<Message>,
	isAuthorSeen: (authorId: string, latestStoryId: string) => boolean,
): Array<StoryGroup> {
	const byAuthor = new Map<string, Array<Message>>();
	for (const story of stories) {
		const existing = byAuthor.get(story.author.id);
		if (existing) {
			existing.push(story);
		} else {
			byAuthor.set(story.author.id, [story]);
		}
	}
	const groups: Array<StoryGroup> = [];
	for (const [authorId, authorStories] of byAuthor) {
		const sortedAsc = [...authorStories].sort((a, b) => compare(a.id, b.id));
		const latestStory = sortedAsc[sortedAsc.length - 1]!;
		groups.push({
			author: latestStory.author,
			stories: sortedAsc,
			latestStoryId: latestStory.id,
			isSeen: isAuthorSeen(authorId, latestStory.id),
		});
	}
	groups.sort((a, b) => {
		if (a.isSeen !== b.isSeen) return a.isSeen ? 1 : -1;
		return compare(b.latestStoryId, a.latestStoryId);
	});
	return groups;
}
