// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import {ForumCover} from '@app/features/forum/components/ForumCover';
import {ForumPostMenuButton} from '@app/features/forum/components/ForumPostMenuButton';
import styles from '@app/features/forum/components/ForumPostRow.module.css';
import {useForumCoverLazyLoad} from '@app/features/forum/components/useForumCoverLazyLoad';
import type {ForumPost} from '@app/features/forum/state/Forum';
import ForumCovers from '@app/features/forum/state/ForumCovers';
import {formatForumRelativeTime} from '@app/features/forum/utils/ForumRelativeTime';
import {isKeyboardActivationKey} from '@app/features/input/utils/KeyboardUtils';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {BellRingingIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const FOLLOWING_DESCRIPTOR = msg({
	message: 'Following',
	comment: 'Tooltip on the bell icon shown next to a forum post the current user follows.',
});
const BY_AUTHOR_DESCRIPTOR = msg({
	message: 'by {author}',
	comment: 'Byline under a forum post title. {author} is the display name of the post owner.',
});
const LAST_ACTIVITY_DESCRIPTOR = msg({
	message: 'active {time}',
	comment:
		'Relative last-activity label on a forum post row. {time} is an already localized relative phrase such as "3 days ago" / "há 3 dias", so the translation should read naturally around it.',
});

interface ForumPostRowProps {
	guildId: string;
	post: ForumPost;
}

export const ForumPostRow: React.FC<ForumPostRowProps> = observer(({guildId, post}) => {
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
			className={styles.row}
			onClick={open}
			onKeyDown={handleKeyDown}
			data-flx="forum.forum-post-row.open"
		>
			<div className={styles.main} data-flx="forum.forum-post-row.main">
				<div className={styles.titleRow} data-flx="forum.forum-post-row.title-row">
					{post.unread && (
						<span className={styles.unreadDot} aria-hidden="true" data-flx="forum.forum-post-row.unread-dot" />
					)}
					<span className={styles.title} data-flx="forum.forum-post-row.title">
						{post.title}
					</span>
					{post.isFollowed && (
						<Tooltip text={i18n._(FOLLOWING_DESCRIPTOR)} data-flx="forum.forum-post-row.following-tooltip">
							<span className={styles.followingIcon} data-flx="forum.forum-post-row.following-icon">
								<BellRingingIcon size={remFromPx(14)} data-flx="forum.forum-post-row.following-icon-glyph" />
							</span>
						</Tooltip>
					)}
				</div>
				<div className={styles.meta} data-flx="forum.forum-post-row.meta">
					{authorName && (
						<span data-flx="forum.forum-post-row.author">{i18n._(BY_AUTHOR_DESCRIPTOR, {author: authorName})}</span>
					)}
					<span data-flx="forum.forum-post-row.activity">
						{i18n._(LAST_ACTIVITY_DESCRIPTOR, {time: formatForumRelativeTime(i18n.locale, post.lastActivityAt)})}
					</span>
				</div>
				{post.tags.length > 0 && (
					<div className={styles.tags} data-flx="forum.forum-post-row.tags">
						{post.tags.map((tag) => (
							<span key={tag} className={styles.tag} data-flx="forum.forum-post-row.tag">
								#{tag}
							</span>
						))}
					</div>
				)}
			</div>
			<ForumPostMenuButton channel={post.channel} data-flx="forum.forum-post-row.menu-button" />
			<ForumCover message={cover} variant="thumb" data-flx="forum.forum-post-row.cover" />
		</div>
	);
});
