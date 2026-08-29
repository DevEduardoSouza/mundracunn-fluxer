// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import {ForumCover} from '@app/features/forum/components/ForumCover';
import {ForumFollowButton} from '@app/features/forum/components/ForumFollowButton';
import {ForumPostMenuButton} from '@app/features/forum/components/ForumPostMenuButton';
import styles from '@app/features/forum/components/ForumPostCard.module.css';
import {useForumCoverLazyLoad} from '@app/features/forum/components/useForumCoverLazyLoad';
import {useForumExcerptLazyLoad} from '@app/features/forum/components/useForumExcerptLazyLoad';
import type {ForumPost} from '@app/features/forum/state/Forum';
import ForumCovers from '@app/features/forum/state/ForumCovers';
import ForumExcerpts from '@app/features/forum/state/ForumExcerpts';
import {formatForumRelativeTime} from '@app/features/forum/utils/ForumRelativeTime';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {Avatar} from '@app/features/ui/components/Avatar';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ChatCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const POSTED_DESCRIPTOR = msg({
	message: 'posted {time}',
	comment:
		'When a forum post was created, next to the author name on a gallery card. {time} is an already localized relative phrase such as "3 days ago" / "há 3 dias".',
});
const LAST_ACTIVITY_DESCRIPTOR = msg({
	message: 'active {time}',
	comment:
		'Relative last-activity label in the footer of a forum post card. {time} is an already localized relative phrase such as "3 days ago" / "há 3 dias", so the translation should read naturally around it.',
});
const UNREAD_DESCRIPTOR = msg({
	message: 'New messages',
	comment: 'Accessible label of the unread dot on a forum post card.',
});

const AUTHOR_AVATAR_SIZE = 24;

/** Covers get the whole 16:10 slot; an image whose message also has text is still a cover, not an excerpt. */
function hasCoverImage(cover: ReturnType<typeof ForumCovers.getCover>): boolean {
	return (cover?.attachments ?? []).some((attachment) => (attachment.content_type ?? '').startsWith('image/'));
}

interface ForumPostCardProps {
	guildId: string;
	post: ForumPost;
}

export const ForumPostCard: React.FC<ForumPostCardProps> = observer(({guildId, post}) => {
	const {i18n} = useLingui();
	const channelId = post.channel.id;
	const rootRef = useForumCoverLazyLoad<HTMLDivElement>(guildId, channelId);
	const bodyRef = useForumExcerptLazyLoad<HTMLDivElement>(guildId, channelId);
	const cover = ForumCovers.getCover(channelId);
	const excerpt = ForumExcerpts.getExcerpt(channelId);
	const author = post.authorId ? Users.getUser(post.authorId) : null;
	const open = useCallback(() => {
		RouterUtils.transitionTo(Routes.guildChannel(guildId, channelId));
	}, [guildId, channelId]);
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (!isKeyboardActivationKey(event.key)) return;
			event.preventDefault();
			open();
		},
		[open],
	);
	const stopPropagation = useCallback((event: React.SyntheticEvent) => {
		event.stopPropagation();
	}, []);
	const showCover = hasCoverImage(cover);
	return (
		<div
			ref={rootRef}
			role="button"
			tabIndex={0}
			className={styles.card}
			onClick={open}
			onKeyDown={handleKeyDown}
			data-flx="forum.forum-post-card.open"
		>
			<div ref={bodyRef} className={styles.body} data-flx="forum.forum-post-card.body">
				<div className={styles.header} data-flx="forum.forum-post-card.header">
					{author && (
						<>
							<Avatar
								user={author}
								size={AUTHOR_AVATAR_SIZE}
								guildId={guildId}
								disableStatusTooltip
								data-flx="forum.forum-post-card.avatar"
							/>
							<span className={styles.author} data-flx="forum.forum-post-card.author">
								{author.displayName}
							</span>
						</>
					)}
					<span className={styles.posted} data-flx="forum.forum-post-card.posted">
						{i18n._(POSTED_DESCRIPTOR, {time: formatForumRelativeTime(i18n.locale, post.createdAt)})}
					</span>
				</div>
				<div className={styles.titleRow} data-flx="forum.forum-post-card.title-row">
					{post.unread && (
						<span
							className={styles.unreadDot}
							role="img"
							aria-label={i18n._(UNREAD_DESCRIPTOR)}
							data-flx="forum.forum-post-card.unread-dot"
						/>
					)}
					<span className={styles.title} data-flx="forum.forum-post-card.title">
						{post.title}
					</span>
				</div>
				{post.tags.length > 0 && (
					<div className={styles.tags} data-flx="forum.forum-post-card.tags">
						{post.tags.map((tag) => (
							<span key={tag} className={styles.tag} data-flx="forum.forum-post-card.tag">
								#{tag}
							</span>
						))}
					</div>
				)}
				{showCover ? (
					<div className={styles.coverWrap} data-flx="forum.forum-post-card.cover-wrap">
						<ForumCover message={cover} variant="cover" data-flx="forum.forum-post-card.cover" />
					</div>
				) : (
					excerpt && (
						<p className={styles.excerpt} data-flx="forum.forum-post-card.excerpt">
							{excerpt}
						</p>
					)
				)}
			</div>
			<div className={styles.footer} data-flx="forum.forum-post-card.footer">
				<span className={styles.activity} data-flx="forum.forum-post-card.activity">
					<ChatCircleIcon className={styles.activityIcon} data-flx="forum.forum-post-card.activity-icon" />
					{i18n._(LAST_ACTIVITY_DESCRIPTOR, {time: formatForumRelativeTime(i18n.locale, post.lastActivityAt)})}
				</span>
				{/* The follow star and the menu are buttons of their own: a click on them must not open the post. */}
				<div className={styles.actions} onClick={stopPropagation} data-flx="forum.forum-post-card.actions">
					<ForumFollowButton channelId={channelId} size="sm" data-flx="forum.forum-post-card.follow-button" />
					<ForumPostMenuButton channel={post.channel} data-flx="forum.forum-post-card.menu-button" />
				</div>
			</div>
		</div>
	);
});
