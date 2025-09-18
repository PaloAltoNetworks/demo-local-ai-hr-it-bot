/**
 * La Loutre - Frontend Application
 * Enterprise HR/IT Assistant with WebSocket Real-time Chat
 */

class LaLoutreApp {
    constructor() {
        this.ws = null;
        this.currentLanguage = 'fr';
        this.isConnected = false;
        this.messageHistory = [];

        this.translations = {
            fr: {
                chatTitle: 'Assistant RH/IT Sécurisé',
                chatSubtitle: 'Traitement local avec Ollama • Données sécurisées sur site',
                welcomeText: 'Bienvenue dans La Loutre! Je suis votre assistant RH/IT sécurisé. Comment puis-je vous aider aujourd\'hui?',
                placeholder: 'Tapez votre question RH ou IT...',
                connecting: 'Connexion...',
                connected: 'Connecté',
                disconnected: 'Déconnecté',
                typing: 'La Loutre tape...',
                sidebarStats: 'Statistiques Organisation',
                sidebarFeatures: 'Fonctionnalités',
                sidebarHelp: 'Aide Rapide',
                employees: 'Employés',
                departments: 'Départements',
                footerText: 'La Loutre v1.0 • Palo Alto Networks • Assistant RH/IT Sécurisé',
                quickActions: {
                    vacation: 'Combien de jours de congés me reste-t-il?',
                    password: 'Comment réinitialiser mon mot de passe?',
                    equipment: 'Comment faire une demande d\'équipement IT?',
                    remote: 'Quelle est la politique de télétravail?'
                }
            },
            en: {
                chatTitle: 'Secure HR/IT Assistant',
                chatSubtitle: 'Local processing with Ollama • On-premise secure data',
                welcomeText: 'Welcome to La Loutre! I am your secure HR/IT assistant. How can I help you today?',
                placeholder: 'Type your HR or IT question...',
                connecting: 'Connecting...',
                connected: 'Connected',
                disconnected: 'Disconnected',
                typing: 'La Loutre is typing...',
                sidebarStats: 'Organization Statistics',
                sidebarFeatures: 'Features',
                sidebarHelp: 'Quick Help',
                employees: 'Employees',
                departments: 'Departments',
                footerText: 'La Loutre v1.0 • Palo Alto Networks • Secure HR/IT Assistant',
                quickActions: {
                    vacation: 'How many vacation days do I have left?',
                    password: 'How do I reset my password?',
                    equipment: 'How do I request IT equipment?',
                    remote: 'What is the work from home policy?'
                }
            }
        };

        this.init();
    }

    /**
     * Initialize the application
     */
    init() {
        this.setupEventListeners();
        this.connectWebSocket();
        this.loadOrganizationStats();
        this.checkOllamaStatus();
        this.updateLanguage();

        // Auto-resize textarea
        this.setupTextareaResize();
    }

