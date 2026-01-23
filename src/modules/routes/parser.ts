import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { 
	LaravelRoute, 
	RouteRequestParam, 
	ParsedValidation, 
	ParamType,
	RouteRequestConfig 
} from '../../types/routes';
import { getRouteStorage } from './manager';

/**
 * Parse Laravel validation rules and extract request parameters for routes
 */
export class RouteParser {
	private workspacePath: string;

	constructor(workspacePath: string) {
		this.workspacePath = workspacePath;
	}

	/**
	 * Parse all routes and extract their request parameters
	 */
	async parseAllRoutes(): Promise<LaravelRoute[]> {
		const routes = getRouteStorage().getAll();
		const parsedRoutes: LaravelRoute[] = [];

		for (const route of routes) {
			const parsedRoute = await this.parseRoute(route);
			parsedRoutes.push(parsedRoute);
		}

		return parsedRoutes;
	}

	/**
	 * Parse a single route and extract its request parameters
	 */
	async parseRoute(route: LaravelRoute): Promise<LaravelRoute> {
		const updatedRoute = { ...route };

		// Extract path parameters from URI
		const pathParams = this.extractPathParams(route.uri);

		// Parse controller method if available
		if (route.controller) {
			const controllerInfo = this.parseControllerString(route.controller);
			if (controllerInfo) {
				updatedRoute.controllerPath = controllerInfo.path;
				updatedRoute.controllerMethod = controllerInfo.method;

				// Try to find and parse validation
				const validation = await this.parseControllerValidation(
					controllerInfo.path,
					controllerInfo.method
				);

				if (validation) {
					updatedRoute.requestParams = [...pathParams, ...validation.params];
					updatedRoute.formRequestClass = validation.formRequestClass;
				} else {
					updatedRoute.requestParams = pathParams;
				}
			}
		} else {
			updatedRoute.requestParams = pathParams;
		}

		return updatedRoute;
	}

	/**
	 * Extract path parameters from a route URI (e.g., {id}, {user})
	 */
	private extractPathParams(uri: string): RouteRequestParam[] {
		const params: RouteRequestParam[] = [];
		const regex = /\{(\w+)\??}/g;
		let match;

		while ((match = regex.exec(uri)) !== null) {
			const paramName = match[1];
			const isOptional = match[0].includes('?');

			params.push({
				name: paramName,
				type: 'string',
				required: !isOptional,
				rules: [],
				isPathParam: true,
				description: `Path parameter: ${paramName}`
			});
		}

		return params;
	}

