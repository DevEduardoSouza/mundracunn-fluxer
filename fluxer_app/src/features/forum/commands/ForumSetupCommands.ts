// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ChannelCommands from '@app/features/channel/commands/ChannelCommands';
import {getForumCategories, getGuidelinesChannel} from '@app/features/forum/utils/ForumChannelDiscovery';
import * as MessageCommands from '@app/features/messaging/commands/MessageCommands';
import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import * as SnowflakeUtils from '@fluxer/snowflake/src/SnowflakeUtils';
import type {I18n} from '@lingui/core';
import {msg} from '@lingui/core/macro';

/**
 * The forum is discovered by convention (a category named "Forum*" with a `diretrizes` channel in
 * it), which means a class that never created that structure just sees an empty page telling it to
 * go build one by hand. This is the one-click version, mirroring social_home's "Criar canais da
 * turma": it creates exactly what ForumChannelDiscovery looks for, nothing else — the posts
 * themselves are created by the students.
 *
 * Each step is skipped when the piece already exists, so the action is safe to re-run after a
 * partial failure, and the seeded guidelines message is a starting point the professor edits in
 * Fluxer's own composer.
 */

const FORUM_CATEGORY_NAME = 'Fórum';
const GUIDELINES_CHANNEL_NAME = 'diretrizes';

const SEED_GUIDELINES_DESCRIPTOR = msg({
	message:
		'**Posting guidelines**\n\nEdit this message to set the rules for this class. It is what everyone sees at the top of the forum and inside the new-post window.\n\n- One sketchbook post per person.\n- Post your process, not only the finished piece.\n- Keep feedback constructive.',
	comment:
		'Starter message written into the guidelines channel when staff creates the forum structure. The professor is expected to edit it; markdown is intentional.',
});

export interface ForumSetupResult {
	createdCategory: boolean;
	createdGuidelines: boolean;
}

/** Whether the guild is missing the forum structure entirely (what the empty state keys off). */
export function isForumStructureMissing(guildId: string): boolean {
	return getForumCategories(guildId).length === 0;
}

export async function setupForumChannels(guildId: string, i18n: I18n): Promise<ForumSetupResult> {
	const result: ForumSetupResult = {createdCategory: false, createdGuidelines: false};

	let category = getForumCategories(guildId)[0];
	if (category == null) {
		await ChannelCommands.create(guildId, {
			name: FORUM_CATEGORY_NAME,
			url: null,
			type: ChannelTypes.GUILD_CATEGORY,
			parent_id: null,
			bitrate: null,
			user_limit: null,
		});
		result.createdCategory = true;
		// `create` writes through the Channels store, so the category is readable right away.
		category = getForumCategories(guildId)[0];
	}
	if (category == null) return result;

	if (getGuidelinesChannel(guildId) == null) {
		await ChannelCommands.create(guildId, {
			name: GUIDELINES_CHANNEL_NAME,
			url: null,
			type: ChannelTypes.GUILD_TEXT,
			parent_id: category.id,
			bitrate: null,
			user_limit: null,
		});
		const guidelines = getGuidelinesChannel(guildId);
		if (guidelines) {
			const nonce = SnowflakeUtils.fromTimestamp(Date.now());
			if (MessageCommands.reserveSend(guidelines.id, nonce)) {
				await MessageCommands.send(guidelines.id, {
					content: i18n._(SEED_GUIDELINES_DESCRIPTOR),
					nonce,
					hasAttachments: false,
				});
			}
		}
		result.createdGuidelines = true;
	}
	return result;
}
