// SPDX-License-Identifier: AGPL-3.0-or-later

import {fromTimestamp} from '@fluxer/snowflake/src/SnowflakeUtils';

/**
 * Minimal WireMessage-shaped fixtures for the cover tests. `ForumCoverFallback.ts` only ever reads
 * `id`, `channel_id`, and `attachments[].content_type`; constructing a real `Message` needs
 * `RuntimeConfig` (a module singleton that pulls in most of the app), so the fallback test mocks the
 * `Message` class and feeds it these — same approach and reasoning as
 * social_home/__fixtures__/SocialHomeWireMessageFixtures.ts (copied, not imported).
 */
export interface WireMessageFixture {
	id: string;
	channel_id: string;
	attachments: Array<{content_type?: string | null}>;
}

const BASE_MS = Date.UTC(2026, 0, 15, 12, 0, 0);

/** Deterministic snowflake for ordering assertions — never `Date.now()` (would flake near midnight). */
export function fixtureSnowflake(offsetMs = 0): string {
	return fromTimestamp(BASE_MS + offsetMs);
}

export function buildWireImageMessage(overrides: {id: string; channelId: string}): WireMessageFixture {
	return {id: overrides.id, channel_id: overrides.channelId, attachments: [{content_type: 'image/png'}]};
}

export function buildWireTextMessage(overrides: {id: string; channelId: string}): WireMessageFixture {
	return {id: overrides.id, channel_id: overrides.channelId, attachments: []};
}
