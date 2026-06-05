import type {
	IDataObject,
	IExecuteFunctions,
	INodeExecutionData,
	INodeType,
	INodeTypeDescription,
	JsonObject,
} from 'n8n-workflow';
import { NodeApiError, NodeConnectionTypes, NodeOperationError } from 'n8n-workflow';

import {
	extractCollection,
	getKapsoErrorDescription,
	getKapsoErrorHttpCode,
	getKapsoErrorMessage,
	kapsoMetaRequest,
	kapsoPlatformRequest,
	parseJsonArray,
	parseJsonObject,
} from './GenericFunctions';

export class Kapso implements INodeType {
	description: INodeTypeDescription = {
		displayName: 'Kapso',
		name: 'kapso',
		icon: { light: 'file:kapso-logo.svg', dark: 'file:kapso-logo.dark.svg' },
		group: ['output'],
		version: 1,
		subtitle: '={{$parameter["operation"]}}',
		description: 'Send WhatsApp messages and inspect Kapso WhatsApp resources',
		defaults: {
			name: 'Kapso',
		},
		inputs: [NodeConnectionTypes.Main],
		outputs: [NodeConnectionTypes.Main],
		usableAsTool: true,
		credentials: [
			{
				name: 'kapsoApi',
				required: true,
			},
		],
		properties: [
			{
				displayName: 'Resource',
				name: 'resource',
				type: 'options',
				noDataExpression: true,
				options: [
					{
						name: 'Phone Number',
						value: 'phoneNumber',
					},
					{
						name: 'WhatsApp Message',
						value: 'whatsAppMessage',
					},
				],
				default: 'whatsAppMessage',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['phoneNumber'],
					},
				},
				options: [
					{
						name: 'List',
						value: 'list',
						description: 'List connected WhatsApp phone numbers',
						action: 'List connected phone numbers',
					},
				],
				default: 'list',
			},
			{
				displayName: 'Operation',
				name: 'operation',
				type: 'options',
				noDataExpression: true,
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
					},
				},
				options: [
					{
						name: 'List',
						value: 'list',
						description: 'List WhatsApp messages stored by Kapso',
						action: 'List messages',
					},
					{
						name: 'Mark as Read',
						value: 'markAsRead',
						description: 'Mark a WhatsApp message as read',
						action: 'Mark a message as read',
					},
					{
						name: 'Send Raw Payload',
						value: 'sendRaw',
						description: 'Send any WhatsApp Cloud API message payload through Kapso',
						action: 'Send a raw message payload',
					},
					{
						name: 'Send Template',
						value: 'sendTemplate',
						description: 'Send a WhatsApp template message through Kapso',
						action: 'Send a template message',
					},
					{
						name: 'Send Text',
						value: 'sendText',
						description: 'Send a WhatsApp text message through Kapso',
						action: 'Send a text message',
					},
				],
				default: 'sendText',
			},
			{
				displayName: 'Phone Number ID',
				name: 'phoneNumberId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['markAsRead', 'sendRaw', 'sendTemplate', 'sendText'],
					},
				},
				description: 'Meta phone_number_id to send from',
			},
			{
				displayName: 'Recipient Phone Number',
				name: 'to',
				type: 'string',
				required: true,
				default: '',
				placeholder: '15551234567',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['sendTemplate', 'sendText'],
					},
				},
				description: 'Recipient WhatsApp phone number, usually country code plus number without +',
			},
			{
				displayName: 'Message',
				name: 'message',
				type: 'string',
				typeOptions: {
					rows: 4,
				},
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['sendText'],
					},
				},
				description: 'Text message body to send',
			},
			{
				displayName: 'Preview URL',
				name: 'previewUrl',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['sendText'],
					},
				},
				description: 'Whether WhatsApp should render URL previews for links in the message',
			},
			{
				displayName: 'Reply to Message ID',
				name: 'replyToMessageId',
				type: 'string',
				default: '',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['sendText'],
					},
				},
				description: 'Optional WhatsApp message ID to reply to',
			},
			{
				displayName: 'Template Name',
				name: 'templateName',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['sendTemplate'],
					},
				},
				description: 'Approved WhatsApp template name',
			},
			{
				displayName: 'Language Code',
				name: 'languageCode',
				type: 'string',
				required: true,
				default: 'en_US',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['sendTemplate'],
					},
				},
				description: 'WhatsApp template language code',
			},
			{
				displayName: 'Components JSON',
				name: 'componentsJson',
				type: 'json',
				default: '[]',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['sendTemplate'],
					},
				},
				description: 'Optional template components array, including named or positional parameters',
			},
			{
				displayName: 'Payload JSON',
				name: 'payloadJson',
				type: 'json',
				required: true,
				default:
					'{\n  "messaging_product": "whatsapp",\n  "to": "15551234567",\n  "type": "text",\n  "text": {\n    "body": "Hello from Kapso"\n  }\n}',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['sendRaw'],
					},
				},
				description: 'Full WhatsApp Cloud API message payload to POST through Kapso',
			},
			{
				displayName: 'Message ID',
				name: 'messageId',
				type: 'string',
				required: true,
				default: '',
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['markAsRead'],
					},
				},
				description: 'WhatsApp message ID to mark as read',
			},
			{
				displayName: 'Show Typing Indicator',
				name: 'typingIndicator',
				type: 'boolean',
				default: false,
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['markAsRead'],
					},
				},
				description:
					'Whether to ask WhatsApp to briefly show a typing indicator after marking read',
			},
			{
				displayName: 'Filters',
				name: 'filters',
				type: 'collection',
				placeholder: 'Add Filter',
				default: {},
				displayOptions: {
					show: {
						resource: ['whatsAppMessage'],
						operation: ['list'],
					},
				},
				options: [
					{
						displayName: 'Conversation ID',
						name: 'conversation_id',
						type: 'string',
						default: '',
						description: 'Only return messages in this Kapso conversation',
					},
					{
						displayName: 'Direction',
						name: 'direction',
						type: 'options',
						options: [
							{
								name: 'Inbound',
								value: 'inbound',
							},
							{
								name: 'Outbound',
								value: 'outbound',
							},
						],
						default: 'inbound',
						description: 'Only return messages with this direction',
					},
					{
						displayName: 'Message Type',
						name: 'message_type',
						type: 'options',
						options: [
							{
								name: 'Audio',
								value: 'audio',
							},
							{
								name: 'Document',
								value: 'document',
							},
							{
								name: 'Image',
								value: 'image',
							},
							{
								name: 'Text',
								value: 'text',
							},
							{
								name: 'Video',
								value: 'video',
							},
						],
						default: 'text',
						description: 'Only return messages of this WhatsApp type',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						default: 1,
						typeOptions: {
							minValue: 1,
						},
						description: 'Page number to return',
					},
					{
						displayName: 'Per Page',
						name: 'per_page',
						type: 'number',
						default: 50,
						typeOptions: {
							minValue: 1,
							maxValue: 100,
						},
						description: 'Number of messages to return per page',
					},
					{
						displayName: 'Phone Number',
						name: 'phone_number',
						type: 'string',
						default: '',
						description: 'Only return conversations with this customer phone number',
					},
					{
						displayName: 'Phone Number ID',
						name: 'phone_number_id',
						type: 'string',
						default: '',
						description: 'Only return messages for this Meta phone_number_id',
					},
					{
						displayName: 'Status',
						name: 'status',
						type: 'options',
						options: [
							{
								name: 'Delivered',
								value: 'delivered',
							},
							{
								name: 'Failed',
								value: 'failed',
							},
							{
								name: 'Pending',
								value: 'pending',
							},
							{
								name: 'Read',
								value: 'read',
							},
							{
								name: 'Sent',
								value: 'sent',
							},
						],
						default: 'sent',
						description: 'Only return messages with this status',
					},
				],
			},
			{
				displayName: 'Options',
				name: 'options',
				type: 'collection',
				placeholder: 'Add Option',
				default: {},
				displayOptions: {
					show: {
						resource: ['phoneNumber'],
						operation: ['list'],
					},
				},
				options: [
					{
						displayName: 'Customer ID',
						name: 'customer_id',
						type: 'string',
						default: '',
						description: 'Only return phone numbers connected for this Kapso customer',
					},
					{
						displayName: 'Page',
						name: 'page',
						type: 'number',
						default: 1,
						typeOptions: {
							minValue: 1,
						},
						description: 'Page number to return',
					},
					{
						displayName: 'Per Page',
						name: 'per_page',
						type: 'number',
						default: 50,
						typeOptions: {
							minValue: 1,
							maxValue: 100,
						},
						description: 'Number of phone numbers to return per page',
					},
				],
			},
		],
	};

	async execute(this: IExecuteFunctions): Promise<INodeExecutionData[][]> {
		const items = this.getInputData();
		const returnData: INodeExecutionData[] = [];

		for (let itemIndex = 0; itemIndex < items.length; itemIndex++) {
			try {
				const resource = this.getNodeParameter('resource', itemIndex) as string;
				const operation = this.getNodeParameter('operation', itemIndex) as string;
				const responseData = await executeOperation.call(this, resource, operation, itemIndex);
				const outputItems = Array.isArray(responseData) ? responseData : [responseData];

				for (const outputItem of outputItems) {
					returnData.push({
						json: outputItem,
						pairedItem: { item: itemIndex },
					});
				}
			} catch (error) {
				if (this.continueOnFail()) {
					returnData.push({
						json: {
							error: getKapsoErrorMessage(error) ?? String(error),
						},
						pairedItem: { item: itemIndex },
					});
					continue;
				}

				if (error instanceof NodeOperationError) {
					throw new NodeOperationError(this.getNode(), error.message, { itemIndex });
				}

				throw new NodeApiError(this.getNode(), error as JsonObject, {
					itemIndex,
					message: getKapsoErrorMessage(error),
					description: getKapsoErrorDescription(error),
					httpCode: getKapsoErrorHttpCode(error),
				});
			}
		}

		return [returnData];
	}
}

