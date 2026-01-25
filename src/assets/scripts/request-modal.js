/**
 * Request modal script
 * Requires: main.js to be loaded first
 * 
 * Variables to be initialized:
 * - vscode: VS Code API instance
 * - persistedParams: Object of persisted params from workspace state
 * - persistedPathParams: Object of persisted path params from workspace state
 */

// Modal state
let currentRouteKey = null;
let currentRouteFields = null;
let currentPathSegments = null;
let currentFieldsJson = null;
let hasPersistedState = false;
let hasPersistedPathState = false;
let serverIsOnline = false;
let serverPollInterval = null;

// Default values from route definitions (rebuilt on refresh)
const routeDefaults = {};
const pathSegmentDefaults = {};

// In-memory state for current session edits (not yet saved)
const sessionState = {};
const pathSessionState = {};

/**
 * Initialize the request modal
 * @param {object} config - Configuration object
 * @param {object} config.vscode - VS Code API instance
 * @param {object} config.persistedParams - Persisted params from workspace state
 * @param {object} config.persistedPathParams - Persisted path params from workspace state
 */
function initRequestModal(config) {
	const { vscode, persistedParams, persistedPathParams } = config;
	
	// Get DOM elements
	const modalOverlay = document.getElementById('modal-overlay');
	const modalTitle = document.getElementById('modal-title');
	const modalSubtitle = document.getElementById('modal-subtitle');
	const modalForm = document.getElementById('modal-form');
	const modalClose = document.getElementById('modal-close');
	const modalCloseBtn = document.getElementById('modal-close-btn');
	const modalSend = document.getElementById('modal-send');
	const modalReset = document.getElementById('modal-reset');
	const modalCopy = document.getElementById('modal-copy');
	const copySuccess = document.getElementById('copy-success');
	const jsonError = document.getElementById('json-error');
	const serverStatusLight = document.getElementById('server-status-light');
	const serverStatusText = document.getElementById('server-status-text');
	const uriSegmentsSection = document.getElementById('uri-segments-section');
	const uriSegmentsForm = document.getElementById('uri-segments-form');
	const bodySectionTitle = document.getElementById('body-section-title');
	
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
			openModal(message.method, message.uri, message.fields);
		}
	});
	
	// Start polling server status every second
	function startServerPolling() {
		if (serverPollInterval) return; // Already polling
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
		if (!currentRouteKey || !routeDefaults[currentRouteKey]) return false;
		// Include all values (even disabled) for comparison
		const current = getFormJson(modalForm, true);
		const defaults = routeDefaults[currentRouteKey];
		if (JSON.stringify(current) !== JSON.stringify(defaults)) return true;
		
		// Also check if any fields were disabled
		const enabledState = getFormEnabledState(modalForm);
		for (const key in enabledState) {
			if (!enabledState[key]) return true; // A field is disabled, so there are changes
		}
		return false;
	}
	
	function hasPathChanges() {
		if (!currentRouteKey || !currentPathSegments || currentPathSegments.length === 0) return false;
		const current = getFormJson(uriSegmentsForm);
		// Path segments have empty defaults, so any non-empty value is a change
		for (const key in current) {
			if (current[key] !== '') return true;
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
	
	function submitRequest(method, uri, bodyParams, pathParams, disabledParams) {
		// Get bearer token from modal dropdown
		const modalAuthSelect = document.getElementById('modal-auth-select');
		const selectedTokenName = modalAuthSelect ? modalAuthSelect.value : '';
		const bearerToken = selectedTokenName && typeof window.getBearerTokenByName === 'function'
			? window.getBearerTokenByName(selectedTokenName)
			: null;
		
		vscode.postMessage({
			command: 'executeRequest',
			method: method,
			uri: uri,
			bodyParams: bodyParams,
			pathParams: pathParams,
			disabledParams: disabledParams,
			bearerToken: bearerToken
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
		if (!currentRouteKey) return;
		
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
				if (input && segment.isOptional) {
					input.placeholder = '(optional)';
				}
				uriSegmentsForm.appendChild(fieldEl);
			}
		}
		
		// Update title to remove saved indicator
		const paramCount = currentRouteFields ? currentRouteFields.length : 0;
		modalTitle.innerHTML = paramCount > 0 
			? 'Request Body (' + paramCount + ' param' + (paramCount !== 1 ? 's' : '') + ')'
			: 'Request Body';
		
		// Hide reset button
		modalReset.style.display = 'none';
		
		copySuccess.classList.remove('show');
		jsonError.classList.remove('show');
	}
	
	// Open modal function (exposed globally)
	window.openModal = function(method, uri, fieldsJson) {
		currentRouteKey = method + ' ' + uri;
		currentFieldsJson = fieldsJson;
		
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
				if (input && segment.isOptional) {
					input.placeholder = '(optional)';
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
		
		// Show/hide reset button
		modalReset.style.display = (hasPersistedState || hasPersistedPathState) ? 'inline-block' : 'none';
		
		if (fields.length === 0) {
			modalForm.innerHTML = '<div style="color: var(--vscode-descriptionForeground); font-style: italic;">No request parameters</div>';
		} else {
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
		saveFormState();
		
		// Extract method and uri from current route key
		const [method, ...uriParts] = currentRouteKey.split(' ');
		const uri = uriParts.join(' ');
		
		submitRequest(method, uri, bodyParams, pathParams, disabledParams);
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
		
		const json = JSON.stringify(getFormJson(modalForm), null, 2);
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
}
