// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {MessageReferenceTypes} from '@fluxer/constants/src/ChannelConstants';
import {compare} from '@fluxer/snowflake/src/SnowflakeUtils';

export interface CommentNode {
	message: Message;
	children: Array<CommentNode>;
	/**
	 * True when this comment's reply target isn't resolvable within the loaded window (its parent
	 * was deleted, or isn't loaded — treated the same way). It's still rendered, just anchored at
	 * the top level instead of nested under its real parent; ChannelMessage's own ReplyPreview
	 * already renders "Original message was deleted" for it, so no bespoke UI is needed here.
	 */
	isOrphan: boolean;
}

function replyParentId(message: Message): string | undefined {
	const reference = message.messageReference;
	if (!reference || reference.type !== MessageReferenceTypes.DEFAULT) {
		return undefined;
	}
	return reference.message_id;
}

function sortByIdAsc(messages: ReadonlyArray<Message>): Array<Message> {
	return [...messages].sort((a, b) => compare(a.id, b.id));
}

/**
 * Turns the story's flat reply messages into a tree: story = root, direct replies = comments,
 * replies-to-replies = sub-comments (CLAUDE.md section 6.1 — no native threads in Fluxer, so the
 * tree is rebuilt client-side from `message_reference` on every load).
 *
 * A message with no reply reference at all is still treated as a top-level comment rather than
 * dropped: the panel's own composer (SocialHomeStoryCommentsPanel) reuses the plain ChannelTextarea,
 * which sends an ordinary message with no `message_reference`, and CLAUDE.md section 6.1 already
 * frames the raw channel itself as the discussion area — a plain post in this window is exactly
 * that, not noise.
 *
 * `messages` is whatever the channel's message store currently holds, which may include another
 * story's own comments (loaded elsewhere in the same session) — this filters to the (root,
 * upperBoundStoryId) window first, same bound SocialHomeStoryCommentsCommands fetches within (see
 * SocialHomeStoryChronology.getNextStoryId), so a reply whose parent isn't found here reliably
 * means "deleted", not "belongs to a different story".
 */
export function buildCommentTree(
	root: Message,
	messages: ReadonlyArray<Message>,
	upperBoundStoryId: string | null = null,
): Array<CommentNode> {
	const windowMessages = messages.filter(
		(message) =>
			compare(message.id, root.id) > 0 &&
			(upperBoundStoryId == null || compare(message.id, upperBoundStoryId) < 0),
	);
	const byId = new Map<string, Message>([[root.id, root]]);
	for (const message of windowMessages) {
		byId.set(message.id, message);
	}
	const childrenByParent = new Map<string, Array<Message>>();
	const topLevelPlain: Array<Message> = [];
	const orphans: Array<Message> = [];
	for (const message of windowMessages) {
		const parentId = replyParentId(message);
		if (parentId == null) {
			topLevelPlain.push(message);
			continue;
		}
		if (parentId === root.id || byId.has(parentId)) {
			const siblings = childrenByParent.get(parentId);
			if (siblings) {
				siblings.push(message);
			} else {
				childrenByParent.set(parentId, [message]);
			}
		} else {
			orphans.push(message);
		}
	}
	function buildNode(message: Message, isOrphan: boolean): CommentNode {
		const children = sortByIdAsc(childrenByParent.get(message.id) ?? []).map((child) => buildNode(child, false));
		return {message, children, isOrphan};
	}
	const topLevel = sortByIdAsc(childrenByParent.get(root.id) ?? []).map((message) => buildNode(message, false));
	const topLevelPlainNodes = sortByIdAsc(topLevelPlain).map((message) => buildNode(message, false));
	const orphanNodes = sortByIdAsc(orphans).map((message) => buildNode(message, true));
	return [...topLevel, ...topLevelPlainNodes, ...orphanNodes].sort((a, b) => compare(a.message.id, b.message.id));
}
