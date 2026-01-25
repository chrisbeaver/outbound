/**
 * Main/shared script utilities for webview
 * @param {object} vscode - VS Code API instance from acquireVsCodeApi()
 */

/**
 * Initialize search functionality for a table
 * @param {string} searchInputId - ID of the search input element
 * @param {string} tableId - ID of the table to filter
 */
function initTableSearch(searchInputId, tableId) {
	const searchInput = document.getElementById(searchInputId);
	const table = document.getElementById(tableId);
	
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
}

/**
 * Update the display for an object/array field
 * @param {HTMLElement} display - Display element
 * @param {*} value - Current value
 * @param {string} type - Field type (array or object)
 */
function updateObjectFieldDisplay(display, value, type) {
	if (type === 'array') {
		const count = Array.isArray(value) ? value.length : 0;
		display.innerHTML = '<span class="object-field-icon">[ ]</span> ' + count + ' item' + (count !== 1 ? 's' : '');
	} else {
		const count = value && typeof value === 'object' ? Object.keys(value).length : 0;
		display.innerHTML = '<span class="object-field-icon">{ }</span> ' + count + ' field' + (count !== 1 ? 's' : '');
	}
}

/**
 * Create a form field element
 * @param {string} key - Field name/key
 * @param {*} value - Field value
 * @param {string} type - Field type (string, integer, boolean, array, object, etc.)
 * @param {function} onValidate - Validation callback
 * @param {boolean} showEnableCheckbox - Whether to show enable/disable checkbox
 * @param {boolean} enabled - Initial enabled state (default true)
 * @returns {HTMLElement} Form field element
 */
function createFormField(key, value, type, onValidate, showEnableCheckbox, enabled) {
	const div = document.createElement('div');
	div.className = 'form-field';
	
	// Default enabled to true if not specified
	if (typeof enabled === 'undefined') {
		enabled = true;
	}
	
	const labelContainer = document.createElement('div');
	labelContainer.className = 'form-field-header';
	
	// Enable/disable checkbox (only for body params, not path segments)
	if (showEnableCheckbox) {
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.className = 'field-enable-checkbox';
		checkbox.checked = enabled;
		checkbox.dataset.key = key;
		checkbox.addEventListener('change', function() {
			if (this.checked) {
				div.classList.remove('field-disabled');
			} else {
				div.classList.add('field-disabled');
			}
		});
		labelContainer.appendChild(checkbox);
		
		// Apply initial disabled state
		if (!enabled) {
			div.classList.add('field-disabled');
		}
	}
	
	const label = document.createElement('label');
	label.innerHTML = key + ' <span class="field-type">(' + type + ')</span>';
	labelContainer.appendChild(label);
	div.appendChild(labelContainer);
	
	let input;
	
	if (type === 'boolean') {
		input = document.createElement('select');
		input.innerHTML = '<option value="true">true</option><option value="false">false</option>';
		input.value = String(value);
	} else if (type === 'array' || type === 'object') {
		// Create a clickable field that opens the object editor
		const wrapper = document.createElement('div');
		wrapper.className = 'object-field-wrapper';
		
		input = document.createElement('input');
		input.type = 'hidden';
		input.value = JSON.stringify(value);
		input.dataset.key = key;
		input.dataset.type = type;
		wrapper.appendChild(input);
		
		const display = document.createElement('div');
		display.className = 'object-field-display';
		display.dataset.key = key;
		display.dataset.type = type;
		updateObjectFieldDisplay(display, value, type);
		
		// Open editor on click
		const openEditor = function() {
			const currentValue = JSON.parse(input.value);
			window.openObjectEditor(key, currentValue, type === 'array', function(newValue) {
				input.value = JSON.stringify(newValue);
				updateObjectFieldDisplay(display, newValue, type);
				if (onValidate) {
					onValidate({ target: input });
				}
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
		div.appendChild(wrapper);
		
		const errorSpan = document.createElement('span');
		errorSpan.className = 'field-error';
		div.appendChild(errorSpan);
		
		return div;
	} else {
		input = document.createElement('input');
		input.type = 'text';
		input.value = value;
	}
	
	input.dataset.key = key;
	input.dataset.type = type;
	if (onValidate) {
		input.addEventListener('input', onValidate);
	}
	div.appendChild(input);
	
	const errorSpan = document.createElement('span');
	errorSpan.className = 'field-error';
	div.appendChild(errorSpan);
	
	return div;
}

/**
 * Validate a form field based on its type
 * @param {Event} e - Input event
 */
function validateFormField(e) {
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

/**
 * Get JSON object from form inputs
 * @param {HTMLElement} formElement - Form container element
 * @param {boolean} includeDisabled - Whether to include disabled fields (default false)
 * @returns {object} JSON object with form values
 */
function getFormJson(formElement, includeDisabled) {
	const result = {};
	const formFields = formElement.querySelectorAll('.form-field');
	
	for (const field of formFields) {
		// Skip disabled fields unless includeDisabled is true
		if (!includeDisabled && field.classList.contains('field-disabled')) {
			continue;
		}
		
		// Find the actual input (not the checkbox), by looking for data-type attribute
		const input = field.querySelector('input[data-type], select[data-type]');
		if (!input) {
			continue;
		}
		
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

/**
 * Get enabled state for all form fields
 * @param {HTMLElement} formElement - Form container element
 * @returns {object} Object mapping field keys to enabled state
 */
function getFormEnabledState(formElement) {
	const result = {};
	const checkboxes = formElement.querySelectorAll('.field-enable-checkbox');
	
	for (const checkbox of checkboxes) {
		const key = checkbox.dataset.key;
		if (key) {
			result[key] = checkbox.checked;
		}
	}
	
	return result;
}

/**
 * Get list of disabled param names
 * @param {HTMLElement} formElement - Form container element
 * @returns {string[]} Array of disabled param names
 */
function getDisabledParams(formElement) {
	const disabled = [];
	const checkboxes = formElement.querySelectorAll('.field-enable-checkbox');
	
	for (const checkbox of checkboxes) {
		if (!checkbox.checked && checkbox.dataset.key) {
			disabled.push(checkbox.dataset.key);
		}
	}
	
	return disabled;
}
