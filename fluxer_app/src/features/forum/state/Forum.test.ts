// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The Forum store holds no posts of its own — it is a computed projection of the live `Channels`
 * store, which is the whole point of the design (a new message anywhere re-sorts the list with
 * nothing to fetch). So the singletons it reads are replaced wholesale (importing the real ones
 * pulls in `RuntimeConfig` and most of the state layer — same approach as
 * ForumChannelDiscovery.test.ts) and the tests drive it by editing the fake channel list.
 */

import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';
import {fromTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

const storage = new Map<string, string>();

vi.mock('@app/features/channel/state/Channels', () => ({default: {getGuildChannels: vi.fn()}}));
vi.mock('@app/features/permissions/state/Permission', () => ({
	default: {getChannelPermissions: vi.fn(() => Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY)},
}));
vi.mock('@app/features/guild/state/Guilds', () => ({default: {getGuildRoles: vi.fn(() => [])}}));
vi.mock('@app/features/messaging/state/Favorites', () => ({default: {getChannel: vi.fn(() => null)}}));
vi.mock('@app/features/read_state/state/ReadStates', () => ({
	default: {hasUnread: vi.fn(() => false), getUnreadCount: vi.fn(() => 0)},
}));
vi.mock('@app/features/platform/state/PersistentStorage', () => ({
	default: {
		getJSON: vi.fn((key: string) => {
			const raw = storage.get(key);
			return raw == null ? null : JSON.parse(raw);
		}),
		setJSON: vi.fn((key: string, value: unknown) => {
			storage.set(key, JSON.stringify(value));
		}),
	},
}));

const Channels = (await import('@app/features/channel/state/Channels')).default;
const ReadStates = (await import('@app/features/read_state/state/ReadStates')).default;
const Favorites = (await import('@app/features/messaging/state/Favorites')).default;
const Forum = (await import('@app/features/forum/state/Forum')).default;

const getGuildChannelsMock = Channels.getGuildChannels as unknown as Mock;
const hasUnreadMock = ReadStates.hasUnread as unknown as Mock;
const getUnreadCountMock = ReadStates.getUnreadCount as unknown as Mock;
const getFavoriteChannelMock = Favorites.getChannel as unknown as Mock;

const GUILD_ID = 'guild-turma-a';
const CATEGORY_ID = 'category-forum';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-28T12:00:00.000Z');

interface PostSpec {
	id: string;
	title?: string;
	tags?: ReadonlyArray<string>;
	createdDaysAgo?: number;
	lastMessageDaysAgo?: number | null;
}

function topicFor(spec: PostSpec): string | null {
	if (!spec.title && !spec.tags) return null;
	const lines = [spec.title ?? ''];
	if (spec.tags?.length) lines.push(spec.tags.map((tag) => `#${tag}`).join(' '));
	return lines.join('\n');
}

/** Seeds the fake `Channels` with one forum category plus the given posts. */
function seed(posts: ReadonlyArray<PostSpec>, options: {categoryTopic?: string | null} = {}): void {
	const channels = [
		{
			id: CATEGORY_ID,
			type: ChannelTypes.GUILD_CATEGORY,
			name: '🗂️ Fórum',
			parentId: null,
			topic: options.categoryTopic ?? null,
			permissionOverwrites: {},
		},
		...posts.map((spec) => ({
			id: fromTimestamp(NOW - (spec.createdDaysAgo ?? 0) * DAY),
			type: ChannelTypes.GUILD_TEXT,
			name: spec.id,
			parentId: CATEGORY_ID,
			topic: topicFor(spec),
			lastMessageId: spec.lastMessageDaysAgo == null ? null : fromTimestamp(NOW - spec.lastMessageDaysAgo * DAY),
			ownerId: `owner-${spec.id}`,
			permissionOverwrites: {},
		})),
	];
	getGuildChannelsMock.mockImplementation((guildId: string) => (guildId === GUILD_ID ? channels : []));
}

function titles(posts: ReadonlyArray<{title: string}>): Array<string> {
	return posts.map((post) => post.title);
}

beforeEach(() => {
	vi.useFakeTimers();
	vi.setSystemTime(NOW);
	storage.clear();
	Forum.reset();
	// The store is a singleton: detach it from whichever user a previous test loaded, so the
	// setters below don't write that user's key.
	Forum.loadPrefs('');
	Forum.setInactiveDaysOverride(0);
	Forum.setSortBy('activity');
	Forum.setViewMode('list');
	Forum.setGuildId(GUILD_ID);
});

afterEach(() => {
	vi.useRealTimers();
	vi.clearAllMocks();
});

describe('sorting', () => {
	beforeEach(() => {
		seed([
			{id: 'b', title: 'Beta', createdDaysAgo: 1, lastMessageDaysAgo: 3},
			{id: 'a', title: 'Alfa', createdDaysAgo: 5, lastMessageDaysAgo: 0},
			{id: 'c', title: 'Gama', createdDaysAgo: 0, lastMessageDaysAgo: 2},
		]);
	});

	it('puts the most recently active post first by default', () => {
		expect(Forum.getSortBy()).toBe('activity');
		expect(titles(Forum.getActivePosts())).toEqual(['Alfa', 'Gama', 'Beta']);
	});

	it('sorts by post date, newest first', () => {
		Forum.setSortBy('created');
		expect(titles(Forum.getActivePosts())).toEqual(['Gama', 'Beta', 'Alfa']);
	});

	it('sorts by title alphabetically', () => {
		Forum.setSortBy('title');
		expect(titles(Forum.getActivePosts())).toEqual(['Alfa', 'Beta', 'Gama']);
	});

	it('falls back to the creation date for a post nobody has written in', () => {
		seed([
			{id: 'quiet', title: 'Sem mensagens', createdDaysAgo: 0, lastMessageDaysAgo: null},
			{id: 'old', title: 'Com mensagem antiga', createdDaysAgo: 20, lastMessageDaysAgo: 4},
		]);
		expect(titles(Forum.getActivePosts())).toEqual(['Sem mensagens', 'Com mensagem antiga']);
	});
});

describe('reacting to a new message', () => {
	it('re-sorts when a channel gets a newer lastMessageId, with nothing to invalidate', () => {
		seed([
			{id: 'a', title: 'Alfa', lastMessageDaysAgo: 0},
			{id: 'b', title: 'Beta', lastMessageDaysAgo: 3},
		]);
		expect(titles(Forum.getActivePosts())).toEqual(['Alfa', 'Beta']);
		// What MESSAGE_CREATE does to the Channels store: Beta's lastMessageId moves to now.
		seed([
			{id: 'a', title: 'Alfa', lastMessageDaysAgo: 0.5},
			{id: 'b', title: 'Beta', lastMessageDaysAgo: 0},
		]);
		expect(titles(Forum.getActivePosts())).toEqual(['Beta', 'Alfa']);
	});
});

describe('search', () => {
	beforeEach(() => {
		seed([
			{id: 'a', title: 'Estudo de anatomia', tags: ['anatomia', 'grafite']},
			{id: 'b', title: 'Paisagem urbana', tags: ['aquarela']},
		]);
	});

	it('matches the title case-insensitively', () => {
		Forum.setQuery('ANATO');
		expect(titles(Forum.getActivePosts())).toEqual(['Estudo de anatomia']);
	});

	it('matches a tag', () => {
		Forum.setQuery('aquarela');
		expect(titles(Forum.getActivePosts())).toEqual(['Paisagem urbana']);
	});

	it('returns nothing when the query matches neither', () => {
		Forum.setQuery('escultura');
		expect(Forum.getActivePosts()).toHaveLength(0);
	});

	it('ignores surrounding whitespace and an empty query shows everything', () => {
		Forum.setQuery('   ');
		expect(Forum.getActivePosts()).toHaveLength(2);
	});
});

describe('the inactivity split', () => {
	beforeEach(() => {
		seed([
			{id: 'fresh', title: 'Ativa', lastMessageDaysAgo: 1},
			{id: 'stale', title: 'Parada', lastMessageDaysAgo: 30},
		]);
	});

	it('moves a post past the window into the older group instead of dropping it', () => {
		Forum.setInactiveDaysOverride(7);
		expect(titles(Forum.getActivePosts())).toEqual(['Ativa']);
		expect(titles(Forum.getOlderPosts())).toEqual(['Parada']);
	});

	it('keeps everything active when the rule is switched off', () => {
		Forum.setInactiveDaysOverride(0);
		expect(Forum.getActivePosts()).toHaveLength(2);
		expect(Forum.getOlderPosts()).toHaveLength(0);
	});

	it('brings an old post back the moment someone writes in it', () => {
		Forum.setInactiveDaysOverride(7);
		expect(titles(Forum.getOlderPosts())).toEqual(['Parada']);
		seed([
			{id: 'fresh', title: 'Ativa', lastMessageDaysAgo: 1},
			{id: 'stale', title: 'Parada', lastMessageDaysAgo: 0},
		]);
		expect(Forum.getOlderPosts()).toHaveLength(0);
		expect(Forum.getActivePosts()).toHaveLength(2);
	});

	it('applies the search to both groups', () => {
		Forum.setInactiveDaysOverride(7);
		Forum.setQuery('parada');
		expect(Forum.getActivePosts()).toHaveLength(0);
		expect(titles(Forum.getOlderPosts())).toEqual(['Parada']);
	});
});

describe('the inactivity window in force', () => {
	it('defaults to the class window from the category topic', () => {
		seed([{id: 'a', title: 'Alfa'}], {categoryTopic: 'inativas: 3d'});
		Forum.setInactiveDaysOverride(null);
		expect(Forum.getInactiveDays()).toBe(3);
	});

	it('lets the reader override the class window', () => {
		seed([{id: 'a', title: 'Alfa'}], {categoryTopic: 'inativas: 3d'});
		Forum.setInactiveDaysOverride(30);
		expect(Forum.getInactiveDays()).toBe(30);
	});

	it('falls back to 7 days when neither is set', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		Forum.setInactiveDaysOverride(null);
		expect(Forum.getInactiveDays()).toBe(7);
	});
});

