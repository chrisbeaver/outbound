/**
 * Response modal script
 * Displays API responses with syntax highlighting for JSON and HTML rendering
 */

// Response modal state
let currentResponse = null;
let currentRawBody = '';
let currentMethod = '';
let currentUri = '';

/**
 * Initialize the response modal
 * @param {object} config - Configuration object
 * @param {object} config.vscode - VS Code API instance
 */
function initResponseModal(config) {
	const { vscode } = config;
	
	// Get DOM elements
	const modalOverlay = document.getElementById('response-modal-overlay');
	const modalTitle = document.getElementById('response-modal-title');
	const responseStatus = document.getElementById('response-status');
	const responseDuration = document.getElementById('response-duration');
	const responseType = document.getElementById('response-type');
	const responseContent = document.getElementById('response-content');
	const modalClose = document.getElementById('response-modal-close');
	const modalCloseBtn = document.getElementById('response-modal-close-btn');
	const copyBtn = document.getElementById('response-copy');
	const resubmitBtn = document.getElementById('response-resubmit');
	
	// Listen for response messages from extension
	window.addEventListener('message', function(event) {
		const message = event.data;
		if (message.command === 'showResponse') {
			openResponseModal(message.response, message.method, message.uri);
		}
	});
	
	/**
	 * Open the response modal with the given response data
	 */
	function openResponseModal(response, method, uri) {
		currentResponse = response;
		currentRawBody = response.rawBody || '';
		currentMethod = method;
		currentUri = uri;
		
		// Set title
		modalTitle.textContent = `${method} ${uri}`;
		
		// Set status with appropriate styling
		const statusCode = response.statusCode || 0;
		responseStatus.textContent = `${statusCode} ${getStatusText(statusCode)}`;
		responseStatus.className = 'response-status ' + getStatusClass(statusCode);
		
		// Set duration
		responseDuration.textContent = response.duration ? `${response.duration}ms` : '';
		
		// Determine content type and render appropriately
		const contentType = detectContentType(response);
		responseType.textContent = contentType;
		
		// Render the response content
		renderResponse(response, contentType);
		
		// Show modal
		modalOverlay.classList.add('active');
	}
	
	/**
	 * Close the response modal
	 */
	function closeModal() {
		modalOverlay.classList.remove('active');
		currentResponse = null;
		currentRawBody = '';
	}
	
	/**
	 * Get HTTP status text for common status codes
	 */
	function getStatusText(code) {
		const statusTexts = {
			200: 'OK',
			201: 'Created',
			204: 'No Content',
			301: 'Moved Permanently',
			302: 'Found',
			304: 'Not Modified',
			400: 'Bad Request',
			401: 'Unauthorized',
			403: 'Forbidden',
			404: 'Not Found',
			405: 'Method Not Allowed',
			422: 'Unprocessable Entity',
			429: 'Too Many Requests',
			500: 'Internal Server Error',
			502: 'Bad Gateway',
			503: 'Service Unavailable'
		};
		return statusTexts[code] || '';
	}
	
	/**
	 * Get CSS class for status code
	 */
	function getStatusClass(code) {
		if (code >= 200 && code < 300) {
			return 'success';
		}
		if (code >= 300 && code < 400) {
			return 'redirect';
		}
		if (code >= 400 && code < 500) {
			return 'client-error';
		}
		if (code >= 500) {
			return 'server-error';
		}
		return '';
	}
	
	/**
	 * Detect content type from response headers or body
	 */
	function detectContentType(response) {
		// Check headers first
		const headers = response.headers || {};
		const contentTypeHeader = headers['content-type'] || headers['Content-Type'] || '';
		
		if (contentTypeHeader.includes('application/json')) {
			return 'JSON';
		}
		if (contentTypeHeader.includes('text/html')) {
			return 'HTML';
		}
		if (contentTypeHeader.includes('text/plain')) {
			return 'Plain Text';
		}
		if (contentTypeHeader.includes('text/xml') || contentTypeHeader.includes('application/xml')) {
			return 'XML';
		}
		
		// Try to detect from body content
		const body = response.rawBody || '';
		if (body.trim().startsWith('{') || body.trim().startsWith('[')) {
			try {
				JSON.parse(body);
				return 'JSON';
			} catch (e) {
				// Not valid JSON
			}
		}
		if (body.trim().startsWith('<!DOCTYPE') || body.trim().startsWith('<html')) {
			return 'HTML';
		}
		
		return 'Plain Text';
	}
	
	/**
	 * Render response content based on type
	 */
	function renderResponse(response, contentType) {
		responseContent.innerHTML = '';
		
		if (response.error && !response.rawBody) {
			responseContent.innerHTML = `<div class="response-error">${escapeHtml(response.error)}</div>`;
			return;
		}
		
		const body = response.rawBody || '';
		
		switch (contentType) {
			case 'JSON':
				renderJson(body);
				break;
			case 'HTML':
				renderHtml(body);
				break;
			case 'XML':
				renderPlainText(body);
				break;
			default:
				renderPlainText(body);
		}
	}
	
	/**
	 * Render JSON with syntax highlighting
	 */
	function renderJson(body) {
		try {
			const parsed = JSON.parse(body);
			const highlighted = syntaxHighlightJson(parsed, 0);
			responseContent.innerHTML = `<div class="json-viewer">${highlighted}</div>`;
		} catch (e) {
			// If parsing fails, show as plain text
			renderPlainText(body);
		}
	}
	
	/**
	 * Syntax highlight JSON recursively
	 */
	function syntaxHighlightJson(obj, indent) {
		const spaces = '  '.repeat(indent);
		const nextSpaces = '  '.repeat(indent + 1);
		
		if (obj === null) {
			return '<span class="json-null">null</span>';
		}
		
		if (typeof obj === 'boolean') {
			return `<span class="json-boolean">${obj}</span>`;
		}
		
		if (typeof obj === 'number') {
			return `<span class="json-number">${obj}</span>`;
		}
		
		if (typeof obj === 'string') {
			return `<span class="json-string">"${escapeHtml(obj)}"</span>`;
		}
		
		if (Array.isArray(obj)) {
			if (obj.length === 0) {
				return '<span class="json-bracket">[]</span>';
			}
			
			const items = obj.map((item, index) => {
				const comma = index < obj.length - 1 ? '<span class="json-comma">,</span>' : '';
				return `${nextSpaces}${syntaxHighlightJson(item, indent + 1)}${comma}`;
			}).join('\n');
			
			return `<span class="json-bracket">[</span>\n${items}\n${spaces}<span class="json-bracket">]</span>`;
		}
		
		if (typeof obj === 'object') {
			const keys = Object.keys(obj);
			if (keys.length === 0) {
				return '<span class="json-brace">{}</span>';
			}
			
			const items = keys.map((key, index) => {
				const comma = index < keys.length - 1 ? '<span class="json-comma">,</span>' : '';
				const value = syntaxHighlightJson(obj[key], indent + 1);
				return `${nextSpaces}<span class="json-key">"${escapeHtml(key)}"</span><span class="json-colon">:</span> ${value}${comma}`;
			}).join('\n');
			
			return `<span class="json-brace">{</span>\n${items}\n${spaces}<span class="json-brace">}</span>`;
		}
		
		return escapeHtml(String(obj));
	}
	
	/**
	 * Render HTML in an iframe for safety
	 */
	function renderHtml(body) {
		const iframe = document.createElement('iframe');
		iframe.className = 'response-html-frame';
		iframe.sandbox = 'allow-same-origin';
		responseContent.appendChild(iframe);
		
		// Write content to iframe
		setTimeout(() => {
			const doc = iframe.contentDocument || iframe.contentWindow.document;
			doc.open();
			doc.write(body);
			doc.close();
			
			// Adjust iframe height to content
			setTimeout(() => {
				try {
					const height = doc.documentElement.scrollHeight || doc.body.scrollHeight;
					iframe.style.height = Math.min(Math.max(height + 20, 200), 600) + 'px';
				} catch (e) {
					// Cross-origin restrictions may prevent height calculation
				}
			}, 100);
		}, 0);
	}
	
	/**
	 * Render plain text
	 */
	function renderPlainText(body) {
		responseContent.innerHTML = `<pre class="response-plain-text">${escapeHtml(body)}</pre>`;
	}
	
	/**
	 * Escape HTML entities
	 */
	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
	
	// Event listeners
	modalClose.addEventListener('click', closeModal);
	modalCloseBtn.addEventListener('click', closeModal);
	
	// Resubmit request - go back to request modal
	resubmitBtn.addEventListener('click', function() {
		if (currentMethod && currentUri) {
			closeModal();
			// Open the request modal with the same method and URI
			// Use the stored fieldsJson from the request modal
			if (typeof window.openModal === 'function' && typeof currentFieldsJson !== 'undefined' && currentFieldsJson) {
				window.openModal(currentMethod, currentUri, currentFieldsJson);
			}
		}
	});
	
	// Copy response
	copyBtn.addEventListener('click', function() {
		navigator.clipboard.writeText(currentRawBody).then(function() {
			// Could add a success indicator here
		});
	});
	
	// Escape key to close modal
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
			closeModal();
		}
	});
	
	// Expose openResponseModal globally for direct calls
	window.openResponseModal = openResponseModal;
}
