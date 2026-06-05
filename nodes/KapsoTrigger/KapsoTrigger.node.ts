import { createHmac, timingSafeEqual } from 'crypto';

import type {
	IDataObject,
	IHookFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
	IWebhookFunctions,
	IWebhookResponseData,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	extractCollection,
	getKapsoErrorDescription,
	getKapsoErrorHttpCode,
	getKapsoErrorMessage,
	kapsoPlatformRequest,
} from '../Kapso/GenericFunctions';

const PHONE_NUMBER_EVENTS = [
	'whatsapp.message.received',
	'whatsapp.message.sent',
	'whatsapp.message.delivered',
	'whatsapp.message.read',
	'whatsapp.message.failed',
	'whatsapp.conversation.created',
	'whatsapp.conversation.ended',
	'whatsapp.conversation.inactive',
];

const PROJECT_EVENTS = [
	'whatsapp.config.created',
	'whatsapp.phone_number.created',
	'whatsapp.phone_number.deleted',
	'workflow.execution.handoff',
	'workflow.execution.failed',
];

export class KapsoTrigger implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Kapso Trigger',
		name: 'kapsoTrigger',
		icon: { light: 'file:kapso-logo.svg', dark: 'file:kapso-logo.dark.svg' },
		group: ['trigger'],
		version: 1,
		subtitle: '={{$parameter["scope"]}}',
		description: 'Starts the workflow when Kapso receives WhatsApp events',
		defaults: {
			name: 'Kapso Trigger',
		},
		inputs: [],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'kapsoApi',
				required: true,
			},
		],
		webhooks: [
			{
				name: 'default',
				httpMethod: 'POST',
				responseMode: 'onReceived',
				path: 'webhook',
			},
		],
		properties: [
			{
				displayName: 'Scope',
				name: 'scope',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Phone Number',
						value: 'config',
						description: 'Receive WhatsApp message and conversation events for one phone number',
					},
					{
						name: 'Project',
						value: 'project',
						description: 'Receive project lifecycle and workflow events',
					},
				],
				default: 'config',
			},
			{
				displayName: 'Phone Number ID',
				name: 'phoneNumberId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						scope: ['config'],
					},
				},
				description: 'Meta phone_number_id whose WhatsApp events should trigger the workflow',
			},
			{
				displayName: 'Events',
				name: 'phoneNumberEvents',
				type: 'multiOptions',
				required: true,
				displayOptions: {
					show: {
						scope: ['config'],
					},
				},
				options: PHONE_NUMBER_EVENTS.map((event) => ({
					name: event,
					value: event,
				})),
				default: ['whatsapp.message.received'],
				description: 'Phone-number events to subscribe to',
			},
			{
				displayName: 'Events',
				name: 'projectEvents',
				type: 'multiOptions',
				required: true,
				displayOptions: {
					show: {
						scope: ['project'],
					},
				},
				options: PROJECT_EVENTS.map((event) => ({
					name: event,
					value: event,
				})),
				default: ['whatsapp.phone_number.created'],
				description: 'Project events to subscribe to',
			},
			{
				displayName: 'Webhook Kind',
				name: 'kind',
				type: 'options',
				default: 'kapso',
				options: [
					{
						name: 'Kapso',
						value: 'kapso',
						description: 'Filtered Kapso event payloads with optional buffering',
					},
					{
						name: 'Meta',
						value: 'meta',
						description: 'Raw Meta webhook forwarding for a phone number',
					},
				],
				description: 'Type of webhook Kapso should send to this node',
			},
			{
				displayName: 'Registration Mode',
				name: 'registrationMode',
				type: 'options',
				default: 'automatic',
				options: [
					{
						name: 'Automatic',
						value: 'automatic',
						description: 'Let this node create and delete the Kapso webhook',
					},
					{
						name: 'Manual',
						value: 'manual',
						description: 'Skip Kapso API registration because the webhook was created manually',
					},
				],
				description: 'Whether n8n should register the webhook in Kapso or only listen locally',
			},
			{
				displayName: 'Payload Version',
				name: 'payloadVersion',
				type: 'options',
				default: 'v2',
				displayOptions: {
					show: {
						kind: ['kapso'],
					},
				},
				options: [
					{
						name: 'V1',
						value: 'v1',
					},
					{
						name: 'V2',
						value: 'v2',
					},
				],
				description: 'Kapso payload version to deliver',
			},
			{
				displayName: 'Buffer Received Messages',
				name: 'bufferEnabled',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						kind: ['kapso'],
						scope: ['config'],
					},
				},
				description: 'Whether to batch rapid whatsapp.message.received events before delivery',
			},
			{
				displayName: 'Buffer Window Seconds',
				name: 'bufferWindowSeconds',
				type: 'number',
				default: 5,
				typeOptions: {
					minValue: 1,
					maxValue: 60,
				},
				displayOptions: {
					show: {
						bufferEnabled: [true],
						kind: ['kapso'],
						scope: ['config'],
					},
				},
				description: 'Seconds to wait for more inbound messages before sending a batch',
			},
			{
				displayName: 'Max Buffer Size',
				name: 'maxBufferSize',
				type: 'number',
				default: 10,
				typeOptions: {
					minValue: 1,
					maxValue: 100,
				},
				displayOptions: {
					show: {
						bufferEnabled: [true],
						kind: ['kapso'],
						scope: ['config'],
					},
				},
				description: 'Maximum number of inbound messages to collect in one batch',
			},
			{
				displayName: 'Verify Signature',
				name: 'verifySignature',
				type: 'boolean',
				default: true,
				description: 'Whether to validate X-Webhook-Signature with the Kapso webhook secret',
			},
			{
				displayName: 'Webhook Secret',
				name: 'webhookSecret',
				type: 'string',
				typeOptions: {
					password: true,
				},
				default: '',
				description:
					'Optional Kapso webhook secret. If omitted, the node uses the secret returned by Kapso when it creates the webhook, when available.',
			},
		],
	};

	webhookMethods = {
		default: {
			async checkExists(this: IHookFunctions): Promise<boolean> {
				if (usesManualRegistration(this)) {
					assertPublicWebhookUrl(this, this.getNodeWebhookUrl('default') as string);

					return true;
				}

				let existingWebhook: IDataObject | undefined;

				try {
					existingWebhook = await findExistingWebhook.call(this);
				} catch (error) {
					throw toKapsoNodeApiError(this, error);
				}

				if (!existingWebhook) {
					return false;
				}

				saveWebhookStaticData.call(this, existingWebhook);

				return true;
			},
			async create(this: IHookFunctions): Promise<boolean> {
				const webhookUrl = this.getNodeWebhookUrl('default') as string;
				assertPublicWebhookUrl(this, webhookUrl);

				if (usesManualRegistration(this)) {
					return true;
				}

				const scope = this.getNodeParameter('scope') as string;
				const payload = buildWebhookPayload(this, webhookUrl);
				const path = getWebhookCollectionPath(this, scope);
				let response: IDataObject;

				try {
					response = (await kapsoPlatformRequest.call(this, {
						method: 'POST',
						path,
						body: {
							whatsapp_webhook: payload,
						},
					})) as IDataObject;
				} catch (error) {
					throw toKapsoNodeApiError(this, error);
				}

				saveWebhookStaticData.call(this, extractWebhook(response));

				return true;
			},
			async delete(this: IHookFunctions): Promise<boolean> {
				if (usesManualRegistration(this)) {
					return true;
				}

				const webhookData = this.getWorkflowStaticData('node');
				const webhookId = webhookData.webhookId as string | undefined;

				if (!webhookId) {
					return true;
				}

				try {
					await kapsoPlatformRequest.call(this, {
						method: 'DELETE',
						path: `${getWebhookCollectionPath(this, this.getNodeParameter('scope') as string)}/${webhookId}`,
					});
				} catch {
					return false;
				}

				delete webhookData.webhookId;
				delete webhookData.webhookSecret;

				return true;
			},
		},
	};

	async webhook(this: IWebhookFunctions): Promise<IWebhookResponseData> {
		const verifySignature = this.getNodeParameter('verifySignature', true) as boolean;

		if (verifySignature && !(await verifyKapsoSignature.call(this))) {
			return {
				noWebhookResponse: true,
			};
		}

		const bodyData = this.getBodyData() as unknown;
		const headerData = this.getHeaderData();
		const event = getHeaderValue(headerData, 'x-webhook-event');
		const idempotencyKey = getHeaderValue(headerData, 'x-idempotency-key');
		const payloadVersion = getHeaderValue(headerData, 'x-webhook-payload-version');
		const isBatch = getHeaderValue(headerData, 'x-webhook-batch') === 'true';
		const batchSize = getHeaderValue(headerData, 'x-batch-size');
		const outputData = normalizeWebhookOutput(bodyData, {
			event,
			idempotencyKey,
			payloadVersion,
			isBatch,
			batchSize,
		});

		return {
			workflowData: [outputData],
		};
	}
}