describe('persisted preferences', () => {
	it('writes view mode, sort order and the inactivity override under the user key', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		Forum.loadPrefs('user-1');
		Forum.setViewMode('grid');
		Forum.setSortBy('title');
		Forum.setInactiveDaysOverride(3);
		expect(JSON.parse(storage.get('Forum:prefs:user-1')!)).toEqual({
			viewMode: 'grid',
			sortBy: 'title',
			inactiveDays: 3,
		});
	});

	it('restores them on the next visit', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		storage.set('Forum:prefs:user-1', JSON.stringify({viewMode: 'grid', sortBy: 'title', inactiveDays: 3}));
		Forum.loadPrefs('user-1');
		expect(Forum.getViewMode()).toBe('grid');
		expect(Forum.getSortBy()).toBe('title');
		expect(Forum.getInactiveDaysOverride()).toBe(3);
	});

	it('writes nothing before a user is known', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		Forum.setViewMode('grid');
		expect(storage.size).toBe(0);
	});

	it('keeps preferences separate per user', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		Forum.loadPrefs('user-1');
		Forum.setViewMode('grid');
		Forum.loadPrefs('user-2');
		expect(Forum.getViewMode()).toBe('grid'); // nothing stored for user-2 leaves the current value
		Forum.setViewMode('list');
		Forum.loadPrefs('user-1');
		expect(Forum.getViewMode()).toBe('grid');
	});

	it('ignores a stored value that is no longer valid', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		storage.set('Forum:prefs:user-9', JSON.stringify({viewMode: 'carousel', sortBy: 'chaos', inactiveDays: -5}));
		Forum.loadPrefs('user-9');
		expect(Forum.getViewMode()).toBe('list');
		expect(Forum.getSortBy()).toBe('activity');
		expect(Forum.getInactiveDaysOverride()).toBeNull();
	});

	it('keeps the view preferences when the page unmounts', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		Forum.loadPrefs('user-1');
		Forum.setViewMode('grid');
		Forum.setQuery('alfa');
		Forum.reset();
		expect(Forum.getViewMode()).toBe('grid');
		expect(Forum.getQuery()).toBe('');
		expect(Forum.getGuildId()).toBeNull();
	});
});

