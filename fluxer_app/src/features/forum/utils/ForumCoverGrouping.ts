// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';

/**
 * Keeps the first message seen per channel id. The search that feeds this (`has:image`,
 * `sort_order:desc`) and the fallback both hand messages newest-first, so "first" is "most recent
 * image" — the cover. Later messages for a channel already covered are dropped.
 */
export function firstMessagePerChannel(messages: ReadonlyArray<Message>): Map<string, Message> {
	const byChannel = new Map<string, Message>();
	for (const message of messages) {
		if (!byChannel.has(message.channelId)) {
			byChannel.set(message.channelId, message);
		}
	}
	return byChannel;
}
