// SPDX-License-Identifier: AGPL-3.0-or-later

import {makeAutoObservable} from 'mobx';

class SocialHomeStoryComments {
	isOpen = false;
	storyId: string | null = null;
	channelId: string | null = null;
	upperBoundStoryId: string | null = null;
	/** `after` cursor for the next page fetch; starts at the story's own id. */
	cursorId: string | null = null;
	isLoadingInitial = false;
	isLoadingMore = false;
	error: string | null = null;
	hasMore = true;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	getIsOpen(): boolean {
		return this.isOpen;
	}

	getStoryId(): string | null {
		return this.storyId;
	}

	getChannelId(): string | null {
		return this.channelId;
	}

	getUpperBoundStoryId(): string | null {
		return this.upperBoundStoryId;
	}

	getCursorId(): string | null {
		return this.cursorId;
	}

	getIsLoadingInitial(): boolean {
		return this.isLoadingInitial;
	}

	getIsLoadingMore(): boolean {
		return this.isLoadingMore;
	}

	getError(): string | null {
		return this.error;
	}

	getHasMore(): boolean {
		return this.hasMore;
	}

	isActive(storyId: string, channelId: string): boolean {
		return this.isOpen && this.storyId === storyId && this.channelId === channelId;
	}

	open(storyId: string, channelId: string, upperBoundStoryId: string | null): void {
		this.isOpen = true;
		this.storyId = storyId;
		this.channelId = channelId;
		this.upperBoundStoryId = upperBoundStoryId;
		this.cursorId = storyId;
		this.hasMore = true;
		this.error = null;
		this.isLoadingInitial = false;
		this.isLoadingMore = false;
	}

	close(): void {
		this.isOpen = false;
		this.storyId = null;
		this.channelId = null;
		this.upperBoundStoryId = null;
		this.cursorId = null;
		this.hasMore = true;
		this.error = null;
		this.isLoadingInitial = false;
		this.isLoadingMore = false;
	}

	setLoadingInitial(isLoading: boolean): void {
		this.isLoadingInitial = isLoading;
		if (isLoading) this.error = null;
	}

	setLoadingMore(isLoading: boolean): void {
		this.isLoadingMore = isLoading;
		if (isLoading) this.error = null;
	}

	setError(error: string): void {
		this.error = error;
		this.isLoadingInitial = false;
		this.isLoadingMore = false;
	}

	advanceCursor(cursorId: string, hasMore: boolean): void {
		this.cursorId = cursorId;
		this.hasMore = hasMore;
		this.isLoadingInitial = false;
		this.isLoadingMore = false;
		this.error = null;
	}
}

export default new SocialHomeStoryComments();
