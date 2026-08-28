// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {getForumPostAuthorId, getForumPostChannels} from '@app/features/forum/utils/ForumChannelDiscovery';
import {parseForumTopic} from '@app/features/forum/utils/ForumTopic';
import Favorites from '@app/features/messaging/state/Favorites';
import AppStorage from '@app/features/platform/state/PersistentStorage';
import ReadStates from '@app/features/read_state/state/ReadStates';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';
import {makeAutoObservable} from 'mobx';

export type ForumViewMode = 'list' | 'grid';
export type ForumSortBy = 'activity' | 'created' | 'title';

const VIEW_MODES: ReadonlySet<string> = new Set<ForumViewMode>(['list', 'grid']);
const SORT_BYS: ReadonlySet<string> = new Set<ForumSortBy>(['activity', 'created', 'title']);

interface ForumPrefs {
	viewMode: ForumViewMode;
	sortBy: ForumSortBy;
}

function prefsStorageKey(userId: string): string {
	return `Forum:prefs:${userId}`;
}

export interface ForumPost {
	channel: Channel;
	/** The "pretty" title: line 1 of the topic if set, else the sanitized channel name. */
	title: string;
	tags: ReadonlyArray<string>;
	authorId: string | null;
	createdAt: number;
	lastActivityAt: number;
	unread: boolean;
	isFollowed: boolean;
}

/**
 * The forum has no backend of its own — a post is just a forum-category channel. This store keeps
 * only view state (which guild is open, how the list is shown, the search query); the posts
 * themselves are a computed projection of the live `Channels` store, so a new message anywhere in
 * the forum (which updates that channel's `lastMessageId` via MESSAGE_CREATE) re-sorts the list on
 * its own with nothing to fetch or invalidate.
 *
 * `viewMode`/`sortBy` are per-user preferences persisted to AppStorage (localStorage) under
 * `Forum:prefs:<userId>` — {@link loadPrefs} reads them on mount, the setters write them back.
 */
class Forum {
	guildId: string | null = null;
	viewMode: ForumViewMode = 'list';
	sortBy: ForumSortBy = 'activity';
	query = '';
	private prefsUserId: string | null = null;

	constructor() {
		makeAutoObservable(this, {}, {autoBind: true});
	}

	getGuildId(): string | null {
		return this.guildId;
	}

	getViewMode(): ForumViewMode {
		return this.viewMode;
	}

	getSortBy(): ForumSortBy {
		return this.sortBy;
	}

	getQuery(): string {
		return this.query;
	}

	private get allPosts(): ReadonlyArray<ForumPost> {
		const guildId = this.guildId;
		if (!guildId) return [];
		const query = this.query.trim().toLowerCase();
		const posts = getForumPostChannels(guildId)
			.map((channel): ForumPost => {
				const id = channel.id;
				const parsed = parseForumTopic(channel.topic);
				return {
					channel,
					title: parsed.title ?? channel.name ?? '',
					tags: parsed.tags,
					authorId: getForumPostAuthorId(channel),
					createdAt: SnowflakeUtils.extractTimestamp(channel.id),
					lastActivityAt: SnowflakeUtils.extractTimestamp(channel.lastMessageId ?? channel.id),
					unread: ReadStates.hasUnread(id),
					isFollowed: Favorites.getChannel(id) != null,
				};
			})
			.filter(
				(post) =>
					query.length === 0 ||
					post.title.toLowerCase().includes(query) ||
					post.tags.some((tag) => tag.includes(query)),
			);
		const sortBy = this.sortBy;
		posts.sort((a, b) => {
			switch (sortBy) {
				case 'title':
					return a.title.localeCompare(b.title);
				case 'created':
					return b.createdAt - a.createdAt;
				default:
					return b.lastActivityAt - a.lastActivityAt;
			}
		});
		return posts;
	}

	/**
	 * Posts still shown in the main list. The "hide by inactivity" rule that moves stale posts into
	 * {@link olderPosts} lands with the "Seguir/ocultar" card — for now every post is active.
	 */
	get activePosts(): ReadonlyArray<ForumPost> {
		return this.allPosts;
	}

	/** Slot for the "Postagens mais antigas" section — populated by the "Seguir/ocultar" card. */
	get olderPosts(): ReadonlyArray<ForumPost> {
		return [];
	}

	getActivePosts(): ReadonlyArray<ForumPost> {
		return this.activePosts;
	}

	getOlderPosts(): ReadonlyArray<ForumPost> {
		return this.olderPosts;
	}

	/** Every forum post channel of a guild, unfiltered — for prefetching covers and the sidebar badge. */
	getGuildPostChannelIds(guildId: string): Array<string> {
		return getForumPostChannels(guildId).map((channel) => channel.id);
	}

	/** Sidebar badge: total unread messages across every forum post channel of a guild. */
	getGuildUnreadCount(guildId: string): number {
		return getForumPostChannels(guildId).reduce((total, channel) => total + ReadStates.getUnreadCount(channel.id), 0);
	}

	setGuildId(guildId: string): void {
		this.guildId = guildId;
	}

	setViewMode(viewMode: ForumViewMode): void {
		this.viewMode = viewMode;
		this.persistPrefs();
	}

	setSortBy(sortBy: ForumSortBy): void {
		this.sortBy = sortBy;
		this.persistPrefs();
	}

	setQuery(query: string): void {
		this.query = query;
	}

	loadPrefs(userId: string): void {
		this.prefsUserId = userId || null;
		if (!this.prefsUserId) return;
		const stored = AppStorage.getJSON<Partial<ForumPrefs>>(prefsStorageKey(this.prefsUserId));
		if (stored?.viewMode && VIEW_MODES.has(stored.viewMode)) {
			this.viewMode = stored.viewMode;
		}
		if (stored?.sortBy && SORT_BYS.has(stored.sortBy)) {
			this.sortBy = stored.sortBy;
		}
	}

	private persistPrefs(): void {
		if (!this.prefsUserId) return;
		AppStorage.setJSON<ForumPrefs>(prefsStorageKey(this.prefsUserId), {
			viewMode: this.viewMode,
			sortBy: this.sortBy,
		});
	}

	/** Clears the open-guild state; keeps the persisted view preferences. */
	reset(): void {
		this.guildId = null;
		this.query = '';
	}
}

export default new Forum();
