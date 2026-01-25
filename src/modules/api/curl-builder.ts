/**
 * cURL Command Builder
 * Generates cURL commands from request parameters
 */

export interface CurlRequestParams {
	/** HTTP method (GET, POST, PUT, etc.) */
	method: string;
	/** Full URL including host */
	url: string;
	/** Request body parameters (for non-GET requests) */
	bodyParams?: Record<string, unknown>;
	/** Query string parameters */
	queryParams?: Array<{name: string, value: string, enabled?: boolean}>;
	/** Bearer token for authorization */
	bearerToken?: string;
	/** Content type */
	contentType?: 'application/json' | 'application/x-www-form-urlencoded' | 'multipart/form-data';
	/** Custom headers */
	headers?: Record<string, string>;
	/** List of disabled parameter names to exclude */
	disabledParams?: string[];
}

/**
 * Escape a string for use in a shell single-quoted string
 * Single quotes in shell can't be escaped inside single quotes,
 * so we end the string, add an escaped quote, and start again
 */
function escapeShellArg(str: string): string {
	return str.replace(/'/g, "'\\''");
}

/**
 * Build a cURL command from request parameters
 * @param params - Request parameters
 * @returns Formatted cURL command string
 */
export function buildCurlCommand(params: CurlRequestParams): string {
	const {
		method,
		url,
		bodyParams = {},
		queryParams = [],
		bearerToken,
		contentType = 'application/json',
		headers = {},
		disabledParams = []
	} = params;

	const parts: string[] = ['curl'];

	// Add method (skip for GET as it's the default)
	// Handle combined methods like "GET|HEAD" by using only the first one
	const httpMethod = method.split('|')[0].toUpperCase();
	if (httpMethod !== 'GET') {
		parts.push(`-X ${httpMethod}`);
	}

	// Add Accept header
	parts.push(`-H 'Accept: application/json'`);

	// Add Content-Type header for requests with body
	if (httpMethod !== 'GET' && httpMethod !== 'HEAD' && Object.keys(bodyParams).length > 0) {
		if (contentType !== 'multipart/form-data') {
			// multipart/form-data header is auto-set by curl with -F
			parts.push(`-H 'Content-Type: ${contentType}'`);
		}
	}

	// Add custom headers
	for (const [key, value] of Object.entries(headers)) {
		if (key.toLowerCase() !== 'content-type' && key.toLowerCase() !== 'accept') {
			parts.push(`-H '${escapeShellArg(key)}: ${escapeShellArg(value)}'`);
		}
	}

	// Add bearer token if provided
	if (bearerToken) {
		parts.push(`-H 'Authorization: Bearer ${escapeShellArg(bearerToken)}'`);
	}

	// Filter body params to exclude disabled ones
	const activeBodyParams: Record<string, unknown> = {};
	for (const [key, value] of Object.entries(bodyParams)) {
		if (!disabledParams.includes(key)) {
			activeBodyParams[key] = value;
		}
	}

	// Add body for non-GET/HEAD requests
	if (httpMethod !== 'GET' && httpMethod !== 'HEAD' && Object.keys(activeBodyParams).length > 0) {
		if (contentType === 'application/json') {
			const body = JSON.stringify(activeBodyParams);
			parts.push(`-d '${escapeShellArg(body)}'`);
		} else if (contentType === 'application/x-www-form-urlencoded') {
			const formData = Object.entries(activeBodyParams)
				.map(([key, value]) => `${encodeURIComponent(key)}=${encodeURIComponent(String(value))}`)
				.join('&');
			parts.push(`-d '${escapeShellArg(formData)}'`);
		} else if (contentType === 'multipart/form-data') {
			for (const [key, value] of Object.entries(activeBodyParams)) {
				if (value !== null && value !== undefined) {
					if (typeof value === 'object') {
						parts.push(`-F '${escapeShellArg(key)}=${escapeShellArg(JSON.stringify(value))}'`);
					} else {
						parts.push(`-F '${escapeShellArg(key)}=${escapeShellArg(String(value))}'`);
					}
				}
			}
		}
	}

	// Build URL with query parameters (only enabled ones)
	let finalUrl = url;
	const activeQueryParams = queryParams.filter(p => p.enabled !== false && p.name.trim() && p.value.trim());
	
	if (activeQueryParams.length > 0) {
		const queryString = activeQueryParams
			.map(({name, value}) => `${encodeURIComponent(name)}=${encodeURIComponent(value)}`)
			.join('&');
		finalUrl += (url.includes('?') ? '&' : '?') + queryString;
	}

	// Add URL (quoted)
	parts.push(`'${escapeShellArg(finalUrl)}'`);

	return parts.join(' \\\n  ');
}

/**
 * Build a cURL command formatted for single-line copying
 * @param params - Request parameters
 * @returns Single-line cURL command string
 */
export function buildCurlCommandSingleLine(params: CurlRequestParams): string {
	return buildCurlCommand(params).replace(/ \\\n  /g, ' ');
}
