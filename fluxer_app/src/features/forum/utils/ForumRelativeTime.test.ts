// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The point of this helper is that the forum's "ativo {time}" line stops rendering raw English
 * ("ativo 3d", "ativo now"), so the assertions check the pt-BR output specifically — that is the
 * locale the class actually runs in.
 */

import {formatForumRelativeTime} from '@app/features/forum/utils/ForumRelativeTime';
import {describe, expect, it} from 'vitest';

const SECOND = 1000;
const MINUTE = 60 * SECOND;
const HOUR = 60 * MINUTE;
const DAY = 24 * HOUR;
const NOW = Date.parse('2026-08-28T12:00:00.000Z');

function ptBR(elapsedMs: number): string {
	return formatForumRelativeTime('pt-BR', NOW - elapsedMs, NOW);
}

describe('formatForumRelativeTime — pt-BR', () => {
	it.each([
		[0, 'agora'],
		[30 * SECOND, 'agora'],
	])('collapses %ims to the locale\'s "now"', (elapsed, expected) => {
		expect(ptBR(elapsed)).toBe(expected);
	});

	it('picks the largest unit that still fits', () => {
		expect(ptBR(5 * MINUTE)).toBe('há 5 minutos');
		expect(ptBR(3 * HOUR)).toBe('há 3 horas');
		expect(ptBR(3 * DAY)).toBe('há 3 dias');
		expect(ptBR(60 * DAY)).toBe('há 2 meses');
		// numeric: 'auto' prefers the idiomatic wording over "há 1 ano".
		expect(ptBR(400 * DAY)).toBe('ano passado');
		expect(ptBR(800 * DAY)).toBe('há 2 anos');
	});

	it('never renders a bare English abbreviation', () => {
		for (const elapsed of [0, MINUTE, HOUR, DAY, 45 * DAY, 500 * DAY]) {
			expect(ptBR(elapsed)).not.toMatch(/^\d+(m|h|d|w|mo|y)$/);
		}
	});

	it('uses "yesterday"-style wording where the locale has one', () => {
		// numeric: 'auto' is what turns "há 1 dia" into "ontem" — the natural reading.
		expect(ptBR(DAY)).toBe('ontem');
	});

	it('follows the requested locale', () => {
		expect(formatForumRelativeTime('en-US', NOW - 3 * DAY, NOW)).toBe('3 days ago');
	});

	it('treats a clock skew into the future as "now" instead of counting up', () => {
		expect(formatForumRelativeTime('pt-BR', NOW + 5 * MINUTE, NOW)).toBe('agora');
	});
});
