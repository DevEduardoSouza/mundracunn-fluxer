// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * Two things are under test: the create orchestration in `ForumPostCommands.createForumPost` (the
 * channel is created with the right overwrites, then the topic is patched, then the first message is
 * sent — in that order) and the modal's own behaviour (channel-name preview, blocking an empty
 * title). `ChannelCommands` / `MessageCommands` / navigation are the mocked boundaries; the modal's
 * form primitives are stubbed the same way — each needs RuntimeConfig for real.
 */
vi.mock('@app/features/channel/commands/ChannelCommands', () => ({
	create: vi.fn(async () => ({id: 'chan-new', type: 0})),
	update: vi.fn(async () => ({})),
}));
vi.mock('@app/features/messaging/commands/MessageCommands', () => ({
	reserveSend: vi.fn(() => true),
	send: vi.fn(async () => null),
}));
vi.mock('@app/features/navigation/commands/NavigationCommands', () => ({selectChannel: vi.fn()}));
vi.mock('@app/features/platform/transport/RestTransport', () => ({http: {get: vi.fn(async () => ({body: []}))}}));
vi.mock('@app/features/messaging/models/MessagingMessage', () => ({Message: class {}}));
vi.mock('@app/features/forum/utils/ForumChannelDiscovery', () => ({
	getStudentRole: vi.fn(() => undefined),
	getGuidelinesChannel: vi.fn(() => undefined),
	canEditGuidelines: vi.fn(() => false),
}));
vi.mock('@app/features/user/state/Users', () => ({default: {currentUserId: 'user-a'}}));
vi.mock('@app/features/messaging/components/markdown', () => ({
	SafeMarkdown: ({content}: {content: string}) => <div data-testid="stub-markdown">{content}</div>,
}));
vi.mock('@app/features/ui/commands/ModalCommands', () => ({pop: vi.fn(), push: vi.fn(), modal: (fn: unknown) => fn}));
vi.mock('@app/features/app/components/dialogs/Modal', () => ({
	Root: ({children}: {children?: React.ReactNode}) => <div>{children}</div>,
	Header: ({title}: {title?: React.ReactNode}) => <div>{title}</div>,
	Content: ({children}: {children?: React.ReactNode}) => <div>{children}</div>,
	Footer: ({children}: {children?: React.ReactNode}) => <div>{children}</div>,
}));
vi.mock('@app/features/ui/components/form/FormInput', () => ({
	Input: ({value, onChange, label, error}: {value?: string; onChange?: React.ChangeEventHandler; label?: React.ReactNode; error?: string}) => (
		<label>
			{label}
			<input data-testid="title" value={value} onChange={onChange} />
			{error ? <span data-testid="title-error">{error}</span> : null}
		</label>
	),
	Textarea: ({value, onChange, label}: {value?: string; onChange?: React.ChangeEventHandler; label?: React.ReactNode}) => (
		<label>
			{label}
			<textarea data-testid="description" value={value} onChange={onChange} />
		</label>
	),
}));
vi.mock('@app/features/ui/button/Button', () => ({
	Button: ({children, onClick, type}: {children?: React.ReactNode; onClick?: () => void; type?: 'button' | 'submit'}) => (
		<button type={type === 'submit' ? 'submit' : 'button'} onClick={onClick} data-testid={type === 'submit' ? 'submit' : 'cancel'}>
			{children}
		</button>
	),
}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
vi.mock('@lingui/react/macro', () => ({
	useLingui: () => ({
		i18n: {
			_: (descriptor: {message?: string} | string, values?: Record<string, string>) => {
				const template = typeof descriptor === 'string' ? descriptor : (descriptor.message ?? '');
				return values ? template.replace(/\{(\w+)\}/g, (_m, key) => values[key] ?? '') : template;
			},
		},
	}),
}));

import type React from 'react';

const ChannelCommands = await import('@app/features/channel/commands/ChannelCommands');
const MessageCommands = await import('@app/features/messaging/commands/MessageCommands');
const NavigationCommands = await import('@app/features/navigation/commands/NavigationCommands');
const ModalCommands = await import('@app/features/ui/commands/ModalCommands');
const ForumChannelDiscovery = await import('@app/features/forum/utils/ForumChannelDiscovery');
const ForumPostCommands = await import('@app/features/forum/commands/ForumPostCommands');
const {ForumCreatePostModal} = await import('@app/features/forum/components/ForumCreatePostModal');
const {Permissions} = await import('@fluxer/constants/src/ChannelConstants');

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const createMock = ChannelCommands.create as unknown as Mock;
const updateMock = ChannelCommands.update as unknown as Mock;
const sendMock = MessageCommands.send as unknown as Mock;
const reserveSendMock = MessageCommands.reserveSend as unknown as Mock;

let roots: Array<{container: HTMLDivElement; root: Root}> = [];

async function mount(): Promise<HTMLElement> {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<ForumCreatePostModal guildId="guild-a" categoryId="cat-forum" />);
	});
	roots.push({container, root});
	return container;
}

