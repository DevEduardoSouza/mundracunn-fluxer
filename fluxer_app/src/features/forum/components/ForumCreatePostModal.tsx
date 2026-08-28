// SPDX-License-Identifier: AGPL-3.0-or-later

import * as Modal from '@app/features/app/components/dialogs/Modal';
import * as ForumPostCommands from '@app/features/forum/commands/ForumPostCommands';
import styles from '@app/features/forum/components/ForumCreatePostModal.module.css';
import {getGuidelinesChannel} from '@app/features/forum/utils/ForumChannelDiscovery';
import {forumChannelNameFromTitle, getForumTitleError, normalizeForumTags} from '@app/features/forum/utils/ForumTopic';
import {CANCEL_DESCRIPTOR} from '@app/features/i18n/utils/CommonMessageDescriptors';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {SafeMarkdown} from '@app/features/messaging/components/markdown';
import {Button} from '@app/features/ui/button/Button';
import * as ModalCommands from '@app/features/ui/commands/ModalCommands';
import {Input, Textarea} from '@app/features/ui/components/form/FormInput';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CaretDownIcon, XIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

const MODAL_TITLE_DESCRIPTOR = msg({
	message: 'New post',
	comment: 'Title of the modal where a student creates a new forum post.',
});
const TITLE_LABEL_DESCRIPTOR = msg({
	message: 'Title',
	comment: 'Label for the required title field in the new forum post modal.',
});
const TITLE_PLACEHOLDER_DESCRIPTOR = msg({
	message: 'Give your post a title',
	comment: 'Placeholder for the title field in the new forum post modal.',
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
	comment: 'Preview under the title field showing the channel name the post will get. {name} is the sanitized slug.',
});
const DESCRIPTION_LABEL_DESCRIPTOR = msg({
	message: 'Description',
	comment: 'Label for the optional description field — becomes the first message of the post.',
});
const DESCRIPTION_PLACEHOLDER_DESCRIPTOR = msg({
	message: 'Write the first message of your post',
	comment: 'Placeholder for the description field in the new forum post modal.',
});
const TAGS_LABEL_DESCRIPTOR = msg({
	message: 'Tags',
	comment: 'Label for the optional tags field in the new forum post modal.',
});
const TAGS_PLACEHOLDER_DESCRIPTOR = msg({
	message: 'Add a tag and press Enter',
	comment: 'Placeholder for the tag input in the new forum post modal.',
});
const REMOVE_TAG_DESCRIPTOR = msg({
	message: 'Remove tag {tag}',
	comment: 'Accessible label for the button that removes a tag chip. {tag} is the tag text.',
});
const GUIDELINES_DESCRIPTOR = msg({
	message: 'Posting guidelines',
	comment: 'Collapsible section header in the new forum post modal that shows the guidelines channel message.',
});
const CREATE_DESCRIPTOR = msg({
	message: 'Create post',
	comment: 'Primary button in the new forum post modal.',
});
const CREATE_FAILED_DESCRIPTOR = msg({
	message: "Couldn't create the post. Try again.",
	comment: 'Error shown when creating a forum post fails.',
});

interface ForumCreatePostModalProps {
	guildId: string;
	categoryId: string;
}

