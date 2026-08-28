// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `getForumCategories` / `getGuidelinesChannel` / `getForumPostChannels` / `isForumHiddenChannel`
 * read channels off the real `Channels` singleton and permissions off the real `Permission`
 * singleton. Constructing either for real pulls in `RuntimeConfig` (a module-level singleton that
 * touches most of the app's state layer just by being imported), so both are replaced wholesale —
 * same approach as social_home's discovery tests. The feature's own logic (name normalization,
 * accent/emoji stripping, the guidelines exclusion, the permission filter) then runs unmodified.
 */

import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

vi.mock('@app/features/channel/state/Channels', () => ({default: {getGuildChannels: vi.fn()}}));
vi.mock('@app/features/permissions/state/Permission', () => ({default: {getChannelPermissions: vi.fn()}}));

const Channels = (await import('@app/features/channel/state/Channels')).default;
const Permission = (await import('@app/features/permissions/state/Permission')).default;
const {getForumCategories, getGuidelinesChannel, getForumPostChannels, isForumHiddenChannel} = await import(
	'@app/features/forum/utils/ForumChannelDiscovery'
);

const getGuildChannelsMock = Channels.getGuildChannels as unknown as Mock;
const getChannelPermissionsMock = Permission.getChannelPermissions as unknown as Mock;

const GUILD_ID = 'guild-turma-a';
const VIEW = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;

interface FakeChannel {
	id: string;
	type: number;
	name?: string;
	parentId: string | null;
}

function category(overrides: Partial<FakeChannel> & {id: string}): FakeChannel {
	return {type: ChannelTypes.GUILD_CATEGORY, name: 'Forum', parentId: null, ...overrides};
}

function textChannel(overrides: Partial<FakeChannel> & {id: string}): FakeChannel {
	return {type: ChannelTypes.GUILD_TEXT, name: 'canal', parentId: null, ...overrides};
}

function seed(channels: ReadonlyArray<FakeChannel>): void {
	getGuildChannelsMock.mockImplementation((guildId: string) => (guildId === GUILD_ID ? channels : []));
}

function stubViewable(channelIds: ReadonlyArray<string>): void {
	getChannelPermissionsMock.mockImplementation((channelId: string) => (channelIds.includes(channelId) ? VIEW : 0n));
}

afterEach(() => {
	vi.clearAllMocks();
});

describe('getForumCategories — matches "forum*" through accents and emoji decoration', () => {
	it('matches a bare "Forum", an accented "Fórum" and an emoji-decorated "🗣️ Fórum Geral"', () => {
		seed([
			category({id: 'cat-bare', name: 'Forum'}),
			category({id: 'cat-accent', name: 'Fórum'}),
			category({id: 'cat-emoji', name: '🗣️ Fórum Geral'}),
			category({id: 'cat-sketch', name: 'Sketchbooks'}),
			textChannel({id: 'txt-forum-named', name: 'forum', parentId: null}),
		]);

		const ids = getForumCategories(GUILD_ID).map((c) => c.id);

		expect(ids).toEqual(['cat-bare', 'cat-accent', 'cat-emoji']);
	});

	it('does not match a category that merely contains "forum" later in the name', () => {
		seed([category({id: 'cat', name: 'Mega Forum'})]);

		expect(getForumCategories(GUILD_ID)).toHaveLength(0);
	});
});

describe('getGuidelinesChannel — the rules channel inside a forum category', () => {
	it('finds "diretrizes" (accent-insensitive) parented to a forum category', () => {
		seed([
			category({id: 'cat', name: 'Fórum'}),
			textChannel({id: 'ch-rules', name: 'Diretrizes', parentId: 'cat'}),
			textChannel({id: 'ch-post', name: 'Dúvidas gerais', parentId: 'cat'}),
		]);
		stubViewable(['ch-rules', 'ch-post']);

		expect(getGuidelinesChannel(GUILD_ID)?.id).toBe('ch-rules');
	});

	it('ignores a "diretrizes" channel that is not inside a forum category', () => {
		seed([
			category({id: 'cat', name: 'Fórum'}),
			textChannel({id: 'ch-rules-elsewhere', name: 'diretrizes', parentId: null}),
		]);

		expect(getGuidelinesChannel(GUILD_ID)).toBeUndefined();
	});
});

describe('getForumPostChannels — forum-category text channels, minus guidelines, minus unviewable', () => {
	it('excludes the guidelines channel and any channel the user cannot view', () => {
		seed([
			category({id: 'cat', name: '🧵 Fórum'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat'}),
			textChannel({id: 'ch-visible', name: 'Apresentações', parentId: 'cat'}),
			textChannel({id: 'ch-private', name: 'Turma avançada', parentId: 'cat'}),
			textChannel({id: 'ch-outside', name: 'geral', parentId: null}),
		]);
		stubViewable(['ch-rules', 'ch-visible']);

		expect(getForumPostChannels(GUILD_ID).map((c) => c.id)).toEqual(['ch-visible']);
	});

	it('returns nothing when the guild has no forum category', () => {
		seed([
			category({id: 'cat', name: 'Sketchbooks'}),
			textChannel({id: 'ch', name: 'canal', parentId: 'cat'}),
		]);
		stubViewable(['ch']);

		expect(getForumPostChannels(GUILD_ID)).toHaveLength(0);
	});
});

describe('isForumHiddenChannel — the forum category and everything under it', () => {
	it('hides the forum category and its children, but not unrelated channels', () => {
		const forumCategory = category({id: 'cat', name: 'Fórum'});
		const forumChild = textChannel({id: 'ch-child', name: 'diretrizes', parentId: 'cat'});
		const otherChannel = textChannel({id: 'ch-other', name: 'geral', parentId: null});
		seed([forumCategory, forumChild, otherChannel]);

		expect(isForumHiddenChannel(GUILD_ID, forumCategory as never)).toBe(true);
		expect(isForumHiddenChannel(GUILD_ID, forumChild as never)).toBe(true);
		expect(isForumHiddenChannel(GUILD_ID, otherChannel as never)).toBe(false);
	});
});
