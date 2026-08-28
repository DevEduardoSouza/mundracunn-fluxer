// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelHeader} from '@app/features/channel/components/ChannelHeader';
import {ChannelViewScaffold} from '@app/features/channel/components/channel_view/ChannelViewScaffold';
import * as ForumCoverCommands from '@app/features/forum/commands/ForumCoverCommands';
import {ForumPostList} from '@app/features/forum/components/ForumPostList';
import {ForumToolbar} from '@app/features/forum/components/ForumToolbar';
import styles from '@app/features/forum/components/pages/ForumPage.module.css';
import Forum from '@app/features/forum/state/Forum';
import ForumCovers from '@app/features/forum/state/ForumCovers';
import {getForumCategories} from '@app/features/forum/utils/ForumChannelDiscovery';
import Guilds from '@app/features/guild/state/Guilds';
import {FORUM_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import * as NavigationCommands from '@app/features/navigation/commands/NavigationCommands';
import Permission from '@app/features/permissions/state/Permission';
import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import Users from '@app/features/user/state/Users';
import {useFluxerDocumentTitle} from '@app/features/window/hooks/useFluxerDocumentTitle';
import {Permissions} from '@fluxer/constants/src/ChannelConstants';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ChatCircleIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useMemo} from 'react';

const NO_STRUCTURE_STAFF_DESCRIPTOR = msg({
	message:
		"This class doesn't have a forum yet. Create a channel category whose name starts with 'Forum' and the discussion channels inside it show up here.",
	comment: 'Forum page empty state shown to staff (can manage channels) when no forum category exists yet.',
});
const NO_STRUCTURE_MEMBER_DESCRIPTOR = msg({
	message: "This class doesn't have a forum yet.",
	comment: 'Forum page empty state shown to ordinary members when no forum category exists yet.',
});
const NO_POSTS_DESCRIPTOR = msg({
	message: 'No forum posts yet.',
	comment: 'Forum page empty state shown when the forum category exists but has no post channels.',
});

interface ForumPageProps {
	guildId: string;
}

export const ForumPage: React.FC<ForumPageProps> = observer(({guildId}) => {
	const {i18n} = useLingui();
	const guild = Guilds.getGuild(guildId);
	useFluxerDocumentTitle(useMemo(() => [i18n._(FORUM_DESCRIPTOR), guild?.name], [guild?.name, i18n.locale]));
	useEffect(() => {
		Forum.setGuildId(guildId);
		Forum.loadPrefs(Users.currentUserId ?? '');
		void ForumCoverCommands.fetchCovers(i18n, guildId);
		return () => {
			Forum.reset();
			ForumCovers.reset();
		};
	}, [i18n, guildId]);
	const headerLeftContent = useMemo(
		() => (
			<div className={styles.headerLeftContent} data-flx="forum.forum-page.header-left-content">
				<ChatCircleIcon className={styles.headerIcon} size={remFromPx(20)} data-flx="forum.forum-page.header-icon" />
				<span className={styles.headerLabel} data-flx="forum.forum-page.header-label">
					{i18n._(FORUM_DESCRIPTOR)}
				</span>
			</div>
		),
		[i18n.locale],
	);
	// Mobile back arrow: deep-linked pages have no history to pop, so send the user to the class
	// channel list — same as SocialHomePage.
	const handleBackClick = useCallback(() => {
		NavigationCommands.selectChannel(guildId);
	}, [guildId]);
	const activePosts = Forum.getActivePosts();
	const olderPosts = Forum.getOlderPosts();
	const viewMode = Forum.getViewMode();
	const hasForumStructure = getForumCategories(guildId).length > 0;
	const hasAnyPosts = Forum.getGuildPostChannelIds(guildId).length > 0;
	const canManageChannels =
		((Permission.getGuildPermissions(guildId) ?? 0n) & Permissions.MANAGE_CHANNELS) !== 0n;
	const emptyStateText = !hasForumStructure
		? canManageChannels
			? i18n._(NO_STRUCTURE_STAFF_DESCRIPTOR)
			: i18n._(NO_STRUCTURE_MEMBER_DESCRIPTOR)
		: i18n._(NO_POSTS_DESCRIPTOR);
	return (
		<ChannelViewScaffold
			header={
				<ChannelHeader
					leftContent={headerLeftContent}
					onBackClick={handleBackClick}
					showMembersToggle={false}
					showPins={false}
					data-flx="forum.forum-page.channel-header"
				/>
			}
			chatArea={
				<div className={styles.chatArea} data-flx="forum.forum-page.chat-area">
					{hasForumStructure && hasAnyPosts ? (
						<>
							<ForumToolbar data-flx="forum.forum-page.toolbar" />
							<ForumPostList
								guildId={guildId}
								viewMode={viewMode}
								activePosts={activePosts}
								olderPosts={olderPosts}
								data-flx="forum.forum-page.post-list"
							/>
						</>
					) : (
						<div className={styles.content} data-flx="forum.forum-page.content">
							<p className={styles.placeholderText} data-flx="forum.forum-page.empty-text">
								{emptyStateText}
							</p>
						</div>
					)}
				</div>
			}
			data-flx="forum.forum-page.channel-view-scaffold"
		/>
	);
});
