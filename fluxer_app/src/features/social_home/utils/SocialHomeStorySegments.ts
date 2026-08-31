// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The Instagram-style segmented progress bar over the story viewer.
 *
 * It exists because the bar shows one circle per author (see SocialHomeStoriesGrouping), so three
 * videos posted by the professor collapse into a single circle — and nothing on screen said there
 * were three. The class owner read that as data loss on 30/08/2026 ("postei 3 vídeos no desktop,
 * apareceu 1"). One segment per story of the author currently on screen makes the count visible and
 * the position obvious.
 *
 * Pure on purpose: `openStoryViewer` flattens every group's attachments into one flat item list for
 * the shared media viewer, so the only thing the viewer reports back is a flat index. Turning that
 * index into "story 2 of 3, from the second author" is arithmetic over the shape captured at open
 * time, with no state of its own.
 */

/** Which author's story a given flat viewer item belongs to. One entry per viewer item. */
export interface StoryItemOwner {
	groupIndex: number;
	storyIndex: number;
}

export interface StorySegmentShape {
	itemOwners: Array<StoryItemOwner>;
	/** How many stories each group holds — the number of segments to draw for it. */
	groupStoryCounts: Array<number>;
}

export interface StorySegmentState {
	/** Segments to draw, i.e. how many stories this author posted inside the window. */
	total: number;
	/** Zero-based index of the story on screen. */
	current: number;
}

/**
 * @param itemCountsByGroup how many viewer items each story contributed, grouped by author — a
 * single story message can carry more than one attachment, so items and stories are not 1:1.
 */
export function buildStorySegments(itemCountsByGroup: ReadonlyArray<ReadonlyArray<number>>): StorySegmentShape {
	const itemOwners: Array<StoryItemOwner> = [];
	const groupStoryCounts: Array<number> = [];
	for (const [groupIndex, itemCountByStory] of itemCountsByGroup.entries()) {
		groupStoryCounts.push(itemCountByStory.length);
		for (const [storyIndex, itemCount] of itemCountByStory.entries()) {
			for (let i = 0; i < itemCount; i++) {
				itemOwners.push({groupIndex, storyIndex});
			}
		}
	}
	return {itemOwners, groupStoryCounts};
}

/**
 * Returns null when the index falls outside the captured shape (the viewer was opened over
 * something that isn't a story, or the shape is stale) — the caller then draws nothing rather than
 * guessing.
 */
export function selectSegmentState(shape: StorySegmentShape, itemIndex: number): StorySegmentState | null {
	const owner = shape.itemOwners[itemIndex];
	if (!owner) return null;
	const total = shape.groupStoryCounts[owner.groupIndex];
	if (total == null || total <= 0) return null;
	return {total, current: Math.min(owner.storyIndex, total - 1)};
}
