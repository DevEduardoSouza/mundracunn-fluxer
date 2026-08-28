// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	forumChannelNameFromTitle,
	getForumTitleError,
	normalizeForumTag,
	parseForumTopic,
	serializeForumTopic,
} from '@app/features/forum/utils/ForumTopic';
import {describe, expect, it} from 'vitest';

describe('serializeForumTopic / parseForumTopic — round trip', () => {
	it('keeps the original title verbatim on line 1', () => {
		const topic = serializeForumTopic({title: 'Estudo de Luz & Sombra!', tags: []});
		expect(topic).toBe('Estudo de Luz & Sombra!');
		expect(parseForumTopic(topic)).toEqual({title: 'Estudo de Luz & Sombra!', tags: []});
	});

	it('puts normalized tags as #tags on line 2', () => {
		const topic = serializeForumTopic({title: 'Minha arte', tags: ['Pintura Digital', 'ESTUDO', 'estudo']});
		expect(topic).toBe('Minha arte\n#pintura-digital #estudo');
		expect(parseForumTopic(topic)).toEqual({title: 'Minha arte', tags: ['pintura-digital', 'estudo']});
	});

	it('collapses newlines in the title into a single line', () => {
		expect(serializeForumTopic({title: 'linha 1\nlinha 2', tags: []})).toBe('linha 1 linha 2');
	});

	it('treats a non-tag second line as not-tags (title only)', () => {
		expect(parseForumTopic('Meu título\numa descrição escrita à mão')).toEqual({
			title: 'Meu título',
			tags: [],
		});
	});

	it('returns an empty result for a null/blank topic', () => {
		expect(parseForumTopic(null)).toEqual({title: null, tags: []});
		expect(parseForumTopic('   ')).toEqual({title: null, tags: []});
	});
});

describe('normalizeForumTag', () => {
	it('slugs to lowercase a–z0–9- with no repeated or edge hyphens', () => {
		expect(normalizeForumTag('  Óleo sobre Tela  ')).toBe('leo-sobre-tela');
		expect(normalizeForumTag('#já-com-hash')).toBe('j-com-hash');
		expect(normalizeForumTag('---')).toBe('');
	});
});

describe('forumChannelNameFromTitle — mirrors the API sanitizer', () => {
	it('lowercases, turns spaces into hyphens and drops punctuation', () => {
		expect(forumChannelNameFromTitle('Estudo de Luz & Sombra!')).toBe('estudo-de-luz--sombra');
	});

	it('never returns empty', () => {
		expect(forumChannelNameFromTitle('!!!')).toBe('-');
		expect(forumChannelNameFromTitle('   ')).toBe('-');
	});

	it('clamps to 100 characters', () => {
		expect(forumChannelNameFromTitle('a'.repeat(150))).toHaveLength(100);
	});
});

describe('getForumTitleError', () => {
	it('flags empty and over-long titles, accepts the rest', () => {
		expect(getForumTitleError('')).toBe('empty');
		expect(getForumTitleError('   ')).toBe('empty');
		expect(getForumTitleError('a'.repeat(101))).toBe('too_long');
		expect(getForumTitleError('Um título normal')).toBeNull();
	});
});
