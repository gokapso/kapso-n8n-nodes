import type {
	IDataObject,
	IExecuteFunctions,
	IHookFunctions,
	IHttpRequestMethods,
	IHttpRequestOptions,
	ILoadOptionsFunctions,
} from 'n8n-workflow';

type KapsoContext = IExecuteFunctions | IHookFunctions | ILoadOptionsFunctions;

interface KapsoCredentialData extends IDataObject {
	baseUrl: string;
	graphVersion: string;
}

interface KapsoRequestOptions {
	method: IHttpRequestMethods;
	path: string;
	body?: IDataObject | IDataObject[];
	qs?: IDataObject;
}

function trimSlashes(value: string): string {
	return value.replace(/\/+$/, '');
}

function normalizeBaseUrl(value: string): string {
	return trimSlashes(value || 'https://api.kapso.ai')
		.replace(/\/platform\/v\d+$/i, '')
		.replace(/\/meta\/whatsapp(?:\/v\d+(?:\.\d+)?)?$/i, '');
}

function normalizeGraphVersion(value: string): string {
	return (value || 'v24.0').replace(/^\/+|\/+$/g, '') || 'v24.0';
}

function cleanPath(path: string): string {
	return path.replace(/^\/+/, '');
}

async function getKapsoCredentials(context: KapsoContext): Promise<KapsoCredentialData> {
	const credentials = (await context.getCredentials('kapsoApi')) as KapsoCredentialData;

	return {
		...credentials,
		baseUrl: normalizeBaseUrl(credentials.baseUrl || 'https://api.kapso.ai'),
		graphVersion: normalizeGraphVersion(credentials.graphVersion || 'v24.0'),
	};
}

export async function kapsoPlatformRequest<T = IDataObject>(
	this: KapsoContext,
	options: KapsoRequestOptions,
): Promise<T> {
	const credentials = await getKapsoCredentials(this);
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${credentials.baseUrl}/platform/v1/${cleanPath(options.path)}`,
		qs: options.qs,
		body: options.body,
		json: true,
	};

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'kapsoApi',
			requestOptions,
		)) as T;
	} catch (error) {
		throw buildKapsoRequestError(error, requestOptions);
	}
}

export async function kapsoMetaRequest<T = IDataObject>(
	this: KapsoContext,
	options: KapsoRequestOptions,
): Promise<T> {
	const credentials = await getKapsoCredentials(this);
	const requestOptions: IHttpRequestOptions = {
		method: options.method,
		url: `${credentials.baseUrl}/meta/whatsapp/${credentials.graphVersion}/${cleanPath(options.path)}`,
		qs: options.qs,
		body: options.body,
		json: true,
	};

	try {
		return (await this.helpers.httpRequestWithAuthentication.call(
			this,
			'kapsoApi',
			requestOptions,
		)) as T;
	} catch (error) {
		throw buildKapsoRequestError(error, requestOptions);
	}
}

export function getKapsoErrorMessage(error: unknown): string | undefined {
	return getMessage(error);
}

export function getKapsoErrorDescription(error: unknown): string | undefined {
	if (isObject(error) && typeof error.description === 'string') {
		return error.description;
	}

	return undefined;
}

export function getKapsoErrorHttpCode(error: unknown): string | undefined {
	return getStatusCode(error);
}

function buildKapsoRequestError(error: unknown, requestOptions: IHttpRequestOptions): IDataObject {
	const statusCode = getStatusCode(error);
	const responseBody = getResponseBody(error);
	const responseMessage = getMessage(responseBody) ?? getMessage(error);
	const responseText = responseBody ? stringify(responseBody) : undefined;
	const requestBodyText = requestOptions.body ? stringify(requestOptions.body) : undefined;
	const requestDetails: IDataObject = {
		method: requestOptions.method,
		url: requestOptions.url,
		qs: requestOptions.qs ? stringify(requestOptions.qs) : undefined,
		body: requestBodyText,
	};
	const message = [
		`Kapso API ${requestOptions.method} ${requestOptions.url} failed`,
		statusCode ? `(${statusCode})` : '',
		responseMessage ? `: ${responseMessage}` : '',
	].join('');
	const description = [
		`Kapso rejected the request.`,
		`Request: ${requestOptions.method} ${requestOptions.url}`,
		requestOptions.qs ? `Query: ${stringify(requestOptions.qs)}` : '',
		requestBodyText ? `Body: ${requestBodyText}` : '',
		responseText ? `Response: ${responseText}` : '',
	].filter(Boolean).join('\n');

	return {
		message,
		description,
		httpCode: statusCode,
		statusCode,
		response: {
			data: {
				message: responseMessage,
				body: responseText,
			},
		},
		request: requestDetails,
	};
}

function isObject(value: unknown): value is Record<string, unknown> {
	return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function getStatusCode(value: unknown): string | undefined {
	if (!isObject(value)) {
		return undefined;
	}

	for (const key of ['statusCode', 'status', 'httpCode', 'code']) {
		const status = value[key];

		if (typeof status === 'number' || typeof status === 'string') {
			return String(status);
		}
	}

	const response = value.response;

	if (isObject(response)) {
		return getStatusCode(response);
	}

	return undefined;
}

function getResponseBody(error: unknown): unknown {
	if (!isObject(error)) {
		return undefined;
	}

	const response = error.response;

	if (isObject(response)) {
		return response.data ?? response.body ?? response;
	}

	return error.error ?? error.body;
}

function getMessage(value: unknown): string | undefined {
	if (typeof value === 'string' && value.trim()) {
		return value;
	}

	if (!isObject(value)) {
		return undefined;
	}

	for (const key of ['message', 'description', 'detail', 'title', 'error']) {
		const candidate = value[key];
		const message = getMessage(candidate);

		if (message) {
			return message;
		}
	}

	return undefined;
}

function stringify(value: unknown): string {
	return JSON.stringify(value, null, 2).slice(0, 4000);
}

export function parseJsonObject(value: unknown, fieldName: string): IDataObject {
	if (typeof value === 'string') {
		const trimmed = value.trim();

		if (!trimmed) {
			return {};
		}

		const parsed = JSON.parse(trimmed) as unknown;

		if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
			throw new Error(`${fieldName} must be a JSON object`);
		}

		return parsed as IDataObject;
	}

	if (!value || typeof value !== 'object' || Array.isArray(value)) {
		throw new Error(`${fieldName} must be a JSON object`);
	}

	return value as IDataObject;
}

export function parseJsonArray(value: unknown, fieldName: string): IDataObject[] {
	if (typeof value === 'string') {
		const trimmed = value.trim();

		if (!trimmed) {
			return [];
		}

		const parsed = JSON.parse(trimmed) as unknown;

		if (!Array.isArray(parsed)) {
			throw new Error(`${fieldName} must be a JSON array`);
		}

		return parsed as IDataObject[];
	}

	if (!Array.isArray(value)) {
		throw new Error(`${fieldName} must be a JSON array`);
	}

	return value as IDataObject[];
}

export function extractCollection(response: unknown): IDataObject[] {
	if (Array.isArray(response)) {
		return response as IDataObject[];
	}

	if (!response || typeof response !== 'object') {
		return [];
	}

	const responseObject = response as IDataObject;
	const possibleKeys = ['data', 'items', 'webhooks', 'whatsapp_webhooks', 'phone_numbers'];

	for (const key of possibleKeys) {
		const value = responseObject[key];

		if (Array.isArray(value)) {
			return value as IDataObject[];
		}
	}

	return [];
}
