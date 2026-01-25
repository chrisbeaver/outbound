// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import * as path from 'path';
import { identifyLaravelRoutes, getRouteStorage } from './modules/routes/manager';
import { RoutesPanel } from './modules/routes/panel';
import { createRouteParser } from './modules/routes/parser';
import type { LaravelRoute } from './types/routes';

// Re-export for external access
export { getRouteStorage };

let outputChannel: vscode.OutputChannel;

// This method is called when your extension is activated
// Your extension is activated the very first time the command is executed
export async function activate(context: vscode.ExtensionContext) {

	// Use the console to output diagnostic information (console.log) and errors (console.error)
	// This line of code will only be executed once when your extension is activated
	console.log('Congratulations, your extension "lapi" is now active!');

	// Create output channel for displaying routes
	outputChannel = vscode.window.createOutputChannel('Lapi');
	context.subscriptions.push(outputChannel);

	// Identify Laravel routes on activation
	await identifyLaravelRoutes(outputChannel);

	// Parse routes to extract validation rules and request parameters
	await parseRouteValidation(outputChannel);

	// Watch for PHP file saves and refresh routes
	const phpFileWatcher = vscode.workspace.onDidSaveTextDocument(async (document) => {
		if (document.languageId === 'php' || document.fileName.endsWith('.php')) {
			console.log('[Lapi] PHP file saved, refreshing routes...');
			await refreshRoutes();
		}
	});
	context.subscriptions.push(phpFileWatcher);

	// Register Display Routes Table command
	const displayRoutesCommand = vscode.commands.registerCommand('lapi.displayRoutesTable', () => {
		RoutesPanel.createOrShow(context.extensionUri, outputChannel, context);
	});
	context.subscriptions.push(displayRoutesCommand);

	// Register Test Endpoint command (from Command Palette - just opens routes table)
	const testEndpointCommand = vscode.commands.registerCommand('lapi.testEndpoint', async () => {
		RoutesPanel.createOrShow(context.extensionUri, outputChannel, context);
	});
	context.subscriptions.push(testEndpointCommand);

	// Register Test Endpoint From Context (from right-click - finds route and opens modal)
	const testEndpointFromContextCommand = vscode.commands.registerCommand('lapi.testEndpointFromContext', async () => {
		vscode.window.showInformationMessage('Lapi: Test Endpoint triggered');
		console.log('[Lapi] Test Endpoint command invoked from context menu');
		if (outputChannel) {
			outputChannel.appendLine('[Lapi] Test Endpoint command invoked from context menu');
			outputChannel.show(true);
		}
		
		const editor = vscode.window.activeTextEditor;
		if (!editor) {
			RoutesPanel.createOrShow(context.extensionUri, outputChannel, context);
			return;
		}

		const document = editor.document;
		
		if (!document.fileName.endsWith('.php')) {
			RoutesPanel.createOrShow(context.extensionUri, outputChannel, context);
			return;
		}
		
		const position = editor.selection.active;

		let route: LaravelRoute | null = null;
		console.log('[Lapi] Finding route at cursor position');
		if (outputChannel) outputChannel.appendLine('[Lapi] Finding route at cursor position');
		try {
			// Find the route that matches the current file and cursor position
			route = findRouteAtPosition(document, position);
		} catch (err) {
			if (outputChannel) {
				outputChannel.appendLine(`[Lapi] Error while finding route: ${err}`);
				outputChannel.show(true);
			}
			console.error('[Lapi] Error while finding route:', err);
			vscode.window.showErrorMessage('Error finding route. See Lapi output for details.');
			return;
		}

		if (!route) {
			// Try to present a quick pick of candidate routes for this file
			const storage = getRouteStorage();
			const allRoutes = storage.getAll();
			const filePath = document.uri.fsPath.replace(/\\/g, '/');
			const fileName = path.basename(filePath, '.php');
			const candidates = allRoutes.filter(r => {
				if (r.controllerPath) {
					const normalized = r.controllerPath.replace(/\\/g, '/');
					if (normalized === filePath || normalized.endsWith('/' + fileName + '.php')) return true;
				}
				if (r.controller && r.controller.includes(fileName)) return true;
				return false;
			});

			if (candidates.length === 0) {
				vscode.window.showWarningMessage('No route found for the current position. Make sure you are inside a controller method that is registered as a route.');
				return;
			}

			const items = candidates.map(c => ({ label: `${c.method.split('|')[0].toUpperCase()} ${c.uri}`, route: c }));
			const pick = await vscode.window.showQuickPick(items, { placeHolder: 'Select route to test' });
			if (!pick) return;
			route = pick.route;
		}

		// Open the routes panel with this specific route
		RoutesPanel.createOrShowWithRoute(context.extensionUri, outputChannel, context, route);
	});
	context.subscriptions.push(testEndpointFromContextCommand);
}

