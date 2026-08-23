// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import previewStyles from '@app/features/app/components/shared/MessagePreview.module.css';
import {Message as MessageComponent} from '@app/features/channel/components/ChannelMessage';
import Channels from '@app/features/channel/state/Channels';
import {EmojiPickerPopout} from '@app/features/emoji/components/popouts/EmojiPickerPopout';
import * as ReactionCommands from '@app/features/messaging/commands/ReactionCommands';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {toReactionEmoji} from '@app/features/messaging/utils/ReactionUtils';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import Permission from '@app/features/permissions/state/Permission';
import styles from '@app/features/social_home/components/SocialHomeFeedList.module.css';
import * as PopoutCommands from '@app/features/ui/commands/PopoutCommands';
import {Scroller, type ScrollerHandle} from '@app/features/ui/components/Scroller';
import {MessagePreviewContext, Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ChatCircleIcon, SmileyIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useRef} from 'react';

const LOAD_MORE_THRESHOLD_PX = 400;

const COMMENT_DESCRIPTOR = msg({
	message: 'Comment',
	comment: 'Button on a class-feed card that deep-links to the original post in its channel to comment on it.',
});
const ADD_REACTION_DESCRIPTOR = msg({
	message: 'React',
	comment: 'Button on a class-feed card that opens the emoji picker to react to the post.',
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
 * The preview context the card renders under hides the native add-reaction affordance (reaction
 * chips display but are inert — MessageReactions bails on isPreview), so reacting straight from
 * the Feed needs its own button: it opens the same EmojiPickerPopout the message action bar uses,
 * anchored to the footer button, and toggles through the same ReactionCommands. Client request of
 * 22/08 — reacting used to require walking into the Sketchbook channel.
 */
function openFeedReactionPicker(i18n: I18n, post: Message, target: HTMLElement): void {
	PopoutCommands.open({
		key: `feed_reaction_picker-${post.id}`,
		position: 'left-start',
		render: ({onClose}) => (
			<EmojiPickerPopout
				channelId={post.channelId}
				handleSelect={(emoji) => {
					const reactionEmoji = toReactionEmoji(emoji);
					if (post.getReaction(reactionEmoji)?.me) {
						ReactionCommands.removeReaction(i18n, post.channelId, post.id, reactionEmoji);
					} else {
						ReactionCommands.addReaction(i18n, post.channelId, post.id, reactionEmoji);
					}
				}}
				onClose={onClose}
				data-flx="social_home.social-home-feed-list.emoji-picker-popout"
			/>
		),
		target,
		shouldAutoUpdate: false,
		animationType: 'none',
	});
}

/**
 * The card body is the real message component (avatar, text, attachments, reactions) — clicking it
 * doesn't navigate, so likes/mentions/link clicks inside stay native. Deep-linking to the original
 * Sketchbook post is an explicit button instead, same tradeoff MessageListPage makes for the same
 * reason: a whole-card click target would swallow clicks meant for the message's own interactions.
 * Per the client's 22/08 request it reads as "Comment" now — commenting IS the deep-link (replies
 * happen on the original message), so one button serves both meanings.
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
									{((Permission.getChannelPermissions(channel.id) ?? 0n) & Permissions.ADD_REACTIONS) !== 0n && (
										<button
											type="button"
											className={styles.viewButton}
											onClick={(event) => openFeedReactionPicker(i18n, post, event.currentTarget)}
											data-flx="social_home.social-home-feed-list.react-button"
										>
											<SmileyIcon
												className={styles.viewIcon}
												data-flx="social_home.social-home-feed-list.react-icon"
											/>
											{i18n._(ADD_REACTION_DESCRIPTOR)}
										</button>
									)}
									<button
										type="button"
										className={styles.viewButton}
										onClick={() => RouterUtils.transitionTo(Routes.channelMessage(guildId, channel.id, post.id))}
										data-flx="social_home.social-home-feed-list.view-button"
									>
										<ChatCircleIcon
											className={styles.viewIcon}
											data-flx="social_home.social-home-feed-list.view-icon"
										/>
										{i18n._(COMMENT_DESCRIPTOR)}
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
