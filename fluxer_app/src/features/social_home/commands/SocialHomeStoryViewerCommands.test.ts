// SPDX-License-Identifier: AGPL-3.0-or-later

import {testSnowflake} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import type {StoryGroup} from '@app/features/social_home/utils/SocialHomeStoriesGrouping';
import {afterEach, describe, expect, it, type Mock, vi} from 'vitest';

/**
 * "StoryViewer abre imagem e vídeo" — there's no dedicated story viewer component in this fork; a
 * story reuses the app's existing fullscreen media player (`MediaViewerCommands`/`MediaViewerModal`)
 * — see the doc comment on `openStoryViewer` itself. So the meaningful "does it open image and
 * video" claim lives at the command level: does `openStoryViewer` correctly turn story attachments
 * into viewer items (right type, media-only) and hand them to the shared viewer — not a component
 * render test.
 *
 * `Channels` is mocked for the same reason as the rest of social_home's tests: a real one needs
 * `RuntimeConfig` (see `SocialHomeCommandMocks.ts`). `MediaViewerCommands` and
 * `SocialHomeStoryCommentsCommands` are mocked because verifying *their* behavior isn't this
 * command's job. `MediaViewerItemUtils`/`SocialHomeStoryChronology` are pure/leaf and run for real.
 */
vi.mock('@app/features/channel/state/Channels', () => ({default: {getChannel: vi.fn()}}));
vi.mock('@app/features/ui/commands/MediaViewerCommands', () => ({openMediaViewer: vi.fn()}));
vi.mock('@app/features/social_home/commands/SocialHomeStoryCommentsCommands', () => ({openStoryComments: vi.fn()}));

const Channels = (await import('@app/features/channel/state/Channels')).default;
const MediaViewerCommands = await import('@app/features/ui/commands/MediaViewerCommands');
const {openStoryComments} = await import('@app/features/social_home/commands/SocialHomeStoryCommentsCommands');
const {openStoryViewer} = await import('@app/features/social_home/commands/SocialHomeStoryViewerCommands');
const SocialHomeStories = (await import('@app/features/social_home/state/SocialHomeStories')).default;

const getChannelMock = Channels.getChannel as unknown as Mock;
const openMediaViewerMock = MediaViewerCommands.openMediaViewer as unknown as Mock;
const openStoryCommentsMock = openStoryComments as unknown as Mock;

const STORIES_CHANNEL_ID = 'ch-stories';

function fakeAttachment(overrides: {id: string; contentType: string}) {
	return {
		id: overrides.id,
		content_type: overrides.contentType,
		url: `https://cdn.test/${overrides.id}`,
		proxy_url: `https://cdn.test/${overrides.id}`,
		width: 800,
		height: 600,
		flags: 0,
		content_hash: null,
		filename: overrides.id,
		size: 1000,
		duration: null,
		expires_at: null,
		expired: false,
	};
}

function fakeStoryGroup(overrides: {
	authorId: string;
	storyId: string;
	channelId?: string;
	attachments: ReadonlyArray<ReturnType<typeof fakeAttachment>>;
}): StoryGroup {
	const message = {
		id: overrides.storyId,
		channelId: overrides.channelId ?? STORIES_CHANNEL_ID,
		attachments: overrides.attachments,
	};
	return {
		author: {id: overrides.authorId},
		stories: [message],
		latestStoryId: overrides.storyId,
		isSeen: false,
	} as unknown as StoryGroup;
}

afterEach(() => {
	vi.clearAllMocks();
	SocialHomeStories.reset();
});

