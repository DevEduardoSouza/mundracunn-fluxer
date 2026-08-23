// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * "FeedCard renderiza autor, imagem, texto e reações" — the real per-card rendering (author name,
 * attachment, markdown text, reaction bar) is `ChannelMessage`'s own job (Fluxer core, not this
 * fork's code, and 900+ lines pulling in markdown/emoji/reactions/RuntimeConfig — see
 * `SocialHomeCommandMocks.ts` for why that chain is expensive to stand up in a test). What
 * `SocialHomeFeedList` itself owns — and what this test actually verifies — is that it wires the
 * right post/channel into a card for every post, in order, and that "View in Sketchbook" deep-links
 * correctly. `ChannelMessage` is replaced with a stub that renders the fields it *would have been
 * given*, so a wiring bug (wrong channel, dropped post, stale props) still fails loudly here.
 *
 * DOM mounting follows this codebase's only existing pattern for it (see
 * `voice/components/VoiceLiveKitRoot.test.tsx`): the happy-dom vitest environment pragma + raw
 * `react-dom/client` + `act()`, no testing-library. (The pragma is deliberately not spelled out
 * here: knip scans comments for it and misreads a quoted mention as an environment package.)
 */
vi.mock('@app/app/Routes', () => ({
	Routes: {
		channelMessage: (guildId: string, channelId: string, messageId: string) =>
			`/channels/${guildId}/${channelId}/${messageId}`,
	},
}));
vi.mock('@app/features/channel/state/Channels', () => ({default: {getChannel: vi.fn()}}));
vi.mock('@app/features/navigation/utils/RouterUtils', () => ({transitionTo: vi.fn()}));
vi.mock('@app/features/ui/components/Scroller', () => ({
	Scroller: forwardRef<HTMLDivElement, {children?: React.ReactNode; onScroll?: () => void}>(
		({children, ...rest}, ref) => (
			<div ref={ref} {...rest}>
				{children}
			</div>
		),
	),
}));
vi.mock('@app/features/channel/components/ChannelMessage', () => ({
	Message: ({
		message,
		channel,
	}: {
		message: {id: string; content: string; author: {username: string}; attachments: Array<unknown>};
		channel: {id: string};
	}) => (
		<div data-testid={`stub-message-${message.id}`}>
			<span data-testid="author">{message.author.username}</span>
			<span data-testid="content">{message.content}</span>
			<span data-testid="has-image">{message.attachments.length > 0 ? 'yes' : 'no'}</span>
			<span data-testid="channel-id">{channel.id}</span>
		</div>
	),
}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
// `fakeI18n` is declared inside the factory (not a fresh literal per call) so useLingui() returns a
// stable reference — matters wherever a component keys a useEffect off `i18n`, which would
// otherwise re-fire every render and loop forever. See SocialHomeStoriesBar.test.tsx.
vi.mock('@lingui/react/macro', () => {
	const fakeI18n = {
		_: (descriptor: {message?: string} | string) =>
			typeof descriptor === 'string' ? descriptor : (descriptor.message ?? ''),
	};
	return {useLingui: () => ({i18n: fakeI18n})};
});

const Channels = (await import('@app/features/channel/state/Channels')).default;
const RouterUtils = await import('@app/features/navigation/utils/RouterUtils');
const {SocialHomeFeedList} = await import('@app/features/social_home/components/SocialHomeFeedList');

import type React from 'react';
import {act, forwardRef} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const getChannelMock = Channels.getChannel as unknown as Mock;
const transitionToMock = RouterUtils.transitionTo as unknown as Mock;

const GUILD_ID = 'guild-turma-a';
const ANA_CHANNEL_ID = 'ch-sketchbook-ana';

function post(overrides: {id: string; content?: string; hasImage?: boolean; author?: string}) {
	return {
		id: overrides.id,
		channelId: ANA_CHANNEL_ID,
		content: overrides.content ?? '',
		author: {username: overrides.author ?? 'ana.aluna'},
		attachments: overrides.hasImage === false ? [] : [{content_type: 'image/png'}],
	};
}

describe('SocialHomeFeedList', () => {
	let container: HTMLDivElement | null = null;
	let root: Root | null = null;

	beforeEach(() => {
		getChannelMock.mockReturnValue({id: ANA_CHANNEL_ID, name: 'sketchbook-ana'});
		container = document.createElement('div');
		document.body.append(container);
		root = createRoot(container);
	});

	afterEach(() => {
		act(() => {
			root?.unmount();
		});
		root = null;
		container?.remove();
		container = null;
		vi.clearAllMocks();
	});

	it('renders one card per post, in the order given, wiring the matching post and channel into each', () => {
		const posts = [
			post({id: 'post-1', content: 'terminei o estudo de sombra', author: 'ana.aluna'}),
			post({id: 'post-2', content: 'referencia de hoje', author: 'professor'}),
		];

		act(() => {
			root?.render(
				<SocialHomeFeedList
					guildId={GUILD_ID}
					posts={posts as never}
					hasMore={false}
					isLoadingMore={false}
					onLoadMore={() => {}}
				/>,
			);
		});

		const rendered = container!.querySelectorAll('[data-testid^="stub-message-"]');
		expect(rendered).toHaveLength(2);
		expect(rendered[0]!.getAttribute('data-testid')).toBe('stub-message-post-1');
		expect(rendered[0]!.querySelector('[data-testid="author"]')!.textContent).toBe('ana.aluna');
		expect(rendered[0]!.querySelector('[data-testid="content"]')!.textContent).toBe('terminei o estudo de sombra');
		expect(rendered[0]!.querySelector('[data-testid="has-image"]')!.textContent).toBe('yes');
		expect(rendered[0]!.querySelector('[data-testid="channel-id"]')!.textContent).toBe(ANA_CHANNEL_ID);
		expect(rendered[1]!.getAttribute('data-testid')).toBe('stub-message-post-2');
	});

	it('skips a post whose channel can’t be resolved instead of crashing', () => {
		getChannelMock.mockReturnValue(undefined);
		const posts = [post({id: 'post-1'})];

		act(() => {
			root?.render(
				<SocialHomeFeedList
					guildId={GUILD_ID}
					posts={posts as never}
					hasMore={false}
					isLoadingMore={false}
					onLoadMore={() => {}}
				/>,
			);
		});

		expect(container!.querySelectorAll('[data-testid^="stub-message-"]')).toHaveLength(0);
	});

	it('navigates to the original Sketchbook message when "View in Sketchbook" is clicked', () => {
		const posts = [post({id: 'post-1'})];
		act(() => {
			root?.render(
				<SocialHomeFeedList
					guildId={GUILD_ID}
					posts={posts as never}
					hasMore={false}
					isLoadingMore={false}
					onLoadMore={() => {}}
				/>,
			);
		});

		const viewButton = container!.querySelector('button');
		expect(viewButton).not.toBeNull();
		act(() => {
			viewButton!.dispatchEvent(new MouseEvent('click', {bubbles: true}));
		});

		expect(transitionToMock).toHaveBeenCalledWith(`/channels/${GUILD_ID}/${ANA_CHANNEL_ID}/post-1`);
	});
});
