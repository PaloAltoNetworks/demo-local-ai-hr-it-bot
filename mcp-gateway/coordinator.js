import axios from 'axios';
import { PrismaAIRSIntercept, shouldUsePrismaAIRS } from './prisma-airs.js';
import { getLogger } from './utils/logger.js';
import { LLMProviderFactory } from './utils/llm-provider.js';

/**
 * Utility class for common coordinator operations
 */
class CoordinatorUtils {
  static buildUserIdentityInfo(userContext) {
    if (!userContext) return [];
    
    const identityInfo = [];
    if (userContext.name) identityInfo.push(`name: ${userContext.name}`);
    if (userContext.email) identityInfo.push(`email: ${userContext.email}`);
    if (userContext.role) identityInfo.push(`role: ${userContext.role}`);
    if (userContext.department) identityInfo.push(`dept: ${userContext.department}`);
    if (userContext.employeeId) identityInfo.push(`empId: ${userContext.employeeId}`);
    
    return identityInfo;
  }

  static buildConversationContext(conversationHistory) {
    if (!conversationHistory || !Array.isArray(conversationHistory) || conversationHistory.length === 0) {
      return '';
    }

    const recentMessages = conversationHistory.slice(-3);
    const contextMessages = recentMessages.map(msg => 
      `${msg.role}: "${msg.content?.substring(0, 100) || ''}"`
    ).join('\n');

    return `\n\nCONVERSATION CONTEXT (last ${recentMessages.length} messages):\n${contextMessages}`;
  }

  static cleanQuotes(text) {
    if (!text) return text;
    
    // Remove surrounding quotes if present
    if ((text.startsWith('"') && text.endsWith('"')) || 
        (text.startsWith("'") && text.endsWith("'"))) {
      return text.slice(1, -1);
    }
    return text;
  }

  static estimateTokens(text) {
    if (!text) return 0;
    return Math.ceil(text.trim().length / 4);
  }

  // LLM Prompt Templates
  static getPromptTemplate(type, params = {}) {
    const templates = {
      translation: (query, language) => `Translate this query from ${language} to English. Only return the English translation, nothing else.

Query: "${query}"`,

      routingStrategy: (agentProfiles, conversationContext, query) => `You are a JSON-only router. Output ONLY the JSON object below. No thinking, no explanation.

AVAILABLE AGENTS:
${agentProfiles}${conversationContext}

CURRENT USER QUERY: "${query}"

CRITICAL INSTRUCTIONS:
1. Review each agent's description and specialties carefully
2. Consider the conversation history context to understand the full context of what the user is asking
3. Determine if the query requires information from MULTIPLE agents
4. If the query has distinct parts that belong to different specialties, route to MULTIPLE agents
5. For example:
   - "Who is my manager and which tickets require his approval?" → ["hr", "it"] (manager info from HR, tickets from IT)
   - "What's my salary and computer status?" → ["hr", "it"] (salary from HR, computer from IT)
   - "Show me my projects" → ["general"] (single agent)
6. If routing to multiple agents, split the query into appropriate sub-queries for each

Output this JSON format exactly (replace values in quotes):
{"agents": [{"agent": "agent_name", "subQuery": "specific query for this agent"}], "reasoning": "brief"}

For multiple agents:
{"agents": [{"agent": "agent1", "subQuery": "query part 1"}, {"agent": "agent2", "subQuery": "query part 2"}], "reasoning": "brief"}

Now output the JSON:
{`,

      synthesis: (originalQuery, responseSummary) => `You are a response synthesizer. The user asked: "${originalQuery}"

Multiple specialist agents provided the following responses:

${responseSummary}

TASK: Combine these specialist responses into a single, coherent, and comprehensive answer that fully addresses the user's original question. 

GUIDELINES:
- Present information in a logical order
- Avoid redundancy
- Maintain the specialist expertise from each response
- Use clear formatting (bullets, sections) if helpful
- If responses conflict, note the discrepancy
- Be concise but complete

SYNTHESIZED RESPONSE:`,

      validation: (originalQuery, translatedQuery, response, agentName) => `Analyze if this agent response properly answers the user's question.

Original question: "${originalQuery}"
${translatedQuery !== originalQuery ? `Translated question: "${translatedQuery}"` : ''}
Agent: ${agentName}
Response: "${response}"

TASK: Determine if the response adequately addresses the user's question.

Return JSON format:
{"isRelevant": true/false, "reasoning": "brief explanation", "suggestedImprovement": "optional suggestion if not relevant"}`,

      conciseness: (originalQuery, response) => `Make this response more concise while preserving all essential information that answers the user's question.

User question: "${originalQuery}"
Response: "${response}"

Requirements:
- Keep all factual information
- Remove verbose explanations and filler text
- Maintain professional tone
- Ensure the answer is still complete and clear
- Maximum 3-4 sentences

Return only the concise version:`
    };

    const template = templates[type];
    if (!template) {
      throw new Error(`Unknown prompt template: ${type}`);
    }

    return template(...Object.values(params));
  }

  // Common LLM options
  static getLLMOptions(type, llmProvider = null) {
    const optionSets = {
      translation: {
        system: 'You are a precise translation assistant. Only return the English translation with no additional text or explanation.',
        temperature: 0.1,
        maxTokens: 1000,
        provider: llmProvider
      },
      routing: {
        system: `You are a JSON output formatter. You output ONLY valid JSON.
Start with { and end with }
Do not include any text before { or after }
Do not think or reason
Output JSON immediately`,
        temperature: 0.0,
        maxTokens: 200,
        provider: llmProvider
      },
      synthesis: {
        system: 'You are an expert at synthesizing information from multiple sources into clear, comprehensive responses.',
        temperature: 0.3,
        maxTokens: 2000,
        provider: llmProvider
      },
      validation: {
        system: 'You are a response quality analyzer. Output only valid JSON with the specified format.',
        temperature: 0.1,
        maxTokens: 300,
        provider: llmProvider
      },
      conciseness: {
        system: 'You are a text optimization assistant. Make responses concise while preserving all essential information.',
        temperature: 0.1,
        maxTokens: 1000,
        provider: llmProvider
      }
    };

    return optionSets[type] || { provider: llmProvider };
  }


}

/**
 * Intelligent Coordinator for MCP Gateway
 * 
 * RESPONSIBILITY: ALL routing decisions and intelligence
 * - Language detection and translation
 * - Security analysis (Prisma AIRS integration when phase3)
 * - LLM-based routing strategy
 * - Multi-agent coordination
 * - Response synthesis and quality assurance
 * 
 * DOES NOT: Handle MCP protocol (delegated to MCPServer)
 */
/**
 * Agent Registry for Intelligent Coordinator
 * Tracks available MCP agents and their capabilities
 */
class AgentRegistry {
  constructor() {
    this.agents = new Map(); // agentId -> agent metadata
  }

  registerAgent(agentData) {
    const { agentId, name, description, url, capabilities = [], LLMProviders = [] } = agentData;

    // Store agent metadata
    this.agents.set(agentId, {
      agentId,
      name,
      description,
      url,
      capabilities,
      LLMProviders,
      lastSeen: Date.now(),
      healthy: true,
      sessionId: null
    });



    const llmProviderInfo = LLMProviders.length > 0 ? ` with providers: ${LLMProviders.map(p => p.id).join(', ')}` : '';
    getLogger().debug(`Agent ${name} (${agentId}) registered with capabilities: ${JSON.stringify(capabilities)}${llmProviderInfo}`);
  }

  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Remove from capability index


