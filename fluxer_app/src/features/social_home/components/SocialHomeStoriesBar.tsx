// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {fetchStories} from '@app/features/social_home/commands/SocialHomeStoriesCommands';
import {openStoryViewer} from '@app/features/social_home/commands/SocialHomeStoryViewerCommands';
import styles from '@app/features/social_home/components/SocialHomeStoriesBar.module.css';
import SocialHomeStories from '@app/features/social_home/state/SocialHomeStories';
import {canPostStories, getStoriesChannel} from '@app/features/social_home/utils/SocialHomeChannelDiscovery';
import {groupStoriesByAuthor} from '@app/features/social_home/utils/SocialHomeStoriesGrouping';
import {STORIES_FEATURE_NAME_DESCRIPTOR} from '@app/features/social_home/utils/SocialHomeStoriesLabels';
import {Avatar} from '@app/features/ui/components/Avatar';
import {Scroller} from '@app/features/ui/components/Scroller';
import * as NicknameUtils from '@app/features/user/utils/NicknameUtils';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {PlusIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useEffect, useMemo} from 'react';

const STORY_AVATAR_SIZE = 56;

const VIEW_STORY_DESCRIPTOR = msg({
	message: 'View story from {name}',
	comment: 'Accessible label for a circle in the class Stories bar that opens that person’s story.',
});
const ADD_STORY_DESCRIPTOR = msg({
	message: 'Post a new {featureName}',
	comment:
		'Accessible label for the "add" circle shown only to whoever can post — professor/admin, and monitors if the class grants it. {featureName} is the feature\'s display name (see SocialHomeStoriesLabels.ts).',
});

interface SocialHomeStoriesBarProps {
	guildId: string;
}

export const SocialHomeStoriesBar: React.FC<SocialHomeStoriesBarProps> = observer(({guildId}) => {
	const {i18n} = useLingui();
	useEffect(() => {
		SocialHomeStories.reset();
		SocialHomeStories.startClock();
		void fetchStories(i18n, guildId);
		return () => {
			SocialHomeStories.stopClock();
			SocialHomeStories.reset();
		};
	}, [i18n, guildId]);
	const visibleStories = SocialHomeStories.getVisibleStories();
	const groups = useMemo(
		() => groupStoriesByAuthor(visibleStories, SocialHomeStories.isAuthorSeen),
		[visibleStories],
	);
	const storiesChannel = getStoriesChannel(guildId);
	const canPost = storiesChannel != null && canPostStories(guildId);
	if (groups.length === 0 && !canPost) {
		return null;
	}
	const featureName = i18n._(STORIES_FEATURE_NAME_DESCRIPTOR);
	return (
		<div className={styles.section} data-flx="social_home.social-home-stories-bar.section">
			<span className={styles.sectionTitle} data-flx="social_home.social-home-stories-bar.section-title">
				{featureName}
			</span>
			<Scroller
				orientation="horizontal"
				className={styles.scroller}
				data-flx="social_home.social-home-stories-bar.scroller"
			>
				<div className={styles.track} data-flx="social_home.social-home-stories-bar.track">
					{canPost && storiesChannel && (
						<button
							type="button"
							className={styles.item}
							onClick={() => RouterUtils.transitionTo(Routes.guildChannel(guildId, storiesChannel.id))}
							aria-label={i18n._(ADD_STORY_DESCRIPTOR, {featureName})}
							data-flx="social_home.social-home-stories-bar.add-item"
						>
							<span
								className={clsx(styles.ring, styles.addRing)}
								data-flx="social_home.social-home-stories-bar.add-ring"
							>
								<PlusIcon size={22} weight="bold" data-flx="social_home.social-home-stories-bar.add-icon" />
							</span>
							<span className={styles.label} data-flx="social_home.social-home-stories-bar.add-label">
								{featureName}
							</span>
						</button>
					)}
					{groups.map((group, index) => {
						const displayName = NicknameUtils.getNickname(group.author, guildId);
						return (
							<button
								key={group.author.id}
								type="button"
								className={styles.item}
								onClick={() => openStoryViewer(groups, index)}
								aria-label={i18n._(VIEW_STORY_DESCRIPTOR, {name: displayName})}
								data-flx="social_home.social-home-stories-bar.item"
							>
								<span
									className={clsx(styles.ring, group.isSeen && styles.ringSeen)}
									data-flx="social_home.social-home-stories-bar.ring"
								>
									<Avatar
										user={group.author}
										size={STORY_AVATAR_SIZE}
										guildId={guildId}
										disableStatusTooltip
										data-flx="social_home.social-home-stories-bar.avatar"
									/>
								</span>
								<span className={styles.label} data-flx="social_home.social-home-stories-bar.label">
									{displayName}
								</span>
							</button>
						);
					})}
				</div>
			</Scroller>
		</div>
	);
});
