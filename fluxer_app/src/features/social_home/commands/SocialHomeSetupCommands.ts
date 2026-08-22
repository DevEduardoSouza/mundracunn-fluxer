// SPDX-License-Identifier: AGPL-3.0-or-later

import * as ChannelCommands from '@app/features/channel/commands/ChannelCommands';
import {
	getProfessorFeedChannel,
	getSketchbooksCategory,
	getStoriesChannel,
} from '@app/features/social_home/utils/SocialHomeChannelDiscovery';
import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';

/**
 * A fresh guild is born with only #general, so the Home has nothing to aggregate and looks broken
 * to whoever just created their class (reported by the client on 22/08 with a brand-new guild).
 * This creates the conventional structure the Home discovers by name — see
 * SocialHomeChannelDiscovery — the same shape provisioned for the pilot class in Phase 1:
 *
 * - #stories and #feed-do-professor with ATTACH_FILES + EMBED_LINKS denied for @everyone, so
 *   ordinary members cannot post media there (whoever should post gets an explicit allow later,
 *   via Fluxer's own permission UI — same posture as the pilot);
 * - a "sketchbooks" category, empty: per-student channels are created per enrollment, not here.
 *
 * Everything runs through the existing channel-create API; each piece is skipped if a channel
 * with the conventional name already exists, so the action is safe to re-run after a partial
 * failure. Per-student sketchbooks and posting roles remain manual, deliberately.
 */

const MEDIA_DENY = (Permissions.ATTACH_FILES | Permissions.EMBED_LINKS).toString();

function everyoneMediaDeny(guildId: string) {
	// The @everyone role shares the guild's id, by the same convention as Discord.
	return [{id: guildId, type: 0 as const, allow: '0', deny: MEDIA_DENY}];
}

export interface ClassSetupResult {
	createdStories: boolean;
	createdProfessorFeed: boolean;
	createdSketchbooksCategory: boolean;
}

export function isClassStructureMissing(guildId: string): boolean {
	return getStoriesChannel(guildId) == null && getProfessorFeedChannel(guildId) == null;
}

export async function setupClassChannels(guildId: string): Promise<ClassSetupResult> {
	const result: ClassSetupResult = {
		createdStories: false,
		createdProfessorFeed: false,
		createdSketchbooksCategory: false,
	};
	if (getStoriesChannel(guildId) == null) {
		await ChannelCommands.create(guildId, {
			name: 'stories',
			url: null,
			type: ChannelTypes.GUILD_TEXT,
			parent_id: null,
			bitrate: null,
			user_limit: null,
			permission_overwrites: everyoneMediaDeny(guildId),
		});
		result.createdStories = true;
	}
	if (getProfessorFeedChannel(guildId) == null) {
		await ChannelCommands.create(guildId, {
			name: 'feed-do-professor',
			url: null,
			type: ChannelTypes.GUILD_TEXT,
			parent_id: null,
			bitrate: null,
			user_limit: null,
			permission_overwrites: everyoneMediaDeny(guildId),
		});
		result.createdProfessorFeed = true;
	}
	if (getSketchbooksCategory(guildId) == null) {
		await ChannelCommands.create(guildId, {
			name: 'sketchbooks',
			url: null,
			type: ChannelTypes.GUILD_CATEGORY,
			parent_id: null,
			bitrate: null,
			user_limit: null,
		});
		result.createdSketchbooksCategory = true;
	}
	return result;
}
