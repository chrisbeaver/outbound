/**
 * Routes table script
 * Requires: main.js to be loaded first
 * 
 * Variables passed from panel:
 * - vscode: VS Code API instance
 * - openModal: function to open request modal
 */

/**
 * Initialize the routes table functionality
 */
function initRoutesTable() {
	// Initialize search
	initTableSearch('search', 'routes-table');
	
	// Settings button - open extension workspace settings
	const settingsBtn = document.getElementById('header-settings-btn');
	if (settingsBtn) {
		settingsBtn.addEventListener('click', function() {
			vscode.postMessage({ command: 'openExtensionSettings' });
		});
	}
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initRoutesTable);
} else {
	initRoutesTable();
}
