// SPDX-License-Identifier: AGPL-3.0-or-later

import styles from '@app/features/forum/components/ForumCover.module.css';
import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {msg} from '@lingui/core/macro';
import {useLingui} from '@lingui/react/macro';
import {ChatCircleIcon} from '@phosphor-icons/react';
import {clsx} from 'clsx';
import {observer} from 'mobx-react-lite';
import type React from 'react';

const COVER_ALT_DESCRIPTOR = msg({
	message: 'Latest image posted in this forum thread',
	comment: 'Alt text for the cover image of a forum post (the most recent image posted in its channel).',
});

interface ForumCoverProps {
	message: Message | undefined;
	variant: 'thumb' | 'cover';
}

function firstImageUrl(message: Message | undefined): string | null {
	if (!message) return null;
	for (const attachment of message.attachments) {
		if ((attachment.content_type ?? '').startsWith('image/')) {
			return attachment.proxy_url ?? attachment.url;
		}
	}
	return null;
}

export const ForumCover: React.FC<ForumCoverProps> = observer(({message, variant}) => {
	const {i18n} = useLingui();
	const url = firstImageUrl(message);
	const className = clsx(styles.cover, variant === 'thumb' ? styles.thumb : styles.large);
	if (!url) {
		return (
			<div className={clsx(className, styles.placeholder)} data-flx="forum.forum-cover.placeholder">
				<ChatCircleIcon className={styles.placeholderIcon} data-flx="forum.forum-cover.placeholder-icon" />
			</div>
		);
	}
	return (
		<img
			src={url}
			alt={i18n._(COVER_ALT_DESCRIPTOR)}
			loading="lazy"
			decoding="async"
			className={className}
			data-flx="forum.forum-cover.image"
		/>
	);
});
