import * as assert from 'assert';
import { buildCurlCommand, buildCurlCommandSingleLine } from '../../modules/api/curl-builder';

suite('cURL Builder Test Suite', () => {
	suite('buildCurlCommand', () => {
		test('should build basic GET curl command', () => {
			const curl = buildCurlCommand({
				method: 'GET',
				url: 'http://localhost:8000/api/users'
			});
			
			assert.ok(curl.includes("curl"));
			assert.ok(curl.includes("'http://localhost:8000/api/users'"));
			assert.ok(!curl.includes('-X GET'), 'Should not include -X GET since GET is default');
		});

		test('should build POST curl command with method flag', () => {
			const curl = buildCurlCommand({
				method: 'POST',
				url: 'http://localhost:8000/api/users'
			});
			
			assert.ok(curl.includes('-X POST'));
		});

		test('should include bearer token', () => {
			const curl = buildCurlCommand({
				method: 'GET',
				url: 'http://localhost:8000/api/users',
				bearerToken: 'my-secret-token'
			});
			
			assert.ok(curl.includes("Authorization: Bearer my-secret-token"));
		});

		test('should include JSON body for POST requests', () => {
			const curl = buildCurlCommand({
				method: 'POST',
				url: 'http://localhost:8000/api/users',
				bodyParams: { name: 'John', email: 'john@example.com' }
			});
			
			assert.ok(curl.includes("Content-Type: application/json"));
			assert.ok(curl.includes("-d '"));
			assert.ok(curl.includes('"name":"John"'));
		});

		test('should handle disabled params', () => {
			const curl = buildCurlCommand({
				method: 'POST',
				url: 'http://localhost:8000/api/users',
				bodyParams: { name: 'John', email: 'john@example.com', age: 30 },
				disabledParams: ['email']
			});
			
			assert.ok(curl.includes('"name":"John"'));
			assert.ok(!curl.includes('"email"'));
			assert.ok(curl.includes('"age":30'));
		});

		test('should add query parameters to URL', () => {
			const curl = buildCurlCommand({
				method: 'GET',
				url: 'http://localhost:8000/api/users',
				queryParams: [
					{ name: 'page', value: '1' },
					{ name: 'limit', value: '10' }
				]
			});
			
			assert.ok(curl.includes('page=1'));
			assert.ok(curl.includes('limit=10'));
		});

		test('should filter disabled query params', () => {
			const curl = buildCurlCommand({
				method: 'GET',
				url: 'http://localhost:8000/api/users',
				queryParams: [
					{ name: 'page', value: '1', enabled: true },
					{ name: 'limit', value: '10', enabled: false },
					{ name: 'sort', value: 'name' }
				]
			});
			
			assert.ok(curl.includes('page=1'));
			assert.ok(!curl.includes('limit=10'));
			assert.ok(curl.includes('sort=name'));
		});

		test('should handle multipart form data', () => {
			const curl = buildCurlCommand({
				method: 'POST',
				url: 'http://localhost:8000/api/upload',
				bodyParams: { name: 'test', file: 'data' },
				contentType: 'multipart/form-data'
			});
			
			assert.ok(curl.includes("-F 'name=test'"));
			assert.ok(curl.includes("-F 'file=data'"));
			assert.ok(!curl.includes("Content-Type: multipart"));
		});

		test('should escape single quotes in values', () => {
			const curl = buildCurlCommand({
				method: 'POST',
				url: 'http://localhost:8000/api/users',
				bodyParams: { name: "O'Brien" }
			});
			
			assert.ok(curl.includes("O'\\''Brien"));
		});

		test('should handle form-urlencoded content type', () => {
			const curl = buildCurlCommand({
				method: 'POST',
				url: 'http://localhost:8000/api/login',
				bodyParams: { username: 'john', password: 'secret' },
				contentType: 'application/x-www-form-urlencoded'
			});
			
			assert.ok(curl.includes("Content-Type: application/x-www-form-urlencoded"));
			assert.ok(curl.includes("username=john"));
			assert.ok(curl.includes("password=secret"));
		});
	});

	suite('buildCurlCommandSingleLine', () => {
		test('should return command without line breaks', () => {
			const curl = buildCurlCommandSingleLine({
				method: 'POST',
				url: 'http://localhost:8000/api/users',
				bodyParams: { name: 'John' },
				bearerToken: 'token'
			});
			
			assert.ok(!curl.includes('\n'));
			assert.ok(!curl.includes('\\'));
		});
	});
});
