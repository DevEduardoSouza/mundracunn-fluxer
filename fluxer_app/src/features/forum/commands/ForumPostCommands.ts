// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import * as ChannelCommands from '@app/features/channel/commands/ChannelCommands';
import {getStudentRole} from '@app/features/forum/utils/ForumChannelDiscovery';
import {forumChannelNameFromTitle, serializeForumTopic} from '@app/features/forum/utils/ForumTopic';
import * as MessageCommands from '@app/features/messaging/commands/MessageCommands';
import {Message} from '@app/features/messaging/models/MessagingMessage';
import * as NavigationCommands from '@app/features/navigation/commands/NavigationCommands';
import {http} from '@app/features/platform/transport/RestTransport';
import {ChannelOverwriteTypes, ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';

interface ForumOverwrite {
	id: string;
	type: 0 | 1;
	allow: string;
	deny: string;
}

const MANAGE_CHANNELS_BIT = Permissions.MANAGE_CHANNELS.toString();

/**
 * Overwrites that make a student the sole editor of their own post:
 *  - the author (MEMBER) gets `allow MANAGE_CHANNELS` — they can rename/delete it;
 *  - the "student" role (ROLE) gets `deny MANAGE_CHANNELS` — every other student can still read and
 *    comment, but can't touch the post. Staff keep their guild-level permission.
 * If the class has no student role, the deny is simply omitted.
 */
function buildForumPostOverwrites(guildId: string, authorId: string): Array<ForumOverwrite> {
	const overwrites: Array<ForumOverwrite> = [
		{id: authorId, type: ChannelOverwriteTypes.MEMBER, allow: MANAGE_CHANNELS_BIT, deny: '0'},
	];
	const studentRole = getStudentRole(guildId);
	if (studentRole && studentRole.id !== authorId) {
		overwrites.push({id: studentRole.id, type: ChannelOverwriteTypes.ROLE, allow: '0', deny: MANAGE_CHANNELS_BIT});
	}
	return overwrites;
}

async function sendFirstMessage(channelId: string, content: string): Promise<void> {
	const trimmed = content.trim();
	if (trimmed.length === 0) return;
	const nonce = SnowflakeUtils.fromTimestamp(Date.now());
	if (!MessageCommands.reserveSend(channelId, nonce)) return;
	await MessageCommands.send(channelId, {content: trimmed, nonce, hasAttachments: false});
}

export interface CreateForumPostParams {
	guildId: string;
	categoryId: string;
	authorId: string;
	title: string;
	description: string;
	tags: ReadonlyArray<string>;
}

/**
 * One flow: create the post channel with the right permissions, write the pretty title + tags into
 * its topic, send the first message (the description, or the title if no description), then drop the
 * author into the channel.
 *
 * Depends on the backend allowing a student to create a channel inside a forum category — without
 * that companion change the API answers 403 here.
 */
export async function createForumPost(params: CreateForumPostParams): Promise<void> {
	const channel = await ChannelCommands.create(params.guildId, {
		name: forumChannelNameFromTitle(params.title),
		type: ChannelTypes.GUILD_TEXT,
		parent_id: params.categoryId,
		permission_overwrites: buildForumPostOverwrites(params.guildId, params.authorId),
	});
	// `topic` isn't accepted by the create endpoint, so it's a second call.
	await ChannelCommands.update(channel.id, {
		topic: serializeForumTopic({title: params.title, tags: params.tags}),
	});
	await sendFirstMessage(channel.id, params.description.trim().length > 0 ? params.description : params.title);
	NavigationCommands.selectChannel(params.guildId, channel.id);
}

export interface EditForumPostParams {
	title: string;
	tags: ReadonlyArray<string>;
}

/** Rename the post: channel name follows the (sanitized) title, topic keeps the pretty title + tags. */
export async function editForumPost(channelId: string, params: EditForumPostParams): Promise<void> {
	await ChannelCommands.update(channelId, {
		name: forumChannelNameFromTitle(params.title),
		topic: serializeForumTopic({title: params.title, tags: params.tags}),
	});
}

/**
 * The first (oldest) message of the guidelines channel — the "Diretrizes de Postagem" the modal
 * shows. `after: '0'` asks for messages from the beginning of the channel, oldest first.
 */
export async function fetchGuidelinesMessage(channelId: string): Promise<Message | null> {
	const response = await http.get<Array<WireMessage>>(Endpoints.CHANNEL_MESSAGES(channelId), {
		query: {limit: 1, after: '0', before: null, around: null},
	});
	const first = (response.body ?? [])[0];
	return first ? new Message(first, {missingReactions: 'preserve'}) : null;
}
