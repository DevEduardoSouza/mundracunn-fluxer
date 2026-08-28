// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import {ForumCover} from '@app/features/forum/components/ForumCover';
import {useForumCoverLazyLoad} from '@app/features/forum/components/useForumCoverLazyLoad';
import styles from '@app/features/forum/components/ForumPostRow.module.css';
import ForumCovers from '@app/features/forum/state/ForumCovers';
import type {ForumPost} from '@app/features/forum/state/Forum';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import Users from '@app/features/user/state/Users';
import {formatShortRelativeTime} from '@fluxer/date_utils/src/DateDuration';
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
	comment: 'Relative last-activity label on a forum post row. {time} is a short relative time like "5m" or "3d".',
});

interface ForumPostRowProps {
	guildId: string;
	post: ForumPost;
}

export const ForumPostRow: React.FC<ForumPostRowProps> = observer(({guildId, post}) => {
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
			className={styles.row}
			onClick={handleOpen}
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
					{authorName && <span data-flx="forum.forum-post-row.author">{i18n._(BY_AUTHOR_DESCRIPTOR, {author: authorName})}</span>}
					<span data-flx="forum.forum-post-row.activity">
						{i18n._(LAST_ACTIVITY_DESCRIPTOR, {time: formatShortRelativeTime(post.lastActivityAt, '1m')})}
					</span>
				</div>
				{post.topic && (
					<p className={styles.preview} data-flx="forum.forum-post-row.preview">
						{post.topic}
					</p>
				)}
			</div>
			<ForumCover message={cover} variant="thumb" data-flx="forum.forum-post-row.cover" />
		</button>
	);
});
