// SPDX-License-Identifier: AGPL-3.0-or-later

import {FLUXER_EPOCH} from '@fluxer/constants/src/Core';
import {compare, extractTimestamp, fromTimestamp, sortBySnowflakeDesc} from '@fluxer/snowflake/src/SnowflakeUtils';
import {afterEach, describe, expect, it} from 'vitest';

/**
 * `SnowflakeUtils.fromTimestamp`/`extractTimestamp` are what SocialHomeCommands.ts's `max_id`
 * pagination cursor and SocialHomeStoriesCommands.ts's 24h `min_id` window are built on
 * (`fromTimestamp(Date.now() - STORY_WINDOW_MS)`) — a silent regression here breaks both features
 * without a single failing assertion in either feature's own tests, since both just pass whatever
 * string these functions hand back straight to the search API.
 */

// An arbitrary fixed instant, not Date.now() — every test here is about the *math*, not about
// whatever moment the suite happens to run.
const A_FIXED_NOW_MS = Date.UTC(2026, 0, 15, 12, 0, 0);
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

describe('fromTimestamp / extractTimestamp — round trip', () => {
	it('round-trips an arbitrary timestamp with millisecond precision', () => {
		const snowflake = fromTimestamp(A_FIXED_NOW_MS);
		expect(extractTimestamp(snowflake)).toBe(A_FIXED_NOW_MS);
	});

	it('round-trips a spread of timestamps from just after the epoch to 10 years out', () => {
		const tenYearsMs = 10 * 365 * 24 * 60 * 60 * 1000;
		for (let offset = 0; offset <= tenYearsMs; offset += tenYearsMs / 25) {
			const timestamp = FLUXER_EPOCH + 1 + Math.round(offset);
			expect(extractTimestamp(fromTimestamp(timestamp))).toBe(timestamp);
		}
	});

	it('round-trips a timestamp exactly at the Fluxer epoch as the literal snowflake "0"', () => {
		const snowflake = fromTimestamp(FLUXER_EPOCH);
		expect(snowflake).toBe('0');
		expect(extractTimestamp(snowflake)).toBe(FLUXER_EPOCH);
	});

	it('clamps a pre-epoch timestamp to the epoch instead of producing a negative/invalid snowflake', () => {
		const snowflake = fromTimestamp(FLUXER_EPOCH - 1_000_000);
		expect(snowflake).toBe('0');
		expect(extractTimestamp(snowflake)).toBe(FLUXER_EPOCH);
	});

	it('returns NaN instead of throwing when extracting from a non-numeric string', () => {
		expect(extractTimestamp('not-a-snowflake')).toBeNaN();
	});

	// BigInt('') coerces to 0n (same as BigInt('0')) per the JS spec, so an empty string isn't
	// "malformed" to extractTimestamp — it decodes as the epoch, same as the literal snowflake "0".
	it('treats an empty string like snowflake "0" (BigInt("") is 0n) rather than NaN', () => {
		expect(extractTimestamp('')).toBe(FLUXER_EPOCH);
	});
});

describe('min_id for the Stories 24h window (SocialHomeStoriesCommands.ts pattern: fromTimestamp(now - 24h))', () => {
	it('produces a min_id whose own decoded timestamp is exactly 24h before "now"', () => {
		const minId = fromTimestamp(A_FIXED_NOW_MS - TWENTY_FOUR_HOURS_MS);
		expect(extractTimestamp(minId)).toBe(A_FIXED_NOW_MS - TWENTY_FOUR_HOURS_MS);
	});

	it('keeps a story posted just inside the window and drops one posted just outside it', () => {
		const minId = fromTimestamp(A_FIXED_NOW_MS - TWENTY_FOUR_HOURS_MS);
		const storyJustInsideWindow = fromTimestamp(A_FIXED_NOW_MS - TWENTY_FOUR_HOURS_MS + 1);
		const storyJustOutsideWindow = fromTimestamp(A_FIXED_NOW_MS - TWENTY_FOUR_HOURS_MS - 1);

		expect(compare(storyJustInsideWindow, minId)).toBeGreaterThan(0);
		expect(compare(storyJustOutsideWindow, minId)).toBeLessThan(0);
	});
});

