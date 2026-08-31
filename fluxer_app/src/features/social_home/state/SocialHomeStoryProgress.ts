// SPDX-License-Identifier: AGPL-3.0-or-later

import type {StorySegmentShape} from '@app/features/social_home/utils/SocialHomeStorySegments';
import {makeAutoObservable, observable} from 'mobx';

/**
 * The shape captured when the story viewer opens, so the progress bar can turn the shared viewer's
 * flat index back into "story N of M" — see SocialHomeStorySegments for the arithmetic.
 *
 * Kept apart from SocialHomeStories (which owns the stories themselves) for the same reason the
 * comments panel has its own store: this is viewer-session state, discarded the moment the viewer
 * closes, and it must not survive into the next class's bar.
 */
class SocialHomeStoryProgress {
	shape: StorySegmentShape | null = null;

	constructor() {
		makeAutoObservable(this, {shape: observable.ref}, {autoBind: true});
	}

	getShape(): StorySegmentShape | null {
		return this.shape;
	}

	open(shape: StorySegmentShape): void {
		this.shape = shape;
	}

	close(): void {
		this.shape = null;
	}
}

export default new SocialHomeStoryProgress();