export const ForumCreatePostModal: React.FC<ForumCreatePostModalProps> = observer(({guildId, categoryId}) => {
	const {i18n} = useLingui();
	const [title, setTitle] = useState('');
	const [description, setDescription] = useState('');
	const [tags, setTags] = useState<Array<string>>([]);
	const [tagDraft, setTagDraft] = useState('');
	const [titleError, setTitleError] = useState<string | null>(null);
	const [submitError, setSubmitError] = useState<string | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);
	const [guidelines, setGuidelines] = useState<Message | null>(null);
	const [guidelinesOpen, setGuidelinesOpen] = useState(true);

	const guidelinesChannel = getGuidelinesChannel(guildId);
	const guidelinesChannelId = guidelinesChannel?.id;
	useEffect(() => {
		if (!guidelinesChannelId) return;
		let cancelled = false;
		void ForumPostCommands.fetchGuidelinesMessage(guidelinesChannelId)
			.then((message) => {
				if (!cancelled) setGuidelines(message);
			})
			.catch(() => {
				// The guidelines block is optional decoration — a failed fetch just hides it.
			});
		return () => {
			cancelled = true;
		};
	}, [guidelinesChannelId]);

	const namePreview = forumChannelNameFromTitle(title);

	const addTag = useCallback(() => {
		setTags((current) => normalizeForumTags([...current, tagDraft]));
		setTagDraft('');
	}, [tagDraft]);
	const removeTag = useCallback((tag: string) => {
		setTags((current) => current.filter((entry) => entry !== tag));
	}, []);
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
				setTitleError(
					i18n._(validationError === 'empty' ? TITLE_REQUIRED_DESCRIPTOR : TITLE_TOO_LONG_DESCRIPTOR),
				);
				return;
			}
			setTitleError(null);
			const authorId = Users.currentUserId;
			if (!authorId) return;
			setIsSubmitting(true);
			try {
				await ForumPostCommands.createForumPost({
					guildId,
					categoryId,
					authorId,
					title,
					description,
					tags: normalizeForumTags([...tags, tagDraft]),
				});
				ModalCommands.pop();
			} catch (_error) {
				setSubmitError(i18n._(CREATE_FAILED_DESCRIPTOR));
				setIsSubmitting(false);
			}
		},
		[categoryId, description, guildId, i18n, tagDraft, tags, title],
	);

	return (
		<Modal.Root size="small" centered data-flx="forum.forum-create-post-modal.modal-root">
			{/* display:contents keeps the modal's flex column layout (Content flex:1 + Footer pinned)
			    intact while still giving us native submit / Enter — same trick as the app's <Form>. */}
			<form onSubmit={handleSubmit} style={{display: 'contents'}} data-flx="forum.forum-create-post-modal.form">
				<Modal.Header
					title={i18n._(MODAL_TITLE_DESCRIPTOR)}
					data-flx="forum.forum-create-post-modal.modal-header"
				/>
				<Modal.Content data-flx="forum.forum-create-post-modal.modal-content">
					<Input
						value={title}
						onChange={(event) => setTitle(event.target.value)}
						label={i18n._(TITLE_LABEL_DESCRIPTOR)}
						placeholder={i18n._(TITLE_PLACEHOLDER_DESCRIPTOR)}
						maxLength={100}
						autoFocus={true}
						required={true}
						error={titleError ?? undefined}
						data-flx="forum.forum-create-post-modal.title-input"
					/>
					{title.trim().length > 0 && (
						<p className={styles.namePreview} data-flx="forum.forum-create-post-modal.name-preview">
							{i18n._(CHANNEL_NAME_PREVIEW_DESCRIPTOR, {name: namePreview})}
						</p>
					)}
					<Textarea
						value={description}
						onChange={(event) => setDescription(event.target.value)}
						label={i18n._(DESCRIPTION_LABEL_DESCRIPTOR)}
						placeholder={i18n._(DESCRIPTION_PLACEHOLDER_DESCRIPTOR)}
						minRows={3}
						maxRows={10}
						data-flx="forum.forum-create-post-modal.description-input"
					/>
					<div className={styles.tagsField} data-flx="forum.forum-create-post-modal.tags-field">
						<span className={styles.fieldLabel} data-flx="forum.forum-create-post-modal.tags-label">
							{i18n._(TAGS_LABEL_DESCRIPTOR)}
						</span>
						<div className={styles.tagList} data-flx="forum.forum-create-post-modal.tag-list">
							{tags.map((tag) => (
								<span key={tag} className={styles.tagChip} data-flx="forum.forum-create-post-modal.tag-chip">
									#{tag}
									<button
										type="button"
										onClick={() => removeTag(tag)}
										aria-label={i18n._(REMOVE_TAG_DESCRIPTOR, {tag})}
										data-flx="forum.forum-create-post-modal.remove-tag"
									>
										<XIcon data-flx="forum.forum-create-post-modal.remove-tag-icon" />
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
								data-flx="forum.forum-create-post-modal.tag-input"
							/>
						</div>
					</div>
					{guidelinesChannel && guidelines && (
						<div className={styles.guidelines} data-flx="forum.forum-create-post-modal.guidelines">
							<button
								type="button"
								className={styles.guidelinesToggle}
								onClick={() => setGuidelinesOpen((open) => !open)}
								aria-expanded={guidelinesOpen}
								data-flx="forum.forum-create-post-modal.guidelines-toggle"
							>
								<CaretDownIcon
									weight="bold"
									style={{transform: guidelinesOpen ? undefined : 'rotate(-90deg)'}}
									data-flx="forum.forum-create-post-modal.guidelines-caret"
								/>
								{i18n._(GUIDELINES_DESCRIPTOR)}
							</button>
							{guidelinesOpen && (
								<div className={styles.guidelinesBody} data-flx="forum.forum-create-post-modal.guidelines-body">
									<SafeMarkdown content={guidelines.content} />
								</div>
							)}
						</div>
					)}
					{submitError && (
						<p className={styles.submitError} data-flx="forum.forum-create-post-modal.submit-error">
							{submitError}
						</p>
					)}
				</Modal.Content>
				<Modal.Footer data-flx="forum.forum-create-post-modal.modal-footer">
					<Button
						onClick={ModalCommands.pop}
						variant="secondary"
						data-flx="forum.forum-create-post-modal.cancel"
					>
						{i18n._(CANCEL_DESCRIPTOR)}
					</Button>
					<Button type="submit" submitting={isSubmitting} data-flx="forum.forum-create-post-modal.submit">
						{i18n._(CREATE_DESCRIPTOR)}
					</Button>
				</Modal.Footer>
			</form>
		</Modal.Root>
	);
});
