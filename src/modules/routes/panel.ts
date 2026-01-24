import * as vscode from 'vscode';
import type { LaravelRoute } from '../../types/routes';
import { getRouteStorage } from './manager';
import { executeRequest } from '../api/request';

/**
 * Manages the Routes Table webview panel
 */
export class RoutesPanel {
	public static currentPanel: RoutesPanel | undefined;
	public static readonly viewType = 'lapiRoutesTable';

	private readonly _panel: vscode.WebviewPanel;
	private readonly _outputChannel: vscode.OutputChannel;
	private _disposables: vscode.Disposable[] = [];

	public static createOrShow(extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel) {
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

		RoutesPanel.currentPanel = new RoutesPanel(panel, extensionUri, outputChannel);
	}

	private constructor(panel: vscode.WebviewPanel, extensionUri: vscode.Uri, outputChannel: vscode.OutputChannel) {
		this._panel = panel;
		this._outputChannel = outputChannel;

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
					const { method, uri, bodyParams } = message;
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
							// Pass bodyParams from the edited form
							const options = bodyParams && Object.keys(bodyParams).length > 0 
								? { bodyParams } 
								: {};
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
		
		.request-btn {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
			border: none;
			padding: 4px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			font-family: var(--vscode-font-family);
		}
		
		.request-btn:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		
		.request-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		
		.submit-btn {
			border: none;
			padding: 4px 12px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 12px;
			font-weight: bold;
			font-family: var(--vscode-font-family);
			min-width: 70px;
		}
		
		.submit-btn:hover {
			opacity: 0.85;
		}
		
		.submit-btn:disabled {
			opacity: 0.5;
			cursor: not-allowed;
		}
		
		.submit-btn-get { background-color: #61affe; color: #fff; }
		.submit-btn-post { background-color: #49cc90; color: #fff; }
		.submit-btn-put { background-color: #fca130; color: #fff; }
		.submit-btn-patch { background-color: #50e3c2; color: #fff; }
		.submit-btn-delete { background-color: #f93e3e; color: #fff; }
		.submit-btn-head { background-color: #9012fe; color: #fff; }
		.submit-btn-options { background-color: #0d5aa7; color: #fff; }
		
		.request-empty {
			color: var(--vscode-descriptionForeground);
			font-style: italic;
			font-size: 12px;
		}
		
		/* Modal styles */
		.modal-overlay {
			display: none;
			position: fixed;
			top: 0;
			left: 0;
			width: 100%;
			height: 100%;
			background-color: rgba(0, 0, 0, 0.5);
			z-index: 1000;
			justify-content: center;
			align-items: center;
		}
		
		.modal-overlay.active {
			display: flex;
		}
		
		.modal {
			background-color: var(--vscode-editor-background);
			border: 1px solid var(--vscode-widget-border);
			border-radius: 8px;
			box-shadow: 0 4px 20px rgba(0, 0, 0, 0.3);
			max-width: 600px;
			width: 90%;
			max-height: 80vh;
			display: flex;
			flex-direction: column;
		}
		
		.modal-header {
			display: flex;
			justify-content: space-between;
			align-items: center;
			padding: 16px 20px;
			border-bottom: 1px solid var(--vscode-widget-border);
		}
		
		.modal-title {
			font-size: 14px;
			font-weight: 600;
			margin: 0;
			color: var(--vscode-foreground);
		}
		
		.modal-subtitle {
			font-size: 12px;
			color: var(--vscode-descriptionForeground);
			margin-top: 4px;
		}
		
		.modal-close {
			background: none;
			border: none;
			color: var(--vscode-foreground);
			font-size: 20px;
			cursor: pointer;
			padding: 4px 8px;
			border-radius: 4px;
		}
		
		.modal-close:hover {
			background-color: var(--vscode-toolbar-hoverBackground);
		}
		
		.modal-body {
			padding: 20px;
			overflow-y: auto;
			flex: 1;
		}
		
		.modal-form {
			display: flex;
			flex-direction: column;
			gap: 12px;
		}
		
		.form-field {
			display: flex;
			flex-direction: column;
			gap: 4px;
		}
		
		.form-field label {
			font-size: 12px;
			font-weight: 600;
			color: var(--vscode-foreground);
			display: flex;
			align-items: center;
			gap: 6px;
		}
		
		.form-field .field-type {
			font-weight: normal;
			color: var(--vscode-descriptionForeground);
			font-size: 11px;
		}
		
		.form-field input,
		.form-field select {
			padding: 6px 10px;
			border: 1px solid var(--vscode-input-border);
			background-color: var(--vscode-input-background);
			color: var(--vscode-input-foreground);
			border-radius: 4px;
			font-size: 13px;
			font-family: var(--vscode-editor-font-family);
		}
		
		.form-field input:focus,
		.form-field select:focus {
			outline: 1px solid var(--vscode-focusBorder);
			border-color: var(--vscode-focusBorder);
		}
		
		.form-field input.invalid {
			border-color: var(--vscode-inputValidation-errorBorder);
			background-color: var(--vscode-inputValidation-errorBackground);
		}
		
		.form-field .field-error {
			color: var(--vscode-errorForeground);
			font-size: 11px;
			display: none;
		}
		
		.form-field .field-error.show {
			display: block;
		}
		
		.json-error {
			color: var(--vscode-errorForeground);
			font-size: 12px;
			margin-top: 8px;
			display: none;
		}
		
		.json-error.show {
			display: block;
		}
		
		.modal-footer {
			padding: 12px 20px;
			border-top: 1px solid var(--vscode-widget-border);
			display: flex;
			justify-content: flex-end;
			gap: 8px;
		}
		
		.modal-btn {
			background-color: var(--vscode-button-background);
			color: var(--vscode-button-foreground);
			border: none;
			padding: 6px 14px;
			border-radius: 4px;
			cursor: pointer;
			font-size: 13px;
			font-family: var(--vscode-font-family);
		}
		
		.modal-btn:hover {
			background-color: var(--vscode-button-hoverBackground);
		}
		
		.modal-btn-secondary {
			background-color: var(--vscode-button-secondaryBackground);
			color: var(--vscode-button-secondaryForeground);
		}
		
		.modal-btn-secondary:hover {
			background-color: var(--vscode-button-secondaryHoverBackground);
		}
		
		.copy-success {
			color: var(--vscode-testing-iconPassed);
			font-size: 12px;
			margin-right: auto;
			display: none;
		}
		
		.copy-success.show {
			display: block;
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
				<th>Submit</th>
				<th>Method</th>
				<th>URI</th>
				<th>Name</th>
				<th>Controller</th>
				<th>Request</th>
			</tr>
		</thead>
		<tbody>
			${routes.map(route => this._renderRouteRow(route)).join('')}
		</tbody>
	</table>
	` : '<div class="no-routes">No routes loaded. Make sure you are in a Laravel project.</div>'}
	
	<!-- Modal -->
	<div class="modal-overlay" id="modal-overlay">
		<div class="modal">
			<div class="modal-header">
				<div>
					<h2 class="modal-title" id="modal-title">Request Body</h2>
					<div class="modal-subtitle" id="modal-subtitle"></div>
				</div>
				<button class="modal-close" id="modal-close">&times;</button>
			</div>
			<div class="modal-body">
				<div class="modal-form" id="modal-form"></div>
				<div class="json-error" id="json-error"></div>
			</div>
			<div class="modal-footer">
				<span class="copy-success" id="copy-success">✓ Copied to clipboard</span>
				<button class="modal-btn modal-btn-secondary" id="modal-copy">Copy JSON</button>
				<button class="modal-btn modal-btn-secondary" id="modal-close-btn">Close</button>
				<button class="modal-btn" id="modal-send">Send Request</button>
			</div>
		</div>
	</div>
	
	<script>
		const vscode = acquireVsCodeApi();
		
		const searchInput = document.getElementById('search');
		const table = document.getElementById('routes-table');
		const modalOverlay = document.getElementById('modal-overlay');
		const modalTitle = document.getElementById('modal-title');
		const modalSubtitle = document.getElementById('modal-subtitle');
		const modalForm = document.getElementById('modal-form');
		const modalClose = document.getElementById('modal-close');
		const modalCloseBtn = document.getElementById('modal-close-btn');
		const modalSend = document.getElementById('modal-send');
		
		// State to track edited request params per route
		const requestState = {};
		let currentRouteKey = null;
		const modalCopy = document.getElementById('modal-copy');
		const copySuccess = document.getElementById('copy-success');
		const jsonError = document.getElementById('json-error');
		
		// Submit request function
		function submitRequest(method, uri, bodyParams) {
			const routeKey = method + ' ' + uri;
			const params = bodyParams || requestState[routeKey] || {};
			
			vscode.postMessage({
				command: 'executeRequest',
				method: method,
				uri: uri,
				bodyParams: params
			});
		}
		
		// Search functionality
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
		
		// Create input field based on type
		function createField(key, value, type) {
			const div = document.createElement('div');
			div.className = 'form-field';
			
			const label = document.createElement('label');
			label.innerHTML = key + ' <span class="field-type">(' + type + ')</span>';
			div.appendChild(label);
			
			let input;
			
			if (type === 'boolean') {
				input = document.createElement('select');
				input.innerHTML = '<option value="true">true</option><option value="false">false</option>';
				input.value = String(value);
			} else {
				input = document.createElement('input');
				input.type = 'text';
				
				// Set appropriate value based on type
				if (type === 'array' || type === 'object') {
					input.value = JSON.stringify(value);
				} else {
					input.value = value;
				}
			}
			
			input.dataset.key = key;
			input.dataset.type = type;
			input.addEventListener('input', validateField);
			div.appendChild(input);
			
			const errorSpan = document.createElement('span');
			errorSpan.className = 'field-error';
			div.appendChild(errorSpan);
			
			return div;
		}
		
		// Validate a single field
		function validateField(e) {
			const input = e.target;
			const type = input.dataset.type;
			const value = input.value;
			const errorSpan = input.nextElementSibling;
			
			let error = '';
			
			if (type === 'integer') {
				if (!/^-?\d+$/.test(value)) {
					error = 'Must be an integer';
				}
			} else if (type === 'number') {
				if (isNaN(parseFloat(value))) {
					error = 'Must be a number';
				}
			} else if (type === 'array') {
				try {
					const parsed = JSON.parse(value);
					if (!Array.isArray(parsed)) {
						error = 'Must be a valid JSON array';
					}
				} catch {
					error = 'Must be valid JSON';
				}
			} else if (type === 'object') {
				try {
					const parsed = JSON.parse(value);
					if (typeof parsed !== 'object' || Array.isArray(parsed)) {
						error = 'Must be a valid JSON object';
					}
				} catch {
					error = 'Must be valid JSON';
				}
			} else if (type === 'email') {
				if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value)) {
					error = 'Must be a valid email';
				}
			} else if (type === 'url') {
				try {
					new URL(value);
				} catch {
					error = 'Must be a valid URL';
				}
			}
			
			if (error) {
				input.classList.add('invalid');
				errorSpan.textContent = error;
				errorSpan.classList.add('show');
			} else {
				input.classList.remove('invalid');
				errorSpan.classList.remove('show');
			}
		}
		
		// Get current JSON from form
		function getFormJson() {
			const result = {};
			const inputs = modalForm.querySelectorAll('input, select');
			
			for (const input of inputs) {
				const key = input.dataset.key;
				const type = input.dataset.type;
				const value = input.value;
				
				if (type === 'integer') {
					result[key] = parseInt(value, 10) || 0;
				} else if (type === 'number') {
					result[key] = parseFloat(value) || 0;
				} else if (type === 'boolean') {
					result[key] = value === 'true';
				} else if (type === 'array' || type === 'object') {
					try {
						result[key] = JSON.parse(value);
					} catch {
						result[key] = type === 'array' ? [] : {};
					}
				} else {
					result[key] = value;
				}
			}
			
			return result;
		}
		
		// Modal functionality
		function openModal(method, uri, fieldsJson) {
			modalTitle.textContent = 'Request Body';
			modalSubtitle.textContent = method + ' ' + uri;
			currentRouteKey = method + ' ' + uri;
			
			// Parse fields and build form
			const fields = JSON.parse(fieldsJson);
			modalForm.innerHTML = '';
			
			// Get saved state or use defaults
			const savedState = requestState[currentRouteKey] || {};
			
			for (const field of fields) {
				// Use saved value if exists, otherwise use default
				const value = savedState.hasOwnProperty(field.key) ? savedState[field.key] : field.value;
				const fieldEl = createField(field.key, value, field.type);
				modalForm.appendChild(fieldEl);
			}
			
			modalOverlay.classList.add('active');
			copySuccess.classList.remove('show');
			jsonError.classList.remove('show');
		}
		
		// Save form state when closing modal
		function saveFormState() {
			if (currentRouteKey) {
				requestState[currentRouteKey] = getFormJson();
			}
		}
		
		function closeModal() {
			saveFormState();
			modalOverlay.classList.remove('active');
		}
		
		// Event listeners
		modalClose.addEventListener('click', closeModal);
		modalCloseBtn.addEventListener('click', closeModal);
		modalOverlay.addEventListener('click', function(e) {
			if (e.target === modalOverlay) {
				closeModal();
			}
		});
		
		// Send request from modal
		modalSend.addEventListener('click', function() {
			// Check for validation errors
			const invalidFields = modalForm.querySelectorAll('input.invalid');
			if (invalidFields.length > 0) {
				jsonError.textContent = 'Please fix validation errors before sending';
				jsonError.classList.add('show');
				return;
			}
			
			const bodyParams = getFormJson();
			saveFormState();
			
			// Extract method and uri from current route key
			const [method, ...uriParts] = currentRouteKey.split(' ');
			const uri = uriParts.join(' ');
			
			submitRequest(method, uri, bodyParams);
			closeModal();
		});
		
		// Copy functionality
		modalCopy.addEventListener('click', function() {
			// Check for validation errors
			const invalidFields = modalForm.querySelectorAll('input.invalid');
			if (invalidFields.length > 0) {
				jsonError.textContent = 'Please fix validation errors before copying';
				jsonError.classList.add('show');
				return;
			}
			
			const json = JSON.stringify(getFormJson(), null, 2);
			navigator.clipboard.writeText(json).then(function() {
				copySuccess.classList.add('show');
				jsonError.classList.remove('show');
				setTimeout(function() {
					copySuccess.classList.remove('show');
				}, 2000);
			});
		});
		
		// Escape key to close modal
		document.addEventListener('keydown', function(e) {
			if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
				closeModal();
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
		const requestJson = this._generateRequestJson(route);
		const submitMethod = route.method.split('|')[0].toUpperCase();
		const submitBtnClass = `submit-btn-${submitMethod.toLowerCase()}`;

		return `
			<tr>
				<td><button class="submit-btn ${submitBtnClass}" onclick="submitRequest('${this._escapeHtml(route.method)}', '${this._escapeHtml(route.uri)}')">${submitMethod}</button></td>
				<td><span class="method ${methodClass}">${this._escapeHtml(route.method)}</span></td>
				<td class="uri">${this._escapeHtml(route.uri)}</td>
				<td class="name">${this._escapeHtml(name)}</td>
				<td class="controller">${this._escapeHtml(controller)}</td>
				<td class="request">${requestJson}</td>
			</tr>
		`;
	}

	private _generateRequestJson(route: LaravelRoute): string {
		if (!route.requestParams || route.requestParams.length === 0) {
			return '<span class="request-empty">-</span>';
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

		if (fields.length === 0) {
			return '<span class="request-empty">-</span>';
		}

		const fieldsJson = JSON.stringify(fields).replace(/'/g, "\\'").replace(/"/g, '&quot;');
		const method = this._escapeHtml(route.method);
		const uri = this._escapeHtml(route.uri);
		const paramCount = fields.length;
		
		return `<button class="request-btn" onclick="openModal('${method}', '${uri}', '${fieldsJson}')">
			Edit (${paramCount} param${paramCount !== 1 ? 's' : ''})
		</button>`;
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
