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
     * Generic GET request with timeout support
     */
    async get(endpoint, headers = {}, timeout = CONFIG.CONNECTION_TIMEOUT) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-language': this.currentLanguage || 'en',
                    ...headers
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`⏱️ GET ${endpoint} timeout after ${timeout}ms`);
                // Dispatch timeout event for listeners like ConnectionMonitor
                const timeoutEvent = new CustomEvent('apiTimeout', {
                    detail: {
                        endpoint: endpoint,
                        timeout: timeout,
                        language: this.currentLanguage
                    }
                });
                window.dispatchEvent(timeoutEvent);
                throw new Error(`TIMEOUT_ERROR: ${endpoint}`);
            }
            console.error(`❌ GET ${endpoint} failed:`, error);
            throw error;
        }
    }

    /**
     * Generic POST request with timeout support
     */
    async post(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-language': this.currentLanguage || 'en',
                    ...headers
                },
                body: JSON.stringify(data),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`⏱️ POST ${endpoint} timeout after ${timeout}ms`);
                // Dispatch timeout event for listeners like ConnectionMonitor
                const timeoutEvent = new CustomEvent('apiTimeout', {
                    detail: {
                        endpoint: endpoint,
                        timeout: timeout,
                        language: this.currentLanguage
                    }
                });
                window.dispatchEvent(timeoutEvent);
                throw new Error(`TIMEOUT_ERROR: ${endpoint}`);
            }
            console.error(`❌ POST ${endpoint} failed:`, error);
            throw error;
        }
    }

    /**
     * Generic PUT request with timeout support
     */
    async put(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'PUT',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-language': this.currentLanguage || 'en',
                    ...headers
                },
                body: JSON.stringify(data),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`⏱️ PUT ${endpoint} timeout after ${timeout}ms`);
                // Dispatch timeout event for listeners like ConnectionMonitor
                const timeoutEvent = new CustomEvent('apiTimeout', {
                    detail: {
                        endpoint: endpoint,
                        timeout: timeout,
                        language: this.currentLanguage
                    }
                });
                window.dispatchEvent(timeoutEvent);
                throw new Error(`TIMEOUT_ERROR: ${endpoint}`);
            }
            console.error(`❌ PUT ${endpoint} failed:`, error);
            throw error;
        }
    }

    /**
     * Generic DELETE request with timeout support
     */
    async delete(endpoint, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'DELETE',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-language': this.currentLanguage || 'en',
                    ...headers
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return await response.json();
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`⏱️ DELETE ${endpoint} timeout after ${timeout}ms`);
                // Dispatch timeout event for listeners like ConnectionMonitor
                const timeoutEvent = new CustomEvent('apiTimeout', {
                    detail: {
                        endpoint: endpoint,
                        timeout: timeout,
                        language: this.currentLanguage
                    }
                });
                window.dispatchEvent(timeoutEvent);
                throw new Error(`TIMEOUT_ERROR: ${endpoint}`);
            }
            console.error(`❌ DELETE ${endpoint} failed:`, error);
            throw error;
        }
    }

    /**
     * Generic POST request for streaming responses (Server-Sent Events)
     */
    async postStream(endpoint, data = {}, headers = {}, timeout = CONFIG.REQUEST_TIMEOUT) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), timeout);

            const response = await fetch(`${API_BASE_URL}${endpoint}`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-language': this.currentLanguage || 'en',
                    ...headers
                },
                body: JSON.stringify(data),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            return response;
        } catch (error) {
            if (error.name === 'AbortError') {
                console.warn(`⏱️ POST ${endpoint} timeout after ${timeout}ms`);
                // Dispatch timeout event for listeners
                const timeoutEvent = new CustomEvent('apiTimeout', {
                    detail: {
                        endpoint: endpoint,
                        timeout: timeout,
                        language: this.currentLanguage
                    }
                });
                window.dispatchEvent(timeoutEvent);
                throw new Error(`TIMEOUT_ERROR: ${endpoint}`);
            }
            console.error(`❌ POST ${endpoint} failed:`, error);
            throw error;
        }
    }
}
