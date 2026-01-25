import * as assert from 'assert';
import type { LaravelRoute, RouteRequestParam, ParamType } from '../../types/routes';
import { RouteParser, generateRequestConfig } from '../../modules/routes/parser';
import { getRouteStorage } from '../../modules/routes/manager';

suite('RouteParser Test Suite', () => {
	let parser: RouteParser;

	setup(() => {
		// Use a mock workspace path for testing
		parser = new RouteParser('/tmp/test-workspace');
		// Clear route storage before each test
		getRouteStorage().clear();
	});

	suite('extractPathParams', () => {
		test('should extract single path parameter', async () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users/{id}',
				name: 'users.show',
				action: 'UserController@show',
				controller: 'UserController@show',
				middleware: []
			};

			// Add to storage and parse
			getRouteStorage().add(route);
			const parsed = await parser.parseRoute(route);

			assert.ok(parsed.requestParams);
			const idParam = parsed.requestParams.find(p => p.name === 'id');
			assert.ok(idParam);
			assert.strictEqual(idParam.isPathParam, true);
			assert.strictEqual(idParam.required, true);
		});

		test('should extract multiple path parameters', async () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users/{user}/posts/{post}',
				name: 'users.posts.show',
				action: 'PostController@show',
				controller: 'PostController@show',
				middleware: []
			};

			getRouteStorage().add(route);
			const parsed = await parser.parseRoute(route);

			assert.ok(parsed.requestParams);
			assert.ok(parsed.requestParams.find(p => p.name === 'user'));
			assert.ok(parsed.requestParams.find(p => p.name === 'post'));
		});

		test('should mark optional path params correctly', async () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users/{user?}',
				name: 'users.show',
				action: 'UserController@show',
				controller: 'UserController@show',
				middleware: []
			};

			getRouteStorage().add(route);
			const parsed = await parser.parseRoute(route);

			assert.ok(parsed.requestParams);
			const userParam = parsed.requestParams.find(p => p.name === 'user');
			assert.ok(userParam);
			assert.strictEqual(userParam.required, false);
			assert.strictEqual(userParam.isPathParam, true);
		});

		test('should handle routes with no path params', async () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			};

			getRouteStorage().add(route);
			const parsed = await parser.parseRoute(route);

			// Should have empty or only non-path params
			const pathParams = parsed.requestParams?.filter(p => p.isPathParam) || [];
			assert.strictEqual(pathParams.length, 0);
		});

		test('should set path param type as string', async () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users/{id}',
				name: 'users.show',
				action: 'UserController@show',
				controller: 'UserController@show',
				middleware: []
			};

			getRouteStorage().add(route);
			const parsed = await parser.parseRoute(route);

			const idParam = parsed.requestParams?.find(p => p.name === 'id');
			assert.strictEqual(idParam?.type, 'string');
		});
	});

	suite('parseControllerString', () => {
		test('should handle closure routes', async () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/health',
				name: null,
				action: 'Closure',
				controller: null,
				middleware: []
			};

			getRouteStorage().add(route);
			const parsed = await parser.parseRoute(route);

			// Should not have controller path
			assert.strictEqual(parsed.controllerPath, undefined);
		});

		test('should preserve route data when parsing', async () => {
			const route: LaravelRoute = {
				method: 'POST',
				uri: '/api/users',
				name: 'users.store',
				action: 'App\\Http\\Controllers\\UserController@store',
				controller: 'App\\Http\\Controllers\\UserController@store',
				middleware: ['api', 'auth']
			};

			getRouteStorage().add(route);
			const parsed = await parser.parseRoute(route);

			assert.strictEqual(parsed.method, 'POST');
			assert.strictEqual(parsed.uri, '/api/users');
			assert.strictEqual(parsed.name, 'users.store');
			assert.deepStrictEqual(parsed.middleware, ['api', 'auth']);
		});
	});

	suite('parseAllRoutes', () => {
		test('should parse all routes from storage', async () => {
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
				}
			];

			routes.forEach(r => getRouteStorage().add(r));
			const parsed = await parser.parseAllRoutes();

			assert.strictEqual(parsed.length, 2);
		});

		test('should return empty array for empty storage', async () => {
			const parsed = await parser.parseAllRoutes();
			assert.strictEqual(parsed.length, 0);
		});
	});
});

