// SPDX-License-Identifier: AGPL-3.0-or-later

import Channels from '@app/features/channel/state/Channels';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {attachmentsToViewerItems} from '@app/features/messaging/utils/MediaViewerItemUtils';
import {openStoryComments} from '@app/features/social_home/commands/SocialHomeStoryCommentsCommands';
import SocialHomeStories from '@app/features/social_home/state/SocialHomeStories';
import type {StoryGroup} from '@app/features/social_home/utils/SocialHomeStoriesGrouping';
import {getNextStoryId} from '@app/features/social_home/utils/SocialHomeStoryChronology';
import * as MediaViewerCommands from '@app/features/ui/commands/MediaViewerCommands';
import type {MediaViewerItem} from '@app/features/ui/state/MediaViewer';

function isStoryAttachment(contentType: string | undefined): boolean {
	const type = contentType ?? '';
	return type.startsWith('image/') || type.startsWith('video/');
}

interface FlattenedGroup {
	items: Array<MediaViewerItem>;
	firstMessage: Message;
}

/**
 * A story message could in principle carry a non-media attachment alongside the media one, so
 * those are filtered out here rather than trusted to be image/video like the fetch layer assumes.
 */
function flattenGroup(group: StoryGroup): FlattenedGroup | null {
	const firstMessage = group.stories[0];
	if (!firstMessage) return null;
	const items = group.stories.flatMap((story) =>
		attachmentsToViewerItems(story.attachments.filter((attachment) => isStoryAttachment(attachment.content_type))),
	);
	if (items.length === 0) return null;
	return {items, firstMessage};
}

/**
 * Opens the shared media viewer — the same fullscreen image/video player used for every other
 * attachment in the app (see MediaViewerModal) — over every group currently shown in the bar, in
 * that same order, instead of just the clicked author's own stories. That lets next/previous carry
 * the viewer straight from one person's last story into the next person's first one, the way
 * Instagram-style story bars behave, while reusing the app's existing player/menu/zoom machinery
 * untouched.
 *
 * Reply/forward/delete permissions inside the reused viewer are evaluated against the clicked
 * group's first story message (passed as `message` below) — a pre-existing limitation of
 * flattening several messages' attachments into one viewer session, unchanged from the Stories bar
 * work. It doesn't affect viewing/navigation, only those message-scoped actions while browsing
 * someone else's story in the same session.
 *
 * Also opens the comments panel (SocialHomeStoryCommentsPanel) for the clicked group's first
 * story, matching CLAUDE.md's "click story → media + comment thread" flow. It doesn't track
 * further prev/next navigation inside the viewer — reopening the panel for whichever story is
 * currently visible is left to a follow-up rather than this pass.
 */
export function openStoryViewer(groups: ReadonlyArray<StoryGroup>, startGroupIndex: number): void {
	const flattenedGroups = groups.map(flattenGroup);
	const allItems = flattenedGroups.flatMap((flattened) => flattened?.items ?? []);
	if (allItems.length === 0) return;
	let startIndex = 0;
	for (let i = 0; i < startGroupIndex; i++) {
		startIndex += flattenedGroups[i]?.items.length ?? 0;
	}
	const anchorMessage = flattenedGroups[startGroupIndex]?.firstMessage;
	if (!anchorMessage) return;
	MediaViewerCommands.openMediaViewer(allItems, Math.min(startIndex, allItems.length - 1), {
		channelId: anchorMessage.channelId,
		messageId: anchorMessage.id,
		message: anchorMessage,
		sourceChannel: Channels.getChannel(anchorMessage.channelId),
	});
	const clickedGroup = groups[startGroupIndex];
	if (clickedGroup) {
		SocialHomeStories.markAuthorSeen(clickedGroup.author.id, clickedGroup.latestStoryId);
	}
	openStoryComments(anchorMessage, getNextStoryId(SocialHomeStories.stories, anchorMessage.id));
}
