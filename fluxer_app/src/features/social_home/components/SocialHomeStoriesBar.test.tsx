// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * "StoriesBar renderiza círculos das últimas 24h" — `SocialHomeStories.getVisibleStories()` (the
 * real 24h filter, already covered from the timestamp-math side in
 * `packages/snowflake/src/__tests__/SnowflakeUtils.test.ts`) and `groupStoriesByAuthor` (real, its
 * own tests live in `SocialHomeStoriesGrouping.test.ts`) both run unmocked here — this test is about
 * whether the bar actually renders one circle per group and reacts correctly to clicks. `Avatar`,
 * `Scroller`, `NicknameUtils`, and channel-permission discovery are stubbed for the same reason as
 * elsewhere in social_home: each needs `RuntimeConfig` for real (see `SocialHomeCommandMocks.ts`),
 * and none of their internals are this component's job to verify.
 *
 * The component's own mount effect calls `SocialHomeStories.reset()` before calling `fetchStories`
 * (see `SocialHomeStoriesBar.tsx`), so pre-seeding state *before* mounting gets wiped immediately —
 * the mocked `fetchStories` has to populate state itself, exactly like the real command's response
 * arriving. `mount()` awaits an async `act()` so that microtask lands before assertions run.
 */
vi.mock('@app/app/Routes', () => ({
	Routes: {guildChannel: (guildId: string, channelId: string) => `/channels/${guildId}/${channelId}`},
}));
vi.mock('@app/features/navigation/utils/RouterUtils', () => ({transitionTo: vi.fn()}));
vi.mock('@app/features/social_home/commands/SocialHomeStoriesCommands', () => ({
	fetchStories: vi.fn(),
	watchNewStories: vi.fn(() => () => {}),
}));
vi.mock('@app/features/social_home/commands/SocialHomeStoryViewerCommands', () => ({openStoryViewer: vi.fn()}));
vi.mock('@app/features/social_home/utils/SocialHomeChannelDiscovery', () => ({
	canPostStories: vi.fn(() => false),
	getStoriesChannel: vi.fn(() => ({id: 'ch-stories'})),
}));
vi.mock('@app/features/ui/components/Avatar', () => ({
	Avatar: ({user}: {user: {id: string; username: string}}) => (
		<span data-testid={`stub-avatar-${user.id}`}>{user.username}</span>
	),
}));
vi.mock('@app/features/ui/components/Scroller', () => ({
	Scroller: ({children, ...rest}: {children?: React.ReactNode}) => <div {...rest}>{children}</div>,
}));
vi.mock('@app/features/user/utils/NicknameUtils', () => ({getNickname: (user: {username: string}) => user.username}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
// `fakeI18n` MUST be declared inside the factory (not returned as a fresh literal per call): this
// component's mount effect depends on `i18n` ([i18n, guildId]) — a new object every render would
// make the dependency "change" every time, re-firing the effect forever (infinite reset -> fetch ->
// state mutation -> re-render loop). A stable reference is what useLingui() actually provides.
vi.mock('@lingui/react/macro', () => {
	const fakeI18n = {
		_: (descriptor: {message?: string} | string, values?: Record<string, string>) => {
			const template = typeof descriptor === 'string' ? descriptor : (descriptor.message ?? '');
			return values ? template.replace(/\{(\w+)\}/g, (_match, key) => values[key] ?? '') : template;
		},
	};
	return {useLingui: () => ({i18n: fakeI18n})};
});

import type React from 'react';

const RouterUtils = await import('@app/features/navigation/utils/RouterUtils');
const {fetchStories} = await import('@app/features/social_home/commands/SocialHomeStoriesCommands');
const {openStoryViewer} = await import('@app/features/social_home/commands/SocialHomeStoryViewerCommands');
const discovery = await import('@app/features/social_home/utils/SocialHomeChannelDiscovery');
const {SocialHomeStoriesBar} = await import('@app/features/social_home/components/SocialHomeStoriesBar');
const SocialHomeStories = (await import('@app/features/social_home/state/SocialHomeStories')).default;
const {testSnowflake, FIXTURE_BASE_TIMESTAMP_MS} = await import(
	'@app/features/social_home/__fixtures__/SocialHomeTestFixtures'
);

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const transitionToMock = RouterUtils.transitionTo as unknown as Mock;
const fetchStoriesMock = fetchStories as unknown as Mock;
const openStoryViewerMock = openStoryViewer as unknown as Mock;
const canPostStoriesMock = discovery.canPostStories as unknown as Mock;
const getStoriesChannelMock = discovery.getStoriesChannel as unknown as Mock;

const GUILD_ID = 'guild-turma-a';

function fakeStory(overrides: {id: string; authorId: string; username: string}) {
	return {id: overrides.id, author: {id: overrides.authorId, username: overrides.username}};
}

/** Makes the mocked fetchStories populate state the way the real command's response would. */
function mockFetchedStories(stories: ReadonlyArray<ReturnType<typeof fakeStory>>): void {
	fetchStoriesMock.mockImplementation(async (_i18n: unknown, guildId: string) => {
		SocialHomeStories.setGuildId(guildId);
		SocialHomeStories.setStories(stories as never);
	});
}

let mountedRoots: Array<{container: HTMLDivElement; reactRoot: Root}> = [];

async function mount(): Promise<HTMLDivElement> {
	const container = document.createElement('div');
	document.body.append(container);
	const reactRoot = createRoot(container);
	await act(async () => {
		reactRoot.render(<SocialHomeStoriesBar guildId={GUILD_ID} />);
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
	SocialHomeStories.stopClock();
	SocialHomeStories.reset();
	vi.clearAllMocks();
	vi.useRealTimers();
});

const CIRCLE_SELECTOR = '[data-flx="social_home.social-home-stories-bar.item"]';

describe('SocialHomeStoriesBar — circles within the last 24h', () => {
	it('renders exactly one circle per author, excluding a story older than 24h', async () => {
		vi.useFakeTimers({toFake: ['Date']});
		vi.setSystemTime(FIXTURE_BASE_TIMESTAMP_MS);
		mockFetchedStories([
			fakeStory({id: testSnowflake(0), authorId: 'professor', username: 'Professor'}),
			fakeStory({id: testSnowflake(-1_000), authorId: 'professor', username: 'Professor'}), // same author, another recent story
			fakeStory({id: testSnowflake(-25 * 60 * 60 * 1000), authorId: 'monitor', username: 'Monitor'}), // 25h old
		]);

		const container = await mount();

		const circles = container.querySelectorAll(CIRCLE_SELECTOR);
		expect(circles).toHaveLength(1); // only "professor" — monitor's lone story is outside the 24h window
		expect(circles[0]!.textContent).toContain('Professor');
	});

	it('renders no bar at all when there are no visible stories and the viewer can’t post', async () => {
		mockFetchedStories([]);
		canPostStoriesMock.mockReturnValue(false);

		const container = await mount();

		expect(container.querySelector('[data-flx="social_home.social-home-stories-bar.section"]')).toBeNull();
	});

	it('still renders the bar (with just the add button) when there are no stories but the viewer can post', async () => {
		mockFetchedStories([]);
		canPostStoriesMock.mockReturnValue(true);

		const container = await mount();

		expect(container.querySelector('[data-flx="social_home.social-home-stories-bar.section"]')).not.toBeNull();
		expect(container.querySelector('[data-flx="social_home.social-home-stories-bar.add-item"]')).not.toBeNull();
		expect(container.querySelectorAll(CIRCLE_SELECTOR)).toHaveLength(0);
	});
});

describe('SocialHomeStoriesBar — interaction', () => {
	it('opens the story viewer at the clicked author’s index when a circle is clicked', async () => {
		vi.useFakeTimers({toFake: ['Date']});
		vi.setSystemTime(FIXTURE_BASE_TIMESTAMP_MS);
		mockFetchedStories([
			fakeStory({id: testSnowflake(0), authorId: 'professor', username: 'Professor'}),
			fakeStory({id: testSnowflake(-1), authorId: 'monitor', username: 'Monitor'}),
		]);

		const container = await mount();
		const circles = container.querySelectorAll(CIRCLE_SELECTOR);
		expect(circles).toHaveLength(2);
		act(() => {
			circles[1]!.dispatchEvent(new MouseEvent('click', {bubbles: true}));
		});

		expect(openStoryViewerMock).toHaveBeenCalledTimes(1);
		const [groups, index] = openStoryViewerMock.mock.calls[0]!;
		expect(index).toBe(1);
		expect(groups[1].author.id).toBe('monitor');
	});

	it('navigates to the Stories channel when the add button is clicked', async () => {
		canPostStoriesMock.mockReturnValue(true);
		getStoriesChannelMock.mockReturnValue({id: 'ch-stories'});
		mockFetchedStories([]);

		const container = await mount();
		const addButton = container.querySelector('[data-flx="social_home.social-home-stories-bar.add-item"]')!;
		act(() => {
			addButton.dispatchEvent(new MouseEvent('click', {bubbles: true}));
		});

		expect(transitionToMock).toHaveBeenCalledWith(`/channels/${GUILD_ID}/ch-stories`);
	});
});
