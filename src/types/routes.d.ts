/**
 * Type definitions for Laravel routes
 */

/**
 * Interface for a Laravel route
 */
export interface LaravelRoute {
	method: string;
	uri: string;
	name: string | null;
	action: string;
	controller: string | null;
	middleware: string[];
}
