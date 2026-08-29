// SPDX-License-Identifier: AGPL-3.0-or-later

import {makeAutoObservable} from 'mobx';

/**
 * A forum post is a channel, so the "text of the post" is its first message (the "Nova postagem"
 * modal sends the description as message #1). The gallery card shows a short excerpt of it in place
 * of the cover when the post has no image. Excerpts are fetched lazily, one channel at a time as
 * cards scroll into view (see ForumExcerptCommands), and cached here keyed by channel id.
 *
 * An empty string is a valid cached value: it means "fetched, and the first message has no text"
 * (e.g. an image-only post), so the channel isn't requested again.
 */
class ForumExcerpts {
	guildId: string | null = null;
	excerpts = new Map<string, string>();
	/** Channels a fetch has been started for — in flight or done — so nothing is requested twice. */
	requested = new Set<string>();

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	getGuildId(): string | null {
		return this.guildId;
	}

	getExcerpt(channelId: string): string | undefined {
		return this.excerpts.get(channelId);
	}

	hasExcerpt(channelId: string): boolean {
		return this.excerpts.has(channelId);
	}

	wasRequested(channelId: string): boolean {
		return this.requested.has(channelId);
	}

	setGuildId(guildId: string): void {
		this.guildId = guildId;
	}

	markRequested(channelId: string): void {
		this.requested.add(channelId);
	}

	setExcerpt(channelId: string, excerpt: string): void {
		this.excerpts.set(channelId, excerpt);
	}

	reset(): void {
		this.guildId = null;
		this.excerpts = new Map();
		this.requested = new Set();
	}
}

export default new ForumExcerpts();