describe('what the row and the sidebar read off a post', () => {
	it('reads the title and tags out of the topic, and the name when there is no topic', () => {
		seed([{id: 'com-topic', title: 'Estudo de anatomia', tags: ['grafite']}, {id: 'sem-topic'}]);
		Forum.setSortBy('created');
		const [withTopic, withoutTopic] = [...Forum.getActivePosts()].sort((a, b) =>
			(a.channel.name ?? '').localeCompare(b.channel.name ?? ''),
		);
		expect(withTopic.title).toBe('Estudo de anatomia');
		expect(withTopic.tags).toEqual(['grafite']);
		// A channel created by hand has no topic — the raw channel name is the title.
		expect(withoutTopic.title).toBe('sem-topic');
		expect(withoutTopic.tags).toEqual([]);
	});

	it('marks a post unread and followed from the read state and favorites', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		const channelId = Forum.getGuildPostChannelIds(GUILD_ID)[0];
		hasUnreadMock.mockImplementation((id: string) => id === channelId);
		getFavoriteChannelMock.mockImplementation((id: string) => (id === channelId ? {id} : null));
		const [post] = Forum.getActivePosts();
		expect(post.unread).toBe(true);
		expect(post.isFollowed).toBe(true);
	});

	it('adds up the unread messages of every post for the sidebar badge', () => {
		seed([
			{id: 'a', title: 'Alfa'},
			{id: 'b', title: 'Beta'},
		]);
		getUnreadCountMock.mockReturnValue(3);
		expect(Forum.getGuildUnreadCount(GUILD_ID)).toBe(6);
	});

	it('has no posts at all for a guild without a forum', () => {
		seed([{id: 'a', title: 'Alfa'}]);
		Forum.setGuildId('guild-sem-forum');
		expect(Forum.getActivePosts()).toHaveLength(0);
		expect(Forum.getGuildUnreadCount('guild-sem-forum')).toBe(0);
	});
});
