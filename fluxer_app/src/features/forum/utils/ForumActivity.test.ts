// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `getClassInactiveDays` reaches `getForumCategories`, which reads the real `Channels` singleton;
 * importing that for real pulls in `RuntimeConfig` and most of the state layer, so it is replaced
 * wholesale — same approach as ForumChannelDiscovery.test.ts. Everything else here is pure.
 */

import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

vi.mock('@app/features/channel/state/Channels', () => ({default: {getGuildChannels: vi.fn()}}));
vi.mock('@app/features/permissions/state/Permission', () => ({default: {getChannelPermissions: vi.fn()}}));
vi.mock('@app/features/guild/state/Guilds', () => ({default: {getGuildRoles: vi.fn(() => [])}}));

const Channels = (await import('@app/features/channel/state/Channels')).default;
const {DEFAULT_FORUM_INACTIVE_DAYS, getClassInactiveDays, getLastActivityAt, isInactive, parseInactiveDaysFromTopic} =
	await import('@app/features/forum/utils/ForumActivity');

const getGuildChannelsMock = Channels.getGuildChannels as unknown as Mock;

const GUILD_ID = 'guild-turma-a';
const DAY = 24 * 60 * 60 * 1000;
const NOW = Date.parse('2026-08-28T12:00:00.000Z');

/** A channel whose id/lastMessageId snowflakes decode to the given instants. */
function post(options: {createdAt: number; lastMessageAt?: number | null}) {
	return {
		id: SnowflakeUtils.fromTimestamp(options.createdAt),
		lastMessageId: options.lastMessageAt == null ? null : SnowflakeUtils.fromTimestamp(options.lastMessageAt),
	} as never;
}

function seedCategories(topics: ReadonlyArray<string | null>): void {
	getGuildChannelsMock.mockImplementation((guildId: string) =>
		guildId === GUILD_ID
			? topics.map((topic, index) => ({
					id: `category-${index}`,
					type: ChannelTypes.GUILD_CATEGORY,
					name: 'Forum',
					parentId: null,
					topic,
				}))
			: [],
	);
}

afterEach(() => {
	vi.clearAllMocks();
});

describe('getLastActivityAt — the snowflake already carries the timestamp', () => {
	it('uses lastMessageId when the post has messages', () => {
		const lastMessageAt = NOW - 2 * DAY;
		expect(getLastActivityAt(post({createdAt: NOW - 30 * DAY, lastMessageAt}))).toBe(lastMessageAt);
	});

	it('falls back to the channel id for a post nobody has written in yet', () => {
		const createdAt = NOW - 30 * DAY;
		expect(getLastActivityAt(post({createdAt, lastMessageAt: null}))).toBe(createdAt);
	});
});

describe('isInactive — the configured days of silence must have fully elapsed', () => {
	it('keeps a post that is silent for exactly the window active', () => {
		expect(isInactive(post({createdAt: NOW, lastMessageAt: NOW - 7 * DAY}), 7, NOW)).toBe(false);
	});

	it('hides a post one day past the window', () => {
		expect(isInactive(post({createdAt: NOW, lastMessageAt: NOW - 8 * DAY}), 7, NOW)).toBe(true);
	});

	it('hides a post a millisecond past the window', () => {
		expect(isInactive(post({createdAt: NOW, lastMessageAt: NOW - 7 * DAY - 1}), 7, NOW)).toBe(true);
	});

	it('treats 0 and negative windows as "never hide"', () => {
		const ancient = post({createdAt: NOW - 900 * DAY, lastMessageAt: NOW - 900 * DAY});
		expect(isInactive(ancient, 0, NOW)).toBe(false);
		expect(isInactive(ancient, -1, NOW)).toBe(false);
	});

	it('measures from the last message, not from when the post was created', () => {
		// An old post someone replied to yesterday is active again — the client's "voltam a aparecer
		// se alguém postar" requirement.
		expect(isInactive(post({createdAt: NOW - 300 * DAY, lastMessageAt: NOW - DAY}), 7, NOW)).toBe(false);
	});
});

describe('parseInactiveDaysFromTopic — the "inativas: Nd" marker', () => {
	it.each([
		['inativas: 3d', 3],
		['Inativas: 3 dias', 3],
		['inativas:3d', 3],
		['inactive: 14 days', 14],
		['Sketchbooks da turma. inativas: 30d', 30],
		['uma-postagem-por-aluno inativas: 3d', 3],
		['inativas: 0', 0],
	])('reads %j as %i', (topic, expected) => {
		expect(parseInactiveDaysFromTopic(topic)).toBe(expected);
	});

	it.each([
		['Regras da turma', 'a topic without the marker'],
		['inativas: em breve', 'the marker without a number'],
		['', 'an empty topic'],
	])('returns null for %j (%s)', (topic) => {
		expect(parseInactiveDaysFromTopic(topic)).toBeNull();
	});

	it('returns null for a missing topic', () => {
		expect(parseInactiveDaysFromTopic(null)).toBeNull();
		expect(parseInactiveDaysFromTopic(undefined)).toBeNull();
	});

	it('clamps an absurd window to a year', () => {
		expect(parseInactiveDaysFromTopic('inativas: 9999d')).toBe(365);
	});
});

describe('getClassInactiveDays — topic of the forum category, else the default', () => {
	it('defaults to 7 days when no category configures a window', () => {
		seedCategories(['Sketchbooks da turma', null]);
		expect(getClassInactiveDays(GUILD_ID)).toBe(DEFAULT_FORUM_INACTIVE_DAYS);
		expect(DEFAULT_FORUM_INACTIVE_DAYS).toBe(7);
	});

	it('takes the window from the category topic', () => {
		seedCategories(['inativas: 3d']);
		expect(getClassInactiveDays(GUILD_ID)).toBe(3);
	});

	it('uses the first category that configures one when several exist', () => {
		seedCategories(['Regras gerais', 'inativas: 14d', 'inativas: 30d']);
		expect(getClassInactiveDays(GUILD_ID)).toBe(14);
	});

	it('lets a class switch the rule off with 0', () => {
		seedCategories(['inativas: 0']);
		expect(getClassInactiveDays(GUILD_ID)).toBe(0);
	});

	it('falls back to the default for a guild with no forum at all', () => {
		seedCategories([]);
		expect(getClassInactiveDays('guild-sem-forum')).toBe(DEFAULT_FORUM_INACTIVE_DAYS);
	});
});