      this.agents.delete(agentId);
      getLogger().debug(`Agent ${agent.name} (${agentId}) unregistered`);
    }
  }

  findAgentsForQuery(query) {
    // Return all healthy agents - delegate routing decision entirely to LLM
    return Array.from(this.agents.values())
      .filter(agent => agent.healthy)
      .map(agent => agent.agentId);
  }

  getDefaultAgent() {
    // Return first available agent as default, prefer 'general' if available
    const agents = Array.from(this.agents.values()).filter(agent => agent.healthy);
    const generalAgent = agents.find(agent => agent.name === 'general');
    return generalAgent ? [generalAgent.agentId] : (agents.length > 0 ? [agents[0].agentId] : []);
  }

  getAgent(agentId) {
    return this.agents.get(agentId);
  }

  getAllAgents() {
    return Array.from(this.agents.values());
  }

  updateAgentHealth(agentId, healthy) {
    const agent = this.agents.get(agentId);
    if (agent) {
      agent.healthy = healthy;
      agent.lastSeen = Date.now();
    }
  }

  /**
   * Get all available llm providers from registered agents
   * Returns unique providers across all agents
   */
  getAvailableLLMProviders() {
    const providersMap = new Map(); // id -> provider object

    for (const [agentId, agent] of this.agents) {
      if (agent.LLMProviders && Array.isArray(agent.LLMProviders)) {
        agent.LLMProviders.forEach(provider => {
          if (provider.id && !providersMap.has(provider.id)) {
            providersMap.set(provider.id, provider);
          }
        });
      }
    }

    return Array.from(providersMap.values());
  }
}

/**
 * Intelligent Coordinator
 * Handles ALL routing, intelligence, and security decisions for the MCP Gateway
 */
class IntelligentCoordinator {
  constructor(mcpServerRegistry) {
    this.llmRegistry = LLMProviderFactory.getRegistry();
    this.mcpServerRegistry = mcpServerRegistry; // Reference to MCPServerRegistry for forwarding
    this.agentRegistry = new AgentRegistry();
    this.requestCounter = 0;
    this.streamThinkingCallback = null;
    this.initialized = false;

    // Token usage tracking
    this.tokenUsage = {
      coordinator_tokens: 0,
      agent_tokens: 0,
      total_tokens: 0
    };

    // Security checkpoint data tracking for phase 3
    this.securityCheckpoints = [];

    // Security Phase 3 Integration
    // NOTE: Phase selection is done per-request via frontend UI, not at initialization
    // Always initialize Prisma AIRS if credentials are available (needed for dynamic phase selection)
    this.prismaAIRS = null;

    if (process.env.PRISMA_AIRS_API_TOKEN) {
      this.prismaAIRS = new PrismaAIRSIntercept({
        apiUrl: process.env.PRISMA_AIRS_API_URL,
        apiToken: process.env.PRISMA_AIRS_API_TOKEN,
        profileId: process.env.PRISMA_AIRS_PROFILE_ID,
        profileName: process.env.PRISMA_AIRS_PROFILE_NAME
      });
      getLogger().debug('Prisma AIRS security module loaded (available for phase3 requests)');
    } else {
      getLogger().warn('Prisma AIRS not configured - phase3 security unavailable');
    }
  }

  /**
   * Set callback for sending thinking messages
   */
  setStreamThinkingCallback(callback) {
    this.streamThinkingCallback = callback;
  }

  /**
   * Send thinking message
   */
  sendThinkingMessage(message) {
    if (this.streamThinkingCallback) {
      this.streamThinkingCallback(`${message}`);
    }
  }

  /**
   * Get collected security checkpoints for the current query
   */
  getSecurityCheckpoints() {
    return this.securityCheckpoints;
  }

  /**
   * Clear security checkpoints at the start of a new query
   */
  clearSecurityCheckpoints() {
    this.securityCheckpoints = [];
  }

  /**
   * Estimate tokens from text (approximation: 1 token ≈ 4 characters)
   */
  estimateTokens(text) {
    return CoordinatorUtils.estimateTokens(text);
  }

  /**
   * Unified token tracking method
   */
  trackTokens(input, type = 'coordinator', operationType = 'Operation') {
    let tokens = 0;
    
    if (typeof input === 'string') {
      // Text-based estimation
      tokens = this.estimateTokens(input);
    } else if (input && typeof input === 'object') {
      // LLM response object
      const promptTokens = input.usage?.prompt_tokens || input.prompt_eval_count || 0;
      const completionTokens = input.usage?.completion_tokens || input.eval_count || 0;
      tokens = input.usage?.total_tokens || promptTokens + completionTokens;
      
      if (tokens > 0) {
        getLogger().debug(`${operationType} tokens: ${promptTokens} (prompt) + ${completionTokens} (completion) = ${tokens}`);
      }
    }
    
    if (tokens > 0) {
      if (type === 'agent') {
        this.tokenUsage.agent_tokens += tokens;
      } else {
        this.tokenUsage.coordinator_tokens += tokens;
      }
      this.tokenUsage.total_tokens += tokens;
    }
  }

  // Legacy methods for backward compatibility
  trackCoordinatorTokens(text) { this.trackTokens(text, 'coordinator'); }
  trackAgentTokens(text) { this.trackTokens(text, 'agent'); }
  trackOllamaTokens(response, operationType = 'Operation') { this.trackTokens(response, 'coordinator', operationType); }

  /**
   * Agent registration endpoint
   */
  registerAgent(agentData) {
    // If agent didn't provide LLMProviders, add the available ones from gateway's LLM configuration
    if (!agentData.LLMProviders || agentData.LLMProviders.length === 0) {
      const availableProviders = LLMProviderFactory.getAvailableLLMProviders();
      agentData.LLMProviders = availableProviders;
    }

    this.agentRegistry.registerAgent(agentData);
    return { status: "registered", agentId: agentData.agentId };
  }

  /**
   * Agent unregistration endpoint
   */
  unregisterAgent(agentId) {
    this.agentRegistry.unregisterAgent(agentId);
    return { status: "unregistered", agentId };
  }

  /**
   * Initialize the coordinator
   */
  async initialize() {
    getLogger().debug('Initializing Intelligent Coordinator...');

    try {
      this.initialized = true;
      getLogger().debug('Initialized - waiting for agent registrations...');

      if (this.prismaAIRS && this.prismaAIRS.isConfigured()) {
        getLogger().debug('Prisma AIRS security active');
      }

      // Start periodic health checks for registered agents
      this.startHealthChecks();

    } catch (error) {
      getLogger().error('Failed to initialize:', { error: error.message });
      throw error;
    }
  }

