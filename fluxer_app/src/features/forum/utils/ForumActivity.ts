// SPDX-License-Identifier: AGPL-3.0-or-later

import type {Channel} from '@app/features/channel/models/Channel';
import {getForumConfigTopicList, normalizeChannelName} from '@app/features/forum/utils/ForumChannelDiscovery';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';

/**
 * "Ocultar postagens inativas há X dias" (docs/analise-forum.md §1 item 8, §5 decision 3): in a big
 * class the post list grows without bound, so posts nobody has written in for a while move into the
 * collapsed "Postagens mais antigas" section. Nothing is ever deleted and nothing is fetched — a
 * post's activity is the timestamp already encoded in its `lastMessageId` snowflake, which the
 * gateway keeps current, so a new message pulls the post back into the active list on its own.
 */

/** Default window before a post counts as inactive — decision 3 of docs/analise-forum.md §5. */
export const DEFAULT_FORUM_INACTIVE_DAYS = 7;

const MS_PER_DAY = 24 * 60 * 60 * 1000;

/**
 * Markers a class owner drops in a forum category's topic to change the window for the whole class
 * (`inativas: 3d`). Matched against the accent-stripped topic, so `Inativas: 3 dias` works too, and
 * `inativas: 0` switches the rule off. Same opt-in-by-topic technique as the "one post per student"
 * marker in ForumChannelDiscovery — no schema, no admin screen.
 */
const INACTIVE_DAYS_TOPIC_PATTERN = /\b(?:inativas|inativos|inactive)\s+(\d{1,4})\s*(?:d|dias?|days?)?\b/;

/** Upper bound for a topic/override value — a year of silence is already "never hide". */
const MAX_FORUM_INACTIVE_DAYS = 365;

/**
 * When a post last saw a message. `lastMessageId` is a snowflake, so the timestamp is free; a post
 * whose only content is its first message (or none at all, when the API hasn't echoed it back yet)
 * falls back to the channel id, which is the moment the post was created.
 */
export function getLastActivityAt(channel: Channel): number {
	return SnowflakeUtils.extractTimestamp(channel.lastMessageId ?? channel.id);
}

/**
 * Whether a post has been quiet for longer than `days`. `days <= 0` means the rule is off, and the
 * comparison is strictly greater than the window so a post that is exactly `days` old is still
 * active — the "X days of silence" the class owner configured have to have fully elapsed.
 */
export function isInactive(channel: Channel, days: number, now: number): boolean {
	if (!Number.isFinite(days) || days <= 0) return false;
	return now - getLastActivityAt(channel) > days * MS_PER_DAY;
}

/**
 * Reads the `inativas: Nd` marker out of a category topic. Returns null when the topic doesn't
 * carry one (caller falls back to the default), 0 when the class turned the rule off.
 */
export function parseInactiveDaysFromTopic(topic: string | null | undefined): number | null {
	const match = INACTIVE_DAYS_TOPIC_PATTERN.exec(normalizeChannelName(topic ?? undefined));
	if (!match) return null;
	const days = Number.parseInt(match[1], 10);
	if (!Number.isFinite(days) || days < 0) return null;
	return Math.min(days, MAX_FORUM_INACTIVE_DAYS);
}

/**
 * The class-wide window: the first forum configuration topic that sets one wins, otherwise the
 * 7-day default. See getForumConfigTopicList for which topics those are and why the guidelines
 * channel is one of them. A per-user override lives in the Forum store's persisted preferences and
 * is applied there, on top of this value.
 */
export function getClassInactiveDays(guildId: string): number {
	for (const topic of getForumConfigTopicList(guildId)) {
		const days = parseInactiveDaysFromTopic(topic);
		if (days != null) return days;
	}
	return DEFAULT_FORUM_INACTIVE_DAYS;
}
