// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import {ForumCover} from '@app/features/forum/components/ForumCover';
import {useForumCoverLazyLoad} from '@app/features/forum/components/useForumCoverLazyLoad';
import styles from '@app/features/forum/components/ForumPostCard.module.css';
import type {ForumPost} from '@app/features/forum/state/Forum';
import ForumCovers from '@app/features/forum/state/ForumCovers';
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
	const rootRef = useForumCoverLazyLoad<HTMLButtonElement>(guildId, post.channel.id);
	const cover = ForumCovers.getCover(post.channel.id);
	const authorName = post.authorId ? (Users.getUser(post.authorId)?.displayName ?? null) : null;
	const handleOpen = useCallback(() => {
		RouterUtils.transitionTo(Routes.guildChannel(guildId, post.channel.id));
	}, [guildId, post.channel.id]);
	return (
		<button
			type="button"
			ref={rootRef}
			className={styles.card}
			onClick={handleOpen}
			data-flx="forum.forum-post-card.open"
		>
			<ForumCover message={cover} variant="cover" data-flx="forum.forum-post-card.cover" />
			<div className={styles.body} data-flx="forum.forum-post-card.body">
				<div className={styles.titleRow} data-flx="forum.forum-post-card.title-row">
					{post.unread && (
						<span className={styles.unreadDot} aria-hidden="true" data-flx="forum.forum-post-card.unread-dot" />
					)}
					<span className={styles.title} data-flx="forum.forum-post-card.title">
						{post.title}
					</span>
				</div>
				{authorName && (
					<span className={styles.author} data-flx="forum.forum-post-card.author">
						{i18n._(BY_AUTHOR_DESCRIPTOR, {author: authorName})}
					</span>
				)}
			</div>
		</button>
	);
});
