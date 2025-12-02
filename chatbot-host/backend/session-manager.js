import { EventEmitter } from 'events';
import { getLogger } from '../utils/index.js';

/**
 * Session Manager for MCP Client
 * Handles session state, persistence, and lifecycle management
 */
export class SessionManager extends EventEmitter {
  constructor(options = {}) {
    super();
    
    this.sessions = new Map(); // sessionId -> session data
    this.userSessions = new Map(); // userId -> sessionId
    this.sessionTimeout = options.sessionTimeout || 1800000; // 30 minutes default
    this.cleanupInterval = options.cleanupInterval || 300000; // 5 minutes
    this.maxSessionsPerUser = options.maxSessionsPerUser || 3;
    
    // Start cleanup timer
    this.startCleanupTimer();
    
    getLogger().info('SessionManager Initialized');
  }

  /**
   * Create or retrieve session for user
   */
  getOrCreateSession(userId, clientInfo = {}) {
    // Check if user already has an active session
    const existingSessionId = this.userSessions.get(userId);
    if (existingSessionId && this.sessions.has(existingSessionId)) {
      const session = this.sessions.get(existingSessionId);
      
      // Update last activity
      session.lastActivity = Date.now();
      
      getLogger().debug('Retrieved existing session for user ' + userId + ': ' + existingSessionId);
      return session;
    }

    // Create new session
    const sessionId = this.generateSessionId();
    const session = {
      sessionId,
      userId,
      clientInfo,
      createdAt: Date.now(),
      lastActivity: Date.now(),
      context: new Map(),
      messageHistory: [],
      toolUsage: new Map(),
      preferences: new Map(),
      state: 'active'
    };

    // Store session
    this.sessions.set(sessionId, session);
    this.userSessions.set(userId, sessionId);

    // Enforce session limits per user
    this.enforceSessionLimits(userId);

    getLogger().info('Created new session for user ' + userId + ': ' + sessionId);
    this.emit('sessionCreated', { sessionId, userId });

    return session;
  }

  /**
   * Get session by ID
   */
  getSession(sessionId) {
    const session = this.sessions.get(sessionId);
    if (session) {
      session.lastActivity = Date.now();
    }
    return session;
  }

  /**
   * Get session ID for a user
   */
  getSessionIdForUser(userId) {
    return this.userSessions.get(userId);
  }

