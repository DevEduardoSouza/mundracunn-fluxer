// SPDX-License-Identifier: AGPL-3.0-or-later

import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import {afterAll, beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {InviteTypes} from '@fluxer/constants/src/ChannelConstants';
import {createChannelID, createGuildID, createInviteCode} from '../../BrandedTypes';
import {getInstanceConfigRepository, getInviteRepository} from '../../middleware/ServiceSingletons';
import type {ApiTestHarness} from '../../test/ApiTestHarness';
import {createBuilderWithoutAuth} from '../../test/TestRequestBuilder';
import {createAuthHarness, createUniqueEmail, createUniqueUsername} from './AuthTestUtils';

interface PendingRegistrationResponse {
	registration_pending_approval: true;
	user_id: string;
}

interface RegistrationTokenResponse {
	user_id: string;
	token: string;
}

function registrationBody(prefix: string): Record<string, unknown> {
	return {
		email: createUniqueEmail(prefix),
		username: createUniqueUsername(prefix),
		global_name: 'Registration Policy',
		password: 'a-strong-password',
		date_of_birth: '2000-01-01',
		consent: true,
	};
}

describe('Auth registration policy', () => {
	let harness: ApiTestHarness;

	beforeAll(async () => {
		harness = await createAuthHarness();
	});

	beforeEach(async () => {
		await harness.reset();
	});

	afterAll(async () => {
		await harness?.shutdown();
	});

	it('blocks public registration when registration is closed', async () => {
		await getInstanceConfigRepository().setRegistrationConfig({mode: 'closed'});
		await createBuilderWithoutAuth(harness)
			.post('/auth/register')
			.body(registrationBody('closed'))
			.expect(403, APIErrorCodes.REGISTRATION_CLOSED)
			.execute();
	});

	it('allows a valid admin-issued registration URL while public registration is closed', async () => {
		const repository = getInstanceConfigRepository();
		await repository.setRegistrationConfig({mode: 'closed', admin_registration_urls_enabled: true});
		const {code} = await repository.createRegistrationUrl({
			label: 'Test link',
			createdByUserId: '1',
			expiresAt: null,
			maxUses: 1,
			approvalRequired: false,
		});
		const registration = await createBuilderWithoutAuth<RegistrationTokenResponse>(harness)
			.post('/auth/register')
			.body({...registrationBody('closedlink'), registration_url_code: code})
			.execute();
		expect(registration.token.length).toBeGreaterThan(0);
		expect(registration.user_id.length).toBeGreaterThan(0);
		await createBuilderWithoutAuth(harness)
			.post('/auth/register')
			.body({...registrationBody('closedlinkreuse'), registration_url_code: code})
			.expect(400, APIErrorCodes.REGISTRATION_URL_INVALID)
			.execute();
	});

	/**
	 * MUNDRACUNN: a closed instance used to refuse a person holding a perfectly valid channel
	 * invite, because the gate only looked at `registration_url_code`. The invite is written
	 * straight to the repository so the test does not depend on guild creation, which the staff
	 * gate on POST /guilds blocks for the harness user.
	 */
	async function seedGuildInvite(code: string, {maxUses = 0, uses = 0} = {}): Promise<void> {
		await getInviteRepository().create({
			code: createInviteCode(code),
			type: InviteTypes.GUILD,
			guild_id: createGuildID(1545063019757699072n),
			channel_id: createChannelID(1545063019757699075n),
			uses,
			max_uses: maxUses,
			max_age: 0,
		});
	}

	it('allows registration with a usable guild invite while registration is closed', async () => {
		await getInstanceConfigRepository().setRegistrationConfig({mode: 'closed'});
		await seedGuildInvite('conviteok');
		const registration = await createBuilderWithoutAuth<RegistrationTokenResponse>(harness)
			.post('/auth/register')
			.body({...registrationBody('closedinvite'), invite_code: 'conviteok'})
			.execute();
		expect(registration.token.length).toBeGreaterThan(0);
	});

	it('still refuses an exhausted invite while registration is closed', async () => {
		await getInstanceConfigRepository().setRegistrationConfig({mode: 'closed'});
		await seedGuildInvite('conviteusado', {maxUses: 1, uses: 1});
		await createBuilderWithoutAuth(harness)
			.post('/auth/register')
			.body({...registrationBody('spent'), invite_code: 'conviteusado'})
			.expect(403, APIErrorCodes.REGISTRATION_CLOSED)
			.execute();
	});

	it('still refuses an invite code that does not exist', async () => {
		await getInstanceConfigRepository().setRegistrationConfig({mode: 'closed'});
		await createBuilderWithoutAuth(harness)
			.post('/auth/register')
			.body({...registrationBody('bogus'), invite_code: 'naoexiste'})
			.expect(403, APIErrorCodes.REGISTRATION_CLOSED)
			.execute();
	});

	it('an invite does not skip manual approval when the instance requires it', async () => {
		await getInstanceConfigRepository().setRegistrationConfig({mode: 'approval'});
		await seedGuildInvite('conviteaprova');
		const registration = await createBuilderWithoutAuth<PendingRegistrationResponse>(harness)
			.post('/auth/register')
			.body({...registrationBody('inviteapproval'), invite_code: 'conviteaprova'})
			.execute();
		expect(registration.registration_pending_approval).toBe(true);
	});

	it('returns pending approval and blocks login when registration requires approval', async () => {
		await getInstanceConfigRepository().setRegistrationConfig({mode: 'approval'});
		const body = registrationBody('approval');
		const registration = await createBuilderWithoutAuth<PendingRegistrationResponse>(harness)
			.post('/auth/register')
			.body(body)
			.execute();
		expect(registration.registration_pending_approval).toBe(true);
		expect(registration.user_id.length).toBeGreaterThan(0);
		await createBuilderWithoutAuth(harness)
			.post('/auth/login')
			.body({email: body.email, password: body.password})
			.expect(403, APIErrorCodes.REGISTRATION_PENDING_APPROVAL)
			.execute();
	});
});
