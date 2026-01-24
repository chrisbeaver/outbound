// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { identifyLaravelRoutes, getRouteStorage } from './modules/routes/manager';
import { RoutesPanel } from './modules/routes/panel';
import { createRouteParser } from './modules/routes/parser';

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

	// Register Display Routes Table command
	const displayRoutesCommand = vscode.commands.registerCommand('lapi.displayRoutesTable', () => {
		RoutesPanel.createOrShow(context.extensionUri, outputChannel);
	});
	context.subscriptions.push(displayRoutesCommand);
}

/**
 * Parse all loaded routes to extract validation rules and request parameters
 */
async function parseRouteValidation(outputChannel: vscode.OutputChannel): Promise<void> {
	const parser = createRouteParser();
	if (!parser) {
		return;
	}

	const storage = getRouteStorage();
	const routes = storage.getAll();

	if (routes.length === 0) {
		return;
	}

	outputChannel.appendLine('');
	outputChannel.appendLine('=== Parsing Route Validation ===');
	outputChannel.appendLine('');

	let parsedCount = 0;

	for (const route of routes) {
		try {
			const parsedRoute = await parser.parseRoute(route);

			// Update the route in storage with parsed information
			storage.add(parsedRoute);

			if (parsedRoute.requestParams && parsedRoute.requestParams.length > 0) {
				parsedCount++;
				outputChannel.appendLine(
					`${route.method.padEnd(10)} ${route.uri.padEnd(40)} → ${parsedRoute.requestParams.length} params`
				);
			}
		} catch (error) {
			console.error(`Error parsing route ${route.uri}:`, error);
		}
	}

	outputChannel.appendLine('');
	outputChannel.appendLine(`Parsed ${parsedCount} routes with request parameters`);
}

// This method is called when your extension is deactivated
export function deactivate() { }