	/**
	 * Parse a controller string like "App\Http\Controllers\UserController@index"
	 */
	private parseControllerString(controllerString: string): { path: string; method: string } | null {
		// Handle invokable controllers (no @ method)
		const atIndex = controllerString.lastIndexOf('@');
		
		let className: string;
		let method: string;

		if (atIndex === -1) {
			className = controllerString;
			method = '__invoke';
		} else {
			className = controllerString.substring(0, atIndex);
			method = controllerString.substring(atIndex + 1);
		}

		// Convert namespace to file path
		// App\Http\Controllers\UserController -> app/Http/Controllers/UserController.php
		const relativePath = className
			.replace(/\\/g, '/')
			.replace(/^App\//, 'app/')
			+ '.php';

		const fullPath = path.join(this.workspacePath, relativePath);

		return { path: fullPath, method };
	}

	/**
	 * Parse validation from a controller method
	 */
	async parseControllerValidation(
		controllerPath: string,
		methodName: string
	): Promise<ParsedValidation | null> {
		try {
			if (!fs.existsSync(controllerPath)) {
				return null;
			}

			const content = fs.readFileSync(controllerPath, 'utf-8');

			// Find the method in the controller
			const methodContent = this.extractMethodContent(content, methodName);
			if (!methodContent) {
				return null;
			}

			// Check for Form Request injection
			const formRequestMatch = this.findFormRequestInjection(content, methodName);
			if (formRequestMatch) {
				return await this.parseFormRequest(formRequestMatch);
			}

			// Check for inline validation ($request->validate(...) or Validator::make(...))
			const inlineValidation = this.parseInlineValidation(methodContent);
			if (inlineValidation) {
				return inlineValidation;
			}

			return null;
		} catch (error) {
			console.error(`Error parsing controller ${controllerPath}:`, error);
			return null;
		}
	}

	/**
	 * Extract the content of a specific method from a PHP class
	 */
	private extractMethodContent(classContent: string, methodName: string): string | null {
		// Match public/protected/private function methodName(...) { ... }
		const methodRegex = new RegExp(
			`(?:public|protected|private)\\s+function\\s+${methodName}\\s*\\([^)]*\\)\\s*(?::\\s*\\S+)?\\s*\\{`,
			'g'
		);

		const match = methodRegex.exec(classContent);
		if (!match) {
			return null;
		}

		// Find the matching closing brace
		const startIndex = match.index + match[0].length;
		let braceCount = 1;
		let endIndex = startIndex;

		while (braceCount > 0 && endIndex < classContent.length) {
			const char = classContent[endIndex];
			if (char === '{') {
				braceCount++;
			} else if (char === '}') {
				braceCount--;
			}
			endIndex++;
		}

		return classContent.substring(match.index, endIndex);
	}

	/**
	 * Find Form Request injection in method parameters
	 */
	private findFormRequestInjection(classContent: string, methodName: string): string | null {
		// Match method signature with type-hinted Request parameter
		const methodRegex = new RegExp(
			`function\\s+${methodName}\\s*\\(([^)]*)\\)`,
			'g'
		);

		const match = methodRegex.exec(classContent);
		if (!match) {
			return null;
		}

		const params = match[1];
		
		// Look for Form Request type hints (anything ending in Request but not just "Request")
		const formRequestRegex = /(\w+Request)\s+\$\w+/g;
		const formRequestMatch = formRequestRegex.exec(params);

		if (formRequestMatch && formRequestMatch[1] !== 'Request') {
			return formRequestMatch[1];
		}

		return null;
	}

	/**
	 * Parse a Laravel Form Request class
	 */
	private async parseFormRequest(formRequestClass: string): Promise<ParsedValidation | null> {
		// Try to find the Form Request file
		const possiblePaths = [
			`app/Http/Requests/${formRequestClass}.php`,
			`app/Http/Requests/**/${formRequestClass}.php`
		];

		for (const relativePath of possiblePaths) {
			const fullPath = path.join(this.workspacePath, relativePath);
			
			if (fs.existsSync(fullPath)) {
				const content = fs.readFileSync(fullPath, 'utf-8');
				const rules = this.extractRulesFromFormRequest(content);

				return {
					source: 'form-request',
					formRequestClass,
					formRequestPath: fullPath,
					params: this.parseValidationRules(rules)
				};
			}
		}

		// Try glob search for the Form Request
		const files = await vscode.workspace.findFiles(
			`**/Http/Requests/**/${formRequestClass}.php`,
			'**/vendor/**'
		);

		if (files.length > 0) {
			const content = fs.readFileSync(files[0].fsPath, 'utf-8');
			const rules = this.extractRulesFromFormRequest(content);

			return {
				source: 'form-request',
				formRequestClass,
				formRequestPath: files[0].fsPath,
				params: this.parseValidationRules(rules)
			};
		}

		return null;
	}

	/**
	 * Extract validation rules from a Form Request class
	 */
	private extractRulesFromFormRequest(content: string): Record<string, string[]> {
		const rules: Record<string, string[]> = {};

		// Find the rules() method
		const rulesMethod = this.extractMethodContent(content, 'rules');
		if (!rulesMethod) {
			return rules;
		}

		// Extract the return array
		const returnMatch = /return\s*\[([\s\S]*?)\];/m.exec(rulesMethod);
		if (!returnMatch) {
			return rules;
		}

		const rulesArray = returnMatch[1];
		return this.parseRulesArray(rulesArray);
	}

	/**
	 * Parse inline validation from controller method
	 */
	private parseInlineValidation(methodContent: string): ParsedValidation | null {
		// Match $request->validate([...]) or Validator::make($request->all(), [...])
		const validatePatterns = [
			/\$request->validate\s*\(\s*\[([\s\S]*?)\]\s*\)/,
			/\$this->validate\s*\(\s*\$request\s*,\s*\[([\s\S]*?)\]\s*\)/,
			/Validator::make\s*\([^,]+,\s*\[([\s\S]*?)\]\s*\)/,
			/request\(\)->validate\s*\(\s*\[([\s\S]*?)\]\s*\)/
		];

		for (const pattern of validatePatterns) {
			const match = pattern.exec(methodContent);
			if (match) {
				const rules = this.parseRulesArray(match[1]);
				return {
					source: 'inline',
					params: this.parseValidationRules(rules)
				};
			}
		}

		return null;
	}

	/**
	 * Parse a PHP array string containing validation rules
	 */
	private parseRulesArray(arrayContent: string): Record<string, string[]> {
		const rules: Record<string, string[]> = {};
		
		// Match 'field' => 'rules' or 'field' => ['rule1', 'rule2']
		const rulePattern = /['"]([^'"]+)['"]\s*=>\s*(?:\[([^\]]*)\]|['"]([^'"]*?)['"])/g;
		let match;

		while ((match = rulePattern.exec(arrayContent)) !== null) {
			const fieldName = match[1];
			const arrayRules = match[2];
			const stringRules = match[3];

			if (arrayRules) {
				// Parse array format ['required', 'string', 'max:255']
				const rulesList = arrayRules
					.split(',')
					.map(r => r.trim().replace(/['"]/g, ''))
					.filter(r => r.length > 0);
				rules[fieldName] = rulesList;
			} else if (stringRules) {
				// Parse pipe-separated format 'required|string|max:255'
				rules[fieldName] = stringRules.split('|').map(r => r.trim());
			}
		}

		return rules;
	}

	/**
	 * Convert Laravel validation rules to RouteRequestParam objects
	 */
	private parseValidationRules(rules: Record<string, string[]>): RouteRequestParam[] {
		const params: RouteRequestParam[] = [];

		for (const [fieldName, fieldRules] of Object.entries(rules)) {
			// Handle nested fields (e.g., 'items.*.name')
			if (fieldName.includes('.')) {
				this.addNestedParam(params, fieldName, fieldRules);
			} else {
				params.push(this.createParam(fieldName, fieldRules));
			}
		}

		return params;
	}

	/**
	 * Create a RouteRequestParam from field name and rules
	 */
	private createParam(name: string, rules: string[]): RouteRequestParam {
		return {
			name,
			type: this.inferTypeFromRules(rules),
			required: rules.includes('required'),
			rules,
			isPathParam: false,
			enumValues: this.extractEnumValues(rules),
			description: this.generateDescription(name, rules)
		};
	}

	/**
	 * Add a nested parameter (handles dot notation like 'items.*.name')
	 */
	private addNestedParam(params: RouteRequestParam[], fieldPath: string, rules: string[]): void {
		const parts = fieldPath.split('.');
		const rootName = parts[0];

		// Find or create root param
		let rootParam = params.find(p => p.name === rootName);
		if (!rootParam) {
			rootParam = {
				name: rootName,
				type: 'array',
				required: false,
				rules: [],
				isPathParam: false,
				children: []
			};
			params.push(rootParam);
		}

		if (!rootParam.children) {
			rootParam.children = [];
		}

		// Handle wildcard array notation (items.*.field)
		if (parts[1] === '*') {
			const childName = parts.slice(2).join('.');
			if (childName) {
				const existingChild = rootParam.children.find(c => c.name === childName);
				if (!existingChild) {
					rootParam.children.push(this.createParam(childName, rules));
				}
			}
		} else {
			// Handle nested object notation (user.name)
			rootParam.type = 'object';
			const childName = parts.slice(1).join('.');
			const existingChild = rootParam.children.find(c => c.name === childName);
			if (!existingChild) {
				rootParam.children.push(this.createParam(childName, rules));
			}
		}
	}

	/**
	 * Infer parameter type from Laravel validation rules
	 */
	private inferTypeFromRules(rules: string[]): ParamType {
		const ruleSet = new Set(rules.map(r => r.split(':')[0].toLowerCase()));

		if (ruleSet.has('integer') || ruleSet.has('numeric') && ruleSet.has('integer')) {
			return 'integer';
		}
		if (ruleSet.has('numeric') || ruleSet.has('decimal')) {
			return 'number';
		}
		if (ruleSet.has('boolean') || ruleSet.has('bool')) {
			return 'boolean';
		}
		if (ruleSet.has('array')) {
			return 'array';
		}
		if (ruleSet.has('file') || ruleSet.has('image') || ruleSet.has('mimes') || ruleSet.has('mimetypes')) {
			return 'file';
		}
		if (ruleSet.has('date') || ruleSet.has('date_format') || ruleSet.has('after') || ruleSet.has('before')) {
			return 'date';
		}
		if (ruleSet.has('email')) {
			return 'email';
		}
		if (ruleSet.has('url') || ruleSet.has('active_url')) {
			return 'url';
		}
		if (ruleSet.has('uuid')) {
			return 'uuid';
		}
		if (ruleSet.has('json')) {
			return 'object';
		}

		return 'string';
	}

	/**
	 * Extract enum values from 'in:' rule
	 */
	private extractEnumValues(rules: string[]): string[] | undefined {
		const inRule = rules.find(r => r.startsWith('in:'));
		if (inRule) {
			return inRule.substring(3).split(',').map(v => v.trim());
		}
		return undefined;
	}

	/**
	 * Generate a description from field name and rules
	 */
	private generateDescription(name: string, rules: string[]): string {
		const parts: string[] = [];
		
		// Add type info
		const type = this.inferTypeFromRules(rules);
		parts.push(`Type: ${type}`);

		// Add constraints
		for (const rule of rules) {
			if (rule.startsWith('max:')) {
				parts.push(`Max: ${rule.substring(4)}`);
			} else if (rule.startsWith('min:')) {
				parts.push(`Min: ${rule.substring(4)}`);
			} else if (rule.startsWith('size:')) {
				parts.push(`Size: ${rule.substring(5)}`);
			} else if (rule.startsWith('in:')) {
				parts.push(`Allowed: ${rule.substring(3)}`);
			}
		}

		return parts.join(', ');
	}
}

/**
 * Generate a request configuration for a route
 */
export function generateRequestConfig(
	route: LaravelRoute,
	baseUrl: string,
	pathParamValues: Record<string, string> = {}
): RouteRequestConfig {
	// Build URL with path parameters
	let url = `${baseUrl.replace(/\/$/, '')}/${route.uri.replace(/^\//, '')}`;
	
	// Replace path parameters
	const pathParams: Record<string, string> = {};
	const pathParamRegex = /\{(\w+)\??}/g;
	let match;

	while ((match = pathParamRegex.exec(route.uri)) !== null) {
		const paramName = match[1];
		const value = pathParamValues[paramName] || `{${paramName}}`;
		pathParams[paramName] = value;
		url = url.replace(match[0], value);
	}

	// Separate body and query params
	const queryParams: Record<string, string> = {};
	const bodyParams: Record<string, unknown> = {};

	// Determine content type
	let contentType: RouteRequestConfig['contentType'] = 'application/json';
	
	if (route.requestParams) {
		const hasFileParam = route.requestParams.some(p => p.type === 'file');
		if (hasFileParam) {
			contentType = 'multipart/form-data';
		}

		// For GET requests, params go in query string
		// For other methods, params go in body
		const method = route.method.split('|')[0].toUpperCase();
		
		for (const param of route.requestParams) {
			if (param.isPathParam) {
				continue; // Already handled
			}

			if (method === 'GET' || method === 'HEAD') {
				queryParams[param.name] = '';
			} else {
				bodyParams[param.name] = getDefaultValueForType(param.type);
			}
		}
	}

	return {
		route,
		url,
		method: route.method.split('|')[0].toUpperCase(),
		headers: {
			'Accept': 'application/json',
			'Content-Type': contentType
		},
		queryParams,
		bodyParams,
		pathParams,
		contentType
	};
}

/**
 * Get a sensible default value for a parameter type
 */
function getDefaultValueForType(type: ParamType): unknown {
	switch (type) {
		case 'integer':
			return 0;
		case 'number':
			return 0.0;
		case 'boolean':
			return false;
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
			return '00000000-0000-0000-0000-000000000000';
		case 'file':
			return null;
		default:
			return '';
	}
}

/**
 * Create a RouteParser instance for the current workspace
 */
export function createRouteParser(): RouteParser | null {
	const workspaceFolders = vscode.workspace.workspaceFolders;
	if (!workspaceFolders || workspaceFolders.length === 0) {
		return null;
	}

	return new RouteParser(workspaceFolders[0].uri.fsPath);
}
