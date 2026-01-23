import * as assert from 'assert';
import type { LaravelRoute } from '../../types/routes';
import { RouteStorage, getRouteStorage } from '../../modules/routes/manager';

suite('RouteStorage Test Suite', () => {
	let storage: RouteStorage;

	setup(() => {
		// Create a fresh RouteStorage instance for each test
		storage = new RouteStorage();
	});

	test('should start with zero routes', () => {
		assert.strictEqual(storage.size, 0);
	});

	test('should add a route correctly', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: '/api/users',
			name: 'users.index',
			action: 'App\\Http\\Controllers\\UserController@index',
			controller: 'App\\Http\\Controllers\\UserController@index',
			middleware: ['api', 'auth']
		};

		storage.add(route);
		assert.strictEqual(storage.size, 1);
	});

	test('should retrieve a route by method and uri', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/users',
			name: 'users.store',
			action: 'App\\Http\\Controllers\\UserController@store',
			controller: 'App\\Http\\Controllers\\UserController@store',
			middleware: ['api', 'auth']
		};

		storage.add(route);
		const retrieved = storage.get('POST', '/api/users');
		
		assert.ok(retrieved);
		assert.strictEqual(retrieved.name, 'users.store');
		assert.strictEqual(retrieved.method, 'POST');
	});

	test('should return undefined for non-existent route', () => {
		const retrieved = storage.get('DELETE', '/api/nonexistent');
		assert.strictEqual(retrieved, undefined);
	});

	test('should get all routes', () => {
		const routes: LaravelRoute[] = [
			{
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			},
			{
				method: 'POST',
				uri: '/api/users',
				name: 'users.store',
				action: 'UserController@store',
				controller: 'UserController@store',
				middleware: []
			},
			{
				method: 'GET',
				uri: '/api/posts',
				name: 'posts.index',
				action: 'PostController@index',
				controller: 'PostController@index',
				middleware: []
			}
		];

		routes.forEach(route => storage.add(route));
		const allRoutes = storage.getAll();

		assert.strictEqual(allRoutes.length, 3);
	});

	test('should clear all routes', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: '/api/users',
			name: 'users.index',
			action: 'UserController@index',
			controller: 'UserController@index',
			middleware: []
		};

		storage.add(route);
		assert.strictEqual(storage.size, 1);

		storage.clear();
		assert.strictEqual(storage.size, 0);
	});

	test('should filter routes by controller', () => {
		const routes: LaravelRoute[] = [
			{
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'App\\Http\\Controllers\\UserController@index',
				middleware: []
			},
			{
				method: 'POST',
				uri: '/api/users',
				name: 'users.store',
				action: 'UserController@store',
				controller: 'App\\Http\\Controllers\\UserController@store',
				middleware: []
			},
			{
				method: 'GET',
				uri: '/api/posts',
				name: 'posts.index',
				action: 'PostController@index',
				controller: 'App\\Http\\Controllers\\PostController@index',
				middleware: []
			}
		];

		routes.forEach(route => storage.add(route));
		const userRoutes = storage.getByController('UserController');

		assert.strictEqual(userRoutes.length, 2);
		userRoutes.forEach(route => {
			assert.ok(route.controller?.includes('UserController'));
		});
	});

	test('should find routes by path pattern', () => {
		const routes: LaravelRoute[] = [
			{
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			},
			{
				method: 'GET',
				uri: '/api/users/{id}',
				name: 'users.show',
				action: 'UserController@show',
				controller: 'UserController@show',
				middleware: []
			},
			{
				method: 'GET',
				uri: '/api/posts',
				name: 'posts.index',
				action: 'PostController@index',
				controller: 'PostController@index',
				middleware: []
			}
		];

		routes.forEach(route => storage.add(route));
		const userRoutes = storage.findByPath('/api/users');

		assert.strictEqual(userRoutes.length, 2);
	});

	test('should overwrite route with same method and uri', () => {
		const route1: LaravelRoute = {
			method: 'GET',
			uri: '/api/users',
			name: 'users.index.old',
			action: 'OldController@index',
			controller: 'OldController@index',
			middleware: []
		};

		const route2: LaravelRoute = {
			method: 'GET',
			uri: '/api/users',
			name: 'users.index.new',
			action: 'NewController@index',
			controller: 'NewController@index',
			middleware: []
		};

		storage.add(route1);
		storage.add(route2);

		assert.strictEqual(storage.size, 1);
		const retrieved = storage.get('GET', '/api/users');
		assert.strictEqual(retrieved?.name, 'users.index.new');
	});

	test('should handle routes with null values', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: '/health',
			name: null,
			action: 'Closure',
			controller: null,
			middleware: []
		};

		storage.add(route);
		const retrieved = storage.get('GET', '/health');

		assert.ok(retrieved);
		assert.strictEqual(retrieved.name, null);
		assert.strictEqual(retrieved.controller, null);
	});

	test('should handle routes with multiple HTTP methods', () => {
		const route: LaravelRoute = {
			method: 'GET|HEAD',
			uri: '/api/status',
			name: 'status',
			action: 'StatusController@index',
			controller: 'StatusController@index',
			middleware: []
		};

		storage.add(route);
		const retrieved = storage.get('GET|HEAD', '/api/status');

		assert.ok(retrieved);
		assert.strictEqual(retrieved.method, 'GET|HEAD');
	});
});

suite('getRouteStorage Test Suite', () => {
	test('should return a RouteStorage instance', () => {
		const storage = getRouteStorage();
		assert.ok(storage instanceof RouteStorage);
	});

	test('should return the same instance on multiple calls', () => {
		const storage1 = getRouteStorage();
		const storage2 = getRouteStorage();
		assert.strictEqual(storage1, storage2);
	});
});
