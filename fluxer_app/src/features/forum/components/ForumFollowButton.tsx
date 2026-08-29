// SPDX-License-Identifier: AGPL-3.0-or-later

import {isFollowingForumPost, toggleFollowForumPost} from '@app/features/forum/commands/ForumFollowCommands';
import styles from '@app/features/forum/components/ForumFollowButton.module.css';
import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import {Tooltip} from '@app/features/ui/tooltip/Tooltip';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {StarIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const FOLLOW_DESCRIPTOR = msg({
	message: 'Follow',
	comment: 'Button on a forum post that starts following it (adds it to favorites, activity notifications on).',
});
const FOLLOWING_DESCRIPTOR = msg({
	message: 'Following',
	comment: 'State of the forum follow button once the post is followed; clicking it unfollows.',
});
const UNFOLLOW_DESCRIPTOR = msg({
	message: 'Unfollow',
	comment: 'Tooltip / accessible action on the forum follow button when the post is already followed.',
});

export interface ForumFollowButtonProps {
	channelId: string;
	/** `sm`: icon only (row/card, 44px touch target); `md`: icon + label (channel header). */
	size?: 'sm' | 'md';
}

/**
 * "Seguir / Seguindo" toggle for a forum post. Reads the follow state straight off Favorites
 * (through ForumFollowCommands) so every copy of the button — row, card, menu, header — agrees.
 * Stops propagation: the row and the card it sits in are themselves clickable.
 */
export const ForumFollowButton: React.FC<ForumFollowButtonProps> = observer(({channelId, size = 'md'}) => {
	const {i18n} = useLingui();
	const following = isFollowingForumPost(channelId);
	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			event.preventDefault();
			toggleFollowForumPost(channelId);
		},
		[channelId],
	);
	const handleKeyDown = useCallback((event: React.KeyboardEvent<HTMLButtonElement>) => {
		// Keep Enter/Space from reaching the row's own keyboard handler, which would open the post.
		event.stopPropagation();
	}, []);
	const actionLabel = i18n._(following ? UNFOLLOW_DESCRIPTOR : FOLLOW_DESCRIPTOR);
	const button = (
		<button
			type="button"
			className={clsx(styles.button, size === 'sm' ? styles.sm : styles.md, following && styles.following)}
			onClick={handleClick}
			onKeyDown={handleKeyDown}
			aria-pressed={following}
			aria-label={size === 'sm' ? actionLabel : undefined}
			data-following={following ? 'true' : 'false'}
			data-flx="forum.forum-follow-button.button"
		>
			<StarIcon
				size={remFromPx(size === 'sm' ? 16 : 18)}
				weight={following ? 'fill' : 'regular'}
				data-flx="forum.forum-follow-button.icon"
			/>
			{size === 'md' && (
				<span className={styles.label} data-flx="forum.forum-follow-button.label">
					{i18n._(following ? FOLLOWING_DESCRIPTOR : FOLLOW_DESCRIPTOR)}
				</span>
			)}
		</button>
	);
	if (size !== 'sm') return button;
	return (
		<Tooltip text={actionLabel} data-flx="forum.forum-follow-button.tooltip">
			{button}
		</Tooltip>
	);
});
