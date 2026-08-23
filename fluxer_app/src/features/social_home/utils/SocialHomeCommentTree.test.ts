// SPDX-License-Identifier: AGPL-3.0-or-later

import {testSnowflake} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import {buildCommentTree} from '@app/features/social_home/utils/SocialHomeCommentTree';
import {MessageReferenceTypes} from '@fluxer/constants/src/ChannelConstants';
import {describe, expect, it} from 'vitest';

/**
 * `buildCommentTree` only ever reads `.id` and `.messageReference` off a `Message` — that type is
 * `import type`-only in `SocialHomeCommentTree.ts`, so plain objects shaped like the fields it reads
 * work fine here without constructing a real `Message` (which needs `RuntimeConfig` — see
 * `SocialHomeCommandMocks.ts` for why that's expensive). The component that renders this tree
 * (indentation) has its own test in `components/SocialHomeStoryCommentTree.test.tsx`.
 */
interface FakeMessage {
	id: string;
	messageReference?: {type: number; message_id: string};
}

function fakeMessage(id: string, replyTo?: string, type: number = MessageReferenceTypes.DEFAULT): FakeMessage {
	return {id, messageReference: replyTo != null ? {type, message_id: replyTo} : undefined};
}

function tree(root: FakeMessage, messages: ReadonlyArray<FakeMessage>, upperBoundStoryId: string | null = null) {
	return buildCommentTree(root as never, messages as never, upperBoundStoryId);
}

describe('buildCommentTree', () => {
	it('returns no nodes for a story with no replies', () => {
		const root = fakeMessage(testSnowflake(0));
		expect(tree(root, [])).toEqual([]);
	});

	it('nests a direct reply under the story and a reply-to-a-reply under that comment', () => {
		const root = fakeMessage(testSnowflake(0));
		const comment = fakeMessage(testSnowflake(1_000), root.id);
		const subComment = fakeMessage(testSnowflake(2_000), comment.id);

		const nodes = tree(root, [comment, subComment]);

		expect(nodes).toHaveLength(1);
		expect(nodes[0]!.message.id).toBe(comment.id);
		expect(nodes[0]!.children).toHaveLength(1);
		expect(nodes[0]!.children[0]!.message.id).toBe(subComment.id);
		expect(nodes[0]!.children[0]!.children).toEqual([]);
	});

	it('sorts siblings at every depth ascending by id (oldest first)', () => {
		const root = fakeMessage(testSnowflake(0));
		const second = fakeMessage(testSnowflake(2_000), root.id);
		const first = fakeMessage(testSnowflake(1_000), root.id);

		const nodes = tree(root, [second, first]);

		expect(nodes.map((node) => node.message.id)).toEqual([first.id, second.id]);
	});

	it('treats a message with no reply reference as a top-level comment, not noise (plain post in the discussion window)', () => {
		const root = fakeMessage(testSnowflake(0));
		const plainPost = fakeMessage(testSnowflake(1_000));

		const nodes = tree(root, [plainPost]);

		expect(nodes.map((node) => node.message.id)).toEqual([plainPost.id]);
		expect(nodes[0]!.isOrphan).toBe(false);
	});

	it('treats a forward reference as a plain top-level comment, not a reply chain (only DEFAULT references nest)', () => {
		const root = fakeMessage(testSnowflake(0));
		const forwarded = fakeMessage(testSnowflake(1_000), root.id, MessageReferenceTypes.FORWARD);

		const nodes = tree(root, [forwarded]);

		expect(nodes.map((node) => node.message.id)).toEqual([forwarded.id]);
		expect(nodes[0]!.children).toEqual([]);
	});

	it('marks a reply whose parent is missing from the loaded window as an orphan, anchored at the top level', () => {
		const root = fakeMessage(testSnowflake(0));
		const replyToDeletedParent = fakeMessage(testSnowflake(1_000), testSnowflake(500)); // parent id never appears in `messages`

		const nodes = tree(root, [replyToDeletedParent]);

		expect(nodes).toHaveLength(1);
		expect(nodes[0]!.message.id).toBe(replyToDeletedParent.id);
		expect(nodes[0]!.isOrphan).toBe(true);
	});

	it('excludes messages at or before the root id — only replies after the story itself count', () => {
		const root = fakeMessage(testSnowflake(1_000));
		const beforeRoot = fakeMessage(testSnowflake(500), root.id);
		const atRootId = fakeMessage(root.id, root.id);
		const afterRoot = fakeMessage(testSnowflake(1_500), root.id);

		const nodes = tree(root, [beforeRoot, atRootId, afterRoot]);

		expect(nodes.map((node) => node.message.id)).toEqual([afterRoot.id]);
	});

	it('excludes messages at or after upperBoundStoryId (the next story), keeping this window scoped to one story', () => {
		const root = fakeMessage(testSnowflake(0));
		const withinWindow = fakeMessage(testSnowflake(1_000), root.id);
		const nextStoryId = testSnowflake(2_000);
		const belongsToNextStory = fakeMessage(testSnowflake(2_500), nextStoryId);

		const nodes = tree(root, [withinWindow, belongsToNextStory], nextStoryId);

		expect(nodes.map((node) => node.message.id)).toEqual([withinWindow.id]);
	});

	it('returns a mix of nested replies, plain posts, and orphans all sorted together by id', () => {
		const root = fakeMessage(testSnowflake(0));
		const reply = fakeMessage(testSnowflake(3_000), root.id);
		const plainPost = fakeMessage(testSnowflake(1_000));
		const orphan = fakeMessage(testSnowflake(2_000), testSnowflake(999)); // parent not in window

		const nodes = tree(root, [reply, plainPost, orphan]);

		expect(nodes.map((node) => node.message.id)).toEqual([plainPost.id, orphan.id, reply.id]);
	});
});
