// SPDX-License-Identifier: AGPL-3.0-or-later

/*
 * MUNDRACUNN (feature forum): "Seguir postagem".
 *
 * Following a post is the native Favorites feature (`Favorites.addChannel`) — persisted in the
 * user's synced preferences on the server, so it syncs across devices and the post also shows up in
 * the "Favoritos" pseudo-guild in the sidebar. Zero backend. Following also unmutes the channel so
 * the student gets activity notifications; unfollowing leaves the mute state alone (the student may
 * have muted it on purpose).
 *
 * Shared by the list/gallery (row, card, toolbar) and by the post's channel header.
 */

import Channels from '@app/features/channel/state/Channels';
import Favorites from '@app/features/messaging/state/Favorites';
import {toggleChannelMuted} from '@app/features/user/commands/UserGuildSettingsCommands';
import UserGuildSettings from '@app/features/user/state/UserGuildSettings';

export function isFollowingForumPost(channelId: string): boolean {
	return Favorites.getChannel(channelId) != null;
}

export function followForumPost(channelId: string): void {
	const channel = Channels.getChannel(channelId);
	if (!channel?.guildId) return;
	Favorites.addChannel(channel.id, channel.guildId, null);
	if (UserGuildSettings.isChannelMuted(channel.guildId, channel.id)) {
		toggleChannelMuted(channel.guildId, channel.id);
	}
}

export function unfollowForumPost(channelId: string): void {
	Favorites.removeChannel(channelId);
}

export function toggleFollowForumPost(channelId: string): void {
	if (isFollowingForumPost(channelId)) {
		unfollowForumPost(channelId);
	} else {
		followForumPost(channelId);
	}
}
