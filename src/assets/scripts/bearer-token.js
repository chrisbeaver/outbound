/**
 * Bearer token management script
 * Handles storing and selecting auth tokens
 */

// Bearer token state
let bearerTokens = {};
let selectedTokenName = null;
let tokenToDelete = null;

/**
 * Initialize the bearer token manager
 * @param {object} config - Configuration object
 * @param {object} config.vscode - VS Code API instance
 * @param {object} config.persistedTokens - Persisted tokens from workspace state
 * @param {string} config.selectedToken - Currently selected token name
 */
function initBearerToken(config) {
	const { vscode, persistedTokens, selectedToken } = config;
	
	bearerTokens = persistedTokens || {};
	selectedTokenName = selectedToken || null;
	
	// Get DOM elements
	const modalOverlay = document.getElementById('bearer-modal-overlay');
	const modalClose = document.getElementById('bearer-modal-close');
	const modalDone = document.getElementById('bearer-modal-done');
	const tokenList = document.getElementById('bearer-token-list');
	const tokenNameInput = document.getElementById('bearer-token-name');
	const tokenValueInput = document.getElementById('bearer-token-value');
	const addBtn = document.getElementById('bearer-add-btn');
	const headerSelect = document.getElementById('bearer-header-select');
	const headerSettings = document.getElementById('bearer-header-settings');
	const bearerStatus = document.getElementById('bearer-status');
	
	// Confirmation dialog elements
	const confirmOverlay = document.getElementById('bearer-confirm-overlay');
	const confirmName = document.getElementById('bearer-confirm-name');
	const confirmCancel = document.getElementById('bearer-confirm-cancel');
	const confirmDelete = document.getElementById('bearer-confirm-delete');
	
	/**
	 * Update the token list display
	 */
	function updateTokenList() {
		const tokenNames = Object.keys(bearerTokens);
		
		if (tokenNames.length === 0) {
			tokenList.innerHTML = '<div class="bearer-no-tokens">No tokens saved yet</div>';
		} else {
			tokenList.innerHTML = tokenNames.map(name => {
				const token = bearerTokens[name];
				const preview = token.length > 30 ? token.substring(0, 30) + '...' : token;
				return `
					<div class="bearer-token-item" data-name="${escapeHtml(name)}">
						<div class="bearer-token-info">
							<div class="bearer-token-name">${escapeHtml(name)}</div>
							<div class="bearer-token-preview">${escapeHtml(preview)}</div>
						</div>
						<button class="bearer-token-delete" data-name="${escapeHtml(name)}" title="Delete token">🗑️</button>
					</div>
				`;
			}).join('');
			
			// Add delete handlers
			tokenList.querySelectorAll('.bearer-token-delete').forEach(btn => {
				btn.addEventListener('click', function(e) {
					e.stopPropagation();
					const name = this.getAttribute('data-name');
					showDeleteConfirmation(name);
				});
			});
		}
	}
	
	/**
	 * Update the header select dropdown
	 */
	function updateHeaderSelect() {
		const tokenNames = Object.keys(bearerTokens);
		
		let options = '<option value="">No Auth</option>';
		for (const name of tokenNames) {
			const selected = name === selectedTokenName ? 'selected' : '';
			options += `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
		}
		
		headerSelect.innerHTML = options;
		updateBearerStatus();
	}
	
	/**
	 * Update the bearer status indicator
	 */
	function updateBearerStatus() {
		if (selectedTokenName && bearerTokens[selectedTokenName]) {
			bearerStatus.textContent = 'Active';
			bearerStatus.className = 'bearer-status active';
		} else {
			bearerStatus.textContent = 'None';
			bearerStatus.className = 'bearer-status inactive';
		}
	}
	
	/**
	 * Show delete confirmation dialog
	 */
	function showDeleteConfirmation(name) {
		tokenToDelete = name;
		confirmName.textContent = name;
		confirmOverlay.classList.add('active');
	}
	
	/**
	 * Hide delete confirmation dialog
	 */
	function hideDeleteConfirmation() {
		tokenToDelete = null;
		confirmOverlay.classList.remove('active');
	}
	
	/**
	 * Delete a token
	 */
	function deleteToken(name) {
		delete bearerTokens[name];
		
		// If deleted token was selected, clear selection
		if (selectedTokenName === name) {
			selectedTokenName = null;
			saveSelectedToken();
		}
		
		saveTokens();
		updateTokenList();
		updateHeaderSelect();
		hideDeleteConfirmation();
	}
	
	/**
	 * Add a new token
	 */
	function addToken(name, value) {
		if (!name.trim() || !value.trim()) {
			return false;
		}
		
		bearerTokens[name.trim()] = value.trim();
		saveTokens();
		updateTokenList();
		updateHeaderSelect();
		
		// Clear inputs
		tokenNameInput.value = '';
		tokenValueInput.value = '';
		
		return true;
	}
	
	/**
	 * Save tokens to workspace state
	 */
	function saveTokens() {
		vscode.postMessage({
			command: 'saveBearerTokens',
			tokens: bearerTokens
		});
	}
	
	/**
	 * Save selected token to workspace state
	 */
	function saveSelectedToken() {
		vscode.postMessage({
			command: 'saveSelectedToken',
			tokenName: selectedTokenName
		});
	}
	
	/**
	 * Open the modal
	 */
	function openModal() {
		updateTokenList();
		modalOverlay.classList.add('active');
	}
	
	/**
	 * Close the modal
	 */
	function closeModal() {
		modalOverlay.classList.remove('active');
	}
	
	/**
	 * Escape HTML entities
	 */
	function escapeHtml(text) {
		const div = document.createElement('div');
		div.textContent = text;
		return div.innerHTML;
	}
	
	// Initialize UI
	updateHeaderSelect();
	
	// Event listeners
	headerSettings.addEventListener('click', openModal);
	modalClose.addEventListener('click', closeModal);
	modalDone.addEventListener('click', closeModal);
	
	// Add token
	addBtn.addEventListener('click', function() {
		addToken(tokenNameInput.value, tokenValueInput.value);
	});
	
	// Allow Enter key to add token
	tokenValueInput.addEventListener('keydown', function(e) {
		if (e.key === 'Enter') {
			addToken(tokenNameInput.value, tokenValueInput.value);
		}
	});
	
	// Select token from dropdown
	headerSelect.addEventListener('change', function() {
		selectedTokenName = this.value || null;
		saveSelectedToken();
		updateBearerStatus();
	});
	
	// Confirmation dialog handlers
	confirmCancel.addEventListener('click', hideDeleteConfirmation);
	confirmDelete.addEventListener('click', function() {
		if (tokenToDelete) {
			deleteToken(tokenToDelete);
		}
	});
	
	// Close modal on escape
	document.addEventListener('keydown', function(e) {
		if (e.key === 'Escape') {
			if (confirmOverlay.classList.contains('active')) {
				hideDeleteConfirmation();
			} else if (modalOverlay.classList.contains('active')) {
				closeModal();
			}
		}
	});
	
	// Expose functions globally
	window.openBearerModal = openModal;
	window.getSelectedBearerToken = function() {
		if (selectedTokenName && bearerTokens[selectedTokenName]) {
			return bearerTokens[selectedTokenName];
		}
		return null;
	};
	window.getBearerTokenByName = function(name) {
		if (name && bearerTokens[name]) {
			return bearerTokens[name];
		}
		return null;
	};
	window.syncModalAuthDropdown = function() {
		const modalAuthSelect = document.getElementById('modal-auth-select');
		if (!modalAuthSelect) return;
		
		const tokenNames = Object.keys(bearerTokens);
		let options = '<option value="">No Auth</option>';
		for (const name of tokenNames) {
			const selected = name === selectedTokenName ? 'selected' : '';
			options += `<option value="${escapeHtml(name)}" ${selected}>${escapeHtml(name)}</option>`;
		}
		modalAuthSelect.innerHTML = options;
	};
}
