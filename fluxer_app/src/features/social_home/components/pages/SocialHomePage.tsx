// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelHeader} from '@app/features/channel/components/ChannelHeader';
import {ChannelViewScaffold} from '@app/features/channel/components/channel_view/ChannelViewScaffold';
import Guilds from '@app/features/guild/state/Guilds';
import {SOCIAL_HOME_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import Permission from '@app/features/permissions/state/Permission';
import {fetchFeed, fetchNextFeedPage} from '@app/features/social_home/commands/SocialHomeCommands';
import {isClassStructureMissing, setupClassChannels} from '@app/features/social_home/commands/SocialHomeSetupCommands';
import styles from '@app/features/social_home/components/pages/SocialHomePage.module.css';
import {SocialHomeFeedList} from '@app/features/social_home/components/SocialHomeFeedList';
import {SocialHomePublishBar} from '@app/features/social_home/components/SocialHomePublishBar';
import {SocialHomeStoriesBar} from '@app/features/social_home/components/SocialHomeStoriesBar';
import {SocialHomeStoryCommentsPanel} from '@app/features/social_home/components/SocialHomeStoryCommentsPanel';
import SocialHome from '@app/features/social_home/state/SocialHome';
import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import {Button} from '@app/features/ui/button/Button';
import {useFluxerDocumentTitle} from '@app/features/window/hooks/useFluxerDocumentTitle';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {HouseIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo, useState} from 'react';

const FEED_LOADING_DESCRIPTOR = msg({
	message: 'Loading feed…',
	comment: 'Loading state shown while the class feed posts are being fetched.',
});
const FEED_INDEXING_DESCRIPTOR = msg({
	message: 'Setting up search for this class for the first time — try again in a moment.',
	comment: 'Shown when the feed search backend is still indexing the class channels.',
});
const FEED_ERROR_DESCRIPTOR = msg({
	message: "Couldn't load the feed.",
	comment: 'Shown when fetching the class feed fails.',
});
const FEED_EMPTY_DESCRIPTOR = msg({
	message: 'No posts yet.',
	comment: 'Empty state shown when the class feed has no posts to display.',
});
const SETUP_EXPLAINER_DESCRIPTOR = msg({
	message: "This class doesn't have its Home channels yet. One click creates them: #stories, #feed-do-professor and a sketchbooks category.",
	comment: 'Empty state shown to admins of a class whose conventional Home channels are missing.',
});
const SETUP_BUTTON_DESCRIPTOR = msg({
	message: 'Create class channels',
	comment: 'Button that creates the conventional Home channels (stories, professor feed, sketchbooks).',
});
const SETUP_FAILED_DESCRIPTOR = msg({
	message: "Couldn't create the class channels. Try again.",
	comment: 'Error shown when the one-click class channel setup fails.',
});

interface SocialHomePageProps {
	guildId: string;
}

export const SocialHomePage: React.FC<SocialHomePageProps> = observer(({guildId}) => {
	const {i18n} = useLingui();
	const guild = Guilds.getGuild(guildId);
	useFluxerDocumentTitle(useMemo(() => [i18n._(SOCIAL_HOME_DESCRIPTOR), guild?.name], [guild?.name, i18n.locale]));
	const headerLeftContent = useMemo(
		() => (
			<div
				className={styles.headerLeftContent}
				data-flx="social_home.social-home-page.header-left-content.header-left-content"
			>
				<HouseIcon
					className={styles.headerIcon}
					size={remFromPx(20)}
					data-flx="social_home.social-home-page.header-left-content.header-icon"
				/>
				<span className={styles.headerLabel} data-flx="social_home.social-home-page.header-left-content.header-label">
					{i18n._(SOCIAL_HOME_DESCRIPTOR)}
				</span>
			</div>
		),
		[i18n.locale],
	);
	useEffect(() => {
		SocialHome.reset();
		void fetchFeed(i18n, guildId);
		return () => {
			SocialHome.reset();
		};
	}, [i18n, guildId]);
	const [isSettingUp, setIsSettingUp] = useState(false);
	const [setupFailed, setSetupFailed] = useState(false);
	/**
	 * A fresh guild has none of the conventional Home channels, so the page looks broken with no
	 * explanation (client report, 22/08, brand-new guild with only #general). Admins get a
	 * one-click fix; ordinary members keep the plain empty state — the missing structure is the
	 * admin's to create, not theirs.
	 */
	const structureMissing = isClassStructureMissing(guildId);
	const canSetup =
		structureMissing && ((Permission.getGuildPermissions(guildId) ?? 0n) & Permissions.MANAGE_CHANNELS) !== 0n;
	const handleSetupClass = useCallback(async () => {
		setIsSettingUp(true);
		setSetupFailed(false);
		try {
			await setupClassChannels(guildId);
			// Channels arrive via gateway events and the discovery re-reads them reactively; the
			// feed just needs one refetch now that it has channels to aggregate.
			void fetchFeed(i18n, guildId);
		} catch (_error) {
			setSetupFailed(true);
		} finally {
			setIsSettingUp(false);
		}
	}, [guildId, i18n]);
	const posts = SocialHome.getPosts();
	const isLoading = SocialHome.getIsLoading();
	const isIndexing = SocialHome.getIsIndexing();
	const error = SocialHome.getError();
	const hasMore = SocialHome.getHasMore();
	const handleLoadMore = useCallback(() => {
		void fetchNextFeedPage(i18n, guildId);
	}, [i18n, guildId]);
	return (
		<>
			<ChannelViewScaffold
				header={
					<ChannelHeader
						leftContent={headerLeftContent}
						showMembersToggle={false}
						showPins={false}
						data-flx="social_home.social-home-page.channel-header"
					/>
				}
				chatArea={
					<div className={styles.chatArea} data-flx="social_home.social-home-page.chat-area">
						<SocialHomeStoriesBar guildId={guildId} data-flx="social_home.social-home-page.social-home-stories-bar" />
						<SocialHomePublishBar guildId={guildId} data-flx="social_home.social-home-page.social-home-publish-bar" />
						<div className={styles.body} data-flx="social_home.social-home-page.body">
							{posts.length > 0 ? (
								<SocialHomeFeedList
									guildId={guildId}
									posts={posts}
									hasMore={hasMore}
									isLoadingMore={isLoading}
									onLoadMore={handleLoadMore}
									data-flx="social_home.social-home-page.social-home-feed-list"
								/>
							) : (
								<div className={styles.content} data-flx="social_home.social-home-page.content">
									{isLoading ? (
										<p className={styles.placeholderText} data-flx="social_home.social-home-page.loading-text">
											{i18n._(FEED_LOADING_DESCRIPTOR)}
										</p>
									) : isIndexing ? (
										<p className={styles.placeholderText} data-flx="social_home.social-home-page.indexing-text">
											{i18n._(FEED_INDEXING_DESCRIPTOR)}
										</p>
									) : error ? (
										<p className={styles.placeholderText} data-flx="social_home.social-home-page.error-text">
											{i18n._(FEED_ERROR_DESCRIPTOR)}
										</p>
									) : canSetup ? (
										<div className={styles.setupPrompt} data-flx="social_home.social-home-page.setup-prompt">
											<p className={styles.placeholderText} data-flx="social_home.social-home-page.setup-explainer">
												{i18n._(SETUP_EXPLAINER_DESCRIPTOR)}
											</p>
											{setupFailed && (
												<p className={styles.placeholderText} data-flx="social_home.social-home-page.setup-error">
													{i18n._(SETUP_FAILED_DESCRIPTOR)}
												</p>
											)}
											<Button
												onClick={handleSetupClass}
												submitting={isSettingUp}
												data-flx="social_home.social-home-page.setup-button.click"
											>
												{i18n._(SETUP_BUTTON_DESCRIPTOR)}
											</Button>
										</div>
									) : (
										<p className={styles.placeholderText} data-flx="social_home.social-home-page.empty-text">
											{i18n._(FEED_EMPTY_DESCRIPTOR)}
										</p>
									)}
								</div>
							)}
						</div>
					</div>
				}
				data-flx="social_home.social-home-page.channel-view-scaffold"
			/>
			<SocialHomeStoryCommentsPanel data-flx="social_home.social-home-page.social-home-story-comments-panel" />
		</>
	);
});
