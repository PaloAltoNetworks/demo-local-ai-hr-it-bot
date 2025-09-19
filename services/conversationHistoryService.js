/**
 * Conversation History Service
 * Manages chat history and context for multi-step interactions
 */

const fs = require('fs');
const path = require('path');

class ConversationHistoryService {
  constructor() {
    this.sessions = new Map(); // In-memory storage for active sessions
    this.historyFile = path.join(__dirname, '../data/conversation-history.json');
    this.maxHistoryLength = 10; // Keep last 10 exchanges per session
    this.sessionTimeout = 30 * 60 * 1000; // 30 minutes session timeout
    
    this.loadHistoryFromFile();
    this.cleanupExpiredSessions();
  }

  /**
   * Load conversation history from file
   */
  loadHistoryFromFile() {
    try {
      if (fs.existsSync(this.historyFile)) {
        const data = fs.readFileSync(this.historyFile, 'utf8');
        const savedSessions = JSON.parse(data);
        
        // Restore sessions that are still valid
        for (const [sessionId, session] of Object.entries(savedSessions)) {
          if (new Date() - new Date(session.lastActivity) < this.sessionTimeout) {
            this.sessions.set(sessionId, {
              ...session,
              lastActivity: new Date(session.lastActivity)
            });
          }
        }
        
        console.log(`📚 Loaded ${this.sessions.size} active conversation sessions`);
      }
    } catch (error) {
      console.error('Error loading conversation history:', error);
    }
  }

  /**
   * Save conversation history to file
   */
  saveHistoryToFile() {
    try {
      const sessionsObj = {};
      for (const [sessionId, session] of this.sessions) {
        sessionsObj[sessionId] = session;
      }
      
      fs.writeFileSync(this.historyFile, JSON.stringify(sessionsObj, null, 2));
    } catch (error) {
      console.error('Error saving conversation history:', error);
    }
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = new Date();
    for (const [sessionId, session] of this.sessions) {
      if (now - session.lastActivity > this.sessionTimeout) {
        this.sessions.delete(sessionId);
      }
    }
    
    // Schedule next cleanup
    setTimeout(() => this.cleanupExpiredSessions(), 5 * 60 * 1000); // Every 5 minutes
  }

  /**
   * Get or create session for user
   * @param {string} userId - User identifier
   * @returns {Object} - Session object
   */
  getSession(userId) {
    const sessionId = `session_${userId}`;
    
    if (!this.sessions.has(sessionId)) {
      this.sessions.set(sessionId, {
        userId: userId,
        history: [],
        context: {},
        pendingActions: [],
        lastActivity: new Date(),
        created: new Date()
      });
    }
    
    const session = this.sessions.get(sessionId);
    session.lastActivity = new Date();
    
    return session;
  }

  /**
   * Add exchange to conversation history
   * @param {string} userId - User identifier
   * @param {string} userMessage - User's message
   * @param {string} botResponse - Bot's response
   * @param {Object} metadata - Additional context (intent, service, etc.)
   */
  addExchange(userId, userMessage, botResponse, metadata = {}) {
    const session = this.getSession(userId);
    
    const exchange = {
      timestamp: new Date().toISOString(),
      userMessage: userMessage,
      botResponse: botResponse,
      metadata: metadata
    };
    
    session.history.push(exchange);
    
    // Keep only recent history
    if (session.history.length > this.maxHistoryLength) {
      session.history = session.history.slice(-this.maxHistoryLength);
    }
    
    // Save to file periodically
    this.saveHistoryToFile();
  }

  /**
   * Get conversation history for context
   * @param {string} userId - User identifier
   * @param {number} limit - Number of recent exchanges to return
   * @returns {Array} - Array of exchanges
   */
  getHistory(userId, limit = 5) {
    const session = this.getSession(userId);
    return session.history.slice(-limit);
  }

  /**
   * Get conversation context as text for LangChain
   * @param {string} userId - User identifier
   * @param {number} limit - Number of recent exchanges
   * @returns {string} - Formatted conversation context
   */
  getContextForLangChain(userId, limit = 3) {
    const history = this.getHistory(userId, limit);
    
    if (history.length === 0) {
      return '';
    }
    
    const contextLines = ['Previous conversation context:'];
    
    history.forEach((exchange, index) => {
      contextLines.push(`${index + 1}. User: ${exchange.userMessage}`);
      contextLines.push(`   Bot: ${exchange.botResponse.substring(0, 150)}${exchange.botResponse.length > 150 ? '...' : ''}`);
      
      if (exchange.metadata.intent) {
        contextLines.push(`   (Intent: ${exchange.metadata.intent})`);
      }
    });
    
    contextLines.push('---');
    
    return contextLines.join('\n');
  }