suite('generateRequestConfig Test Suite', () => {
	test('should generate config for simple route', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: '/api/users',
			name: 'users.index',
			action: 'UserController@index',
			controller: 'UserController@index',
			middleware: []
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.method, 'GET');
		assert.strictEqual(config.url, 'http://localhost:8000/api/users');
		assert.ok(config.headers['Accept']);
		assert.ok(config.headers['Content-Type']);
	});

	test('should replace path parameters', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: '/api/users/{user}',
			name: 'users.show',
			action: 'UserController@show',
			controller: 'UserController@show',
			middleware: []
		};

		const config = generateRequestConfig(route, 'http://localhost:8000', { user: '42' });

		assert.strictEqual(config.url, 'http://localhost:8000/api/users/42');
	});

	test('should keep placeholder for missing path params', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: '/api/users/{user}',
			name: 'users.show',
			action: 'UserController@show',
			controller: 'UserController@show',
			middleware: []
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.ok(config.url.includes('{user}'));
	});

	test('should set multipart content type for file params', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/uploads',
			name: 'uploads.store',
			action: 'UploadController@store',
			controller: 'UploadController@store',
			middleware: [],
			requestParams: [
				{
					name: 'file',
					type: 'file',
					required: true,
					rules: ['required', 'file'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.contentType, 'multipart/form-data');
	});

	test('should put params in query for GET requests', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: '/api/users',
			name: 'users.index',
			action: 'UserController@index',
			controller: 'UserController@index',
			middleware: [],
			requestParams: [
				{
					name: 'search',
					type: 'string',
					required: false,
					rules: ['string'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.ok(config.queryParams.some(p => p.name === 'search'));
		assert.ok(!('search' in config.bodyParams));
	});

	test('should put params in body for POST requests', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/users',
			name: 'users.store',
			action: 'UserController@store',
			controller: 'UserController@store',
			middleware: [],
			requestParams: [
				{
					name: 'name',
					type: 'string',
					required: true,
					rules: ['required', 'string'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.ok('name' in config.bodyParams);
		assert.ok(!('name' in config.queryParams));
	});

	test('should use first method for combined methods', () => {
		const route: LaravelRoute = {
			method: 'PUT|PATCH',
			uri: '/api/users/{id}',
			name: 'users.update',
			action: 'UserController@update',
			controller: 'UserController@update',
			middleware: []
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.method, 'PUT');
	});

	test('should strip trailing slash from base URL', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: '/api/users',
			name: 'users.index',
			action: 'UserController@index',
			controller: 'UserController@index',
			middleware: []
		};

		const config = generateRequestConfig(route, 'http://localhost:8000/');

		assert.strictEqual(config.url, 'http://localhost:8000/api/users');
	});

	test('should handle routes without leading slash', () => {
		const route: LaravelRoute = {
			method: 'GET',
			uri: 'api/users',
			name: 'users.index',
			action: 'UserController@index',
			controller: 'UserController@index',
			middleware: []
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.ok(config.url.includes('/api/users'));
	});
});

suite('generateRequestConfig default values', () => {
	test('should set default integer value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/items',
			name: 'items.store',
			action: 'ItemController@store',
			controller: 'ItemController@store',
			middleware: [],
			requestParams: [
				{
					name: 'quantity',
					type: 'integer',
					required: true,
					rules: ['required', 'integer'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.bodyParams['quantity'], 0);
	});

	test('should set default boolean value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/settings',
			name: 'settings.store',
			action: 'SettingsController@store',
			controller: 'SettingsController@store',
			middleware: [],
			requestParams: [
				{
					name: 'enabled',
					type: 'boolean',
					required: true,
					rules: ['required', 'boolean'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.bodyParams['enabled'], false);
	});

	test('should set default email value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/users',
			name: 'users.store',
			action: 'UserController@store',
			controller: 'UserController@store',
			middleware: [],
			requestParams: [
				{
					name: 'email',
					type: 'email',
					required: true,
					rules: ['required', 'email'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.bodyParams['email'], 'user@example.com');
	});

	test('should set default URL value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/links',
			name: 'links.store',
			action: 'LinkController@store',
			controller: 'LinkController@store',
			middleware: [],
			requestParams: [
				{
					name: 'website',
					type: 'url',
					required: true,
					rules: ['required', 'url'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.bodyParams['website'], 'https://example.com');
	});

	test('should set default UUID value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/references',
			name: 'references.store',
			action: 'ReferenceController@store',
			controller: 'ReferenceController@store',
			middleware: [],
			requestParams: [
				{
					name: 'ref_id',
					type: 'uuid',
					required: true,
					rules: ['required', 'uuid'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		// Should be a UUID format
		assert.ok(/^[0-9a-f-]{36}$/i.test(config.bodyParams['ref_id'] as string));
	});

	test('should set default date value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/events',
			name: 'events.store',
			action: 'EventController@store',
			controller: 'EventController@store',
			middleware: [],
			requestParams: [
				{
					name: 'event_date',
					type: 'date',
					required: true,
					rules: ['required', 'date'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		// Should be YYYY-MM-DD format
		assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(config.bodyParams['event_date'] as string));
	});

	test('should set default array value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/items',
			name: 'items.store',
			action: 'ItemController@store',
			controller: 'ItemController@store',
			middleware: [],
			requestParams: [
				{
					name: 'tags',
					type: 'array',
					required: true,
					rules: ['required', 'array'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.ok(Array.isArray(config.bodyParams['tags']));
	});

	test('should set default object value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/items',
			name: 'items.store',
			action: 'ItemController@store',
			controller: 'ItemController@store',
			middleware: [],
			requestParams: [
				{
					name: 'metadata',
					type: 'object',
					required: true,
					rules: ['required', 'array'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.ok(typeof config.bodyParams['metadata'] === 'object');
		assert.ok(!Array.isArray(config.bodyParams['metadata']));
	});

	test('should set default string value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/items',
			name: 'items.store',
			action: 'ItemController@store',
			controller: 'ItemController@store',
			middleware: [],
			requestParams: [
				{
					name: 'name',
					type: 'string',
					required: true,
					rules: ['required', 'string'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.bodyParams['name'], '');
	});

	test('should set null for file type', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/uploads',
			name: 'uploads.store',
			action: 'UploadController@store',
			controller: 'UploadController@store',
			middleware: [],
			requestParams: [
				{
					name: 'document',
					type: 'file',
					required: true,
					rules: ['required', 'file'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.bodyParams['document'], null);
	});

	test('should set default number value', () => {
		const route: LaravelRoute = {
			method: 'POST',
			uri: '/api/items',
			name: 'items.store',
			action: 'ItemController@store',
			controller: 'ItemController@store',
			middleware: [],
			requestParams: [
				{
					name: 'price',
					type: 'number',
					required: true,
					rules: ['required', 'numeric'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		assert.strictEqual(config.bodyParams['price'], 0.0);
	});
});

suite('Validation Rules Inference', () => {
	// These tests verify the type inference logic by testing parser output
	// The actual parsing requires file I/O, so we test the generateRequestConfig
	// which uses similar logic for defaults

	test('should skip path params in body/query params', () => {
		const route: LaravelRoute = {
			method: 'PUT',
			uri: '/api/users/{user}',
			name: 'users.update',
			action: 'UserController@update',
			controller: 'UserController@update',
			middleware: [],
			requestParams: [
				{
					name: 'user',
					type: 'string',
					required: true,
					rules: [],
					isPathParam: true
				},
				{
					name: 'name',
					type: 'string',
					required: true,
					rules: ['required', 'string'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		// Path param should not be in body
		assert.ok(!('user' in config.bodyParams));
		// Non-path param should be in body
		assert.ok('name' in config.bodyParams);
	});

	test('should handle HEAD method like GET', () => {
		const route: LaravelRoute = {
			method: 'HEAD',
			uri: '/api/users',
			name: 'users.head',
			action: 'UserController@head',
			controller: 'UserController@head',
			middleware: [],
			requestParams: [
				{
					name: 'filter',
					type: 'string',
					required: false,
					rules: ['string'],
					isPathParam: false
				}
			]
		};

		const config = generateRequestConfig(route, 'http://localhost:8000');

		// Should be in query, not body
		assert.ok('filter' in config.queryParams);
		assert.ok(!('filter' in config.bodyParams));
	});
});
