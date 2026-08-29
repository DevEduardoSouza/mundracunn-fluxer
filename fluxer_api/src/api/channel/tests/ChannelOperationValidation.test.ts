// SPDX-License-Identifier: AGPL-3.0-or-later

import {ChannelTypes} from '@fluxer/constants/src/ChannelConstants';
import {beforeAll, beforeEach, describe, expect, it} from 'vitest';
import {createTestAccount} from '../../auth/tests/AuthTestUtils';
import {type ApiTestHarness, createApiTestHarness} from '../../test/ApiTestHarness';
import {HTTP_STATUS} from '../../test/TestConstants';
import {createBuilder} from '../../test/TestRequestBuilder';
import {createChannel, createGuild, deleteChannel, getChannel, updateChannel} from './ChannelTestUtils';

describe('Channel Operation Validation', () => {
	let harness: ApiTestHarness;
	beforeAll(async () => {
		harness = await createApiTestHarness();
	});
	beforeEach(async () => {
		await harness.reset();
	});
	it('should reject getting nonexistent channel', async () => {
		const account = await createTestAccount(harness);
		await createBuilder(harness, account.token)
			.get('/channels/999999999999999999')
			.expect(HTTP_STATUS.NOT_FOUND)
			.execute();
	});
	it('should reject updating nonexistent channel', async () => {
		const account = await createTestAccount(harness);
		await createBuilder(harness, account.token)
			.patch('/channels/999999999999999999')
			.body({name: 'new-name'})
			.expect(HTTP_STATUS.NOT_FOUND)
			.execute();
	});
	it('should reject deleting nonexistent channel', async () => {
		const account = await createTestAccount(harness);
		await createBuilder(harness, account.token)
			.delete('/channels/999999999999999999')
			.expect(HTTP_STATUS.NOT_FOUND)
			.execute();
	});
	it('should get channel successfully', async () => {
		const account = await createTestAccount(harness);
		const guild = await createGuild(harness, account.token, 'Channel Operation Guild');
		const channel = await getChannel(harness, account.token, guild.system_channel_id!);
		expect(channel.id).toBe(guild.system_channel_id);
	});
	it('should update channel name successfully', async () => {
		const account = await createTestAccount(harness);
		const guild = await createGuild(harness, account.token, 'Channel Operation Guild');
		const channelId = guild.system_channel_id!;
		const updated = await updateChannel(harness, account.token, channelId, {name: 'updated-name'});
		expect(updated.name).toBe('updated-name');
	});
	it('should update channel topic successfully', async () => {
		const account = await createTestAccount(harness);
		const guild = await createGuild(harness, account.token, 'Channel Operation Guild');
		const channelId = guild.system_channel_id!;
		const updated = await updateChannel(harness, account.token, channelId, {topic: 'New topic'});
		expect(updated.topic).toBe('New topic');
	});
	// MUNDRACUNN (feature forum): the category serializer must echo `topic` like text channels do.
	it('should return the topic of a category channel', async () => {
		const account = await createTestAccount(harness);
		const guild = await createGuild(harness, account.token, 'Channel Operation Guild');
		const category = await createChannel(harness, account.token, guild.id, 'forum', ChannelTypes.GUILD_CATEGORY);
		const updated = await updateChannel(harness, account.token, category.id, {topic: 'uma-postagem-por-aluno'});
		expect(updated.topic).toBe('uma-postagem-por-aluno');
		const fetched = await getChannel(harness, account.token, category.id);
		expect(fetched.topic).toBe('uma-postagem-por-aluno');
	});
	it('should delete channel successfully', async () => {
		const account = await createTestAccount(harness);
		const guild = await createGuild(harness, account.token, 'Channel Operation Guild');
		const newChannel = await createChannel(harness, account.token, guild.id, 'to-delete');
		await deleteChannel(harness, account.token, newChannel.id);
		await createBuilder(harness, account.token)
			.get(`/channels/${newChannel.id}`)
			.expect(HTTP_STATUS.NOT_FOUND)
			.execute();
	});
});
