// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {ChannelHeaderIcon} from '@app/features/channel/components/channel_header_components/ChannelHeaderIcon';
import {openForumPostMenu} from '@app/features/forum/components/ForumPostMenu';
import styles from '@app/features/forum/components/ForumPostMenuButton.module.css';
import {canManageForumPost, isForumPostChannel} from '@app/features/forum/utils/ForumChannelDiscovery';
import {useContextMenuTrigger} from '@app/features/ui/hooks/useContextMenuTrigger';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {DotsThreeIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const POST_OPTIONS_DESCRIPTOR = msg({
	message: 'Post options',
	comment: 'Accessible label / tooltip for the button that opens the edit/delete menu of a forum post.',
});

/** Compact "⋯" button for a forum post card/row. Renders nothing unless the user can manage the post. */
export const ForumPostMenuButton: React.FC<{channel: Channel}> = observer(({channel}) => {
	const {i18n} = useLingui();
	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			event.stopPropagation();
			openForumPostMenu(event, channel, i18n);
		},
		[channel, i18n],
	);
	if (!canManageForumPost(channel.id)) return null;
	return (
		<button
			type="button"
			className={styles.button}
			onClick={handleClick}
			aria-label={i18n._(POST_OPTIONS_DESCRIPTOR)}
			aria-haspopup="menu"
			data-flx="forum.forum-post-menu-button.button"
		>
			<DotsThreeIcon weight="bold" data-flx="forum.forum-post-menu-button.icon" />
		</button>
	);
});

/**
 * The same menu, as a channel-header icon — shown only for forum post channels the user can manage.
 * Wired into ChannelHeader via a one-line additive hunk.
 */
export const ForumPostHeaderMenuButton = observer(({guildId, channel}: {guildId: string; channel: Channel}) => {
	const {i18n} = useLingui();
	const {isOpen, withTracking} = useContextMenuTrigger();
	const handleClick = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			openForumPostMenu(event, channel, i18n, withTracking());
		},
		[channel, i18n, withTracking],
	);
	if (!isForumPostChannel(guildId, channel) || !canManageForumPost(channel.id)) return null;
	return (
		<ChannelHeaderIcon
			icon={DotsThreeIcon}
			label={i18n._(POST_OPTIONS_DESCRIPTOR)}
			isSelected={isOpen}
			aria-haspopup="menu"
			aria-expanded={isOpen}
			onClick={handleClick}
			data-flx="forum.forum-post-header-menu-button.channel-header-icon"
		/>
	);
});
