/**
 * Request headers modal script
 * Handles custom request headers that are sent with every request
 */

// Headers state
let customHeaders = [];

/**
 * Initialize the request headers modal
 * @param {object} config - Configuration object
 * @param {object} config.vscode - VS Code API instance
 * @param {Array} config.persistedHeaders - Persisted headers from workspace state
 */
function initRequestHeaders(config) {
	const { vscode, persistedHeaders } = config;
	
	customHeaders = persistedHeaders || [];
	
	// Get DOM elements
	const modalOverlay = document.getElementById('headers-modal-overlay');
	const modalClose = document.getElementById('headers-modal-close');
	const modalDone = document.getElementById('headers-modal-done');
	const headersList = document.getElementById('headers-list');
	const noItemsMsg = document.getElementById('headers-no-items');
	const addKeyInput = document.getElementById('headers-add-key');
	const addValueInput = document.getElementById('headers-add-value');
	const addBtn = document.getElementById('headers-add-btn');
	const authValue = document.getElementById('headers-auth-value');
	const openBtn = document.getElementById('request-headers-btn');
	
	/**
	 * Update the auth preview section
	 */
	function updateAuthPreview() {
		const bearerSelect = document.getElementById('bearer-header-select');
		const selectedTokenName = bearerSelect ? bearerSelect.value : '';
		
		if (selectedTokenName && typeof window.getBearerTokenByName === 'function') {
			const token = window.getBearerTokenByName(selectedTokenName);
			if (token) {
				const preview = token.length > 50 ? 'Bearer ' + token.substring(0, 50) + '...' : 'Bearer ' + token;
				authValue.textContent = preview;
				authValue.title = 'Bearer ' + token;
			} else {
				authValue.textContent = 'No auth token selected';
				authValue.title = '';
			}
		} else {
			authValue.textContent = 'No auth token selected';
			authValue.title = '';
		}
	}
	
	/**
	 * Update the headers list display
	 */
	function updateHeadersList() {
		if (customHeaders.length === 0) {
			noItemsMsg.style.display = 'block';
			// Remove any existing header items
			const existingItems = headersList.querySelectorAll('.headers-item');
			existingItems.forEach(item => item.remove());
		} else {
			noItemsMsg.style.display = 'none';
			
			// Clear and rebuild list
			const existingItems = headersList.querySelectorAll('.headers-item');
			existingItems.forEach(item => item.remove());
			
			customHeaders.forEach((header, index) => {
				const item = createHeaderItem(header, index);
				headersList.appendChild(item);
			});
		}
	}
	
	/**
	 * Create a header item element
	 */
	function createHeaderItem(header, index) {
		const item = document.createElement('div');
		item.className = 'headers-item';
		if (!header.enabled) {
			item.classList.add('headers-disabled');
		}
		item.dataset.index = index;
		
		// Checkbox for enable/disable
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'headers-item-checkbox';
		checkbox.checked = header.enabled !== false;
		checkbox.addEventListener('change', function() {
			const idx = parseInt(item.dataset.index, 10);
			customHeaders[idx].enabled = this.checked;
			if (this.checked) {
				item.classList.remove('headers-disabled');
			} else {
				item.classList.add('headers-disabled');
			}
			saveHeaders();
		});
		item.appendChild(checkbox);
		
		// Key input
		const keyDiv = document.createElement('div');
		keyDiv.className = 'headers-item-key';
		const keyInput = document.createElement('input');
		keyInput.type = 'text';
		keyInput.value = header.key;
		keyInput.placeholder = 'Header name';
		keyInput.addEventListener('input', function() {
			const idx = parseInt(item.dataset.index, 10);
			customHeaders[idx].key = this.value;
			saveHeaders();
		});
		keyDiv.appendChild(keyInput);
		item.appendChild(keyDiv);
		
		// Value input
		const valueDiv = document.createElement('div');
		valueDiv.className = 'headers-item-value';
		const valueInput = document.createElement('input');
		valueInput.type = 'text';
		valueInput.value = header.value;
		valueInput.placeholder = 'Header value';
		valueInput.addEventListener('input', function() {
			const idx = parseInt(item.dataset.index, 10);
			customHeaders[idx].value = this.value;
			saveHeaders();
		});
		valueDiv.appendChild(valueInput);
		item.appendChild(valueDiv);
		
		// Delete button
		const deleteBtn = document.createElement('button');
		deleteBtn.className = 'headers-item-delete';
		deleteBtn.textContent = '🗑️';
		deleteBtn.title = 'Delete header';
		deleteBtn.addEventListener('click', function() {
			const idx = parseInt(item.dataset.index, 10);
			customHeaders.splice(idx, 1);
			saveHeaders();
			updateHeadersList();
		});
		item.appendChild(deleteBtn);
		
		return item;
	}
	
	/**
	 * Add a new header
	 */
	function addHeader() {
		const key = addKeyInput.value.trim();
		const value = addValueInput.value.trim();
		
		if (!key) {
			addKeyInput.focus();
			return;
		}
		
		customHeaders.push({
			key: key,
			value: value,
			enabled: true
		});
		
		saveHeaders();
		updateHeadersList();
		
		// Clear inputs
		addKeyInput.value = '';
		addValueInput.value = '';
		addKeyInput.focus();
	}
	
	/**
	 * Save headers to workspace state
	 */
	function saveHeaders() {
		vscode.postMessage({
			command: 'saveRequestHeaders',
			headers: customHeaders
		});
	}
	
	/**
	 * Open the modal
	 */
	function openModal() {
		updateAuthPreview();
		updateHeadersList();
		modalOverlay.classList.add('active');
	}
	
	/**
	 * Close the modal
	 */
	function closeModal() {
		modalOverlay.classList.remove('active');
	}
	
	// Event listeners
	if (openBtn) {
		openBtn.addEventListener('click', openModal);
	}
	
	if (modalClose) {
		modalClose.addEventListener('click', closeModal);
	}
	
	if (modalDone) {
		modalDone.addEventListener('click', closeModal);
	}
	
	if (addBtn) {
		addBtn.addEventListener('click', addHeader);
	}
	
	// Allow Enter key to add header
	if (addKeyInput) {
		addKeyInput.addEventListener('keydown', function(e) {
			if (e.key === 'Enter') {
				e.preventDefault();
				addHeader();
			}
		});
	}
	
	if (addValueInput) {
		addValueInput.addEventListener('keydown', function(e) {
			if (e.key === 'Enter') {
				e.preventDefault();
				addHeader();
			}
		});
	}
	
	// Close on overlay click
	if (modalOverlay) {
		modalOverlay.addEventListener('click', function(e) {
			if (e.target === modalOverlay) {
				closeModal();
			}
		});
	}
	
	// Close on Escape key
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape' && modalOverlay.classList.contains('active')) {
			closeModal();
		}
	});
	
	// Export function to get current headers for requests
	window.getCustomRequestHeaders = function() {
		return customHeaders.filter(h => h.enabled !== false && h.key);
	};
	
	// Initialize display
	updateHeadersList();
}
