import type {
	IAuthenticateGeneric,
	ICredentialTestRequest,
	ICredentialType,
	INodeProperties,
} from 'n8n-workflow';

export class KapsoApi implements ICredentialType {
	name = 'kapsoApi';

	displayName = 'Kapso API';

	icon = { light: 'file:kapso-logo.svg', dark: 'file:kapso-logo.dark.svg' } as const;

	documentationUrl = 'https://docs.kapso.ai';

	properties: INodeProperties[] = [
		{
			displayName: 'API Key',
			name: 'apiKey',
			type: 'string',
			typeOptions: {
				password: true,
			},
			default: '',
			required: true,
			description: 'Kapso API key used in the X-API-Key header',
		},
		{
			displayName: 'Base URL',
			name: 'baseUrl',
			type: 'string',
			default: 'https://api.kapso.ai',
			required: true,
			description: 'Kapso API host, without /platform/v1 or /meta/whatsapp',
		},
		{
			displayName: 'Meta Graph Version',
			name: 'graphVersion',
			type: 'string',
			default: 'v24.0',
			required: true,
			description: 'WhatsApp Cloud API version to use through the Kapso Meta proxy',
		},
	];

	authenticate: IAuthenticateGeneric = {
		type: 'generic',
		properties: {
			headers: {
				'X-API-Key': '={{$credentials.apiKey}}',
			},
		},
	};

	test: ICredentialTestRequest = {
		request: {
			baseURL: '={{$credentials.baseUrl.replace(/\\/+$/, "")}}/platform/v1',
			url: '/whatsapp/phone_numbers',
			method: 'GET',
		},
	};
}
