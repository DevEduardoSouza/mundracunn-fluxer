// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import Permission from '@app/features/permissions/state/Permission';
import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';

const SKETCHBOOKS_CATEGORY_NAME = 'sketchbooks';
const PROFESSOR_FEED_CHANNEL_NAME = 'feed-do-professor';
const STORIES_CHANNEL_NAME = 'stories';
/**
 * Forum posts feed the Gallery too — decision 4 of docs/analise-forum.md §5 ("a Galeria (Feed)
 * agrega também as postagens do fórum"), which shipped in the forum feature but never reached this
 * discovery, so a class that moved to the forum saw an empty Gallery.
 *
 * The convention is duplicated from ForumChannelDiscovery rather than imported, on purpose: that
 * file's own header says the two features stay decoupled by copy so either can be rebased or
 * dropped without touching the other (client priority #1). The forum names need diacritics
 * stripped ("Fórum" must match "forum"), which is why they get their own normalizer below.
 */
const FORUM_CATEGORY_NAME_PREFIX = 'forum';
const FORUM_GUIDELINES_CHANNEL_NAMES: ReadonlySet<string> = new Set(['diretrizes', 'guidelines']);
const FEED_CHANNEL_VIEW_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;
/**
 * ATTACH_FILES, not just SEND_MESSAGES: commenting on a story is an ordinary reply in the very same
 * channel, so gating on SEND_MESSAGES made "can comment" and "can publish a story" the same
 * permission — every member who was allowed to discuss a story also got the publish button. The
 * class owner asked for exactly the opposite on 30/08/2026 ("os membros podem comentar, isso é
 * necessário, mas não quero que consigam postar nem foto nem vídeo").
 *
 * A story is media by definition (the fetch only ever picks up image/video messages), so whoever
 * cannot attach a file cannot author one — which makes ATTACH_FILES the honest gate. Denying it to
 * @everyone/Aluno on the Stories channel is then the whole configuration, done in Fluxer's own
 * permission UI, and it also stops the raw channel from accepting an upload; hiding the button
 * alone would not.
 */
const STORIES_POST_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.SEND_MESSAGES | Permissions.ATTACH_FILES;

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

/**
 * Stricter than {@link normalizeChannelName}: it also strips diacritics, because the forum
 * convention anchors on the bare word "forum" while real categories are written "🗂️ Fórum".
 */
function normalizeForumName(name: string | undefined): string {
	return (name ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
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
export function getSketchbooksCategory(guildId: string): Channel | undefined {
	return Channels.getGuildChannels(guildId).find(
		(channel) =>
			channel.type === ChannelTypes.GUILD_CATEGORY && normalizeChannelName(channel.name) === SKETCHBOOKS_CATEGORY_NAME,
	);
}

export function discoverFeedChannelIds(guildId: string): Array<string> {
	const channels = Channels.getGuildChannels(guildId);
	const sketchbooksCategory = getSketchbooksCategory(guildId);
	const forumCategoryIds = new Set(
		channels
			.filter(
				(channel) =>
					channel.type === ChannelTypes.GUILD_CATEGORY &&
					normalizeForumName(channel.name).startsWith(FORUM_CATEGORY_NAME_PREFIX),
			)
			.map((channel) => channel.id),
	);
	const channelIds: Array<string> = [];
	for (const channel of channels) {
		if (channel.type !== ChannelTypes.GUILD_TEXT) continue;
		const isSketchbookChannel = sketchbooksCategory != null && channel.parentId === sketchbooksCategory.id;
		const isProfessorFeedChannel = normalizeChannelName(channel.name) === PROFESSOR_FEED_CHANNEL_NAME;
		// A forum post is a channel, so its images are ordinary channel images — the Feed's
		// `has: ["image"]` search picks them up with no extra machinery. The rules channel is
		// excluded: it is a panel, and its text-only message would never match anyway.
		const isForumPostChannel =
			channel.parentId != null &&
			forumCategoryIds.has(channel.parentId) &&
			!FORUM_GUIDELINES_CHANNEL_NAMES.has(normalizeForumName(channel.name));
		if (!isSketchbookChannel && !isProfessorFeedChannel && !isForumPostChannel) continue;
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
 * (CLAUDE.md section 7) left "só professor/admin ou monitores também?" open, and the class answers
 * it purely by editing the Stories channel's permission overwrites in Fluxer's own UI — whoever
 * ends up with {@link STORIES_POST_PERMISSIONS} there sees the publish button, no code change
 * needed. Commenting stays open to everyone with SEND_MESSAGES.
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
