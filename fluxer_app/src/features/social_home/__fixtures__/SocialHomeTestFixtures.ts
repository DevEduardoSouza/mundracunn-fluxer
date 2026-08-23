// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {fromTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';

/**
 * A fixed epoch, not `Date.now()`: fixture ids must stay identical across runs so ordering
 * assertions (feed sort, pagination cursors) are deterministic instead of flaking near midnight or
 * on a slow CI box.
 */
export const FIXTURE_BASE_TIMESTAMP_MS = Date.UTC(2026, 0, 15, 12, 0, 0);

export function testSnowflake(offsetMs = 0): string {
	return fromTimestamp(FIXTURE_BASE_TIMESTAMP_MS + offsetMs);
}

/**
 * Only the fields `discoverFeedChannelIds`/`getProfessorFeedChannel`/`getStoriesChannel`
 * (`SocialHomeChannelDiscovery.ts`) actually read — deliberately not a real `Channel` model
 * instance. Constructing one for real requires `RuntimeConfig`, which is a module-level singleton
 * that reads `window.__FLUXER_BOOTSTRAP__` on import and transitively pulls in most of the app
 * (Users, Guilds, VoiceSettings, LimitContext...) — see the note in `SocialHomeStateFixtures.ts`.
 */
export interface FakeChannel {
	id: string;
	type: number;
	name?: string;
	parentId: string | null;
}

export function buildFakeCategory(overrides: Partial<FakeChannel> & {id: string}): FakeChannel {
	return {type: ChannelTypes.GUILD_CATEGORY, name: 'Sketchbooks', parentId: null, ...overrides};
}

export function buildFakeTextChannel(overrides: Partial<FakeChannel> & {id: string}): FakeChannel {
	return {type: ChannelTypes.GUILD_TEXT, name: 'canal', parentId: null, ...overrides};
}

export interface FakeAttachment {
	url: string;
	contentType: string;
}

export function buildImageAttachment(overrides: Partial<FakeAttachment> = {}): FakeAttachment {
	return {url: 'https://cdn.fluxer.test/attachments/sketch.png', contentType: 'image/png', ...overrides};
}

/**
 * Shape `SocialHomeCommands.ts`/`SocialHome` state actually touch: `.id` (ordering, pagination
 * cursor), `.channelId`, `.content`, `.author.username`, `.attachments`. Real `Message` conversion
 * (wire JSON -> `Message` model) is Fluxer core, not social_home logic, and needs the same
 * `RuntimeConfig` bootstrap `FakeChannel` avoids — out of scope here, see
 * `SocialHomeStateFixtures.ts`.
 */
export interface FakePost {
	id: string;
	channelId: string;
	content: string;
	author: {username: string};
	attachments: Array<FakeAttachment>;
}

export function buildFakePost(overrides: Partial<FakePost> & {id: string; channelId: string}): FakePost {
	return {
		content: '',
		author: {username: 'aluna_ana'},
		attachments: [],
		...overrides,
	};
}

/** A student's Sketchbook post that qualifies for the Feed: has an image attachment. */
export function buildSketchbookImagePost(overrides: Partial<FakePost> & {id: string; channelId: string}): FakePost {
	return buildFakePost({content: 'meu desenho de hoje', attachments: [buildImageAttachment()], ...overrides});
}

/** A Sketchbook post that must NOT reach the Feed: text/link only, no attachment. */
export function buildSketchbookTextPost(overrides: Partial<FakePost> & {id: string; channelId: string}): FakePost {
	return buildFakePost({content: 'alguem viu a tarefa de hoje?', attachments: [], ...overrides});
}
