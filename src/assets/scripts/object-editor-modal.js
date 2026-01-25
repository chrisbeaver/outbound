/**
 * Object Editor Modal Script
 * A tree-based editor for nested objects and arrays
 */

// Object editor state
let objectEditorCallback = null;
let objectEditorData = null;
let objectEditorFieldName = null;
let objectEditorIsArray = false;

/**
 * Initialize the object editor modal
 */
function initObjectEditor() {
    const overlay = document.getElementById('object-editor-overlay');
    const closeBtn = document.getElementById('object-editor-close');
    const cancelBtn = document.getElementById('object-editor-cancel');
    const saveBtn = document.getElementById('object-editor-save');
    const addFieldBtn = document.getElementById('object-editor-add-field');
    const expandAllBtn = document.getElementById('object-editor-expand-all');
    const collapseAllBtn = document.getElementById('object-editor-collapse-all');
    const previewHeader = document.querySelector('.object-editor-preview-header');
    const previewSection = document.querySelector('.object-editor-preview-section');
    const tree = document.getElementById('object-editor-tree');
    
    // Close handlers
    function closeEditor() {
        overlay.classList.remove('active');
        objectEditorCallback = null;
        objectEditorData = null;
    }
    
    closeBtn.addEventListener('click', closeEditor);
    cancelBtn.addEventListener('click', closeEditor);
    
    // Click outside to close
    overlay.addEventListener('click', function(e) {
        if (e.target === overlay) {
            closeEditor();
        }
    });
    
    // Escape key to close
    document.addEventListener('keydown', function(e) {
        if (e.key === 'Escape' && overlay.classList.contains('active')) {
            closeEditor();
        }
    });
    
    // Save handler
    saveBtn.addEventListener('click', function() {
        const data = buildDataFromTree();
        if (objectEditorCallback) {
            objectEditorCallback(data);
        }
        closeEditor();
    });
    
    // Add field at root level
    addFieldBtn.addEventListener('click', function() {
        addTreeNode(tree, objectEditorIsArray);
        updatePreview();
        updateExpandCollapseButtons();
    });
    
    // Expand/collapse all
    expandAllBtn.addEventListener('click', function() {
        tree.querySelectorAll('.tree-children').forEach(function(el) {
            el.classList.add('expanded');
        });
        tree.querySelectorAll('.tree-expand-btn').forEach(function(btn) {
            btn.classList.add('expanded');
        });
    });
    
    collapseAllBtn.addEventListener('click', function() {
        tree.querySelectorAll('.tree-children').forEach(function(el) {
            el.classList.remove('expanded');
        });
        tree.querySelectorAll('.tree-expand-btn').forEach(function(btn) {
            btn.classList.remove('expanded');
        });
    });
    
    // Preview toggle
    previewHeader.addEventListener('click', function() {
        previewSection.classList.toggle('collapsed');
    });
}

/**
 * Update visibility of expand/collapse buttons based on whether there are nested fields
 */
function updateExpandCollapseButtons() {
    const expandAllBtn = document.getElementById('object-editor-expand-all');
    const collapseAllBtn = document.getElementById('object-editor-collapse-all');
    const tree = document.getElementById('object-editor-tree');
    
    // Check if there are any collapsible (nested) nodes
    const hasCollapsible = tree.querySelectorAll('.tree-children').length > 0;
    
    expandAllBtn.style.display = hasCollapsible ? '' : 'none';
    collapseAllBtn.style.display = hasCollapsible ? '' : 'none';
}

/**
 * Open the object editor modal
 * @param {string} fieldName - Name of the field being edited
 * @param {any} value - Current value (object or array)
 * @param {boolean} isArray - Whether editing an array
 * @param {function} callback - Called with new value on save
 */
