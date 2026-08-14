// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelHeader} from '@app/features/channel/components/ChannelHeader';
import {ChannelViewScaffold} from '@app/features/channel/components/channel_view/ChannelViewScaffold';
import Guilds from '@app/features/guild/state/Guilds';
import {SOCIAL_HOME_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {fetchFeed, fetchNextFeedPage} from '@app/features/social_home/commands/SocialHomeCommands';
import styles from '@app/features/social_home/components/pages/SocialHomePage.module.css';
import {SocialHomeFeedList} from '@app/features/social_home/components/SocialHomeFeedList';
import {SocialHomePublishBar} from '@app/features/social_home/components/SocialHomePublishBar';
import SocialHome from '@app/features/social_home/state/SocialHome';
import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import {useFluxerDocumentTitle} from '@app/features/window/hooks/useFluxerDocumentTitle';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {HouseIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo} from 'react';

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
		void fetchFeed(i18n, guildId);
	}, [i18n, guildId]);
	const posts = SocialHome.getPosts();
	const isLoading = SocialHome.getIsLoading();
	const isIndexing = SocialHome.getIsIndexing();
	const error = SocialHome.getError();
	const hasMore = SocialHome.getHasMore();
	const handleLoadMore = useCallback(() => {
		void fetchNextFeedPage(i18n, guildId);
	}, [i18n, guildId]);
	return (
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
	);
});
