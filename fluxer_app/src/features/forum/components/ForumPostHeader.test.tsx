// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The header is a pure projection of the channel: discovery says whether it's a forum post, the
 * topic carries title/tags, the author comes from the stores. All of those are faked; the follow
 * button has its own test and is stubbed. Mounting follows the feature's existing pattern
 * (happy-dom pragma + raw react-dom/client + act(), no testing-library).
 */
vi.mock('@app/features/forum/utils/ForumChannelDiscovery', () => ({
	isForumPostChannel: vi.fn(() => false),
	getForumPostAuthorId: vi.fn(() => null),
}));
vi.mock('@app/features/forum/components/ForumFollowButton', () => ({
	ForumFollowButton: ({channelId, size}: {channelId: string; size?: string}) => (
		<div data-testid="stub-follow">{`${channelId}:${size ?? ''}`}</div>
	),
}));
vi.mock('@app/features/navigation/utils/RouterUtils', () => ({transitionTo: vi.fn()}));
// Routes.ts imports this for marketing URLs; its import chain reaches RuntimeConfig.
vi.mock('@app/features/messaging/utils/MessagingUrlUtils', () => ({marketingUrl: (path: string) => path}));
vi.mock('@app/features/user/state/Users', () => ({default: {getUser: vi.fn()}}));
vi.mock('@app/features/member/state/GuildMembers', () => ({default: {getMember: vi.fn(() => null)}}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
vi.mock('@lingui/react/macro', () => {
	const fakeI18n = {
		_: (descriptor: {message?: string} | string, values?: Record<string, string>) => {
			const message = typeof descriptor === 'string' ? descriptor : (descriptor.message ?? '');
			return message.replace(/\{(\w+)\}/g, (_, key: string) => values?.[key] ?? '');
		},
	};
	return {useLingui: () => ({i18n: fakeI18n})};
});

const {isForumPostChannel, getForumPostAuthorId} = await import('@app/features/forum/utils/ForumChannelDiscovery');
const RouterUtils = await import('@app/features/navigation/utils/RouterUtils');
const Users = (await import('@app/features/user/state/Users')).default;
const GuildMembers = (await import('@app/features/member/state/GuildMembers')).default;
const {ForumPostHeader} = await import('@app/features/forum/components/ForumPostHeader');

import type {Channel} from '@app/features/channel/models/Channel';
import {serializeForumTopic} from '@app/features/forum/utils/ForumTopic';
import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const isForumPostChannelMock = isForumPostChannel as unknown as Mock;
const getForumPostAuthorIdMock = getForumPostAuthorId as unknown as Mock;
const transitionToMock = RouterUtils.transitionTo as unknown as Mock;
const getUserMock = Users.getUser as unknown as Mock;
const getMemberMock = GuildMembers.getMember as unknown as Mock;

const channel = {
	id: 'channel-post',
	name: 'meu-sketchbook',
	topic: serializeForumTopic({title: 'Meu sketchbook de agosto', tags: ['aquarela', 'estudo']}),
} as unknown as Channel;

let roots: Array<{container: HTMLDivElement; root: Root}> = [];

async function mount(): Promise<HTMLDivElement> {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<ForumPostHeader guildId="guild-a" channel={channel} />);
	});
	roots.push({container, root});
	return container;
}

beforeEach(() => {
	isForumPostChannelMock.mockReturnValue(true);
	getForumPostAuthorIdMock.mockReturnValue('user-2');
	getUserMock.mockReturnValue({displayName: 'Ana'});
	getMemberMock.mockReturnValue(null);
});

afterEach(() => {
	for (const {container, root} of roots) {
		act(() => root.unmount());
		container.remove();
	}
	roots = [];
	vi.clearAllMocks();
});

describe('ForumPostHeader', () => {
	it('renders nothing for a regular channel', async () => {
		isForumPostChannelMock.mockReturnValue(false);
		const container = await mount();
		expect(container.textContent).toBe('');
		expect(isForumPostChannelMock).toHaveBeenCalledWith('guild-a', channel);
	});

	it('shows the breadcrumb title, tags, author and follow button for a post', async () => {
		const container = await mount();
		expect(container.querySelector('[data-flx="forum.forum-post-header.title"]')!.textContent).toBe(
			'Meu sketchbook de agosto',
		);
		const tags = [...container.querySelectorAll('[data-flx="forum.forum-post-header.tag"]')].map(
			(node) => node.textContent,
		);
		expect(tags).toEqual(['#aquarela', '#estudo']);
		expect(container.querySelector('[data-flx="forum.forum-post-header.author"]')!.textContent).toBe('by Ana');
		expect(container.querySelector('[data-testid="stub-follow"]')!.textContent).toBe('channel-post:sm');
	});

	it('prefers the guild nickname over the global display name', async () => {
		getMemberMock.mockReturnValue({nick: 'Aninha'});
		const container = await mount();
		expect(container.querySelector('[data-flx="forum.forum-post-header.author"]')!.textContent).toBe('by Aninha');
	});

	it('falls back to the channel name when the topic is empty', async () => {
		const container = document.createElement('div');
		document.body.append(container);
		const root = createRoot(container);
		await act(async () => {
			root.render(<ForumPostHeader guildId="guild-a" channel={{...channel, topic: null} as unknown as Channel} />);
		});
		roots.push({container, root});
		expect(container.querySelector('[data-flx="forum.forum-post-header.title"]')!.textContent).toBe('meu-sketchbook');
	});

	it('navigates to the forum page when the breadcrumb root is clicked', async () => {
		const container = await mount();
		const link = container.querySelector('[data-flx="forum.forum-post-header.forum-link"]')!;
		expect(link.textContent).toBe('Community Sketchbooks');
		await act(async () => {
			link.dispatchEvent(new MouseEvent('click', {bubbles: true}));
		});
		expect(transitionToMock).toHaveBeenCalledWith('/channels/guild-a/forum');
	});
});
