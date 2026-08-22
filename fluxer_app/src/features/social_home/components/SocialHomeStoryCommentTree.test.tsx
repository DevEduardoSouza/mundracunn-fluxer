// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * "CommentTree renderiza indentação correta" + "Estados vazio/carregando/erro" (the comments half —
 * the Feed's own empty/loading/error states have their own test in `SocialHomePage.test.tsx`).
 * `buildCommentTree` (the actual nesting logic) is pure/leaf and runs for real here — it already has
 * its own dedicated tests in `SocialHomeCommentTree.test.ts`; this test is about what the component
 * does with that tree: does depth map to the right `--comment-depth` CSS variable, capped at
 * MAX_VISUAL_DEPTH. `ChannelMessage` and `MessagingMessages` are stubbed for the same reason as
 * `SocialHomeFeedList.test.tsx` (a real one needs `RuntimeConfig` — see `SocialHomeCommandMocks.ts`).
 */
vi.mock('@app/features/channel/components/ChannelMessage', () => ({
	Message: ({message}: {message: {id: string; content: string}}) => (
		<div data-testid={`stub-message-${message.id}`}>{message.content}</div>
	),
}));
vi.mock('@app/features/messaging/state/MessagingMessages', () => ({
	default: {version: 0, getMessages: vi.fn(() => ({toArray: () => []}))},
}));
vi.mock('@app/features/social_home/commands/SocialHomeStoryCommentsCommands', () => ({loadMoreComments: vi.fn()}));
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

const Messages = (await import('@app/features/messaging/state/MessagingMessages')).default;
const {loadMoreComments} = await import('@app/features/social_home/commands/SocialHomeStoryCommentsCommands');
const {SocialHomeStoryCommentTree} = await import('@app/features/social_home/components/SocialHomeStoryCommentTree');
const SocialHomeStoryComments = (await import('@app/features/social_home/state/SocialHomeStoryComments')).default;

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const getMessagesMock = Messages.getMessages as unknown as Mock;
const loadMoreCommentsMock = loadMoreComments as unknown as Mock;

const CHANNEL = {id: 'ch-stories'};
const ROOT_ID = '1000';

function fakeMessage(id: string, replyTo?: string) {
	return {
		id,
		content: `mensagem ${id}`,
		messageReference: replyTo != null ? {type: 0, message_id: replyTo} : undefined,
	};
}

let mountedRoots: Array<{container: HTMLDivElement; reactRoot: Root}> = [];

function mountTree(root: {id: string} = {id: ROOT_ID}) {
	const container = document.createElement('div');
	document.body.append(container);
	const reactRoot = createRoot(container);
	act(() => {
		reactRoot.render(<SocialHomeStoryCommentTree root={root as never} channel={CHANNEL as never} />);
	});
	mountedRoots.push({container, reactRoot});
	return {container, reactRoot};
}

afterEach(() => {
	for (const {container, reactRoot} of mountedRoots) {
		act(() => {
			reactRoot.unmount();
		});
		container.remove();
	}
	mountedRoots = [];
	SocialHomeStoryComments.close();
	vi.clearAllMocks();
});

describe('SocialHomeStoryCommentTree — indentation', () => {
	it('assigns increasing --comment-depth per nesting level, capped at MAX_VISUAL_DEPTH (6)', () => {
		SocialHomeStoryComments.open(ROOT_ID, CHANNEL.id, null);
		const chain: Array<ReturnType<typeof fakeMessage>> = [];
		let previousId = ROOT_ID;
		for (let depth = 1; depth <= 8; depth++) {
			const id = String(1000 + depth);
			chain.push(fakeMessage(id, previousId));
			previousId = id;
		}
		getMessagesMock.mockReturnValue({toArray: () => chain});

		const {container} = mountTree();

		const nodes = Array.from(
			container.querySelectorAll('[data-flx="social_home.social-home-story-comment-tree.comment-tree-node.node"]'),
		) as Array<HTMLElement>;
		expect(nodes).toHaveLength(8);
		const depths = nodes.map((node) => node.style.getPropertyValue('--comment-depth'));
		expect(depths).toEqual(['0', '1', '2', '3', '4', '5', '6', '6']); // depths 6 and 7 both cap at 6
	});

	it('keeps sibling comments at the same depth', () => {
		SocialHomeStoryComments.open(ROOT_ID, CHANNEL.id, null);
		getMessagesMock.mockReturnValue({toArray: () => [fakeMessage('1001', ROOT_ID), fakeMessage('1002', ROOT_ID)]});

		const {container} = mountTree();

		const nodes = Array.from(
			container.querySelectorAll('[data-flx="social_home.social-home-story-comment-tree.comment-tree-node.node"]'),
		) as Array<HTMLElement>;
		expect(nodes.map((node) => node.style.getPropertyValue('--comment-depth'))).toEqual(['0', '0']);
	});
});

describe('SocialHomeStoryCommentTree — empty / loading / error states', () => {
	it('shows the empty state when the story has no comments', () => {
		SocialHomeStoryComments.open(ROOT_ID, CHANNEL.id, null);
		getMessagesMock.mockReturnValue({toArray: () => []});

		const {container} = mountTree();

		expect(container.textContent).toContain('No comments yet.');
	});

	it('shows the loading state instead of the empty state while the first page is loading', () => {
		SocialHomeStoryComments.open(ROOT_ID, CHANNEL.id, null);
		SocialHomeStoryComments.setLoadingInitial(true);
		getMessagesMock.mockReturnValue({toArray: () => []});

		const {container} = mountTree();

		expect(container.textContent).toContain('Loading comments…');
		expect(container.textContent).not.toContain('No comments yet.');
	});

	it('shows the error state instead of the empty state when loading failed', () => {
		SocialHomeStoryComments.open(ROOT_ID, CHANNEL.id, null);
		SocialHomeStoryComments.setError('network down');
		getMessagesMock.mockReturnValue({toArray: () => []});

		const {container} = mountTree();

		expect(container.textContent).toContain("Couldn't load comments.");
		expect(container.textContent).not.toContain('No comments yet.');
	});

	it('shows an enabled "load more" button when there is more, and calls loadMoreComments on click', () => {
		SocialHomeStoryComments.open(ROOT_ID, CHANNEL.id, null);
		getMessagesMock.mockReturnValue({toArray: () => [fakeMessage('1001', ROOT_ID)]});

		const {container} = mountTree();
		const button = container.querySelector('button')!;
		expect(button.textContent).toBe('Load more comments');
		expect(button.disabled).toBe(false);

		act(() => {
			button.dispatchEvent(new MouseEvent('click', {bubbles: true}));
		});
		expect(loadMoreCommentsMock).toHaveBeenCalledTimes(1);
	});

	it('disables and relabels the "load more" button while a page is already loading', () => {
		SocialHomeStoryComments.open(ROOT_ID, CHANNEL.id, null);
		SocialHomeStoryComments.setLoadingMore(true);
		getMessagesMock.mockReturnValue({toArray: () => [fakeMessage('1001', ROOT_ID)]});

		const {container} = mountTree();
		const button = container.querySelector('button')!;

		expect(button.textContent).toBe('Loading more…');
		expect(button.disabled).toBe(true);
	});
});