function openObjectEditor(fieldName, value, isArray, callback) {
    const overlay = document.getElementById('object-editor-overlay');
    const title = document.getElementById('object-editor-title');
    const pathEl = document.getElementById('object-editor-path');
    const tree = document.getElementById('object-editor-tree');
    const addFieldBtn = document.getElementById('object-editor-add-field');
    
    objectEditorCallback = callback;
    objectEditorFieldName = fieldName;
    objectEditorIsArray = isArray;
    objectEditorData = value;
    
    // Set title
    title.textContent = isArray ? 'Edit Array' : 'Edit Object';
    pathEl.textContent = fieldName;
    
    // Update add button text
    addFieldBtn.innerHTML = isArray 
        ? '<span class="tool-icon">+</span> Add Item'
        : '<span class="tool-icon">+</span> Add Field';
    
    // Build tree from value
    tree.innerHTML = '';
    buildTreeFromValue(tree, value, isArray);
    
    // Update preview
    updatePreview();
    
    // Update expand/collapse button visibility
    updateExpandCollapseButtons();
    
    // Show modal
    overlay.classList.add('active');
}

/**
 * Build tree nodes from a value
 */
function buildTreeFromValue(container, value, isArray) {
    if (isArray && Array.isArray(value)) {
        value.forEach(function(item, index) {
            addTreeNode(container, true, String(index), item);
        });
    } else if (value && typeof value === 'object') {
        Object.keys(value).forEach(function(key) {
            addTreeNode(container, false, key, value[key]);
        });
    }
}

/**
 * Add a tree node
 */
function addTreeNode(container, isArrayItem, key, value) {
    const node = document.createElement('div');
    node.className = container.id === 'object-editor-tree' ? 'tree-node' : 'tree-node tree-node-nested';
    
    const row = document.createElement('div');
    row.className = 'tree-node-row';
    
    // Determine value type
    let valueType = 'string';
    if (value === null || value === undefined) {
        valueType = 'null';
        value = null;
    } else if (Array.isArray(value)) {
        valueType = 'array';
    } else if (typeof value === 'object') {
        valueType = 'object';
    } else if (typeof value === 'boolean') {
        valueType = 'boolean';
    } else if (typeof value === 'number') {
        valueType = 'number';
    }
    
    const isNested = valueType === 'object' || valueType === 'array';
    
    // Expand button (for nested types)
    if (isNested) {
        const expandBtn = document.createElement('button');
        expandBtn.className = 'tree-expand-btn expanded';
        expandBtn.textContent = '▶';
        expandBtn.addEventListener('click', function() {
            expandBtn.classList.toggle('expanded');
            const children = node.querySelector('.tree-children');
            if (children) {
                children.classList.toggle('expanded');
            }
        });
        row.appendChild(expandBtn);
    } else {
        const placeholder = document.createElement('span');
        placeholder.className = 'tree-expand-placeholder';
        row.appendChild(placeholder);
    }
    
    // Key input
    const keyInput = document.createElement('input');
    keyInput.type = 'text';
    keyInput.className = 'tree-key-input' + (isArrayItem ? ' array-index' : '');
    keyInput.value = key !== undefined ? key : '';
    keyInput.placeholder = isArrayItem ? '#' : 'key';
    keyInput.readOnly = isArrayItem;
    keyInput.addEventListener('input', updatePreview);
    row.appendChild(keyInput);
    
    // Colon separator
    const colon = document.createElement('span');
    colon.className = 'tree-colon';
    colon.textContent = ':';
    row.appendChild(colon);
    
    // Type selector
    const typeSelect = document.createElement('select');
    typeSelect.className = 'tree-type-select';
    typeSelect.innerHTML = `
        <option value="string">String</option>
        <option value="number">Number</option>
        <option value="boolean">Boolean</option>
        <option value="null">Null</option>
        <option value="object">Object</option>
        <option value="array">Array</option>
    `;
    typeSelect.value = valueType;
    typeSelect.addEventListener('change', function() {
        handleTypeChange(node, typeSelect.value);
    });
    row.appendChild(typeSelect);
    
    // Value input (varies by type)
    const valueContainer = document.createElement('span');
    valueContainer.className = 'tree-value-container';
    valueContainer.style.flex = '1';
    valueContainer.style.display = 'flex';
    valueContainer.style.alignItems = 'center';
    row.appendChild(valueContainer);
    
    renderValueInput(valueContainer, valueType, value);
    
    // Actions
    const actions = document.createElement('div');
    actions.className = 'tree-node-actions';
    
    // Add child button (for object/array)
    if (isNested) {
        const addBtn = document.createElement('button');
        addBtn.className = 'tree-action-btn add';
        addBtn.textContent = '+';
        addBtn.title = 'Add child';
        addBtn.addEventListener('click', function() {
            const children = node.querySelector('.tree-children');
            if (children) {
                addTreeNode(children, valueType === 'array');
                updatePreview();
                updateExpandCollapseButtons();
                // Expand if collapsed
                const expandBtn = node.querySelector('.tree-expand-btn');
                if (expandBtn && !expandBtn.classList.contains('expanded')) {
                    expandBtn.click();
                }
            }
        });
        actions.appendChild(addBtn);
    }
    
    // Delete button
    const deleteBtn = document.createElement('button');
    deleteBtn.className = 'tree-action-btn delete';
    deleteBtn.textContent = '×';
    deleteBtn.title = 'Remove';
    deleteBtn.addEventListener('click', function() {
        node.remove();
        updateArrayIndices(container);
        updatePreview();
        updateExpandCollapseButtons();
    });
    actions.appendChild(deleteBtn);
    
    row.appendChild(actions);
    node.appendChild(row);
    
    // Children container (for nested types)
    if (isNested) {
        const children = document.createElement('div');
        children.className = 'tree-children expanded';
        node.appendChild(children);
        
        // Recursively build children
        if (valueType === 'array' && Array.isArray(value)) {
            value.forEach(function(item, idx) {
                addTreeNode(children, true, String(idx), item);
            });
        } else if (valueType === 'object' && value && typeof value === 'object') {
            Object.keys(value).forEach(function(k) {
                addTreeNode(children, false, k, value[k]);
            });
        }
    }
    
    container.appendChild(node);
    
    // Update array indices if needed
    if (isArrayItem) {
        updateArrayIndices(container);
    }
}