function selectedEvents(context: IHookFunctions): string[] {
	const scope = context.getNodeParameter('scope') as string;

	if (scope === 'project') {
		return context.getNodeParameter('projectEvents') as string[];
	}

	return context.getNodeParameter('phoneNumberEvents') as string[];
}

function buildWebhookPayload(context: IHookFunctions, webhookUrl: string): IDataObject {
	const kind = context.getNodeParameter('kind') as string;
	const scope = context.getNodeParameter('scope') as string;
	const payload: IDataObject = {
		url: webhookUrl,
		events: selectedEvents(context),
		active: true,
		kind,
	};

	if (scope === 'project') {
		const phoneNumberId = context.getNodeParameter('phoneNumberId', '') as string;

		if (phoneNumberId) {
			payload.phone_number_id = phoneNumberId;
		}
	}

	if (kind === 'kapso') {
		payload.payload_version = context.getNodeParameter('payloadVersion') as string;
	}

	const bufferEnabled = context.getNodeParameter('bufferEnabled', false) as boolean;

	if (scope === 'config' && kind === 'kapso') {
		payload.buffer_enabled = bufferEnabled;

		if (bufferEnabled) {
			payload.buffer_window_seconds = context.getNodeParameter('bufferWindowSeconds') as number;
			payload.max_buffer_size = context.getNodeParameter('maxBufferSize') as number;
		}
	}

	return payload;
}

