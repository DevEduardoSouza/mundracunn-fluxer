// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import Users from '@app/features/user/state/Users';

/**
 * A course instance has exactly one audience — the students of the classes hosted here — and
 * "Explore public communities" advertises the opposite: a directory of other people's servers to
 * go join. The client asked for it to be off the table for students while staying reachable for
 * whoever runs the instance, so this gates on the instance-level STAFF flag rather than on a guild
 * role: a professor is staff *of a class*, not of the instance, and Discovery is an instance-wide
 * surface.
 *
 * With no account carrying STAFF, this hides Discovery from everyone — which is also a valid
 * answer to the request ("não ficar disponível para ninguém"). Granting STAFF to the instance
 * owner later flips it to "only me" with no further code change.
 *
 * This is a visibility decision, not an access control boundary: the discovery API stays exactly
 * as open as upstream leaves it, and a determined user could still call it directly. Genuinely
 * locking it down is a server-side change we deliberately are not making here — the guilds
 * themselves are already private, so what leaks is at most the (empty) public directory.
 */
export function canAccessDiscovery(): boolean {
	if (RuntimeConfig.singleCommunityEnabled) {
		return false;
	}
	return Users.getCurrentUser()?.isStaff() ?? false;
}
