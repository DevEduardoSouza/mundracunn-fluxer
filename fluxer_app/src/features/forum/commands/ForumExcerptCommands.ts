// SPDX-License-Identifier: AGPL-3.0-or-later

import {Endpoints} from '@app/features/app/constants/Endpoints';
import ForumExcerpts from '@app/features/forum/state/ForumExcerpts';
import {excerptFromContent} from '@app/features/forum/utils/ForumExcerpt';
import {http} from '@app/features/platform/transport/RestTransport';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';

/**
 * Cards scroll into view in bursts (a whole grid row at once, a full screen on first paint), so
 * excerpt requests go through a small queue instead of firing all at the same time.
 */
const MAX_CONCURRENT_FETCHES = 3;

let inFlight = 0;
const queue: Array<() => void> = [];

function acquireSlot(): Promise<void> {
	if (inFlight < MAX_CONCURRENT_FETCHES) {
		inFlight++;
		return Promise.resolve();
	}
	return new Promise((resolve) => {
		queue.push(() => {
			inFlight++;
			resolve();
		});
	});
}

function releaseSlot(): void {
	inFlight--;
	queue.shift()?.();
}

/**
 * The first (oldest) message of the post channel. `after: '0'` asks for messages from the beginning
 * of the channel, oldest first — same call ForumPostCommands.fetchGuidelinesMessage makes.
 */
async function fetchFirstMessageContent(channelId: string): Promise<string> {
	const response = await http.get<Array<WireMessage>>(Endpoints.CHANNEL_MESSAGES(channelId), {
		query: {limit: 1, after: '0', before: null, around: null},
	});
	const first = (response.body ?? [])[0];
	return excerptFromContent(first?.content);
}

function isStale(guildId: string): boolean {
	return ForumExcerpts.getGuildId() !== guildId;
}

/**
 * Fetch one post's excerpt if it hasn't been tried yet. Driven by an IntersectionObserver on each
 * gallery card ({@link useForumExcerptLazyLoad}). Switching guilds resets the cache: the first call
 * for a new guild throws away the previous guild's excerpts.
 */
export async function ensureExcerptLazy(guildId: string, channelId: string): Promise<void> {
	if (isStale(guildId)) {
		ForumExcerpts.reset();
		ForumExcerpts.setGuildId(guildId);
	}
	if (ForumExcerpts.hasExcerpt(channelId) || ForumExcerpts.wasRequested(channelId)) return;
	ForumExcerpts.markRequested(channelId);
	await acquireSlot();
	try {
		if (isStale(guildId)) return;
		const excerpt = await fetchFirstMessageContent(channelId);
		if (isStale(guildId)) return;
		ForumExcerpts.setExcerpt(channelId, excerpt);
	} catch (error) {
		// A card without an excerpt is just a card with a title — nothing to surface to the user.
		console.warn('[forum] excerpt fetch failed', channelId, error);
	} finally {
		releaseSlot();
	}
}