  /**
   * Start periodic health checks for registered agents
   */
  startHealthChecks() {
    setInterval(async () => {
      const agents = this.agentRegistry.getAllAgents();
      for (const agent of agents) {
        try {
          const response = await axios.get(`${agent.url}/health`, { timeout: 3000 });
          if (response.status === 200) {
            this.agentRegistry.updateAgentHealth(agent.agentId, true);
          } else {
            this.agentRegistry.updateAgentHealth(agent.agentId, false);
          }
        } catch (error) {
          this.agentRegistry.updateAgentHealth(agent.agentId, false);
          getLogger().warn(`Agent ${agent.name} health check failed: ${error.message}`);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Helper method to generate text using LLMProviderFactory
   */
  async generateWithLLM(prompt, options = {}) {
    return LLMProviderFactory.generateText(prompt, options);
  }

  async translateQuery(query, language = 'en', llmProvider = null) {
    if (language === 'en') {
      return query; // No translation needed
    }

    getLogger().debug(`Translating "${query}" from ${language} to English`);

    try {
      const prompt = CoordinatorUtils.getPromptTemplate('translation', { query, language });
      const options = CoordinatorUtils.getLLMOptions('translation', llmProvider);
      
      const response = await this.generateWithLLM(prompt, options);
      let translatedQuery = response.response?.trim() || query;

      // Track actual tokens from LLM response
      this.trackTokens(response, 'coordinator', 'Translation');

      // Remove surrounding quotes if present
      translatedQuery = CoordinatorUtils.cleanQuotes(translatedQuery);

      getLogger().debug(`Translated: "${translatedQuery}"`);
      return translatedQuery;
    } catch (error) {
      getLogger().error('Translation failed:', { error: error.message });
      return query; // Return original query if translation fails
    }
  }

  /**
   * Route query to appropriate agent based on registered capabilities
   */
  async routeQuery(query, language = 'en', phase = 'phase2', userContext = null, llmProvider = 'aws') {
    // LLM provider selection is handled via registry.languageModel()
    // Provider parameter is used for model identifier construction

    getLogger().debug(`Routing query: "${query}"`);

    // Log received user identity
    if (userContext) {
      const identityInfo = CoordinatorUtils.buildUserIdentityInfo(userContext);
      if (identityInfo.length > 0) {
        getLogger().debug(`User identity received: ${identityInfo.join(', ')}`);
      }

      // Log conversation history if available
      if (userContext.history && Array.isArray(userContext.history) && userContext.history.length > 0) {
        getLogger().debug(`Conversation history available: ${userContext.history.length} messages`);
      }
    }

    try {
      // Log all registered agents
      const allAgents = this.agentRegistry.getAllAgents();
      getLogger().debug(`Total registered agents: ${allAgents.length}`);
      allAgents.forEach(agent => {
        getLogger().debug(`   - ${agent.name} (${agent.agentId}) - ${agent.description.substring(0, 60)}...`);
      });

      // Use registry to find matching agents
      const candidateAgentIds = this.agentRegistry.findAgentsForQuery(query);

      if (candidateAgentIds.length === 0) {
        throw new Error('No registered agents available');
      }

      getLogger().debug(`Candidate agents for this query: ${candidateAgentIds.map(id => {
        const agent = this.agentRegistry.getAgent(id);
        return `${agent.name}`;
      }).join(', ')}`);

      // Let LLM coordinator decide routing strategy and potential query splitting
      let routingStrategy;
      try {
        routingStrategy = await this.analyzeRoutingStrategy(query, candidateAgentIds, userContext?.history || [], llmProvider);
      } catch (strategyError) {
        getLogger().error('Strategy analysis failed:', { error: strategyError.message });
        throw strategyError;
      }

      if (routingStrategy.strategy === "declined") {
        getLogger().debug('Query declined by LLM for security/policy reasons');
        // Return a declined response indicating the request was refused
        return {
          type: 'declined',
          reasoning: routingStrategy.reasoning || 'This request cannot be processed.',
          response: routingStrategy.reasoning || 'I cannot assist with this request as it falls outside the scope of available services.'
        };
      } else if (routingStrategy.requiresMultiple) {
        getLogger().debug(`Multi-agent query detected, splitting across: ${routingStrategy.agents.map(a => a.agent).join(', ')}`);
        const multiAgentResponse = await this.handleMultiAgentQuery(query, routingStrategy, phase, userContext, llmProvider);
        // Return a special object to indicate this is a multi-agent final response
        return { type: 'multi-agent-response', response: multiAgentResponse };
      } else {
        // Single agent routing - use the agent specified in the JSON response
        const selectedAgentName = routingStrategy.agents[0].agent;
        const selectedAgentId = this.findAgentIdByName(selectedAgentName);

        if (!selectedAgentId) {
          throw new Error(`LLM selected unknown agent: "${selectedAgentName}". LLM must select from registered agents: ${this.agentRegistry.getAllAgents().map(a => a.name).join(', ')}`);
        }

        const selectedAgent = this.agentRegistry.getAgent(selectedAgentId);
        getLogger().debug(`Routed to: ${selectedAgent.name} agent (${selectedAgentId})`);
        return { type: 'agent-id', agentId: selectedAgentId };
      }
    } catch (error) {
      getLogger().error('Routing failed:', { error: error.message });
      // Propagate error up - don't silently fall back
      throw error;
    }
  }

  /**
   * Analyze routing strategy and determine if query splitting is needed
   */
  async analyzeRoutingStrategy(query, candidateAgentIds, conversationHistory = [], llmProvider = null) {
    try {
      // Build detailed agent profiles for LLM analysis
      const agentProfiles = candidateAgentIds.map(id => {
        const agent = this.agentRegistry.getAgent(id);
        const capabilities = agent.capabilities && agent.capabilities.length > 0
          ? agent.capabilities.map(cap => `  - ${cap}`).join('\n')
          : '  - General purpose assistance';

        return `
Agent: ${agent.name}
Description: ${agent.description}
Specializes in:
${capabilities}`;
      }).join('\n');

      // Log available agents for routing
      getLogger().debug(`Available agents for routing:`, candidateAgentIds.map(id => {
        const agent = this.agentRegistry.getAgent(id);
        return `${agent.name} (${id})`;
      }).join(', '));

      // Build conversation context from history
      const conversationContext = CoordinatorUtils.buildConversationContext(conversationHistory);

      const prompt = CoordinatorUtils.getPromptTemplate('routingStrategy', { 
        agentProfiles, 
        conversationContext, 
        query 
      });
      const options = CoordinatorUtils.getLLMOptions('routing', llmProvider);

      this.sendThinkingMessage(`Analyzing query routing strategy...`);
      const response = await this.generateWithLLM(prompt, options);

      // Track routing strategy tokens
      this.trackTokens(response, 'Routing strategy');

      try {
        // Validate response structure
        if (!response) {
          getLogger().error(`LLM returned null/undefined response`, response);
          throw new Error('LLM returned null/undefined response');
        }

        // Handle extended thinking models (qwen3, etc.) where content is in 'thinking' field
        let responseContent = response.response;
        if (!responseContent && response.thinking) {
          getLogger().debug(`Extended thinking detected, extracting from thinking field`);
          responseContent = response.thinking;
        }

        if (!responseContent || responseContent.trim().length === 0) {
          getLogger().error(`LLM returned empty response`, {
            hasResponse: !!response.response,
            hasThinking: !!response.thinking,
            responseLength: response.response?.length || 0,
            thinkingLength: response.thinking?.length || 0
          });
          throw new Error('LLM returned empty response and thinking');
        }

        // Clean the response - remove any markdown code blocks
        let jsonText = responseContent.trim();

        // Remove markdown code blocks if present
        if (jsonText.startsWith('```json')) {
          jsonText = jsonText.substring(7);
        }
        if (jsonText.startsWith('```')) {
          jsonText = jsonText.substring(3);
        }
        if (jsonText.endsWith('```')) {
          jsonText = jsonText.substring(0, jsonText.length - 3);
        }
        jsonText = jsonText.trim();

        // Prepend { if the model didn't include it but should have
        if (!jsonText.startsWith('{') && responseContent.includes('agents')) {
          jsonText = '{' + jsonText;
        }

        // Extract JSON - find from first { to last }
        const firstBrace = jsonText.indexOf('{');
        const lastBrace = jsonText.lastIndexOf('}');
        if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
          jsonText = jsonText.substring(firstBrace, lastBrace + 1);
        }

        // Validate JSON is not empty
        if (!jsonText || jsonText.length === 0 || !jsonText.includes('agents')) {
          getLogger().error(`LLM response produced no valid JSON content`);
          getLogger().error(`   Extracted text: "${jsonText.substring(0, 200)}"`);
          throw new Error('LLM response produced no valid JSON content');
        }

        const strategy = JSON.parse(jsonText);

        // Validate the strategy structure
        if (!strategy.agents || !Array.isArray(strategy.agents)) {
          throw new Error('Invalid strategy structure: agents must be an array');
        }

        // Handle cases where LLM refuses to route (empty agents array = security refusal)
        if (strategy.agents.length === 0) {
          getLogger().warn(`LLM declined to route query. Reasoning: ${strategy.reasoning || 'No explanation provided'}`);
          strategy.requiresMultiple = false;
          strategy.strategy = "declined";
          getLogger().warn(`Routing strategy: DECLINED`, strategy);
          return strategy;
        }

        // Automatically determine if multiple agents are needed based on array length
        strategy.requiresMultiple = strategy.agents.length > 1;
        strategy.strategy = strategy.agents.length > 1 ? "parallel" : "single";

        return strategy;
      } catch (parseError) {
        getLogger().error(`Strategy JSON parsing failed:`, parseError.message);
        // Log both response and thinking fields if present
        const rawContent = response?.response || response?.thinking || 'N/A';
        getLogger().error(`Problematic jsonText:`, jsonText);
        getLogger().error(`Full error:`, parseError);
        throw new Error(`LLM routing failed - invalid JSON response: ${jsonText}`);
      }
    } catch (error) {
      getLogger().error(`Strategy analysis failed:`, error.message);
      // Don't create a fallback strategy - let the error bubble up so we know LLM failed
      throw error;
    }
  }

  /**
   * Handle multi-agent queries by coordinating across multiple specialists
   */
  async handleMultiAgentQuery(originalQuery, routingStrategy, phase = 'phase2', userContext = null, llmProvider = 'aws') {
    this.sendThinkingMessage(`Coordinating multi-agent response across ${routingStrategy.agents.length} specialists...`);

    try {
      const agentResponses = [];

      if (routingStrategy.strategy === "parallel") {
        // Execute queries in parallel
        const promises = routingStrategy.agents.map(async (agentTask) => {
          const agentId = this.findAgentIdByName(agentTask.agent);
          if (!agentId) {
            throw new Error(`Agent ${agentTask.agent} not found`);
          }

          this.sendThinkingMessage(`Querying ${agentTask.agent} specialist: "${agentTask.subQuery}"`);
          const response = await this.queryAgent(agentId, agentTask.subQuery, userContext, 'en', phase, llmProvider);

          // Check if security blocked this agent's response
          if (response && response._securityBlock) {
            return {
              agent: agentTask.agent,
              query: agentTask.subQuery,
              response: null,
              securityBlocked: true,
              securityMessage: response.message
            };
          }

          return {
            agent: agentTask.agent,
            query: agentTask.subQuery,
            response: response
          };
        });

        const results = await Promise.all(promises);
        agentResponses.push(...results);

      } else if (routingStrategy.strategy === "sequential") {
        // Execute queries sequentially (for dependent queries)
        for (const agentTask of routingStrategy.agents) {
          const agentId = this.findAgentIdByName(agentTask.agent);
          if (!agentId) {
            throw new Error(`Agent ${agentTask.agent} not found`);
          }

          this.sendThinkingMessage(`Querying ${agentTask.agent} specialist: "${agentTask.subQuery}"`);
          const response = await this.queryAgent(agentId, agentTask.subQuery, userContext, 'en', phase, llmProvider);

          // Check if security blocked this agent's response
          if (response && response._securityBlock) {
            agentResponses.push({
              agent: agentTask.agent,
              query: agentTask.subQuery,
              response: null,
              securityBlocked: true,
              securityMessage: response.message
            });
            continue; // Continue with next agent
          }

          agentResponses.push({
            agent: agentTask.agent,
            query: agentTask.subQuery,
            response: response
          });
        }
      }

      // Combine responses using LLM
      this.sendThinkingMessage(`Synthesizing responses from all specialists...`);
      const combinedResponse = await this.synthesizeMultiAgentResponses(originalQuery, agentResponses, llmProvider);

      return combinedResponse;

    } catch (error) {
      getLogger().error('Multi-agent query failed:', error);
      // Fallback to single agent
      const fallbackAgentId = this.findAgentIdByName(routingStrategy.agents[0].agent);
      if (fallbackAgentId) {
        this.sendThinkingMessage(`⚠️ Multi-agent coordination failed, falling back to ${routingStrategy.agents[0].agent} specialist...`);
        return await this.queryAgent(fallbackAgentId, originalQuery, userContext, 'en', phase, llmProvider);
      }
      throw error;
    }
  }

  /**
   * Find agent ID by name
   */
  findAgentIdByName(agentName) {
    const allAgents = this.agentRegistry.getAllAgents();
    for (const agent of allAgents) {
      if (agent.name.toLowerCase() === agentName.toLowerCase()) {
        return agent.agentId;
      }
    }
    return null;
  }

  /**
   * Synthesize multiple agent responses into a coherent answer
   */
  async synthesizeMultiAgentResponses(originalQuery, agentResponses, llmProvider = null) {
    const responseSummary = agentResponses.map(resp =>
      `${resp.agent.toUpperCase()} SPECIALIST: "${resp.query}"\nResponse: ${resp.response}`
    ).join('\n\n');

    const prompt = CoordinatorUtils.getPromptTemplate('synthesis', { originalQuery, responseSummary });
    const options = CoordinatorUtils.getLLMOptions('synthesis', llmProvider);

    try {
      const response = await this.generateWithLLM(prompt, options);

      // Track synthesis tokens
      this.trackTokens(response, 'Response synthesis');

      return response.response;
    } catch (error) {
      getLogger().error('Response synthesis failed:', error);
      // Fallback: concatenate responses
      return agentResponses.map(resp =>
        `**${resp.agent.toUpperCase()}**: ${resp.response}`
      ).join('\n\n');
    }
  }

  /**
   * Query an agent via MCP protocol (delegating to MCPServerRegistry)
   */
  async queryAgent(agentId, query, userContext = null, language = 'en', phase = 'phase2', llmProvider = 'aws') {
    const agent = this.agentRegistry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in registry`);
    }

    getLogger().debug(`Querying ${agent.name} agent with llm provider: ${llmProvider}`);

    try {
      let securityCheckResult = { maskedQuery: null, hasMasking: false };

      // CHECKPOINT 2: Analyze outbound request security (use passed phase)
      if (shouldUsePrismaAIRS(phase)) {
        getLogger().debug(`Phase 3 active - Running Security Checkpoint 2: Outbound Request to ${agent.name}`);
        securityCheckResult = await this.analyzeOutboundRequest(query, agent.name, language, userContext?.email, agent.name, userContext?.sessionId);
        if (!securityCheckResult.approved) {
          getLogger().warn(`🚫 Security Checkpoint 2 BLOCKED: ${securityCheckResult.category}`);
          throw new Error(`Security blocked outbound request to ${agent.name}: ${securityCheckResult.message}`);
        }
        getLogger().debug(`Security Checkpoint 2 PASSED`);

        // If sensitive data was detected and masked, use the masked query instead
        if (securityCheckResult.hasMasking) {
          getLogger().debug(`Using masked query for agent (sensitive data detected)`);
        }
      }

      this.sendThinkingMessage(`Establishing connection with ${agent.name}...`);

      // Build enriched query with user context embedded naturally
      // Use masked query if sensitive data was detected, otherwise use original query
      const queryToSend = securityCheckResult.maskedQuery || query;
      let enrichedQuery = queryToSend;

      // Add conversation history context if available
      if (userContext?.history && Array.isArray(userContext.history) && userContext.history.length > 0) {
        const conversationSummary = userContext.history
          .map(msg => {
            const role = msg.role === 'user' ? 'User' : 'Assistant';
            return `${role}: ${msg.content}`;
          })
          .join('\n');

        enrichedQuery = `[Conversation context]\n${conversationSummary}\n\n[Current query]\n${enrichedQuery}`;
        getLogger().debug(`Added conversation history (${userContext.history.length} messages) to query for ${agent.name}`);
      }

      // Add user context to the query as natural language if provided
      if (userContext) {
        const contextInfo = [];
        if (userContext.name) contextInfo.push(`user: ${userContext.name}`);
        if (userContext.role) contextInfo.push(`role: ${userContext.role}`);
        if (userContext.department) contextInfo.push(`department: ${userContext.department}`);
        if (userContext.email) contextInfo.push(`email: ${userContext.email}`);
        if (userContext.employeeId) contextInfo.push(`employee ID: ${userContext.employeeId}`);

        if (contextInfo.length > 0) {
          enrichedQuery = `${enrichedQuery}\n[User context: ${contextInfo.join(', ')}]`;
          getLogger().debug(`Enriched query for ${agent.name} with user context`);
        }
      }

      // Track outbound request tokens (after enrichment)
      this.trackAgentTokens(enrichedQuery);

      // Build query URI with llmProvider parameter
      let queryUri = `${agent.name}://query?q=${encodeURIComponent(enrichedQuery)}`;
      if (llmProvider) {
        queryUri += `&provider=${encodeURIComponent(llmProvider)}`;
      }

      // Make MCP resource request via MCPServerRegistry
      // Note: llmProvider is passed in userContext, not in the URI
      const resourceRequest = {
        jsonrpc: '2.0',
        method: 'resources/read',
        id: ++this.requestCounter,
        params: {
          uri: queryUri
        }
      };

      getLogger().debug(`Sending resource request to ${agent.name} (llm provider: ${llmProvider})`);
      this.sendThinkingMessage(`Sending request to ${agent.name} specialist...`);

      // Use MCPServerRegistry to forward the request
      const response = await this.mcpServerRegistry.forwardRequest(agentId, resourceRequest);

      if (response.error) {
        throw new Error(`Agent ${agent.name} returned error: ${response.error.message}`);
      }

      if (response.result?.contents?.[0]?.text) {
        const responseText = response.result.contents[0].text;

        // Track agent tokens from the response
        this.trackAgentTokens(responseText);

        // CHECKPOINT 3: Analyze inbound response security (use passed phase)
        let responseToReturn = responseText;
        if (shouldUsePrismaAIRS(phase)) {
          getLogger().debug(`Phase 3 active - Running Security Checkpoint 3: Inbound Response from ${agent.name}`);
          const inboundSecurity = await this.analyzeInboundResponse(query, responseText, agent.name, language, userContext?.email, agent.name, userContext?.sessionId);
          if (!inboundSecurity.approved) {
            getLogger().warn(`Security Checkpoint 3 BLOCKED: ${inboundSecurity.category}`);
            // Return the security block info - don't throw, let processQuery handle it
            return {
              _securityBlock: true,
              message: inboundSecurity.message,
              category: inboundSecurity.category,
              reportId: inboundSecurity.reportId
            };
          }
          getLogger().debug(`Security Checkpoint 3 PASSED`);

          // If sensitive data was detected and masked in the response, use the masked response
          if (inboundSecurity.hasMasking) {
            responseToReturn = inboundSecurity.maskedResponse;
            getLogger().debug(`Using masked response (sensitive data detected)`);
          }
        }

        return responseToReturn;
      } else {
        getLogger().error(`Invalid response format from ${agent.name}:`, response);
        throw new Error('No valid response from agent');
      }
    } catch (error) {
      getLogger().error(`Failed to query ${agent.name}:`, {
        message: error.message
      });
      throw error;
    }
  }

  /**
   * Process and validate agent response
   * Verifies if response matches user request, makes it concise, and translates if needed
   */
  async processAgentResponse(agentResponse, originalQuery, translatedQuery, targetLanguage = 'en', agentName, llmProvider = null) {
    try {
      getLogger().debug(`Processing response from ${agentName}...`);

      // Step 1: Verify response relevance and extract key information
      const validationPrompt = `You are a response quality validator. Analyze if the agent response properly answers the user's question and extract the key information.

Original user question: "${originalQuery}"
${translatedQuery !== originalQuery ? `Translated question: "${translatedQuery}"` : ''}
Agent response: "${agentResponse}"

RESPOND WITH VALID JSON ONLY - NO OTHER TEXT.

Extract:
1. If response answers the question (true/false)
2. The most relevant and concise information 
3. Remove unnecessary explanations or thinking processes
4. Keep only essential facts answering the question

RESPOND ONLY WITH THIS JSON FORMAT:
{
  "isRelevant": true,
  "keyInformation": "concise answer",
  "confidence": "high",
  "reasoning": "brief explanation"
}`;

      const validationResponse = await this.generateWithLLM(validationPrompt, {
        system: 'You are a response quality validator. You MUST respond with valid JSON only. Focus on extracting the most concise and relevant information.',
        temperature: 0.1,
        maxTokens: 300,
        provider: llmProvider
      });

      // Track validation tokens
      this.trackTokens(validationResponse, 'Response validation');

      let validation;
      try {
        // Clean and parse JSON response
        let jsonText = validationResponse.response.trim();

        // Extract JSON if it's wrapped in other text
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }

        // Remove any control characters that might interfere with JSON parsing
        jsonText = jsonText.replace(/[\x00-\x1F\x7F]/g, ' ').trim();

        validation = JSON.parse(jsonText);
      } catch (parseError) {
        getLogger().warn(`⚠️ Validation parsing failed:`, parseError.message);
        getLogger().debug(`Raw validation response:`, validationResponse.response.substring(0, 200));
        validation = {
          isRelevant: true,
          keyInformation: agentResponse,
          confidence: "medium",
          reasoning: "Validation parsing failed, assuming relevant"
        };
      }

      // Step 2: Use processed response or fallback to original
      let processedResponse = validation.isRelevant ? validation.keyInformation : agentResponse;

      // Step 3: Translate back to target language if needed
      if (targetLanguage !== 'en') {
        getLogger().debug(`Translating response to ${targetLanguage}`);
        processedResponse = await this.translateResponse(processedResponse, targetLanguage, llmProvider);
      }

      // // Step 4: Final quality check - ensure response is concise and clear
      // if (processedResponse.length > 500) {
      //   getLogger().debug(`Response is lengthy, making it more concise...`);
      //   processedResponse = await this.makeConcise(processedResponse, originalQuery);
      // }

      getLogger().debug(`Response processing completed`);
      return processedResponse;

    } catch (error) {
      getLogger().error(`Response processing failed:`, error);
      // Fallback to original response if processing fails
      return targetLanguage !== 'en' ? await this.translateResponse(agentResponse, targetLanguage, llmProvider) : agentResponse;
    }
  }

  /**
   * Translate response to target language
   */
  async translateResponse(response, targetLanguage, llmProvider = null) {
    if (targetLanguage === 'en') {
      return response;
    }

    try {
      const translationPrompt = `Translate this English response to ${targetLanguage}. 

IMPORTANT INSTRUCTIONS:
- Translate only the actual content, not technical tags or markup
- Maintain the same tone and level of detail
- Ignore any <think> tags or similar markup
- Return ONLY the clean translation, nothing else

Response to translate: "${response}"`;

      const translationResponse = await this.generateWithLLM(translationPrompt, {
        system: `You are a precise translation assistant. Translate only the meaningful content, ignore technical markup. Return ONLY the ${targetLanguage} translation with no additional text, tags, or explanation.`,
        temperature: 0.1,
        maxTokens: 2000,
        provider: llmProvider
      });

      let translatedResponse = translationResponse.response?.trim() || response;

      // Track response translation tokens
      this.trackTokens(translationResponse, 'Response translation');

      // Remove surrounding quotes if present
      if (translatedResponse.startsWith('"') && translatedResponse.endsWith('"')) {
        translatedResponse = translatedResponse.slice(1, -1);
      }
      if (translatedResponse.startsWith("'") && translatedResponse.endsWith("'")) {
        translatedResponse = translatedResponse.slice(1, -1);
      }

      getLogger().debug(`Translated response to ${targetLanguage}`);
      return translatedResponse;
    } catch (error) {
      getLogger().error(`Response translation failed:`, error);
      return response; // Return original if translation fails
    }
  }

  /**
   * Make response more concise while preserving key information
   */
  async makeConcise(response, originalQuery, llmProvider = null) {
    try {
      const concisePrompt = `Make this response more concise while preserving all essential information that answers the user's question.

User question: "${originalQuery}"
Response: "${response}"

Requirements:
- Keep all factual information
- Remove verbose explanations and filler text
- Maintain professional tone
- Ensure the answer is still complete and clear
- Maximum 3-4 sentences

Return only the concise version:`;

      const conciseResponse = await this.generateWithLLM(concisePrompt, {
        system: 'You are a text optimization assistant. Make responses concise while preserving all essential information.',
        temperature: 0.1,
        maxTokens: 1000,
        provider: llmProvider
      });

      // Track conciseness optimization tokens
      this.trackTokens(conciseResponse, 'Conciseness optimization');

      const conciseText = conciseResponse.response?.trim() || response;
      getLogger().debug(`Made response more concise`);
      return conciseText;
    } catch (error) {
      getLogger().error(`Concise processing failed:`, error);
      return response;
    }
  }

  /**
   * Store security checkpoint data for display on frontend
   * @private
   */
  _recordSecurityCheckpoint(checkpointNumber, label, input, output, latency, agentName = null) {
    const checkpoint = {
      number: checkpointNumber,
      label,
      timestamp: new Date().toISOString(),
      latency_ms: latency,
      input: {
        type: 'string',
        content: input
      },
      output: output || {},
      agent: agentName || null
    };
    this.securityCheckpoints.push(checkpoint);
  }

  /**
   * Helper method to send Prisma AIRS checkpoint thinking message with latency
   * @private
   */
  _sendSecurityCheckpointMessage(checkpointNumber, result, startTime, context = {}, checkpointData = null) {
    const latency = Date.now() - startTime;
    const detectionField = context.detectionField || 'promptDetected';
    const detections = result[detectionField] ? Object.keys(result[detectionField]).filter(k => result[detectionField][k]).join(', ') : 'policy violation';

    if (result.approved) {
      const contextStr = context.contextStr ? ` - ${context.contextStr}` : '';
      this.sendThinkingMessage(`🔓 UNLOCKED - Checkpoint ${checkpointNumber}: ${context.message || 'passed security checks'}${contextStr} (${latency}ms)`);
    } else {
      const contextStr = context.contextStr ? ` - ${context.contextStr}` : '';
      this.sendThinkingMessage(`LOCKED - Checkpoint ${checkpointNumber}: ${result.category || 'security'} detected (${detections})${contextStr} - ${latency}ms`);
      if (context.blockLogMessage) {
        getLogger().debug(context.blockLogMessage);
      }
    }

    // Send checkpoint data as a special thinking message with JSON payload
    if (checkpointData && this.streamThinkingCallback) {
      // Use a special marker format that can be parsed by frontend: [CHECKPOINT_DATA]<json>
      const checkpointMessage = {
        type: 'checkpoint',
        number: checkpointNumber,
        label: context.message || 'Security checkpoint',
        status: result.approved ? 'approved' : 'blocked',
        latency_ms: latency,
        input: checkpointData.input,
        output: checkpointData.output,
        tsg_id: process.env.PRISMA_AIRS_TSG_ID || null
      };
      this.streamThinkingCallback(`[CHECKPOINT_DATA]${JSON.stringify(checkpointMessage)}`);
    }
  }

  /**
   * Generic Prisma AIRS security checkpoint analyzer
   * @private
   */
  async _analyzeSecurityCheckpoint(config, llmProvider = null) {
    const {
      checkpointNumber,
      checkpointLabel,
      appName,
      appUser,
      userEmail,
      agentName,
      analyzeMethod,
      input,
      secondaryInput,
      detectionField,
      maskingField,
      trId,
      successMessage,
      blockMessage,
      originalKey,
      maskedKey
    } = config;

    if (!this.prismaAIRS || !this.prismaAIRS.isConfigured()) {
      const returnObj = { approved: true, message: 'Security not configured' };
      returnObj[originalKey] = input;
      return returnObj;
    }

    const agentInfo = agentName ? ` (${agentName})` : '';
    getLogger().debug(`Security Checkpoint ${checkpointNumber}: ${checkpointLabel}${agentInfo}`);

    const startTime = Date.now();
    const aiModel = llmProvider ? LLMProviderFactory.buildModelIdentifier(llmProvider) : null;

    // Call appropriate Prisma AIRS method
    let result;
    if (analyzeMethod === 'prompt') {
      result = await this.prismaAIRS.analyzePrompt(input, {
        language: config.language,
        appName,
        appUser: userEmail || appUser,
        aiModel: aiModel,
        trId
      });
    } else if (analyzeMethod === 'promptAndResponse') {
      result = await this.prismaAIRS.analyzePromptAndResponse(input, secondaryInput, {
        language: config.language,
        appName,
        appUser: userEmail || appUser,
        aiModel: aiModel,
        trId
      });
    }

    // Prepare checkpoint data to send with thinking message
    // Keep raw Prisma AIRS JSON request and response untouched with clear input/output separation
    const checkpointData = {
      input: result.__raw_request_payload || {
        tr_id: 'unknown',
        contents: analyzeMethod === 'promptAndResponse'
          ? [{ prompt: input, response: secondaryInput }]
          : [{ prompt: input }]
      },
      output: result.__raw_response_payload || result
    };

    // Send thinking messages for visibility (now includes checkpoint data)
    this._sendSecurityCheckpointMessage(checkpointNumber, result, startTime, {
      message: successMessage,
      detectionField,
      blockLogMessage: blockMessage
    }, checkpointData);

    // Record checkpoint data for frontend display
    const latency = Date.now() - startTime;
    this._recordSecurityCheckpoint(
      checkpointNumber,
      checkpointLabel,
      input,
      checkpointData.output,
      latency,
      agentName
    );

    // Extract masked data if sensitive data was detected
    let maskedInput = input;
    let maskedSecondaryInput = secondaryInput;

    if (maskingField === 'prompt' && result.maskedData?.prompt?.data) {
      maskedInput = result.maskedData.prompt.data;
      getLogger().debug(`Sensitive data detected - using masked prompt${agentInfo}`);
      getLogger().debug(`Detections:`, result.maskedData.prompt.pattern_detections || []);
    } else if (maskingField === 'response' && result.maskedData?.response?.data) {
      maskedSecondaryInput = result.maskedData.response.data;
      getLogger().debug(`Sensitive data detected - using masked response${agentInfo}`);
      getLogger().debug(`Detections:`, result.maskedData.response.pattern_detections || []);
    }

    // Return appropriate structure based on checkpoint type
    const returnObj = {
      ...result,
      [originalKey]: input
    };

    if (analyzeMethod === 'prompt') {
      returnObj[maskedKey] = maskedInput;
      returnObj.hasMasking = maskedInput !== input;
    } else {
      returnObj[maskedKey] = maskedSecondaryInput;
      returnObj.hasMasking = maskedSecondaryInput !== secondaryInput;
    }

    return returnObj;
  }

  /**
   * Unified Prisma AIRS Security Analysis
   */
  async analyzeSecurityCheckpoint(checkpointType, ...args) {
    const configs = {
      userInput: (query, language = 'en', userEmail = null, agentName = null, sessionId = null) => ({
        checkpointNumber: 1,
        checkpointLabel: 'Analyzing user input',
        appName: 'theotter-coordinator',
        appUser: 'user',
        userEmail,
        agentName,
        language,
        analyzeMethod: 'prompt',
        input: query,
        detectionField: 'promptDetected',
        maskingField: 'prompt',
        trId: sessionId ? `${sessionId}` : `user-input-${Date.now()}`,
        successMessage: 'User input passed security checks',
        blockMessage: '🚫 User input BLOCKED by security',
        originalKey: 'originalQuery',
        maskedKey: 'maskedQuery'
      }),
      outboundRequest: (subQuery, serverName, language = 'en', userEmail = null, agentName = null, sessionId = null) => ({
        checkpointNumber: 2,
        checkpointLabel: `Analyzing outbound request to ${serverName}`,
        appName: 'theotter-coordinator',
        appUser: 'user',
        userEmail,
        agentName,
        language,
        analyzeMethod: 'prompt',
        input: subQuery,
        detectionField: 'promptDetected',
        maskingField: 'prompt',
        trId: sessionId ? `${sessionId}` : `outbound-${serverName}-${Date.now()}`,
        successMessage: `Request to ${serverName} passed security checks`,
        blockMessage: `🚫 Outbound request to ${serverName} BLOCKED by security`,
        originalKey: 'originalQuery',
        maskedKey: 'maskedQuery'
      }),
      inboundResponse: (prompt, response, serverName, language = 'en', userEmail = null, agentName = null, sessionId = null) => ({
        checkpointNumber: 3,
        checkpointLabel: `Analyzing inbound response from ${serverName}`,
        appName: `theotter-mcp-agent-${agentName}`,
        appUser: 'agent',
        userEmail,
        agentName,
        language,
        analyzeMethod: 'promptAndResponse',
        input: prompt,
        secondaryInput: response,
        detectionField: 'responseDetected',
        maskingField: 'response',
        trId: sessionId ? `${sessionId}` : `inbound-${serverName}-${Date.now()}`,
        successMessage: `Response from ${serverName} passed security checks`,
        blockMessage: `🚫 Inbound response from ${serverName} BLOCKED by security`,
        originalKey: 'originalResponse',
        maskedKey: 'maskedResponse'
      }),
      finalResponse: (prompt, response, language = 'en', userEmail = null, agentName = null, sessionId = null) => ({
        checkpointNumber: 4,
        checkpointLabel: 'Analyzing final coordinated response',
        appName: `theotter-mcp-agent-${agentName}`,
        appUser: 'agent',
        userEmail,
        agentName,
        language,
        analyzeMethod: 'promptAndResponse',
        input: prompt,
        secondaryInput: response,
        detectionField: 'responseDetected',
        maskingField: 'response',
        trId: sessionId ? `${sessionId}` : `final-output-${Date.now()}`,
        successMessage: 'Final response passed security checks',
        blockMessage: '🚫 Final response BLOCKED by security',
        originalKey: 'originalResponse',
        maskedKey: 'maskedResponse'
      })
    };

    const llmProvider = args[args.length - 1]; // Last argument is always llmProvider
    const config = configs[checkpointType](...args.slice(0, -1));
    return this._analyzeSecurityCheckpoint(config, llmProvider);
  }

  // Legacy methods for backward compatibility
  async analyzeUserInput(query, language = 'en', userEmail = null, agentName = null, sessionId = null, llmProvider = null) {
    return this.analyzeSecurityCheckpoint('userInput', query, language, userEmail, agentName, sessionId, llmProvider);
  }

  async analyzeOutboundRequest(subQuery, serverName, language = 'en', userEmail = null, agentName = null, sessionId = null, llmProvider = null) {
    return this.analyzeSecurityCheckpoint('outboundRequest', subQuery, serverName, language, userEmail, agentName, sessionId, llmProvider);
  }

  async analyzeInboundResponse(prompt, response, serverName, language = 'en', userEmail = null, agentName = null, sessionId = null, llmProvider = null) {
    return this.analyzeSecurityCheckpoint('inboundResponse', prompt, response, serverName, language, userEmail, agentName, sessionId, llmProvider);
  }

  async analyzeFinalResponse(prompt, response, language = 'en', userEmail = null, agentName = null, sessionId = null, llmProvider = null) {
    return this.analyzeSecurityCheckpoint('finalResponse', prompt, response, language, userEmail, agentName, sessionId, llmProvider);
  }

  /**
   * Process user query through the MCP system with full security integration
   */
  async processQuery(query, language = 'en', phase = 'phase2', userContext = null, llmProvider = 'aws') {
    if (!this.initialized) {
      throw new Error('IntelligentCoordinator not initialized');
    }

    // Reset token usage and security checkpoints for this query
    this.tokenUsage = {
      coordinator_tokens: 0,
      agent_tokens: 0,
      total_tokens: 0
    };
    this.clearSecurityCheckpoints();

    getLogger().info(`Processing query: "${query}" (${language}, Phase: ${phase}, Cloud: ${llmProvider})`);
    this.sendThinkingMessage(`Analyzing your question...`);

    let queryToProcess = query;

    try {
      // Validate user context for personal queries
      const personalKeywords = /\bmy\b|\bi\b|\bme\b|\bours\b|\bwe\b/i;
      if (personalKeywords.test(query) && !userContext?.email) {
        getLogger().debug(`Personal query detected but no user context provided`);
        this.sendThinkingMessage(`User identification required for personal queries`);

        const resp = this.buildErrorResponse('I need to know who you are to answer personal questions like that. Please provide your email or user identity in the request.');
        return {
          ...resp,
          requiresUserContext: true,
          originalQuery: query
        };
      }

      // CHECKPOINT 1: Analyze user input security (use passed phase, not instance variable)
      if (shouldUsePrismaAIRS(phase)) {
        getLogger().debug(`Phase 3 active - Running Security Checkpoint 1: User Input Analysis`);
        const inputSecurity = await this.analyzeUserInput(query, language, userContext?.email, null, userContext?.sessionId, llmProvider);
        if (!inputSecurity.approved) {
          getLogger().warn(`Security Checkpoint 1 BLOCKED: ${inputSecurity.category}`);
          // Return security block message
          return {
            response: inputSecurity.message,
            securityBlock: true,
            category: inputSecurity.category,
            reportId: inputSecurity.reportId
          };
        }
        getLogger().debug(`Security Checkpoint 1 PASSED`);

        // If sensitive data was detected and masked, use the masked query for all downstream processing
        if (inputSecurity.hasMasking) {
          queryToProcess = inputSecurity.maskedQuery;
          getLogger().debug(`Using masked query for all downstream processing`);
          getLogger().debug(`   Original: "${query}"`);
          getLogger().debug(`   Masked:   "${queryToProcess}"`);
        }
      }

      // Step 1: Translate if needed
      this.sendThinkingMessage(`Checking language requirements...`);
      const translatedQuery = await this.translateQuery(queryToProcess, language, llmProvider);
      if (translatedQuery !== queryToProcess) {
        this.sendThinkingMessage(`Translated to English: "${translatedQuery}"`);
        // Track translation work as coordinator tokens
        this.trackCoordinatorTokens(queryToProcess + translatedQuery);
      } else {
        this.sendThinkingMessage(`No translation needed`);
      }

      // Step 2: Route to appropriate agent(s) using registry
      this.sendThinkingMessage(`Determining the best routing strategy for your query...`);
      // Track routing analysis as coordinator work
      this.trackCoordinatorTokens("Analyzing query semantics and determining best routing strategy");

      let routingResult;
      try {
        routingResult = await this.routeQuery(translatedQuery, language, phase, userContext, llmProvider);
      } catch (routingError) {
        getLogger().debug(`Routing failed: ${routingError.message}`);

        // Determine if this is a model/configuration error vs a processing error
        let userMessage = routingError.message;
        if (routingError.message && routingError.message.includes('Unsupported Bedrock model')) {
          userMessage = `I encountered a configuration issue: ${routingError.message}. Please contact your administrator to configure a supported model.`;
        }

        this.sendThinkingMessage(`Error: ${userMessage}`);

        // Return error response instead of throwing
        const errResp = this.buildErrorResponse(userMessage);
        errResp.errorType = routingError.message;
        return errResp;
      }

      // routingResult is now always an object with type field
      if (routingResult.type === 'agent-id') {
        // Single agent routing
        const selectedAgent = this.agentRegistry.getAgent(routingResult.agentId);
        this.sendThinkingMessage(`Connecting to ${selectedAgent.name} specialist...`);

        // Step 3: Query the selected agent
        this.sendThinkingMessage(`${selectedAgent.name} specialist is processing your request...`);
        const agentResponse = await this.queryAgent(routingResult.agentId, translatedQuery, userContext, language, phase, llmProvider);

        // Check if security blocked the response at Checkpoint 3
        if (agentResponse && agentResponse._securityBlock) {
          getLogger().warn(`🚫 Checkpoint 3 blocked response, returning security message`);

          return {
            response: agentResponse.message,
            securityBlock: true,
            category: agentResponse.category,
            reportId: agentResponse.reportId,
            metadata: this.buildResultMetadata(phase)
          };
        }

        this.sendThinkingMessage(`Response received from ${selectedAgent.name} specialist`);
        getLogger().debug(`Response from ${selectedAgent.name} agent received`);

        // Step 4: Process and validate the agent response
        this.sendThinkingMessage(`Processing and validating response...`);
        const processedResponse = await this.processAgentResponse(
          agentResponse,
          query,
          translatedQuery,
          language,
          selectedAgent.name,
          llmProvider
        );

        // CHECKPOINT 4: Analyze final response security (use passed phase)
        let finalResponseToReturn = processedResponse;
        if (shouldUsePrismaAIRS(phase)) {
          const finalSecurity = await this.analyzeFinalResponse(queryToProcess, processedResponse, language, userContext?.email, selectedAgent.name, userContext?.sessionId, llmProvider);
          if (!finalSecurity.approved) {
            return {
              response: finalSecurity.message,
              securityBlock: true,
              category: finalSecurity.category,
              reportId: finalSecurity.reportId,
              metadata: this.buildResultMetadata(phase)
            };
          }

          // If sensitive data was detected and masked in the response, use the masked response
          if (finalSecurity.hasMasking) {
            finalResponseToReturn = finalSecurity.maskedResponse;
            getLogger().debug(`Using masked response in final output (sensitive data detected)`);
          }
        }

        // NOTE: Don't re-track agent response here - it was already tracked in queryAgent()
        // The coordinator's work here (validation, masking) is part of operational overhead        
        return {
          response: finalResponseToReturn,
          agentUsed: selectedAgent.name,
          translatedQuery: translatedQuery !== query ? translatedQuery : null,
          metadata: this.buildResultMetadata(phase)
        };
      } else if (routingResult.type === 'declined') {
        // Query was declined by LLM for security/policy reasons
        getLogger().warn(`🚫 Query declined - Reasoning: ${routingResult.reasoning}`);
        this.sendThinkingMessage(`🚫 Request cannot be processed: ${routingResult.reasoning}`);

        return {
          response: routingResult.response,
          declined: true,
          reason: routingResult.reasoning,
          translatedQuery: translatedQuery !== query ? translatedQuery : null,
          metadata: this.buildResultMetadata(phase)
        };
      } else {
        // Multi-agent response - routingResult contains the final synthesized response
        this.sendThinkingMessage(`Multi-agent coordination completed`);
        getLogger().debug(`Multi-agent response completed`);

        // Process multi-agent response
        this.sendThinkingMessage(`Processing and validating multi-agent response...`);
        const processedResponse = await this.processAgentResponse(
          routingResult.response,
          query,
          translatedQuery,
          language,
          'multi-agent-coordinator',
          llmProvider
        );

        // CHECKPOINT 4: Analyze final response security (use passed phase)
        let finalResponseToReturn = processedResponse;
        if (shouldUsePrismaAIRS(phase)) {
          const finalSecurity = await this.analyzeFinalResponse(queryToProcess, processedResponse, language, userContext?.email, 'multi-agent-coordinator', userContext?.sessionId, llmProvider);
          if (!finalSecurity.approved) {

            return {
              response: finalSecurity.message,
              securityBlock: true,
              category: finalSecurity.category,
              reportId: finalSecurity.reportId,
              metadata: this.buildResultMetadata(phase)
            };
          }

          // If sensitive data was detected and masked in the response, use the masked response
          if (finalSecurity.hasMasking) {
            finalResponseToReturn = finalSecurity.maskedResponse;
            getLogger().debug(`Using masked response in final output (sensitive data detected)`);
          }
        }

        // Track multi-agent synthesis work as coordinator tokens
        this.trackCoordinatorTokens(finalResponseToReturn);

        return {
          response: finalResponseToReturn,
          agentUsed: 'multi-agent-coordinator',
          translatedQuery: translatedQuery !== query ? translatedQuery : null,
          metadata: this.buildResultMetadata(phase)
        };
      }
    } catch (error) {
      getLogger().error('Query processing failed:', error);

      // Determine if this is a model/configuration error vs a processing error
      let userMessage = error.message;
      if (error.message && error.message.includes('Unsupported Bedrock model')) {
        userMessage = `I encountered a configuration issue: ${error.message}. Please contact your administrator to configure a supported model.`;
      } else if (error.message && error.message.includes('No registered agents')) {
        userMessage = 'No AI agents are currently available. Please contact your administrator.';
      }

      this.sendThinkingMessage(`Error: ${userMessage}`);

      const errResp = this.buildErrorResponse(userMessage, phase);
      errResp.errorType = error.message;
      return errResp;
    }
  }

  /**
   * Helper to build successful response with metadata
   */
  buildSuccessResponse(response, phase = 'phase2') {
    return {
      success: true,
      response,
      metadata: this.buildResultMetadata(phase)
    };
  }

  /**
   * Helper to build error response with metadata
   */
  buildErrorResponse(message, phase = 'phase2') {
    return {
      success: false,
      response: message,
      error: true,
      metadata: this.buildResultMetadata(phase)
    };
  }
  buildResultMetadata(phase) {
    return {
      total_tokens: this.tokenUsage.total_tokens,
      coordinator_tokens: this.tokenUsage.coordinator_tokens,
      agent_tokens: this.tokenUsage.agent_tokens,
      timestamp: new Date().toISOString(),
      securityCheckpoints: phase === 'phase3' ? this.getSecurityCheckpoints() : []
    };
  }

  /**
   * Get information about all registered agents
   */
  getAgentsInfo() {
    return this.agentRegistry.getAllAgents().map(agent => ({
      agentId: agent.agentId,
      name: agent.name,
      description: agent.description,
      url: agent.url,
      capabilities: agent.capabilities,
      connected: agent.healthy || false,
      sessionId: agent.sessionId,
      lastSeen: new Date(agent.lastSeen).toISOString()
    }));
  }

  /**
   * Get available llm providers from all registered agents
   */
  getAvailableLLMProviders() {
    return this.agentRegistry.getAvailableLLMProviders();
  }

  /**
   * Health check for all registered agents
   */
  async healthCheck() {
    const allAgents = this.agentRegistry.getAllAgents();
    const results = {
      coordinator: {
        status: this.initialized ? 'healthy' : 'not_initialized',
        agentCount: allAgents.length,
        registeredAgents: allAgents.map(a => ({ id: a.agentId, name: a.name }))
      },
      agents: {}
    };

    // Check each registered agent
    for (const agent of allAgents) {
      try {
        const response = await axios.get(`${agent.url}/health`, { timeout: 3000 });
        results.agents[agent.agentId] = {
          name: agent.name,
          status: 'healthy',
          url: agent.url,
          sessionId: agent.sessionId,
          capabilities: agent.capabilities
        };
        this.agentRegistry.updateAgentHealth(agent.agentId, true);
      } catch (error) {
        results.agents[agent.agentId] = {
          name: agent.name,
          status: 'unhealthy',
          url: agent.url,
          error: error.message
        };
        this.agentRegistry.updateAgentHealth(agent.agentId, false);
      }
    }

    return results;
  }

  /**
   * Cleanup - close connections and sessions
   */
  async cleanup() {
    getLogger().debug('🧹 Cleaning up...');

    // Clear registry
    if (this.agentRegistry) {
      const allAgents = this.agentRegistry.getAllAgents();
      for (const agent of allAgents) {
        this.agentRegistry.unregisterAgent(agent.agentId);
      }
    }

    this.initialized = false;
    getLogger().debug('Cleanup completed');
  }
}

export { IntelligentCoordinator };