function toKapsoNodeApiError(context: IHookFunctions, error: unknown): NodeApiError {
	return new NodeApiError(context.getNode(), error as JsonObject, {
		message: getKapsoErrorMessage(error),
		description: getKapsoErrorDescription(error),
		httpCode: getKapsoErrorHttpCode(error),
	});
}

function usesManualRegistration(context: IHookFunctions): boolean {
	return context.getNodeParameter('registrationMode', 'automatic') === 'manual';
}

function assertPublicWebhookUrl(context: IHookFunctions, webhookUrl: string): void {
	let parsedUrl: URL;

	try {
		parsedUrl = new URL(webhookUrl);
	} catch {
		throw new NodeOperationError(
			context.getNode(),
			`Kapso webhook URL is invalid: ${webhookUrl}`,
		);
	}

	const hostname = parsedUrl.hostname.toLowerCase();
	const isLocalHost =
		hostname === 'localhost' ||
		hostname === '127.0.0.1' ||
		hostname === '0.0.0.0' ||
		hostname === '::1' ||
		hostname.endsWith('.local');

	if (parsedUrl.protocol !== 'https:' || isLocalHost) {
		throw new NodeOperationError(
			context.getNode(),
			[
				`Kapso needs a public HTTPS webhook URL, but n8n generated: ${webhookUrl}`,
				'Restart local n8n with WEBHOOK_URL set to your Tailscale Funnel HTTPS URL.',
				'Example: WEBHOOK_URL=https://your-machine.your-tailnet.ts.net/ N8N_EDITOR_BASE_URL=https://your-machine.your-tailnet.ts.net/ N8N_PROXY_HOPS=1 npm run dev',
			].join('\n'),
		);
	}
}

function getWebhookCollectionPath(context: IHookFunctions, scope: string): string {
	if (scope === 'project') {
		return '/whatsapp/webhooks';
	}

	const phoneNumberId = context.getNodeParameter('phoneNumberId') as string;

	return `/whatsapp/phone_numbers/${encodeURIComponent(phoneNumberId)}/webhooks`;
}

