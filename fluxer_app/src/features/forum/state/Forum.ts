// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {getForumPostChannels} from '@app/features/forum/utils/ForumChannelDiscovery';
import Favorites from '@app/features/messaging/state/Favorites';
import ReadStates from '@app/features/read_state/state/ReadStates';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';
import {makeAutoObservable} from 'mobx';

export type ForumViewMode = 'list' | 'grid';
export type ForumSortBy = 'activity' | 'title';

export interface ForumPost {
	channel: Channel;
	title: string;
	topic: string | null;
	lastActivityAt: number;
	unread: boolean;
	isFollowed: boolean;
}

/**
 * The forum has no backend of its own — a post is just a forum-category channel. This store keeps
 * only the view state (which guild is open, how the list is shown, the search query); the posts
 * themselves are a computed projection of the live `Channels` store, so a new message anywhere in
 * the forum (which updates that channel's `lastMessageId` via MESSAGE_CREATE) re-sorts the list on
 * its own with nothing to fetch or invalidate.
 */
class Forum {
	guildId: string | null = null;
	viewMode: ForumViewMode = 'list';
	sortBy: ForumSortBy = 'activity';
	query = '';

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

	get posts(): ReadonlyArray<ForumPost> {
		const guildId = this.guildId;
		if (!guildId) return [];
		const query = this.query.trim().toLowerCase();
		const posts = getForumPostChannels(guildId)
			.map((channel): ForumPost => {
				const id = channel.id;
				return {
					channel,
					title: channel.name ?? '',
					topic: channel.topic,
					lastActivityAt: SnowflakeUtils.extractTimestamp(channel.lastMessageId ?? channel.id),
					unread: ReadStates.hasUnread(id),
					isFollowed: Favorites.getChannel(id) != null,
				};
			})
			.filter(
				(post) =>
					query.length === 0 ||
					post.title.toLowerCase().includes(query) ||
					(post.topic ?? '').toLowerCase().includes(query),
			);
		posts.sort((a, b) =>
			this.sortBy === 'title' ? a.title.localeCompare(b.title) : b.lastActivityAt - a.lastActivityAt,
		);
		return posts;
	}

	getPosts(): ReadonlyArray<ForumPost> {
		return this.posts;
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
	}

	setSortBy(sortBy: ForumSortBy): void {
		this.sortBy = sortBy;
	}

	setQuery(query: string): void {
		this.query = query;
	}

	reset(): void {
		this.guildId = null;
		this.viewMode = 'list';
		this.sortBy = 'activity';
		this.query = '';
	}
}

export default new Forum();
