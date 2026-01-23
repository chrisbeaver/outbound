import * as vscode from 'vscode';
import type { LaravelRoute } from '../../types/routes';
import { getRouteStorage } from './manager';

/**
 * Manages the Routes Table webview panel
 */
export class RoutesPanel {
	public static currentPanel: RoutesPanel | undefined;
	public static readonly viewType = 'lapiRoutesTable';

	private readonly _panel: vscode.WebviewPanel;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri) {
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

		RoutesPanel.currentPanel = new RoutesPanel(panel, extensionUri);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri) {
		this._panel = panel;

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
	}

	private _getHtmlForWebview(webview: vscode.Webview): string {
		const routes = getRouteStorage().getAll();
		
		return `<!DOCTYPE html>
<html lang="en">
<head>
	<meta charset="UTF-8">
	<meta name="viewport" content="width=device-width, initial-scale=1.0">
	<title>Laravel Routes</title>
	<style>
		body {
			font-family: var(--vscode-font-family);
			font-size: var(--vscode-font-size);
			color: var(--vscode-foreground);
			background-color: var(--vscode-editor-background);
			padding: 20px;
			margin: 0;
		}
		
		h1 {
			color: var(--vscode-foreground);
			margin-bottom: 20px;
			font-size: 1.5em;
		}
		
		.stats {
			margin-bottom: 20px;
			color: var(--vscode-descriptionForeground);
		}
		
		.search-container {
			margin-bottom: 20px;
		}
		
		#search {
			width: 100%;
			max-width: 400px;
			padding: 8px 12px;
			border: 1px solid var(--vscode-input-border);
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 4px;
			font-size: 14px;
		}
		
		#search:focus {
			outline: 1px solid var(--vscode-focusBorder);
			border-color: var(--vscode-focusBorder);
		}
		
		table {
			width: 100%;
			border-collapse: collapse;
			margin-top: 10px;
		}
		
		th, td {
			text-align: left;
			padding: 10px 12px;
			border-bottom: 1px solid var(--vscode-widget-border);
		}
		
		th {
			background-color: var(--vscode-editor-lineHighlightBackground);
			font-weight: 600;
			position: sticky;
			top: 0;
		}
		
		tr:hover {
			background-color: var(--vscode-list-hoverBackground);
		}
		
		.method {
			font-weight: bold;
			padding: 2px 8px;
			border-radius: 4px;
			font-size: 12px;
			display: inline-block;
			min-width: 60px;
			text-align: center;
		}
		
		.method-get { background-color: #61affe33; color: #61affe; }
		.method-post { background-color: #49cc9033; color: #49cc90; }
		.method-put { background-color: #fca13033; color: #fca130; }
		.method-patch { background-color: #50e3c233; color: #50e3c2; }
		.method-delete { background-color: #f93e3e33; color: #f93e3e; }
		.method-head { background-color: #9012fe33; color: #9012fe; }
		.method-options { background-color: #0d5aa733; color: #0d5aa7; }
		
		.uri {
			font-family: var(--vscode-editor-font-family);
			color: var(--vscode-textLink-foreground);
		}
		
		.controller {
			font-family: var(--vscode-editor-font-family);
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
		}
		
		.name {
			font-style: italic;
			color: var(--vscode-descriptionForeground);
		}
		
		.no-routes {
			text-align: center;
			padding: 40px;
			color: var(--vscode-descriptionForeground);
		}
	</style>
</head>
<body>
	<h1>🛣️ Laravel Routes</h1>
	<div class="stats">Total routes: ${routes.length}</div>
	
	<div class="search-container">
		<input type="text" id="search" placeholder="Filter routes..." />
	</div>
	
	${routes.length > 0 ? `
	<table id="routes-table">
		<thead>
			<tr>
				<th>Method</th>
				<th>URI</th>
				<th>Name</th>
				<th>Controller</th>
			</tr>
		</thead>
		<tbody>
			${routes.map(route => this._renderRouteRow(route)).join('')}
		</tbody>
	</table>
	` : '<div class="no-routes">No routes loaded. Make sure you are in a Laravel project.</div>'}
	
	<script>
		const searchInput = document.getElementById('search');
		const table = document.getElementById('routes-table');
		
		if (searchInput && table) {
			searchInput.addEventListener('input', function() {
				const filter = this.value.toLowerCase();
				const rows = table.querySelectorAll('tbody tr');
				
				rows.forEach(row => {
					const text = row.textContent.toLowerCase();
					row.style.display = text.includes(filter) ? '' : 'none';
				});
			});
		}
	</script>
</body>
</html>`;
	}

	private _renderRouteRow(route: LaravelRoute): string {
		const methodClass = this._getMethodClass(route.method);
		const controller = route.controller || route.action || 'Closure';
		const name = route.name || '-';
		
		return `
			<tr>
				<td><span class="method ${methodClass}">${this._escapeHtml(route.method)}</span></td>
				<td class="uri">${this._escapeHtml(route.uri)}</td>
				<td class="name">${this._escapeHtml(name)}</td>
				<td class="controller">${this._escapeHtml(controller)}</td>
			</tr>
		`;
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
