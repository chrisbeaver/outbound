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
		RoutesPanel.createOrShow(context.extensionUri, outputChannel, context);
	});
	context.subscriptions.push(displayRoutesCommand);
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

// This method is called when your extension is deactivated
export function deactivate() { }
