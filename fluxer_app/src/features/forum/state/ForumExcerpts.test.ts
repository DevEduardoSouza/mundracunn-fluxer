// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Exercises the excerpt plumbing end to end: `ensureExcerptLazy` (the lazy per-card fetch, its
 * cache, the concurrency gate and the guild-switch reset) and `excerptFromContent` (the text
 * preview). Only `RestTransport` (the network call) is stubbed, same as the covers test.
 */

vi.mock('@app/features/platform/transport/RestTransport', () => ({http: {get: vi.fn()}}));

import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

const {http} = await import('@app/features/platform/transport/RestTransport');
const {ensureExcerptLazy} = await import('@app/features/forum/commands/ForumExcerptCommands');
const {excerptFromContent, FORUM_EXCERPT_MAX_LENGTH} = await import('@app/features/forum/utils/ForumExcerpt');
const ForumExcerpts = (await import('@app/features/forum/state/ForumExcerpts')).default;

const getMock = http.get as unknown as Mock;

function firstMessage(content: string) {
	return {body: [{id: '1', channel_id: 'x', content, attachments: []}]};
}

afterEach(() => {
	getMock.mockReset();
	ForumExcerpts.reset();
});

describe('ensureExcerptLazy — lazy fetch of the first message', () => {
	it('asks for the oldest message of the channel and caches its text', async () => {
		getMock.mockResolvedValue(firstMessage('Olá turma, **primeiro** desenho!'));

		await ensureExcerptLazy('guild-a', 'chan-1');

		expect(getMock).toHaveBeenCalledTimes(1);
		const [path, options] = getMock.mock.calls[0]!;
		expect(path).toBe('/channels/chan-1/messages');
		expect(options.query).toMatchObject({limit: 1, after: '0'});
		expect(ForumExcerpts.getExcerpt('chan-1')).toBe('Olá turma, primeiro desenho!');
	});

	it('requests each channel only once, even when called again', async () => {
		getMock.mockResolvedValue(firstMessage('texto'));

		await Promise.all([ensureExcerptLazy('guild-a', 'chan-1'), ensureExcerptLazy('guild-a', 'chan-1')]);
		await ensureExcerptLazy('guild-a', 'chan-1');

		expect(getMock).toHaveBeenCalledTimes(1);
	});

	it('caches an empty excerpt for an image-only first message so it is not re-requested', async () => {
		getMock.mockResolvedValue(firstMessage(''));

		await ensureExcerptLazy('guild-a', 'chan-img');
		await ensureExcerptLazy('guild-a', 'chan-img');

		expect(getMock).toHaveBeenCalledTimes(1);
		expect(ForumExcerpts.hasExcerpt('chan-img')).toBe(true);
		expect(ForumExcerpts.getExcerpt('chan-img')).toBe('');
	});

	it('leaves nothing cached when the request fails, without throwing', async () => {
		const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
		getMock.mockRejectedValue(new Error('boom'));

		await expect(ensureExcerptLazy('guild-a', 'chan-err')).resolves.toBeUndefined();

		expect(ForumExcerpts.hasExcerpt('chan-err')).toBe(false);
		warn.mockRestore();
	});

	it('never runs more than three requests at the same time', async () => {
		let active = 0;
		let peak = 0;
		getMock.mockImplementation(
			() =>
				new Promise((resolve) => {
					active++;
					peak = Math.max(peak, active);
					setTimeout(() => {
						active--;
						resolve(firstMessage('t'));
					}, 0);
				}),
		);

		await Promise.all(['a', 'b', 'c', 'd', 'e', 'f'].map((id) => ensureExcerptLazy('guild-a', id)));

		expect(getMock).toHaveBeenCalledTimes(6);
		expect(peak).toBe(3);
	});
});

describe('ensureExcerptLazy — guild switch', () => {
	it('drops the previous guild excerpts on the first call for another guild', async () => {
		getMock.mockResolvedValue(firstMessage('texto'));
		await ensureExcerptLazy('guild-a', 'chan-1');
		expect(ForumExcerpts.getGuildId()).toBe('guild-a');

		await ensureExcerptLazy('guild-b', 'chan-2');

		expect(ForumExcerpts.getGuildId()).toBe('guild-b');
		expect(ForumExcerpts.hasExcerpt('chan-1')).toBe(false);
		expect(ForumExcerpts.getExcerpt('chan-2')).toBe('texto');
	});

	it('discards a response that lands after the guild changed', async () => {
		let resolveFirst: (value: unknown) => void = () => {};
		getMock.mockImplementationOnce(() => new Promise((resolve) => (resolveFirst = resolve)));
		getMock.mockResolvedValue(firstMessage('novo'));

		const pending = ensureExcerptLazy('guild-a', 'chan-1');
		// Let the first call get through the concurrency gate and onto the wire before switching.
		await new Promise((resolve) => setTimeout(resolve, 0));
		expect(getMock).toHaveBeenCalledTimes(1);
		await ensureExcerptLazy('guild-b', 'chan-2');
		resolveFirst(firstMessage('velho'));
		await pending;

		expect(ForumExcerpts.hasExcerpt('chan-1')).toBe(false);
		expect(ForumExcerpts.getExcerpt('chan-2')).toBe('novo');
	});

	it('reset clears everything', async () => {
		getMock.mockResolvedValue(firstMessage('texto'));
		await ensureExcerptLazy('guild-a', 'chan-1');

		ForumExcerpts.reset();

		expect(ForumExcerpts.getGuildId()).toBeNull();
		expect(ForumExcerpts.hasExcerpt('chan-1')).toBe(false);
		expect(ForumExcerpts.wasRequested('chan-1')).toBe(false);
	});
});

describe('excerptFromContent', () => {
	it('strips light markdown and collapses whitespace', () => {
		expect(excerptFromContent('# Título\n\n> citação\n**negrito** e `code`\n\n[link](https://x.y)')).toBe(
			'Título citação negrito e code link',
		);
	});

	it('drops code fences entirely', () => {
		expect(excerptFromContent('antes ```js\nconst a = 1;\n``` depois')).toBe('antes depois');
	});

	it('returns an empty string for empty or missing content', () => {
		expect(excerptFromContent('')).toBe('');
		expect(excerptFromContent(null)).toBe('');
		expect(excerptFromContent('   \n  ')).toBe('');
	});

	it('caps long text with an ellipsis', () => {
		const excerpt = excerptFromContent('a'.repeat(FORUM_EXCERPT_MAX_LENGTH + 50));
		expect(excerpt.length).toBe(FORUM_EXCERPT_MAX_LENGTH + 1);
		expect(excerpt.endsWith('…')).toBe(true);
	});
});
