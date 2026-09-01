// SPDX-License-Identifier: AGPL-3.0-or-later

import {getEmailTemplate} from '@pkgs/email/src/email_i18n/EmailI18n';
import {describe, expect, test} from 'vitest';

// The fork serves a Brazilian course, so an email with no resolved locale has to land in
// Portuguese. Upstream defaults to en-US and a rebase would silently restore that, which is
// exactly the bug the client reported ("o e-mail chega em ingles"), so pin it here.
describe('MUNDRACUNN email defaults', () => {
	const variables = {
		username: 'Max',
		code: '482913',
		expiresAt: new Date('2026-09-02T15:30:00Z'),
		product_name: 'MUNDRACUNN',
	};

	test('falls back to pt-BR when the request carries no locale', () => {
		const result = getEmailTemplate('email_change_new', null, variables as never);
		expect(result.ok).toBe(true);
		if (!result.ok) return;
		expect(result.value.body).toContain('Insira este código no aplicativo');
	});

	test('verification emails talk about the account, not about a new email address', () => {
		for (const key of ['email_change_new', 'email_verification'] as const) {
			const result = getEmailTemplate(key, 'pt-BR', {
				...variables,
				verifyUrl: 'https://comunidademundracunn.com/verify#token=abc',
			} as never);
			expect(result.ok).toBe(true);
			if (!result.ok) continue;
			expect(result.value.subject).toBe('Verifique sua conta da Área de Membros MUNDRACUNN');
			expect(result.value.body).toContain('conta da Área de Membros MUNDRACUNN');
			expect(result.value.body).toContain('– Equipe MUNDRACUNN');
			expect(result.value.body).not.toContain('novo e-mail');
		}
	});
});