describe('boundary: exactly 24 hours old', () => {
	it('a story posted at the exact millisecond of the window boundary compares equal to min_id, not less-than — the boundary is inclusive', () => {
		const minId = fromTimestamp(A_FIXED_NOW_MS - TWENTY_FOUR_HOURS_MS);
		const storyAtExactBoundary = fromTimestamp(A_FIXED_NOW_MS - TWENTY_FOUR_HOURS_MS);

		expect(compare(storyAtExactBoundary, minId)).toBe(0);
	});
});

describe('boundary: timezone independence', () => {
	const originalTZ = process.env.TZ;

	afterEach(() => {
		process.env.TZ = originalTZ;
	});

	it('produces the same snowflake for the same instant no matter the process timezone', () => {
		process.env.TZ = 'America/Sao_Paulo';
		const fromSaoPaulo = fromTimestamp(A_FIXED_NOW_MS);
		process.env.TZ = 'Pacific/Kiritimati'; // UTC+14 — about as far from UTC as timezones get
		const fromKiritimati = fromTimestamp(A_FIXED_NOW_MS);

		expect(fromSaoPaulo).toBe(fromKiritimati);
	});

	it('extracts the same UTC timestamp back out no matter the process timezone', () => {
		const snowflake = fromTimestamp(A_FIXED_NOW_MS);
		process.env.TZ = 'Pacific/Kiritimati';

		expect(extractTimestamp(snowflake)).toBe(A_FIXED_NOW_MS);
	});
});

describe('boundary: client clock ahead of server time', () => {
	it('round-trips a timestamp several minutes in the future without special-casing it', () => {
		const clockDriftMs = 5 * 60 * 1000;
		const driftedTimestamp = A_FIXED_NOW_MS + clockDriftMs;

		expect(extractTimestamp(fromTimestamp(driftedTimestamp))).toBe(driftedTimestamp);
	});

	it('sorts a drifted-future post after real-time posts, newest first', () => {
		const realTimePost = {id: fromTimestamp(A_FIXED_NOW_MS)};
		const driftedFuturePost = {id: fromTimestamp(A_FIXED_NOW_MS + 5 * 60 * 1000)};

		expect(compare(driftedFuturePost.id, realTimePost.id)).toBeGreaterThan(0);
		expect(sortBySnowflakeDesc([realTimePost, driftedFuturePost])).toEqual([driftedFuturePost, realTimePost]);
	});

	/**
	 * Not a bug in this utility, but the sharpest edge in "relógio do cliente adiantado": the 24h
	 * min_id is computed from *this client's* Date.now() (SocialHomeStoriesCommands.ts), not the
	 * server's. A fast client clock shifts min_id itself into the future, which can silently drop
	 * stories that are genuinely within the last 24h by server/true time.
	 */
	it('documents that a fast client clock narrows the 24h window and can drop a genuinely-recent story', () => {
		const trueNow = A_FIXED_NOW_MS;
		const clientClockDriftMs = 10 * 60 * 1000;
		const clientObservedNow = trueNow + clientClockDriftMs;

		// Posted 23h59m ago by true/server time — well within the last 24h.
		const recentStory = fromTimestamp(trueNow - (TWENTY_FOUR_HOURS_MS - 60_000));

		const minIdFromAccurateClock = fromTimestamp(trueNow - TWENTY_FOUR_HOURS_MS);
		const minIdFromDriftedClock = fromTimestamp(clientObservedNow - TWENTY_FOUR_HOURS_MS);

		expect(compare(recentStory, minIdFromAccurateClock)).toBeGreaterThan(0); // correctly kept
		expect(compare(recentStory, minIdFromDriftedClock)).toBeLessThan(0); // wrongly dropped
	});
});
