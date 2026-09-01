// SPDX-License-Identifier: AGPL-3.0-or-later

import RuntimeConfig from '@app/features/app/state/RuntimeConfig';
import Users from '@app/features/user/state/Users';

/**
 * Surfaces that belong to whoever runs the instance rather than to the people using it. Same gate
 * and same reasoning as the Discovery one next door (features/discovery/utils/DiscoveryAccess.ts):
 * the instance-level STAFF flag, not a guild role — a professor is staff *of a class*, while these
 * are instance-wide controls.
 *
 * With no account carrying STAFF this hides them from everyone, which is a safe default; granting
 * STAFF to the owner flips each one to "only me" with no further code change.
 */

/**
 * The "+" that creates or joins a community. Requested on 31/08/2026 ("limitar para que usuários
 * comuns não possam criar comunidades... remover esse botão para usuários com exceção do meu").
 *
 * Hiding the button is only half of it — see the matching STAFF check on POST /guilds in
 * fluxer_api's GuildBaseController. Without that, anyone could still create a community by calling
 * the API directly, so treat this purely as the visible half of a rule enforced on the server.
 */
export function canCreateGuild(): boolean {
	// Upstream already hides the button in single-community mode; keep honouring that first so the
	// two rules can't disagree.
	if (RuntimeConfig.singleCommunityEnabled) {
		return false;
	}
	return Users.getCurrentUser()?.isStaff() ?? false;
}

/**
 * The Favorites star at the top of the guild list. Unlike guild creation this one is *only* a
 * visibility decision and needs no server counterpart: Favorites is a per-user preference pointing
 * at channels the user can already see (features/messaging/state/Favorites.ts), so nothing is
 * exposed if someone reaches the route by hand — they would see their own, empty, favorites.
 */
export function canAccessFavorites(): boolean {
	return Users.getCurrentUser()?.isStaff() ?? false;
}
