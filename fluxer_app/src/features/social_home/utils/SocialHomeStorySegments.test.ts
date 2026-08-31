// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Pure arithmetic, no mocks needed — see the module's own header for why the flat viewer index has
 * to be translated back into "story N of M" at all.
 */

import {buildStorySegments, selectSegmentState} from '@app/features/social_home/utils/SocialHomeStorySegments';
import {describe, expect, it} from 'vitest';

describe('buildStorySegments', () => {
	it('counts one segment per story, not per attachment', () => {
		// Author 0 posted two stories, the second carrying two images; author 1 posted one.
		const shape = buildStorySegments([[1, 2], [1]]);

		expect(shape.groupStoryCounts).toEqual([2, 1]);
		expect(shape.itemOwners).toEqual([
			{groupIndex: 0, storyIndex: 0},
			{groupIndex: 0, storyIndex: 1},
			{groupIndex: 0, storyIndex: 1},
			{groupIndex: 1, storyIndex: 0},
		]);
	});

	it('handles a group the viewer dropped for having no media at all', () => {
		const shape = buildStorySegments([[], [1]]);

		expect(shape.groupStoryCounts).toEqual([0, 1]);
		expect(shape.itemOwners).toEqual([{groupIndex: 1, storyIndex: 0}]);
	});
});

describe('selectSegmentState', () => {
	/** The reported case: three videos from one author, which the bar collapses into one circle. */
	it('reports the position inside the author currently on screen', () => {
		const shape = buildStorySegments([[1, 1, 1]]);

		expect(selectSegmentState(shape, 0)).toEqual({total: 3, current: 0});
		expect(selectSegmentState(shape, 1)).toEqual({total: 3, current: 1});
		expect(selectSegmentState(shape, 2)).toEqual({total: 3, current: 2});
	});

	it('restarts the count when playback crosses into the next author', () => {
		const shape = buildStorySegments([[1, 1], [1, 1, 1]]);

		expect(selectSegmentState(shape, 1)).toEqual({total: 2, current: 1});
		expect(selectSegmentState(shape, 2)).toEqual({total: 3, current: 0});
		expect(selectSegmentState(shape, 4)).toEqual({total: 3, current: 2});
	});

	it('keeps a multi-attachment story on a single segment', () => {
		const shape = buildStorySegments([[2, 1]]);

		expect(selectSegmentState(shape, 0)).toEqual({total: 2, current: 0});
		expect(selectSegmentState(shape, 1)).toEqual({total: 2, current: 0});
		expect(selectSegmentState(shape, 2)).toEqual({total: 2, current: 1});
	});

	it('returns null outside the captured shape instead of guessing', () => {
		const shape = buildStorySegments([[1]]);

		expect(selectSegmentState(shape, 1)).toBeNull();
		expect(selectSegmentState(shape, -1)).toBeNull();
	});
});
