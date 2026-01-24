import * as assert from 'assert';
import type { LaravelRoute } from '../../types/routes';
import { buildCurlCommand, buildRequestConfig, getApiHost } from '../../modules/api/request';

suite('API Request Module Test Suite', () => {
	suite('getApiHost', () => {
		test('should return default host when not configured', () => {
			const host = getApiHost();
			// Default is http://localhost:8000
			assert.ok(host.includes('localhost') || host.includes('http'));
		});

		test('should return a string', () => {
			const host = getApiHost();
			assert.strictEqual(typeof host, 'string');
		});
	});

	suite('buildCurlCommand', () => {
		test('should build basic GET curl command', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			};

			const curl = buildCurlCommand(route, { host: 'http://localhost:8000' });

			assert.ok(curl.startsWith('curl'));
			assert.ok(curl.includes("'http://localhost:8000/api/users'"));
			assert.ok(curl.includes("-H 'Accept: application/json'"));
			assert.ok(curl.includes('-s')); // Silent mode
			assert.ok(!curl.includes('-X GET')); // GET is default, no -X needed
		});

		test('should build POST curl command with method flag', () => {
			const route: LaravelRoute = {
				method: 'POST',
				uri: '/api/users',
				name: 'users.store',
				action: 'UserController@store',
				controller: 'UserController@store',
				middleware: []
			};

			const curl = buildCurlCommand(route, { host: 'http://localhost:8000' });

			assert.ok(curl.includes('-X POST'));
		});

		test('should build PUT curl command', () => {
			const route: LaravelRoute = {
				method: 'PUT',
				uri: '/api/users/{id}',
				name: 'users.update',
				action: 'UserController@update',
				controller: 'UserController@update',
				middleware: []
			};

			const curl = buildCurlCommand(route, { host: 'http://localhost:8000' });

			assert.ok(curl.includes('-X PUT'));
		});

		test('should build DELETE curl command', () => {
			const route: LaravelRoute = {
				method: 'DELETE',
				uri: '/api/users/{id}',
				name: 'users.destroy',
				action: 'UserController@destroy',
				controller: 'UserController@destroy',
				middleware: []
			};

			const curl = buildCurlCommand(route, { host: 'http://localhost:8000' });

			assert.ok(curl.includes('-X DELETE'));
		});

		test('should include bearer token when provided', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: ['auth']
			};

			const curl = buildCurlCommand(route, {
				host: 'http://localhost:8000',
				bearerToken: 'test-token-123'
			});

			assert.ok(curl.includes("-H 'Authorization: Bearer test-token-123'"));
		});

		test('should include JSON body for POST requests', () => {
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
					},
					{
						name: 'email',
						type: 'email',
						required: true,
						rules: ['required', 'email'],
						isPathParam: false
					}
				]
			};

			const curl = buildCurlCommand(route, {
				host: 'http://localhost:8000',
				bodyParams: { name: 'John', email: 'john@example.com' }
			});

			assert.ok(curl.includes("-d '"));
			assert.ok(curl.includes('"name":"John"') || curl.includes('"name": "John"'));
		});

		test('should replace path parameters in URL', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users/{user}',
				name: 'users.show',
				action: 'UserController@show',
				controller: 'UserController@show',
				middleware: []
			};

			const curl = buildCurlCommand(route, {
				host: 'http://localhost:8000',
				pathParams: { user: '123' }
			});

			assert.ok(curl.includes('/api/users/123'));
			assert.ok(!curl.includes('{user}'));
		});

		test('should handle multiple path parameters', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users/{user}/posts/{post}',
				name: 'users.posts.show',
				action: 'PostController@show',
				controller: 'PostController@show',
				middleware: []
			};

			const curl = buildCurlCommand(route, {
				host: 'http://localhost:8000',
				pathParams: { user: '1', post: '42' }
			});

			assert.ok(curl.includes('/api/users/1/posts/42'));
		});

		test('should add query parameters to URL', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			};

			const curl = buildCurlCommand(route, {
				host: 'http://localhost:8000',
				queryParams: { page: '1', limit: '10' }
			});

			assert.ok(curl.includes('page=1'));
			assert.ok(curl.includes('limit=10'));
		});

		test('should use first method when multiple methods specified', () => {
			const route: LaravelRoute = {
				method: 'GET|HEAD',
				uri: '/api/status',
				name: 'status',
				action: 'StatusController@index',
				controller: 'StatusController@index',
				middleware: []
			};

			const curl = buildCurlCommand(route, { host: 'http://localhost:8000' });

			// GET is default, so no -X flag needed
			assert.ok(!curl.includes('-X HEAD'));
		});

		test('should handle custom headers', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			};

			const curl = buildCurlCommand(route, {
				host: 'http://localhost:8000',
				headers: { 'X-Custom-Header': 'custom-value' }
			});

			assert.ok(curl.includes("-H 'X-Custom-Header: custom-value'"));
		});
	});

	suite('buildRequestConfig', () => {
		test('should build config for simple GET route', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.method, 'GET');
			assert.strictEqual(config.url, 'http://localhost:8000/api/users');
			assert.strictEqual(config.route, route);
			assert.ok(config.headers['Accept']);
		});

		test('should build config for POST route', () => {
			const route: LaravelRoute = {
				method: 'POST',
				uri: '/api/users',
				name: 'users.store',
				action: 'UserController@store',
				controller: 'UserController@store',
				middleware: []
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.method, 'POST');
			assert.strictEqual(config.contentType, 'application/json');
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

			const config = buildRequestConfig(route, 'http://localhost:8000', {
				pathParams: { user: '42' }
			});

			assert.strictEqual(config.url, 'http://localhost:8000/api/users/42');
			assert.strictEqual(config.pathParams['user'], '42');
		});

		test('should keep placeholder for missing required path params', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users/{user}',
				name: 'users.show',
				action: 'UserController@show',
				controller: 'UserController@show',
				middleware: []
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.ok(config.url.includes('{user}'));
		});

		test('should handle optional path params', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users/{user?}',
				name: 'users.show',
				action: 'UserController@show',
				controller: 'UserController@show',
				middleware: []
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.ok(!config.url.includes('{user?}'));
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

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.contentType, 'multipart/form-data');
		});

		test('should populate body params with defaults for POST', () => {
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
					},
					{
						name: 'age',
						type: 'integer',
						required: false,
						rules: ['integer'],
						isPathParam: false
					}
				]
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.ok('name' in config.bodyParams);
			assert.ok('age' in config.bodyParams);
		});

		test('should populate query params for GET requests', () => {
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
					},
					{
						name: 'page',
						type: 'integer',
						required: false,
						rules: ['integer'],
						isPathParam: false
					}
				]
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.ok('search' in config.queryParams);
			assert.ok('page' in config.queryParams);
		});

		test('should strip trailing slash from host', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: '/api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			};

			const config = buildRequestConfig(route, 'http://localhost:8000/');

			assert.ok(!config.url.includes('//api'));
			assert.strictEqual(config.url, 'http://localhost:8000/api/users');
		});

		test('should handle routes with leading slash', () => {
			const route: LaravelRoute = {
				method: 'GET',
				uri: 'api/users',
				name: 'users.index',
				action: 'UserController@index',
				controller: 'UserController@index',
				middleware: []
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.url, 'http://localhost:8000/api/users');
		});

		test('should use first method when multiple methods specified', () => {
			const route: LaravelRoute = {
				method: 'PUT|PATCH',
				uri: '/api/users/{id}',
				name: 'users.update',
				action: 'UserController@update',
				controller: 'UserController@update',
				middleware: []
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.method, 'PUT');
		});
	});

	suite('buildRequestConfig with default values', () => {
		test('should set default value for integer type', () => {
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

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.bodyParams['quantity'], 1);
		});

		test('should set default value for boolean type', () => {
			const route: LaravelRoute = {
				method: 'POST',
				uri: '/api/settings',
				name: 'settings.store',
				action: 'SettingsController@store',
				controller: 'SettingsController@store',
				middleware: [],
				requestParams: [
					{
						name: 'active',
						type: 'boolean',
						required: true,
						rules: ['required', 'boolean'],
						isPathParam: false
					}
				]
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.bodyParams['active'], true);
		});

		test('should set default value for email type', () => {
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

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.bodyParams['email'], 'user@example.com');
		});

		test('should set default value for date type', () => {
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

			const config = buildRequestConfig(route, 'http://localhost:8000');

			// Should be a date string in YYYY-MM-DD format
			assert.ok(typeof config.bodyParams['event_date'] === 'string');
			assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(config.bodyParams['event_date'] as string));
		});

		test('should set default value for uuid type', () => {
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

			const config = buildRequestConfig(route, 'http://localhost:8000');

			// Should be a UUID string
			assert.ok(typeof config.bodyParams['ref_id'] === 'string');
			assert.ok(/^[0-9a-f-]{36}$/i.test(config.bodyParams['ref_id'] as string));
		});

		test('should set default value for url type', () => {
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

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.bodyParams['website'], 'https://example.com');
		});

		test('should set default value for array type', () => {
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

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.ok(Array.isArray(config.bodyParams['tags']));
		});

		test('should use enum value when available', () => {
			const route: LaravelRoute = {
				method: 'POST',
				uri: '/api/items',
				name: 'items.store',
				action: 'ItemController@store',
				controller: 'ItemController@store',
				middleware: [],
				requestParams: [
					{
						name: 'status',
						type: 'string',
						required: true,
						rules: ['required', 'in:draft,published,archived'],
						isPathParam: false,
						enumValues: ['draft', 'published', 'archived']
					}
				]
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.bodyParams['status'], 'draft');
		});

		test('should use explicit default value when available', () => {
			const route: LaravelRoute = {
				method: 'POST',
				uri: '/api/items',
				name: 'items.store',
				action: 'ItemController@store',
				controller: 'ItemController@store',
				middleware: [],
				requestParams: [
					{
						name: 'count',
						type: 'integer',
						required: false,
						rules: ['integer'],
						isPathParam: false,
						defaultValue: 10
					}
				]
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.strictEqual(config.bodyParams['count'], 10);
		});

		test('should handle nested object children', () => {
			const route: LaravelRoute = {
				method: 'POST',
				uri: '/api/users',
				name: 'users.store',
				action: 'UserController@store',
				controller: 'UserController@store',
				middleware: [],
				requestParams: [
					{
						name: 'address',
						type: 'object',
						required: true,
						rules: ['required', 'array'],
						isPathParam: false,
						children: [
							{
								name: 'street',
								type: 'string',
								required: true,
								rules: ['required', 'string'],
								isPathParam: false
							},
							{
								name: 'city',
								type: 'string',
								required: true,
								rules: ['required', 'string'],
								isPathParam: false
							}
						]
					}
				]
			};

			const config = buildRequestConfig(route, 'http://localhost:8000');

			assert.ok(typeof config.bodyParams['address'] === 'object');
			const address = config.bodyParams['address'] as Record<string, unknown>;
			assert.ok('street' in address);
			assert.ok('city' in address);
		});
	});
});
