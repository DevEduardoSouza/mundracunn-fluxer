// SPDX-License-Identifier: AGPL-3.0-or-later

export interface EmailConfig {
	enabled: boolean;
	fromEmail: string;
	fromName: string;
	appBaseUrl: string;
	marketingBaseUrl: string;
	/**
	 * Brand shown inside the message itself — subject lines and the signature. Every template
	 * already interpolates `{product_name}`, but nothing ever fed it, so a rebranded self-host still
	 * sent "Verify your new Fluxer email" over a correctly branded `fromName`. Optional so an
	 * embedder that does not care keeps the packaged default.
	 */
	productName?: string;
	/** Address the ban/deletion templates point appeals at. */
	appealsEmail?: string;
	/** Address the report-resolution template points safety questions at. */
	safetyEmail?: string;
}

export interface EmailMessage {
	to: string;
	from: {
		email: string;
		name: string;
	};
	subject: string;
	text: string;
}

export interface IEmailProvider {
	sendEmail(message: EmailMessage): Promise<boolean>;
}

export interface UserBouncedEmailChecker {
	isEmailBounced(email: string): Promise<boolean>;
}
