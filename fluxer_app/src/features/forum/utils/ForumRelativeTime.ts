// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The shared `formatShortRelativeTime` (@fluxer/date_utils) returns hardcoded English abbreviations
 * — 'now', '5m', '3d' — which is fine for a chat timestamp but leaks raw English into the forum's
 * "ativo {time}" line: pt-BR rendered "ativo 3d", and "ativo now" for a fresh post.
 *
 * `Intl.RelativeTimeFormat` already knows every locale the app ships, so the label is built from
 * that instead of translating a table of units by hand. It yields "há 3 dias" in pt-BR and "3 days
 * ago" in English, which read correctly inside the "active {time}" sentence in both. Doing it here
 * rather than in date_utils keeps the change inside the feature — the shared helper stays exactly as
 * upstream wrote it, so it never shows up in a rebase.
 */

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const MONTH = 30 * DAY;
const YEAR = 365 * DAY;

/** Largest unit that still describes the elapsed time, coarsest last. */
const UNITS: ReadonlyArray<{limit: number; ms: number; unit: Intl.RelativeTimeFormatUnit}> = [
	{limit: MINUTE, ms: SECOND, unit: 'second'},
	{limit: HOUR, ms: MINUTE, unit: 'minute'},
	{limit: DAY, ms: HOUR, unit: 'hour'},
	{limit: MONTH, ms: DAY, unit: 'day'},
	{limit: YEAR, ms: MONTH, unit: 'month'},
];

/**
 * A localized "how long ago" phrase for a forum post's last activity. Anything under a minute
 * collapses to the locale's "now" ("agora"), so a post someone just wrote in doesn't read as
 * "0 seconds ago".
 */
export function formatForumRelativeTime(locale: string, timestamp: number, now: number = Date.now()): string {
	const formatter = new Intl.RelativeTimeFormat(locale, {numeric: 'auto'});
	const elapsed = Math.max(0, now - timestamp);
	if (elapsed < MINUTE) return formatter.format(0, 'second');
	for (const {limit, ms, unit} of UNITS) {
		if (elapsed < limit) return formatter.format(-Math.floor(elapsed / ms), unit);
	}
	return formatter.format(-Math.floor(elapsed / YEAR), 'year');
}
