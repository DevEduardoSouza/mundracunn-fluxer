// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelTypes, Permissions} from '@fluxer/constants/src/ChannelConstants';
import type {ChannelResponse} from '@fluxer/schema/src/domains/channel/ChannelSchemas';
import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {type ApiTestHarness, createApiTestHarness} from '../../test/ApiTestHarness';
import {HTTP_STATUS} from '../../test/TestConstants';
import {createBuilder} from '../../test/TestRequestBuilder';
import {
	addMemberRole,
	createChannel,
	createPermissionOverwrite,
	createRole,
	getChannel,
	setupTestGuildWithMembers,
} from './ChannelTestUtils';

/**
 * Creating a channel inside a category must honour MANAGE_CHANNELS / MANAGE_ROLES
 * overwrites set on that category (Discord semantics), instead of only checking
 * the guild-level permission.
 */
describe('Category-scoped channel creation', () => {
	let harness: ApiTestHarness;
	beforeAll(async () => {
		harness = await createApiTestHarness();
	});
	beforeEach(async () => {
		await harness.reset();
	});

	async function setupCategoryWithRole(allow: bigint) {
		const {owner, members, guild} = await setupTestGuildWithMembers(harness, 2);
		const [student, otherStudent] = members;
		const role = await createRole(harness, owner.token, guild.id, {name: 'Aluno'});
		await addMemberRole(harness, owner.token, guild.id, student.userId, role.id);
		await addMemberRole(harness, owner.token, guild.id, otherStudent.userId, role.id);
		const category = await createChannel(harness, owner.token, guild.id, 'forum', ChannelTypes.GUILD_CATEGORY);
		await createPermissionOverwrite(harness, owner.token, category.id, role.id, {
			type: 0,
			allow: allow.toString(),
			deny: '0',
		});
		const otherCategory = await createChannel(harness, owner.token, guild.id, 'staff', ChannelTypes.GUILD_CATEGORY);
		return {owner, student, otherStudent, guild, role, category, otherCategory};
	}

	it('allows a member with MANAGE_CHANNELS on the category to create a channel inside it', async () => {
		const {student, guild, category} = await setupCategoryWithRole(Permissions.MANAGE_CHANNELS);
		const channel = await createBuilder<ChannelResponse>(harness, student.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({name: 'meu-sketchbook', type: ChannelTypes.GUILD_TEXT, parent_id: category.id})
			.expect(HTTP_STATUS.OK)
			.execute();
		expect(channel.parent_id).toBe(category.id);
		expect(channel.name).toBe('meu-sketchbook');
	});

	it('rejects creating a channel outside the category for a member with category-only permission', async () => {
		const {student, guild, otherCategory} = await setupCategoryWithRole(Permissions.MANAGE_CHANNELS);
		await createBuilder(harness, student.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({name: 'fora', type: ChannelTypes.GUILD_TEXT, parent_id: otherCategory.id})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
		await createBuilder(harness, student.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({name: 'raiz', type: ChannelTypes.GUILD_TEXT})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	it('rejects a member without any MANAGE_CHANNELS overwrite', async () => {
		const {owner, members, guild} = await setupTestGuildWithMembers(harness, 1);
		const category = await createChannel(harness, owner.token, guild.id, 'forum', ChannelTypes.GUILD_CATEGORY);
		await createBuilder(harness, members[0].token)
			.post(`/guilds/${guild.id}/channels`)
			.body({name: 'nope', type: ChannelTypes.GUILD_TEXT, parent_id: category.id})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	it('still lets the owner create channels anywhere', async () => {
		const {owner, guild, category, otherCategory} = await setupCategoryWithRole(Permissions.MANAGE_CHANNELS);
		for (const parent of [category.id, otherCategory.id, undefined]) {
			await createBuilder<ChannelResponse>(harness, owner.token)
				.post(`/guilds/${guild.id}/channels`)
				.body({name: 'owner-channel', type: ChannelTypes.GUILD_TEXT, parent_id: parent})
				.expect(HTTP_STATUS.OK)
				.execute();
		}
	});

	it('accepts permission overwrites on creation when MANAGE_ROLES is granted on the category', async () => {
		const {student, otherStudent, guild, role, category} = await setupCategoryWithRole(
			Permissions.MANAGE_CHANNELS | Permissions.MANAGE_ROLES,
		);
		const channel = await createBuilder<ChannelResponse>(harness, student.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({
				name: 'postagem-do-aluno',
				type: ChannelTypes.GUILD_TEXT,
				parent_id: category.id,
				permission_overwrites: [
					{id: student.userId, type: 1, allow: Permissions.MANAGE_CHANNELS.toString(), deny: '0'},
					{id: role.id, type: 0, allow: '0', deny: Permissions.MANAGE_CHANNELS.toString()},
				],
			})
			.expect(HTTP_STATUS.OK)
			.execute();
		const created = await getChannel(harness, student.token, channel.id);
		expect(created.permission_overwrites?.some((o) => o.id === student.userId)).toBe(true);

		// The author can rename their own post...
		await createBuilder(harness, student.token)
			.patch(`/channels/${channel.id}`)
			.body({name: 'postagem-renomeada'})
			.expect(HTTP_STATUS.OK)
			.execute();
		// ...but another student with the same role cannot.
		await createBuilder(harness, otherStudent.token)
			.patch(`/channels/${channel.id}`)
			.body({name: 'hacked'})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	it('rejects permission overwrites on creation without MANAGE_ROLES on the category', async () => {
		const {student, guild, category} = await setupCategoryWithRole(Permissions.MANAGE_CHANNELS);
		await createBuilder(harness, student.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({
				name: 'postagem',
				type: ChannelTypes.GUILD_TEXT,
				parent_id: category.id,
				permission_overwrites: [{id: student.userId, type: 1, allow: Permissions.MANAGE_CHANNELS.toString(), deny: '0'}],
			})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});

	it('rejects overwrites that grant permissions the creator does not have in the category', async () => {
		const {student, guild, category} = await setupCategoryWithRole(
			Permissions.MANAGE_CHANNELS | Permissions.MANAGE_ROLES,
		);
		await createBuilder(harness, student.token)
			.post(`/guilds/${guild.id}/channels`)
			.body({
				name: 'escalada',
				type: ChannelTypes.GUILD_TEXT,
				parent_id: category.id,
				permission_overwrites: [{id: student.userId, type: 1, allow: Permissions.ADMINISTRATOR.toString(), deny: '0'}],
			})
			.expect(HTTP_STATUS.FORBIDDEN)
			.execute();
	});
});