async function findExistingWebhook(this: IHookFunctions): Promise<IDataObject | undefined> {
	const scope = this.getNodeParameter('scope') as string;
	const webhookUrl = this.getNodeWebhookUrl('default');
	const response = await kapsoPlatformRequest.call(this, {
		method: 'GET',
		path: getWebhookCollectionPath(this, scope),
	});

	return extractCollection(response).find((webhook) => webhook.url === webhookUrl);
}

function extractWebhook(response: unknown): IDataObject {
	if (!response || typeof response !== 'object') {
		return {};
	}

	const responseObject = response as IDataObject;

	for (const key of ['data', 'webhook', 'whatsapp_webhook']) {
		const value = responseObject[key];

		if (value && typeof value === 'object' && !Array.isArray(value)) {
			return value as IDataObject;
		}
	}

	return responseObject;
}

function saveWebhookStaticData(this: IHookFunctions, webhook: IDataObject): void {
	const webhookData = this.getWorkflowStaticData('node');
	const webhookId = webhook.id;
	const webhookSecret =
		webhook.webhook_secret_key ?? webhook.secret_key ?? webhook.secret ?? webhook.signing_secret;

	if (typeof webhookId === 'string') {
		webhookData.webhookId = webhookId;
	}

	if (typeof webhookSecret === 'string') {
		webhookData.webhookSecret = webhookSecret;
	}
}

async function verifyKapsoSignature(this: IWebhookFunctions): Promise<boolean> {
	const manualSecret = this.getNodeParameter('webhookSecret', '') as string;
	const webhookData = this.getWorkflowStaticData('node');
	const secret = manualSecret || (webhookData.webhookSecret as string | undefined);

	if (!secret) {
		return rejectWebhook.call(this, 401, 'Missing Kapso webhook secret');
	}

	const signature = getHeaderValue(this.getHeaderData(), 'x-webhook-signature');

	if (!signature) {
		return rejectWebhook.call(this, 401, 'Missing X-Webhook-Signature');
	}

	const rawBody = await getRawBody.call(this);
	const expectedSignature = createHmac('sha256', secret).update(rawBody).digest('hex');
	const signatureBuffer = Buffer.from(signature, 'hex');
	const expectedBuffer = Buffer.from(expectedSignature, 'hex');

	if (
		signatureBuffer.length !== expectedBuffer.length ||
		!timingSafeEqual(signatureBuffer, expectedBuffer)
	) {
		return rejectWebhook.call(this, 401, 'Invalid X-Webhook-Signature');
	}

	return true;
}

async function getRawBody(this: IWebhookFunctions): Promise<Buffer | string> {
	const request = this.getRequestObject() as {
		rawBody?: Buffer | string;
		readRawBody?: () => Promise<void>;
	};

	if (!request.rawBody && typeof request.readRawBody === 'function') {
		await request.readRawBody();
	}

	if (request.rawBody) {
		return request.rawBody;
	}

	return JSON.stringify(this.getBodyData());
}

function rejectWebhook(this: IWebhookFunctions, statusCode: number, message: string): false {
	const response = this.getResponseObject();

	response.status(statusCode).json({ message });

	return false;
}

function getHeaderValue(headers: IDataObject, name: string): string | undefined {
	const value = headers[name] ?? headers[name.toLowerCase()] ?? headers[name.toUpperCase()];

	if (Array.isArray(value)) {
		return value[0] as string | undefined;
	}

	if (typeof value === 'string') {
		return value;
	}

	return undefined;
}

function normalizeWebhookOutput(bodyData: unknown, metadata: IDataObject): INodeExecutionData[] {
	const rawItems = Array.isArray(bodyData) ? bodyData : [bodyData];

	return rawItems.map((item) => {
		const json =
			item && typeof item === 'object' && !Array.isArray(item)
				? ({ ...(item as IDataObject) } as IDataObject)
				: ({ payload: item } as IDataObject);

		json._kapso = metadata;

		return {
			json,
		};
	});
}
