// SPDX-License-Identifier: AGPL-3.0-or-later

import {testSnowflake} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import {groupStoriesByAuthor} from '@app/features/social_home/utils/SocialHomeStoriesGrouping';
import {describe, expect, it} from 'vitest';

/**
 * `groupStoriesByAuthor` only reads `.id` and `.author.id` off a `Message` — both type-only imports
 * in `SocialHomeStoriesGrouping.ts`, so plain fixture objects work without constructing a real
 * `Message`/`User` (which needs `RuntimeConfig` — see `SocialHomeCommandMocks.ts`). The component
 * that renders one circle per group has its own test in `components/SocialHomeStoriesBar.test.tsx`.
 */
interface FakeStory {
	id: string;
	author: {id: string};
}

function fakeStory(id: string, authorId: string): FakeStory {
	return {id, author: {id: authorId}};
}

function group(stories: ReadonlyArray<FakeStory>, seenAuthorIds: ReadonlySet<string> = new Set()) {
	return groupStoriesByAuthor(stories as never, (authorId) => seenAuthorIds.has(authorId));
}

describe('groupStoriesByAuthor', () => {
	it('groups multiple stories from the same author into a single circle', () => {
		const groups = group([
			fakeStory(testSnowflake(1_000), 'ana'),
			fakeStory(testSnowflake(2_000), 'ana'),
			fakeStory(testSnowflake(1_500), 'bruno'),
		]);

		expect(groups).toHaveLength(2);
		const anaGroup = groups.find((g) => g.author.id === 'ana')!;
		expect(anaGroup.stories).toHaveLength(2);
	});

	it("orders a group's own stories oldest-to-newest for Instagram-style playback", () => {
		const newer = fakeStory(testSnowflake(2_000), 'ana');
		const older = fakeStory(testSnowflake(1_000), 'ana');

		const [anaGroup] = group([newer, older]);

		expect(anaGroup!.stories.map((story) => story.id)).toEqual([older.id, newer.id]);
		expect(anaGroup!.latestStoryId).toBe(newer.id);
	});

	it('carries the author of the latest story as the group author (in case a display name changed mid-window)', () => {
		const latest = fakeStory(testSnowflake(2_000), 'ana');
		const earlier = fakeStory(testSnowflake(1_000), 'ana');

		const [anaGroup] = group([earlier, latest]);

		expect(anaGroup!.author).toBe(latest.author);
	});

	it('marks a group seen only when isAuthorSeen says so for that author', () => {
		const groups = group(
			[fakeStory(testSnowflake(1_000), 'ana'), fakeStory(testSnowflake(1_000), 'bruno')],
			new Set(['ana']),
		);

		expect(groups.find((g) => g.author.id === 'ana')!.isSeen).toBe(true);
		expect(groups.find((g) => g.author.id === 'bruno')!.isSeen).toBe(false);
	});

	it('orders unseen groups before seen ones, newest-first within each', () => {
		const anaUnseenOlder = fakeStory(testSnowflake(1_000), 'ana');
		const brunoUnseenNewer = fakeStory(testSnowflake(3_000), 'bruno');
		const carlaSeen = fakeStory(testSnowflake(4_000), 'carla');

		const groups = group([anaUnseenOlder, brunoUnseenNewer, carlaSeen], new Set(['carla']));

		expect(groups.map((g) => g.author.id)).toEqual(['bruno', 'ana', 'carla']);
	});

	it('returns no groups for an empty story list', () => {
		expect(group([])).toEqual([]);
	});
});
