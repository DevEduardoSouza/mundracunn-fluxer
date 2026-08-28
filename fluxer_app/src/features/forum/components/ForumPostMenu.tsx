// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {ContextMenuCloseProvider} from '@app/features/ui/action_menu/ContextMenu';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItem} from '@app/features/ui/action_menu/MenuItem';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import {modal, push as pushModal} from '@app/features/ui/commands/ModalCommands';
import type {ContextMenuConfig} from '@app/features/ui/state/ContextMenu';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {PencilSimpleIcon, TrashIcon} from '@phosphor-icons/react';
import type React from 'react';

const EDIT_POST_DESCRIPTOR = msg({
	message: 'Edit post',
	comment: 'Menu action that opens the edit modal for a forum post (title and tags).',
});
const DELETE_POST_DESCRIPTOR = msg({
	message: 'Delete post',
	comment: 'Destructive menu action that deletes a forum post (its channel).',
});

// The two modals are code-split so the menu (and, through it, the channel header) doesn't pull the
// create/edit command chain into its eager bundle.
function openEditModal(channel: Channel): void {
	void import('@app/features/forum/components/ForumEditPostModal').then(({ForumEditPostModal}) => {
		pushModal(modal(() => <ForumEditPostModal channel={channel} data-flx="forum.forum-post-menu.edit-modal" />));
	});
}

function openDeleteModal(channelId: string): void {
	void import('@app/features/channel/components/modals/ChannelDeleteModal').then(({ChannelDeleteModal}) => {
		pushModal(modal(() => <ChannelDeleteModal channelId={channelId} data-flx="forum.forum-post-menu.delete-modal" />));
	});
}

const ForumPostMenuContent: React.FC<{channel: Channel; onClose: () => void; i18n: I18n}> = ({channel, onClose, i18n}) => (
	<ContextMenuCloseProvider value={onClose} data-flx="forum.forum-post-menu.close-provider">
		<MenuGroup data-flx="forum.forum-post-menu.group">
			<MenuItem
				icon={<PencilSimpleIcon data-flx="forum.forum-post-menu.edit-icon" />}
				onClick={() => openEditModal(channel)}
				data-flx="forum.forum-post-menu.edit"
			>
				{i18n._(EDIT_POST_DESCRIPTOR)}
			</MenuItem>
			<MenuItem
				danger={true}
				icon={<TrashIcon data-flx="forum.forum-post-menu.delete-icon" />}
				onClick={() => openDeleteModal(channel.id)}
				data-flx="forum.forum-post-menu.delete"
			>
				{i18n._(DELETE_POST_DESCRIPTOR)}
			</MenuItem>
		</MenuGroup>
	</ContextMenuCloseProvider>
);

export function openForumPostMenu(
	event: React.MouseEvent<HTMLElement>,
	channel: Channel,
	i18n: I18n,
	config?: ContextMenuConfig,
): void {
	ContextMenuCommands.openFromElementBottomRight(
		event,
		({onClose}) => (
			<ForumPostMenuContent
				channel={channel}
				onClose={onClose}
				i18n={i18n}
				data-flx="forum.forum-post-menu.content"
			/>
		),
		config,
	);
}
