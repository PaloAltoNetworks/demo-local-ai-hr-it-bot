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
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }

    /**
     * Send message with streaming thinking updates using Server-Sent Events
     */
    async sendMessageWithThinking(chatHistory, currentPhase, onThinking, onComplete, onSecurityCheckpoints, onCheckpoint, retryCount = 0) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

            const response = await fetch(`${API_BASE_URL}/api/process-prompt`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-language': this.currentLanguage,
                },
                body: JSON.stringify({ 
                    messages: chatHistory, 
                    phase: currentPhase,
                    language: this.currentLanguage,
                    llmProvider: this.currentLLMProvider
                }),
                signal: controller.signal
            });

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Mark as online if request succeeds
            this.updateConnectionStatus(true);
            this.retryAttempts.clear();

            // Process Server-Sent Events
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) {
                    clearTimeout(timeoutId);
                    break;
                }
                
                buffer += decoder.decode(value, { stream: true });
                const events = buffer.split('\n\n');
                buffer = events.pop(); // Keep incomplete event in buffer
                
                for (const event of events) {
                    if (event.trim()) {
                        try {
                            // Parse SSE format: "data: {...}"
                            const lines = event.trim().split('\n');
                            for (const line of lines) {
                                if (line.startsWith('data: ')) {
                                    const jsonStr = line.substring(6);
                                    if (jsonStr === '[DONE]') {
                                        continue;
                                    }
                                    
                                    const data = JSON.parse(jsonStr);
                                    
                                    if (data.type === 'thinking') {
                                        if (data.message) {
                                            if (onThinking) onThinking(data.message, false);
                                        }
                                    } else if (data.type === 'checkpoint') {
                                        // Handle individual checkpoint events - extract checkpoint from data
                                        if (onCheckpoint) {
                                            // Pass only checkpoint data (exclude the 'type' wrapper)
                                            const checkpointData = { ...data };
                                            delete checkpointData.type;
                                            onCheckpoint(checkpointData);
                                        }
                                    } else if (data.type === 'security-checkpoints') {
                                        if (onSecurityCheckpoints) onSecurityCheckpoints(data.checkpoints);
                                    } else if (data.type === 'response') {
                                        if (onComplete) onComplete(data);
                                        return data;
                                    } else if (data.type === 'error') {
                                        throw new Error(data.error || 'Unknown error occurred');
                                    }
                                }
                            }
                        } catch (e) {
                            console.error('Error parsing SSE event:', e);
                        }
                    }
                }
            }
        } catch (error) {
            return this.handleApiError(error, chatHistory, currentPhase, language, retryCount, true, onThinking, onComplete, onSecurityCheckpoints, onCheckpoint);
        }
    }

    /**
     * Send chat history to backend with retry logic (kept for non-streaming fallback)
     */
    async sendMessage(chatHistory, currentPhase, retryCount = 0) {
        // Use streaming version for all requests
        return this.sendMessageWithThinking(chatHistory, currentPhase, null, null, null, null, retryCount);
    }

    /**
     * Handle API errors with appropriate retry logic
     */
    async handleApiError(error, chatHistory, currentPhase, retryCount, isStreaming = false, onThinking = null, onComplete = null, onSecurityCheckpoints = null, onCheckpoint = null) {
        console.error(`API Error (attempt ${retryCount + 1}):`, error);
        
        // Handle different types of errors with user-friendly messages
        if (error.name === 'AbortError') {
            // Timeout error
            if (retryCount < CONFIG.MAX_RETRIES) {
                // Show retry notification to user
                this.notifyRetry(retryCount + 1, CONFIG.MAX_RETRIES);
                await this.delay(2000 * (retryCount + 1)); // Exponential backoff
                
                if (isStreaming) {
                    return this.sendMessageWithThinking(chatHistory, currentPhase, 
                        onThinking, onComplete, onSecurityCheckpoints, onCheckpoint, retryCount + 1);
                } else {
                    return this.sendMessage(chatHistory, currentPhase, retryCount + 1);
                }
            }
            throw new Error('TIMEOUT_ERROR');
        }
        
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            this.updateConnectionStatus(false);
            throw new Error('NETWORK_ERROR');
        }
        
        if (error.message.includes('NetworkError') || error.message.includes('CORS')) {
            this.updateConnectionStatus(false);
            throw new Error('NETWORK_ERROR');
        }

        // Server returned an error response
        if (error.message.includes('HTTP error!')) {
            const status = error.message.match(/status: (\d+)/)?.[1];
            if (status === '500' || status === '503') {
                throw new Error('SERVER_OVERLOAD');
            } else if (status === '408' || status === '504') {
                throw new Error('TIMEOUT_ERROR');
            }
            throw new Error('SERVER_ERROR');
        }

        if (retryCount < CONFIG.MAX_RETRIES) {
            console.warn(`Retry attempt ${retryCount + 1}:`, error.message);
            this.notifyRetry(retryCount + 1, CONFIG.MAX_RETRIES);
            await this.delay(1000 * (retryCount + 1)); // Exponential backoff
            
            if (isStreaming) {
                return this.sendMessageWithThinking(chatHistory, currentPhase,
                    onThinking, onComplete, onSecurityCheckpoints, onCheckpoint, retryCount + 1);
            } else {
                return this.sendMessage(chatHistory, currentPhase, retryCount + 1);
            }
        }
        
        // Mark as offline after all retries failed
        this.updateConnectionStatus(false);
        throw error;
    }

    /**
     * Notify user about retry attempts
     */
    notifyRetry(currentAttempt, maxAttempts) {
        // Dispatch custom event for retry notification
        const retryEvent = new CustomEvent('apiRetry', {
            detail: {
                attempt: currentAttempt,
                maxAttempts: maxAttempts
            }
        });
        window.dispatchEvent(retryEvent);
    }

    /**
     * Get current connection status
     */
    getConnectionStatus() {
        return this.isOnline;
    }

    /**
     * Get last health check data
     */
    getLastHealthData() {
        return this.lastHealthData;
    }

    /**
     * Utility delay function
     */
    delay(ms) {
        return new Promise(resolve => setTimeout(resolve, ms));
    }
}
