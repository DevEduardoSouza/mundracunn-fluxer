// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * "Estados vazio/carregando/erro" — the Feed's half (Comments' own empty/loading/error states have
 * their own test in `SocialHomeStoryCommentTree.test.tsx`). `SocialHomePage.tsx` owns this
 * conditional text directly (loading/indexing/error/empty), so it's the thing under test here —
 * everything else on the page (`ChannelHeader`, `ChannelViewScaffold`, `Guilds`, the Feed list,
 * publish bar, Stories bar, comments panel) is stubbed, both because each needs `RuntimeConfig` for
 * real (see `SocialHomeCommandMocks.ts`) and because their own rendering is each their own test's
 * job, not this page's.
 *
 * The page's mount effect calls `SocialHome.reset()` before calling `fetchFeed` (same shape as
 * `SocialHomeStoriesBar` — see that test file), so pre-seeding `SocialHome` state before mounting
 * gets wiped immediately. The mocked `fetchFeed` has to set state itself, the way the real fetch
 * resolving would; `mount()` awaits an async `act()` so that microtask lands before assertions run.
 */
vi.mock('@app/features/channel/components/ChannelHeader', () => ({
	ChannelHeader: ({leftContent}: {leftContent?: React.ReactNode}) => (
		<div data-testid="stub-channel-header">{leftContent}</div>
	),
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
	default: {getGuild: vi.fn(() => ({id: 'guild-turma-a', name: 'Turma A'}))},
}));
vi.mock('@app/features/social_home/commands/SocialHomeCommands', () => ({
	fetchFeed: vi.fn(),
	fetchNextFeedPage: vi.fn(),
}));
vi.mock('@app/features/social_home/components/SocialHomeFeedList', () => ({
	SocialHomeFeedList: ({posts}: {posts: ReadonlyArray<unknown>}) => (
		<div data-testid="stub-feed-list">{posts.length} posts</div>
	),
}));
vi.mock('@app/features/social_home/components/SocialHomePublishBar', () => ({
	SocialHomePublishBar: () => <div data-testid="stub-publish-bar" />,
}));
vi.mock('@app/features/social_home/components/SocialHomeStoriesBar', () => ({
	SocialHomeStoriesBar: () => <div data-testid="stub-stories-bar" />,
}));
vi.mock('@app/features/social_home/components/SocialHomeStoryCommentsPanel', () => ({
	SocialHomeStoryCommentsPanel: () => <div data-testid="stub-comments-panel" />,
}));
vi.mock('@app/features/window/hooks/useFluxerDocumentTitle', () => ({useFluxerDocumentTitle: () => {}}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
// `fakeI18n` declared inside the factory for a stable reference — this page's mount effect depends
// on `i18n` ([i18n, guildId]); a fresh object every call would re-fire it forever. See
// SocialHomeStoriesBar.test.tsx for the failure mode this avoids.
vi.mock('@lingui/react/macro', () => {
	const fakeI18n = {
		_: (descriptor: {message?: string} | string) =>
			typeof descriptor === 'string' ? descriptor : (descriptor.message ?? ''),
	};
	return {useLingui: () => ({i18n: fakeI18n})};
});

import type React from 'react';

const {fetchFeed} = await import('@app/features/social_home/commands/SocialHomeCommands');
const {SocialHomePage} = await import('@app/features/social_home/components/pages/SocialHomePage');
const SocialHome = (await import('@app/features/social_home/state/SocialHome')).default;

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const fetchFeedMock = fetchFeed as unknown as Mock;
const GUILD_ID = 'guild-turma-a';

/** Makes the mocked fetchFeed apply state the way the real command's response would. */
function mockFeedResult(apply: () => void): void {
	fetchFeedMock.mockImplementation(async () => {
		apply();
	});
}

let mountedRoots: Array<{container: HTMLDivElement; reactRoot: Root}> = [];

async function mount(): Promise<HTMLDivElement> {
	const container = document.createElement('div');
	document.body.append(container);
	const reactRoot = createRoot(container);
	await act(async () => {
		reactRoot.render(<SocialHomePage guildId={GUILD_ID} />);
	});
	mountedRoots.push({container, reactRoot});
	return container;
}

afterEach(() => {
	for (const {container, reactRoot} of mountedRoots) {
		act(() => {
			reactRoot.unmount();
		});
		container.remove();
	}
	mountedRoots = [];
	SocialHome.reset();
	vi.clearAllMocks();
});

describe('SocialHomePage — feed states', () => {
	it('shows the loading placeholder while the first fetch is in flight, and no post count', async () => {
		mockFeedResult(() => SocialHome.setLoading(true));

		const container = await mount();

		expect(container.textContent).toContain('Loading feed…');
		expect(container.querySelector('[data-testid="stub-feed-list"]')).toBeNull();
	});

	it('shows the indexing placeholder when the search backend is still indexing', async () => {
		mockFeedResult(() => SocialHome.setIndexing());

		const container = await mount();

		expect(container.textContent).toContain('try again in a moment');
	});

	it('shows the error placeholder when the fetch failed', async () => {
		mockFeedResult(() => SocialHome.setError('network down'));

		const container = await mount();

		expect(container.textContent).toContain("Couldn't load the feed.");
	});

	it('shows the empty placeholder when there are no posts and nothing is loading/erroring', async () => {
		mockFeedResult(() => SocialHome.setPosts([], {append: false}));

		const container = await mount();

		expect(container.textContent).toContain('No posts yet.');
	});

	it('renders the Feed list (not a placeholder) once there are posts', async () => {
		mockFeedResult(() => SocialHome.setPosts([{id: '1'}, {id: '2'}] as never, {append: false}));

		const container = await mount();

		const feedList = container.querySelector('[data-testid="stub-feed-list"]');
		expect(feedList).not.toBeNull();
		expect(feedList!.textContent).toBe('2 posts');
		expect(container.textContent).not.toContain('No posts yet.');
	});
});
