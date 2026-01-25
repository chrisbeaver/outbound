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
	private formRequestCache: Map<string, ParsedValidation | null> = new Map();

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
				console.log(`[Parser] Controller file not found: ${controllerPath}`);
				return null;
			}

			const content = fs.readFileSync(controllerPath, 'utf-8');
			console.log(`[Parser] Reading controller: ${controllerPath}, method: ${methodName}`);

			// Find the method in the controller
			const methodContent = this.extractMethodContent(content, methodName);
			if (!methodContent) {
				console.log(`[Parser] Method ${methodName} not found in controller`);
				return null;
			}
			console.log(`[Parser] Found method ${methodName}, length: ${methodContent.length}`);

			// Check for Form Request injection
			const formRequestMatch = this.findFormRequestInjection(content, methodName);
			console.log(`[Parser] Form Request match: ${formRequestMatch}`);
			if (formRequestMatch) {
				const result = await this.parseFormRequest(formRequestMatch);
				console.log(`[Parser] Parsed Form Request result: ${result?.params?.length || 0} params`);
				return result;
			}

			// Check for inline validation ($request->validate(...) or Validator::make(...))
			const inlineValidation = this.parseInlineValidation(methodContent);
			if (inlineValidation) {
				console.log(`[Parser] Found inline validation: ${inlineValidation.params.length} params`);
				return inlineValidation;
			}

			console.log(`[Parser] No validation found for ${methodName}`);
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
		// Use [\s\S] instead of [^)]* to handle multiline parameters
		const methodRegex = new RegExp(
			`(?:public|protected|private)\\s+function\\s+${methodName}\\s*\\(([\\s\\S]*?)\\)\\s*(?::\\s*\\S+)?\\s*(?:\\/\\/[^\\n]*)?\\s*\\{`,
			'g'
		);

		const match = methodRegex.exec(classContent);
		if (!match) {
			// Try simpler regex as fallback
			const simpleRegex = new RegExp(
				`function\\s+${methodName}\\s*\\([^{]*\\{`,
				'g'
			);
			const simpleMatch = simpleRegex.exec(classContent);
			if (!simpleMatch) {
				return null;
			}
			
			// Find the matching closing brace
			const startIndex = simpleMatch.index + simpleMatch[0].length;
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

			return classContent.substring(simpleMatch.index, endIndex);
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
			console.log(`[Parser] Method ${methodName} not found in controller`);
			return null;
		}

		const params = match[1];
		console.log(`[Parser] Method ${methodName} params: ${params}`);
		
		// Look for Form Request type hints (anything ending in Request but not just "Request")
		const formRequestRegex = /(\w+Request)\s+\$\w+/g;
		const formRequestMatch = formRequestRegex.exec(params);

		if (formRequestMatch && formRequestMatch[1] !== 'Request') {
			console.log(`[Parser] Found Form Request: ${formRequestMatch[1]}`);
			return formRequestMatch[1];
		}

		console.log(`[Parser] No Form Request found in method ${methodName}`);
		return null;
	}

	/**
	 * Parse a Laravel Form Request class
	 */
	private async parseFormRequest(formRequestClass: string): Promise<ParsedValidation | null> {
		// Check cache first
		if (this.formRequestCache.has(formRequestClass)) {
			console.log(`[Parser] Using cached result for ${formRequestClass}`);
			return this.formRequestCache.get(formRequestClass) || null;
		}

		console.log(`[Parser] Looking for Form Request: ${formRequestClass}`);

		// Try to find the Form Request file - direct path first
		const directPath = path.join(this.workspacePath, `app/Http/Requests/${formRequestClass}.php`);
		
		if (fs.existsSync(directPath)) {
			console.log(`[Parser] Found at direct path: ${directPath}`);
			const content = fs.readFileSync(directPath, 'utf-8');
			const rules = this.extractRulesFromFormRequest(content);
			const result: ParsedValidation = {
				source: 'form-request',
				formRequestClass,
				formRequestPath: directPath,
				params: this.parseValidationRules(rules)
			};
			this.formRequestCache.set(formRequestClass, result);
			return result;
		}

		// Try glob search for the Form Request in subdirectories
		console.log(`[Parser] Searching with glob for ${formRequestClass}`);
		const files = await vscode.workspace.findFiles(
			`**/Http/Requests/**/${formRequestClass}.php`,
			'**/vendor/**'
		);

		console.log(`[Parser] Found ${files.length} files for ${formRequestClass}`);
		
		if (files.length > 0) {
			console.log(`[Parser] Using file: ${files[0].fsPath}`);
			const content = fs.readFileSync(files[0].fsPath, 'utf-8');
			const rules = this.extractRulesFromFormRequest(content);

			const result: ParsedValidation = {
				source: 'form-request',
				formRequestClass,
				formRequestPath: files[0].fsPath,
				params: this.parseValidationRules(rules)
			};
			this.formRequestCache.set(formRequestClass, result);
			return result;
		}

		console.log(`[Parser] Form Request ${formRequestClass} not found`);
		this.formRequestCache.set(formRequestClass, null);
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
		// Try to find the validation array using bracket matching for more accurate parsing
		const validationStarts = [
			/\$request->validate\s*\(\s*\[/,
			/\$this->validate\s*\(\s*\$request\s*,\s*\[/,
			/Validator::make\s*\([^[]*\[/,
			/request\(\)->validate\s*\(\s*\[/,
			/Request::validate\s*\(\s*\[/,
			/\$request->validateWithBag\s*\([^,]+,\s*\[/,
			/Validator::validate\s*\([^[]*\[/,
		];

		for (const startPattern of validationStarts) {
			const startMatch = startPattern.exec(methodContent);
			if (startMatch) {
				// Found a validation call, now extract the array using bracket matching
				const arrayStartIndex = startMatch.index + startMatch[0].length - 1; // Position of opening [
				const arrayContent = this.extractBracketedContent(methodContent, arrayStartIndex);
				
				if (arrayContent) {
					console.log(`[Parser] Found inline validation, array length: ${arrayContent.length}`);
					const rules = this.parseRulesArray(arrayContent);
					console.log(`[Parser] Parsed ${Object.keys(rules).length} rules: ${Object.keys(rules).join(', ')}`);
					
					if (Object.keys(rules).length > 0) {
						return {
							source: 'inline',
							params: this.parseValidationRules(rules)
						};
					}
				}
			}
		}

		return null;
	}

	/**
	 * Extract content between balanced brackets starting at a given position
	 */
	private extractBracketedContent(content: string, startIndex: number): string | null {
		if (content[startIndex] !== '[') {
			return null;
		}

		let bracketCount = 1;
		let index = startIndex + 1;

		while (bracketCount > 0 && index < content.length) {
			const char = content[index];
			if (char === '[') {
				bracketCount++;
			} else if (char === ']') {
				bracketCount--;
			}
			index++;
		}

		if (bracketCount === 0) {
			// Return content without the outer brackets
			return content.substring(startIndex + 1, index - 1);
		}

		return null;
	}

	/**
	 * Parse a PHP array string containing validation rules
	 */
	private parseRulesArray(arrayContent: string): Record<string, string[]> {
		const rules: Record<string, string[]> = {};
		
		// Match 'field' => 'rules' or 'field' => ['rule1', 'rule2'] or 'field' => [Rule::...]
		// We need to handle nested brackets for rules like Rule::in(['a', 'b'])
		const fieldPattern = /['"]([^'"]+)['"]\s*=>/g;
		let fieldMatch;

		while ((fieldMatch = fieldPattern.exec(arrayContent)) !== null) {
			const fieldName = fieldMatch[1];
			const valueStartIndex = fieldMatch.index + fieldMatch[0].length;
			
			// Skip whitespace
			let valueIndex = valueStartIndex;
			while (valueIndex < arrayContent.length && /\s/.test(arrayContent[valueIndex])) {
				valueIndex++;
			}

			if (valueIndex >= arrayContent.length) {
				continue;
			}

			const valueChar = arrayContent[valueIndex];
			let fieldRules: string[] = [];

			if (valueChar === '[') {
				// Array format: ['required', 'string'] or [Rule::in([...])]
				const bracketContent = this.extractBracketedContent(arrayContent, valueIndex);
				if (bracketContent) {
					fieldRules = this.parseRulesList(bracketContent);
				}
			} else if (valueChar === "'" || valueChar === '"') {
				// String format: 'required|string|max:255'
				const stringMatch = /^(['"])(.*?)\1/.exec(arrayContent.substring(valueIndex));
				if (stringMatch) {
					fieldRules = stringMatch[2].split('|').map(r => r.trim());
				}
			}

			if (fieldRules.length > 0) {
				rules[fieldName] = fieldRules;
			}
		}

		return rules;
	}

	/**
	 * Parse a comma-separated list of rules, handling nested brackets
	 */
	private parseRulesList(content: string): string[] {
		const rules: string[] = [];
		let current = '';
		let bracketDepth = 0;
		let parenDepth = 0;
		let inString = false;
		let stringChar = '';

		for (let i = 0; i < content.length; i++) {
			const char = content[i];

			if (inString) {
				current += char;
				if (char === stringChar && content[i - 1] !== '\\') {
					inString = false;
				}
			} else if (char === '"' || char === "'") {
				inString = true;
				stringChar = char;
				current += char;
			} else if (char === '[') {
				bracketDepth++;
				current += char;
			} else if (char === ']') {
				bracketDepth--;
				current += char;
			} else if (char === '(') {
				parenDepth++;
				current += char;
			} else if (char === ')') {
				parenDepth--;
				current += char;
			} else if (char === ',' && bracketDepth === 0 && parenDepth === 0) {
				const trimmed = current.trim().replace(/^['"]|['"]$/g, '');
				if (trimmed) {
					rules.push(trimmed);
				}
				current = '';
			} else {
				current += char;
			}
		}

		// Don't forget the last item
		const trimmed = current.trim().replace(/^['"]|['"]$/g, '');
		if (trimmed) {
			rules.push(trimmed);
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
	const queryParams: Array<{name: string, value: string}> = [];
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
				queryParams.push({name: param.name, value: ''});
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