/**
 * Render the value input based on type
 */
function renderValueInput(container, type, value) {
    container.innerHTML = '';
    
    if (type === 'string') {
        const input = document.createElement('input');
        input.type = 'text';
        input.className = 'tree-value-input type-string';
        input.value = value !== null && value !== undefined ? String(value) : '';
        input.placeholder = 'value';
        input.addEventListener('input', updatePreview);
        container.appendChild(input);
    } else if (type === 'number') {
        const input = document.createElement('input');
        input.type = 'number';
        input.className = 'tree-value-input type-number';
        input.value = typeof value === 'number' ? value : '';
        input.placeholder = '0';
        input.addEventListener('input', updatePreview);
        container.appendChild(input);
    } else if (type === 'boolean') {
        const input = document.createElement('input');
        input.type = 'checkbox';
        input.className = 'tree-value-input type-boolean';
        input.checked = value === true;
        input.addEventListener('change', updatePreview);
        container.appendChild(input);
        const label = document.createElement('span');
        label.className = 'tree-value-label';
        label.textContent = input.checked ? 'true' : 'false';
        input.addEventListener('change', function() {
            label.textContent = input.checked ? 'true' : 'false';
        });
        container.appendChild(label);
    } else if (type === 'null') {
        const label = document.createElement('span');
        label.className = 'tree-value-null';
        label.textContent = 'null';
        container.appendChild(label);
    } else if (type === 'object') {
        const label = document.createElement('span');
        label.className = 'tree-value-label';
        label.textContent = '{ ... }';
        container.appendChild(label);
    } else if (type === 'array') {
        const label = document.createElement('span');
        label.className = 'tree-value-label';
        label.textContent = '[ ... ]';
        container.appendChild(label);
    }
}

/**
 * Handle type change for a node
 */
