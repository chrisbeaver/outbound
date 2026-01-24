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
}

// Auto-initialize when DOM is ready
if (document.readyState === 'loading') {
	document.addEventListener('DOMContentLoaded', initRoutesTable);
} else {
	initRoutesTable();
}
