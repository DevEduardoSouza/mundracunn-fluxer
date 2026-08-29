// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {makeAutoObservable} from 'mobx';

/**
 * How long the fallback stays in effect after the search backend reports itself unavailable, before
 * the search endpoint is probed again. Same value and reasoning as SocialHome's — see that store.
 */
const SEARCH_RETRY_AFTER_MS = 5 * 60 * 1000;

/**
 * The cover of a forum post is the most recent image posted in its channel. Covers are fetched
 * separately from the post list (which is instant — it's just channels): one batched search when
 * Meilisearch is up, lazy per-channel history requests when it isn't. This store is the cache both
 * paths write into, keyed by channel id.
 */
class ForumCovers {
	guildId: string | null = null;
	covers = new Map<string, Message>();
	/** Channels a fetch has already been attempted for — so a channel with genuinely no image isn't re-requested. */
	requested = new Set<string>();
	isLoading = false;
	isIndexing = false;
	searchUnavailableUntil: number | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	getGuildId(): string | null {
		return this.guildId;
	}

	getCover(channelId: string): Message | undefined {
		return this.covers.get(channelId);
	}

	hasCover(channelId: string): boolean {
		return this.covers.has(channelId);
	}

	wasRequested(channelId: string): boolean {
		return this.requested.has(channelId);
	}

	getIsLoading(): boolean {
		return this.isLoading;
	}

	getIsIndexing(): boolean {
		return this.isIndexing;
	}

	setGuildId(guildId: string): void {
		this.guildId = guildId;
	}

	setLoading(isLoading: boolean): void {
		this.isLoading = isLoading;
		if (isLoading) {
			this.isIndexing = false;
		}
	}

	/**
	 * The search API answers `indexing` while a never-indexed channel (any new post) is being indexed.
	 * While true, covers come from the per-channel fallback (see ForumCoverCommands) until a retry of
	 * the search succeeds.
	 */
	setIndexing(isIndexing = true): void {
		this.isIndexing = isIndexing;
		if (isIndexing) {
			this.isLoading = false;
		}
	}

	markRequested(channelIds: Iterable<string>): void {
		for (const channelId of channelIds) {
			this.requested.add(channelId);
		}
	}

	setCovers(entries: ReadonlyArray<readonly [string, Message]>): void {
		for (const [channelId, message] of entries) {
			this.covers.set(channelId, message);
		}
	}

	isSearchUnavailable(): boolean {
		return this.searchUnavailableUntil != null && Date.now() < this.searchUnavailableUntil;
	}

	/**
	 * Deliberately not cleared by {@link reset} (same as SocialHome): reset runs on every guild
	 * switch, so clearing it there would re-probe a search backend known to be down on every
	 * navigation. The TTL bounds the fallback instead.
	 */
	markSearchUnavailable(): void {
		this.searchUnavailableUntil = Date.now() + SEARCH_RETRY_AFTER_MS;
	}

	reset(): void {
		this.guildId = null;
		this.covers = new Map();
		this.requested = new Set();
		this.isLoading = false;
		this.isIndexing = false;
	}
}

export default new ForumCovers();