describe('openStoryViewer', () => {
	it('opens the shared media viewer with correctly-typed image and video items, non-media attachments filtered out', () => {
		const imageGroup = fakeStoryGroup({
			authorId: 'professor',
			storyId: testSnowflake(1_000),
			attachments: [
				fakeAttachment({id: 'photo', contentType: 'image/png'}),
				fakeAttachment({id: 'notes', contentType: 'application/pdf'}),
			],
		});
		const videoGroup = fakeStoryGroup({
			authorId: 'monitor',
			storyId: testSnowflake(2_000),
			attachments: [fakeAttachment({id: 'clip', contentType: 'video/mp4'})],
		});
		getChannelMock.mockReturnValue({id: STORIES_CHANNEL_ID, name: 'stories'});

		openStoryViewer([imageGroup, videoGroup], 0);

		expect(openMediaViewerMock).toHaveBeenCalledTimes(1);
		const [items, currentIndex, options] = openMediaViewerMock.mock.calls[0]!;
		expect(items.map((item: {attachmentId: string; type: string}) => [item.attachmentId, item.type])).toEqual([
			['photo', 'image'],
			['clip', 'video'],
		]);
		expect(currentIndex).toBe(0);
		expect(options.channelId).toBe(STORIES_CHANNEL_ID);
		expect(options.messageId).toBe(imageGroup.stories[0]!.id);
	});

	it('starts the viewer at the clicked group’s first item, offset past every earlier group’s items', () => {
		const imageGroup = fakeStoryGroup({
			authorId: 'professor',
			storyId: testSnowflake(1_000),
			attachments: [
				fakeAttachment({id: 'photo1', contentType: 'image/png'}),
				fakeAttachment({id: 'photo2', contentType: 'image/jpeg'}),
			],
		});
		const videoGroup = fakeStoryGroup({
			authorId: 'monitor',
			storyId: testSnowflake(2_000),
			attachments: [fakeAttachment({id: 'clip', contentType: 'video/mp4'})],
		});
		getChannelMock.mockReturnValue({id: STORIES_CHANNEL_ID, name: 'stories'});

		openStoryViewer([imageGroup, videoGroup], 1);

		const [, currentIndex, options] = openMediaViewerMock.mock.calls[0]!;
		expect(currentIndex).toBe(2); // past both of imageGroup's items
		expect(options.messageId).toBe(videoGroup.stories[0]!.id);
	});

	it('does nothing when every group has only non-media attachments', () => {
		const pdfOnlyGroup = fakeStoryGroup({
			authorId: 'professor',
			storyId: testSnowflake(1_000),
			attachments: [fakeAttachment({id: 'notes', contentType: 'application/pdf'})],
		});

		openStoryViewer([pdfOnlyGroup], 0);

		expect(openMediaViewerMock).not.toHaveBeenCalled();
		expect(openStoryCommentsMock).not.toHaveBeenCalled();
	});

	it('marks the clicked group’s author as having seen its latest story', () => {
		const group = fakeStoryGroup({
			authorId: 'professor',
			storyId: testSnowflake(1_000),
			attachments: [fakeAttachment({id: 'photo', contentType: 'image/png'})],
		});
		getChannelMock.mockReturnValue({id: STORIES_CHANNEL_ID, name: 'stories'});
		SocialHomeStories.setGuildId('guild-turma-a');

		openStoryViewer([group], 0);

		expect(SocialHomeStories.isAuthorSeen('professor', group.latestStoryId)).toBe(true);
	});

	it('opens the comments panel for the clicked story, bounded by the next story chronologically', () => {
		const clickedStory = fakeStoryGroup({
			authorId: 'professor',
			storyId: testSnowflake(1_000),
			attachments: [fakeAttachment({id: 'photo', contentType: 'image/png'})],
		});
		getChannelMock.mockReturnValue({id: STORIES_CHANNEL_ID, name: 'stories'});
		SocialHomeStories.setStories([
			clickedStory.stories[0],
			{id: testSnowflake(5_000)}, // a later story — should become the upper bound
		] as never);

		openStoryViewer([clickedStory], 0);

		expect(openStoryCommentsMock).toHaveBeenCalledTimes(1);
		const [anchorMessage, upperBoundStoryId] = openStoryCommentsMock.mock.calls[0]!;
		expect(anchorMessage.id).toBe(clickedStory.stories[0]!.id);
		expect(upperBoundStoryId).toBe(testSnowflake(5_000));
	});
});
