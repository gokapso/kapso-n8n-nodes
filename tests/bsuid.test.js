const assert = require('node:assert/strict');
const test = require('node:test');

const { resolveMessageRecipient } = require('../dist/nodes/Kapso/RecipientFunctions.js');
const { Kapso } = require('../dist/nodes/Kapso/Kapso.node.js');
const { PHONE_NUMBER_EVENTS } = require('../dist/nodes/KapsoTrigger/EventTypes.js');
const { normalizeWebhookOutput } = require('../dist/nodes/KapsoTrigger/KapsoTrigger.node.js');

async function executeKapsoNode(parameters) {
	let request;
	const context = {
		continueOnFail: () => false,
		getCredentials: async () => ({
			baseUrl: 'https://api.kapso.ai',
			graphVersion: 'v24.0',
		}),
		getInputData: () => [{ json: {} }],
		getNode: () => ({ name: 'Kapso' }),
		getNodeParameter: (name, _itemIndex, defaultValue) =>
			Object.hasOwn(parameters, name) ? parameters[name] : defaultValue,
		helpers: {
			httpRequestWithAuthentication: async (_credentialName, options) => {
				request = options;

				return { messages: [{ id: 'wamid.123' }] };
			},
		},
	};

	await new Kapso().execute.call(context);

	return request;
}

test('normalizes a phone-number recipient', () => {
	assert.deepEqual(resolveMessageRecipient('phoneNumber', '+1 (650) 555-1234', ''), {
		to: '16505551234',
	});
});

test('preserves a BSUID recipient verbatim', () => {
	const bsuid = 'US.13491208655302741918';

	assert.deepEqual(resolveMessageRecipient('businessScopedUserId', '', bsuid), {
		recipient: bsuid,
	});
});

test('accepts a parent BSUID', () => {
	const bsuid = 'US.ENT.11815799212886844830';

	assert.deepEqual(resolveMessageRecipient('businessScopedUserId', '', bsuid), {
		recipient: bsuid,
	});
});

test('sends phone number and BSUID together when requested', () => {
	assert.deepEqual(
		resolveMessageRecipient('both', '+1 650 555 1234', 'US.13491208655302741918'),
		{
			to: '16505551234',
			recipient: 'US.13491208655302741918',
		},
	);
});

test('sends a text message through the recipient field for BSUID mode', async () => {
	const request = await executeKapsoNode({
		resource: 'whatsAppMessage',
		operation: 'sendText',
		phoneNumberId: '1234567890',
		recipientMode: 'businessScopedUserId',
		businessScopedUserId: 'US.13491208655302741918',
		message: 'Hello',
		previewUrl: false,
		replyToMessageId: '',
	});

	assert.equal(request.body.recipient, 'US.13491208655302741918');
	assert.equal(request.body.to, undefined);
});

test('sends a template message through the recipient field for BSUID mode', async () => {
	const request = await executeKapsoNode({
		resource: 'whatsAppMessage',
		operation: 'sendTemplate',
		phoneNumberId: '1234567890',
		recipientMode: 'businessScopedUserId',
		businessScopedUserId: 'US.13491208655302741918',
		templateName: 'order_update',
		languageCode: 'en_US',
		componentsJson: '[]',
	});

	assert.equal(request.body.recipient, 'US.13491208655302741918');
	assert.equal(request.body.to, undefined);
});

test('keeps existing phone-number workflows on the to field', async () => {
	const request = await executeKapsoNode({
		resource: 'whatsAppMessage',
		operation: 'sendText',
		phoneNumberId: '1234567890',
		to: '+1 (650) 555-1234',
		message: 'Hello',
		previewUrl: false,
		replyToMessageId: '',
	});

	assert.equal(request.body.to, '16505551234');
	assert.equal(request.body.recipient, undefined);
});

test('does not normalize a BSUID as a phone number', () => {
	assert.throws(
		() => resolveMessageRecipient('phoneNumber', 'US.13491208655302741918', ''),
		/Use a BSUID recipient mode/,
	);
});

test('rejects an incomplete BSUID', () => {
	assert.throws(
		() => resolveMessageRecipient('businessScopedUserId', '', '13491208655302741918'),
		/country prefix and full identifier/,
	);
});

test('exposes the normalized contact identity changed event', () => {
	assert.ok(PHONE_NUMBER_EVENTS.includes('whatsapp.contact.identity_changed'));
});

test('preserves a BSUID-only inbound webhook payload', () => {
	const body = {
		message: {
			id: 'wamid.123',
			from_user_id: 'US.13491208655302741918',
			type: 'text',
		},
		conversation: {
			phone_number: null,
			business_scoped_user_id: 'US.13491208655302741918',
			username: '@testusername',
		},
	};

	const [output] = normalizeWebhookOutput(body, { event: 'whatsapp.message.received' });

	assert.equal(output.json.message.from, undefined);
	assert.equal(output.json.message.from_user_id, 'US.13491208655302741918');
	assert.equal(output.json.conversation.phone_number, null);
	assert.equal(
		output.json.conversation.business_scoped_user_id,
		'US.13491208655302741918',
	);
});
