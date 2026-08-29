// SPDX-License-Identifier: AGPL-3.0-or-later

import {ForumPostCard} from '@app/features/forum/components/ForumPostCard';
import {ForumPostRow} from '@app/features/forum/components/ForumPostRow';
import styles from '@app/features/forum/components/ForumPostList.module.css';
import type {ForumPost, ForumViewMode} from '@app/features/forum/state/Forum';
import {Scroller} from '@app/features/ui/components/Scroller';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CaretDownIcon, StarIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useState} from 'react';

const OLDER_POSTS_DESCRIPTOR = msg({
	message: 'Older posts ({count})',
	comment:
		'Heading of the collapsed section of forum posts hidden by the inactivity filter. {count} is how many posts are in it.',
});
const NO_RESULTS_DESCRIPTOR = msg({
	message: 'No posts match your search.',
	comment: 'Empty state shown in the forum list when the title search matches nothing.',
});
const FOLLOWING_SECTION_DESCRIPTOR = msg({
	message: 'Following',
	comment: 'Heading of the highlighted strip at the top of the forum list with the posts the user follows.',
});
const NO_FOLLOWED_DESCRIPTOR = msg({
	message: "You aren't following any posts yet. Tap the star on a post to follow it.",
	comment: 'Empty state of the forum list when the "Following" filter is on but the user follows nothing.',
});

interface ForumPostListProps {
	guildId: string;
	viewMode: ForumViewMode;
	/** Posts the user follows, shown in a highlighted strip above `activePosts` (never duplicated there). */
	followedPosts?: ReadonlyArray<ForumPost>;
	activePosts: ReadonlyArray<ForumPost>;
	olderPosts: ReadonlyArray<ForumPost>;
	/** The toolbar's "Following" filter is on: `activePosts` are the followed ones, empty state says so. */
	showOnlyFollowed?: boolean;
}

const ForumPostGroup: React.FC<{guildId: string; viewMode: ForumViewMode; posts: ReadonlyArray<ForumPost>}> = observer(
	({guildId, viewMode, posts}) => {
		if (viewMode === 'grid') {
			return (
				<div className={styles.grid} data-flx="forum.forum-post-list.grid">
					{posts.map((post) => (
						<ForumPostCard key={post.channel.id} guildId={guildId} post={post} data-flx="forum.forum-post-list.card" />
					))}
				</div>
			);
		}
		return (
			<div className={styles.list} data-flx="forum.forum-post-list.list">
				{posts.map((post) => (
					<ForumPostRow key={post.channel.id} guildId={guildId} post={post} data-flx="forum.forum-post-list.row" />
				))}
			</div>
		);
	},
);

export const ForumPostList: React.FC<ForumPostListProps> = observer(
	({guildId, viewMode, followedPosts = [], activePosts, olderPosts, showOnlyFollowed = false}) => {
		const {i18n} = useLingui();
		// Collapsed by default: the whole point of the rule is to get stale posts out of the way.
		const [olderOpen, setOlderOpen] = useState(false);
		const nothingToShow = followedPosts.length === 0 && activePosts.length === 0 && olderPosts.length === 0;
		return (
			<Scroller className={styles.scroller} data-flx="forum.forum-post-list.scroller">
				<div className={styles.inner} data-flx="forum.forum-post-list.inner">
					{followedPosts.length > 0 && (
						<section className={styles.followedSection} data-flx="forum.forum-post-list.followed-section">
							<h2 className={styles.followedHeading} data-flx="forum.forum-post-list.followed-heading">
								<StarIcon
									weight="fill"
									className={styles.followedStar}
									data-flx="forum.forum-post-list.followed-star"
								/>
								{i18n._(FOLLOWING_SECTION_DESCRIPTOR)}
							</h2>
							<ForumPostGroup guildId={guildId} viewMode={viewMode} posts={followedPosts} />
						</section>
					)}
					{/* An empty active group is only "nothing found" when there is no other group either:
					    with every post past the inactivity window the section below carries the list. */}
					{activePosts.length === 0 ? (
						nothingToShow && (
							<p className={styles.emptyText} data-flx="forum.forum-post-list.empty-text">
								{i18n._(showOnlyFollowed ? NO_FOLLOWED_DESCRIPTOR : NO_RESULTS_DESCRIPTOR)}
							</p>
						)
					) : (
						<ForumPostGroup guildId={guildId} viewMode={viewMode} posts={activePosts} />
					)}
					{olderPosts.length > 0 && (
						<section className={styles.olderSection} data-flx="forum.forum-post-list.older-section">
							<h2 className={styles.olderHeading} data-flx="forum.forum-post-list.older-heading">
								<button
									type="button"
									className={styles.olderToggle}
									onClick={() => setOlderOpen((open) => !open)}
									aria-expanded={olderOpen}
									data-flx="forum.forum-post-list.older-toggle"
								>
									<CaretDownIcon
										weight="bold"
										className={styles.olderCaret}
										style={{transform: olderOpen ? undefined : 'rotate(-90deg)'}}
										data-flx="forum.forum-post-list.older-caret"
									/>
									{i18n._(OLDER_POSTS_DESCRIPTOR, {count: olderPosts.length})}
								</button>
							</h2>
							{olderOpen && <ForumPostGroup guildId={guildId} viewMode={viewMode} posts={olderPosts} />}
						</section>
					)}
				</div>
			</Scroller>
		);
	},
);
