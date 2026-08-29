// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ForumExcerptCommands from '@app/features/forum/commands/ForumExcerptCommands';
import type React from 'react';
import {useEffect, useRef} from 'react';

/**
 * Fires a lazy excerpt fetch (the post's first message, see ForumExcerptCommands) the first time a
 * gallery card scrolls near the viewport. Same shape as useForumCoverLazyLoad — kept separate so the
 * two loaders evolve independently. Returns a ref to attach to the card's root element.
 */
export function useForumExcerptLazyLoad<T extends HTMLElement>(
	guildId: string,
	channelId: string,
): React.RefObject<T | null> {
	const ref = useRef<T | null>(null);
	useEffect(() => {
		const element = ref.current;
		if (!element || typeof IntersectionObserver === 'undefined') {
			void ForumExcerptCommands.ensureExcerptLazy(guildId, channelId);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						void ForumExcerptCommands.ensureExcerptLazy(guildId, channelId);
						observer.disconnect();
						break;
					}
				}
			},
			{rootMargin: '200px'},
		);
		observer.observe(element);
		return () => {
			observer.disconnect();
		};
	}, [guildId, channelId]);
	return ref;
}
