/**
 * Type definitions for API requests
 */

/**
 * Response from an API request
 */
export interface ApiResponse {
	/** Whether the request was successful */
	success: boolean;
	/** HTTP status code */
	statusCode: number;
	/** Response headers */
	headers: Record<string, string>;
	/** Response body (parsed JSON or raw string) */
	body: unknown;
	/** Raw response body as string */
	rawBody: string;
	/** Time taken for the request in milliseconds */
	duration: number;
	/** Error message if request failed */
	error?: string;
	/** The cURL command that was executed */
	curlCommand: string;
}

/**
 * Options for making an API request
 */
export interface RequestOptions {
	/** Override the default API host */
	host?: string;
	/** Additional headers to include */
	headers?: Record<string, string>;
	/** Override path parameters */
	pathParams?: Record<string, string>;
	/** Override query parameters */
	queryParams?: Record<string, string>;
	/** Override body parameters */
	bodyParams?: Record<string, unknown>;
	/** Request timeout in milliseconds */
	timeout?: number;
	/** Bearer token for authentication */
	bearerToken?: string;
}