function typeInto(input: HTMLInputElement | HTMLTextAreaElement, value: string): void {
	const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
	Object.getOwnPropertyDescriptor(proto, 'value')?.set?.call(input, value);
	input.dispatchEvent(new Event('input', {bubbles: true}));
}

beforeEach(() => {
	createMock.mockResolvedValue({id: 'chan-new', type: 0});
	updateMock.mockResolvedValue({});
	sendMock.mockResolvedValue(null);
	reserveSendMock.mockReturnValue(true);
});

afterEach(() => {
	for (const {container, root} of roots) {
		act(() => root.unmount());
		container.remove();
	}
	roots = [];
	vi.clearAllMocks();
});

describe('ForumPostCommands.createForumPost — order of calls', () => {
	it('creates the channel, then patches the topic, then sends the first message', async () => {
		const calls: Array<string> = [];
		createMock.mockImplementation(async () => {
			calls.push('create');
			return {id: 'chan-new', type: 0};
		});
		updateMock.mockImplementation(async () => {
			calls.push('update');
			return {};
		});
		sendMock.mockImplementation(async () => {
			calls.push('send');
			return null;
		});

		await ForumPostCommands.createForumPost({
			guildId: 'guild-a',
			categoryId: 'cat-forum',
			authorId: 'user-a',
			title: 'Meu Estudo',
			description: 'primeira mensagem',
			tags: ['pintura'],
		});

		expect(calls).toEqual(['create', 'update', 'send']);
		expect(createMock.mock.calls[0][1]).toMatchObject({
			name: 'meu-estudo',
			parent_id: 'cat-forum',
			permission_overwrites: [{id: 'user-a', type: 1}],
		});
		expect(updateMock.mock.calls[0][1]).toEqual({topic: 'Meu Estudo\n#pintura'});
		expect(sendMock.mock.calls[0][1]).toMatchObject({content: 'primeira mensagem'});
		expect(NavigationCommands.selectChannel).toHaveBeenCalledWith('guild-a', 'chan-new');
	});

	it('denies MANAGE_CHANNELS|MANAGE_ROLES to the student role so only the author can edit the post', async () => {
		(ForumChannelDiscovery.getStudentRole as unknown as Mock).mockReturnValueOnce({id: 'role-aluno', name: 'Aluno'});

		await ForumPostCommands.createForumPost({
			guildId: 'guild-a',
			categoryId: 'cat-forum',
			authorId: 'user-a',
			title: 'Estudo',
			description: 'oi',
			tags: [],
		});

		const overwrites = createMock.mock.calls[0][1].permission_overwrites as Array<{
			id: string;
			type: number;
			allow: string;
			deny: string;
		}>;
		expect(overwrites).toContainEqual({
			id: 'user-a',
			type: 1,
			allow: Permissions.MANAGE_CHANNELS.toString(),
			deny: '0',
		});
		expect(overwrites).toContainEqual({
			id: 'role-aluno',
			type: 0,
			allow: '0',
			deny: (Permissions.MANAGE_CHANNELS | Permissions.MANAGE_ROLES).toString(),
		});
	});

	it('falls back to the title as the first message when there is no description', async () => {
		await ForumPostCommands.createForumPost({
			guildId: 'guild-a',
			categoryId: 'cat-forum',
			authorId: 'user-a',
			title: 'Só título',
			description: '   ',
			tags: [],
		});
		expect(sendMock.mock.calls[0][1]).toMatchObject({content: 'Só título'});
	});
});

describe('ForumCreatePostModal', () => {
	it('shows the channel-name preview for the typed title', async () => {
		const container = await mount();
		await act(async () => {
			typeInto(container.querySelector('[data-testid="title"]') as HTMLInputElement, 'Minha Arte!');
		});
		expect(container.textContent).toContain('Channel: #minha-arte');
	});

	it('blocks submit and shows an error when the title is empty', async () => {
		const container = await mount();
		await act(async () => {
			container.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
		});
		expect(createMock).not.toHaveBeenCalled();
		expect(container.querySelector('[data-testid="title-error"]')).not.toBeNull();
	});

	it('creates the post and closes the modal on a valid submit', async () => {
		const container = await mount();
		await act(async () => {
			typeInto(container.querySelector('[data-testid="title"]') as HTMLInputElement, 'Pauta da Semana');
		});
		await act(async () => {
			typeInto(container.querySelector('[data-testid="description"]') as HTMLTextAreaElement, 'vamos falar de cor');
		});
		await act(async () => {
			container.querySelector('form')!.dispatchEvent(new Event('submit', {bubbles: true, cancelable: true}));
		});
		expect(createMock).toHaveBeenCalledTimes(1);
		expect(updateMock.mock.calls[0][1]).toEqual({topic: 'Pauta da Semana'});
		expect(ModalCommands.pop).toHaveBeenCalled();
	});
});
