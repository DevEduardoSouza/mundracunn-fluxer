// SPDX-License-Identifier: AGPL-3.0-or-later

import type {FakeChannel} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import type {Mock} from 'vitest';

/**
 * `discoverFeedChannelIds`/`getProfessorFeedChannel`/`getStoriesChannel` (`SocialHomeChannelDiscovery.ts`)
 * read channels off the real `Channels` singleton and permissions off the real `Permission` singleton.
 * Both are safe to import as types, but constructing either for real — even just to seed a channel
 * list — instantiates `RuntimeConfig` (needed for `Channel`'s `instanceId`), a module-level singleton
 * that reads `window.__FLUXER_BOOTSTRAP__` on import and, transitively, touches most of the app's
 * state layer (Users, Guilds, VoiceSettings, LimitContext, native permission probing...) — none of it
 * relevant to social_home, and none of it something a feature-level test should have to stand up.
 *
 * So: `vi.mock('@app/features/channel/state/Channels', ...)` and
 * `vi.mock('@app/features/permissions/state/Permission', ...)` replace both wholesale (each test file
 * does this itself — `vi.mock` factories can't safely close over helpers imported from here, so this
 * module only provides the plain data manipulation that runs *after* the mock is in place). Import the
 * mocked module the same way as `RestTransport` in the http-mock tests: `const Channels =
 * (await import('@app/features/channel/state/Channels')).default;` and pass its `getGuildChannels`
 * mock into `seedGuildChannels` below.
 */

export function seedGuildChannels(
	getGuildChannelsMock: Mock,
	guildId: string,
	channels: ReadonlyArray<FakeChannel>,
): void {
	getGuildChannelsMock.mockImplementation((requestedGuildId: string) => (requestedGuildId === guildId ? channels : []));
}

export function stubViewableChannels(
	getChannelPermissionsMock: Mock,
	channelIds: ReadonlyArray<string>,
	permissions: bigint,
): void {
	getChannelPermissionsMock.mockImplementation((channelId: string) =>
		channelIds.includes(channelId) ? permissions : 0n,
	);
}
