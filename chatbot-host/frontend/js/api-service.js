/**
 * @fileoverview API Service for handling backend communication
 *
 * @responsibilities
 * - Execute HTTP requests (GET, POST, PUT, DELETE) with timeout handling
 * - Provide streaming response support for Server-Sent Events
 * - Handle request errors and dispatch timeout events
 * - Manage request lifecycle with abort controllers
 *
 * @dependencies
 * - config.js: API_BASE_URL, CONFIG
 *
 * @events
 * - Dispatches: 'apiTimeout' - When a request times out
 *
 * @version 1.0.0
 */

import { API_BASE_URL, CONFIG } from './config.js';

// ═══════════════════════════════════════════════════════════════════════════
// MODULE CONSTANTS
// ═══════════════════════════════════════════════════════════════════════════

/** @type {string} Module identifier for logging */
const MODULE_NAME = 'ApiService';

// ═══════════════════════════════════════════════════════════════════════════
// API SERVICE CLASS
// ═══════════════════════════════════════════════════════════════════════════

/**
 * @class ApiService
 * @description Service class for handling all backend HTTP communication with
 * support for timeouts, error handling, and streaming responses.
 *
 * @pattern Singleton-compatible Service
 *
 * @example
 * const apiService = new ApiService();
 * await apiService.init();
 *
 * const data = await apiService.get('/api/endpoint');
 * const result = await apiService.post('/api/endpoint', { key: 'value' });
 */
class ApiService {
    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE INSTANCE PROPERTIES
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * @type {boolean}
     * @private
     * @description Indicates whether the service has been initialized
     */
    #initialized = false;

    // ═══════════════════════════════════════════════════════════════════════
    // LIFECYCLE METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Initializes the API service
     * @async
     * @returns {Promise<void>}
     * @description Marks the service as ready for use.
     */
    async init() {
        if (this.#initialized) {
            console.warn(`[${MODULE_NAME}] Already initialized`);
            return;
        }

        this.#initialized = true;
        console.log(`[${MODULE_NAME}] Initialized`);
    }

