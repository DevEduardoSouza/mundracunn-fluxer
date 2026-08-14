// SPDX-License-Identifier: AGPL-3.0-or-later

import {Message} from '@app/features/messaging/models/MessagingMessage';
import type {Message as WireMessage} from '@fluxer/schema/src/domains/message/MessageResponseSchemas';
import {makeAutoObservable} from 'mobx';

class SocialHome {
	posts: Array<Message> = [];
	fetched = false;
	isLoading = false;
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

	getHasMore(): boolean {
		return this.hasMore;
	}

	getError(): string | null {
		return this.error;
	}

	reset(): void {
		this.posts = [];
		this.fetched = false;
		this.isLoading = false;
		this.hasMore = true;
		this.error = null;
	}

	setLoading(isLoading: boolean): void {
		this.isLoading = isLoading;
	}

	setError(error: string | null): void {
		this.error = error;
		this.isLoading = false;
	}

	setPosts(messages: ReadonlyArray<WireMessage>, options: {append: boolean} = {append: false}): void {
		const parsed = messages.map((message) => new Message(message, {missingReactions: 'preserve'}));
		this.posts = options.append ? [...this.posts, ...parsed] : parsed;
		this.hasMore = messages.length > 0;
		this.fetched = true;
		this.isLoading = false;
		this.error = null;
	}
}

export default new SocialHome();
