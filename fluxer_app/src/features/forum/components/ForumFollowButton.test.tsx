// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The button owns two things: mirroring the follow state (label, `aria-pressed`, filled star) and
 * turning a click into `toggleFollowForumPost` without letting it bubble to the clickable row/card
 * around it. The commands module is faked wholesale — following is the Favorites store plus the
 * mute settings underneath, none of which matters here.
 *
 * DOM mounting follows the codebase's existing pattern: the happy-dom environment pragma + raw
 * `react-dom/client` + `act()`, no testing-library. (The pragma is deliberately not spelled out in
 * prose: knip scans comments and misreads a quoted mention as an environment package.)
 */
vi.mock('@app/features/forum/commands/ForumFollowCommands', () => ({
	isFollowingForumPost: vi.fn(() => false),
	toggleFollowForumPost: vi.fn(),
}));
vi.mock('@app/features/ui/tooltip/Tooltip', () => ({
	Tooltip: ({children}: {children?: React.ReactNode}) => <>{children}</>,
}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
vi.mock('@lingui/react/macro', () => {
	const fakeI18n = {
		_: (descriptor: {message?: string} | string) =>
			typeof descriptor === 'string' ? descriptor : (descriptor.message ?? ''),
	};
	return {useLingui: () => ({i18n: fakeI18n})};
});

import type React from 'react';

const ForumFollowCommands = await import('@app/features/forum/commands/ForumFollowCommands');
const {ForumFollowButton} = await import('@app/features/forum/components/ForumFollowButton');

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const isFollowingMock = ForumFollowCommands.isFollowingForumPost as unknown as Mock;
const toggleMock = ForumFollowCommands.toggleFollowForumPost as unknown as Mock;

let roots: Array<{container: HTMLDivElement; root: Root}> = [];

async function mount(props: {size?: 'sm' | 'md'} = {}): Promise<{container: HTMLDivElement; parentClicks: Mock}> {
	const container = document.createElement('div');
	document.body.append(container);
	// Stand-in for the clickable row/card around the button. It has to sit ABOVE the React root:
	// React delegates events at the root node, so a listener there would fire regardless.
	const parentClicks = vi.fn();
	container.addEventListener('click', parentClicks);
	const mountPoint = document.createElement('div');
	container.append(mountPoint);
	const root = createRoot(mountPoint);
	await act(async () => {
		root.render(<ForumFollowButton channelId="post-1" size={props.size} />);
	});
	roots.push({container, root});
	return {container, parentClicks};
}

function button(container: HTMLElement): HTMLButtonElement {
	return container.querySelector('[data-flx="forum.forum-follow-button.button"]')!;
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
	isFollowingMock.mockReturnValue(false);
});

describe('what it shows', () => {
	it('offers to follow a post the user does not follow', async () => {
		const {container} = await mount();
		expect(button(container).textContent).toBe('Follow');
		expect(button(container).getAttribute('aria-pressed')).toBe('false');
	});

	it('shows "Following" for a followed post', async () => {
		isFollowingMock.mockReturnValue(true);
		const {container} = await mount();
		expect(button(container).textContent).toBe('Following');
		expect(button(container).getAttribute('aria-pressed')).toBe('true');
		expect(button(container).dataset.following).toBe('true');
	});

	it('is icon-only with an accessible action name in the compact size', async () => {
		isFollowingMock.mockReturnValue(true);
		const {container} = await mount({size: 'sm'});
		expect(button(container).textContent).toBe('');
		expect(button(container).getAttribute('aria-label')).toBe('Unfollow');
	});
});

describe('clicking', () => {
	it('toggles through the shared command', async () => {
		const {container} = await mount();
		await click(button(container));
		expect(toggleMock).toHaveBeenCalledWith('post-1');
	});

	it('does not open the row or card it sits in', async () => {
		const {container, parentClicks} = await mount({size: 'sm'});
		await click(button(container));
		expect(toggleMock).toHaveBeenCalledTimes(1);
		expect(parentClicks).not.toHaveBeenCalled();
	});
});