function handleTypeChange(node, newType) {
    const valueContainer = node.querySelector('.tree-value-container');
    const row = node.querySelector('.tree-node-row');
    let existingChildren = node.querySelector('.tree-children');
    const expandBtn = row.querySelector('.tree-expand-btn');
    const placeholder = row.querySelector('.tree-expand-placeholder');
    
    const isNested = newType === 'object' || newType === 'array';
    const wasNested = !!existingChildren;
    
    // Handle expand button
    if (isNested && !wasNested) {
        // Add expand button
        if (placeholder) {
            placeholder.remove();
        }
        const newExpandBtn = document.createElement('button');
        newExpandBtn.className = 'tree-expand-btn expanded';
        newExpandBtn.textContent = '▶';
        newExpandBtn.addEventListener('click', function() {
            newExpandBtn.classList.toggle('expanded');
            const children = node.querySelector('.tree-children');
            if (children) {
                children.classList.toggle('expanded');
            }
        });
        row.insertBefore(newExpandBtn, row.firstChild);
        
        // Add children container
        const children = document.createElement('div');
        children.className = 'tree-children expanded';
        node.appendChild(children);
        
        // Add "add child" button to actions
        const actions = row.querySelector('.tree-node-actions');
        const existingAddBtn = actions.querySelector('.add');
        if (!existingAddBtn) {
            const addBtn = document.createElement('button');
            addBtn.className = 'tree-action-btn add';
            addBtn.textContent = '+';
            addBtn.title = 'Add child';
            addBtn.addEventListener('click', function() {
                const children = node.querySelector('.tree-children');
                if (children) {
                    addTreeNode(children, newType === 'array');
                    updatePreview();
                }
            });
            actions.insertBefore(addBtn, actions.firstChild);
        }
    } else if (!isNested && wasNested) {
        // Remove expand button and children
        if (expandBtn) {
            expandBtn.remove();
        }
        if (existingChildren) {
            existingChildren.remove();
        }
        
        // Add placeholder
        const newPlaceholder = document.createElement('span');
        newPlaceholder.className = 'tree-expand-placeholder';
        row.insertBefore(newPlaceholder, row.firstChild);
        
        // Remove add button from actions
        const actions = row.querySelector('.tree-node-actions');
        const addBtn = actions.querySelector('.add');
        if (addBtn) {
            addBtn.remove();
        }
    }
    
    // Update value input
    renderValueInput(valueContainer, newType, null);
    
    // Update children if changing between array and object
    if (isNested && wasNested && newType === 'array') {
        const children = node.querySelector('.tree-children');
        updateArrayIndices(children);
    }
    
    updatePreview();
    updateExpandCollapseButtons();
}

/**
 * Update array indices after reorder/delete
 */
function updateArrayIndices(container) {
    const nodes = container.querySelectorAll(':scope > .tree-node');
    nodes.forEach(function(node, index) {
        const keyInput = node.querySelector('.tree-key-input.array-index');
        if (keyInput) {
            keyInput.value = String(index);
        }
    });
}

/**
 * Build data object from tree
 */
function buildDataFromTree() {
    const tree = document.getElementById('object-editor-tree');
    return buildDataFromContainer(tree, objectEditorIsArray);
}

function buildDataFromContainer(container, isArray) {
    const nodes = container.querySelectorAll(':scope > .tree-node');
    
    if (isArray) {
        const arr = [];
        nodes.forEach(function(node) {
            arr.push(getNodeValue(node));
        });
        return arr;
    } else {
        const obj = {};
        nodes.forEach(function(node) {
            const keyInput = node.querySelector('.tree-key-input');
            const key = keyInput ? keyInput.value.trim() : '';
            if (key) {
                obj[key] = getNodeValue(node);
            }
        });
        return obj;
    }
}

function getNodeValue(node) {
    const typeSelect = node.querySelector('.tree-type-select');
    const type = typeSelect ? typeSelect.value : 'string';
    const valueContainer = node.querySelector('.tree-value-container');
    
    if (type === 'string') {
        const input = valueContainer.querySelector('input');
        return input ? input.value : '';
    } else if (type === 'number') {
        const input = valueContainer.querySelector('input');
        const val = input ? parseFloat(input.value) : 0;
        return isNaN(val) ? 0 : val;
    } else if (type === 'boolean') {
        const input = valueContainer.querySelector('input');
        return input ? input.checked : false;
    } else if (type === 'null') {
        return null;
    } else if (type === 'object') {
        const children = node.querySelector('.tree-children');
        return children ? buildDataFromContainer(children, false) : {};
    } else if (type === 'array') {
        const children = node.querySelector('.tree-children');
        return children ? buildDataFromContainer(children, true) : [];
    }
    return null;
}

/**
 * Update JSON preview
 */
function updatePreview() {
    const preview = document.getElementById('object-editor-preview');
    const data = buildDataFromTree();
    try {
        preview.textContent = JSON.stringify(data, null, 2);
    } catch (e) {
        preview.textContent = 'Error building JSON';
    }
}

// Expose globally
window.openObjectEditor = openObjectEditor;
window.initObjectEditor = initObjectEditor;
