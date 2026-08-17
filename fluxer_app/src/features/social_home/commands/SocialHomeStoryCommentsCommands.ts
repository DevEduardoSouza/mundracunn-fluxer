// SPDX-License-Identifier: AGPL-3.0-or-later

import * as MessageCommands from '@app/features/messaging/commands/MessageCommands';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import Messages from '@app/features/messaging/state/MessagingMessages';
import SocialHomeStoryComments from '@app/features/social_home/state/SocialHomeStoryComments';
import {compare} from '@fluxer/snowflake/src/SnowflakeUtils';

const COMMENTS_PAGE_SIZE = 50;

function isWithinStoryWindow(messageId: string, storyId: string, upperBoundStoryId: string | null): boolean {
	if (compare(messageId, storyId) <= 0) return false;
	if (upperBoundStoryId != null && compare(messageId, upperBoundStoryId) >= 0) return false;
	return true;
}

/**
 * The story root itself only ever comes from the Stories bar's own fetch (search/fallback), never
 * from the channel's normal message pipeline, so `MessageReply.startReply` — which looks the
 * message up in the real message store — can't find it to let someone reply directly to the story.
 * Preloading it (same primitive UserCommands.preloadDMMessages uses to seed a jump target) fixes
 * that without pulling in the rest of the channel's history.
 */
function preloadStoryRoot(story: Message): void {
	Messages.handleMessagePreload({messages: {[story.channelId]: story.toJSON()}});
}

export function openStoryComments(story: Message, upperBoundStoryId: string | null): void {
	preloadStoryRoot(story);
	SocialHomeStoryComments.open(story.id, story.channelId, upperBoundStoryId);
	void loadMoreComments();
}

export function closeStoryComments(): void {
	SocialHomeStoryComments.close();
}

export async function loadMoreComments(): Promise<void> {
	const storyId = SocialHomeStoryComments.getStoryId();
	const channelId = SocialHomeStoryComments.getChannelId();
	const cursorId = SocialHomeStoryComments.getCursorId();
	const upperBoundStoryId = SocialHomeStoryComments.getUpperBoundStoryId();
	if (
		!storyId ||
		!channelId ||
		cursorId == null ||
		SocialHomeStoryComments.getIsLoadingInitial() ||
		SocialHomeStoryComments.getIsLoadingMore() ||
		!SocialHomeStoryComments.getHasMore()
	) {
		return;
	}
	const isFirstPage = cursorId === storyId;
	if (isFirstPage) {
		SocialHomeStoryComments.setLoadingInitial(true);
	} else {
		SocialHomeStoryComments.setLoadingMore(true);
	}
	try {
		await MessageCommands.fetchMessages(channelId, null, cursorId, COMMENTS_PAGE_SIZE, undefined, {
			throwOnError: true,
		});
	} catch (error) {
		if (!SocialHomeStoryComments.isActive(storyId, channelId)) {
			return;
		}
		SocialHomeStoryComments.setError(error instanceof Error ? error.message : String(error));
		return;
	}
	if (!SocialHomeStoryComments.isActive(storyId, channelId)) {
		return;
	}
	// Read the real store rather than trusting fetchMessages's resolved array: a cache hit (e.g.
	// reopening a story already loaded this session) resolves with `[]` even though the messages
	// are sitting in the store — see MessageCommands.applyMessageFetchCacheHit.
	const channelMessages = Messages.getMessages(channelId);
	const loadedMessages = channelMessages.toArray();
	const newestInWindowId = loadedMessages.reduce<string | null>((max, message) => {
		if (!isWithinStoryWindow(message.id, storyId, upperBoundStoryId)) return max;
		return max == null || compare(message.id, max) > 0 ? message.id : max;
	}, null);
	const reachedUpperBound =
		upperBoundStoryId != null && loadedMessages.some((message) => compare(message.id, upperBoundStoryId) >= 0);
	const exhausted = !channelMessages.hasMoreAfter || reachedUpperBound;
	SocialHomeStoryComments.advanceCursor(newestInWindowId ?? cursorId, !exhausted);
}
