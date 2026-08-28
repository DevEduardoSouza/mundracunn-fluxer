// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {Message} from '@app/features/messaging/models/MessagingMessage';
import {http} from '@app/features/platform/transport/RestTransport';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {sortBySnowflakeDesc} from '@fluxer/snowflake/src/SnowflakeUtils';

/**
 * Used when the search backend isn't configured on this self-host (search responds
 * FEATURE_TEMPORARILY_DISABLED — see CLAUDE.md section 6.1). Fetches a small slice of each forum
 * channel's recent history directly and takes the newest image message as the cover. Same shape and
 * image filter as social_home's SocialHomeFeedFallback — copied, not imported, so the features stay
 * decoupled. Called lazily, one channel at a time, as cards scroll into view.
 */

const CHANNEL_FETCH_LIMIT = 20;

function messageHasImageAttachment(message: WireMessage): boolean {
	return (message.attachments ?? []).some((attachment) => (attachment.content_type ?? '').startsWith('image/'));
}

async function fetchChannelCover(channelId: string): Promise<readonly [string, Message] | null> {
	const response = await http.get<Array<WireMessage>>(Endpoints.CHANNEL_MESSAGES(channelId), {
		query: {limit: CHANNEL_FETCH_LIMIT, before: null, after: null, around: null},
	});
	const raw = response.body ?? [];
	const newestImage = sortBySnowflakeDesc(raw).find(messageHasImageAttachment);
	if (!newestImage) return null;
	return [channelId, new Message(newestImage, {missingReactions: 'preserve'})];
}

export async function fetchCoversByChannel(channelIds: ReadonlyArray<string>): Promise<Map<string, Message>> {
	const results = await Promise.all(channelIds.map((channelId) => fetchChannelCover(channelId)));
	const byChannel = new Map<string, Message>();
	for (const entry of results) {
		if (entry) {
			byChannel.set(entry[0], entry[1]);
		}
	}
	return byChannel;
}
