// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import Permission from '@app/features/permissions/state/Permission';
import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';

const SKETCHBOOKS_CATEGORY_NAME = 'sketchbooks';
const PROFESSOR_FEED_CHANNEL_NAME = 'feed-do-professor';
const STORIES_CHANNEL_NAME = 'stories';
const FEED_CHANNEL_VIEW_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;
const STORIES_POST_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES;

/**
 * Categories in a real class are decorated - the pilot guild ships a paint-palette emoji before
 * `sketchbooks`, a house before `home social`, a pin before `inicio` - so matching the bare
 * convention name against a raw `toLowerCase()` silently found nothing, and the Feed quietly
 * degraded to the professor's channel alone. Stripping anything that isn't a letter, digit or
 * hyphen makes the convention survive whatever emoji or padding the guild owner puts around it,
 * while still requiring the name itself to match exactly (a `sketchbooks antigos` category stays
 * excluded).
 */
function normalizeChannelName(name: string | undefined): string {
	return (name ?? '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}-]+/gu, ' ')
		.trim();
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

export function getProfessorFeedChannel(guildId: string): Channel | undefined {
	return Channels.getGuildChannels(guildId).find(
		(channel) =>
			channel.type === ChannelTypes.GUILD_TEXT && normalizeChannelName(channel.name) === PROFESSOR_FEED_CHANNEL_NAME,
	);
}

/**
 * The Stories channel is restricted (only professor/admin can post — CLAUDE.md section 4); a
 * student who can't view it simply never receives it in their guild channel list, so no separate
 * permission check is needed here, same as {@link getProfessorFeedChannel}.
 */
export function getStoriesChannel(guildId: string): Channel | undefined {
	return Channels.getGuildChannels(guildId).find(
		(channel) =>
			channel.type === ChannelTypes.GUILD_TEXT && normalizeChannelName(channel.name) === STORIES_CHANNEL_NAME,
	);
}

/**
 * Who can post a Story is deliberately not hardcoded to a role name: the kickoff checklist
 * (CLAUDE.md section 7) left "só professor/admin ou monitores também?" open, and the client can
 * answer that later purely by editing the Stories channel's permission overwrites in Fluxer's own
 * UI — whoever ends up with SEND_MESSAGES there sees the publish button, no code change needed.
 */
export function canPostStories(guildId: string): boolean {
	const channel = getStoriesChannel(guildId);
	if (!channel) return false;
	const permissions = Permission.getChannelPermissions(channel.id) ?? 0n;
	return (permissions & STORIES_POST_PERMISSIONS) === STORIES_POST_PERMISSIONS;
}

/**
 * Optional per CLAUDE.md section 7 ("esconder o canal cru... acesso só pela Home?") — whoever can
 * post still needs the raw channel to actually manage/moderate Stories, so only non-posting
 * visitors (students) get funneled to the Home page instead. This is a client-side routing nudge,
 * not a permission change: the channel stays exactly as visible/readable as it already is via
 * Fluxer's own permission system, which is what actually gates access. True hiding (removing
 * VIEW_CHANNEL for @everyone) is a server-side permission decision for whoever administers the
 * guild, not something this fork changes on its own — see AppRoutes.tsx's channelRoute/messageRoute
 * for where this is applied.
 */
export function shouldRedirectAwayFromRawStoriesChannel(guildId: string, channelId: string): boolean {
	const storiesChannel = getStoriesChannel(guildId);
	if (!storiesChannel || storiesChannel.id !== channelId) return false;
	return !canPostStories(guildId);
}