/**
 * Find a route that matches the current file and cursor position
 */
function findRouteAtPosition(document: vscode.TextDocument, position: vscode.Position): LaravelRoute | null {
	const filePath = document.uri.fsPath;
	
	// Check if this is a PHP file
	if (!filePath.endsWith('.php')) {
		if (outputChannel) {
			outputChannel.appendLine(`[Lapi] Not a PHP file: ${filePath}`);
			outputChannel.show(true);
		}
		return null;
	}

	const storage = getRouteStorage();
	const routes = storage.getAll();

	if (outputChannel) {
		outputChannel.appendLine(`[Lapi] Looking for route in file: ${filePath}`);
		outputChannel.appendLine(`[Lapi] Total routes loaded: ${routes.length}`);
		outputChannel.show(true);
	}

	// Normalize the file path for comparison (lowercase for case-insensitive matching)
	const normalizedFilePath = filePath.replace(/\\/g, '/').toLowerCase();

	// Find routes that match this controller file
	const matchingRoutes = routes.filter(route => {
		if (!route.controllerPath) {
			return false;
		}
		const normalizedControllerPath = route.controllerPath.replace(/\\/g, '/').toLowerCase();
		const matches = normalizedFilePath === normalizedControllerPath || 
			normalizedFilePath.endsWith(normalizedControllerPath) ||
			normalizedControllerPath.endsWith(normalizedFilePath.split('/').slice(-4).join('/'));
		
		if (route.controllerPath && outputChannel) {
			outputChannel.appendLine(`[Lapi] Comparing: ${normalizedFilePath} vs ${normalizedControllerPath} = ${matches}`);
			outputChannel.show(true);
		}
		return matches;
	});

	if (outputChannel) {
		outputChannel.appendLine(`[Lapi] Matching routes for file: ${matchingRoutes.length}`);
		outputChannel.show(true);
	}

	if (matchingRoutes.length === 0) {
		// Try matching by fully-qualified class name from the file content (namespace + class)
		const documentText = document.getText();
		const namespaceMatch = documentText.match(/namespace\s+([^;]+);/);
		const classMatch = documentText.match(/class\s+(\w+)/);
		if (namespaceMatch && classMatch) {
			const namespace = namespaceMatch[1].trim();
			const className = classMatch[1];
			const fqcn = `${namespace}\\${className}`;
			if (outputChannel) {
				outputChannel.appendLine(`[Lapi] Trying FQCN match: ${fqcn}`);
			}

			const routesByFqcn = routes.filter(route => {
				if (!route.controller) return false;
				// route.controller contains strings like App\\Http\\Controllers\\MyController@method
				return route.controller.startsWith(fqcn) || route.controller.includes(className);
			});

			if (outputChannel) {
				outputChannel.appendLine(`[Lapi] Routes matching FQCN/class: ${routesByFqcn.length}`);
				outputChannel.show(true);
			}

			if (routesByFqcn.length > 0) {
				return findRouteByMethod(documentText, document.offsetAt(position), routesByFqcn);
			}
		}

		// As a last resort, try matching any route whose controller contains the file name (class name)
		const fileName = path.basename(filePath, '.php');
		const routesByFileName = routes.filter(route => route.controller && route.controller.includes(fileName));
		if (routesByFileName.length > 0) {
			if (outputChannel) {
				outputChannel.appendLine(`[Lapi] Routes matching by file name: ${routesByFileName.length}`);
				outputChannel.show(true);
			}
			return findRouteByMethod(documentText, document.offsetAt(position), routesByFileName);
		}

		return null;
	}

	return findRouteByMethod(document.getText(), document.offsetAt(position), matchingRoutes);
}

/**
 * Find which route matches the cursor position based on method
 */
