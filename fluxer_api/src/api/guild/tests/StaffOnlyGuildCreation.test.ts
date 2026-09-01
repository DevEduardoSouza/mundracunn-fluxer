// SPDX-License-Identifier: AGPL-3.0-or-later

import {UserFlags} from '@fluxer/constants/src/UserConstants';
import {HTTP_STATUS} from '../../test/TestConstants';
import {afterEach, beforeEach, describe, expect, test} from 'vitest';
import {createTestAccount} from '../../auth/tests/AuthTestUtils';
import {getInstanceConfigRepository} from '../../middleware/ServiceSingletons';
import {type ApiTestHarness, createApiTestHarness} from '../../test/ApiTestHarness';
import {createBuilder} from '../../test/TestRequestBuilder';

// The harness exposes flags through its test route; HAS_SESSION_STARTED has to ride along or the
// account loses the session state it was created with.
const STAFF_TEST_FLAGS = UserFlags.HAS_SESSION_STARTED | UserFlags.STAFF;

async function setUserFlagsForTesting(harness: ApiTestHarness, userId: string, flags: bigint): Promise<void> {
	await createBuilder(harness, '').patch(`/test/users/${userId}/flags`).body({flags: flags.toString()}).execute();
}

// The client asked that ordinary members cannot create communities on this instance. It lives
// behind an instance policy rather than a hardcoded check, so the owner can flip it in the admin
// panel — and so this rule does not gate the rest of the suite, whose harness creates guilds with
// ordinary users.
describe('staff_only_guild_creation policy', () => {
	let harness: ApiTestHarness;

	beforeEach(async () => {
		harness = await createApiTestHarness();
	});
	afterEach(async () => {
		await harness?.shutdown();
	});

	test('is off by default, so an ordinary user can still create a guild', async () => {
		const account = await createTestAccount(harness);
		await createBuilder(harness, account.token).post('/guilds').body({name: 'Turma'}).expect(200).execute();
	});

	test('blocks an ordinary user once enabled', async () => {
		await getInstanceConfigRepository().setInstancePolicyConfig({staff_only_guild_creation: true});
		const account = await createTestAccount(harness);
		await createBuilder(harness, account.token)
			.post('/guilds')
			.body({name: 'Turma'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	test('still lets staff through once enabled', async () => {
		await getInstanceConfigRepository().setInstancePolicyConfig({staff_only_guild_creation: true});
		const account = await createTestAccount(harness);
		await setUserFlagsForTesting(harness, account.userId, STAFF_TEST_FLAGS);
		await createBuilder(harness, account.token).post('/guilds').body({name: 'Turma'}).expect(200).execute();
	});
});
