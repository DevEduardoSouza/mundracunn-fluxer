// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {Message} from '@app/features/messaging/models/MessagingMessage';
import {http} from '@app/features/platform/transport/RestTransport';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {sortBySnowflakeDesc} from '@fluxer/snowflake/src/SnowflakeUtils';

/**
 * `limit` bounds the raw channel fetch, before filtering to image/video messages — so more than
 * 100 total messages (stories + comments combined) since `minId` silently truncates which stories
 * this fallback finds. Same truncation trade-off as STORY_HITS_PER_PAGE in
 * SocialHomeStoriesCommands.ts, just measured before rather than after the attachment filter.
 */
const CHANNEL_FETCH_LIMIT = 100;

function messageHasStoryAttachment(message: WireMessage): boolean {
	return (message.attachments ?? []).some((attachment) => {
		const contentType = attachment.content_type ?? '';
		return contentType.startsWith('image/') || contentType.startsWith('video/');
	});
}

/**
 * Used when the search backend isn't configured on this self-host — same fallback path as the
 * Feed (see SocialHomeFeedFallback.ts). `after: minId` fetches the channel's history starting
 * right at the 24h cutoff, instead of paginating backward from "now" like the Feed does, since
 * the Stories bar only ever shows the current window rather than an infinite-scroll list.
 */
export async function fetchStoriesByChannel(channelId: string, minId: string): Promise<Array<Message>> {
	const response = await http.get<Array<WireMessage>>(Endpoints.CHANNEL_MESSAGES(channelId), {
		query: {limit: CHANNEL_FETCH_LIMIT, after: minId, before: null, around: null},
	});
	const raw = response.body ?? [];
	const storyMessages = sortBySnowflakeDesc(raw.filter(messageHasStoryAttachment));
	return storyMessages.map((message) => new Message(message, {missingReactions: 'preserve'}));
}
