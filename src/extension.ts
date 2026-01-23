// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let outputChannel: vscode.OutputChannel;

// Interface for a Laravel route
interface LaravelRoute {
	method: string;
	uri: string;
	name: string | null;
	action: string;
	controller: string | null;
	middleware: string[];
}

// In-memory storage for routes
class RouteStorage {
	private routes: Map<string, LaravelRoute> = new Map();

	/**
	 * Clear all stored routes
	 */
	clear(): void {
		this.routes.clear();
	}

	/**
	 * Add a route to storage
	 * Key is the method + uri combination (e.g., "GET /api/users")
	 */
	add(route: LaravelRoute): void {
		const key = `${route.method} ${route.uri}`;
		this.routes.set(key, route);
	}

	/**
	 * Get a route by method and path
	 */
	get(method: string, uri: string): LaravelRoute | undefined {
		return this.routes.get(`${method} ${uri}`);
	}

	/**
	 * Get all routes
	 */
	getAll(): LaravelRoute[] {
		return Array.from(this.routes.values());
	}

	/**
	 * Get all routes for a specific controller
	 */
	getByController(controller: string): LaravelRoute[] {
		return this.getAll().filter(route => 
			route.controller?.includes(controller)
		);
	}

	/**
	 * Get route count
	 */
	get size(): number {
		return this.routes.size;
	}

	/**
	 * Find routes matching a path pattern
	 */
	findByPath(pattern: string): LaravelRoute[] {
		return this.getAll().filter(route => 
			route.uri.includes(pattern)
		);
	}
}

// Global route storage instance
const routeStorage = new RouteStorage();

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
	await identifyLaravelRoutes();

	// The command has been defined in the package.json file
	// Now provide the implementation of the command with registerCommand
	// The commandId parameter must match the command field in package.json
	const disposable = vscode.commands.registerCommand('lapi.helloWorld', () => {
		// The code you place here will be executed every time your command is executed
		// Display a message box to the user
		vscode.window.showInformationMessage('Hello World from lapi!');
	});

	context.subscriptions.push(disposable);
}

async function identifyLaravelRoutes(): Promise<void> {
	try {
		// Get the workspace folder
		const workspaceFolders = vscode.workspace.workspaceFolders;
		
		if (!workspaceFolders || workspaceFolders.length === 0) {
			console.warn('No workspace folder found');
			return;
		}

		const workspacePath = workspaceFolders[0].uri.fsPath;

		// Get the route list command from settings, append --json for parseable output
		const config = vscode.workspace.getConfiguration('lapi');
		const baseCommand = config.get<string>('routeListCommand', 'php artisan route:list');
		const routeListCommand = `${baseCommand} --json`;

		// Execute the route list command
		console.log('Fetching Laravel routes...');
		const { stdout, stderr } = await execAsync(routeListCommand, {
			cwd: workspacePath,
			timeout: 10000 // 10 second timeout
		});

		if (stderr) {
			console.error('Laravel route:list stderr:', stderr);
			outputChannel.appendLine('[Warning] ' + stderr);
		}

		if (stdout) {
			// Parse JSON output and store routes
			const parsedRoutes = parseRouteListJson(stdout);
			
			// Clear existing routes and store new ones
			routeStorage.clear();
			for (const route of parsedRoutes) {
				routeStorage.add(route);
			}

			// Display results
			outputChannel.clear();
			outputChannel.appendLine('=== Laravel Routes ===');
			outputChannel.appendLine('');
			outputChannel.appendLine(`Loaded ${routeStorage.size} routes into memory`);
			outputChannel.appendLine('');
			
			// Display routes in a formatted way
			for (const route of routeStorage.getAll()) {
				const controller = route.controller || route.action;
				outputChannel.appendLine(`${route.method.padEnd(10)} ${route.uri.padEnd(40)} → ${controller}`);
			}
			
			outputChannel.show();
			vscode.window.showInformationMessage(`Laravel routes loaded: ${routeStorage.size} routes stored`);
		}
	} catch (error: any) {
		// Handle various error scenarios
		outputChannel.clear();
		outputChannel.appendLine('=== Laravel Routes Error ===');
		outputChannel.appendLine('');
		
		if (error.code === 'ENOENT') {
			const msg = 'PHP executable not found. Make sure PHP is installed and in PATH.';
			outputChannel.appendLine(msg);
			outputChannel.show();
			vscode.window.showWarningMessage('PHP not found. Please ensure PHP is installed.');
		} else if (error.killed) {
			const msg = 'Command timed out after 10 seconds.';
			outputChannel.appendLine(msg);
			outputChannel.show();
			vscode.window.showWarningMessage('Laravel route command timed out.');
		} else if (error.code === 127) {
			const msg = 'Artisan command not found. This may not be a Laravel project.';
			outputChannel.appendLine(msg);
			outputChannel.show();
			vscode.window.showWarningMessage('Not a Laravel project or artisan not found.');
		} else {
			outputChannel.appendLine(`Error: ${error.message}`);
			if (error.stderr) {
				outputChannel.appendLine('');
				outputChannel.appendLine('Details:');
				outputChannel.appendLine(error.stderr);
			}
			outputChannel.show();
			vscode.window.showWarningMessage(`Failed to load Laravel routes: ${error.message}`);
		}
	}
}

/**
 * Parse the JSON output from `php artisan route:list --json`
 */
function parseRouteListJson(jsonOutput: string): LaravelRoute[] {
	try {
		const routes: LaravelRoute[] = [];
		const parsed = JSON.parse(jsonOutput);

		for (const item of parsed) {
			// Extract controller from action string (e.g., "App\Http\Controllers\UserController@index")
			let controller: string | null = null;
			const action = item.action || '';
			
			if (action.includes('@')) {
				controller = action;
			} else if (action.includes('\\')) {
				// Invokable controller (no @ method)
				controller = action;
			}

			// Handle method - can be a string or array
			const methods = Array.isArray(item.method) 
				? item.method.join('|') 
				: (item.method || 'GET');

			// Handle middleware - can be string or array
			const middleware = Array.isArray(item.middleware) 
				? item.middleware 
				: (item.middleware ? [item.middleware] : []);

			routes.push({
				method: methods,
				uri: item.uri || '',
				name: item.name || null,
				action: action,
				controller: controller,
				middleware: middleware
			});
		}

		return routes;
	} catch (parseError) {
		console.error('Failed to parse route list JSON:', parseError);
		outputChannel.appendLine(`[Error] Failed to parse route list JSON: ${parseError}`);
		return [];
	}
}

/**
 * Get the route storage instance (for use by other modules)
 */
export function getRouteStorage(): RouteStorage {
	return routeStorage;
}

// This method is called when your extension is deactivated
export function deactivate() {}
