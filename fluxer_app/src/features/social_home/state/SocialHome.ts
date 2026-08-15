// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {makeAutoObservable} from 'mobx';

/**
 * How long the per-channel fallback stays in effect after the search backend reports itself
 * unavailable, before the search endpoint is probed again.
 */
const SEARCH_RETRY_AFTER_MS = 5 * 60 * 1000;

class SocialHome {
	guildId: string | null = null;
	posts: Array<Message> = [];
	isLoading = false;
	isIndexing = false;
	hasMore = true;
	error: string | null = null;
	searchUnavailableUntil: number | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	getGuildId(): string | null {
		return this.guildId;
	}

	getPosts(): ReadonlyArray<Message> {
		return this.posts;
	}

	getIsLoading(): boolean {
		return this.isLoading;
	}

	getIsIndexing(): boolean {
		return this.isIndexing;
	}

	getHasMore(): boolean {
		return this.hasMore;
	}

	getError(): string | null {
		return this.error;
	}

	getOldestPostId(): string | null {
		return this.posts.length > 0 ? this.posts[this.posts.length - 1]!.id : null;
	}

	isSearchUnavailable(): boolean {
		return this.searchUnavailableUntil != null && Date.now() < this.searchUnavailableUntil;
	}

	/**
	 * Deliberately not cleared by {@link reset}: reset runs on every guild switch, so clearing it
	 * there would re-probe a search backend that is known to be down on every navigation. The TTL
	 * bounds the fallback instead, so a search service that comes back is picked up on its own.
	 */
	markSearchUnavailable(): void {
		this.searchUnavailableUntil = Date.now() + SEARCH_RETRY_AFTER_MS;
	}

	reset(): void {
		this.guildId = null;
		this.posts = [];
		this.isLoading = false;
		this.isIndexing = false;
		this.hasMore = true;
		this.error = null;
	}

	setGuildId(guildId: string): void {
		this.guildId = guildId;
	}

	setLoading(isLoading: boolean): void {
		this.isLoading = isLoading;
		if (isLoading) {
			this.isIndexing = false;
			this.error = null;
		}
	}

	setIndexing(): void {
		this.isIndexing = true;
		this.isLoading = false;
		this.error = null;
	}

	setError(error: string): void {
		this.error = error;
		this.isLoading = false;
		this.isIndexing = false;
	}

	setPosts(messages: ReadonlyArray<Message>, options: {append: boolean} = {append: false}): void {
		this.posts = options.append ? [...this.posts, ...messages] : [...messages];
		this.isLoading = false;
		this.isIndexing = false;
		this.error = null;
	}

	setHasMore(hasMore: boolean): void {
		this.hasMore = hasMore;
	}
}

export default new SocialHome();
