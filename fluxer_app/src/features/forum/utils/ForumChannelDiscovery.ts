// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import Channels from '@app/features/channel/state/Channels';
import type {GuildRole} from '@app/features/guild/models/GuildRole';
import Guilds from '@app/features/guild/state/Guilds';
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
const STUDENT_ROLE_NAMES: ReadonlySet<string> = new Set(['aluno', 'alunos', 'estudante', 'estudantes', 'student', 'students']);
const FORUM_CHANNEL_VIEW_PERMISSIONS = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;
/**
 * Marker a class owner can drop anywhere in a forum category's topic to switch on the "one post per
 * student" rule (the Artwod class uses it). Matched accent-insensitively against the raw topic.
 */
const SINGLE_POST_RULE_MARKERS: ReadonlyArray<string> = ['uma-postagem-por-aluno', 'one-post-per-student'];

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
 * The class's "student" role, matched by normalized name (same technique as the category). Used to
 * add a `deny MANAGE_CHANNELS` overwrite when a student creates a post, so only the post's author
 * (and staff) can rename/delete it. Returns undefined when the class has no such role — the caller
 * then just skips that overwrite.
 */
export function getStudentRole(guildId: string): GuildRole | undefined {
	return Guilds.getGuildRoles(guildId).find((role) => STUDENT_ROLE_NAMES.has(normalizeChannelName(role.name)));
}

/**
 * Where a class writes the forum's configuration markers.
 *
 * The natural place is the forum category's topic. Upstream Fluxer's category serializer
 * (`serializeGuildCategoryChannel` in fluxer_api/src/api/channel/ChannelMappers.ts) omits `topic`,
 * so `category.topic` was always undefined on the client; the fork's API now sends it (one-line
 * change there, candidate for an upstream PR). The guidelines channel is a GUILD_TEXT whose topic
 * has always been serialized, so it is scanned as well: a class can keep the markers in either
 * place, and one written in `#diretrizes` keeps working against an unpatched API.
 */
function getForumConfigTopics(guildId: string): Array<string> {
	const topics = getForumCategories(guildId).map((category) => category.topic ?? '');
	const guidelines = getGuidelinesChannel(guildId);
	if (guidelines?.topic) topics.push(guidelines.topic);
	return topics.filter((topic) => topic.length > 0);
}

/** Whether the class opts into the "one post per student" rule via a forum configuration topic. */
export function isSinglePostRuleEnabled(guildId: string): boolean {
	return getForumConfigTopics(guildId).some((raw) => {
		const topic = normalizeChannelName(raw);
		return SINGLE_POST_RULE_MARKERS.some((marker) => topic.includes(marker));
	});
}

/** The raw topics ForumActivity scans for the `inativas: Nd` marker. */
export function getForumConfigTopicList(guildId: string): ReadonlyArray<string> {
	return getForumConfigTopics(guildId);
}

/** The forum post channel the given user already owns in this guild, if any (used by the rule above). */
export function findOwnForumPostChannel(guildId: string, userId: string): Channel | undefined {
	return getForumPostChannels(guildId).find((channel) => getForumPostAuthorId(channel) === userId);
}

/** Whether the current user may rename/delete this forum post — MANAGE_CHANNELS on the channel (author or staff). */
export function canManageForumPost(channelId: string): boolean {
	return ((Permission.getChannelPermissions(channelId) ?? 0n) & Permissions.MANAGE_CHANNELS) === Permissions.MANAGE_CHANNELS;
}

/**
 * Whether the current user may create a post in a forum category — needs MANAGE_CHANNELS on the
 * category (the class owner grants it to the student role there so the create-with-overwrites call
 * is allowed; staff have it guild-wide). Without it the API answers 403, so the button is hidden.
 */
export function canCreateForumPostInCategory(categoryId: string): boolean {
	return (
		((Permission.getChannelPermissions(categoryId) ?? 0n) & Permissions.MANAGE_CHANNELS) === Permissions.MANAGE_CHANNELS
	);
}

/**
 * Whether a channel is a forum post (a text channel under a forum category, not the guidelines
 * channel). Unlike {@link getForumPostChannels} this doesn't filter by view permission — the caller
 * already has the channel — so it's safe to use from the channel header.
 */
export function isForumPostChannel(guildId: string, channel: Channel): boolean {
	if (channel.type !== ChannelTypes.GUILD_TEXT || channel.parentId == null) return false;
	if (isGuidelinesChannel(channel)) return false;
	return getForumCategories(guildId).some((category) => category.id === channel.parentId);
}

/**
 * The guidelines channel is a rules panel, not a conversation: reading it as a raw chat shows a
 * single message in an otherwise empty channel, and the forum page already renders that message as
 * its banner. So a visitor who lands on the channel by URL is sent to the forum instead — unless
 * they can post there, since whoever writes the rules still needs the real channel to edit them.
 *
 * A client-side routing nudge, exactly like social_home's shouldRedirectAwayFromRawStoriesChannel:
 * nothing here changes permissions, which is what actually gates access.
 */
export function shouldRedirectAwayFromRawGuidelinesChannel(guildId: string, channelId: string): boolean {
	const channel = Channels.getChannel(channelId);
	if (!channel || !isGuidelinesChannel(channel)) return false;
	const guidelinesChannel = getGuidelinesChannel(guildId);
	if (!guidelinesChannel || guidelinesChannel.id !== channelId) return false;
	const permissions = Permission.getChannelPermissions(channelId) ?? 0n;
	return (permissions & Permissions.SEND_MESSAGES) !== Permissions.SEND_MESSAGES;
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