  /**
   * Set pending action for multi-step interactions
   * @param {string} userId - User identifier
   * @param {string} actionType - Type of pending action
   * @param {Object} actionData - Data for the action
   */
  setPendingAction(userId, actionType, actionData) {
    const session = this.getSession(userId);
    
    // Clear previous pending actions of the same type
    session.pendingActions = session.pendingActions.filter(
      action => action.type !== actionType
    );
    
    session.pendingActions.push({
      type: actionType,
      data: actionData,
      timestamp: new Date().toISOString()
    });
    
    console.log(`⏳ Pending action set for user ${userId}: ${actionType}`);
  }

  /**
   * Get pending action
   * @param {string} userId - User identifier
   * @param {string} actionType - Type of action to retrieve
   * @returns {Object|null} - Pending action data or null
   */
  getPendingAction(userId, actionType) {
    const session = this.getSession(userId);
    
    const action = session.pendingActions.find(action => action.type === actionType);
    return action ? action.data : null;
  }

  /**
   * Clear pending action
   * @param {string} userId - User identifier
   * @param {string} actionType - Type of action to clear
   */
  clearPendingAction(userId, actionType) {
    const session = this.getSession(userId);
    
    session.pendingActions = session.pendingActions.filter(
      action => action.type !== actionType
    );
    
    console.log(`✅ Cleared pending action for user ${userId}: ${actionType}`);
  }

  /**
   * Check if user has pending actions
   * @param {string} userId - User identifier
   * @returns {Array} - Array of pending action types
   */
  getPendingActionTypes(userId) {
    const session = this.getSession(userId);
    return session.pendingActions.map(action => action.type);
  }

  /**
   * Set session context
   * @param {string} userId - User identifier
   * @param {string} key - Context key
   * @param {*} value - Context value
   */
  setContext(userId, key, value) {
    const session = this.getSession(userId);
    session.context[key] = value;
  }

  /**
   * Get session context
   * @param {string} userId - User identifier
   * @param {string} key - Context key
   * @returns {*} - Context value
   */
  getContext(userId, key) {
    const session = this.getSession(userId);
    return session.context[key];
  }

  /**
   * Clear session context
   * @param {string} userId - User identifier
   * @param {string} key - Context key to clear (optional, clears all if not provided)
   */
  clearContext(userId, key = null) {
    const session = this.getSession(userId);
    
    if (key) {
      delete session.context[key];
    } else {
      session.context = {};
    }
  }

  /**
   * Check if current query appears to be a confirmation (yes/no response)
   * @param {string} query - User query
   * @returns {Object} - {isConfirmation: boolean, isPositive: boolean}
   */
  detectConfirmation(query) {
    const normalizedQuery = query.toLowerCase().trim();
    
    // Positive confirmations
    const positivePatterns = [
      /^(oui|yes|ok|okay|d'accord|sure|bien sûr|absolument|certainement)$/i,
      /^(y|o)$/i, // Single letter confirmations
      /créer?\s*(le\s*)?ticket/i,
      /faire\s*(le\s*)?ticket/i
    ];
    
    // Negative confirmations  
    const negativePatterns = [
      /^(non|no|nope|pas|ne.*pas|annule|cancel)$/i,
      /^(n)$/i, // Single letter negative
      /pas\s*(de\s*)?ticket/i,
      /ne\s*veux\s*pas/i
    ];
    
    const isPositive = positivePatterns.some(pattern => pattern.test(normalizedQuery));
    const isNegative = negativePatterns.some(pattern => pattern.test(normalizedQuery));
    
    return {
      isConfirmation: isPositive || isNegative,
      isPositive: isPositive && !isNegative,
      confidence: isPositive || isNegative ? 0.9 : 0.0
    };
  }

  /**
   * Clear entire session
   * @param {string} userId - User identifier
   */
  clearSession(userId) {
    const sessionId = `session_${userId}`;
    this.sessions.delete(sessionId);
    console.log(`🗑️ Cleared session for user ${userId}`);
  }

  /**
   * Get session statistics
   * @returns {Object} - Session stats
   */
  getStats() {
    const activeSessions = this.sessions.size;
    const totalExchanges = Array.from(this.sessions.values())
      .reduce((total, session) => total + session.history.length, 0);
    
    return {
      activeSessions,
      totalExchanges,
      avgExchangesPerSession: activeSessions > 0 ? (totalExchanges / activeSessions).toFixed(2) : 0
    };
  }
}

module.exports = ConversationHistoryService;