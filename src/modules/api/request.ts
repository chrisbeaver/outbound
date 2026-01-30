import * as vscode from 'vscode';
import * as http from 'http';
import * as https from 'https';
import type { LaravelRoute, RouteRequestConfig, RouteRequestParam, ParamType } from '../../types/routes';
import type { ApiResponse, RequestOptions } from '../../types/api';

export type { ApiResponse, RequestOptions };

/**
 * Get the API host from extension settings
 */
export function getApiHost(): string {
	const config = vscode.workspace.getConfiguration('outbound');
	return config.get<string>('apiHost', 'http://localhost:8000');
}

/**
 * Check if the API server is available by making a simple HEAD request
 * @returns Promise<boolean> true if server responds, false otherwise
 */
export async function checkServerStatus(): Promise<boolean> {
	const host = getApiHost();
	
	return new Promise((resolve) => {
		try {
			const url = new URL(host);
			const isHttps = url.protocol === 'https:';
			const client = isHttps ? https : http;
			
			const options = {
				hostname: url.hostname,
				port: url.port || (isHttps ? 443 : 80),
				path: '/',
				method: 'HEAD',
				timeout: 3000, // 3 second timeout
			};
			
			const req = client.request(options, (res) => {
				// Any response means server is up (even 404, 500, etc.)
				resolve(true);
			});
			
			req.on('error', () => {
				resolve(false);
			});
			
			req.on('timeout', () => {
				req.destroy();
				resolve(false);
			});
			
			req.end();
		} catch {
			resolve(false);
		}
	});
}

/**
 * Build a cURL command for a route
 */
