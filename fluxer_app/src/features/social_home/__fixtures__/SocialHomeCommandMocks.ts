// SPDX-License-Identifier: AGPL-3.0-or-later

import {HttpError} from '@app/features/platform/types/EndpointError';
import type {FakePost} from '@app/features/social_home/__fixtures__/SocialHomeTestFixtures';
import {APIErrorCodes} from '@fluxer/constants/src/ApiErrorCodes';
import type {Mock} from 'vitest';

/**
 * `SocialHomeCommands.ts`/`SocialHomeStoriesCommands.ts` call `searchMessages`
 * (`@app/features/search/utils/SearchUtils`) and `fetchFeedByChannel`/`fetchStoriesByChannel`
 * (the `SocialHomeFeedFallback`/`SocialHomeStoriesFallback` utils) — both modules are mocked
 * wholesale in each test file (same reasoning as `Channels`/`Permission` in
 * `SocialHomeStateFixtures.ts`: real `searchMessages` converts wire JSON into a real `Message`,
 * which needs `RuntimeConfig`). These helpers configure the resulting `vi.fn()` mocks; `HttpError`
 * itself is a plain leaf class (no RuntimeConfig dependency), so the "search unavailable" case
 * throws a real one — `ResponseInspection.failureCode()`, which `SocialHomeCommands.ts` uses to
 * detect this case, does an `instanceof HttpError` check.
 */

export function mockSearchSuccess(searchMessagesMock: Mock, messages: ReadonlyArray<FakePost>): void {
	searchMessagesMock.mockResolvedValueOnce({messages, channels: [], total: messages.length, hitsPerPage: 25, page: 1});
}

export function mockSearchIndexing(searchMessagesMock: Mock): void {
	searchMessagesMock.mockResolvedValueOnce({indexing: true, message: 'ainda indexando'});
}

export function buildSearchUnavailableError(): HttpError {
	return new HttpError({
		method: 'POST',
		path: '/search/messages',
		status: 503,
		body: {code: APIErrorCodes.FEATURE_TEMPORARILY_DISABLED, message: 'search indisponivel no self-host'},
	});
}

export function mockSearchUnavailable(searchMessagesMock: Mock): void {
	searchMessagesMock.mockRejectedValueOnce(buildSearchUnavailableError());
}

export function mockFallbackMessages(
	fetchFeedByChannelMock: Mock,
	messages: ReadonlyArray<FakePost>,
	options: {hasMore?: boolean} = {},
): void {
	fetchFeedByChannelMock.mockResolvedValueOnce({messages, hasMore: options.hasMore ?? false});
}
