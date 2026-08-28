// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import styles from '@app/features/forum/components/ForumToolbar.module.css';
import Forum, {type ForumSortBy, type ForumViewMode} from '@app/features/forum/state/Forum';
import {
	findOwnForumPostChannel,
	getForumCategories,
	isSinglePostRuleEnabled,
} from '@app/features/forum/utils/ForumChannelDiscovery';
import * as RouterUtils from '@app/features/navigation/utils/RouterUtils';
import {remFromPx} from '@app/features/theme/layout/RemFromPx';
import {ContextMenuCloseProvider, MenuGroupLabel} from '@app/features/ui/action_menu/ContextMenu';
import {MenuGroup} from '@app/features/ui/action_menu/MenuGroup';
import {MenuItemRadio} from '@app/features/ui/action_menu/MenuItemRadio';
import {Button} from '@app/features/ui/button/Button';
import * as ContextMenuCommands from '@app/features/ui/commands/ContextMenuCommands';
import {modal, push as pushModal} from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {useContextMenuTrigger} from '@app/features/ui/hooks/useContextMenuTrigger';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CaretDownIcon, MagnifyingGlassIcon, PlusIcon, SlidersHorizontalIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback} from 'react';

const NEW_POST_DESCRIPTOR = msg({
	message: 'New post',
	comment: 'Button in the forum toolbar that opens the create-forum-post flow.',
});
const OPEN_MY_POST_DESCRIPTOR = msg({
	message: 'Open my post',
	comment: 'Forum toolbar button label shown, instead of "New post", when the one-post-per-student rule is on and the student already has a post.',
});
const SEARCH_PLACEHOLDER_DESCRIPTOR = msg({
	message: 'Search posts',
	comment: 'Placeholder for the forum toolbar search field, which filters posts by title.',
});
const SORT_AND_VIEW_DESCRIPTOR = msg({
	message: 'Sort & view',
	comment: 'Label of the forum toolbar button that opens the sort-order and list/gallery view menu.',
});
const SORT_BY_DESCRIPTOR = msg({
	message: 'Sort by',
	comment: 'Section heading in the forum sort-and-view menu.',
});
const SORT_ACTIVITY_DESCRIPTOR = msg({
	message: 'Recent activity',
	comment: 'Forum sort option: newest message first. The default.',
});
const SORT_CREATED_DESCRIPTOR = msg({
	message: 'Post date',
	comment: 'Forum sort option: newest post (channel creation) first.',
});
const SORT_TITLE_DESCRIPTOR = msg({
	message: 'Title',
	comment: 'Forum sort option: alphabetical by post title.',
});
const VIEW_AS_DESCRIPTOR = msg({
	message: 'View as',
	comment: 'Section heading in the forum sort-and-view menu.',
});
const VIEW_LIST_DESCRIPTOR = msg({
	message: 'List',
	comment: 'Forum view option: compact one-per-row list.',
});
const VIEW_GALLERY_DESCRIPTOR = msg({
	message: 'Gallery',
	comment: 'Forum view option: grid of cards with a large cover image.',
});

const ForumSortMenu: React.FC<{onClose: () => void}> = observer(({onClose}) => {
	const {i18n} = useLingui();
	const sortBy = Forum.getSortBy();
	const viewMode = Forum.getViewMode();
	const selectSort = useCallback((value: ForumSortBy) => Forum.setSortBy(value), []);
	const selectView = useCallback((value: ForumViewMode) => Forum.setViewMode(value), []);
	return (
		<ContextMenuCloseProvider value={onClose} data-flx="forum.forum-toolbar.sort-menu.close-provider">
			<MenuGroup data-flx="forum.forum-toolbar.sort-menu.sort-group">
				<MenuGroupLabel data-flx="forum.forum-toolbar.sort-menu.sort-label">
					{i18n._(SORT_BY_DESCRIPTOR)}
				</MenuGroupLabel>
				<MenuItemRadio
					selected={sortBy === 'activity'}
					onSelect={() => selectSort('activity')}
					data-flx="forum.forum-toolbar.sort-menu.sort-activity"
				>
					{i18n._(SORT_ACTIVITY_DESCRIPTOR)}
				</MenuItemRadio>
				<MenuItemRadio
					selected={sortBy === 'created'}
					onSelect={() => selectSort('created')}
					data-flx="forum.forum-toolbar.sort-menu.sort-created"
				>
					{i18n._(SORT_CREATED_DESCRIPTOR)}
				</MenuItemRadio>
				<MenuItemRadio
					selected={sortBy === 'title'}
					onSelect={() => selectSort('title')}
					data-flx="forum.forum-toolbar.sort-menu.sort-title"
				>
					{i18n._(SORT_TITLE_DESCRIPTOR)}
				</MenuItemRadio>
			</MenuGroup>
			<MenuGroup data-flx="forum.forum-toolbar.sort-menu.view-group">
				<MenuGroupLabel data-flx="forum.forum-toolbar.sort-menu.view-label">
					{i18n._(VIEW_AS_DESCRIPTOR)}
				</MenuGroupLabel>
				<MenuItemRadio
					selected={viewMode === 'list'}
					onSelect={() => selectView('list')}
					data-flx="forum.forum-toolbar.sort-menu.view-list"
				>
					{i18n._(VIEW_LIST_DESCRIPTOR)}
				</MenuItemRadio>
				<MenuItemRadio
					selected={viewMode === 'grid'}
					onSelect={() => selectView('grid')}
					data-flx="forum.forum-toolbar.sort-menu.view-gallery"
				>
					{i18n._(VIEW_GALLERY_DESCRIPTOR)}
				</MenuItemRadio>
			</MenuGroup>
		</ContextMenuCloseProvider>
	);
});

