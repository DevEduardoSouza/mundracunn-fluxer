// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import {Message} from '@app/features/messaging/models/MessagingMessage';
import {http} from '@app/features/platform/transport/RestTransport';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {sortBySnowflakeDesc} from '@fluxer/snowflake/src/SnowflakeUtils';

const CHANNEL_FETCH_LIMIT = 50;

export interface FeedFetchResult {
	messages: Array<Message>;
	hasMore: boolean;
}

function messageHasImageAttachment(message: WireMessage): boolean {
	return (message.attachments ?? []).some((attachment) => (attachment.content_type ?? '').startsWith('image/'));
}

interface ChannelFetchResult {
	imageMessages: Array<WireMessage>;
	rawCount: number;
}

async function fetchChannelImageMessages(channelId: string, before: string | undefined): Promise<ChannelFetchResult> {
	const response = await http.get<Array<WireMessage>>(Endpoints.CHANNEL_MESSAGES(channelId), {
		query: {limit: CHANNEL_FETCH_LIMIT, before: before ?? null, after: null, around: null},
	});
	const raw = response.body ?? [];
	return {imageMessages: raw.filter(messageHasImageAttachment), rawCount: raw.length};
}

/**
 * Used when the search backend isn't configured on this self-host (no Meilisearch/Elasticsearch —
 * see CLAUDE.md section 6.1). Fetches each Sketchbook/professor channel's recent history directly
 * and filters for image attachments client-side — more requests than the search-backed path, but
 * returns the same FeedFetchResult shape so SocialHomeCommands can swap providers transparently.
 */
export async function fetchFeedByChannel(
	channelIds: ReadonlyArray<string>,
	before: string | undefined,
): Promise<FeedFetchResult> {
	const perChannelResults = await Promise.all(
		channelIds.map((channelId) => fetchChannelImageMessages(channelId, before)),
	);
	const merged = sortBySnowflakeDesc(perChannelResults.flatMap((result) => result.imageMessages));
	return {
		messages: merged.map((message) => new Message(message, {missingReactions: 'preserve'})),
		hasMore: perChannelResults.some((result) => result.rawCount === CHANNEL_FETCH_LIMIT),
	};
}
