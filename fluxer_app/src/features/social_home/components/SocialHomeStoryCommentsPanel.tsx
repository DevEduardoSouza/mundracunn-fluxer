// SPDX-License-Identifier: AGPL-3.0-or-later

import {Message as MessageComponent} from '@app/features/channel/components/ChannelMessage';
import {ChannelTextarea} from '@app/features/channel/components/ChannelTextarea';
import Channels from '@app/features/channel/state/Channels';
import {getMediaViewerPortalRoot} from '@app/features/messaging/components/modals/MediaViewerPortal';
import Messages from '@app/features/messaging/state/MessagingMessages';
import {closeStoryComments} from '@app/features/social_home/commands/SocialHomeStoryCommentsCommands';
import styles from '@app/features/social_home/components/SocialHomeStoryCommentsPanel.module.css';
import {SocialHomeStoryCommentTree} from '@app/features/social_home/components/SocialHomeStoryCommentTree';
import SocialHomeStoryComments from '@app/features/social_home/state/SocialHomeStoryComments';
import {Scroller} from '@app/features/ui/components/Scroller';
import LayerManager from '@app/features/ui/state/LayerManager';
import MediaViewer from '@app/features/ui/state/MediaViewer';
import {MessagePreviewContext} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect} from 'react';
import {createPortal} from 'react-dom';

const COMMENTS_TITLE_DESCRIPTOR = msg({
	message: 'Comments',
	comment: 'Header title of the story comments panel opened alongside the fullscreen story viewer.',
});
const CLOSE_COMMENTS_DESCRIPTOR = msg({
	message: 'Close comments',
	comment: 'Accessible label for the button that closes the story comments panel.',
});

const LAYER_KEY = 'social-home-story-comments';

/**
 * A companion drawer to the fullscreen story viewer (MediaViewerModal, reused untouched — see
 * CLAUDE.md section 4: "Clicar no story abre a mídia + a thread de comentários"). It's a separate
 * portal rather than something bolted onto the shared media viewer, so viewing any other
 * attachment elsewhere in the app is unaffected.
 */
export const SocialHomeStoryCommentsPanel: React.FC = observer(() => {
	const {i18n} = useLingui();
	const isOpen = SocialHomeStoryComments.getIsOpen();
	const storyId = SocialHomeStoryComments.getStoryId();
	const channelId = SocialHomeStoryComments.getChannelId();
	const isViewerOpen = MediaViewer.isOpen;
	useEffect(() => {
		if (isOpen && !isViewerOpen) {
			closeStoryComments();
		}
	}, [isOpen, isViewerOpen]);
	useEffect(() => {
		if (!isOpen) return;
		LayerManager.addLayer('modal', LAYER_KEY, closeStoryComments);
		return () => {
			LayerManager.removeLayer('modal', LAYER_KEY);
		};
	}, [isOpen]);
	if (!isOpen || storyId == null || channelId == null) {
		return null;
	}
	const channel = Channels.getChannel(channelId);
	const root = Messages.getMessage(channelId, storyId);
	if (!channel || !root) {
		return null;
	}
	const portalRoot = getMediaViewerPortalRoot();
	if (!portalRoot) {
		return null;
	}
	return createPortal(
		<div className={styles.panel} data-flx="social_home.social-home-story-comments-panel.panel">
			<div className={styles.header} data-flx="social_home.social-home-story-comments-panel.header">
				<span className={styles.headerTitle} data-flx="social_home.social-home-story-comments-panel.header-title">
					{i18n._(COMMENTS_TITLE_DESCRIPTOR)}
				</span>
				<button
					type="button"
					className={styles.closeButton}
					onClick={closeStoryComments}
					aria-label={i18n._(CLOSE_COMMENTS_DESCRIPTOR)}
					data-flx="social_home.social-home-story-comments-panel.close-button"
				>
					<XIcon size={18} data-flx="social_home.social-home-story-comments-panel.close-icon" />
				</button>
			</div>
			<Scroller className={styles.body} data-flx="social_home.social-home-story-comments-panel.scroller">
				<div className={styles.rootCard} data-flx="social_home.social-home-story-comments-panel.root-card">
					<MessageComponent
						message={root}
						channel={channel}
						previewContext={MessagePreviewContext.LIST_POPOUT}
						data-flx="social_home.social-home-story-comments-panel.message-component"
					/>
				</div>
				<SocialHomeStoryCommentTree
					root={root}
					channel={channel}
					data-flx="social_home.social-home-story-comments-panel.social-home-story-comment-tree"
				/>
			</Scroller>
			<div className={styles.composer} data-flx="social_home.social-home-story-comments-panel.composer">
				<ChannelTextarea channel={channel} data-flx="social_home.social-home-story-comments-panel.channel-textarea" />
			</div>
		</div>,
		portalRoot,
	);
});