interface ForumToolbarProps {
	guildId: string;
}

export const ForumToolbar: React.FC<ForumToolbarProps> = observer(({guildId}) => {
	const {i18n} = useLingui();
	const {isOpen, withTracking} = useContextMenuTrigger();
	const query = Forum.getQuery();
	const handleQueryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		Forum.setQuery(event.target.value);
	}, []);
	const openSortMenu = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			ContextMenuCommands.openFromElementBottomRight(
				event,
				({onClose}) => <ForumSortMenu onClose={onClose} data-flx="forum.forum-toolbar.open-sort-menu.menu" />,
				withTracking(),
			);
		},
		[withTracking],
	);
	// "One post per student" (opt-in via a marker in a forum category topic): when the student
	// already has a post, the button opens it instead of the create modal.
	const category = getForumCategories(guildId)[0];
	const ownPost =
		isSinglePostRuleEnabled(guildId) && Users.currentUserId
			? findOwnForumPostChannel(guildId, Users.currentUserId)
			: undefined;
	const handleNewPost = useCallback(async () => {
		if (ownPost) {
			RouterUtils.transitionTo(Routes.guildChannel(guildId, ownPost.id));
			return;
		}
		if (!category) return;
		const {ForumCreatePostModal} = await import('@app/features/forum/components/ForumCreatePostModal');
		pushModal(
			modal(() => (
				<ForumCreatePostModal
					guildId={guildId}
					categoryId={category.id}
					data-flx="forum.forum-toolbar.create-post-modal"
				/>
			)),
		);
	}, [category, guildId, ownPost]);
	return (
		<div className={styles.toolbar} data-flx="forum.forum-toolbar.toolbar">
			<Button
				variant="primary"
				onClick={handleNewPost}
				disabled={!category && !ownPost}
				leftIcon={<PlusIcon size={remFromPx(16)} data-flx="forum.forum-toolbar.new-post-icon" />}
				data-flx="forum.forum-toolbar.new-post"
			>
				{i18n._(ownPost ? OPEN_MY_POST_DESCRIPTOR : NEW_POST_DESCRIPTOR)}
			</Button>
			<Input
				value={query}
				onChange={handleQueryChange}
				placeholder={i18n._(SEARCH_PLACEHOLDER_DESCRIPTOR)}
				className={styles.search}
				leftIcon={
					<MagnifyingGlassIcon size={remFromPx(16)} data-flx="forum.forum-toolbar.search-icon" />
				}
				data-flx="forum.forum-toolbar.search"
			/>
			<Button
				variant="secondary"
				onClick={openSortMenu}
				aria-haspopup="menu"
				aria-expanded={isOpen}
				leftIcon={<SlidersHorizontalIcon size={remFromPx(16)} data-flx="forum.forum-toolbar.sort-icon" />}
				rightIcon={<CaretDownIcon size={remFromPx(14)} data-flx="forum.forum-toolbar.sort-caret" />}
				data-flx="forum.forum-toolbar.sort-and-view"
			>
				{i18n._(SORT_AND_VIEW_DESCRIPTOR)}
			</Button>
		</div>
	);
});
