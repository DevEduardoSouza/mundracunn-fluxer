// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Keeps the first message seen per channel id. The search that feeds this (`has:image`,
 * `sort_order:desc`) and the fallback both hand messages newest-first, so "first" is "most recent
 * image" — the cover. Later messages for a channel already covered are dropped. Generic over the
 * message shape: only `channelId` is read.
 */
export function firstMessagePerChannel<T extends {channelId: string}>(messages: ReadonlyArray<T>): Map<string, T> {
	const byChannel = new Map<string, T>();
	for (const message of messages) {
		if (!byChannel.has(message.channelId)) {
			byChannel.set(message.channelId, message);
		}
	}
	return byChannel;
}
