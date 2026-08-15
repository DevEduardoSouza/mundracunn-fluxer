// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import previewStyles from '@app/features/app/components/shared/MessagePreview.module.css';
import {Message as MessageComponent} from '@app/features/channel/components/ChannelMessage';
import Channels from '@app/features/channel/state/Channels';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import styles from '@app/features/social_home/components/SocialHomeFeedList.module.css';
import {Scroller, type ScrollerHandle} from '@app/features/ui/components/Scroller';
import {MessagePreviewContext} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ArrowSquareOutIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useRef} from 'react';

const LOAD_MORE_THRESHOLD_PX = 400;

const VIEW_IN_SKETCHBOOK_DESCRIPTOR = msg({
	message: 'View in Sketchbook',
	comment: 'Button on a class-feed card that deep-links to the original post in its channel.',
});
const LOADING_MORE_DESCRIPTOR = msg({
	message: 'Loading more…',
	comment: 'Footer shown at the bottom of the class feed while the next page loads.',
});

interface SocialHomeFeedListProps {
	guildId: string;
	posts: ReadonlyArray<Message>;
	hasMore: boolean;
	isLoadingMore: boolean;
	onLoadMore: () => void;
}

/**
 * The card body is the real message component (avatar, text, attachments, reactions) — clicking it
 * doesn't navigate, so likes/mentions/link clicks inside stay native. Deep-linking to the original
 * Sketchbook post is an explicit button instead, same tradeoff MessageListPage makes for the same
 * reason: a whole-card click target would swallow clicks meant for the message's own interactions.
 */
export const SocialHomeFeedList: React.FC<SocialHomeFeedListProps> = observer(
	({guildId, posts, hasMore, isLoadingMore, onLoadMore}) => {
		const {i18n} = useLingui();
		const scrollerRef = useRef<ScrollerHandle | null>(null);
		const handleScroll = useCallback(
			(event: React.UIEvent<HTMLDivElement>) => {
				if (!hasMore || isLoadingMore) return;
				const {scrollTop, scrollHeight, offsetHeight} = event.currentTarget;
				if (scrollHeight - (scrollTop + offsetHeight) <= LOAD_MORE_THRESHOLD_PX) {
					onLoadMore();
				}
			},
			[hasMore, isLoadingMore, onLoadMore],
		);
		return (
			<Scroller
				className={styles.scroller}
				ref={scrollerRef}
				onScroll={handleScroll}
				data-flx="social_home.social-home-feed-list.scroller"
			>
				<div className={styles.feed} data-flx="social_home.social-home-feed-list.feed">
					{posts.map((post) => {
						const channel = Channels.getChannel(post.channelId);
						if (!channel) return null;
						return (
							<div
								key={post.id}
								className={previewStyles.previewCard}
								data-flx="social_home.social-home-feed-list.card"
							>
								<MessageComponent
									message={post}
									channel={channel}
									previewContext={MessagePreviewContext.LIST_POPOUT}
									data-flx="social_home.social-home-feed-list.message-component"
								/>
								<div className={styles.cardFooter} data-flx="social_home.social-home-feed-list.card-footer">
									<button
										type="button"
										className={styles.viewButton}
										onClick={() => RouterUtils.transitionTo(Routes.channelMessage(guildId, channel.id, post.id))}
										data-flx="social_home.social-home-feed-list.view-button"
									>
										<ArrowSquareOutIcon
											className={styles.viewIcon}
											data-flx="social_home.social-home-feed-list.view-icon"
										/>
										{i18n._(VIEW_IN_SKETCHBOOK_DESCRIPTOR)}
									</button>
								</div>
							</div>
						);
					})}
					{isLoadingMore && (
						<p className={styles.loadingMoreText} data-flx="social_home.social-home-feed-list.loading-more-text">
							{i18n._(LOADING_MORE_DESCRIPTOR)}
						</p>
					)}
				</div>
			</Scroller>
		);
	},
);
