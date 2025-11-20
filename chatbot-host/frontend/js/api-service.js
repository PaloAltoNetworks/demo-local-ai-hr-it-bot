/**
 * API Service for handling backend communication
 */
import { API_BASE_URL, CONFIG } from './config.js';

export class ApiService {
    constructor() {
        this.id = Math.random().toString(36).substr(2, 9);
        this.retryAttempts = new Map();
        this.currentLanguage = 'en';
        this.currentLLMProvider = 'aws';
        
        // Listen to language change events
        window.addEventListener('languageChanged', this.onLanguageChanged.bind(this));
        
        // Listen to AI provider change events
        window.addEventListener('aiProviderChanged', this.onAIProviderChanged.bind(this));
    }

    /**
     * Handle language change event
     */
    onLanguageChanged(event) {
        const { language } = event.detail;
        this.setLanguage(language);
    }

    /**
     * Set the current language for API requests
     */
    setLanguage(language) {
        this.currentLanguage = language;
    }

    /**
     * Handle AI provider change event
     */
    onAIProviderChanged(event) {
        const { provider } = event.detail;
        this.setAIProvider(provider);
    }

    /**
     * Set the current llm provider for API requests
     */
    setAIProvider(provider) {
        this.currentLLMProvider = provider;
    }

    /**
     * Private helper: Make fetch request with timeout and error handling
     * @private
     * @param {string} method - HTTP method (GET, POST, PUT, DELETE)
     * @param {string} endpoint - API endpoint path
     * @param {Object} options - Request options
     * @param {Object} options.headers - Custom headers
     * @param {any} options.body - Request body for POST/PUT
     * @param {number} options.timeout - Request timeout in ms
     * @param {boolean} options.returnResponse - Return Response object instead of JSON
     * @returns {Promise<Response|Object>} Response object or parsed JSON
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
                    'x-language': this.currentLanguage || 'en',
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
     * Private helper: Handle request errors and dispatch events
     * @private
     */
    #handleRequestError(error, endpoint, timeout, method = 'REQUEST') {
        if (error.name === 'AbortError') {
            console.warn(`⏱️ ${method} ${endpoint} timeout after ${timeout}ms`);
            // Dispatch timeout event for listeners like ConnectionMonitor
            const timeoutEvent = new CustomEvent('apiTimeout', {
                detail: {
                    endpoint: endpoint,
                    timeout: timeout,
                    language: this.currentLanguage,
                    method: method
                }
            });
            window.dispatchEvent(timeoutEvent);
        } else {
            console.error(`❌ ${method} ${endpoint} failed:`, error);
        }
    }

    /**
     * Generic GET request with timeout support
     */
    async get(endpoint, headers = {}, timeout = CONFIG.CONNECTION_TIMEOUT) {
        return this.#makeRequest('GET', endpoint, { headers, timeout });
    }

    /**
     * Generic POST request with timeout support
     */
    async post(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        return this.#makeRequest('POST', endpoint, { headers, body: data, timeout });
    }

    /**
     * Generic PUT request with timeout support
     */
    async put(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        return this.#makeRequest('PUT', endpoint, { headers, body: data, timeout });
    }

    /**
     * Generic DELETE request with timeout support
     */
    async delete(endpoint, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        return this.#makeRequest('DELETE', endpoint, { headers, timeout });
    }

    /**
     * Generic POST request for streaming responses (Server-Sent Events)
     */
    async postStream(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        return this.#makeRequest('POST', endpoint, { headers, body: data, timeout, returnResponse: true });
    }
}