    /**
     * Setup event listeners
     */
    setupEventListeners() {
        // Language toggle
        document.getElementById('language-toggle').addEventListener('click', () => {
            this.toggleLanguage();
        });

        // Send message
        document.getElementById('send-button').addEventListener('click', () => {
            this.sendMessage();
        });

        // Enter to send (Ctrl+Enter for new line)
        document.getElementById('chat-input').addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.ctrlKey && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Quick action buttons
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('quick-action')) {
                const query = e.target.getAttribute('data-query');
                this.sendQuickMessage(query);
            }
        });

        // Help links
        document.addEventListener('click', (e) => {
            if (e.target.classList.contains('help-link')) {
                e.preventDefault();
                const query = e.target.getAttribute('data-query');
                if (query) {
                    this.sendQuickMessage(query);
                }
            }
        });
    }

    /**
     * Setup textarea auto-resize
     */
    setupTextareaResize() {
        const textarea = document.getElementById('chat-input');
        textarea.addEventListener('input', () => {
            textarea.style.height = 'auto';
            textarea.style.height = Math.min(textarea.scrollHeight, 120) + 'px';
        });
    }

    /**
     * Connect to WebSocket server
     */
    connectWebSocket() {
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        const wsUrl = `${protocol}//${window.location.host}`;

        try {
            this.ws = new WebSocket(wsUrl);

            this.ws.onopen = () => {
                console.log('WebSocket connected');
                this.isConnected = true;
                this.updateConnectionStatus('connected');
            };

            this.ws.onmessage = (event) => {
                const message = JSON.parse(event.data);
                this.handleIncomingMessage(message);
            };

            this.ws.onclose = () => {
                console.log('WebSocket disconnected');
                this.isConnected = false;
                this.updateConnectionStatus('disconnected');

                // Attempt to reconnect after 3 seconds
                setTimeout(() => {
                    this.connectWebSocket();
                }, 3000);
            };

            this.ws.onerror = (error) => {
                console.error('WebSocket error:', error);
                this.updateConnectionStatus('disconnected');
            };

        } catch (error) {
            console.error('Failed to create WebSocket connection:', error);
            this.updateConnectionStatus('disconnected');
        }
    }

    /**
     * Update connection status indicator
     */
    updateConnectionStatus(status) {
        const statusText = document.getElementById('connection-indicator');

        const text = this.translations[this.currentLanguage][status] || status;
        statusText.textContent = text;

        console.log(`Connection status: ${status}`);

        if (status === 'connected') {
            statusText.className = 'connected';
        } else {
            statusText.className = 'disconnected';
        }

    }

    /**
     * Handle incoming WebSocket messages
     */
    handleIncomingMessage(message) {
        this.hideTypingIndicator();

        if (message.type === 'system' || message.type === 'assistant') {
            this.addMessageToChat('assistant', message.content, message.language);
        } else if (message.type === 'error') {
            this.addMessageToChat('system', message.content, message.language);
        }

        // Store message in history
        this.messageHistory.push(message);
    }

    /**
     * Send a message via WebSocket
     */
    sendMessage() {
        const input = document.getElementById('chat-input');
        const message = input.value.trim();

        if (!message || !this.isConnected) {
            return;
        }

        // Add user message to chat
        this.addMessageToChat('user', message, this.currentLanguage);

        // Send to server
        this.ws.send(JSON.stringify({
            type: 'chat',
            content: message,
            language: this.currentLanguage,
            timestamp: new Date().toISOString()
        }));

        // Clear input and show typing indicator
        input.value = '';
        input.style.height = 'auto';
        this.showTypingIndicator();

        // Store in history
        this.messageHistory.push({
            type: 'user',
            content: message,
            language: this.currentLanguage,
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Send a quick message from buttons/links
     */
    sendQuickMessage(query) {
        const input = document.getElementById('chat-input');
        input.value = query;
        this.sendMessage();
    }

    /**
     * Add message to chat display
     */
    addMessageToChat(sender, content, language) {
        const chatMessages = document.getElementById('chat-messages');

        const messageDiv = document.createElement('div');
        messageDiv.className = `message ${sender}`;

        const avatar = document.createElement('div');
        avatar.className = `message-avatar ${sender}`;

        if (sender === 'user') {
            avatar.textContent = '👤';
        } else if (sender === 'assistant') {
            avatar.textContent = '🦦';
        } else {
            avatar.textContent = '🤖';
        }

        const messageContent = document.createElement('div');
        messageContent.className = 'message-content';

        // Format message content with basic markdown-like formatting
        const formattedContent = this.formatMessageContent(content);
        messageContent.innerHTML = formattedContent;

        messageDiv.appendChild(avatar);
        messageDiv.appendChild(messageContent);

        chatMessages.appendChild(messageDiv);

        // Scroll to bottom
        chatMessages.scrollTop = chatMessages.scrollHeight;
    }

    /**
     * Format message content with basic styling
     */
    formatMessageContent(content) {
        return content
            .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')  // Bold
            .replace(/\*(.*?)\*/g, '<em>$1</em>')              // Italic
            .replace(/`(.*?)`/g, '<code>$1</code>')            // Code
            .replace(/\n/g, '<br>')                            // Line breaks
            .replace(/(https?:\/\/[^\s]+)/g, '<a href="$1" target="_blank" rel="noopener">$1</a>'); // Links
    }

    /**
     * Show typing indicator
     */
    showTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        indicator.classList.add('show');
    }

    /**
     * Hide typing indicator
     */
    hideTypingIndicator() {
        const indicator = document.getElementById('typing-indicator');
        indicator.classList.remove('show');
    }

    /**
     * Toggle language between French and English
     */
    toggleLanguage() {
        this.currentLanguage = this.currentLanguage === 'fr' ? 'en' : 'fr';
        this.updateLanguage();

        // Update language toggle button
        document.getElementById('current-lang').textContent = this.currentLanguage.toUpperCase();
    }

    /**
     * Update UI text based on current language
     */
    updateLanguage() {
        const t = this.translations[this.currentLanguage];

        // Update main UI elements
        document.getElementById('chat-title').textContent = t.chatTitle;
        document.getElementById('chat-subtitle').textContent = t.chatSubtitle;
        document.getElementById('chat-input').placeholder = t.placeholder;
        document.getElementById('sidebar-stats-title').textContent = t.sidebarStats;
        document.getElementById('sidebar-features-title').textContent = t.sidebarFeatures;
        document.getElementById('sidebar-help-title').textContent = t.sidebarHelp;
        document.getElementById('employees-label').textContent = t.employees;
        document.getElementById('departments-label').textContent = t.departments;
        document.getElementById('footer-text').textContent = t.footerText;
        document.getElementById('current-lang').textContent = this.currentLanguage.toUpperCase();

        // Update typing indicator
        document.querySelector('.typing-text').textContent = t.typing;

        // Update quick action buttons
        const quickActions = document.querySelectorAll('.quick-action');
        quickActions.forEach((button, index) => {
            const keys = Object.keys(t.quickActions);
            if (keys[index]) {
                const query = t.quickActions[keys[index]];
                button.textContent = button.textContent.split(' ').slice(0, 1).join(' ') + ' ' + query.split('?')[0].split(' ').slice(-2).join(' ');
                button.setAttribute('data-query', query);
            }
        });

        // Update features list
        const features = document.getElementById('features-list');
        if (this.currentLanguage === 'en') {
            features.innerHTML = `
                <li>🔒 Secure Local AI</li>
                <li>🌍 French & English</li>
                <li>⚡ Real-time Chat</li>
                <li>👥 Employee Management</li>
                <li>📋 HR/IT Automation</li>
                <li>🏢 Enterprise Integration</li>
            `;
        } else {
            features.innerHTML = `
                <li>🔒 IA Locale Sécurisée</li>
                <li>🌍 Français & Anglais</li>
                <li>⚡ Chat Temps Réel</li>
                <li>👥 Gestion Employés</li>
                <li>📋 Automatisation RH/IT</li>
                <li>🏢 Intégration Enterprise</li>
            `;
        }

        // Update help links
        const helpLinks = document.querySelectorAll('.help-link');
        if (this.currentLanguage === 'en') {
            helpLinks[0].innerHTML = '<span>❓</span> User Guide';
            helpLinks[0].setAttribute('data-query', 'How do I use La Loutre?');
            helpLinks[1].innerHTML = '<span>📚</span> HR Policies';
            helpLinks[1].setAttribute('data-query', 'What are the HR policies?');
            helpLinks[2].innerHTML = '<span>🛠️</span> IT Support';
            helpLinks[2].setAttribute('data-query', 'How do I contact IT support?');
        } else {
            helpLinks[0].innerHTML = '<span>❓</span> Guide d\'utilisation';
            helpLinks[0].setAttribute('data-query', 'Comment utiliser La Loutre?');
            helpLinks[1].innerHTML = '<span>📚</span> Politiques RH';
            helpLinks[1].setAttribute('data-query', 'Quelles sont les politiques RH?');
            helpLinks[2].innerHTML = '<span>🛠️</span> Support IT';
            helpLinks[2].setAttribute('data-query', 'Comment contacter le support IT?');
        }

        // Update welcome message
        const welcomeText = document.getElementById('welcome-text');
        if (welcomeText) {
            welcomeText.textContent = t.welcomeText;
        }
    }

    /**
     * Load organization statistics
     */
    async loadOrganizationStats() {
        try {
            const response = await fetch('/api/employees');
            if (response.ok) {
                const employees = await response.json();

                // Calculate statistics
                const totalEmployees = employees.length;
                const departments = new Set(employees.map(emp => emp.department)).size;

                // Update UI
                document.getElementById('total-employees').textContent = totalEmployees;
                document.getElementById('total-departments').textContent = departments;
            }
        } catch (error) {
            console.error('Failed to load organization stats:', error);
            document.getElementById('total-employees').textContent = '-';
            document.getElementById('total-departments').textContent = '-';
        }
    }

    /**
     * Check Ollama service status
     */
    async checkOllamaStatus() {
        try {
            const response = await fetch('/health');
            if (response.ok) {
                // Try to detect if Ollama is available by checking AI response
                const testResponse = await fetch('/api/hr-request', {
                    method: 'POST',
                    headers: {
                        'Content-Type': 'application/json'
                    },
                    body: JSON.stringify({
                        query: 'test',
                        language: this.currentLanguage
                    })
                });

                const indicator = document.getElementById('ollama-indicator');
                if (testResponse.ok) {
                    indicator.textContent = this.currentLanguage === 'fr' ? 'Connecté' : 'Connected';
                    indicator.className = 'connected';
                } else {
                    indicator.textContent = this.currentLanguage === 'fr' ? 'Mode Fallback' : 'Fallback Mode';
                    indicator.className = 'disconnected';
                }
            }
        } catch (error) {
            console.error('Failed to check Ollama status:', error);
            const indicator = document.getElementById('ollama-indicator');
            indicator.textContent = this.currentLanguage === 'fr' ? 'Indisponible' : 'Unavailable';
            indicator.className = 'disconnected';
        }
    }

    /**
     * Detect language from text (basic implementation)
     */
    detectLanguage(text) {
        const frenchWords = ['le', 'la', 'les', 'de', 'et', 'à', 'un', 'une', 'ce', 'que', 'qui', 'dans', 'pour', 'avec', 'sur'];
        const englishWords = ['the', 'and', 'to', 'of', 'a', 'in', 'for', 'is', 'on', 'that', 'by', 'this', 'with', 'i', 'you'];

        const words = text.toLowerCase().split(/\s+/);
        let frenchCount = 0;
        let englishCount = 0;

        words.forEach(word => {
            if (frenchWords.includes(word)) frenchCount++;
            if (englishWords.includes(word)) englishCount++;
        });

        return frenchCount > englishCount ? 'fr' : 'en';
    }
}

// Initialize the application when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    window.laLoutre = new LaLoutreApp();
});

// Export for testing purposes
if (typeof module !== 'undefined' && module.exports) {
    module.exports = LaLoutreApp;
}