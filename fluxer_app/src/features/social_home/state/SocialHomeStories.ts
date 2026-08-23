// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import AppStorage from '@app/features/platform/state/PersistentStorage';
import {compare, extractTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';
import {makeAutoObservable} from 'mobx';

const STORY_WINDOW_MS = 24 * 60 * 60 * 1000;
const CLOCK_TICK_MS = 60 * 1000;
const SEEN_STORAGE_KEY_PREFIX = 'social_home_stories_seen';

/**
 * See SocialHome.ts's identical field — bounds how long a self-host without a search backend
 * keeps using the per-channel fallback before the search endpoint is probed again.
 */
const SEARCH_RETRY_AFTER_MS = 5 * 60 * 1000;

type SeenByAuthor = Record<string, string>;

function seenStorageKey(guildId: string): string {
	return `${SEEN_STORAGE_KEY_PREFIX}:${guildId}`;
}

class SocialHomeStories {
	guildId: string | null = null;
	stories: Array<Message> = [];
	isLoading = false;
	isIndexing = false;
	error: string | null = null;
	nowMs = Date.now();
	searchUnavailableUntil: number | null = null;
	private seenByAuthor: SeenByAuthor = {};
	private clockInterval: ReturnType<typeof setInterval> | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	getGuildId(): string | null {
		return this.guildId;
	}

	getIsLoading(): boolean {
		return this.isLoading;
	}

	getIsIndexing(): boolean {
		return this.isIndexing;
	}

	getError(): string | null {
		return this.error;
	}

	/**
	 * Nothing is deleted server-side (CLAUDE.md: "Nada é apagado do servidor"). The 24h window is
	 * a display-only filter re-evaluated against `nowMs`, which the clock advances every minute so
	 * a story ages out of the bar on its own, without needing a refetch.
	 */
	getVisibleStories(): ReadonlyArray<Message> {
		const cutoff = this.nowMs - STORY_WINDOW_MS;
		return this.stories.filter((story) => extractTimestamp(story.id) >= cutoff);
	}

	/**
	 * The id of the newest story this viewer has already watched from `authorId`, or null if none.
	 * Distinct from {@link isAuthorSeen}, which only answers "is the whole group caught up" — the
	 * viewer needs the boundary itself so it can resume at the first unwatched story instead of
	 * replaying the group from the beginning.
	 */
	getLastSeenStoryId(authorId: string): string | null {
		return this.seenByAuthor[authorId] ?? null;
	}

	isAuthorSeen(authorId: string, latestStoryId: string): boolean {
		const lastSeenId = this.seenByAuthor[authorId];
		return lastSeenId != null && compare(lastSeenId, latestStoryId) >= 0;
	}

	isSearchUnavailable(): boolean {
		return this.searchUnavailableUntil != null && Date.now() < this.searchUnavailableUntil;
	}

	markSearchUnavailable(): void {
		this.searchUnavailableUntil = Date.now() + SEARCH_RETRY_AFTER_MS;
	}

	startClock(): void {
		if (this.clockInterval != null) return;
		this.clockInterval = setInterval(() => {
			this.nowMs = Date.now();
		}, CLOCK_TICK_MS);
	}

	stopClock(): void {
		if (this.clockInterval == null) return;
		clearInterval(this.clockInterval);
		this.clockInterval = null;
	}

	reset(): void {
		this.guildId = null;
		this.stories = [];
		this.isLoading = false;
		this.isIndexing = false;
		this.error = null;
	}

	setGuildId(guildId: string): void {
		this.guildId = guildId;
		this.seenByAuthor = AppStorage.getJSON<SeenByAuthor>(seenStorageKey(guildId), {}) ?? {};
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

	setStories(stories: ReadonlyArray<Message>): void {
		this.stories = [...stories];
		this.nowMs = Date.now();
		this.isLoading = false;
		this.isIndexing = false;
		this.error = null;
	}

	markAuthorSeen(authorId: string, latestStoryId: string): void {
		if (this.guildId == null || this.isAuthorSeen(authorId, latestStoryId)) return;
		this.seenByAuthor = {...this.seenByAuthor, [authorId]: latestStoryId};
		AppStorage.setJSON(seenStorageKey(this.guildId), this.seenByAuthor);
	}
}

export default new SocialHomeStories();
