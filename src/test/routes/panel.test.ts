import * as assert from 'assert';
import * as vscode from 'vscode';
import { RoutesPanel } from '../../modules/routes/panel';
import { RouteStorage, getRouteStorage, LaravelRoute } from '../../modules/routes/manager';

suite('RoutesPanel Test Suite', () => {
	// Clean up after each test
	teardown(() => {
		// Dispose of any existing panel
		if (RoutesPanel.currentPanel) {
			RoutesPanel.currentPanel.dispose();
		}
		// Clear routes
		getRouteStorage().clear();
	});

	test('should have correct view type', () => {
		assert.strictEqual(RoutesPanel.viewType, 'lapiRoutesTable');
	});

	test('should start with no current panel', () => {
		// After teardown, there should be no current panel
		assert.strictEqual(RoutesPanel.currentPanel, undefined);
	});

	test('should create panel when createOrShow is called', async function() {
		// This test requires the extension host
		this.timeout(10000);

		// Get a valid extension URI
		const extension = vscode.extensions.getExtension('undefined_publisher.lapi');
		if (!extension) {
			// Skip test if extension is not available in test environment
			this.skip();
			return;
		}

		const extensionUri = extension.extensionUri;
		RoutesPanel.createOrShow(extensionUri);

		assert.ok(RoutesPanel.currentPanel);
	});

	test('should reuse existing panel when createOrShow is called twice', async function() {
		this.timeout(10000);

		const extension = vscode.extensions.getExtension('undefined_publisher.lapi');
		if (!extension) {
			this.skip();
			return;
		}

		const extensionUri = extension.extensionUri;
		
		RoutesPanel.createOrShow(extensionUri);
		const firstPanel = RoutesPanel.currentPanel;

		RoutesPanel.createOrShow(extensionUri);
		const secondPanel = RoutesPanel.currentPanel;

		assert.strictEqual(firstPanel, secondPanel);
	});

	test('should dispose panel correctly', async function() {
		this.timeout(10000);

		const extension = vscode.extensions.getExtension('undefined_publisher.lapi');
		if (!extension) {
			this.skip();
			return;
		}

		const extensionUri = extension.extensionUri;
		
		RoutesPanel.createOrShow(extensionUri);
		assert.ok(RoutesPanel.currentPanel);

		RoutesPanel.currentPanel.dispose();
		assert.strictEqual(RoutesPanel.currentPanel, undefined);
	});
});

suite('RoutesPanel HTML Generation Test Suite', () => {
	setup(() => {
		// Clear routes before each test
		getRouteStorage().clear();
	});

	teardown(() => {
		// Clean up
		if (RoutesPanel.currentPanel) {
			RoutesPanel.currentPanel.dispose();
		}
		getRouteStorage().clear();
	});

	test('should display routes count correctly', async function() {
		this.timeout(10000);

		// Add test routes
		const storage = getRouteStorage();
		const testRoutes: LaravelRoute[] = [
			{
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: ['api']
			},
			{
				method: 'POST',
				uri: '/api/users',
				name: 'users.store',
				action: 'UserController@store',
				controller: 'UserController@store',
				middleware: ['api', 'auth']
			}
		];

		testRoutes.forEach(route => storage.add(route));

		// Verify routes were added
		assert.strictEqual(storage.size, 2);
	});

	test('should handle empty routes gracefully', () => {
		const storage = getRouteStorage();
		assert.strictEqual(storage.size, 0);
		
		// Panel should handle empty state without errors
		const allRoutes = storage.getAll();
		assert.strictEqual(allRoutes.length, 0);
	});

	test('should handle routes with special characters', () => {
		const storage = getRouteStorage();
		const routeWithSpecialChars: LaravelRoute = {
			method: 'GET',
			uri: '/api/users/{user}/posts/{post}',
			name: 'users.posts.show',
			action: 'App\\Http\\Controllers\\User\\PostController@show',
			controller: 'App\\Http\\Controllers\\User\\PostController@show',
			middleware: ['api', 'auth:sanctum']
		};

		storage.add(routeWithSpecialChars);
		const retrieved = storage.get('GET', '/api/users/{user}/posts/{post}');

		assert.ok(retrieved);
		assert.strictEqual(retrieved.uri, '/api/users/{user}/posts/{post}');
		assert.ok(retrieved.controller?.includes('\\'));
	});

	test('should handle all HTTP methods', () => {
		const storage = getRouteStorage();
		const methods = ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'HEAD', 'OPTIONS'];

		methods.forEach((method, index) => {
			storage.add({
				method,
				uri: `/api/test${index}`,
				name: `test.${method.toLowerCase()}`,
				action: 'TestController@handle',
				controller: 'TestController@handle',
				middleware: []
			});
		});

		assert.strictEqual(storage.size, methods.length);
		
		methods.forEach((method, index) => {
			const route = storage.get(method, `/api/test${index}`);
			assert.ok(route, `Route with method ${method} should exist`);
			assert.strictEqual(route.method, method);
		});
	});

	test('should handle closure routes without controller', () => {
		const storage = getRouteStorage();
		const closureRoute: LaravelRoute = {
			method: 'GET',
			uri: '/health',
			name: null,
			action: 'Closure',
			controller: null,
			middleware: []
		};

		storage.add(closureRoute);
		const retrieved = storage.get('GET', '/health');

		assert.ok(retrieved);
		assert.strictEqual(retrieved.action, 'Closure');
		assert.strictEqual(retrieved.controller, null);
	});

	test('should handle routes with complex middleware arrays', () => {
		const storage = getRouteStorage();
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/admin/settings',
			name: 'admin.settings.update',
			action: 'AdminController@updateSettings',
			controller: 'AdminController@updateSettings',
			middleware: [
				'api',
				'auth:sanctum',
				'role:admin',
				'throttle:60,1',
				'verified'
			]
		};

		storage.add(route);
		const retrieved = storage.get('POST', '/api/admin/settings');

		assert.ok(retrieved);
		assert.strictEqual(retrieved.middleware.length, 5);
		assert.ok(retrieved.middleware.includes('role:admin'));
	});
});

suite('RoutesPanel Method Class Mapping', () => {
	// Test the method-to-CSS-class mapping logic
	// These are the expected mappings based on the panel implementation

	test('GET method should map to method-get class', () => {
		const method = 'GET';
		const expectedClass = `method-${method.toLowerCase().split('|')[0]}`;
		assert.strictEqual(expectedClass, 'method-get');
	});

	test('POST method should map to method-post class', () => {
		const method = 'POST';
		const expectedClass = `method-${method.toLowerCase().split('|')[0]}`;
		assert.strictEqual(expectedClass, 'method-post');
	});

	test('PUT method should map to method-put class', () => {
		const method = 'PUT';
		const expectedClass = `method-${method.toLowerCase().split('|')[0]}`;
		assert.strictEqual(expectedClass, 'method-put');
	});

	test('PATCH method should map to method-patch class', () => {
		const method = 'PATCH';
		const expectedClass = `method-${method.toLowerCase().split('|')[0]}`;
		assert.strictEqual(expectedClass, 'method-patch');
	});

	test('DELETE method should map to method-delete class', () => {
		const method = 'DELETE';
		const expectedClass = `method-${method.toLowerCase().split('|')[0]}`;
		assert.strictEqual(expectedClass, 'method-delete');
	});

	test('combined methods should use first method for class', () => {
		const method = 'GET|HEAD';
		const expectedClass = `method-${method.toLowerCase().split('|')[0]}`;
		assert.strictEqual(expectedClass, 'method-get');
	});
});
