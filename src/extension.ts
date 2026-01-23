// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import * as vscode from 'vscode';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

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

		// Get the route list command from settings
		const config = vscode.workspace.getConfiguration('lapi');
		const routeListCommand = config.get<string>('routeListCommand', 'php artisan route:list');

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
			outputChannel.clear();
			outputChannel.appendLine('=== Laravel Routes ===');
			outputChannel.appendLine('');
			outputChannel.appendLine(stdout);
			outputChannel.show();
			vscode.window.showInformationMessage('Laravel routes loaded successfully');
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

// This method is called when your extension is deactivated
export function deactivate() {}
