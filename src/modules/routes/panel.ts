import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import type { LaravelRoute } from '../../types/routes';
import { getRouteStorage } from './manager';
import { executeRequest, checkServerStatus } from '../api/request';

const WORKSPACE_STATE_KEY = 'lapi.requestParams';
const PATH_PARAMS_STATE_KEY = 'lapi.pathParams';

/**
 * Manages the Routes Table webview panel
 */
export class RoutesPanel {
	public static currentPanel: RoutesPanel | undefined;
	public static readonly viewType = 'lapiRoutesTable';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _extensionUri: vscode.Uri;
	private readonly _outputChannel: vscode.OutputChannel;
	private readonly _context: vscode.ExtensionContext;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel, context: vscode.ExtensionContext) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it
		if (RoutesPanel.currentPanel) {
			RoutesPanel.currentPanel._panel.reveal(column);
			RoutesPanel.currentPanel._update();
			return;
		}

		// Otherwise, create a new panel
		const panel = vscode.window.createWebviewPanel(
			RoutesPanel.viewType,
			'Laravel Routes',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		RoutesPanel.currentPanel = new RoutesPanel(panel, extensionUri, outputChannel, context);
	}

	public static createOrShowWithRoute(extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel, context: vscode.ExtensionContext, route: LaravelRoute) {
		const column = vscode.window.activeTextEditor
			? vscode.window.activeTextEditor.viewColumn
			: undefined;

		// If we already have a panel, show it and open modal
		if (RoutesPanel.currentPanel) {
			RoutesPanel.currentPanel._panel.reveal(column);
			RoutesPanel.currentPanel._update();
			RoutesPanel.currentPanel._openModalForRoute(route);
			return;
		}

		// Otherwise, create a new panel
		const panel = vscode.window.createWebviewPanel(
			RoutesPanel.viewType,
			'Laravel Routes',
			column || vscode.ViewColumn.One,
			{
				enableScripts: true,
				retainContextWhenHidden: true
			}
		);

		RoutesPanel.currentPanel = new RoutesPanel(panel, extensionUri, outputChannel, context, route);
	}

	private _pendingRoute: LaravelRoute | undefined;

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel, context: vscode.ExtensionContext, initialRoute?: LaravelRoute) {
		this._panel = panel;
		this._extensionUri = extensionUri;
		this._outputChannel = outputChannel;
		this._context = context;
		this._pendingRoute = initialRoute;

		// Set the webview's initial html content
		this._update();

		// Listen for when the panel is disposed
		this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

		// Update the content when the view becomes visible
		this._panel.onDidChangeViewState(
			() => {
				if (this._panel.visible) {
					this._update();
				}
			},
			null,
			this._disposables
		);

		// Handle messages from the webview
		this._panel.webview.onDidReceiveMessage(
			async (message) => {
				if (message.command === 'executeRequest') {
					const { method, uri, bodyParams, pathParams } = message;
					const route = getRouteStorage().get(method, uri);
					
					if (route) {
						this._outputChannel.appendLine('');
						this._outputChannel.appendLine(`=== API Request: ${method} ${uri} ===`);
						this._outputChannel.appendLine('');
						
						// Debug: log route info
						this._outputChannel.appendLine(`Route has ${route.requestParams?.length || 0} request params`);
						if (route.requestParams) {
							for (const param of route.requestParams) {
								this._outputChannel.appendLine(`  - ${param.name} (${param.type}) isPathParam=${param.isPathParam}`);
							}
						}
						this._outputChannel.appendLine('');
						
						try {
							// Pass bodyParams and pathParams from the edited form
							const options: { bodyParams?: Record<string, unknown>; pathParams?: Record<string, string> } = {};
							if (bodyParams && Object.keys(bodyParams).length > 0) {
								options.bodyParams = bodyParams;
							}
							if (pathParams && Object.keys(pathParams).length > 0) {
								options.pathParams = pathParams;
							}
							const response = await executeRequest(route, options);
							
							this._outputChannel.appendLine(`Status: ${response.statusCode} ${response.success ? '✓' : '✗'}`);
							this._outputChannel.appendLine(`Duration: ${response.duration}ms`);
							this._outputChannel.appendLine('');
							this._outputChannel.appendLine('cURL Command:');
							this._outputChannel.appendLine(response.curlCommand);
							this._outputChannel.appendLine('');
							this._outputChannel.appendLine('Response:');
							
							if (typeof response.body === 'object') {
								this._outputChannel.appendLine(JSON.stringify(response.body, null, 2));
							} else {
								this._outputChannel.appendLine(response.rawBody || '(empty response)');
							}
							
							if (response.error) {
								this._outputChannel.appendLine('');
								this._outputChannel.appendLine(`Error: ${response.error}`);
							}
							
							this._outputChannel.show();
						} catch (error) {
							this._outputChannel.appendLine(`Error: ${error}`);
							this._outputChannel.show();
						}
					}
				} else if (message.command === 'saveRequestParams') {
					// Save user-edited params to workspace state
					const { routeKey, params } = message;
					await this._saveRequestParams(routeKey, params);
				} else if (message.command === 'clearRequestParams') {
					// Clear persisted params for a route (reset to defaults)
					const { routeKey } = message;
					await this._clearRequestParams(routeKey);
				} else if (message.command === 'savePathParams') {
					// Save path params to workspace state
					const { routeKey, params } = message;
					await this._savePathParams(routeKey, params);
				} else if (message.command === 'clearPathParams') {
					// Clear path params for a route
					const { routeKey } = message;
					await this._clearPathParams(routeKey);
				} else if (message.command === 'checkServerStatus') {
					// Check if the API server is available
					const isAvailable = await checkServerStatus();
					this._panel.webview.postMessage({
						command: 'serverStatusResult',
						isAvailable: isAvailable
					});
				} else if (message.command === 'openFile') {
					// Open controller file at method location
					const { filePath, methodName } = message;
					if (filePath && fs.existsSync(filePath)) {
						const document = await vscode.workspace.openTextDocument(filePath);
						const editor = await vscode.window.showTextDocument(document);
						
						// Find the method and scroll to it
						if (methodName) {
							const text = document.getText();
							const methodRegex = new RegExp(`function\\s+${methodName}\\s*\\(`, 'g');
							const match = methodRegex.exec(text);
							if (match) {
								const position = document.positionAt(match.index);
								editor.selection = new vscode.Selection(position, position);
								editor.revealRange(new vscode.Range(position, position), vscode.TextEditorRevealType.InCenter);
							}
						}
					}
				}
			},
			null,
			this._disposables
		);
	}

	private _getPersistedParams(routeKey: string): Record<string, unknown> | null {
		const allParams = this._context.workspaceState.get<Record<string, Record<string, unknown>>>(WORKSPACE_STATE_KEY, {});
		return allParams[routeKey] || null;
	}

	private async _saveRequestParams(routeKey: string, params: Record<string, unknown>): Promise<void> {
		const allParams = this._context.workspaceState.get<Record<string, Record<string, unknown>>>(WORKSPACE_STATE_KEY, {});
		allParams[routeKey] = params;
		await this._context.workspaceState.update(WORKSPACE_STATE_KEY, allParams);
	}

	private async _clearRequestParams(routeKey: string): Promise<void> {
		const allParams = this._context.workspaceState.get<Record<string, Record<string, unknown>>>(WORKSPACE_STATE_KEY, {});
		delete allParams[routeKey];
		await this._context.workspaceState.update(WORKSPACE_STATE_KEY, allParams);
	}

	private async _savePathParams(routeKey: string, params: Record<string, string>): Promise<void> {
		const allParams = this._context.workspaceState.get<Record<string, Record<string, string>>>(PATH_PARAMS_STATE_KEY, {});
		allParams[routeKey] = params;
		await this._context.workspaceState.update(PATH_PARAMS_STATE_KEY, allParams);
	}

	private async _clearPathParams(routeKey: string): Promise<void> {
		const allParams = this._context.workspaceState.get<Record<string, Record<string, string>>>(PATH_PARAMS_STATE_KEY, {});
		delete allParams[routeKey];
		await this._context.workspaceState.update(PATH_PARAMS_STATE_KEY, allParams);
	}

	public dispose() {
		RoutesPanel.currentPanel = undefined;

		// Clean up resources
		this._panel.dispose();

		while (this._disposables.length) {
			const disposable = this._disposables.pop();
			if (disposable) {
				disposable.dispose();
			}
		}
	}

	private _update() {
		const webview = this._panel.webview;
		this._panel.title = 'Laravel Routes';
		this._panel.webview.html = this._getHtmlForWebview(webview);

		// If there's a pending route, open the modal after webview is ready
		if (this._pendingRoute) {
			const route = this._pendingRoute;
			this._pendingRoute = undefined;
			// Small delaykj to let webview initialize
			setTimeout(() => this._openModalForRoute(route), 100);
		}
	}

	public _openModalForRoute(route: LaravelRoute) {
		// Send raw values (unescaped) to the webview so it can JSON.parse the fields correctly.
		const method = route.method || '';
		const uri = route.uri || '';

		// Build the fields array (same structure as _generateFieldsJson but without HTML-escaping)
		const fields: Array<{key: string, value: unknown, type: string}> = [];
		if (route.requestParams && route.requestParams.length > 0) {
			for (const param of route.requestParams) {
				if (param.isPathParam) continue;
				fields.push({ key: param.name, value: this._getExampleValue(param), type: param.type || 'string' });
			}
		}

		this._panel.webview.postMessage({
			command: 'openModal',
			method: method,
			uri: uri,
			fields: JSON.stringify(fields)
		});
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		const routes = getRouteStorage().getAll();
		// Get all persisted params to pass to webview
		const persistedParams = this._context.workspaceState.get<Record<string, Record<string, unknown>>>(WORKSPACE_STATE_KEY, {});
		const persistedPathParams = this._context.workspaceState.get<Record<string, Record<string, string>>>(PATH_PARAMS_STATE_KEY, {});

		// Load asset files
		const assetsPath = path.join(this._extensionUri.fsPath, 'src', 'assets');
		
		// Load CSS files
		const mainCss = fs.readFileSync(path.join(assetsPath, 'styles', 'main.css'), 'utf8');
		const routesTableCss = fs.readFileSync(path.join(assetsPath, 'styles', 'routes-table.css'), 'utf8');
		const requestModalCss = fs.readFileSync(path.join(assetsPath, 'styles', 'request-modal.css'), 'utf8');
		
		// Load HTML templates
		let routesTableHtml = fs.readFileSync(path.join(assetsPath, 'views', 'routes-table.html'), 'utf8');
		const requestModalHtml = fs.readFileSync(path.join(assetsPath, 'views', 'request-modal.html'), 'utf8');
		
		// Load JS files
		const mainJs = fs.readFileSync(path.join(assetsPath, 'scripts', 'main.js'), 'utf8');
		const routesTableJs = fs.readFileSync(path.join(assetsPath, 'scripts', 'routes-table.js'), 'utf8');
		const requestModalJs = fs.readFileSync(path.join(assetsPath, 'scripts', 'request-modal.js'), 'utf8');

		// Process routes table template
		const hasRoutes = routes.length > 0;
		const routeRows = routes.map(route => this._renderRouteRow(route)).join('');
		
		// Simple template substitution
		routesTableHtml = routesTableHtml
			.replace('{{routeCount}}', String(routes.length))
			.replace(/{{#if hasRoutes}}([\s\S]*?){{else}}([\s\S]*?){{\/#if}}/g, 
				hasRoutes ? '$1' : '$2')
			.replace('{{routeRows}}', routeRows);

		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Laravel Routes</title>
	<style>
${mainCss}
${routesTableCss}
${requestModalCss}
	</style>
</head>
<body>
${routesTableHtml}
${requestModalHtml}
	<script>
		const vscode = acquireVsCodeApi();
${mainJs}
${routesTableJs}
${requestModalJs}
		// Initialize with config
		initRoutesTable();
		initRequestModal({
			vscode: vscode,
			persistedParams: ${JSON.stringify(persistedParams)},
			persistedPathParams: ${JSON.stringify(persistedPathParams)}
		});
		
		// Handle controller link clicks
		document.addEventListener('click', function(e) {
			const target = e.target;
			if (target && target.classList && target.classList.contains('controller-link')) {
				e.preventDefault();
				const filePath = target.getAttribute('data-file');
				const methodName = target.getAttribute('data-method');
				if (filePath) {
					vscode.postMessage({
						command: 'openFile',
						filePath: filePath,
						methodName: methodName
					});
				}
			}
		});
	</script>
</body>
</html>`;
	}

	private _renderRouteRow(route: LaravelRoute): string {
		const methodClass = this._getMethodClass(route.method);
		const controller = route.controller || route.action || 'Closure';
		const name = route.name || '-';
		const submitMethod = route.method.split('|')[0].toUpperCase();
		const submitBtnClass = `submit-btn-${submitMethod.toLowerCase()}`;
		const fieldsJson = this._generateFieldsJson(route);
		const method = this._escapeHtml(route.method);
		const uri = this._escapeHtml(route.uri);

		// Make controller clickable if we have the file path
		let controllerHtml = this._escapeHtml(controller);
		if (route.controllerPath && route.controllerMethod) {
			const escapedPath = this._escapeHtml(route.controllerPath);
			const escapedMethod = this._escapeHtml(route.controllerMethod);
			controllerHtml = `<a href="#" class="controller-link" data-file="${escapedPath}" data-method="${escapedMethod}">${this._escapeHtml(controller)}</a>`;
		}

		return `
			<tr>
				<td><button class="submit-btn ${submitBtnClass}" onclick="openModal('${method}', '${uri}', '${fieldsJson}')">${submitMethod}</button></td>
				<td><span class="method ${methodClass}">${this._escapeHtml(route.method)}</span></td>
				<td class="uri">${this._escapeHtml(route.uri)}</td>
				<td class="name">${this._escapeHtml(name)}</td>
				<td class="controller">${controllerHtml}</td>
			</tr>
		`;
	}

	private _generateFieldsJson(route: LaravelRoute): string {
		if (!route.requestParams || route.requestParams.length === 0) {
			return '[]';
		}

		// Build field metadata for the editable form
		const fields: Array<{key: string, value: unknown, type: string}> = [];

		for (const param of route.requestParams) {
			if (param.isPathParam) {
				continue; // Skip path params, they're shown in the URI
			}
			fields.push({
				key: param.name,
				value: this._getExampleValue(param),
				type: param.type || 'string'
			});
		}

		return JSON.stringify(fields).replace(/'/g, "\\'").replace(/"/g, '&quot;');
	}

	private _getExampleValue(param: import('../../types/routes').RouteRequestParam): unknown {
		// If there are enum values, use the first one
		if (param.enumValues && param.enumValues.length > 0) {
			return param.enumValues[0];
		}

		// Handle nested children for arrays/objects
		if (param.children && param.children.length > 0) {
			if (param.type === 'array') {
				const childObj: Record<string, unknown> = {};
				for (const child of param.children) {
					childObj[child.name] = this._getExampleValue(child);
				}
				return [childObj];
			} else {
				const obj: Record<string, unknown> = {};
				for (const child of param.children) {
					obj[child.name] = this._getExampleValue(child);
				}
				return obj;
			}
		}

		// Return example value based on type
		switch (param.type) {
			case 'integer':
				return 1;
			case 'number':
				return 1.0;
			case 'boolean':
				return true;
			case 'array':
				return [];
			case 'object':
				return {};
			case 'date':
				return '2026-01-23';
			case 'email':
				return 'user@example.com';
			case 'url':
				return 'https://example.com';
			case 'uuid':
				return '550e8400-e29b-41d4-a716-446655440000';
			case 'file':
				return '(file)';
			default:
				return 'string';
		}
	}

	private _getMethodClass(method: string): string {
		const m = method.toLowerCase().split('|')[0];
		return `method-${m}`;
	}

	private _escapeHtml(text: string): string {
		return text
			.replace(/&/g, '&amp;')
			.replace(/</g, '&lt;')
			.replace(/>/g, '&gt;')
			.replace(/"/g, '&quot;')
			.replace(/'/g, '&#039;');
	}
}
