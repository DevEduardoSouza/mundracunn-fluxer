// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `getForumCategories` / `getGuidelinesChannel` / `getForumPostChannels` / `isForumHiddenChannel`
 * read channels off the real `Channels` singleton and permissions off the real `Permission`
 * singleton. Constructing either for real pulls in `RuntimeConfig` (a module-level singleton that
 * touches most of the app's state layer just by being imported), so both are replaced wholesale —
 * same approach as social_home's discovery tests. The feature's own logic (name normalization,
 * accent/emoji stripping, the guidelines exclusion, the permission filter) then runs unmodified.
 */

import {ChannelOverwriteTypes, ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

vi.mock('@app/features/channel/state/Channels', () => ({default: {getGuildChannels: vi.fn(), getChannel: vi.fn()}}));
vi.mock('@app/features/permissions/state/Permission', () => ({default: {getChannelPermissions: vi.fn()}}));
vi.mock('@app/features/guild/state/Guilds', () => ({default: {getGuildRoles: vi.fn(() => [])}}));

const Channels = (await import('@app/features/channel/state/Channels')).default;
const Permission = (await import('@app/features/permissions/state/Permission')).default;
const {
	getForumCategories,
	getGuidelinesChannel,
	getForumPostChannels,
	isForumHiddenChannel,
	shouldRedirectAwayFromRawGuidelinesChannel,
	canEditGuidelines,
	isSinglePostRuleEnabled,
	findOwnForumPostChannel,
	getForumPostAuthorId,
} = await import('@app/features/forum/utils/ForumChannelDiscovery');

const getGuildChannelsMock = Channels.getGuildChannels as unknown as Mock;
const getChannelMock = Channels.getChannel as unknown as Mock;
const getChannelPermissionsMock = Permission.getChannelPermissions as unknown as Mock;

const GUILD_ID = 'guild-turma-a';
const VIEW = Permissions.VIEW_CHANNEL | Permissions.READ_MESSAGE_HISTORY;

interface FakeOverwrite {
	id: string;
	type: number;
	allow: bigint;
	deny: bigint;
}

interface FakeChannel {
	id: string;
	type: number;
	name?: string;
	parentId: string | null;
	topic?: string | null;
	ownerId?: string | null;
	permissionOverwrites: Record<string, FakeOverwrite>;
}

function category(overrides: Partial<FakeChannel> & {id: string}): FakeChannel {
	return {type: ChannelTypes.GUILD_CATEGORY, name: 'Forum', parentId: null, permissionOverwrites: {}, ...overrides};
}

function textChannel(overrides: Partial<FakeChannel> & {id: string}): FakeChannel {
	return {type: ChannelTypes.GUILD_TEXT, name: 'canal', parentId: null, permissionOverwrites: {}, ...overrides};
}

/** The overwrite the "Nova postagem" flow (ForumPostCommands) sets for the author. */
function authorOverwrite(userId: string): Record<string, FakeOverwrite> {
	return {[userId]: {id: userId, type: ChannelOverwriteTypes.MEMBER, allow: Permissions.MANAGE_CHANNELS, deny: 0n}};
}

/** The overwrite the same flow sets for the student role: a ROLE, never an author. */
function studentRoleDenyOverwrite(roleId: string): Record<string, FakeOverwrite> {
	return {
		[roleId]: {
			id: roleId,
			type: ChannelOverwriteTypes.ROLE,
			allow: 0n,
			deny: Permissions.MANAGE_CHANNELS | Permissions.MANAGE_ROLES,
		},
	};
}

function seed(channels: ReadonlyArray<FakeChannel>): void {
	getGuildChannelsMock.mockImplementation((guildId: string) => (guildId === GUILD_ID ? channels : []));
	getChannelMock.mockImplementation((channelId: string) => channels.find((c) => c.id === channelId));
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

describe('shouldRedirectAwayFromRawGuidelinesChannel — the rules channel is a panel, not a chat', () => {
	function seedGuidelines(): void {
		seed([
			category({id: 'cat', name: 'Fórum'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat'}),
			textChannel({id: 'ch-post', name: 'Apresentações', parentId: 'cat'}),
		]);
	}

	it('sends a student who cannot write there to the forum page', () => {
		seedGuidelines();
		getChannelPermissionsMock.mockReturnValue(VIEW);

		expect(shouldRedirectAwayFromRawGuidelinesChannel(GUILD_ID, 'ch-rules')).toBe(true);
	});

	it('leaves whoever writes the rules in the real channel', () => {
		seedGuidelines();
		getChannelPermissionsMock.mockReturnValue(VIEW | Permissions.SEND_MESSAGES);

		expect(shouldRedirectAwayFromRawGuidelinesChannel(GUILD_ID, 'ch-rules')).toBe(false);
	});

	it('never touches an ordinary forum post or a channel outside the forum', () => {
		seedGuidelines();
		getChannelPermissionsMock.mockReturnValue(VIEW);

		expect(shouldRedirectAwayFromRawGuidelinesChannel(GUILD_ID, 'ch-post')).toBe(false);
		expect(shouldRedirectAwayFromRawGuidelinesChannel(GUILD_ID, 'ch-inexistente')).toBe(false);
	});

	it('does nothing in a guild with no forum at all', () => {
		seed([
			category({id: 'cat', name: 'Sketchbooks'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat'}),
		]);
		getChannelPermissionsMock.mockReturnValue(VIEW);

		expect(shouldRedirectAwayFromRawGuidelinesChannel(GUILD_ID, 'ch-rules')).toBe(false);
	});
});

describe('canEditGuidelines — who gets the banner\'s "Editar" button', () => {
	function seedGuidelines(): void {
		seed([category({id: 'cat', name: 'Fórum'}), textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat'})]);
	}

	it('is true for whoever can write in the guidelines channel', () => {
		seedGuidelines();
		getChannelPermissionsMock.mockReturnValue(VIEW | Permissions.SEND_MESSAGES);

		expect(canEditGuidelines(GUILD_ID)).toBe(true);
	});

	it('is false for a student who can only read the rules', () => {
		seedGuidelines();
		getChannelPermissionsMock.mockReturnValue(VIEW);

		expect(canEditGuidelines(GUILD_ID)).toBe(false);
	});

	it('is false in a guild whose forum has no guidelines channel', () => {
		seed([category({id: 'cat', name: 'Fórum'}), textChannel({id: 'ch-post', name: 'Apresentações', parentId: 'cat'})]);
		getChannelPermissionsMock.mockReturnValue(VIEW | Permissions.SEND_MESSAGES);

		expect(canEditGuidelines(GUILD_ID)).toBe(false);
	});
});

describe('isSinglePostRuleEnabled - the "uma-postagem-por-aluno" marker in a forum config topic', () => {
	it('reads the marker from the forum category topic (the fork API serializes it)', () => {
		seed([
			category({id: 'cat', name: '🗂️ fórum', topic: 'Regras: uma-postagem-por-aluno'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat', topic: null}),
		]);

		expect(isSinglePostRuleEnabled(GUILD_ID)).toBe(true);
	});

	it('reads the marker from the #diretrizes topic when the category topic is missing', () => {
		seed([
			category({id: 'cat', name: '🗂️ fórum'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat', topic: 'uma-postagem-por-aluno'}),
		]);

		expect(isSinglePostRuleEnabled(GUILD_ID)).toBe(true);
	});

	it('accepts the english marker and survives accents around it', () => {
		seed([category({id: 'cat', name: 'Forum', topic: 'Atenção: one-post-per-student!'})]);

		expect(isSinglePostRuleEnabled(GUILD_ID)).toBe(true);
	});

	it('is off when no forum config topic carries the marker', () => {
		seed([
			category({id: 'cat', name: 'Fórum', topic: 'inativas: 3d'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat', topic: 'Leia antes de postar'}),
			textChannel({id: 'ch-other', name: 'geral', parentId: null, topic: 'uma-postagem-por-aluno'}),
		]);

		expect(isSinglePostRuleEnabled(GUILD_ID)).toBe(false);
	});
});

describe('findOwnForumPostChannel - the post a student already owns', () => {
	const STUDENT = '1542602059025481728';
	const ROLE = 'role-aluno';

	it('finds the post by ownerId when the API fills it', () => {
		seed([
			category({id: 'cat', name: 'fórum'}),
			textChannel({id: 'ch-other', name: 'sketchbook-outro', parentId: 'cat', ownerId: 'someone-else'}),
			textChannel({id: 'ch-mine', name: 'sketchbook-qa-aluno', parentId: 'cat', ownerId: STUDENT}),
		]);
		stubViewable(['ch-other', 'ch-mine']);

		expect(findOwnForumPostChannel(GUILD_ID, STUDENT)?.id).toBe('ch-mine');
	});

	it('falls back to the MEMBER overwrite with MANAGE_CHANNELS, which is what the create flow sets (owner_id is null for guild channels)', () => {
		seed([
			category({id: 'cat', name: '🗂️ fórum'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat'}),
			textChannel({
				id: 'ch-other',
				name: 'sketchbook-outro',
				parentId: 'cat',
				ownerId: null,
				permissionOverwrites: {...studentRoleDenyOverwrite(ROLE), ...authorOverwrite('someone-else')},
			}),
			textChannel({
				id: 'ch-mine',
				name: 'sketchbook-qa-aluno',
				parentId: 'cat',
				ownerId: null,
				permissionOverwrites: {...studentRoleDenyOverwrite(ROLE), ...authorOverwrite(STUDENT)},
			}),
		]);
		stubViewable(['ch-rules', 'ch-other', 'ch-mine']);

		expect(findOwnForumPostChannel(GUILD_ID, STUDENT)?.id).toBe('ch-mine');
		expect(findOwnForumPostChannel(GUILD_ID, 'nobody')).toBeUndefined();
	});

	it('never treats a ROLE overwrite or a MEMBER overwrite without MANAGE_CHANNELS as the author', () => {
		const viewOnly: FakeOverwrite = {id: STUDENT, type: ChannelOverwriteTypes.MEMBER, allow: VIEW, deny: 0n};
		const roleWithManage: FakeOverwrite = {
			id: STUDENT,
			type: ChannelOverwriteTypes.ROLE,
			allow: Permissions.MANAGE_CHANNELS,
			deny: 0n,
		};

		expect(getForumPostAuthorId(textChannel({id: 'a', permissionOverwrites: {[STUDENT]: viewOnly}}) as never)).toBeNull();
		expect(
			getForumPostAuthorId(textChannel({id: 'b', permissionOverwrites: {[STUDENT]: roleWithManage}}) as never),
		).toBeNull();
	});

	it('ignores the guidelines channel and a post the current user cannot view', () => {
		seed([
			category({id: 'cat', name: 'fórum'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat', permissionOverwrites: authorOverwrite(STUDENT)}),
			textChannel({id: 'ch-hidden', name: 'sketchbook-qa-aluno', parentId: 'cat', ownerId: STUDENT}),
		]);
		stubViewable(['ch-rules']);

		expect(findOwnForumPostChannel(GUILD_ID, STUDENT)).toBeUndefined();
	});
});
