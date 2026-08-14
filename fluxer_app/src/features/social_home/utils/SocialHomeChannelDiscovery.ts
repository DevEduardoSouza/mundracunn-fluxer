// SPDX-License-Identifier: AGPL-3.0-or-later

import Channels from '@app/features/channel/state/Channels';
import Permission from '@app/features/permissions/state/Permission';
import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';

const SKETCHBOOKS_CATEGORY_NAME = 'sketchbooks';
const PROFESSOR_FEED_CHANNEL_NAME = 'feed do professor';
const FEED_CHANNEL_VIEW_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;

function normalizeChannelName(name: string | undefined): string {
	return (name ?? '').trim().toLowerCase();
}

function canViewChannel(channelId: string): boolean {
	const permissions = Permission.getChannelPermissions(channelId) ?? 0n;
	return (permissions & FEED_CHANNEL_VIEW_PERMISSIONS) === FEED_CHANNEL_VIEW_PERMISSIONS;
}

/**
 * Sketchbook channels are identified by convention (a "Sketchbooks" category), plus the
 * professor's direct-post channel — see CLAUDE.md section 4/6.1. The result is filtered to
 * channels the current user can actually view: the search API rejects (403) a request whose
 * explicit channel_ids include a channel the requester can't see, and Sketchbooks may be
 * private per student.
 */
export function discoverFeedChannelIds(guildId: string): Array<string> {
	const channels = Channels.getGuildChannels(guildId);
	const sketchbooksCategory = channels.find(
		(channel) =>
			channel.type === ChannelTypes.GUILD_CATEGORY && normalizeChannelName(channel.name) === SKETCHBOOKS_CATEGORY_NAME,
	);
	const channelIds: Array<string> = [];
	for (const channel of channels) {
		if (channel.type !== ChannelTypes.GUILD_TEXT) continue;
		const isSketchbookChannel = sketchbooksCategory != null && channel.parentId === sketchbooksCategory.id;
		const isProfessorFeedChannel = normalizeChannelName(channel.name) === PROFESSOR_FEED_CHANNEL_NAME;
		if (!isSketchbookChannel && !isProfessorFeedChannel) continue;
		if (!canViewChannel(channel.id)) continue;
		channelIds.push(channel.id);
	}
	return channelIds;
}