  /**
   * Update session context
   */
  updateSessionContext(sessionId, contextUpdates) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      getLogger().warn('Attempt to update non-existent session: ' + sessionId);
      return false;
    }

    // Merge context updates
    if (contextUpdates && typeof contextUpdates === 'object') {
      Object.entries(contextUpdates).forEach(([key, value]) => {
        session.context.set(key, value);
      });
    }

    session.lastActivity = Date.now();
    
    getLogger().debug('Updated context for session ' + sessionId);
    this.emit('sessionUpdated', { sessionId, updates: contextUpdates });
    
    return true;
  }

  /**
   * Add message to session history
   */
  addMessageToHistory(sessionId, message) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Add timestamp if not present
    if (!message.timestamp) {
      message.timestamp = new Date().toISOString();
    }

    session.messageHistory.push(message);
    session.lastActivity = Date.now();

    // Keep history manageable (last 50 messages)
    if (session.messageHistory.length > 50) {
      session.messageHistory = session.messageHistory.slice(-50);
    }

    return true;
  }

  /**
   * Record tool usage
   */
  recordToolUsage(sessionId, toolName, usage) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    if (!session.toolUsage.has(toolName)) {
      session.toolUsage.set(toolName, {
        count: 0,
        lastUsed: null,
        totalDuration: 0
      });
    }

    const toolStats = session.toolUsage.get(toolName);
    toolStats.count++;
    toolStats.lastUsed = Date.now();
    if (usage.duration) {
      toolStats.totalDuration += usage.duration;
    }

    session.lastActivity = Date.now();
    
    return true;
  }

  /**
   * Set session preference
   */
  setSessionPreference(sessionId, key, value) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    session.preferences.set(key, value);
    session.lastActivity = Date.now();
    
    return true;
  }

  /**
   * Get session preference
   */
  getSessionPreference(sessionId, key, defaultValue = null) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return defaultValue;
    }

    return session.preferences.get(key) || defaultValue;
  }

  /**
   * Get session statistics
   */
  getSessionStats(sessionId) {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return null;
    }

    const now = Date.now();
    const sessionDuration = now - session.createdAt;
    const idleTime = now - session.lastActivity;

    return {
      sessionId,
      userId: session.userId,
      duration: sessionDuration,
      idleTime,
      messageCount: session.messageHistory.length,
      toolsUsed: Array.from(session.toolUsage.keys()),
      contextSize: session.context.size,
      preferencesCount: session.preferences.size,
      state: session.state,
      createdAt: new Date(session.createdAt).toISOString(),
      lastActivity: new Date(session.lastActivity).toISOString()
    };
  }

  /**
   * Get all active sessions
   */
  getActiveSessions() {
    const now = Date.now();
    const activeSessions = [];

    for (const [sessionId, session] of this.sessions) {
      if (session.state === 'active' && (now - session.lastActivity) < this.sessionTimeout) {
        activeSessions.push(this.getSessionStats(sessionId));
      }
    }

    return activeSessions;
  }

  /**
   * Terminate session
   */
  terminateSession(sessionId, reason = 'manual') {
    const session = this.sessions.get(sessionId);
    if (!session) {
      return false;
    }

    // Remove from user mapping
    this.userSessions.delete(session.userId);
    
    // Remove session
    this.sessions.delete(sessionId);

    getLogger().info('Terminated session ' + sessionId + ' (reason: ' + reason + ')');
    this.emit('sessionTerminated', { sessionId, userId: session.userId, reason });

    return true;
  }

  /**
   * Clean up expired sessions
   */
  cleanupExpiredSessions() {
    const now = Date.now();
    const expiredSessions = [];

    for (const [sessionId, session] of this.sessions) {
      const idleTime = now - session.lastActivity;
      
      if (idleTime > this.sessionTimeout) {
        expiredSessions.push(sessionId);
      }
    }

    expiredSessions.forEach(sessionId => {
      this.terminateSession(sessionId, 'timeout');
    });

    if (expiredSessions.length > 0) {
      getLogger().info('Cleaned up ' + expiredSessions.length + ' expired sessions');
    }

    return expiredSessions.length;
  }

  /**
   * Enforce session limits per user
   * Terminates oldest sessions if user exceeds the limit
   */
  enforceSessionLimits(userId) {
    // Get all active sessions for this user, sorted by last activity (oldest first)
    const userSessions = Array.from(this.sessions.values())
      .filter(session => session.userId === userId && session.state === 'active')
      .sort((a, b) => a.lastActivity - b.lastActivity);

    // Terminate excess sessions (keep only the most recent ones)
    let terminatedCount = 0;
    while (userSessions.length > this.maxSessionsPerUser) {
      const oldestSession = userSessions.shift();
      this.terminateSession(oldestSession.sessionId, 'limit_exceeded');
      terminatedCount++;
    }

    if (terminatedCount > 0) {
      getLogger().info('Enforced session limit for user ' + userId + ': terminated ' + terminatedCount + ' old session(s)');
      this.emit('sessionLimitEnforced', { 
        userId, 
        terminatedCount, 
        remainingSessions: userSessions.length,
        limit: this.maxSessionsPerUser
      });
    }

    return terminatedCount;
  }

  /**
   * Start cleanup timer
   */
  startCleanupTimer() {
    setInterval(() => {
      this.cleanupExpiredSessions();
    }, this.cleanupInterval);

    getLogger().info('Cleanup timer started (' + this.cleanupInterval + 'ms interval)');
  }

  /**
   * Generate unique session ID
   */
  generateSessionId() {
    return `mcp-session-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Get system statistics
   */
  getSystemStats() {
    const now = Date.now();
    const sessions = Array.from(this.sessions.values());
    
    const stats = {
      totalSessions: sessions.length,
      activeSessions: sessions.filter(s => s.state === 'active').length,
      uniqueUsers: new Set(sessions.map(s => s.userId)).size,
      avgSessionDuration: 0,
      totalMessages: 0,
      totalToolUsage: 0
    };

    if (sessions.length > 0) {
      const totalDuration = sessions.reduce((sum, s) => sum + (now - s.createdAt), 0);
      stats.avgSessionDuration = totalDuration / sessions.length;
      
      stats.totalMessages = sessions.reduce((sum, s) => sum + s.messageHistory.length, 0);
      
      stats.totalToolUsage = sessions.reduce((sum, s) => {
        return sum + Array.from(s.toolUsage.values()).reduce((toolSum, usage) => toolSum + usage.count, 0);
      }, 0);
    }

    return stats;
  }

  /**
   * Shutdown session manager
   */
  shutdown() {
    getLogger().info('Shutting down...');
    
    // Terminate all active sessions
    const sessionIds = Array.from(this.sessions.keys());
    sessionIds.forEach(sessionId => {
      this.terminateSession(sessionId, 'shutdown');
    });

    // Clear maps
    this.sessions.clear();
    this.userSessions.clear();

    // Remove all event listeners to prevent memory leaks
    this.removeAllListeners();

    getLogger().info('Shutdown complete');
  }
}