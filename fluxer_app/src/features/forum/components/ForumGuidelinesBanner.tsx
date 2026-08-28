// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ForumPostCommands from '@app/features/forum/commands/ForumPostCommands';
import styles from '@app/features/forum/components/ForumGuidelinesBanner.module.css';
import {getGuidelinesChannel} from '@app/features/forum/utils/ForumChannelDiscovery';
import {SafeMarkdown} from '@app/features/messaging/components/markdown';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import AppStorage from '@app/features/platform/state/PersistentStorage';
import Users from '@app/features/user/state/Users';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {CaretDownIcon} from '@phosphor-icons/react';
import {observer} from 'mobx-react-lite';
import type React from 'react';
import {useCallback, useEffect, useState} from 'react';

/**
 * "Diretrizes de Postagem" (docs/analise-forum.md §1 item 5): the rules panel the class pins above
 * the post list. There is no rules storage anywhere — the panel is simply the first message of the
 * forum category's `diretrizes` channel, rendered as markdown, which lets the professor edit the
 * rules in Fluxer's own composer with nothing to deploy.
 *
 * On the forum page it collapses once the reader dismisses it ("já li"), remembered per user in
 * AppStorage; inside the new-post modal it is always shown expanded, because that is the moment the
 * rules actually matter.
 */

const GUIDELINES_DESCRIPTOR = msg({
	message: 'Posting guidelines',
	comment: 'Header of the forum panel that shows the rules message from the guidelines channel.',
});
const DISMISS_DESCRIPTOR = msg({
	message: 'Got it',
	comment: 'Button that collapses the forum posting-guidelines panel for good ("já li").',
});
const EXPAND_DESCRIPTOR = msg({
	message: 'Show the posting guidelines',
	comment: 'Accessible label for the collapsed forum posting-guidelines panel header.',
});
const COLLAPSE_DESCRIPTOR = msg({
	message: 'Hide the posting guidelines',
	comment: 'Accessible label for the expanded forum posting-guidelines panel header.',
});

function dismissedStorageKey(userId: string, channelId: string): string {
	return `Forum:guidelinesRead:${userId}:${channelId}`;
}

interface ForumGuidelinesBannerProps {
	guildId: string;
	/**
	 * Inside the new-post modal the panel is a plain always-open block: no "Got it", no persisted
	 * collapse, and no dismissal — the reader is about to post right now.
	 */
	variant?: 'page' | 'modal';
}

export const ForumGuidelinesBanner: React.FC<ForumGuidelinesBannerProps> = observer(({guildId, variant = 'page'}) => {
	const {i18n} = useLingui();
	const [guidelines, setGuidelines] = useState<Message | null>(null);
	const [isOpen, setIsOpen] = useState(true);
	const guidelinesChannel = getGuidelinesChannel(guildId);
	const guidelinesChannelId = guidelinesChannel?.id;
	const userId = Users.currentUserId ?? '';

	useEffect(() => {
		if (!guidelinesChannelId) return;
		let cancelled = false;
		void ForumPostCommands.fetchGuidelinesMessage(guidelinesChannelId)
			.then((message) => {
				if (!cancelled) setGuidelines(message);
			})
			.catch(() => {
				// The panel is optional decoration — a failed fetch just leaves it out.
			});
		return () => {
			cancelled = true;
		};
	}, [guidelinesChannelId]);

	// Start collapsed for a reader who already dismissed these guidelines. Only the page variant
	// remembers; the modal always opens expanded.
	useEffect(() => {
		if (variant !== 'page' || !guidelinesChannelId || !userId) return;
		setIsOpen(AppStorage.getItem(dismissedStorageKey(userId, guidelinesChannelId)) == null);
	}, [guidelinesChannelId, userId, variant]);

	const handleDismiss = useCallback(() => {
		setIsOpen(false);
		if (!guidelinesChannelId || !userId) return;
		AppStorage.setItem(dismissedStorageKey(userId, guidelinesChannelId), '1');
	}, [guidelinesChannelId, userId]);

	const handleToggle = useCallback(() => setIsOpen((open) => !open), []);

	if (!guidelinesChannel || !guidelines) return null;

	if (variant === 'modal') {
		return (
			<section className={styles.modalPanel} data-flx="forum.forum-guidelines-banner.modal-panel">
				<h2 className={styles.modalHeading} data-flx="forum.forum-guidelines-banner.modal-heading">
					{i18n._(GUIDELINES_DESCRIPTOR)}
				</h2>
				<div className={styles.body} data-flx="forum.forum-guidelines-banner.modal-body">
					<SafeMarkdown content={guidelines.content} />
				</div>
			</section>
		);
	}

	return (
		<section className={styles.banner} data-flx="forum.forum-guidelines-banner.banner">
			<div className={styles.header} data-flx="forum.forum-guidelines-banner.header">
				<button
					type="button"
					className={styles.toggle}
					onClick={handleToggle}
					aria-expanded={isOpen}
					aria-label={i18n._(isOpen ? COLLAPSE_DESCRIPTOR : EXPAND_DESCRIPTOR)}
					data-flx="forum.forum-guidelines-banner.toggle"
				>
					<CaretDownIcon
						weight="bold"
						className={styles.caret}
						style={{transform: isOpen ? undefined : 'rotate(-90deg)'}}
						data-flx="forum.forum-guidelines-banner.caret"
					/>
					{i18n._(GUIDELINES_DESCRIPTOR)}
				</button>
				{isOpen && (
					<button
						type="button"
						className={styles.dismiss}
						onClick={handleDismiss}
						data-flx="forum.forum-guidelines-banner.dismiss"
					>
						{i18n._(DISMISS_DESCRIPTOR)}
					</button>
				)}
			</div>
			{isOpen && (
				<div className={styles.body} data-flx="forum.forum-guidelines-banner.body">
					<SafeMarkdown content={guidelines.content} />
				</div>
			)}
		</section>
	);
});
