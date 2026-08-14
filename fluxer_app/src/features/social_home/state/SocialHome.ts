// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {makeAutoObservable} from 'mobx';

class SocialHome {
	posts: Array<Message> = [];
	fetched = false;
	isLoading = false;
	isIndexing = false;
	hasMore = true;
	error: string | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	getPosts(): ReadonlyArray<Message> {
		return this.posts;
	}

	getFetched(): boolean {
		return this.fetched;
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

	reset(): void {
		this.posts = [];
		this.fetched = false;
		this.isLoading = false;
		this.isIndexing = false;
		this.hasMore = true;
		this.error = null;
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
		this.hasMore = messages.length > 0;
		this.fetched = true;
		this.isLoading = false;
		this.isIndexing = false;
		this.error = null;
	}
}

export default new SocialHome();