async function executeOperation(
	this: IExecuteFunctions,
	resource: string,
	operation: string,
	itemIndex: number,
): Promise<IDataObject | IDataObject[]> {
	if (resource === 'phoneNumber' && operation === 'list') {
		const qs = removeEmptyValues(this.getNodeParameter('options', itemIndex, {}) as IDataObject);
		const response = await kapsoPlatformRequest.call(this, {
			method: 'GET',
			path: '/whatsapp/phone_numbers',
			qs,
		});

		return extractCollection(response);
	}

	if (resource !== 'whatsAppMessage') {
		throw new NodeOperationError(this.getNode(), `Unsupported resource: ${resource}`, {
			itemIndex,
		});
	}

	if (operation === 'list') {
		const qs = removeEmptyValues(this.getNodeParameter('filters', itemIndex, {}) as IDataObject);
		const response = await kapsoPlatformRequest.call(this, {
			method: 'GET',
			path: '/whatsapp/messages',
			qs,
		});

		return extractCollection(response);
	}

	const phoneNumberId = this.getNodeParameter('phoneNumberId', itemIndex) as string;

	if (operation === 'sendText') {
		const to = normalizeRecipient(this.getNodeParameter('to', itemIndex) as string);
		const message = this.getNodeParameter('message', itemIndex) as string;
		const previewUrl = this.getNodeParameter('previewUrl', itemIndex) as boolean;
		const replyToMessageId = this.getNodeParameter('replyToMessageId', itemIndex, '') as string;
		const payload: IDataObject = {
			messaging_product: 'whatsapp',
			to,
			type: 'text',
			text: {
				body: message,
				preview_url: previewUrl,
			},
		};

		if (replyToMessageId) {
			payload.context = {
				message_id: replyToMessageId,
			};
		}

		return await sendMessage.call(this, phoneNumberId, payload);
	}

	if (operation === 'sendTemplate') {
		const to = normalizeRecipient(this.getNodeParameter('to', itemIndex) as string);
		const templateName = this.getNodeParameter('templateName', itemIndex) as string;
		const languageCode = this.getNodeParameter('languageCode', itemIndex) as string;
		const components = parseJsonArray(
			this.getNodeParameter('componentsJson', itemIndex, '[]'),
			'Components JSON',
		);
		const template: IDataObject = {
			name: templateName,
			language: {
				code: languageCode,
			},
		};

		if (components.length > 0) {
			template.components = components;
		}

		return await sendMessage.call(this, phoneNumberId, {
			messaging_product: 'whatsapp',
			to,
			type: 'template',
			template,
		});
	}

	if (operation === 'sendRaw') {
		const payload = parseJsonObject(
			this.getNodeParameter('payloadJson', itemIndex),
			'Payload JSON',
		);

		if (!payload.messaging_product) {
			payload.messaging_product = 'whatsapp';
		}

		return await sendMessage.call(this, phoneNumberId, payload);
	}

	if (operation === 'markAsRead') {
		const messageId = this.getNodeParameter('messageId', itemIndex) as string;
		const typingIndicator = this.getNodeParameter('typingIndicator', itemIndex) as boolean;
		const payload: IDataObject = {
			messaging_product: 'whatsapp',
			status: 'read',
			message_id: messageId,
		};

		if (typingIndicator) {
			payload.typing_indicator = {
				type: 'text',
			};
		}

		return await sendMessage.call(this, phoneNumberId, payload);
	}

	throw new NodeOperationError(this.getNode(), `Unsupported operation: ${operation}`, {
		itemIndex,
	});
}

async function sendMessage(
	this: IExecuteFunctions,
	phoneNumberId: string,
	payload: IDataObject,
): Promise<IDataObject> {
	return (await kapsoMetaRequest.call(this, {
		method: 'POST',
		path: `/${phoneNumberId}/messages`,
		body: payload,
	})) as IDataObject;
}

function removeEmptyValues(values: IDataObject): IDataObject {
	return Object.fromEntries(
		Object.entries(values).filter(
			([, value]) => value !== undefined && value !== null && value !== '',
		),
	) as IDataObject;
}

function normalizeRecipient(value: string): string {
	return value.replace(/[^\d]/g, '');
}