    /**
     * Destroys the API service and cleans up resources
     * @returns {void}
     */
    destroy() {
        this.#initialized = false;
        console.log(`[${MODULE_NAME}] Destroyed`);
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PUBLIC API METHODS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Performs a GET request
     * @async
     * @param {string} endpoint - API endpoint path
     * @param {Object} [headers={}] - Custom headers to include
     * @param {number} [timeout=CONFIG.CONNECTION_TIMEOUT] - Request timeout in milliseconds
     * @returns {Promise<Object>} Parsed JSON response
     * @throws {Error} If the request fails or times out
     *
     * @example
     * const users = await apiService.get('/api/users');
     * const user = await apiService.get('/api/users/1', { 'Authorization': 'Bearer token' });
     */
    async get(endpoint, headers = {}, timeout = CONFIG.CONNECTION_TIMEOUT) {
        return this.#makeRequest('GET', endpoint, { headers, timeout });
    }

    /**
     * Performs a POST request
     * @async
     * @param {string} endpoint - API endpoint path
     * @param {Object} [data={}] - Request body data
     * @param {Object} [headers={}] - Custom headers to include
     * @param {number} [timeout=CONFIG.REQUEST_TIMEOUT] - Request timeout in milliseconds
     * @returns {Promise<Object>} Parsed JSON response
     * @throws {Error} If the request fails or times out
     *
     * @example
     * const result = await apiService.post('/api/users', { name: 'John', email: 'john@example.com' });
     */
    async post(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        return this.#makeRequest('POST', endpoint, { headers, body: data, timeout });
    }

    /**
     * Performs a PUT request
     * @async
     * @param {string} endpoint - API endpoint path
     * @param {Object} [data={}] - Request body data
     * @param {Object} [headers={}] - Custom headers to include
     * @param {number} [timeout=CONFIG.REQUEST_TIMEOUT] - Request timeout in milliseconds
     * @returns {Promise<Object>} Parsed JSON response
     * @throws {Error} If the request fails or times out
     *
     * @example
     * const result = await apiService.put('/api/users/1', { name: 'Jane' });
     */
    async put(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        return this.#makeRequest('PUT', endpoint, { headers, body: data, timeout });
    }

    /**
     * Performs a DELETE request
     * @async
     * @param {string} endpoint - API endpoint path
     * @param {Object} [headers={}] - Custom headers to include
     * @param {number} [timeout=CONFIG.REQUEST_TIMEOUT] - Request timeout in milliseconds
     * @returns {Promise<Object>} Parsed JSON response
     * @throws {Error} If the request fails or times out
     *
     * @example
     * await apiService.delete('/api/users/1');
     */
    async delete(endpoint, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        return this.#makeRequest('DELETE', endpoint, { headers, timeout });
    }

    /**
     * Performs a POST request that returns a streaming response
     * @async
     * @param {string} endpoint - API endpoint path
     * @param {Object} [data={}] - Request body data
     * @param {Object} [headers={}] - Custom headers to include
     * @param {number} [timeout=CONFIG.REQUEST_TIMEOUT] - Request timeout in milliseconds
     * @returns {Promise<Response>} Raw Response object for streaming
     * @throws {Error} If the request fails or times out
     *
     * @example
     * const response = await apiService.postStream('/api/chat', { message: 'Hello' });
     * const reader = response.body.getReader();
     */
    async postStream(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        return this.#makeRequest('POST', endpoint, { headers, body: data, timeout, returnResponse: true });
    }

    // ═══════════════════════════════════════════════════════════════════════
    // PRIVATE HELPERS
    // ═══════════════════════════════════════════════════════════════════════

    /**
     * Makes an HTTP request with timeout and error handling
     * @async
     * @private
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
     * @param {string} endpoint - API endpoint path
     * @param {Object} options - Request options
     * @param {Object} [options.headers={}] - Custom headers
     * @param {any} [options.body=null] - Request body for POST/PUT
     * @param {number} [options.timeout=CONFIG.REQUEST_TIMEOUT] - Request timeout in ms
     * @param {boolean} [options.returnResponse=false] - Return Response object instead of JSON
     * @returns {Promise<Response|Object>} Response object or parsed JSON
     * @throws {Error} If the request fails or times out
     */
    async #makeRequest(method, endpoint, { headers = {}, body = null, timeout = CONFIG.REQUEST_TIMEOUT, returnResponse = false } = {}) {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), timeout);

        try {
            const fetchOptions = {
                method,
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    ...headers
                },
                signal: controller.signal
            };

            if (body !== null) {
                fetchOptions.body = JSON.stringify(body);
            }

            const response = await fetch(`${API_BASE_URL}${endpoint}`, fetchOptions);
            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return returnResponse ? response : await response.json();
        } catch (error) {
            clearTimeout(timeoutId);
            this.#handleRequestError(error, endpoint, timeout, method);
            throw error;
        }
    }

    /**
     * Handles request errors and dispatches appropriate events
     * @private
     * @param {Error} error - The error that occurred
     * @param {string} endpoint - The endpoint that was being requested
     * @param {number} timeout - The timeout value that was used
     * @param {string} [method='REQUEST'] - The HTTP method that was used
     * @returns {void}
     */
    #handleRequestError(error, endpoint, timeout, method = 'REQUEST') {
        if (error.name === 'AbortError') {
            console.warn(`[${MODULE_NAME}] ⏱️ ${method} ${endpoint} timeout after ${timeout}ms`);

            const timeoutEvent = new CustomEvent('apiTimeout', {
                detail: {
                    endpoint: endpoint,
                    timeout: timeout,
                    method: method
                }
            });
            window.dispatchEvent(timeoutEvent);
        } else {
            console.error(`[${MODULE_NAME}] ${method} ${endpoint} failed:`, error);
        }
    }
}

// ═══════════════════════════════════════════════════════════════════════════
// EXPORT
// ═══════════════════════════════════════════════════════════════════════════

export { ApiService };
