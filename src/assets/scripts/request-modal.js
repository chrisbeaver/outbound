/**
 * Request modal script
 * Requires: main.js to be loaded first
 * 
 * Variables to be initialized:
 * - vscode: VS Code API instance
 * - persistedParams: Object of persisted params from workspace state
 * - persistedPathParams: Object of persisted path params from workspace state
 * - persistedCustomParams: Object of persisted custom params from workspace state
 * - persistedQueryParams: Object of persisted query params from workspace state
 */

// Modal state
let currentRouteKey = null;
let currentRouteFields = null;
let currentPathSegments = null;
let currentFieldsJson = null;
let currentRouteMethod = null;
let currentRouteUri = null;
let hasPersistedState = false;
let hasPersistedPathState = false;
let hasPersistedCustomState = false;
let hasPersistedQueryState = false;
let serverIsOnline = false;
let serverPollInterval = null;

// Default values from route definitions (rebuilt on refresh)
const routeDefaults = {};
const pathSegmentDefaults = {};

// In-memory state for current session edits (not yet saved)
const sessionState = {};
const pathSessionState = {};
const customParamsState = {};
const queryParamsState = {};

// Fallback openModal function in case init fails
window.openModal = function(method, uri, fieldsJson) {
	console.error('[Outbound] openModal called but modal not initialized');
};

/**
 * Initialize the request modal
 * @param {object} config - Configuration object
 * @param {object} config.vscode - VS Code API instance
 * @param {object} config.persistedParams - Persisted params from workspace state
 * @param {object} config.persistedPathParams - Persisted path params from workspace state
 */
