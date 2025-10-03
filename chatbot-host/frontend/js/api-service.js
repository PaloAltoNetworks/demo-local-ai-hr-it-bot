/**
 * API Service for handling backend communication
 */
import { API_BASE_URL, CONFIG } from './config.js';

export class ApiService {
    constructor() {
        this.isOnline = false;
        this.lastHealthData = null;
        this.retryAttempts = new Map();
        this.currentLanguage = 'en';
    }

    /**
     * Set the current language for API requests
     */
    setLanguage(language) {
        this.currentLanguage = language;
    }

    /**
     * Send chat history to backend with retry logic
     */
    async sendMessage(chatHistory, currentPhase, language, retryCount = 0) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

            const response = await fetch(`${API_BASE_URL}/api/process-prompt`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-language': language,
                },
                body: JSON.stringify({ 
                    messages: chatHistory, 
                    phase: currentPhase,
                    streamThinking: false, // Use old non-streaming method by default
                    language: language
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Mark as online if request succeeds
            this.updateConnectionStatus(true);
            this.retryAttempts.clear();

            return await response.json();
        } catch (error) {
            return this.handleApiError(error, chatHistory, currentPhase, language, retryCount, false);
        }
    }

    /**
     * Send message with streaming thinking updates
     */
    async sendMessageWithThinking(chatHistory, currentPhase, language, onThinking, onComplete, retryCount = 0) {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT);

            const response = await fetch(`${API_BASE_URL}/api/process-prompt`, {
                method: 'POST',
                mode: 'cors',
                headers: {
                    'Content-Type': 'application/json',
                    'x-language': language,
                },
                body: JSON.stringify({ 
                    messages: chatHistory, 
                    phase: currentPhase,
                    streamThinking: true,
                    language: language
                }),
                signal: controller.signal
            });

            clearTimeout(timeoutId);

            if (!response.ok) {
                throw new Error(`HTTP error! status: ${response.status}`);
            }

            // Mark as online if request succeeds
            this.updateConnectionStatus(true);
            this.retryAttempts.clear();

            // Process streaming response
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let buffer = '';

            while (true) {
                const { done, value } = await reader.read();
                
                if (done) break;
                
                buffer += decoder.decode(value, { stream: true });
                const lines = buffer.split('\n');
                buffer = lines.pop(); // Keep incomplete line in buffer
                
                for (const line of lines) {
                    if (line.trim()) {
                        try {
                            const data = JSON.parse(line);
                            
                            if (data.type === 'thinking') {
                                if (data.complete) {
                                    // Thinking is complete
                                    if (onThinking) onThinking(null, true);
                                } else if (data.message) {
                                    // New thinking message
                                    if (onThinking) onThinking(data.message, false);
                                }
                            } else if (data.type === 'response') {
                                // Final response received
                                if (onComplete) onComplete(data);
                                return data;
                            } else if (data.type === 'error') {
                                // Error response
                                throw new Error(data.error || 'Unknown error occurred');
                            }
                        } catch (e) {
                            console.error('Error parsing JSON:', e, line);
                        }
                    }
                }
            }
        } catch (error) {
            return this.handleApiError(error, chatHistory, currentPhase, language, retryCount, true, onThinking, onComplete);
        }
    }

    /**
     * Handle API errors with appropriate retry logic
     */
    async handleApiError(error, chatHistory, currentPhase, language, retryCount, isStreaming = false, onThinking = null, onComplete = null) {
        console.error(`API Error (attempt ${retryCount + 1}):`, error);
        
        // Handle different types of errors with user-friendly messages
        if (error.name === 'AbortError') {
            // Timeout error
            if (retryCount < CONFIG.MAX_RETRIES) {
                // Show retry notification to user
                this.notifyRetry(retryCount + 1, CONFIG.MAX_RETRIES);
                await this.delay(2000 * (retryCount + 1)); // Exponential backoff
                
                if (isStreaming) {
                    return this.sendMessageWithThinking(chatHistory, currentPhase, language, 
                        onThinking, onComplete, retryCount + 1);
                } else {
                    return this.sendMessage(chatHistory, currentPhase, language, retryCount + 1);
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
                return this.sendMessageWithThinking(chatHistory, currentPhase, language, 
                    onThinking, onComplete, retryCount + 1);
            } else {
                return this.sendMessage(chatHistory, currentPhase, language, retryCount + 1);
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
     * Check if backend is accessible
     */
    async checkConnection() {
        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.CONNECTION_TIMEOUT);

            // Use the dedicated health endpoint
            const response = await fetch(`${API_BASE_URL}/health`, {
                method: 'GET',
                mode: 'cors',
                headers: {
                    'x-language': this.currentLanguage || 'en'
                },
                signal: controller.signal
            });

            clearTimeout(timeoutId);
            
            // Accept 200 status - check service availability in response
            if (response.status === 200) {
                const healthData = await response.json();
                console.log('Health check response:', healthData);
                this.lastHealthData = healthData;
                
                // Consider system online if basic service is running, even if MCP is degraded
                const isBasicallyOnline = healthData.status === 'ok' || healthData.status === 'degraded';
                this.updateConnectionStatus(isBasicallyOnline, healthData);
                
                // Show MCP status warning if degraded
                if (healthData.status === 'degraded' && !healthData.serviceAvailable) {
                    console.warn('MCP services are unavailable:', healthData.message);
                }
                
                return isBasicallyOnline;
            } else {
                const healthData = await response.json().catch(() => ({}));
                console.warn('Health check failed with status:', response.status, healthData.message || '');
                this.lastHealthData = healthData;
                this.updateConnectionStatus(false, healthData);
                return false;
            }
        } catch (error) {
            this.handleConnectionError(error);
            this.updateConnectionStatus(false);
            return false;
        }
    }

    /**
     * Handle connection check errors
     */
    handleConnectionError(error) {
        if (error.name === 'TypeError' && error.message.includes('Failed to fetch')) {
            console.warn('Backend appears to be offline:', error.message);
        } else if (error.name === 'AbortError') {
            console.warn('Health check timeout');
        } else {
            console.warn('Backend connection check failed:', error.message);
        }
    }

    /**
     * Extract assistant message from API response
     */
    extractAssistantMessage(response) {
        if (!response?.messages?.length) {
            throw new Error('Invalid response format');
        }
        const lastMessage = response.messages[response.messages.length - 1];
        return lastMessage.content || 'No response received';
    }

    /**
     * Update connection status
     */
    updateConnectionStatus(isOnline, healthData = null) {
        this.isOnline = isOnline;
        // Health data is stored in lastHealthData and UI updates are handled by ConnectionMonitor
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
