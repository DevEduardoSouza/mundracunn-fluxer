// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * `discoverFeedChannelIds` reads channels off the real `Channels` singleton and permissions off the
 * real `Permission` singleton. Constructing either for real pulls in `RuntimeConfig` (a module-level
 * singleton that touches most of the app's state layer just by being imported), so both are replaced
 * wholesale — same approach as the forum's discovery tests. The convention logic (emoji/accent
 * tolerance, the guidelines exclusion, the view-permission filter) then runs unmodified.
 */

import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

vi.mock('@app/features/channel/state/Channels', () => ({default: {getGuildChannels: vi.fn()}}));
vi.mock('@app/features/permissions/state/Permission', () => ({default: {getChannelPermissions: vi.fn()}}));

const Channels = (await import('@app/features/channel/state/Channels')).default;
const Permission = (await import('@app/features/permissions/state/Permission')).default;
const {discoverFeedChannelIds, canPostStories, shouldRedirectAwayFromRawStoriesChannel} = await import(
	'@app/features/social_home/utils/SocialHomeChannelDiscovery'
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
	return {type: ChannelTypes.GUILD_CATEGORY, name: 'Categoria', parentId: null, ...overrides};
}

function textChannel(overrides: Partial<FakeChannel> & {id: string}): FakeChannel {
	return {type: ChannelTypes.GUILD_TEXT, name: 'canal', parentId: null, ...overrides};
}

/** Seeds the guild and grants view on every channel unless `viewable` narrows it. */
function seed(channels: Array<FakeChannel>, viewable?: Array<string>): void {
	getGuildChannelsMock.mockReturnValue(channels);
	getChannelPermissionsMock.mockImplementation((channelId: string) =>
		viewable == null || viewable.includes(channelId) ? VIEW : 0n,
	);
}

afterEach(() => {
	vi.clearAllMocks();
});

describe('discoverFeedChannelIds — the channels the Gallery aggregates', () => {
	it('takes the sketchbooks category and the professor channel', () => {
		seed([
			category({id: 'cat-sb', name: '🎨 sketchbooks'}),
			textChannel({id: 'ch-ana', name: 'sketchbook-da-ana', parentId: 'cat-sb'}),
			textChannel({id: 'ch-prof', name: 'feed-do-professor'}),
			textChannel({id: 'ch-geral', name: 'conversa-geral'}),
		]);

		expect(discoverFeedChannelIds(GUILD_ID)).toEqual(['ch-ana', 'ch-prof']);
	});

	/**
	 * The regression the class owner reported on 30/08/2026: the forum worked, but its posts never
	 * reached the Gallery.
	 */
	it('takes forum posts too, through accents and emoji in the category name', () => {
		seed([
			category({id: 'cat-forum', name: '🗂️ Fórum'}),
			textChannel({id: 'ch-post', name: 'sketchbook-da-ana', parentId: 'cat-forum'}),
			textChannel({id: 'ch-post-2', name: 'fefe', parentId: 'cat-forum'}),
		]);

		expect(discoverFeedChannelIds(GUILD_ID)).toEqual(['ch-post', 'ch-post-2']);
	});

	it('leaves the rules channel out of the Gallery', () => {
		seed([
			category({id: 'cat-forum', name: 'Fórum'}),
			textChannel({id: 'ch-rules', name: 'diretrizes', parentId: 'cat-forum'}),
			textChannel({id: 'ch-rules-en', name: 'guidelines', parentId: 'cat-forum'}),
			textChannel({id: 'ch-post', name: 'postagem-do-bruno', parentId: 'cat-forum'}),
		]);

		expect(discoverFeedChannelIds(GUILD_ID)).toEqual(['ch-post']);
	});

	it('aggregates sketchbooks, forum and the professor channel together', () => {
		seed([
			category({id: 'cat-sb', name: 'sketchbooks'}),
			textChannel({id: 'ch-ana', name: 'sketchbook-da-ana', parentId: 'cat-sb'}),
			category({id: 'cat-forum', name: '🗂️ Fórum'}),
			textChannel({id: 'ch-post', name: 'postagem-do-bruno', parentId: 'cat-forum'}),
			textChannel({id: 'ch-prof', name: 'feed-do-professor'}),
		]);

		expect(discoverFeedChannelIds(GUILD_ID).sort()).toEqual(['ch-ana', 'ch-post', 'ch-prof']);
	});

	/**
	 * The search API answers 403 when an explicit channel_id list names a channel the requester
	 * can't see, so an unviewable forum post has to be dropped here, exactly like a private
	 * sketchbook already was.
	 */
	it('drops a forum post the reader cannot view', () => {
		seed(
			[
				category({id: 'cat-forum', name: 'Fórum'}),
				textChannel({id: 'ch-visivel', name: 'postagem-a', parentId: 'cat-forum'}),
				textChannel({id: 'ch-privada', name: 'postagem-b', parentId: 'cat-forum'}),
			],
			['ch-visivel'],
		);

		expect(discoverFeedChannelIds(GUILD_ID)).toEqual(['ch-visivel']);
	});

	it('ignores a category that merely starts with the same letters', () => {
		seed([
			category({id: 'cat-outra', name: 'Formularios'}),
			textChannel({id: 'ch-form', name: 'respostas', parentId: 'cat-outra'}),
		]);

		expect(discoverFeedChannelIds(GUILD_ID)).toEqual([]);
	});

	it('ignores voice channels sitting inside a forum category', () => {
		seed([
			category({id: 'cat-forum', name: 'Fórum'}),
			{id: 'ch-voz', type: ChannelTypes.GUILD_VOICE, name: 'Sala', parentId: 'cat-forum'},
			textChannel({id: 'ch-post', name: 'postagem-a', parentId: 'cat-forum'}),
		]);

		expect(discoverFeedChannelIds(GUILD_ID)).toEqual(['ch-post']);
	});
});

/**
 * Commenting on a story is a reply in the Stories channel, so it needs SEND_MESSAGES there — which
 * used to be the whole publish gate as well, handing every commenter the publish button. The class
 * owner asked for comments without uploads (30/08/2026), so the gate is ATTACH_FILES.
 */
describe('canPostStories — publishing is gated apart from commenting', () => {
	function seedStories(permissions: bigint): void {
		getGuildChannelsMock.mockReturnValue([textChannel({id: 'ch-stories', name: 'stories'})]);
		getChannelPermissionsMock.mockReturnValue(permissions);
	}

	it('is true for staff, who can attach files', () => {
		seedStories(VIEW | Permissions.SEND_MESSAGES | Permissions.ATTACH_FILES);

		expect(canPostStories(GUILD_ID)).toBe(true);
	});

	it('is false for a member who may comment but not upload', () => {
		seedStories(VIEW | Permissions.SEND_MESSAGES);

		expect(canPostStories(GUILD_ID)).toBe(false);
	});

	it('is false for a read-only visitor', () => {
		seedStories(VIEW);

		expect(canPostStories(GUILD_ID)).toBe(false);
	});

	it('is false in a class with no Stories channel', () => {
		getGuildChannelsMock.mockReturnValue([textChannel({id: 'ch-geral', name: 'conversa-geral'})]);
		getChannelPermissionsMock.mockReturnValue(VIEW | Permissions.SEND_MESSAGES | Permissions.ATTACH_FILES);

		expect(canPostStories(GUILD_ID)).toBe(false);
	});

	it('funnels a commenter to the Gallery instead of the raw channel', () => {
		seedStories(VIEW | Permissions.SEND_MESSAGES);

		expect(shouldRedirectAwayFromRawStoriesChannel(GUILD_ID, 'ch-stories')).toBe(true);
	});
});
