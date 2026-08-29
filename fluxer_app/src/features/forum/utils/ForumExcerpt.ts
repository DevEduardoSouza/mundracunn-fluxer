// SPDX-License-Identifier: AGPL-3.0-or-later

/** Enough for the 3–5 clamped lines of a gallery card; the rest is never shown. */
export const FORUM_EXCERPT_MAX_LENGTH = 280;

/**
 * Turns raw message content into a one-paragraph preview: light markdown stripping (code fences,
 * headings, emphasis, quotes, links), whitespace collapsed, capped at {@link FORUM_EXCERPT_MAX_LENGTH}
 * with an ellipsis. Returns '' for content with nothing readable in it.
 */
export function excerptFromContent(content: string | null | undefined): string {
	if (!content) return '';
	const text = content
		.replace(/```[\s\S]*?```/g, ' ')
		.replace(/`([^`]*)`/g, '$1')
		.replace(/^\s{0,3}#{1,6}\s+/gm, '')
		.replace(/^\s*>\s?/gm, '')
		.replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
		.replace(/[*_~|]{1,3}([^*_~|]+)[*_~|]{1,3}/g, '$1')
		.replace(/\s+/g, ' ')
		.trim();
	if (text.length <= FORUM_EXCERPT_MAX_LENGTH) return text;
	return `${text.slice(0, FORUM_EXCERPT_MAX_LENGTH).trimEnd()}…`;
}
