// SPDX-License-Identifier: AGPL-3.0-or-later

import {getMediaViewerPortalRoot} from '@app/features/messaging/components/modals/MediaViewerPortal';
import styles from '@app/features/social_home/components/SocialHomeStoryProgressBar.module.css';
import SocialHomeStoryComments from '@app/features/social_home/state/SocialHomeStoryComments';
import SocialHomeStoryProgress from '@app/features/social_home/state/SocialHomeStoryProgress';
import {selectSegmentState} from '@app/features/social_home/utils/SocialHomeStorySegments';
import MediaViewer from '@app/features/ui/state/MediaViewer';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect} from 'react';
import {createPortal} from 'react-dom';

/**
 * The Instagram-style segments over the story viewer: one per story of the author on screen, filled
 * up to the one being watched. It is what tells the reader that a circle holds three videos rather
 * than one — the complaint that opened this work ("postei 3 vídeos, apareceu 1", 30/08/2026).
 *
 * A separate portal rather than something added to MediaViewerModal, exactly like
 * SocialHomeStoryCommentsPanel: viewing any other attachment anywhere else in the app is unchanged.
 * Unlike that panel this one is `pointer-events: none` — the story viewer advances by clicking the
 * media, and a bar that swallowed those clicks would break navigation.
 */

/**
 * Deliberately without the feature's name: that name is still provisional (see
 * SocialHomeStoriesLabels) and lives in one descriptor, so repeating it here would be a second
 * place to fix on rename — and the bar already sits over the story itself.
 */
const PROGRESS_DESCRIPTOR = msg({
	message: '{current} of {total}',
	comment:
		'Accessible label for the segmented progress bar over the story viewer. {current} is the story being watched, {total} how many that person posted.',
});

export const SocialHomeStoryProgressBar: React.FC = observer(() => {
	const {i18n} = useLingui();
	const shape = SocialHomeStoryProgress.getShape();
	const isViewerOpen = MediaViewer.isOpen;

	// The viewer is closed by the shared media modal, which knows nothing about stories, so the
	// captured shape is dropped here — same handshake the comments panel uses.
	useEffect(() => {
		if (!isViewerOpen && shape != null) {
			SocialHomeStoryProgress.close();
		}
	}, [isViewerOpen, shape]);

	if (!isViewerOpen || shape == null) return null;
	const segments = selectSegmentState(shape, MediaViewer.currentIndex);
	// A lone story needs no progress bar: one full segment says nothing the reader doesn't see.
	if (segments == null || segments.total <= 1) return null;
	const portalRoot = getMediaViewerPortalRoot();
	if (!portalRoot) return null;

	return createPortal(
		<div
			className={clsx(styles.track, SocialHomeStoryComments.getIsOpen() && styles.trackWithComments)}
			role="progressbar"
			aria-valuemin={1}
			aria-valuemax={segments.total}
			aria-valuenow={segments.current + 1}
			aria-label={i18n._(PROGRESS_DESCRIPTOR, {current: segments.current + 1, total: segments.total})}
			data-flx="social_home.social-home-story-progress-bar.track"
		>
			{Array.from({length: segments.total}, (_unused, index) => (
				<span
					key={index}
					className={clsx(styles.segment, index <= segments.current && styles.segmentWatched)}
					data-flx="social_home.social-home-story-progress-bar.segment"
				/>
			))}
		</div>,
		portalRoot,
	);
});
