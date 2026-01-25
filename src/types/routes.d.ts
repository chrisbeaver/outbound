/**
 * Type definitions for Laravel routes
 */

/**
 * Interface for a Laravel route
 */
export interface LaravelRoute {
	method: string;
	uri: string;
	name: string | null;
	action: string;
	controller: string | null;
	middleware: string[];
	/** Parsed request parameters from validators */
	requestParams?: RouteRequestParam[];
	/** The Form Request class if one is injected */
	formRequestClass?: string;
	/** Path to the controller file */
	controllerPath?: string;
	/** The method name in the controller */
	controllerMethod?: string;
}

/**
 * Parameter types inferred from Laravel validation rules
 */
export type ParamType = 'string' | 'integer' | 'number' | 'boolean' | 'array' | 'object' | 'file' | 'date' | 'email' | 'url' | 'uuid';

/**
 * Interface for a route request parameter
 */
export interface RouteRequestParam {
	/** Parameter name */
	name: string;
	/** Inferred type from validation rules */
	type: ParamType;
	/** Whether the parameter is required */
	required: boolean;
	/** Original Laravel validation rules */
	rules: string[];
	/** Whether this is a URL path parameter */
	isPathParam: boolean;
	/** Description extracted from comments or inferred */
	description?: string;
	/** Default value if specified */
	defaultValue?: string | number | boolean | null;
	/** Nested parameters for array/object types */
	children?: RouteRequestParam[];
	/** Enum values if validation includes 'in:' rule */
	enumValues?: string[];
}

/**
 * Parsed validation rules from a Laravel controller or Form Request
 */
export interface ParsedValidation {
	/** The source of the validation (inline, FormRequest class name) */
	source: 'inline' | 'form-request';
	/** Form Request class name if applicable */
	formRequestClass?: string;
	/** Path to the Form Request file */
	formRequestPath?: string;
	/** Extracted parameters */
	params: RouteRequestParam[];
}

/**
 * Request configuration for making HTTP requests to a route
 */
export interface RouteRequestConfig {
	/** The route this config is for */
	route: LaravelRoute;
	/** Full URL with path parameters replaced */
	url: string;
	/** HTTP method */
	method: string;
	/** Headers to include */
	headers: Record<string, string>;
	/** Query parameters (array format to support duplicate keys) */
	queryParams: Array<{name: string, value: string}>;
	/** Request body parameters */
	bodyParams: Record<string, unknown>;
	/** Path parameters */
	pathParams: Record<string, string>;
	/** Content type for the request */
	contentType: 'application/json' | 'multipart/form-data' | 'application/x-www-form-urlencoded';
}
