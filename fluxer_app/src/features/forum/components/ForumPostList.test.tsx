// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * What `ForumPostList` itself owns is the layout decision: which group goes where, list versus
 * gallery, the collapsed "Postagens mais antigas" section, and the empty state. The row and the card
 * render their own contents (and each pulls covers, permissions and RuntimeConfig), so both are
 * replaced by stubs that print the post they were handed — a wiring bug still fails loudly here.
 *
 * DOM mounting follows the codebase's existing pattern: the happy-dom environment pragma + raw
 * `react-dom/client` + `act()`, no testing-library. (The pragma is deliberately not spelled out in
 * prose: knip scans comments and misreads a quoted mention as an environment package.)
 */
vi.mock('@app/features/forum/components/ForumPostRow', () => ({
	ForumPostRow: ({post}: {post: {title: string}}) => <div data-testid="row">{post.title}</div>,
}));
vi.mock('@app/features/forum/components/ForumPostCard', () => ({
	ForumPostCard: ({post}: {post: {title: string}}) => <div data-testid="card">{post.title}</div>,
}));
vi.mock('@app/features/ui/components/Scroller', () => ({
	Scroller: ({children}: {children?: React.ReactNode}) => <div>{children}</div>,
}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
vi.mock('@lingui/react/macro', () => {
	const fakeI18n = {
		_: (descriptor: {message?: string} | string, values?: Record<string, unknown>) => {
			const message = typeof descriptor === 'string' ? descriptor : (descriptor.message ?? '');
			return message.replace(/\{(\w+)\}/g, (_match, key: string) => String(values?.[key] ?? ''));
		},
	};
	return {useLingui: () => ({i18n: fakeI18n})};
});

import type React from 'react';

const {ForumPostList} = await import('@app/features/forum/components/ForumPostList');

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

let roots: Array<{container: HTMLDivElement; root: Root}> = [];

function post(title: string) {
	return {channel: {id: `channel-${title}`}, title, tags: [], authorId: null} as never;
}

async function mount(props: {
	viewMode?: 'list' | 'grid';
	followedPosts?: ReadonlyArray<unknown>;
	activePosts?: ReadonlyArray<unknown>;
	olderPosts?: ReadonlyArray<unknown>;
	showOnlyFollowed?: boolean;
}): Promise<HTMLDivElement> {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(
			<ForumPostList
				guildId="guild-a"
				viewMode={props.viewMode ?? 'list'}
				followedPosts={props.followedPosts as never}
				activePosts={(props.activePosts ?? []) as never}
				olderPosts={(props.olderPosts ?? []) as never}
				showOnlyFollowed={props.showOnlyFollowed}
			/>,
		);
	});
	roots.push({container, root});
	return container;
}

function texts(container: HTMLElement, testId: string): Array<string> {
	return [...container.querySelectorAll(`[data-testid="${testId}"]`)].map((node) => node.textContent ?? '');
}

async function click(element: Element): Promise<void> {
	await act(async () => {
		element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	});
}

afterEach(() => {
	for (const {container, root} of roots) {
		act(() => root.unmount());
		container.remove();
	}
	roots = [];
	vi.clearAllMocks();
});

describe('list and gallery', () => {
	it('renders one row per post, in the order it was given', async () => {
		const container = await mount({activePosts: [post('Alfa'), post('Beta')]});
		expect(texts(container, 'row')).toEqual(['Alfa', 'Beta']);
		expect(texts(container, 'card')).toEqual([]);
	});

	it('renders cards instead of rows in gallery mode', async () => {
		const container = await mount({viewMode: 'grid', activePosts: [post('Alfa')]});
		expect(texts(container, 'card')).toEqual(['Alfa']);
		expect(texts(container, 'row')).toEqual([]);
	});
});

describe('the "older posts" section', () => {
	it('is not rendered at all when nothing is inactive', async () => {
		const container = await mount({activePosts: [post('Alfa')]});
		expect(container.querySelector('[data-flx="forum.forum-post-list.older-section"]')).toBeNull();
	});

	it('starts collapsed, showing the count but not the posts', async () => {
		const container = await mount({activePosts: [post('Alfa')], olderPosts: [post('Velha'), post('Antiga')]});
		const toggle = container.querySelector('[data-flx="forum.forum-post-list.older-toggle"]')!;
		expect(toggle.textContent).toContain('Older posts (2)');
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
		expect(texts(container, 'row')).toEqual(['Alfa']);
	});

	it('reveals and hides the older posts when the heading is activated', async () => {
		const container = await mount({activePosts: [post('Alfa')], olderPosts: [post('Velha')]});
		const toggle = container.querySelector('[data-flx="forum.forum-post-list.older-toggle"]')!;

		await click(toggle);
		expect(texts(container, 'row')).toEqual(['Alfa', 'Velha']);
		expect(toggle.getAttribute('aria-expanded')).toBe('true');

		await click(toggle);
		expect(texts(container, 'row')).toEqual(['Alfa']);
		expect(toggle.getAttribute('aria-expanded')).toBe('false');
	});

	it('uses the same view mode as the active group', async () => {
		const container = await mount({viewMode: 'grid', activePosts: [post('Alfa')], olderPosts: [post('Velha')]});
		await click(container.querySelector('[data-flx="forum.forum-post-list.older-toggle"]')!);
		expect(texts(container, 'card')).toEqual(['Alfa', 'Velha']);
	});
});

describe('the "following" strip', () => {
	it('is not rendered when the user follows nothing', async () => {
		const container = await mount({activePosts: [post('Alfa')]});
		expect(container.querySelector('[data-flx="forum.forum-post-list.followed-section"]')).toBeNull();
	});

	it('puts the followed posts first, in their own section, before the rest', async () => {
		const container = await mount({followedPosts: [post('Seguida')], activePosts: [post('Alfa')]});
		const section = container.querySelector<HTMLElement>('[data-flx="forum.forum-post-list.followed-section"]')!;
		expect(section.textContent).toContain('Following');
		expect(texts(section, 'row')).toEqual(['Seguida']);
		expect(texts(container, 'row')).toEqual(['Seguida', 'Alfa']);
	});

	it('uses cards in gallery mode', async () => {
		const container = await mount({viewMode: 'grid', followedPosts: [post('Seguida')], activePosts: [post('Alfa')]});
		expect(texts(container, 'card')).toEqual(['Seguida', 'Alfa']);
	});

	it('carries the list alone when every active post is followed', async () => {
		const container = await mount({followedPosts: [post('Seguida')]});
		expect(texts(container, 'row')).toEqual(['Seguida']);
		expect(container.textContent).not.toContain('No posts match your search.');
	});
});

describe('the empty state', () => {
	it('explains the "following" filter when it is on and nothing is followed', async () => {
		const container = await mount({showOnlyFollowed: true});
		expect(container.textContent).toContain("You aren't following any posts yet.");
		expect(container.textContent).not.toContain('No posts match your search.');
	});

	it('says nothing matched when both groups are empty', async () => {
		const container = await mount({});
		expect(container.textContent).toContain('No posts match your search.');
	});

	it('stays quiet when the active group is empty only because everything is inactive', async () => {
		// The collapsed section below already carries the list — claiming "no posts match" there
		// would be wrong and would hide the fact that the posts are one click away.
		const container = await mount({olderPosts: [post('Velha')]});
		expect(container.textContent).not.toContain('No posts match your search.');
		expect(container.querySelector('[data-flx="forum.forum-post-list.older-toggle"]')).not.toBeNull();
	});
});
