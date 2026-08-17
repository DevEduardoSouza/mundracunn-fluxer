// SPDX-License-Identifier: AGPL-3.0-or-later

import {Message as MessageComponent} from '@app/features/channel/components/ChannelMessage';
import type {Channel} from '@app/features/channel/models/Channel';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {loadMoreComments} from '@app/features/social_home/commands/SocialHomeStoryCommentsCommands';
import styles from '@app/features/social_home/components/SocialHomeStoryCommentTree.module.css';
import SocialHomeStoryComments from '@app/features/social_home/state/SocialHomeStoryComments';
import {buildCommentTree, type CommentNode} from '@app/features/social_home/utils/SocialHomeCommentTree';
import {MessagePreviewContext} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {type CSSProperties, useCallback, useMemo} from 'react';

const MAX_VISUAL_DEPTH = 6;

const COMMENTS_EMPTY_DESCRIPTOR = msg({
	message: 'No comments yet.',
	comment: 'Empty state shown under a story when nobody has replied to it yet.',
});
const COMMENTS_LOADING_DESCRIPTOR = msg({
	message: 'Loading comments…',
	comment: 'Loading state shown while a story’s first page of comments is being fetched.',
});
const COMMENTS_ERROR_DESCRIPTOR = msg({
	message: "Couldn't load comments.",
	comment: 'Shown when fetching a story’s comments fails.',
});
const LOAD_MORE_COMMENTS_DESCRIPTOR = msg({
	message: 'Load more comments',
	comment: 'Button at the bottom of a story’s comment tree that loads the next page of comments.',
});
const LOADING_MORE_COMMENTS_DESCRIPTOR = msg({
	message: 'Loading more…',
	comment: 'Label on the load-more-comments button while the next page is being fetched.',
});

interface CommentTreeNodeProps {
	node: CommentNode;
	channel: Channel;
	depth: number;
}

const CommentTreeNode: React.FC<CommentTreeNodeProps> = observer(({node, channel, depth}) => {
	const visualDepth = Math.min(depth, MAX_VISUAL_DEPTH);
	return (
		<div
			className={styles.node}
			style={{'--comment-depth': visualDepth} as CSSProperties}
			data-flx="social_home.social-home-story-comment-tree.comment-tree-node.node"
		>
			<MessageComponent
				message={node.message}
				channel={channel}
				previewContext={MessagePreviewContext.LIST_POPOUT}
				data-flx="social_home.social-home-story-comment-tree.comment-tree-node.message-component"
			/>
			{node.children.length > 0 && (
				<div
					className={styles.children}
					data-flx="social_home.social-home-story-comment-tree.comment-tree-node.children"
				>
					{node.children.map((child) => (
						<CommentTreeNode
							key={child.message.id}
							node={child}
							channel={channel}
							depth={depth + 1}
							data-flx="social_home.social-home-story-comment-tree.comment-tree-node.comment-tree-node"
						/>
					))}
				</div>
			)}
		</div>
	);
});

interface SocialHomeStoryCommentTreeProps {
	root: Message;
	channel: Channel;
}

/**
 * Reads the channel's real message store (populated by SocialHomeStoryCommentsCommands via the
 * app's normal fetchMessages pipeline) and rebuilds the comment tree on every relevant change —
 * `Messages.version` is the counter that pipeline bumps after each load, see MessagingMessages.ts.
 */
export const SocialHomeStoryCommentTree: React.FC<SocialHomeStoryCommentTreeProps> = observer(({root, channel}) => {
	const {i18n} = useLingui();
	// `version` isn't read below — it's the signal from Messages that `toArray()` may return
	// something new, since ChannelMessages itself isn't a MobX-observable structure.
	const version = Messages.version;
	const isActive = SocialHomeStoryComments.isActive(root.id, channel.id);
	const upperBoundStoryId = SocialHomeStoryComments.getUpperBoundStoryId();
	const nodes = useMemo(() => {
		if (!isActive) return [];
		const messages = Messages.getMessages(channel.id).toArray();
		return buildCommentTree(root, messages, upperBoundStoryId);
	}, [isActive, channel, root, upperBoundStoryId, version]);
	const isLoadingInitial = SocialHomeStoryComments.getIsLoadingInitial();
	const isLoadingMore = SocialHomeStoryComments.getIsLoadingMore();
	const error = SocialHomeStoryComments.getError();
	const hasMore = SocialHomeStoryComments.getHasMore();
	const handleLoadMore = useCallback(() => {
		void loadMoreComments();
	}, []);
	return (
		<div className={styles.tree} data-flx="social_home.social-home-story-comment-tree.tree">
			{nodes.map((node) => (
				<CommentTreeNode
					key={node.message.id}
					node={node}
					channel={channel}
					depth={0}
					data-flx="social_home.social-home-story-comment-tree.comment-tree-node"
				/>
			))}
			{nodes.length === 0 && !isLoadingInitial && !error && (
				<p className={styles.placeholderText} data-flx="social_home.social-home-story-comment-tree.empty-text">
					{i18n._(COMMENTS_EMPTY_DESCRIPTOR)}
				</p>
			)}
			{isLoadingInitial && (
				<p className={styles.placeholderText} data-flx="social_home.social-home-story-comment-tree.loading-text">
					{i18n._(COMMENTS_LOADING_DESCRIPTOR)}
				</p>
			)}
			{error && (
				<p className={styles.placeholderText} data-flx="social_home.social-home-story-comment-tree.error-text">
					{i18n._(COMMENTS_ERROR_DESCRIPTOR)}
				</p>
			)}
			{hasMore && !isLoadingInitial && (
				<button
					type="button"
					className={styles.loadMoreButton}
					onClick={handleLoadMore}
					disabled={isLoadingMore}
					data-flx="social_home.social-home-story-comment-tree.load-more-button"
				>
					{isLoadingMore ? i18n._(LOADING_MORE_COMMENTS_DESCRIPTOR) : i18n._(LOAD_MORE_COMMENTS_DESCRIPTOR)}
				</button>
			)}
		</div>
	);
});
