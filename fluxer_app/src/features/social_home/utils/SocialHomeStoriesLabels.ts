// SPDX-License-Identifier: AGPL-3.0-or-later

import {msg} from '@lingui/core/macro';

/**
 * Single source of truth for the feature's user-facing name. CLAUDE.md section 7 flags "Stories"
 * as a provisional name pending the client's kickoff answer — every visible label should read from
 * this one descriptor so the real name (once chosen) is a one-line change here, not a hunt through
 * every component. Internal identifiers (files, classes, routes) intentionally keep the "Stories"
 * name regardless of what ships in the UI, same as the Home page keeps calling itself
 * `social_home`/`SocialHome` in code even though its own label is "Home" — renaming source
 * identifiers to match marketing copy would be a large, rebase-hostile diff for no functional gain.
 */
export const STORIES_FEATURE_NAME_DESCRIPTOR = msg({
	message: 'Stories',
	comment:
		'Provisional name for the class Stories feature (24h posts from the professor/staff at the top of Home) — CLAUDE.md section 7 notes the client has not confirmed the final name yet.',
});
