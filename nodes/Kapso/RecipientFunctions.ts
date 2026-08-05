export type RecipientMode = 'phoneNumber' | 'businessScopedUserId' | 'both';

export interface MessageRecipientFields {
	to?: string;
	recipient?: string;
}

const BSUID_PATTERN = /^[A-Z]{2}\.(?:ENT\.)?[A-Za-z0-9]{1,128}$/i;

export function resolveMessageRecipient(
	mode: RecipientMode,
	phoneNumber: string,
	businessScopedUserId: string,
): MessageRecipientFields {
	const fields: MessageRecipientFields = {};

	if (mode === 'phoneNumber' || mode === 'both') {
		fields.to = normalizePhoneNumber(phoneNumber);
	}

	if (mode === 'businessScopedUserId' || mode === 'both') {
		fields.recipient = validateBusinessScopedUserId(businessScopedUserId);
	}

	return fields;
}

function normalizePhoneNumber(value: string): string {
	const trimmed = value.trim();

	if (BSUID_PATTERN.test(trimmed) || /[A-Za-z.]/.test(trimmed)) {
		throw new Error(
			'Recipient Phone Number must be a phone number. Use a BSUID recipient mode for business-scoped user IDs.',
		);
	}

	const normalized = trimmed.replace(/[^\d]/g, '');

	if (!normalized) {
		throw new Error('Recipient Phone Number is required');
	}

	return normalized;
}

function validateBusinessScopedUserId(value: string): string {
	const trimmed = value.trim();

	if (!BSUID_PATTERN.test(trimmed)) {
		throw new Error(
			'Recipient BSUID must include its country prefix and full identifier, for example US.13491208655302741918 or US.ENT.11815799212886844830',
		);
	}

	return trimmed;
}
