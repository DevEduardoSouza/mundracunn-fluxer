// @vitest-environment happy-dom
// SPDX-License-Identifier: AGPL-3.0-or-later

/**
 * The banner has no data of its own: it renders the first message of the class's `diretrizes`
 * channel, and remembers per user that the reader dismissed it. Both ends are faked here — the
 * markdown renderer (its import chain reaches RuntimeConfig) and AppStorage, so the "já li" memory
 * can be inspected directly.
 *
 * DOM mounting follows the codebase's existing pattern: the happy-dom environment pragma + raw
 * `react-dom/client` + `act()`, no testing-library. (The pragma is deliberately not spelled out in
 * prose: knip scans comments and misreads a quoted mention as an environment package.)
 */
const storage = new Map<string, string>();

vi.mock('@app/features/messaging/components/markdown', () => ({
	SafeMarkdown: ({content}: {content: string}) => <div data-testid="markdown">{content}</div>,
}));
vi.mock('@app/features/messaging/models/MessagingMessage', () => ({Message: class {}}));
vi.mock('@app/features/forum/utils/ForumChannelDiscovery', () => ({
	getGuidelinesChannel: vi.fn(),
	canEditGuidelines: vi.fn(),
}));
vi.mock('@app/features/navigation/commands/NavigationCommands', () => ({selectChannel: vi.fn()}));
vi.mock('@app/features/forum/commands/ForumPostCommands', () => ({fetchGuidelinesMessage: vi.fn()}));
vi.mock('@app/features/user/state/Users', () => ({default: {currentUserId: 'user-1'}}));
vi.mock('@app/features/platform/state/PersistentStorage', () => ({
	default: {
		getItem: vi.fn((key: string) => storage.get(key) ?? null),
		setItem: vi.fn((key: string, value: string) => {
			storage.set(key, value);
		}),
	},
}));
vi.mock('@lingui/core/macro', () => ({msg: (descriptor: unknown) => descriptor}));
vi.mock('@lingui/react/macro', () => {
	const fakeI18n = {
		_: (descriptor: {message?: string} | string) =>
			typeof descriptor === 'string' ? descriptor : (descriptor.message ?? ''),
	};
	return {useLingui: () => ({i18n: fakeI18n})};
});

const {getGuidelinesChannel, canEditGuidelines} = await import('@app/features/forum/utils/ForumChannelDiscovery');
const NavigationCommands = await import('@app/features/navigation/commands/NavigationCommands');
const ForumPostCommands = await import('@app/features/forum/commands/ForumPostCommands');
const {ForumGuidelinesBanner} = await import('@app/features/forum/components/ForumGuidelinesBanner');

import {act} from 'react';
import {createRoot, type Root} from 'react-dom/client';
import {afterEach, beforeEach, describe, expect, it, type Mock, vi} from 'vitest';

(globalThis as {IS_REACT_ACT_ENVIRONMENT?: boolean}).IS_REACT_ACT_ENVIRONMENT = true;

const getGuidelinesChannelMock = getGuidelinesChannel as unknown as Mock;
const canEditGuidelinesMock = canEditGuidelines as unknown as Mock;
const selectChannelMock = NavigationCommands.selectChannel as unknown as Mock;
const fetchGuidelinesMessageMock = ForumPostCommands.fetchGuidelinesMessage as unknown as Mock;
const EDIT_SELECTOR = '[data-flx="forum.forum-guidelines-banner.edit"]';

const DISMISSED_KEY = 'Forum:guidelinesRead:user-1:channel-diretrizes';

let roots: Array<{container: HTMLDivElement; root: Root}> = [];

async function mount(variant?: 'page' | 'modal'): Promise<HTMLDivElement> {
	const container = document.createElement('div');
	document.body.append(container);
	const root = createRoot(container);
	await act(async () => {
		root.render(<ForumGuidelinesBanner guildId="guild-a" variant={variant} />);
	});
	roots.push({container, root});
	return container;
}

async function click(element: Element): Promise<void> {
	await act(async () => {
		element.dispatchEvent(new MouseEvent('click', {bubbles: true}));
	});
}

beforeEach(() => {
	storage.clear();
	getGuidelinesChannelMock.mockReturnValue({id: 'channel-diretrizes'});
	canEditGuidelinesMock.mockReturnValue(false);
	fetchGuidelinesMessageMock.mockResolvedValue({content: 'Uma postagem de sketchbook por pessoa.'});
});

afterEach(() => {
	for (const {container, root} of roots) {
		act(() => root.unmount());
		container.remove();
	}
	roots = [];
	vi.clearAllMocks();
});

