// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ForumCoverCommands from '@app/features/forum/commands/ForumCoverCommands';
import type React from 'react';
import {useEffect, useRef} from 'react';

/**
 * Fires a lazy cover fetch for one forum post channel the first time its card scrolls near the
 * viewport. Only does anything when the search backend is unavailable (otherwise the batched
 * prefetch on the page already covers it) — `ensureCoverLazy` is a no-op in that case. Returns a
 * ref to attach to the card's root element.
 */
export function useForumCoverLazyLoad<T extends HTMLElement>(
	guildId: string,
	channelId: string,
): React.RefObject<T | null> {
	const ref = useRef<T | null>(null);
	useEffect(() => {
		const element = ref.current;
		if (!element || typeof IntersectionObserver === 'undefined') {
			void ForumCoverCommands.ensureCoverLazy(guildId, channelId);
			return;
		}
		const observer = new IntersectionObserver(
			(entries) => {
				for (const entry of entries) {
					if (entry.isIntersecting) {
						void ForumCoverCommands.ensureCoverLazy(guildId, channelId);
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
