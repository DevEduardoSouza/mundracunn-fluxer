// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import {ForumCover} from '@app/features/forum/components/ForumCover';
import {ForumFollowButton} from '@app/features/forum/components/ForumFollowButton';
import {ForumPostMenuButton} from '@app/features/forum/components/ForumPostMenuButton';
import styles from '@app/features/forum/components/ForumPostCard.module.css';
import {useForumCoverLazyLoad} from '@app/features/forum/components/useForumCoverLazyLoad';
import type {ForumPost} from '@app/features/forum/state/Forum';
import ForumCovers from '@app/features/forum/state/ForumCovers';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const BY_AUTHOR_DESCRIPTOR = msg({
	message: 'by {author}',
	comment: 'Byline under a forum post card title. {author} is the display name of the post owner.',
});

interface ForumPostCardProps {
	guildId: string;
	post: ForumPost;
}

export const ForumPostCard: React.FC<ForumPostCardProps> = observer(({guildId, post}) => {
	const {i18n} = useLingui();
	const rootRef = useForumCoverLazyLoad<HTMLDivElement>(guildId, post.channel.id);
	const cover = ForumCovers.getCover(post.channel.id);
	const authorName = post.authorId ? (Users.getUser(post.authorId)?.displayName ?? null) : null;
	const open = useCallback(() => {
		RouterUtils.transitionTo(Routes.guildChannel(guildId, post.channel.id));
	}, [guildId, post.channel.id]);
	const handleKeyDown = useCallback(
		(event: React.KeyboardEvent) => {
			if (!isKeyboardActivationKey(event.key)) return;
			event.preventDefault();
			open();
		},
		[open],
	);
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
			<div className={styles.coverWrap} data-flx="forum.forum-post-card.cover-wrap">
				<ForumCover message={cover} variant="cover" data-flx="forum.forum-post-card.cover" />
				<div className={styles.menuOverlay} data-flx="forum.forum-post-card.menu-overlay">
					<ForumPostMenuButton channel={post.channel} data-flx="forum.forum-post-card.menu-button" />
				</div>
			</div>
			<div className={styles.body} data-flx="forum.forum-post-card.body">
				<div className={styles.titleRow} data-flx="forum.forum-post-card.title-row">
					{post.unread && (
						<span className={styles.unreadDot} aria-hidden="true" data-flx="forum.forum-post-card.unread-dot" />
					)}
					<span className={styles.title} data-flx="forum.forum-post-card.title">
						{post.title}
					</span>
					<ForumFollowButton channelId={post.channel.id} size="sm" data-flx="forum.forum-post-card.follow-button" />
				</div>
				{authorName && (
					<span className={styles.author} data-flx="forum.forum-post-card.author">
						{i18n._(BY_AUTHOR_DESCRIPTOR, {author: authorName})}
					</span>
				)}
			</div>
		</div>
	);
});