function findRouteByMethod(documentText: string, cursorOffset: number, routes: LaravelRoute[]): LaravelRoute | null {
	// Find the method that contains the cursor
	for (const route of routes) {
		if (!route.controllerMethod) {
			continue;
		}

		const methodRange = findMethodRange(documentText, route.controllerMethod);
		if (outputChannel) {
			outputChannel.appendLine(`[Lapi] Method range for ${route.controllerMethod}: ${methodRange ? JSON.stringify(methodRange) : 'null'} cursor at: ${cursorOffset}`);
			outputChannel.show(true);
		}

		if (methodRange && cursorOffset >= methodRange.start && cursorOffset <= methodRange.end) {
			if (outputChannel) {
				outputChannel.appendLine(`[Lapi] Found matching route: ${route.method} ${route.uri}`);
				outputChannel.show(true);
			}
			return route;
		}
	}

	// Fallback: try matching by controller method name across all routes
	for (const route of getRouteStorage().getAll()) {
		if (route.controllerMethod && route.controllerMethod === routes[0]?.controllerMethod) {
			if (outputChannel) {
				outputChannel.appendLine(`[Lapi] Fallback matched route by method name: ${route.method} ${route.uri}`);
				outputChannel.show(true);
			}
			return route;
		}
	}

	if (outputChannel) {
		outputChannel.appendLine('[Lapi] No method matched cursor position');
		outputChannel.show(true);
	}
	return null;
}

/**
 * Find the start and end offset of a method in PHP code
 */
function findMethodRange(content: string, methodName: string): { start: number; end: number } | null {
	// Try several regex patterns to locate the function declaration, to handle
	// attributes, different visibility modifiers, return types and newlines.
	const patterns = [
		// typical: public function name(...) { or protected/private
		`(?:public|protected|private|static|final|abstract)\\s+function\\s+${methodName}\\s*\\([^)]*\\)\\s*(?::\\s*[^\\{]+)?\\s*\\{`,
		// fallback without visibility (in case attributes or other tokens precede)
		`function\\s+${methodName}\\s*\\([^)]*\\)\\s*(?::\\s*[^\\{]+)?\\s*\\{`,
		// very permissive: match function and then first opening brace
		`function\\s+${methodName}\\s*\\([^)]*\\)[\\s\\S]*?\\{`
	];

	let match: RegExpExecArray | null = null;
	for (const pat of patterns) {
		const re = new RegExp(pat, 'g');
		match = re.exec(content);
		if (match) break;
	}

	if (!match) return null;

	const methodStart = match.index;
	const braceStart = methodStart + match[0].length - 1;

	// Find the matching closing brace taking nesting into account
	let braceCount = 1;
	let i = braceStart + 1;
	while (i < content.length && braceCount > 0) {
		const char = content[i];
		if (char === '{') braceCount++;
		else if (char === '}') braceCount--;
		i++;
	}

	return { start: methodStart, end: i };
}

/**
 * Parse all loaded routes to extract validation rules and request parameters
 */
async function parseRouteValidation(outputChannel: vscode.OutputChannel): Promise<void> {
	const parser = createRouteParser();
	if (!parser) {
		outputChannel.appendLine('No parser available (no workspace folder?)');
		return;
	}

	const storage = getRouteStorage();
	const routes = storage.getAll();

	if (routes.length === 0) {
		outputChannel.appendLine('No routes to parse');
		return;
	}

	outputChannel.appendLine('');
	outputChannel.appendLine('=== Parsing Route Validation ===');
	outputChannel.appendLine(`Total routes to parse: ${routes.length}`);
	outputChannel.appendLine('');

	let parsedCount = 0;

	for (const route of routes) {
		try {
			outputChannel.appendLine(`Parsing: ${route.method} ${route.uri} (${route.controller || 'Closure'})`);
			const parsedRoute = await parser.parseRoute(route);

			// Update the route in storage with parsed information
			storage.add(parsedRoute);

			const paramCount = parsedRoute.requestParams?.length || 0;
			outputChannel.appendLine(`  → Found ${paramCount} params`);

			if (paramCount > 0) {
				parsedCount++;
				for (const param of parsedRoute.requestParams!) {
					outputChannel.appendLine(`    - ${param.name} (${param.type}) ${param.isPathParam ? '[path]' : ''}`);
				}
			}
		} catch (error) {
			outputChannel.appendLine(`  → Error: ${error}`);
			console.error(`Error parsing route ${route.uri}:`, error);
		}
	}

	outputChannel.appendLine('');
	outputChannel.appendLine(`Parsed ${parsedCount} routes with request parameters`);
}

/**
 * Refresh routes by re-running artisan route:list and parsing validation
 */
async function refreshRoutes(): Promise<void> {
	if (!outputChannel) {
		return;
	}

	try {
		// Re-identify routes from artisan
		await identifyLaravelRoutes(outputChannel);

		// Re-parse validation rules
		await parseRouteValidation(outputChannel);

		console.log('[Lapi] Routes refreshed successfully');
	} catch (error) {
		console.error('[Lapi] Error refreshing routes:', error);
	}
}

// This method is called when your extension is deactivated
export function deactivate() { }
