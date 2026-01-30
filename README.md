# Outbound - Laravel API Development Extension for VS Code

Outbound is a powerful Visual Studio Code extension designed specifically for Laravel API development. It provides a comprehensive suite of tools for testing, debugging, and managing your Laravel API endpoints directly from your editor.

## Table of Contents

- [Features Overview](#features-overview)
- [Installation](#installation)
- [Configuration](#configuration)
- [Route Detection & Management](#route-detection--management)
- [Request Body Builder](#request-body-builder)
- [Authentication & Bearer Tokens](#authentication--bearer-tokens)
- [Making Requests](#making-requests)
- [Response Viewer](#response-viewer)
- [Code Navigation](#code-navigation)
- [Keyboard Shortcuts & Commands](#keyboard-shortcuts--commands)
- [Troubleshooting](#troubleshooting)

## Features Overview

- **Automatic Route Detection**: Automatically discovers all Laravel routes using `php artisan route:list`
- **Request Parameter Parsing**: Intelligently extracts request parameters from Laravel Form Request validators
- **Live Route Reloading**: Routes automatically refresh when PHP files are saved
- **Interactive Request Builder**: Visual interface for building and customizing API requests
- **Bearer Token Management**: Store and manage multiple authentication tokens per workspace
- **Response Visualization**: Formatted JSON/HTML response viewer with syntax highlighting
- **Code Navigation**: Click-to-navigate to controller methods directly from the routes panel
- **cURL Export**: Generate cURL commands for any request configuration
- **Workspace Persistence**: All customizations are saved per-workspace

## Installation

1. Open VS Code
2. Go to Extensions (Ctrl+Shift+X)
3. Search for "Outbound"
4. Click Install

Or install via the command line:
```bash
code --install-extension outbound
```

## Configuration

Access Outbound settings by clicking the gear icon (⚙️) next to "Laravel Routes" in the panel header, or navigate to **Settings > Extensions > Outbound**.

### Available Settings

| Setting | Default | Description |
|---------|---------|-------------|
| `outbound.apiHost` | `http://localhost:8000` | The base URL for your Laravel API server |
| `outbound.routeListCommand` | `php artisan route:list` | Command used to fetch Laravel routes |

### Workspace-Specific Configuration

All settings can be configured at the workspace level, allowing different projects to have different API hosts and configurations. This is especially useful when working with multiple Laravel projects simultaneously.

## Route Detection & Management

### Automatic Route Discovery

When you open a Laravel project, Outbound automatically runs `php artisan route:list --json` to discover all registered routes. The routes panel displays:

- **Request Method**: GET, POST, PUT, PATCH, DELETE (with color-coded badges)
- **URI**: The endpoint path including route parameters
- **Route Name**: Laravel's named route identifier
- **Controller**: The controller class and method handling the request

### Request Parameter Detection

Outbound goes beyond simple route listing by analyzing your Laravel code to extract request parameters. It follows Laravel conventions and supports multiple validation patterns:

#### Form Request Classes

When your controller method type-hints a Form Request class, Outbound automatically locates and parses the `rules()` method:

```php
// App\Http\Controllers\CampaignController.php
public function store(StoreCampaignRequest $request)
{
    // ...
}

// App\Http\Requests\StoreCampaignRequest.php
class StoreCampaignRequest extends FormRequest
{
    public function rules(): array
    {
        return [
            'name' => 'required|string|max:255',
            'description' => 'nullable|string',
            'budget' => 'required|numeric|min:0',
            'start_date' => 'required|date',
            'is_active' => 'boolean',
        ];
    }
}
```

Outbound will detect all five parameters and their types, pre-populating the request builder with appropriate input controls.

#### Inline Validation

Outbound also detects inline validation in controller methods:

```php
public function update(Request $request, $id)
{
    $validated = $request->validate([
        'name' => 'required|string|max:255',
        'details' => 'nullable|string',
    ]);
    // ...
}
```

#### Supported Validation Patterns

Outbound recognizes these validation patterns:

- `$request->validate([...])`
- `$this->validate($request, [...])`
- `Validator::make($request->all(), [...])->validate()`
- `Request::validate([...])`

#### Type Inference

Parameter types are inferred from validation rules:

| Validation Rule | Detected Type | Input Control |
|-----------------|---------------|---------------|
| `string`, `email`, `url` | string | Text input |
| `integer`, `numeric` | integer | Number input |
| `boolean` | boolean | Dropdown (true/false) |
| `date`, `date_format` | date | Date picker |
| `file`, `image`, `mimes` | file | File picker |
| `array` | array | JSON object editor |

### Live Route Reloading

Routes automatically refresh whenever you save a PHP file in your workspace. This ensures your route list always reflects the current state of your application without manual intervention.

The refresh process:
1. Detects `.php` file save events
2. Re-runs `php artisan route:list --json`
3. Re-parses controller files for validation rules
4. Updates the routes panel with new data

This is particularly useful when:
- Adding new routes to `routes/api.php`
- Modifying Form Request validation rules
- Changing controller method signatures
- Adding or removing route parameters

### Route Filtering

Use the search box at the top of the routes panel to filter routes by:
- URI path
- Route name
- Controller name
- HTTP method

## Request Body Builder

The Request Body Builder is an interactive modal for configuring and executing API requests.

### Opening the Request Builder

There are multiple ways to open the request builder:

1. **Click the Request button** in the routes panel table
2. **Right-click in a controller file** and select "Outbound: Test Endpoint"
3. **Use the command palette**: `Outbound: Test Endpoint`

### Modal Sections

#### Header Area

- **Title**: Shows the HTTP method and endpoint
- **Live URL Preview**: Displays the full URL that will be requested, including path parameters and query strings. For GET requests, this is a clickable link that opens in your browser.
- **Bearer Token Selector**: Quick access to change the authentication token for this request

#### URI Segments

When a route contains path parameters (e.g., `/api/users/{user}/posts/{post}`), the URI Segments section appears. Enter values for each segment to build the final URL.

Path parameters are detected from Laravel's route definition:
- `{user}` - Required parameter
- `{user?}` - Optional parameter

Values entered here are persisted per-route in your workspace storage.

#### Query Parameters

The Query Parameters section allows you to add URL query string parameters. This section is **collapsed by default** for POST/PUT/PATCH requests and **open by default** for GET requests.

Features:
- **Enable/Disable Toggle**: Each parameter has a checkbox to include/exclude it from the request
- **Add New Parameters**: Use the form at the bottom to add custom query parameters
- **Delete Parameters**: Click the × button to remove user-added parameters
- **Live URL Update**: The URL preview updates in real-time as you modify query parameters

For **GET/HEAD requests**, validation rules from your Laravel code are automatically converted to query parameters instead of body parameters.

#### Request Body

The Request Body section contains all parameters that will be sent in the request body (for POST, PUT, PATCH, DELETE requests).

**Parameter Controls**:
- **Enable/Disable Checkbox**: Toggle parameters on/off without deleting them. Disabled parameters appear dimmed and are excluded from the request.
- **Parameter Name**: The field name (read-only for detected parameters)
- **Parameter Type**: Shown in parentheses (string, integer, boolean, etc.)
- **Input Control**: Type-appropriate input (text, number, date picker, file selector, etc.)

**Visual Indicators**:
- Enabled parameters: Full opacity, editable
- Disabled parameters: 40% opacity, strikethrough label, excluded from request

#### Custom Parameters

Below the detected parameters, you can add custom parameters that weren't detected from your validation rules. This is useful for:
- Optional parameters not defined in validators
- Testing edge cases
- Adding metadata fields

To add a custom parameter:
1. Enter the parameter name
2. Select the type (Text, Number, Boolean, Date, File, Array, Object)
3. Click the + button

Custom parameters also support enable/disable toggles and persist to workspace storage.

#### Object/Array Editor

For complex nested data structures, Outbound provides a visual tree editor. Click the **Edit** button on any array or object field to open the Object Editor modal.

The Object Editor supports:
- **Infinite Nesting**: Create deeply nested object structures
- **Type Selection**: Choose from String, Number, Boolean, Null, Object, or Array for each field
- **Add/Remove Fields**: Easily manipulate the structure
- **Expand/Collapse All**: Navigation buttons appear when nested structures exist
- **Live Preview**: See the resulting JSON as you edit

### Persistence & State Management

All modifications to request parameters are automatically saved to your workspace storage:

- **Modified Values**: Any changes to parameter values
- **Enabled/Disabled State**: Which parameters are active
- **Custom Parameters**: User-added parameters
- **Query Parameters**: Custom query string values
- **Path Parameters**: URI segment values

The **"● saved"** indicator in the modal title shows when modifications have been persisted.

To reset all modifications and return to the auto-detected defaults, click **Reset to Defaults**.

## Authentication & Bearer Tokens

Outbound provides comprehensive bearer token management for authenticating API requests.

### Managing Tokens

Click the gear icon (⚙️) next to the AUTH TOKEN dropdown in the routes panel to open the Token Management modal.

**Adding Tokens**:
1. Enter a descriptive name (e.g., "Admin User", "Test Account")
2. Paste the bearer token value
3. Click Add Token

**Removing Tokens**:
1. Click the trash icon next to the token
2. Confirm the deletion

Tokens are stored in workspace storage and are available only for the current project.

### Using Tokens

1. **Global Selection**: Select a token from the AUTH TOKEN dropdown in the routes panel. This becomes the default for all requests.
2. **Per-Request Override**: When opening the request builder, you can select a different token from the Bearer Token dropdown in the modal header.

### Token in Requests

When a token is selected:
- It's automatically added to requests as `Authorization: Bearer <token>`
- The token value (not the name) is used in the actual request
- cURL exports include the authorization header

## Making Requests

### Server Status

The request modal footer displays real-time server status:
- **🟢 Server online**: The API host is reachable
- **🔴 Server offline**: Cannot connect to the API host

Server status is checked when the modal opens and does not block request submission.

### Sending Requests

Click **Send Request** to execute the API call. The request includes:
- HTTP method from the route definition
- Full URL with path parameters and query string
- Request body (for non-GET methods) with all enabled parameters
- Authorization header (if a token is selected)
- Content-Type and Accept headers for JSON

### Copy Operations

**Copy cURL**: Generates a complete cURL command that can be run from the terminal. The command includes:
- HTTP method
- All headers (Accept, Content-Type, Authorization)
- Request body as JSON
- Full URL with query parameters

**Copy JSON**: Copies just the request body as formatted JSON. This is useful for:
- Documentation
- Testing in other tools
- Sharing request examples

Both copy operations show a success message in the taskbar.

## Response Viewer

After sending a request, the Response Viewer modal displays the result.

### Response Header

- **HTTP Status**: Color-coded status badge (green for 2xx, red for 4xx/5xx)
- **Response Time**: Duration in milliseconds
- **Content Type**: JSON, HTML, or other

### Response Body

**JSON Responses**:
- Syntax highlighted with color-coded values
- Properly indented and formatted
- Strings, numbers, booleans, and null values are visually distinct

**HTML Responses**:
- Rendered in a sandboxed iframe
- Useful for viewing Laravel error pages or HTML responses

### Response Actions

- **Resubmit Request**: Returns to the request builder to modify and resend
- **Copy Response**: Copies the raw response body to clipboard
- **Close**: Dismisses the response viewer

## Code Navigation

### Controller Links

In the routes panel, clicking on a controller name (e.g., `App\Http\Controllers\CampaignController@store`) will:
1. Open the controller file
2. Navigate directly to the method definition
3. Position the cursor at the method

This provides quick navigation from route discovery to code implementation.

### Context Menu Integration

Right-click anywhere in a controller file to access:
- **Outbound: Test Endpoint**: Opens the request builder for the route handled by the method at your cursor position

Outbound intelligently determines which route corresponds to your cursor position by:
1. Identifying the controller file
2. Finding the method containing the cursor
3. Matching it to the registered route

## Keyboard Shortcuts & Commands

### Commands

Access these commands via the Command Palette (Ctrl+Shift+P):

| Command | Description |
|---------|-------------|
| `Outbound: Display Routes Table` | Opens the Laravel Routes panel |
| `Outbound: Test Endpoint` | Opens request builder for the current controller method |

### Modal Keyboard Shortcuts

| Key | Action |
|-----|--------|
| `Escape` | Close the current modal |
| `Enter` | Submit the request (when focused on input) |

## Troubleshooting

### Routes Not Loading

1. **Verify Laravel Installation**: Ensure `php artisan route:list` works in your terminal
2. **Check PHP Path**: The extension uses the system PHP. Verify PHP is in your PATH.
3. **Workspace Root**: Open VS Code at the Laravel project root (where `artisan` is located)

### Parameters Not Detected

1. **Form Request Location**: Ensure Form Requests are in `app/Http/Requests/`
2. **Validation Syntax**: Use standard Laravel validation array syntax
3. **Refresh Routes**: Save a PHP file to trigger route refresh

### Server Shows Offline

1. **Start Laravel Server**: Run `php artisan serve` in your project
2. **Check API Host**: Verify `outbound.apiHost` matches your server URL
3. **Firewall/Proxy**: Ensure no network restrictions block localhost connections

### Request Fails

1. **CORS Issues**: Ensure your Laravel app has proper CORS configuration
2. **Authentication**: Verify your bearer token is valid and not expired
3. **Validation Errors**: Check the response for Laravel validation error messages

### Extension Not Activating

1. **Laravel Project**: The extension activates only in workspaces containing an `artisan` file
2. **Reload Window**: Try `Developer: Reload Window` from the command palette

## Contributing

Contributions are welcome! Please see our [Contributing Guide](CONTRIBUTING.md) for details.

## License

This extension is licensed under the [MIT License](LICENSE).
