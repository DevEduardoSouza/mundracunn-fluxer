// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import Permission from '@app/features/permissions/state/Permission';
import {ChannelOverwriteTypes, ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';

/**
 * The forum is discovered by convention, not by a new channel type — see docs/analise-forum.md in
 * the comunidade-mundracunn repo. Any category whose name starts with "forum" (accent- and
 * emoji-insensitive) is a forum category; its GUILD_TEXT children are the forum's post threads,
 * except a "diretrizes"/"guidelines" channel which is the pinned rules channel, not a post.
 *
 * The pattern here mirrors social_home's SocialHomeChannelDiscovery deliberately by copy, not by
 * import: the two features stay decoupled so either can be rebased or dropped without touching the
 * other (client priority #1 — easy rebases).
 */

const FORUM_CATEGORY_NAME_PREFIX = 'forum';
const GUIDELINES_CHANNEL_NAMES: ReadonlySet<string> = new Set(['diretrizes', 'guidelines']);
const FORUM_CHANNEL_VIEW_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;

/**
 * Real class categories are decorated with emoji and written with Portuguese accents ("🗣️ Fórum
 * Geral"). Stripping diacritics and anything that isn't a letter, digit or hyphen makes the
 * "forum" convention survive whatever the guild owner types around it, while still anchoring on the
 * word itself. A stricter version of social_home's normalizeChannelName (that one keeps accents; a
 * forum category named "Fórum" must still match "forum").
 */
export function normalizeChannelName(name: string | undefined): string {
	return (name ?? '')
		.normalize('NFD')
		.replace(/\p{Diacritic}/gu, '')
		.toLowerCase()
		.replace(/[^\p{L}\p{N}-]+/gu, ' ')
		.trim();
}

function canViewChannel(channelId: string): boolean {
	const permissions = Permission.getChannelPermissions(channelId) ?? 0n;
	return (permissions & FORUM_CHANNEL_VIEW_PERMISSIONS) === FORUM_CHANNEL_VIEW_PERMISSIONS;
}

function isGuidelinesChannel(channel: Channel): boolean {
	return GUIDELINES_CHANNEL_NAMES.has(normalizeChannelName(channel.name));
}

/** Every category in the guild whose normalized name starts with "forum". */
export function getForumCategories(guildId: string): Array<Channel> {
	return Channels.getGuildChannels(guildId).filter(
		(channel) =>
			channel.type === ChannelTypes.GUILD_CATEGORY &&
			normalizeChannelName(channel.name).startsWith(FORUM_CATEGORY_NAME_PREFIX),
	);
}

/**
 * The "diretrizes"/"guidelines" channel inside a forum category — the rules/pinned channel, shown
 * apart from the post list. Returns the first one found (a guild with several forum categories may
 * have one per category; the post-list filter excludes all of them by name regardless).
 */
export function getGuidelinesChannel(guildId: string): Channel | undefined {
	const forumCategoryIds = new Set(getForumCategories(guildId).map((category) => category.id));
	if (forumCategoryIds.size === 0) return undefined;
	return Channels.getGuildChannels(guildId).find(
		(channel) =>
			channel.type === ChannelTypes.GUILD_TEXT &&
			channel.parentId != null &&
			forumCategoryIds.has(channel.parentId) &&
			isGuidelinesChannel(channel),
	);
}

/**
 * GUILD_TEXT channels parented to a forum category, minus the guidelines channel, filtered to the
 * ones the current user can actually read — a private per-cohort forum channel the user can't see
 * must not surface in the list.
 */
export function getForumPostChannels(guildId: string): Array<Channel> {
	const forumCategoryIds = new Set(getForumCategories(guildId).map((category) => category.id));
	if (forumCategoryIds.size === 0) return [];
	return Channels.getGuildChannels(guildId).filter(
		(channel) =>
			channel.type === ChannelTypes.GUILD_TEXT &&
			channel.parentId != null &&
			forumCategoryIds.has(channel.parentId) &&
			!isGuidelinesChannel(channel) &&
			canViewChannel(channel.id),
	);
}

/**
 * The "author" of a forum post — a forum post is a channel, so its author is whoever owns it.
 * `ownerId` is filled by the "Nova postagem" flow when it creates the channel; for channels created
 * by hand it falls back to the first member (not role) permission-overwrite that grants
 * MANAGE_CHANNELS, which is what that flow also sets. Returns null when neither is present.
 */
export function getForumPostAuthorId(channel: Channel): string | null {
	if (channel.ownerId) return channel.ownerId;
	for (const overwrite of Object.values(channel.permissionOverwrites)) {
		if (
			overwrite.type === ChannelOverwriteTypes.MEMBER &&
			(overwrite.allow & Permissions.MANAGE_CHANNELS) === Permissions.MANAGE_CHANNELS
		) {
			return overwrite.id;
		}
	}
	return null;
}

/**
 * True for a forum category and every channel inside it. The sidebar filters these out of the raw
 * channel list so the forum is reached only through the "Forum" item / the /forum route; the
 * channels stay fully accessible by URL, which is how opening a post works.
 */
export function isForumHiddenChannel(guildId: string, channel: Channel): boolean {
	const forumCategories = getForumCategories(guildId);
	if (forumCategories.length === 0) return false;
	if (channel.type === ChannelTypes.GUILD_CATEGORY) {
		return forumCategories.some((category) => category.id === channel.id);
	}
	return channel.parentId != null && forumCategories.some((category) => category.id === channel.parentId);
}
