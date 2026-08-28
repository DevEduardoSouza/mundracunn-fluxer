// SPDX-License-Identifier: AGPL-3.0-or-later

import {ForumPostCard} from '@app/features/forum/components/ForumPostCard';
import {ForumPostRow} from '@app/features/forum/components/ForumPostRow';
import styles from '@app/features/forum/components/ForumPostList.module.css';
import type {ForumPost, ForumViewMode} from '@app/features/forum/state/Forum';
import {Scroller} from '@app/features/ui/components/Scroller';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const OLDER_POSTS_DESCRIPTOR = msg({
	message: 'Older posts',
	comment: 'Heading for the collapsed section of forum posts hidden by the inactivity filter.',
});
const NO_RESULTS_DESCRIPTOR = msg({
	message: 'No posts match your search.',
	comment: 'Empty state shown in the forum list when the title search matches nothing.',
});

interface ForumPostListProps {
	guildId: string;
	viewMode: ForumViewMode;
	activePosts: ReadonlyArray<ForumPost>;
	olderPosts: ReadonlyArray<ForumPost>;
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
	({guildId, viewMode, activePosts, olderPosts}) => {
		const {i18n} = useLingui();
		return (
			<Scroller className={styles.scroller} data-flx="forum.forum-post-list.scroller">
				<div className={styles.inner} data-flx="forum.forum-post-list.inner">
					{activePosts.length === 0 ? (
						<p className={styles.emptyText} data-flx="forum.forum-post-list.empty-text">
							{i18n._(NO_RESULTS_DESCRIPTOR)}
						</p>
					) : (
						<ForumPostGroup guildId={guildId} viewMode={viewMode} posts={activePosts} />
					)}
					{olderPosts.length > 0 && (
						<section className={styles.olderSection} data-flx="forum.forum-post-list.older-section">
							<h2 className={styles.olderHeading} data-flx="forum.forum-post-list.older-heading">
								{i18n._(OLDER_POSTS_DESCRIPTOR)}
							</h2>
							<ForumPostGroup guildId={guildId} viewMode={viewMode} posts={olderPosts} />
						</section>
					)}
				</div>
			</Scroller>
		);
	},
);
