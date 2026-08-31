// SPDX-License-Identifier: AGPL-3.0-or-later

import {
	createVideoPlayerRenderSnapshot,
	selectVideoPlayerPlayPauseIndicator,
	selectVideoPlayerRenderModel,
	transitionVideoPlayerRenderSnapshot,
	type VideoPlayerRenderSignals,
	type VideoPlayerRenderSnapshot,
} from '@app/features/voice/components/media_player/VideoPlayerRenderStateMachine';
import {describe, expect, it} from 'vitest';

function signals(overrides: Partial<VideoPlayerRenderSignals> = {}): VideoPlayerRenderSignals {
	return {
		autoPlay: false,
		hasPlayed: false,
		isPlaying: false,
		isPaused: true,
		isEnded: false,
		hasError: false,
		...overrides,
	};
}

function observePlayback(
	snapshot: VideoPlayerRenderSnapshot,
	hasPlayed: boolean,
	isPlaying: boolean,
): VideoPlayerRenderSnapshot {
	return transitionVideoPlayerRenderSnapshot(snapshot, {
		type: 'video.observePlayback',
		signals: {hasPlayed, isPlaying},
	});
}

describe('VideoPlayerRenderStateMachine', () => {
	it('keeps source detached and shows the poster before non-autoplay playback starts', () => {
		const model = selectVideoPlayerRenderModel(signals());

		expect(model.renderState).toBe('poster');
		expect(model.shouldAttachSource).toBe(false);
		expect(model.shouldHideVideo).toBe(true);
		expect(model.shouldShowPosterOverlay).toBe(true);
		expect(model.shouldShowPlaceholderBackdrop).toBe(false);
		expect(model.shouldShowControlsOverlay).toBe(false);
	});

	it('attaches source and controls after the initial play intent', () => {
		const model = selectVideoPlayerRenderModel(signals({hasPlayed: true}));

		expect(model.renderState).toBe('paused');
		expect(model.shouldAttachSource).toBe(true);
		expect(model.shouldHideVideo).toBe(false);
		expect(model.shouldShowPosterOverlay).toBe(false);
		expect(model.shouldShowPlaceholderBackdrop).toBe(false);
		expect(model.shouldShowControlsOverlay).toBe(true);
	});

	it('matches the existing autoplay prop branch before a played signal is recorded', () => {
		const model = selectVideoPlayerRenderModel(signals({autoPlay: true}));

		expect(model.renderState).toBe('paused');
		expect(model.shouldAttachSource).toBe(false);
		expect(model.shouldHideVideo).toBe(true);
		expect(model.shouldShowPosterOverlay).toBe(false);
		// Nothing is on screen yet in this branch — no source, no poster — so the ThumbHash is the
		// only thing standing between the reader and a black rectangle.
		expect(model.shouldShowPlaceholderBackdrop).toBe(true);
		expect(model.shouldShowControlsOverlay).toBe(true);
	});

	it('never asks for the poster overlay and the placeholder backdrop at once', () => {
		for (const autoPlay of [false, true]) {
			for (const hasPlayed of [false, true]) {
				const model = selectVideoPlayerRenderModel(signals({autoPlay, hasPlayed}));
				expect(model.shouldShowPosterOverlay && model.shouldShowPlaceholderBackdrop).toBe(false);
			}
		}
	});

	it('prioritizes ended and error render states over base playback flags', () => {
		expect(selectVideoPlayerRenderModel(signals({hasPlayed: true, isPlaying: true})).renderState).toBe('playing');
		expect(selectVideoPlayerRenderModel(signals({hasPlayed: true, isPaused: true, isEnded: true})).renderState).toBe(
			'ended',
		);
		const errorModel = selectVideoPlayerRenderModel(signals({hasPlayed: true, isPlaying: true, hasError: true}));
		expect(errorModel.renderState).toBe('error');
	});

	it('does not emit a play/pause indicator for the first playback observation', () => {
		const snapshot = observePlayback(createVideoPlayerRenderSnapshot(), true, false);

		expect(selectVideoPlayerPlayPauseIndicator(snapshot)).toBeNull();
	});

	it('emits play and pause indicators only after playback has started', () => {
		let snapshot = createVideoPlayerRenderSnapshot();
		snapshot = observePlayback(snapshot, true, false);
		snapshot = observePlayback(snapshot, true, true);
		expect(selectVideoPlayerPlayPauseIndicator(snapshot)).toBe('play');

		snapshot = observePlayback(snapshot, true, false);
		expect(selectVideoPlayerPlayPauseIndicator(snapshot)).toBe('pause');
	});

	it('updates the previous playback value without flashing before first play', () => {
		let snapshot = createVideoPlayerRenderSnapshot();
		snapshot = observePlayback(snapshot, false, false);
		snapshot = observePlayback(snapshot, false, true);
		expect(selectVideoPlayerPlayPauseIndicator(snapshot)).toBeNull();

		snapshot = observePlayback(snapshot, true, true);
		expect(selectVideoPlayerPlayPauseIndicator(snapshot)).toBeNull();
	});
});