function initRequestModal(config) {
	try {
	const { vscode, persistedParams, persistedPathParams, persistedCustomParams, persistedQueryParams, apiHost } = config;
	
	// Store apiHost for URL building
	const baseApiHost = apiHost || 'http://localhost:8000';
	
	// Get DOM elements
	const modalOverlay = document.getElementById('modal-overlay');
	const modalTitle = document.getElementById('modal-title');
	const modalSubtitle = document.getElementById('modal-subtitle');
	const modalUrl = document.getElementById('modal-url');
	const modalForm = document.getElementById('modal-form');
	const modalClose = document.getElementById('modal-close');
	const modalCloseBtn = document.getElementById('modal-close-btn');
	const modalSend = document.getElementById('modal-send');
	const modalReset = document.getElementById('modal-reset');
	const modalCopy = document.getElementById('modal-copy');
	const modalCopyCurl = document.getElementById('modal-copy-curl');
	const copySuccess = document.getElementById('copy-success');
	const jsonError = document.getElementById('json-error');
	const serverStatusLight = document.getElementById('server-status-light');
	const serverStatusText = document.getElementById('server-status-text');
	const uriSegmentsSection = document.getElementById('uri-segments-section');
	const uriSegmentsForm = document.getElementById('uri-segments-form');
	const requestBodySection = document.getElementById('request-body-section');
	const requestBodyHeader = document.getElementById('request-body-header');
	const requestBodyCount = document.getElementById('request-body-count');
	const customParamsList = document.getElementById('custom-params-list');
	const addParamName = document.getElementById('add-param-name');
	const addParamType = document.getElementById('add-param-type');
	const addParamBtn = document.getElementById('add-param-btn');
	const queryParamsSection = document.getElementById('query-params-section');
	const queryParamsHeader = document.getElementById('query-params-header');
	const queryParamsList = document.getElementById('query-params-list');
	const queryParamsCount = document.getElementById('query-params-count');
	const addQueryParamName = document.getElementById('add-query-param-name');
	const addQueryParamValue = document.getElementById('add-query-param-value');
	const addQueryParamBtn = document.getElementById('add-query-param-btn');
	
	// Listen for server status response from extension
	window.addEventListener('message', function(event) {
		const message = event.data;
		if (message.command === 'serverStatusResult') {
			serverIsOnline = message.isAvailable;
			updateServerStatusUI();
			
			// If offline and modal is open, start polling
			if (!serverIsOnline && modalOverlay.classList.contains('active')) {
				startServerPolling();
			} else {
				stopServerPolling();
			}
		} else if (message.command === 'openModal') {
			// Open modal from extension command (e.g., context menu)
			openModal(message.method, message.uri, message.fields, message.defaultQueryParams);
		} else if (message.command === 'curlResult') {
			// Copy cURL command to clipboard
			navigator.clipboard.writeText(message.curl).then(function() {
				copySuccess.textContent = '✓ cURL copied to clipboard';
				copySuccess.classList.add('show');
				jsonError.classList.remove('show');
				setTimeout(function() {
					copySuccess.classList.remove('show');
					copySuccess.textContent = '✓ Copied to clipboard';
				}, 2000);
			});
		}
	});
	
	// Start polling server status every second
	function startServerPolling() {
		if (serverPollInterval) { return; } // Already polling
		serverPollInterval = setInterval(function() {
			if (modalOverlay.classList.contains('active') && !serverIsOnline) {
				vscode.postMessage({ command: 'checkServerStatus' });
			} else {
				stopServerPolling();
			}
		}, 1000);
	}
	
	// Stop polling
	function stopServerPolling() {
		if (serverPollInterval) {
			clearInterval(serverPollInterval);
			serverPollInterval = null;
		}
	}
	
	// Update server status UI
	function updateServerStatusUI() {
		serverStatusLight.classList.remove('checking', 'online', 'offline');
		if (serverIsOnline) {
			serverStatusLight.classList.add('online');
			serverStatusText.textContent = 'Server online';
			modalSend.disabled = false;
		} else {
			serverStatusLight.classList.add('offline');
			serverStatusText.textContent = 'Server offline';
			modalSend.disabled = true;
		}
	}
	
	// Check server status
	function checkServerStatus() {
		serverIsOnline = false;
		serverStatusLight.classList.remove('online', 'offline');
		serverStatusLight.classList.add('checking');
		serverStatusText.textContent = 'Checking server...';
		modalSend.disabled = true;
		
		vscode.postMessage({ command: 'checkServerStatus' });
	}
	
	// Build and display the full URL
	function updateUrlDisplay(uri) {
		if (!modalUrl) { return; }
		
		// Replace path parameters with their current values
		let processedUri = uri;
		if (currentPathSegments && currentPathSegments.length > 0) {
			const pathInputs = uriSegmentsForm.querySelectorAll('input');
			currentPathSegments.forEach(function(segment, index) {
				const input = pathInputs[index];
				const value = input ? input.value : '';
				// Replace {param} or {param?} with value or placeholder
				const placeholder = value || (segment.isOptional ? '' : '{' + segment.key + '}');
				processedUri = processedUri.replace(new RegExp('\\{' + segment.key + '\\??' + '\\}'), placeholder);
			});
			// Clean up any double slashes from empty optional params
			processedUri = processedUri.replace(/\/+/g, '/').replace(/\/$/, '');
		}
		
		const host = baseApiHost.replace(/\/$/, '');
		const path = processedUri.replace(/^\//, '');
		let fullUrl = host + '/' + path;
		
		// Add query parameters
		const queryParams = getCurrentQueryParams();
		const enabledParams = queryParams.filter(function(p) { return p.enabled && p.name; });
		if (enabledParams.length > 0) {
			const queryString = enabledParams.map(function(p) {
				return encodeURIComponent(p.name) + '=' + encodeURIComponent(p.value);
			}).join('&');
			fullUrl += '?' + queryString;
		}
		
		modalUrl.textContent = fullUrl;
		
		// Make clickable for GET/HEAD requests
		const isGetOrHead = currentRouteMethod === 'GET' || currentRouteMethod === 'HEAD';
		if (isGetOrHead) {
			modalUrl.href = fullUrl;
			modalUrl.classList.add('clickable');
		} else {
			modalUrl.removeAttribute('href');
			modalUrl.classList.remove('clickable');
		}
	}
	
	// Helper functions
	function buildDefaults(fields) {
		const defaults = {};
		for (const field of fields) {
			defaults[field.key] = field.value;
		}
		return defaults;
	}
	
	function extractPathSegments(uri) {
		const segments = [];
		const regex = /\{(\w+)\??}/g;
		let match;
		while ((match = regex.exec(uri)) !== null) {
			segments.push({
				key: match[1],
				value: '',
				isOptional: match[0].includes('?')
			});
		}
		return segments;
	}
	
	function hasChanges() {
		if (!currentRouteKey || !routeDefaults[currentRouteKey]) { return false; }
		// Include all values (even disabled) for comparison
		const current = getFormJson(modalForm, true);
		const defaults = routeDefaults[currentRouteKey];
		if (JSON.stringify(current) !== JSON.stringify(defaults)) { return true; }
		
		// Also check if any fields were disabled
		const enabledState = getFormEnabledState(modalForm);
		for (const key in enabledState) {
			if (!enabledState[key]) { return true; } // A field is disabled, so there are changes
		}
		return false;
	}
	
	function hasPathChanges() {
		if (!currentRouteKey || !currentPathSegments || currentPathSegments.length === 0) { return false; }
		const current = getFormJson(uriSegmentsForm);
		// Path segments have empty defaults, so any non-empty value is a change
		for (const key in current) {
			if (current[key] !== '') { return true; }
		}
		return false;
	}
	
	function persistParams(routeKey, params, enabledState) {
		vscode.postMessage({
			command: 'saveRequestParams',
			routeKey: routeKey,
			params: params,
			enabledState: enabledState
		});
		persistedParams[routeKey] = { values: params, enabled: enabledState };
	}
	
	function clearPersistedParams(routeKey) {
		vscode.postMessage({
			command: 'clearRequestParams',
			routeKey: routeKey
		});
		delete persistedParams[routeKey];
	}
	
	function persistPathParams(routeKey, params) {
		vscode.postMessage({
			command: 'savePathParams',
			routeKey: routeKey,
			params: params
		});
		persistedPathParams[routeKey] = params;
	}
	
	function clearPersistedPathParams(routeKey) {
		vscode.postMessage({
			command: 'clearPathParams',
			routeKey: routeKey
		});
		delete persistedPathParams[routeKey];
	}
	
	function persistCustomParams(routeKey, customParams) {
		vscode.postMessage({
			command: 'saveCustomParams',
			routeKey: routeKey,
			customParams: customParams
		});
		persistedCustomParams[routeKey] = customParams;
	}
	
	function clearPersistedCustomParams(routeKey) {
		vscode.postMessage({
			command: 'clearCustomParams',
			routeKey: routeKey
		});
		delete persistedCustomParams[routeKey];
	}
	
	function getDefaultValueForType(type) {
		switch (type) {
			case 'integer': return 0;
			case 'boolean': return true;
			case 'date': return new Date().toISOString().split('T')[0];
			case 'file': return '';
			case 'array': return [];
			case 'object': return {};
			default: return '';
		}
	}
	
	function getCurrentCustomParams() {
		const params = [];
		const customFields = customParamsList.querySelectorAll('.custom-param-field');
		for (const field of customFields) {
			const checkbox = field.querySelector('.custom-param-checkbox');
			const input = field.querySelector('input[data-type], select[data-type]');
			if (input) {
				const key = input.dataset.key;
				const type = input.dataset.type;
				let value = input.value;
				
				// Parse value based on type
				if (type === 'integer') {
					value = parseInt(value, 10) || 0;
				} else if (type === 'boolean') {
					value = value === 'true';
				} else if (type === 'array' || type === 'object') {
					try {
						value = JSON.parse(value);
					} catch {
						value = type === 'array' ? [] : {};
					}
				}
				
				params.push({ key, type, value, enabled: checkbox ? checkbox.checked : true });
			}
		}
		return params;
	}
	
	function addCustomParam(name, type, value, enabled) {
		if (!name.trim()) { return; }
		
		const field = document.createElement('div');
		field.className = 'custom-param-field';
		if (enabled === false) {
			field.classList.add('param-disabled');
		}
		
		const header = document.createElement('div');
		header.className = 'custom-param-header';
		
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'custom-param-checkbox';
		checkbox.checked = enabled !== false;
		checkbox.addEventListener('change', function() {
			if (this.checked) {
				field.classList.remove('param-disabled');
			} else {
				field.classList.add('param-disabled');
			}
			saveCustomParamsState();
		});
		header.appendChild(checkbox);
		
		const label = document.createElement('label');
		label.innerHTML = name + ' <span class="field-type">(' + type + ')</span>';
		header.appendChild(label);
		
		const removeBtn = document.createElement('button');
		removeBtn.className = 'custom-param-remove';
		removeBtn.textContent = '×';
		removeBtn.title = 'Remove parameter';
		removeBtn.addEventListener('click', function() {
			field.remove();
			updateCopyButtonState();
			saveCustomParamsState();
		});
		header.appendChild(removeBtn);
		
		field.appendChild(header);
		
		let input;
		if (type === 'boolean') {
			input = document.createElement('select');
			input.innerHTML = '<option value="true">true</option><option value="false">false</option>';
			input.value = String(value);
			input.dataset.key = name;
			input.dataset.type = type;
			input.dataset.custom = 'true';
			field.appendChild(input);
		} else if (type === 'date') {
			input = document.createElement('input');
			input.type = 'date';
			input.value = value || new Date().toISOString().split('T')[0];
			input.dataset.key = name;
			input.dataset.type = type;
			input.dataset.custom = 'true';
			field.appendChild(input);
		} else if (type === 'file') {
			input = document.createElement('input');
			input.type = 'file';
			input.dataset.key = name;
			input.dataset.type = type;
			input.dataset.custom = 'true';
			field.appendChild(input);
		} else if (type === 'array' || type === 'object') {
			// Use object editor for arrays and objects
			const wrapper = document.createElement('div');
			wrapper.className = 'object-field-wrapper';
			
			input = document.createElement('input');
			input.type = 'hidden';
			input.value = typeof value === 'string' ? value : JSON.stringify(value);
			input.dataset.key = name;
			input.dataset.type = type;
			input.dataset.custom = 'true';
			wrapper.appendChild(input);
			
			const display = document.createElement('div');
			display.className = 'object-field-display';
			display.dataset.key = name;
			display.dataset.type = type;
			const parsedValue = typeof value === 'string' ? JSON.parse(value || (type === 'array' ? '[]' : '{}')) : value;
			updateObjectFieldDisplay(display, parsedValue, type);
			
			const openEditor = function() {
				const currentValue = JSON.parse(input.value || (type === 'array' ? '[]' : '{}'));
				window.openObjectEditor(name, currentValue, type === 'array', function(newValue) {
					input.value = JSON.stringify(newValue);
					updateObjectFieldDisplay(display, newValue, type);
					saveCustomParamsState();
				});
			};
			
			display.addEventListener('click', openEditor);
			
			const editBtn = document.createElement('button');
			editBtn.type = 'button';
			editBtn.className = 'object-field-edit-btn';
			editBtn.textContent = 'Edit';
			editBtn.addEventListener('click', openEditor);
			
			wrapper.appendChild(display);
			wrapper.appendChild(editBtn);
			field.appendChild(wrapper);
		} else {
			input = document.createElement('input');
			input.type = type === 'integer' ? 'number' : 'text';
			input.value = value;
			input.dataset.key = name;
			input.dataset.type = type;
			input.dataset.custom = 'true';
			field.appendChild(input);
		}
		
		customParamsList.appendChild(field);
		updateCopyButtonState();
		saveCustomParamsState();
	}
	
	function renderCustomParams(params) {
		customParamsList.innerHTML = '';
		if (params && params.length > 0) {
			for (const param of params) {
				addCustomParam(param.key, param.type, param.value, param.enabled);
			}
		}
	}
	
	function saveCustomParamsState() {
		if (currentRouteKey) {
			const customParams = getCurrentCustomParams();
			customParamsState[currentRouteKey] = customParams;
			
			if (customParams.length > 0) {
				persistCustomParams(currentRouteKey, customParams);
				hasPersistedCustomState = true;
			} else if (hasPersistedCustomState) {
				clearPersistedCustomParams(currentRouteKey);
				hasPersistedCustomState = false;
			}
		}
	}
	
	// Query params functions
	function persistQueryParams(routeKey, queryParams) {
		vscode.postMessage({
			command: 'saveQueryParams',
			routeKey: routeKey,
			queryParams: queryParams
		});
		persistedQueryParams[routeKey] = queryParams;
	}
	
	function clearPersistedQueryParams(routeKey) {
		vscode.postMessage({
			command: 'clearQueryParams',
			routeKey: routeKey
		});
		delete persistedQueryParams[routeKey];
	}
	
	function getCurrentQueryParams() {
		const params = [];
		const items = queryParamsList.querySelectorAll('.query-param-item');
		for (const item of items) {
			const checkbox = item.querySelector('.query-param-checkbox');
			const nameInput = item.querySelector('.query-param-name');
			const valueInput = item.querySelector('.query-param-value');
			if (nameInput && valueInput && nameInput.value.trim()) {
				params.push({ 
					name: nameInput.value.trim(), 
					value: valueInput.value,
					enabled: checkbox ? checkbox.checked : true
				});
			}
		}
		return params;
	}
	
	function addQueryParam(name, value, enabled) {
		const item = document.createElement('div');
		item.className = 'query-param-item';
		if (enabled === false) {
			item.classList.add('param-disabled');
		}
		
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'query-param-checkbox';
		checkbox.checked = enabled !== false;
		checkbox.addEventListener('change', function() {
			if (this.checked) {
				item.classList.remove('param-disabled');
			} else {
				item.classList.add('param-disabled');
			}
			saveQueryParamsState();
			updateUrlDisplay(currentRouteUri);
		});
		item.appendChild(checkbox);
		
		const nameInput = document.createElement('input');
		nameInput.type = 'text';
		nameInput.className = 'query-param-name';
		nameInput.value = name || '';
		nameInput.placeholder = 'Name';
		nameInput.addEventListener('input', function() {
			saveQueryParamsState();
			updateUrlDisplay(currentRouteUri);
		});
		item.appendChild(nameInput);
		
		const valueInput = document.createElement('input');
		valueInput.type = 'text';
		valueInput.className = 'query-param-value';
		valueInput.value = value || '';
		valueInput.placeholder = 'Value';
		valueInput.addEventListener('input', function() {
			saveQueryParamsState();
			updateUrlDisplay(currentRouteUri);
		});
		item.appendChild(valueInput);
		
		const removeBtn = document.createElement('button');
		removeBtn.className = 'query-param-remove';
		removeBtn.textContent = '×';
		removeBtn.title = 'Remove parameter';
		removeBtn.addEventListener('click', function() {
			item.remove();
			updateQueryParamsCount();
			saveQueryParamsState();
			updateUrlDisplay(currentRouteUri);
		});
		item.appendChild(removeBtn);
		
		queryParamsList.appendChild(item);
		updateQueryParamsCount();
	}
	
	function renderQueryParams(params) {
		queryParamsList.innerHTML = '';
		if (params && params.length > 0) {
			for (const param of params) {
				addQueryParam(param.name, param.value, param.enabled);
			}
		}
		updateQueryParamsCount();
	}
	
	function updateQueryParamsCount() {
		const count = queryParamsList.querySelectorAll('.query-param-item').length;
		queryParamsCount.textContent = count > 0 ? count : '';
	}
	
	function saveQueryParamsState() {
		if (currentRouteKey) {
			const queryParams = getCurrentQueryParams();
			queryParamsState[currentRouteKey] = queryParams;
			
			if (queryParams.length > 0) {
				persistQueryParams(currentRouteKey, queryParams);
				hasPersistedQueryState = true;
			} else if (hasPersistedQueryState) {
				clearPersistedQueryParams(currentRouteKey);
				hasPersistedQueryState = false;
			}
		}
	}
	
	function updateCopyButtonState() {
		const hasFields = modalForm.querySelectorAll('.form-field').length > 0;
		const hasCustomParams = customParamsList.querySelectorAll('.custom-param-field').length > 0;
		modalCopy.disabled = !hasFields && !hasCustomParams;
		updateRequestBodyCount();
	}
	
	function updateRequestBodyCount() {
		const fieldCount = modalForm.querySelectorAll('.form-field').length;
		const customCount = customParamsList.querySelectorAll('.custom-param-field').length;
		const total = fieldCount + customCount;
		if (requestBodyCount) {
			requestBodyCount.textContent = total > 0 ? total : '';
		}
	}
	
	function submitRequest(method, uri, bodyParams, pathParams, disabledParams, queryParams) {
		// Get bearer token from modal dropdown
		const modalAuthSelect = document.getElementById('modal-auth-select');
		const selectedTokenName = modalAuthSelect ? modalAuthSelect.value : '';
		const bearerToken = selectedTokenName && typeof window.getBearerTokenByName === 'function'
			? window.getBearerTokenByName(selectedTokenName)
			: null;
		
		// Get custom headers from the headers modal
		const customHeaders = {};
		if (typeof window.getCustomRequestHeaders === 'function') {
			const headers = window.getCustomRequestHeaders();
			for (const h of headers) {
				if (h.key) {
					customHeaders[h.key] = h.value;
				}
			}
		}
		
		vscode.postMessage({
			command: 'executeRequest',
			method: method,
			uri: uri,
			bodyParams: bodyParams,
			pathParams: pathParams,
			disabledParams: disabledParams,
			queryParams: queryParams,
			bearerToken: bearerToken,
			customHeaders: customHeaders
		});
	}
	
	function saveFormState() {
		if (currentRouteKey) {
			// Save body params
			if (currentRouteFields && currentRouteFields.length > 0) {
				const currentValues = getFormJson(modalForm, true); // Include all values
				const enabledState = getFormEnabledState(modalForm);
				sessionState[currentRouteKey] = { values: currentValues, enabled: enabledState };
				
				// If values differ from defaults, persist to workspace state
				if (hasChanges()) {
					persistParams(currentRouteKey, currentValues, enabledState);
					hasPersistedState = true;
				}
			}
			
			// Save path params
			if (currentPathSegments && currentPathSegments.length > 0) {
				const pathValues = getFormJson(uriSegmentsForm);
				pathSessionState[currentRouteKey] = pathValues;
				
				// Persist path params if any have values
				if (hasPathChanges()) {
					persistPathParams(currentRouteKey, pathValues);
					hasPersistedPathState = true;
				}
			}
		}
	}
	
	function closeModal() {
		saveFormState();
		stopServerPolling();
		modalOverlay.classList.remove('active');
	}
	
	function resetToDefaults() {
		if (!currentRouteKey) { return; }
		
		// Clear persisted body params
		if (currentRouteFields && currentRouteFields.length > 0) {
			clearPersistedParams(currentRouteKey);
			delete sessionState[currentRouteKey];
			hasPersistedState = false;
			
			// Rebuild body form with defaults (all enabled)
			modalForm.innerHTML = '';
			for (const field of currentRouteFields) {
				const fieldEl = createFormField(field.key, field.value, field.type, validateFormField, true, true);
				modalForm.appendChild(fieldEl);
			}
		}
		
		// Clear persisted path params
		if (currentPathSegments && currentPathSegments.length > 0) {
			clearPersistedPathParams(currentRouteKey);
			delete pathSessionState[currentRouteKey];
			hasPersistedPathState = false;
			
			// Rebuild path segments form with empty defaults (no checkbox for path params)
			uriSegmentsForm.innerHTML = '';
			for (const segment of currentPathSegments) {
				const fieldEl = createFormField(segment.key, '', 'string', null, false);
				// Add placeholder for optional segments
				const input = fieldEl.querySelector('input');
				if (input) {
					if (segment.isOptional) {
						input.placeholder = '(optional)';
					}
					// Update URL display when path param changes
					input.addEventListener('input', function() {
						updateUrlDisplay(currentRouteUri);
					});
				}
				uriSegmentsForm.appendChild(fieldEl);
			}
			// Update URL display after reset
			updateUrlDisplay(currentRouteUri);
		}
		
		// Clear custom params
		clearPersistedCustomParams(currentRouteKey);
		delete customParamsState[currentRouteKey];
		hasPersistedCustomState = false;
		customParamsList.innerHTML = '';
		
		// Clear query params
		clearPersistedQueryParams(currentRouteKey);
		delete queryParamsState[currentRouteKey];
		hasPersistedQueryState = false;
		queryParamsList.innerHTML = '';
		updateQueryParamsCount();
		
		// Update title to remove saved indicator
		const paramCount = currentRouteFields ? currentRouteFields.length : 0;
		modalTitle.innerHTML = paramCount > 0 
			? 'Request Body (' + paramCount + ' param' + (paramCount !== 1 ? 's' : '') + ')'
			: 'Request Body';
		
		// Hide reset button
		modalReset.style.display = 'none';
		
		// Update copy button state
		updateCopyButtonState();
		
		copySuccess.classList.remove('show');
		jsonError.classList.remove('show');
	}
	
	// Open modal function (exposed globally)
	window.openModal = function(method, uri, fieldsJson, defaultQueryParams) {
		currentRouteKey = method + ' ' + uri;
		currentFieldsJson = fieldsJson;
		currentRouteMethod = method.split('|')[0].toUpperCase();
		currentRouteUri = uri;
		
		// Parse fields and build form
		const fields = JSON.parse(fieldsJson);
		currentRouteFields = fields;
		modalForm.innerHTML = '';
		
		// Extract and handle path segments
		currentPathSegments = extractPathSegments(uri);
		uriSegmentsForm.innerHTML = '';
		
		// Store defaults for this route
		routeDefaults[currentRouteKey] = buildDefaults(fields);
		
		// Check if we have persisted state for this route
		const persisted = persistedParams[currentRouteKey];
		hasPersistedState = !!persisted;
		
		// Get persisted values and enabled state
		let persistedValues = null;
		let persistedEnabled = null;
		if (persisted) {
			// Handle both old format (just values) and new format (values + enabled)
			if (persisted.values) {
				persistedValues = persisted.values;
				persistedEnabled = persisted.enabled || {};
			} else {
				persistedValues = persisted;
				persistedEnabled = {};
			}
		}
		
		// Get session state values and enabled state
		let sessionValues = null;
		let sessionEnabled = null;
		if (sessionState[currentRouteKey]) {
			if (sessionState[currentRouteKey].values) {
				sessionValues = sessionState[currentRouteKey].values;
				sessionEnabled = sessionState[currentRouteKey].enabled || {};
			} else {
				sessionValues = sessionState[currentRouteKey];
				sessionEnabled = {};
			}
		}
		
		const persistedPath = persistedPathParams[currentRouteKey];
		hasPersistedPathState = !!persistedPath;
		
		// Handle URI segments section (no checkboxes for path params)
		if (currentPathSegments.length > 0) {
			uriSegmentsSection.style.display = 'block';
			
			for (const segment of currentPathSegments) {
				// Priority: persisted > session > default (empty)
				let value = '';
				if (persistedPath && persistedPath.hasOwnProperty(segment.key)) {
					value = persistedPath[segment.key];
				} else if (pathSessionState[currentRouteKey] && pathSessionState[currentRouteKey].hasOwnProperty(segment.key)) {
					value = pathSessionState[currentRouteKey][segment.key];
				}
				
				const fieldEl = createFormField(segment.key, value, 'string', null, false);
				// Add placeholder for optional segments
				const input = fieldEl.querySelector('input');
				if (input) {
					if (segment.isOptional) {
						input.placeholder = '(optional)';
					}
					// Update URL display when path param changes
					input.addEventListener('input', function() {
						updateUrlDisplay(uri);
					});
				}
				uriSegmentsForm.appendChild(fieldEl);
			}
		} else {
			uriSegmentsSection.style.display = 'none';
		}
		
		// Update title with param count
		const paramCount = fields.length;
		let titleText = paramCount > 0 
			? 'Request Body (' + paramCount + ' param' + (paramCount !== 1 ? 's' : '') + ')'
			: 'Request Body';
		
		if (hasPersistedState || hasPersistedPathState) {
			titleText += ' <span class="persisted-indicator">● saved</span>';
		}
		
		modalTitle.innerHTML = titleText;
		modalSubtitle.textContent = method + ' ' + uri;
		updateUrlDisplay(uri);
		
		// Show/hide reset button
		modalReset.style.display = (hasPersistedState || hasPersistedPathState) ? 'inline-block' : 'none';
		
		// Handle request body section visibility and state based on HTTP method
		const isGetOrHead = currentRouteMethod === 'GET' || currentRouteMethod === 'HEAD';
		
		if (requestBodySection) {
			if (isGetOrHead) {
				// Hide request body section for GET/HEAD requests
				requestBodySection.style.display = 'none';
			} else {
				// Show request body section for other methods
				requestBodySection.style.display = 'block';
				// Default to open for POST/PUT/PATCH/DELETE
				requestBodySection.classList.add('open');
			}
		}
		
		// Update request body count badge
		const totalBodyParams = fields.length;
		if (requestBodyCount) {
			requestBodyCount.textContent = totalBodyParams > 0 ? totalBodyParams : '';
		}
		
		if (fields.length === 0) {
			modalForm.innerHTML = '<div style="color: var(--vscode-descriptionForeground); font-style: italic;">No request parameters</div>';
			modalCopy.disabled = true;
		} else {
			modalCopy.disabled = false;
			for (const field of fields) {
				// Priority: persisted > session > default
				let value = field.value;
				let enabled = true;
				
				if (persistedValues && persistedValues.hasOwnProperty(field.key)) {
					value = persistedValues[field.key];
					if (persistedEnabled && persistedEnabled.hasOwnProperty(field.key)) {
						enabled = persistedEnabled[field.key];
					}
				} else if (sessionValues && sessionValues.hasOwnProperty(field.key)) {
					value = sessionValues[field.key];
					if (sessionEnabled && sessionEnabled.hasOwnProperty(field.key)) {
						enabled = sessionEnabled[field.key];
					}
				}
				const fieldEl = createFormField(field.key, value, field.type, validateFormField, true, enabled);
				modalForm.appendChild(fieldEl);
			}
		}
		
		modalOverlay.classList.add('active');
		copySuccess.classList.remove('show');
		jsonError.classList.remove('show');
		
		// Load query params for this route
		const persistedQuery = persistedQueryParams[currentRouteKey];
		hasPersistedQueryState = !!persistedQuery;
		const sessionQuery = queryParamsState[currentRouteKey];
		
		// Priority: persisted > session > defaultQueryParams (from route validators for GET/HEAD)
		const queryToRender = persistedQuery || sessionQuery || (defaultQueryParams || []);
		renderQueryParams(queryToRender);
		
		// Update URL display after query params are rendered
		updateUrlDisplay(uri);
		
		// Clear add query param inputs
		addQueryParamName.value = '';
		addQueryParamValue.value = '';
		
		// For GET/HEAD with query params, expand the query params section
		if (isGetOrHead && queryToRender.length > 0) {
			queryParamsSection.classList.add('open');
		} else {
			// Collapse query params section by default for other methods
			queryParamsSection.classList.remove('open');
		}
		
		// Load custom params for this route
		const persistedCustom = persistedCustomParams[currentRouteKey];
		hasPersistedCustomState = !!persistedCustom;
		const sessionCustom = customParamsState[currentRouteKey];
		
		// Priority: persisted > session
		const customToRender = persistedCustom || sessionCustom || [];
		renderCustomParams(customToRender);
		
		// Clear add param inputs
		addParamName.value = '';
		addParamType.value = 'string';
		
		// Update copy button state
		updateCopyButtonState();
		
		// Update reset button to show if any state is persisted
		modalReset.style.display = (hasPersistedState || hasPersistedPathState || hasPersistedCustomState || hasPersistedQueryState) ? 'inline-block' : 'none';
		
		// Sync auth token dropdown
		if (typeof window.syncModalAuthDropdown === 'function') {
			window.syncModalAuthDropdown();
		}
		
		// Check server status when modal opens
		checkServerStatus();
	};
	
	// Event listeners
	modalClose.addEventListener('click', closeModal);
	modalCloseBtn.addEventListener('click', closeModal);
	modalReset.addEventListener('click', resetToDefaults);
	
	// Toggle query params section
	queryParamsHeader.addEventListener('click', function() {
		queryParamsSection.classList.toggle('open');
	});
	
	// Toggle request body section
	if (requestBodyHeader) {
		requestBodyHeader.addEventListener('click', function() {
			requestBodySection.classList.toggle('open');
		});
	}
	
	// Add query parameter
	addQueryParamBtn.addEventListener('click', function() {
		const name = addQueryParamName.value.trim();
		const value = addQueryParamValue.value;
		if (name) {
			addQueryParam(name, value);
			addQueryParamName.value = '';
			addQueryParamValue.value = '';
			addQueryParamName.focus();
			saveQueryParamsState();
			updateUrlDisplay(currentRouteUri);
		}
	});
	
	// Allow Enter key to add query param
	addQueryParamValue.addEventListener('keydown', function(e) {
		if (e.key === 'Enter') {
			addQueryParamBtn.click();
		}
	});
	
	// Add custom parameter
	addParamBtn.addEventListener('click', function() {
		const name = addParamName.value.trim();
		const type = addParamType.value;
		if (name) {
			addCustomParam(name, type, getDefaultValueForType(type));
			addParamName.value = '';
			addParamType.value = 'string';
			addParamName.focus();
		}
	});
	
	// Allow Enter key to add param
	addParamName.addEventListener('keydown', function(e) {
		if (e.key === 'Enter') {
			addParamBtn.click();
		}
	});
	
	// Send request from modal
	modalSend.addEventListener('click', function() {
		// Check for validation errors in body params
		const invalidFields = modalForm.querySelectorAll('input.invalid');
		if (invalidFields.length > 0) {
			jsonError.textContent = 'Please fix validation errors before sending';
			jsonError.classList.add('show');
			return;
		}
		
		const bodyParams = getFormJson(modalForm);
		const disabledParams = getDisabledParams(modalForm);
		const pathParams = currentPathSegments && currentPathSegments.length > 0 
			? getFormJson(uriSegmentsForm) 
			: {};
		
		// Add custom params to bodyParams
		const customParams = getCurrentCustomParams();
		for (const param of customParams) {
			bodyParams[param.key] = param.value;
		}
		
		// Get query params
		const queryParams = getCurrentQueryParams();
		
		saveFormState();
		saveCustomParamsState();
		saveQueryParamsState();
		
		// Extract method and uri from current route key
		const [method, ...uriParts] = currentRouteKey.split(' ');
		const uri = uriParts.join(' ');
		
		submitRequest(method, uri, bodyParams, pathParams, disabledParams, queryParams);
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
		
		const bodyParams = getFormJson(modalForm);
		
		// Add custom params
		const customParams = getCurrentCustomParams();
		for (const param of customParams) {
			bodyParams[param.key] = param.value;
		}
		
		const json = JSON.stringify(bodyParams, null, 2);
		navigator.clipboard.writeText(json).then(function() {
			copySuccess.classList.add('show');
			jsonError.classList.remove('show');
			setTimeout(function() {
				copySuccess.classList.remove('show');
			}, 2000);
		});
	});
	
	// Copy cURL functionality
	modalCopyCurl.addEventListener('click', function() {
		// Build the cURL command from current form state
		const bodyParams = getFormJson(modalForm);
		
		// Add custom params (only enabled ones)
		const customParams = getCurrentCustomParams();
		for (const param of customParams) {
			if (param.enabled !== false) {
				bodyParams[param.key] = param.value;
			}
		}
		
		// Get path params
		const pathParams = getFormJson(uriSegmentsForm);
		
		// Get disabled field params
		const disabledParams = getDisabledParams(modalForm);
		
		// Get query params
		const queryParams = getCurrentQueryParams();
		
		// Get bearer token (value, not name)
		const authSelect = document.getElementById('modal-auth-select');
		const selectedTokenName = authSelect ? authSelect.value : '';
		const bearerToken = selectedTokenName && typeof window.getBearerTokenByName === 'function'
			? window.getBearerTokenByName(selectedTokenName)
			: '';
		
		// Get custom headers from the headers modal
		const customHeaders = {};
		if (typeof window.getCustomRequestHeaders === 'function') {
			const headers = window.getCustomRequestHeaders();
			for (const h of headers) {
				if (h.key) {
					customHeaders[h.key] = h.value;
				}
			}
		}
		
		// Extract method and uri from current route key
		const [method, ...uriParts] = currentRouteKey.split(' ');
		let uri = uriParts.join(' ');
		
		// Replace path parameters in URI
		for (const [key, value] of Object.entries(pathParams)) {
			if (value) {
				uri = uri.replace('{' + key + '}', value);
				uri = uri.replace('{' + key + '?}', value);
			}
		}
		// Remove unfilled optional params
		uri = uri.replace(/\{\w+\?\}/g, '').replace(/\/+/g, '/').replace(/\/$/, '');
		
		// Request the API host from the extension
		vscode.postMessage({
			command: 'buildCurl',
			method: method,
			uri: uri,
			bodyParams: bodyParams,
			queryParams: queryParams,
			bearerToken: bearerToken,
			disabledParams: disabledParams,
			customHeaders: customHeaders
		});
	});
	
	// Escape key to close modal
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
			closeModal();
		}
	});
	} catch (err) {
		console.error('[Outbound] Error initializing request modal:', err);
	}
}
