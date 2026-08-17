// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Message} from '@app/features/messaging/models/MessagingMessage';
import {compare} from '@fluxer/snowflake/src/SnowflakeUtils';

/**
 * The stories channel has no per-thread scoping (see CLAUDE.md section 6.1) — a story's comments
 * are just later messages in the same channel. Bounding a comment fetch at "the next story
 * chronologically" keeps that fetch from swallowing a *different* story's comment thread, and
 * makes "reply not found in the loaded window" an honest signal of a deleted parent rather than an
 * artifact of the fetch window. `stories` only needs to contain root story messages (any channel).
 */
export function getNextStoryId(stories: ReadonlyArray<Message>, storyId: string): string | null {
	let next: string | null = null;
	for (const story of stories) {
		if (compare(story.id, storyId) <= 0) continue;
		if (next == null || compare(story.id, next) < 0) {
			next = story.id;
		}
	}
	return next;
}
