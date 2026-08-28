// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import type {Channel} from '@app/features/channel/models/Channel';
import * as ForumPostCommands from '@app/features/forum/commands/ForumPostCommands';
import styles from '@app/features/forum/components/ForumCreatePostModal.module.css';
import {forumChannelNameFromTitle, getForumTitleError, normalizeForumTags, parseForumTopic} from '@app/features/forum/utils/ForumTopic';
import {CANCEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Input} from '@app/features/ui/components/form/FormInput';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useState} from 'react';

const MODAL_TITLE_DESCRIPTOR = msg({
	message: 'Edit post',
	comment: 'Title of the modal where the author edits their forum post title and tags.',
});
const TITLE_LABEL_DESCRIPTOR = msg({
	message: 'Title',
	comment: 'Label for the title field in the edit forum post modal.',
});
const TITLE_REQUIRED_DESCRIPTOR = msg({
	message: 'A title is required.',
	comment: 'Validation error when the forum post title is empty.',
});
const TITLE_TOO_LONG_DESCRIPTOR = msg({
	message: 'That title is too long.',
	comment: 'Validation error when the forum post title exceeds the length limit.',
});
const CHANNEL_NAME_PREVIEW_DESCRIPTOR = msg({
	message: 'Channel: #{name}',
	comment: 'Preview showing the channel name the post will get after renaming. {name} is the sanitized slug.',
});
const TAGS_LABEL_DESCRIPTOR = msg({
	message: 'Tags',
	comment: 'Label for the tags field in the edit forum post modal.',
});
const TAGS_PLACEHOLDER_DESCRIPTOR = msg({
	message: 'Add a tag and press Enter',
	comment: 'Placeholder for the tag input in the edit forum post modal.',
});
const REMOVE_TAG_DESCRIPTOR = msg({
	message: 'Remove tag {tag}',
	comment: 'Accessible label for the button that removes a tag chip. {tag} is the tag text.',
});
const SAVE_DESCRIPTOR = msg({
	message: 'Save',
	comment: 'Primary button in the edit forum post modal.',
});
const SAVE_FAILED_DESCRIPTOR = msg({
	message: "Couldn't save the post. Try again.",
	comment: 'Error shown when saving forum post edits fails.',
});

export const ForumEditPostModal: React.FC<{channel: Channel}> = observer(({channel}) => {
	const {i18n} = useLingui();
	const parsed = parseForumTopic(channel.topic);
	const [title, setTitle] = useState(parsed.title ?? channel.name ?? '');
	const [tags, setTags] = useState<Array<string>>(parsed.tags);
	const [tagDraft, setTagDraft] = useState('');
	const [titleError, setTitleError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const namePreview = forumChannelNameFromTitle(title);
	const addTag = useCallback(() => {
		setTags((current) => normalizeForumTags([...current, tagDraft]));
		setTagDraft('');
	}, [tagDraft]);
	const handleTagKeyDown = useCallback(
		(event: React.KeyboardEvent<HTMLInputElement>) => {
			if ((event.key === 'Enter' || event.key === ',') && tagDraft.trim().length > 0) {
				event.preventDefault();
				addTag();
			} else if (event.key === 'Backspace' && tagDraft.length === 0 && tags.length > 0) {
				setTags((current) => current.slice(0, -1));
			}
		},
		[addTag, tagDraft, tags.length],
	);

	const handleSubmit = useCallback(
		async (event: React.FormEvent) => {
			event.preventDefault();
			setSubmitError(null);
			const validationError = getForumTitleError(title);
			if (validationError) {
				setTitleError(i18n._(validationError === 'empty' ? TITLE_REQUIRED_DESCRIPTOR : TITLE_TOO_LONG_DESCRIPTOR));
				return;
			}
			setTitleError(null);
			setIsSubmitting(true);
			try {
				await ForumPostCommands.editForumPost(channel.id, {title, tags: normalizeForumTags([...tags, tagDraft])});
				ModalCommands.pop();
			} catch (_error) {
				setSubmitError(i18n._(SAVE_FAILED_DESCRIPTOR));
				setIsSubmitting(false);
			}
		},
		[channel.id, i18n, tagDraft, tags, title],
	);

	return (
		<Modal.Root size="small" centered data-flx="forum.forum-edit-post-modal.modal-root">
			<form onSubmit={handleSubmit} data-flx="forum.forum-edit-post-modal.form">
				<Modal.Header title={i18n._(MODAL_TITLE_DESCRIPTOR)} data-flx="forum.forum-edit-post-modal.modal-header" />
				<Modal.Content data-flx="forum.forum-edit-post-modal.modal-content">
					<Input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						label={i18n._(TITLE_LABEL_DESCRIPTOR)}
						maxLength={100}
						autoFocus={true}
						required={true}
						error={titleError ?? undefined}
						data-flx="forum.forum-edit-post-modal.title-input"
					/>
					{title.trim().length > 0 && (
						<p className={styles.namePreview} data-flx="forum.forum-edit-post-modal.name-preview">
							{i18n._(CHANNEL_NAME_PREVIEW_DESCRIPTOR, {name: namePreview})}
						</p>
					)}
					<div className={styles.tagsField} data-flx="forum.forum-edit-post-modal.tags-field">
						<span className={styles.fieldLabel} data-flx="forum.forum-edit-post-modal.tags-label">
							{i18n._(TAGS_LABEL_DESCRIPTOR)}
						</span>
						<div className={styles.tagList} data-flx="forum.forum-edit-post-modal.tag-list">
							{tags.map((tag) => (
								<span key={tag} className={styles.tagChip} data-flx="forum.forum-edit-post-modal.tag-chip">
									#{tag}
									<button
										type="button"
										onClick={() => setTags((current) => current.filter((entry) => entry !== tag))}
										aria-label={i18n._(REMOVE_TAG_DESCRIPTOR, {tag})}
										data-flx="forum.forum-edit-post-modal.remove-tag"
									>
										<XIcon data-flx="forum.forum-edit-post-modal.remove-tag-icon" />
									</button>
								</span>
							))}
							<input
								className={styles.tagInput}
								value={tagDraft}
								onChange={(event) => setTagDraft(event.target.value)}
								onKeyDown={handleTagKeyDown}
								onBlur={() => tagDraft.trim().length > 0 && addTag()}
								placeholder={i18n._(TAGS_PLACEHOLDER_DESCRIPTOR)}
								data-flx="forum.forum-edit-post-modal.tag-input"
							/>
						</div>
					</div>
					{submitError && (
						<p className={styles.submitError} data-flx="forum.forum-edit-post-modal.submit-error">
							{submitError}
						</p>
					)}
				</Modal.Content>
				<Modal.Footer data-flx="forum.forum-edit-post-modal.modal-footer">
					<Button onClick={ModalCommands.pop} variant="secondary" data-flx="forum.forum-edit-post-modal.cancel">
						{i18n._(CANCEL_DESCRIPTOR)}
					</Button>
					<Button type="submit" submitting={isSubmitting} data-flx="forum.forum-edit-post-modal.submit">
						{i18n._(SAVE_DESCRIPTOR)}
					</Button>
				</Modal.Footer>
			</form>
		</Modal.Root>
	);
});
