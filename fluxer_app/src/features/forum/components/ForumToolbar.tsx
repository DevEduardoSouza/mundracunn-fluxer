// SPDX-License-Identifier: AGPL-3.0-or-later

import {Routes} from '@app/app/Routes';
import styles from '@app/features/forum/components/ForumToolbar.module.css';
import Forum, {
	FORUM_INACTIVE_DAYS_OPTIONS,
	type ForumInactiveDaysOverride,
	type ForumSortBy,
	type ForumViewMode,
} from '@app/features/forum/state/Forum';
import {getClassInactiveDays} from '@app/features/forum/utils/ForumActivity';
import {
	canCreateForumPostInCategory,
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
import {MenuBottomSheet, type MenuGroupType} from '@app/features/ui/menu_bottom_sheet/MenuBottomSheet';
import {isMobileExperienceEnabled} from '@app/features/ui/utils/MobileExperience';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CaretDownIcon, MagnifyingGlassIcon, PlusIcon, SlidersHorizontalIcon, StarIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useMemo, useState} from 'react';

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
const FOLLOWING_FILTER_DESCRIPTOR = msg({
	message: 'Following ({count})',
	comment:
		'Toggle chip in the forum toolbar that shows only the posts the user follows. {count} is how many posts they follow.',
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
const HIDE_INACTIVE_DESCRIPTOR = msg({
	message: 'Hide inactive',
	comment: 'Section heading in the forum sort-and-view menu for the "hide posts nobody wrote in" rule.',
});
const HIDE_INACTIVE_DEFAULT_DESCRIPTOR = msg({
	message: 'Class default ({days} days)',
	comment:
		'Forum "hide inactive" option that follows whatever the class configured. {days} is that number of days.',
});
const HIDE_INACTIVE_NEVER_DESCRIPTOR = msg({
	message: 'Show every post',
	comment: 'Forum "hide inactive" option that turns the rule off, keeping every post in the main list.',
});
const HIDE_INACTIVE_DAYS_DESCRIPTOR = msg({
	message: 'After {days} days',
	comment: 'Forum "hide inactive" option: move a post to "Older posts" after {days} days without a message.',
});

const ForumSortMenu: React.FC<{guildId: string; onClose: () => void}> = observer(({guildId, onClose}) => {
	const {i18n} = useLingui();
	const sortBy = Forum.getSortBy();
	const viewMode = Forum.getViewMode();
	const inactiveDaysOverride = Forum.getInactiveDaysOverride();
	const classInactiveDays = getClassInactiveDays(guildId);
	const selectSort = useCallback((value: ForumSortBy) => Forum.setSortBy(value), []);
	const selectView = useCallback((value: ForumViewMode) => Forum.setViewMode(value), []);
	const selectInactiveDays = useCallback(
		(value: ForumInactiveDaysOverride) => Forum.setInactiveDaysOverride(value),
		[],
	);
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
			<MenuGroup data-flx="forum.forum-toolbar.sort-menu.inactive-group">
				<MenuGroupLabel data-flx="forum.forum-toolbar.sort-menu.inactive-label">
					{i18n._(HIDE_INACTIVE_DESCRIPTOR)}
				</MenuGroupLabel>
				<MenuItemRadio
					selected={inactiveDaysOverride == null}
					onSelect={() => selectInactiveDays(null)}
					data-flx="forum.forum-toolbar.sort-menu.inactive-default"
				>
					{i18n._(HIDE_INACTIVE_DEFAULT_DESCRIPTOR, {days: classInactiveDays})}
				</MenuItemRadio>
				{FORUM_INACTIVE_DAYS_OPTIONS.map((days) => (
					<MenuItemRadio
						key={days}
						selected={inactiveDaysOverride === days}
						onSelect={() => selectInactiveDays(days)}
						data-flx="forum.forum-toolbar.sort-menu.inactive-option"
					>
						{days === 0
							? i18n._(HIDE_INACTIVE_NEVER_DESCRIPTOR)
							: i18n._(HIDE_INACTIVE_DAYS_DESCRIPTOR, {days})}
					</MenuItemRadio>
				))}
			</MenuGroup>
		</ContextMenuCloseProvider>
	);
});

/**
 * As mesmas opcoes do ForumSortMenu, mas como dados em vez de JSX.
 *
 * No celular o ContextMenu nao existe: ele retorna null quando a experiencia
 * mobile esta ligada (ContextMenu.tsx:708), e o app inteiro troca menu de
 * contexto por bottom sheet. Sem isto o botao "Sort & view" abria o estado do
 * menu e nao renderizava nada - foi o que o cliente relatou.
 */
function useSortMenuGroups(guildId: string): Array<MenuGroupType> {
	const {i18n} = useLingui();
	const sortBy = Forum.getSortBy();
	const viewMode = Forum.getViewMode();
	const inactiveDaysOverride = Forum.getInactiveDaysOverride();
	const classInactiveDays = getClassInactiveDays(guildId);
	return useMemo(
		() => [
			{
				items: [
					{label: i18n._(SORT_ACTIVITY_DESCRIPTOR), selected: sortBy === 'activity', onSelect: () => Forum.setSortBy('activity')},
					{label: i18n._(SORT_CREATED_DESCRIPTOR), selected: sortBy === 'created', onSelect: () => Forum.setSortBy('created')},
					{label: i18n._(SORT_TITLE_DESCRIPTOR), selected: sortBy === 'title', onSelect: () => Forum.setSortBy('title')},
				],
			},
			{
				items: [
					{label: i18n._(VIEW_LIST_DESCRIPTOR), selected: viewMode === 'list', onSelect: () => Forum.setViewMode('list')},
					{label: i18n._(VIEW_GALLERY_DESCRIPTOR), selected: viewMode === 'grid', onSelect: () => Forum.setViewMode('grid')},
				],
			},
			{
				items: [
					{
						label: i18n._(HIDE_INACTIVE_DEFAULT_DESCRIPTOR, {days: classInactiveDays}),
						selected: inactiveDaysOverride == null,
						onSelect: () => Forum.setInactiveDaysOverride(null),
					},
					...FORUM_INACTIVE_DAYS_OPTIONS.map((days) => ({
						label: days === 0 ? i18n._(HIDE_INACTIVE_NEVER_DESCRIPTOR) : i18n._(HIDE_INACTIVE_DAYS_DESCRIPTOR, {days}),
						selected: inactiveDaysOverride === days,
						onSelect: () => Forum.setInactiveDaysOverride(days),
					})),
				],
			},
		],
		[i18n, sortBy, viewMode, inactiveDaysOverride, classInactiveDays],
	);
}

interface ForumToolbarProps {
	guildId: string;
}

export const ForumToolbar: React.FC<ForumToolbarProps> = observer(({guildId}) => {
	const {i18n} = useLingui();
	const {isOpen, withTracking} = useContextMenuTrigger();
	const [sortSheetOpen, setSortSheetOpen] = useState(false);
	const sortMenuGroups = useSortMenuGroups(guildId);
	const closeSortSheet = useCallback(() => setSortSheetOpen(false), []);
	const query = Forum.getQuery();
	const showOnlyFollowed = Forum.getShowOnlyFollowed();
	const followedCount = Forum.getFollowedPosts().length;
	const toggleFollowedFilter = useCallback(() => Forum.toggleShowOnlyFollowed(), []);
	const handleQueryChange = useCallback((event: React.ChangeEvent<HTMLInputElement>) => {
		Forum.setQuery(event.target.value);
	}, []);
	const openSortMenu = useCallback(
		(event: React.MouseEvent<HTMLButtonElement>) => {
			// No celular o ContextMenu nao renderiza (ver useSortMenuGroups), entao vai
			// de bottom sheet - o mesmo padrao que o resto do app usa no mobile.
			if (isMobileExperienceEnabled()) {
				setSortSheetOpen(true);
				return;
			}
			ContextMenuCommands.openFromElementBottomRight(
				event,
				({onClose}) => (
					<ForumSortMenu guildId={guildId} onClose={onClose} data-flx="forum.forum-toolbar.open-sort-menu.menu" />
				),
				withTracking(),
			);
		},
		[guildId, withTracking],
	);
	// "One post per student" (opt-in via a marker in a forum category topic): when the student
	// already has a post, the button opens it instead of the create modal.
	const category = getForumCategories(guildId)[0];
	const ownPost =
		isSinglePostRuleEnabled(guildId) && Users.currentUserId
			? findOwnForumPostChannel(guildId, Users.currentUserId)
			: undefined;
	// Only offer the create button to people who can actually create — without MANAGE_CHANNELS on
	// the category the API answers 403 and the user just sees an error.
	const canCreate = category != null && canCreateForumPostInCategory(category.id);
	const showNewPostButton = ownPost != null || canCreate;
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
			{showNewPostButton && (
				<Button
					variant="primary"
					onClick={handleNewPost}
					leftIcon={<PlusIcon size={remFromPx(16)} data-flx="forum.forum-toolbar.new-post-icon" />}
					data-flx="forum.forum-toolbar.new-post"
				>
					{i18n._(ownPost ? OPEN_MY_POST_DESCRIPTOR : NEW_POST_DESCRIPTOR)}
				</Button>
			)}
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
			{/* Kept visible while the filter is on even at zero, so the user can switch it back off. */}
			{(followedCount > 0 || showOnlyFollowed) && (
				<Button
					variant={showOnlyFollowed ? 'primary' : 'secondary'}
					onClick={toggleFollowedFilter}
					aria-pressed={showOnlyFollowed}
					leftIcon={
						<StarIcon
							size={remFromPx(16)}
							weight={showOnlyFollowed ? 'fill' : 'regular'}
							data-flx="forum.forum-toolbar.following-icon"
						/>
					}
					data-flx="forum.forum-toolbar.following-filter"
				>
					{i18n._(FOLLOWING_FILTER_DESCRIPTOR, {count: followedCount})}
				</Button>
			)}
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
			<MenuBottomSheet
				isOpen={sortSheetOpen}
				onClose={closeSortSheet}
				title={i18n._(SORT_AND_VIEW_DESCRIPTOR)}
				groups={sortMenuGroups}
				data-flx="forum.forum-toolbar.sort-bottom-sheet"
			/>
		</div>
	);
});
