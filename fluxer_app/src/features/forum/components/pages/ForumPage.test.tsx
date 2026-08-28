// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * ForumPage owns only the top-level branching: no forum category -> structure empty state; a
 * category but no post channels -> "no posts" empty state; posts -> toolbar + list in the persisted
 * view mode. Everything heavy (ChannelHeader/ChannelViewScaffold, the store's computed projection of
 * Channels, the cover commands, the toolbar and list) is stubbed — each needs RuntimeConfig for real
 * and has its own test. The Forum store is faked so a test can hand the page exactly the posts /
 * view mode it wants to check the branch for.
 */
vi.mock('@app/features/channel/components/ChannelHeader', () => ({
	ChannelHeader: ({leftContent}: {leftContent?: React.ReactNode}) => <div data-testid="stub-header">{leftContent}</div>,
}));
vi.mock('@app/features/channel/components/channel_view/ChannelViewScaffold', () => ({
	ChannelViewScaffold: ({header, chatArea}: {header?: React.ReactNode; chatArea?: React.ReactNode}) => (
		<div data-testid="stub-scaffold">
			{header}
			{chatArea}
		</div>
	),
}));
vi.mock('@app/features/guild/state/Guilds', () => ({
	default: {getGuild: vi.fn(() => ({id: 'guild-a', name: 'Turma A'}))},
}));
vi.mock('@app/features/navigation/commands/NavigationCommands', () => ({selectChannel: vi.fn()}));
vi.mock('@app/features/permissions/state/Permission', () => ({default: {getGuildPermissions: vi.fn(() => 0n)}}));
vi.mock('@app/features/user/state/Users', () => ({default: {currentUserId: 'user-1'}}));
vi.mock('@app/features/forum/commands/ForumCoverCommands', () => ({fetchCovers: vi.fn(() => Promise.resolve())}));
vi.mock('@app/features/forum/utils/ForumChannelDiscovery', () => ({getForumCategories: vi.fn(() => [])}));
vi.mock('@app/features/forum/components/ForumToolbar', () => ({
	ForumToolbar: () => <div data-testid="stub-toolbar" />,
}));
vi.mock('@app/features/forum/components/ForumGuidelinesBanner', () => ({
	ForumGuidelinesBanner: () => <div data-testid="stub-guidelines" />,
}));
vi.mock('@app/features/forum/components/ForumPostList', () => ({
	ForumPostList: ({
		viewMode,
		activePosts,
		olderPosts,
	}: {
		viewMode: string;
		activePosts: ReadonlyArray<unknown>;
		olderPosts: ReadonlyArray<unknown>;
	}) => (
		<div data-testid="stub-list">
			{olderPosts.length > 0 ? `${viewMode}:${activePosts.length}:${olderPosts.length}` : `${viewMode}:${activePosts.length}`}
		</div>
	),
}));
vi.mock('@app/features/forum/state/ForumCovers', () => ({
	default: {reset: vi.fn(), getIsIndexing: vi.fn(() => false)},
}));

const forumState = {
	viewMode: 'list' as 'list' | 'grid',
	activePosts: [] as ReadonlyArray<unknown>,
	olderPosts: [] as ReadonlyArray<unknown>,
	postChannelIds: [] as ReadonlyArray<string>,
};
vi.mock('@app/features/forum/state/Forum', () => ({
	default: {
		setGuildId: vi.fn(),
		loadPrefs: vi.fn(),
		reset: vi.fn(),
		getActivePosts: () => forumState.activePosts,
		getOlderPosts: () => forumState.olderPosts,
		getViewMode: () => forumState.viewMode,
		getGuildPostChannelIds: () => forumState.postChannelIds,
	},
}));
vi.mock('@app/features/window/hooks/useFluxerDocumentTitle', () => ({useFluxerDocumentTitle: () => {}}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
vi.mock('@lingui/react/macro', () => {
	const fakeI18n = {
		_: (descriptor: {message?: string} | string) =>
			typeof descriptor === 'string' ? descriptor : (descriptor.message ?? ''),
	};
	return {useLingui: () => ({i18n: fakeI18n})};
});

import type React from 'react';

const {getForumCategories} = await import('@app/features/forum/utils/ForumChannelDiscovery');
const {ForumPage} = await import('@app/features/forum/components/pages/ForumPage');

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const getForumCategoriesMock = getForumCategories as unknown as Mock;

let roots: Array<{container: HTMLDivElement; root: Root}> = [];

async function mount(): Promise<HTMLDivElement> {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<ForumPage guildId="guild-a" />);
	});
	roots.push({container, root});
	return container;
}

beforeEach(() => {
	forumState.viewMode = 'list';
	forumState.activePosts = [];
	forumState.olderPosts = [];
	forumState.postChannelIds = [];
	getForumCategoriesMock.mockReturnValue([]);
});

afterEach(() => {
	for (const {container, root} of roots) {
		act(() => root.unmount());
		container.remove();
	}
	roots = [];
	vi.clearAllMocks();
});

describe('ForumPage', () => {
	it('shows the structure empty state when the guild has no forum category', async () => {
		const container = await mount();
		expect(container.textContent).toContain("doesn't have a forum yet");
		expect(container.querySelector('[data-testid="stub-list"]')).toBeNull();
	});

	it('shows the "no posts" empty state — with the toolbar still visible so the first post can be created', async () => {
		getForumCategoriesMock.mockReturnValue([{id: 'cat'}]);
		const container = await mount();
		expect(container.textContent).toContain('No forum posts yet.');
		expect(container.querySelector('[data-testid="stub-toolbar"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="stub-list"]')).toBeNull();
	});

	it('renders the toolbar and list once there are posts', async () => {
		getForumCategoriesMock.mockReturnValue([{id: 'cat'}]);
		forumState.postChannelIds = ['c1', 'c2'];
		forumState.activePosts = [{}, {}];
		const container = await mount();
		expect(container.querySelector('[data-testid="stub-toolbar"]')).not.toBeNull();
		expect(container.querySelector('[data-testid="stub-list"]')!.textContent).toBe('list:2');
	});

	it('shows the guidelines banner alongside the toolbar, and not before the forum exists', async () => {
		expect((await mount()).querySelector('[data-testid="stub-guidelines"]')).toBeNull();
		getForumCategoriesMock.mockReturnValue([{id: 'cat'}]);
		expect((await mount()).querySelector('[data-testid="stub-guidelines"]')).not.toBeNull();
	});

	it('hands the older-posts group to the list so it can render the collapsed section', async () => {
		getForumCategoriesMock.mockReturnValue([{id: 'cat'}]);
		forumState.postChannelIds = ['c1', 'c2'];
		forumState.activePosts = [{}];
		forumState.olderPosts = [{}, {}];
		const container = await mount();
		expect(container.querySelector('[data-testid="stub-list"]')!.textContent).toBe('list:1:2');
	});

	it('passes the persisted gallery view mode through to the list', async () => {
		getForumCategoriesMock.mockReturnValue([{id: 'cat'}]);
		forumState.postChannelIds = ['c1'];
		forumState.activePosts = [{}];
		forumState.viewMode = 'grid';
		const container = await mount();
		expect(container.querySelector('[data-testid="stub-list"]')!.textContent).toBe('grid:1');
	});
});
