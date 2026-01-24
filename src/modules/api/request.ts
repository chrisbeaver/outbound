import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';
import type { LaravelRoute, RouteRequestConfig, RouteRequestParam, ParamType } from '../../types/routes';
import type { ApiResponse, RequestOptions } from '../../types/api';

export type { ApiResponse, RequestOptions };

const execAsync = promisify(exec);

/**
 * Get the API host from extension settings
 */
export function getApiHost(): string {
	const config = vscode.workspace.getConfiguration('lapi');
	return config.get<string>('apiHost', 'http://localhost:8000');
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
	if (Object.keys(config.queryParams).length > 0) {
		const queryString = Object.entries(config.queryParams)
			.filter(([, value]) => value !== '')
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
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
	const queryParams: Record<string, string> = { ...options.queryParams };
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
			
			if (method === 'GET' || method === 'HEAD') {
				if (!(paramName in queryParams)) {
					queryParams[paramName] = '';
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
 * Execute a cURL request and return the response
 */
export async function executeRequest(
	route: LaravelRoute,
	options: RequestOptions = {}
): Promise<ApiResponse> {
	const curlCommand = buildCurlCommand(route, options);
	const timeout = options.timeout || 30000;
	
	const startTime = Date.now();
	
	try {
		const { stdout, stderr } = await execAsync(curlCommand, {
			timeout,
			maxBuffer: 10 * 1024 * 1024, // 10MB buffer
			shell: '/bin/bash'
		});
		
		const duration = Date.now() - startTime;
		
		// Parse the response - status code is after ||| delimiter
		let rawBody = stdout;
		let statusCode = 0;
		
		const delimiterIndex = stdout.lastIndexOf('|||');
		if (delimiterIndex !== -1) {
			rawBody = stdout.substring(0, delimiterIndex);
			statusCode = parseInt(stdout.substring(delimiterIndex + 3), 10);
		}
		
		// Try to parse as JSON
		let body: unknown;
		try {
			body = JSON.parse(rawBody);
		} catch {
			body = rawBody;
		}
		
		return {
			success: statusCode >= 200 && statusCode < 300,
			statusCode,
			headers: {}, // cURL doesn't return headers with this config
			body,
			rawBody,
			duration,
			curlCommand
		};
	} catch (error: unknown) {
		const duration = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		return {
			success: false,
			statusCode: 0,
			headers: {},
			body: null,
			rawBody: '',
			duration,
			error: errorMessage,
			curlCommand
		};
	}
}

/**
 * Execute a cURL request with full response headers
 */
export async function executeRequestWithHeaders(
	route: LaravelRoute,
	options: RequestOptions = {}
): Promise<ApiResponse> {
	const host = options.host || getApiHost();
	const config = buildRequestConfig(route, host, options);
	const timeout = options.timeout || 30000;
	
	// Build cURL command with header output
	const parts: string[] = ['curl'];
	
	const method = config.method.toUpperCase();
	if (method !== 'GET') {
		parts.push(`-X ${method}`);
	}
	
	for (const [key, value] of Object.entries(config.headers)) {
		parts.push(`-H '${key}: ${value}'`);
	}
	
	if (options.bearerToken) {
		parts.push(`-H 'Authorization: Bearer ${options.bearerToken}'`);
	}
	
	if (method !== 'GET' && method !== 'HEAD' && Object.keys(config.bodyParams).length > 0) {
		if (config.contentType === 'application/json') {
			const body = JSON.stringify(config.bodyParams);
			parts.push(`-d '${body}'`);
		}
	}
	
	let url = config.url;
	if (Object.keys(config.queryParams).length > 0) {
		const queryString = Object.entries(config.queryParams)
			.filter(([, value]) => value !== '')
			.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(value)}`)
			.join('&');
		if (queryString) {
			url += `?${queryString}`;
		}
	}
	
	parts.push(`'${url}'`);
	parts.push('-s');
	parts.push('-i'); // Include headers in output
	
	const curlCommand = parts.join(' ');
	const startTime = Date.now();
	
	try {
		const { stdout } = await execAsync(curlCommand, {
			timeout,
			maxBuffer: 10 * 1024 * 1024
		});
		
		const duration = Date.now() - startTime;
		
		// Parse headers and body
		const headerBodySplit = stdout.indexOf('\r\n\r\n');
		let headerSection: string;
		let rawBody: string;
		
		if (headerBodySplit !== -1) {
			headerSection = stdout.substring(0, headerBodySplit);
			rawBody = stdout.substring(headerBodySplit + 4);
		} else {
			// Try with just \n\n
			const altSplit = stdout.indexOf('\n\n');
			if (altSplit !== -1) {
				headerSection = stdout.substring(0, altSplit);
				rawBody = stdout.substring(altSplit + 2);
			} else {
				headerSection = '';
				rawBody = stdout;
			}
		}
		
		// Parse status code from first line
		const statusMatch = /HTTP\/[\d.]+ (\d+)/.exec(headerSection);
		const statusCode = statusMatch ? parseInt(statusMatch[1], 10) : 0;
		
		// Parse headers
		const headers: Record<string, string> = {};
		const headerLines = headerSection.split(/\r?\n/).slice(1);
		for (const line of headerLines) {
			const colonIndex = line.indexOf(':');
			if (colonIndex !== -1) {
				const key = line.substring(0, colonIndex).trim();
				const value = line.substring(colonIndex + 1).trim();
				headers[key.toLowerCase()] = value;
			}
		}
		
		// Try to parse body as JSON
		let body: unknown;
		try {
			body = JSON.parse(rawBody);
		} catch {
			body = rawBody;
		}
		
		return {
			success: statusCode >= 200 && statusCode < 300,
			statusCode,
			headers,
			body,
			rawBody,
			duration,
			curlCommand
		};
	} catch (error: unknown) {
		const duration = Date.now() - startTime;
		const errorMessage = error instanceof Error ? error.message : String(error);
		
		return {
			success: false,
			statusCode: 0,
			headers: {},
			body: null,
			rawBody: '',
			duration,
			error: errorMessage,
			curlCommand
		};
	}
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
