// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * A forum post is a plain text channel, and the API sanitizes channel names (lowercase, spaces to
 * hyphens, punctuation stripped, 1–100 chars — see @fluxer/schema ChannelNameType). So the "pretty"
 * title the student typed can't live in the channel name. It lives in the channel `topic` instead,
 * which the API leaves alone and which shows in the channel header:
 *
 *   line 1  → the original title, verbatim
 *   line 2  → `#tag #tag` (only when there are tags) — a human-readable line, not JSON
 *
 * The list/gallery show line 1 as the title when a topic is set, falling back to the channel name.
 */

const MAX_TITLE_LENGTH = 100;

// Mirror of @fluxer/schema/src/primitives/ChannelValidators ChannelNameType: the exact set of
// characters the API drops after lowercasing and turning whitespace into hyphens.
const CHANNEL_NAME_DISALLOWED_CHARS = new Set(" !\"#$%&'()*+,/:;<=>?@[\\]^`{|}~");

export interface ForumTopicData {
	title: string;
	tags: ReadonlyArray<string>;
}

export interface ParsedForumTopic {
	title: string | null;
	tags: Array<string>;
}

/** Collapse to a single line and trim — the title is line 1 of the topic and must not add lines. */
function toSingleLine(value: string): string {
	return value.replace(/\s+/g, ' ').trim();
}

/** Slug for one tag: lowercase, hyphen-separated, `a–z 0–9 -` only, no leading/trailing/repeated hyphens. */
export function normalizeForumTag(tag: string): string {
	return tag
		.trim()
		.toLowerCase()
		.replace(/\s+/g, '-')
		.replace(/[^a-z0-9-]/g, '')
		.replace(/-+/g, '-')
		.replace(/^-+|-+$/g, '');
}

export function normalizeForumTags(tags: ReadonlyArray<string>): Array<string> {
	const seen = new Set<string>();
	const result: Array<string> = [];
	for (const tag of tags) {
		const normalized = normalizeForumTag(tag);
		if (normalized.length === 0 || seen.has(normalized)) continue;
		seen.add(normalized);
		result.push(normalized);
	}
	return result;
}

export function serializeForumTopic(data: ForumTopicData): string {
	const title = toSingleLine(data.title);
	const tags = normalizeForumTags(data.tags);
	if (tags.length === 0) return title;
	return `${title}\n${tags.map((tag) => `#${tag}`).join(' ')}`;
}

function looksLikeTagLine(line: string): boolean {
	const tokens = line.trim().split(/\s+/);
	return tokens.length > 0 && tokens.every((token) => /^#[a-z0-9-]+$/i.test(token));
}

export function parseForumTopic(topic: string | null | undefined): ParsedForumTopic {
	if (!topic) return {title: null, tags: []};
	const lines = topic.split('\n');
	const title = toSingleLine(lines[0] ?? '');
	let tags: Array<string> = [];
	for (const line of lines.slice(1)) {
		if (line.trim().length === 0) continue;
		if (looksLikeTagLine(line)) {
			tags = normalizeForumTags(line.trim().split(/\s+/).map((token) => token.replace(/^#/, '')));
		}
		break;
	}
	return {title: title.length > 0 ? title : null, tags};
}

/**
 * The channel name the API will end up with for a given title — same transform as ChannelNameType,
 * so the modal can show an accurate preview. Never empty (`-` fallback), clamped to 100 chars.
 */
export function forumChannelNameFromTitle(title: string): string {
	const processed =
		title
			.trim()
			.toLowerCase()
			.replace(/\s+/g, '-')
			.split('')
			.filter((char) => !CHANNEL_NAME_DISALLOWED_CHARS.has(char))
			.join('') || '-';
	return processed.slice(0, 100);
}

export type ForumTitleError = 'empty' | 'too_long';

export function getForumTitleError(title: string): ForumTitleError | null {
	const trimmed = title.trim();
	if (trimmed.length === 0) return 'empty';
	if (trimmed.length > MAX_TITLE_LENGTH) return 'too_long';
	return null;
}