describe('when there is nothing to show', () => {
	it('renders nothing for a class without a guidelines channel', async () => {
		getGuidelinesChannelMock.mockReturnValue(undefined);
		const container = await mount();
		expect(container.textContent).toBe('');
		expect(fetchGuidelinesMessageMock).not.toHaveBeenCalled();
	});

	it('renders nothing when the channel is empty', async () => {
		fetchGuidelinesMessageMock.mockResolvedValue(null);
		expect((await mount()).textContent).toBe('');
	});

	it('renders nothing, instead of an error, when the fetch fails', async () => {
		fetchGuidelinesMessageMock.mockRejectedValue(new Error('offline'));
		expect((await mount()).textContent).toBe('');
	});
});

describe('on the forum page', () => {
	it('shows the rules message expanded on a first visit', async () => {
		const container = await mount();
		expect(container.querySelector('[data-testid="markdown"]')!.textContent).toBe(
			'Uma postagem de sketchbook por pessoa.',
		);
		expect(
			container.querySelector('[data-flx="forum.forum-guidelines-banner.toggle"]')!.getAttribute('aria-expanded'),
		).toBe('true');
	});

	it('collapses and expands again from the header', async () => {
		const container = await mount();
		const toggle = container.querySelector('[data-flx="forum.forum-guidelines-banner.toggle"]')!;

		await click(toggle);
		expect(container.querySelector('[data-testid="markdown"]')).toBeNull();
		expect(toggle.getAttribute('aria-expanded')).toBe('false');

		await click(toggle);
		expect(container.querySelector('[data-testid="markdown"]')).not.toBeNull();
	});

	it('remembers "já li" for the next visit, per user and channel', async () => {
		const container = await mount();
		await click(container.querySelector('[data-flx="forum.forum-guidelines-banner.dismiss"]')!);
		expect(storage.get(DISMISSED_KEY)).toBe('1');

		const second = await mount();
		expect(second.querySelector('[data-testid="markdown"]')).toBeNull();
		// Still reachable — dismissing collapses the panel, it doesn't remove it.
		expect(second.querySelector('[data-flx="forum.forum-guidelines-banner.toggle"]')).not.toBeNull();
	});

	it('offers "já li" only while the panel is open', async () => {
		const container = await mount();
		expect(container.querySelector('[data-flx="forum.forum-guidelines-banner.dismiss"]')).not.toBeNull();
		await click(container.querySelector('[data-flx="forum.forum-guidelines-banner.toggle"]')!);
		expect(container.querySelector('[data-flx="forum.forum-guidelines-banner.dismiss"]')).toBeNull();
	});
});

/**
 * The forum category — guidelines channel included — is hidden from the sidebar, so this button is
 * the only way anyone reaches the message that stores the rules.
 */
describe('editing the rules', () => {
	it('hides the button from a reader who cannot write in the guidelines channel', async () => {
		expect((await mount()).querySelector(EDIT_SELECTOR)).toBeNull();
	});

	it('opens the guidelines channel for staff', async () => {
		canEditGuidelinesMock.mockReturnValue(true);
		const container = await mount();
		await click(container.querySelector(EDIT_SELECTOR)!);
		expect(selectChannelMock).toHaveBeenCalledWith('guild-a', 'channel-diretrizes');
	});

	it('stays reachable after the panel is collapsed', async () => {
		canEditGuidelinesMock.mockReturnValue(true);
		const container = await mount();
		await click(container.querySelector('[data-flx="forum.forum-guidelines-banner.toggle"]')!);
		expect(container.querySelector('[data-testid="markdown"]')).toBeNull();
		expect(container.querySelector(EDIT_SELECTOR)).not.toBeNull();
	});

	it('is not offered inside the new-post modal', async () => {
		canEditGuidelinesMock.mockReturnValue(true);
		expect((await mount('modal')).querySelector(EDIT_SELECTOR)).toBeNull();
	});
});

describe('inside the new-post modal', () => {
	it('always shows the rules, even for a reader who dismissed them on the page', async () => {
		storage.set(DISMISSED_KEY, '1');
		const container = await mount('modal');
		expect(container.querySelector('[data-testid="markdown"]')!.textContent).toBe(
			'Uma postagem de sketchbook por pessoa.',
		);
	});

	it('has no dismiss button and no collapse toggle', async () => {
		const container = await mount('modal');
		expect(container.querySelector('[data-flx="forum.forum-guidelines-banner.dismiss"]')).toBeNull();
		expect(container.querySelector('[data-flx="forum.forum-guidelines-banner.toggle"]')).toBeNull();
	});
});
