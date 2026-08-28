// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {
	DEFAULT_FORUM_INACTIVE_DAYS,
	getClassInactiveDays,
	getLastActivityAt,
	isInactive,
} from '@app/features/forum/utils/ForumActivity';
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

/**
 * Per-user override for the class-wide "hide inactive posts" window. `null` (the default) follows
 * whatever the forum category's topic configures; a number overrides it, and 0 shows every post.
 */
export type ForumInactiveDaysOverride = number | null;

/** Windows offered in the "Sort & view" menu, besides "follow the class default". */
export const FORUM_INACTIVE_DAYS_OPTIONS: ReadonlyArray<number> = [0, 3, 7, 30];

interface ForumPrefs {
	viewMode: ForumViewMode;
	sortBy: ForumSortBy;
	inactiveDays: ForumInactiveDaysOverride;
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
	inactiveDaysOverride: ForumInactiveDaysOverride = null;
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

	getInactiveDays(): number {
		return this.inactiveDays;
	}

	getInactiveDaysOverride(): ForumInactiveDaysOverride {
		return this.inactiveDaysOverride;
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
					lastActivityAt: getLastActivityAt(channel),
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
	 * The inactivity window actually in force: the user's own override when they picked one in the
	 * "Sort & view" menu, otherwise whatever the forum category's topic configures (7 days by
	 * default). 0 means "don't hide anything".
	 */
	get inactiveDays(): number {
		if (this.inactiveDaysOverride != null) return this.inactiveDaysOverride;
		const guildId = this.guildId;
		return guildId ? getClassInactiveDays(guildId) : DEFAULT_FORUM_INACTIVE_DAYS;
	}

	/**
	 * Posts split by the inactivity rule. `Date.now()` is read once per recomputation rather than
	 * ticked on a timer: the split only has to be right when the list is (re)built, and any message
	 * anywhere in the forum already invalidates this computed through the channel's `lastMessageId`.
	 */
	private get postsByActivity(): {active: ReadonlyArray<ForumPost>; older: ReadonlyArray<ForumPost>} {
		const days = this.inactiveDays;
		const posts = this.allPosts;
		if (days <= 0) return {active: posts, older: []};
		const now = Date.now();
		const active: Array<ForumPost> = [];
		const older: Array<ForumPost> = [];
		for (const post of posts) {
			(isInactive(post.channel, days, now) ? older : active).push(post);
		}
		return {active, older};
	}

	/** Posts shown in the main list — everything still inside the inactivity window. */
	get activePosts(): ReadonlyArray<ForumPost> {
		return this.postsByActivity.active;
	}

	/** Posts behind the collapsed "Postagens mais antigas" heading. Nothing is ever deleted. */
	get olderPosts(): ReadonlyArray<ForumPost> {
		return this.postsByActivity.older;
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

	/** `null` goes back to following the class default configured in the category topic. */
	setInactiveDaysOverride(days: ForumInactiveDaysOverride): void {
		this.inactiveDaysOverride = days;
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
		this.inactiveDaysOverride =
			typeof stored?.inactiveDays === 'number' && Number.isFinite(stored.inactiveDays) && stored.inactiveDays >= 0
				? stored.inactiveDays
				: null;
	}

	private persistPrefs(): void {
		if (!this.prefsUserId) return;
		AppStorage.setJSON<ForumPrefs>(prefsStorageKey(this.prefsUserId), {
			viewMode: this.viewMode,
			sortBy: this.sortBy,
			inactiveDays: this.inactiveDaysOverride,
		});
	}

	/** Clears the open-guild state; keeps the persisted view preferences. */
	reset(): void {
		this.guildId = null;
		this.query = '';
	}
}

export default new Forum();