export function buildCurlCommand(
	route: LaravelRoute,
	options: RequestOptions = {}
): string {
	const host = options.host || getApiHost();
	const config = buildRequestConfig(route, host, options);
	
	const parts: string[] = ['curl'];
	
	// Add method
	const method = config.method.toUpperCase();
	if (method !== 'GET') {
		parts.push(`-X ${method}`);
	}
	
	// Add headers
	for (const [key, value] of Object.entries(config.headers)) {
		parts.push(`-H '${key}: ${value}'`);
	}
	
	// Add bearer token if provided
	if (options.bearerToken) {
		parts.push(`-H 'Authorization: Bearer ${options.bearerToken}'`);
	}
	
	// Add body for non-GET requests
	if (method !== 'GET' && method !== 'HEAD' && Object.keys(config.bodyParams).length > 0) {
		if (config.contentType === 'application/json') {
			const body = JSON.stringify(config.bodyParams);
			parts.push(`-d '${body}'`);
		} else if (config.contentType === 'application/x-www-form-urlencoded') {
			const formData = Object.entries(config.bodyParams)
				.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
				.join('&');
			parts.push(`-d '${formData}'`);
		} else if (config.contentType === 'multipart/form-data') {
			for (const [key, value] of Object.entries(config.bodyParams)) {
				if (value !== null && value !== undefined) {
					parts.push(`-F '${key}=${String(value)}'`);
				}
			}
		}
	}
	
	// Build URL with query parameters
	let url = config.url;
	if (config.queryParams.length > 0) {
		const queryString = config.queryParams
			.filter(({value}) => value !== '')
			.map(({name, value}) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
			.join('&');
		if (queryString) {
			url += `?${queryString}`;
		}
	}
	
	// Add URL (quoted)
	parts.push(`'${url}'`);
	
	// Add common options
	parts.push('-s'); // Silent mode
	parts.push('-w "|||%{http_code}"'); // Output status code with unique delimiter
	
	return parts.join(' ');
}

/**
 * Build a request configuration from a route
 */
export function buildRequestConfig(
	route: LaravelRoute,
	host: string,
	options: RequestOptions = {}
): RouteRequestConfig {
	// Build URL with path parameters
	let uri = route.uri.replace(/^\//, '');
	const pathParams: Record<string, string> = { ...options.pathParams };
	
	// Replace path parameters in URI
	const pathParamRegex = /\{(\w+)\??}/g;
	let match;
	
	while ((match = pathParamRegex.exec(route.uri)) !== null) {
		const paramName = match[1];
		const isOptional = match[0].includes('?');
		
		if (pathParams[paramName]) {
			uri = uri.replace(match[0], pathParams[paramName]);
		} else if (!isOptional) {
			// Use placeholder for required params
			pathParams[paramName] = `{${paramName}}`;
		} else {
			// Remove optional params that aren't provided
			uri = uri.replace(match[0], '');
		}
	}
	
	// Clean up any double slashes
	uri = uri.replace(/\/+/g, '/').replace(/\/$/, '');
	
	const url = `${host.replace(/\/$/, '')}/${uri}`;
	
	// Determine HTTP method
	const method = route.method.split('|')[0].toUpperCase();
	
	// Build query and body params from route request params
	const queryParams: Array<{name: string, value: string}> = [...(options.queryParams || [])];
	const bodyParams: Record<string, unknown> = { ...options.bodyParams };
	
	// Determine content type
	let contentType: RouteRequestConfig['contentType'] = 'application/json';
	
	if (route.requestParams) {
		const hasFileParam = route.requestParams.some(p => p.type === 'file');
		if (hasFileParam) {
			contentType = 'multipart/form-data';
		}
		
		// Populate params with defaults if not overridden
		for (const param of route.requestParams) {
			if (param.isPathParam) {
				continue;
			}
			
			const paramName = param.name;
			
			// Skip disabled params - they should not be sent at all
			if (options.disabledParams?.includes(paramName)) {
				continue;
			}
			
			if (method === 'GET' || method === 'HEAD') {
				// For GET requests, add route params as query params if not already provided
				const existingParam = queryParams.find(p => p.name === paramName);
				if (!existingParam) {
					queryParams.push({name: paramName, value: ''});
				}
			} else {
				if (!(paramName in bodyParams)) {
					bodyParams[paramName] = getDefaultValueForType(param);
				}
			}
		}
	}
	
	// Build headers
	const headers: Record<string, string> = {
		'Accept': 'application/json',
		...options.headers
	};
	
	// Set content type for non-GET requests with body
	if (method !== 'GET' && method !== 'HEAD' && Object.keys(bodyParams).length > 0) {
		if (contentType !== 'multipart/form-data') {
			headers['Content-Type'] = contentType;
		}
	}
	
	return {
		route,
		url,
		method,
		headers,
		queryParams,
		bodyParams,
		pathParams,
		contentType
	};
}

/**
 * Execute an HTTP request using Node's native http/https modules
 */
export async function executeRequest(
	route: LaravelRoute,
	options: RequestOptions = {}
): Promise<ApiResponse> {
	const host = options.host || getApiHost();
	const config = buildRequestConfig(route, host, options);
	const timeout = options.timeout || 30000;
	const curlCommand = buildCurlCommand(route, options);
	
	const startTime = Date.now();
	
	return new Promise((resolve) => {
		try {
			// Build full URL with query params
			let fullUrl = config.url;
			if (config.queryParams.length > 0) {
				const queryString = config.queryParams
					.filter(({value}) => value !== '')
					.map(({name, value}) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
					.join('&');
				if (queryString) {
					fullUrl += `?${queryString}`;
				}
			}
			
			const url = new URL(fullUrl);
			const isHttps = url.protocol === 'https:';
			const client = isHttps ? https : http;
			
			// Build request headers
			const requestHeaders: Record<string, string> = { ...config.headers };
			if (options.bearerToken) {
				requestHeaders['Authorization'] = `Bearer ${options.bearerToken}`;
			}
			
			// Prepare request body
			let requestBody: string | undefined;
			if (config.method !== 'GET' && config.method !== 'HEAD' && Object.keys(config.bodyParams).length > 0) {
				if (config.contentType === 'application/json') {
					requestBody = JSON.stringify(config.bodyParams);
					requestHeaders['Content-Length'] = Buffer.byteLength(requestBody).toString();
				} else if (config.contentType === 'application/x-www-form-urlencoded') {
					requestBody = Object.entries(config.bodyParams)
						.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
						.join('&');
					requestHeaders['Content-Length'] = Buffer.byteLength(requestBody).toString();
				}
			}
			
			const requestOptions: http.RequestOptions = {
				hostname: url.hostname,
				port: url.port || (isHttps ? 443 : 80),
				path: url.pathname + url.search,
				method: config.method,
				headers: requestHeaders,
				timeout: timeout,
			};
			
			const req = client.request(requestOptions, (res) => {
				const chunks: Buffer[] = [];
				
				res.on('data', (chunk: Buffer) => {
					chunks.push(chunk);
				});
				
				res.on('end', () => {
					const duration = Date.now() - startTime;
					const rawBody = Buffer.concat(chunks).toString('utf8');
					const statusCode = res.statusCode || 0;
					
					// Parse response headers
					const responseHeaders: Record<string, string> = {};
					for (const [key, value] of Object.entries(res.headers)) {
						if (value) {
							responseHeaders[key.toLowerCase()] = Array.isArray(value) ? value.join(', ') : value;
						}
					}
					
					// Try to parse as JSON
					let body: unknown;
					try {
						body = JSON.parse(rawBody);
					} catch {
						body = rawBody;
					}
					
					resolve({
						success: statusCode >= 200 && statusCode < 300,
						statusCode,
						headers: responseHeaders,
						body,
						rawBody,
						duration,
						curlCommand
					});
				});
			});
			
			req.on('error', (error) => {
				const duration = Date.now() - startTime;
				resolve({
					success: false,
					statusCode: 0,
					headers: {},
					body: null,
					rawBody: '',
					duration,
					error: error.message,
					curlCommand
				});
			});
			
			req.on('timeout', () => {
				req.destroy();
				const duration = Date.now() - startTime;
				resolve({
					success: false,
					statusCode: 0,
					headers: {},
					body: null,
					rawBody: '',
					duration,
					error: 'Request timeout',
					curlCommand
				});
			});
			
			// Write body if present
			if (requestBody) {
				req.write(requestBody);
			}
			
			req.end();
		} catch (error) {
			const duration = Date.now() - startTime;
			const errorMessage = error instanceof Error ? error.message : String(error);
			resolve({
				success: false,
				statusCode: 0,
				headers: {},
				body: null,
				rawBody: '',
				duration,
				error: errorMessage,
				curlCommand
			});
		}
	});
}

/**
 * Get a default value for a parameter type
 */
function getDefaultValueForType(param: RouteRequestParam): unknown {
	if (param.enumValues && param.enumValues.length > 0) {
		return param.enumValues[0];
	}
	
	if (param.defaultValue !== undefined) {
		return param.defaultValue;
	}
	
	if (param.children && param.children.length > 0) {
		if (param.type === 'array') {
			const childObj: Record<string, unknown> = {};
			for (const child of param.children) {
				childObj[child.name] = getDefaultValueForType(child);
			}
			return [childObj];
		} else {
			const obj: Record<string, unknown> = {};
			for (const child of param.children) {
				obj[child.name] = getDefaultValueForType(child);
			}
			return obj;
		}
	}
	
	return getDefaultForParamType(param.type);
}

/**
 * Get a default value for a parameter type
 */
function getDefaultForParamType(type: ParamType): unknown {
	switch (type) {
		case 'integer':
			return 1;
		case 'number':
			return 1.0;
		case 'boolean':
			return true;
		case 'array':
			return [];
		case 'object':
			return {};
		case 'date':
			return new Date().toISOString().split('T')[0];
		case 'email':
			return 'user@example.com';
		case 'url':
			return 'https://example.com';
		case 'uuid':
			return '550e8400-e29b-41d4-a716-446655440000';
		case 'file':
			return null;
		default:
			return 'string';
	}
}
