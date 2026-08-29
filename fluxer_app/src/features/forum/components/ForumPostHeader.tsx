// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import type {Channel} from '@app/features/channel/models/Channel';
import {ForumFollowButton} from '@app/features/forum/components/ForumFollowButton';
import styles from '@app/features/forum/components/ForumPostHeader.module.css';
import {getForumPostAuthorId, isForumPostChannel} from '@app/features/forum/utils/ForumChannelDiscovery';
import {parseForumTopic} from '@app/features/forum/utils/ForumTopic';
import GuildMembers from '@app/features/member/state/GuildMembers';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CaretRightIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const FORUM_DESCRIPTOR = msg({
	message: 'Forum',
	comment: 'Breadcrumb root in the header of a forum post channel; clicking it goes back to the forum page.',
});
const BACK_TO_FORUM_DESCRIPTOR = msg({
	message: 'Back to forum',
	comment: 'Accessible label of the breadcrumb link that leaves a forum post and returns to the forum page.',
});
const BY_AUTHOR_DESCRIPTOR = msg({
	message: 'by {author}',
	comment: 'Byline in the header of a forum post. {author} is the display name of the post owner.',
});

interface ForumPostHeaderProps {
	guildId: string;
	channel: Channel;
}

/**
 * Replaces the plain "#channel-name • topic" header content when the channel is a forum post:
 * "Forum › Title", tags, author and the follow toggle. Renders nothing for any other channel, so
 * ChannelHeader can mount it unconditionally behind a lazy import (same pattern as
 * ForumPostHeaderMenuButton).
 */
export const ForumPostHeader: React.FC<ForumPostHeaderProps> = observer(({guildId, channel}) => {
	const {i18n} = useLingui();
	const goToForum = useCallback(() => {
		RouterUtils.transitionTo(Routes.guildForum(guildId));
	}, [guildId]);
	if (!isForumPostChannel(guildId, channel)) return null;

	const {title, tags} = parseForumTopic(channel.topic);
	const authorId = getForumPostAuthorId(channel);
	// Same resolution as the post cards, plus the guild nickname when the member is cached.
	const authorName = authorId
		? (GuildMembers.getMember(guildId, authorId)?.nick ?? Users.getUser(authorId)?.displayName ?? null)
		: null;

	return (
		<div className={styles.root} data-flx="forum.forum-post-header.root">
			<div className={styles.main} data-flx="forum.forum-post-header.main">
				<div className={styles.breadcrumb} data-flx="forum.forum-post-header.breadcrumb">
					<button
						type="button"
						className={styles.forumLink}
						onClick={goToForum}
						aria-label={i18n._(BACK_TO_FORUM_DESCRIPTOR)}
						data-flx="forum.forum-post-header.forum-link"
					>
						{i18n._(FORUM_DESCRIPTOR)}
					</button>
					<CaretRightIcon className={styles.caret} weight="bold" data-flx="forum.forum-post-header.caret" />
					<span className={styles.title} title={title ?? channel.name} data-flx="forum.forum-post-header.title">
						{title ?? channel.name}
					</span>
				</div>
				{(authorName || tags.length > 0) && (
					<div className={styles.meta} data-flx="forum.forum-post-header.meta">
						{authorName && (
							<span className={styles.author} data-flx="forum.forum-post-header.author">
								{i18n._(BY_AUTHOR_DESCRIPTOR, {author: authorName})}
							</span>
						)}
						{tags.map((tag) => (
							<span key={tag} className={styles.tag} data-flx="forum.forum-post-header.tag">
								#{tag}
							</span>
						))}
					</div>
				)}
			</div>
			<ForumFollowButton channelId={channel.id} size="sm" data-flx="forum.forum-post-header.follow-button" />
		</div>
	);
});
