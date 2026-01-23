// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { identifyLaravelRoutes, getRouteStorage } from './modules/routes-manager';
import { RoutesPanel } from './modules/routes-panel';

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

	// Register Display Routes Table command
	const displayRoutesCommand = vscode.commands.registerCommand('lapi.displayRoutesTable', () => {
		RoutesPanel.createOrShow(context.extensionUri);
	});
	context.subscriptions.push(displayRoutesCommand);
}

// This method is called when your extension is deactivated
export function deactivate() {}
