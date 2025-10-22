const { Ollama } = require('ollama');
const axios = require('axios');
const { randomUUID } = require('crypto');
const { PrismaAIRSIntercept, shouldUsePrismaAIRS } = require('./prisma-airs');

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
    this.capabilities = new Map(); // capability -> Set of agentIds
  }

  registerAgent(agentData) {
    const { agentId, name, description, url, capabilities = [] } = agentData;
    
    // Store agent metadata
    this.agents.set(agentId, { 
      agentId,
      name, 
      description,
      url,
      capabilities, 
      lastSeen: Date.now(),
      healthy: true,
      sessionId: null
    });
    
    // Index capabilities for routing (using agent specialties)
    const agentCapabilities = capabilities.length > 0 ? capabilities : [name]; // fallback to agent name
    agentCapabilities.forEach(capability => {
      if (!this.capabilities.has(capability)) {
        this.capabilities.set(capability, new Set());
      }
      this.capabilities.get(capability).add(agentId);
    });
    
    console.log(`✅ [AgentRegistry] Agent ${name} (${agentId}) registered with capabilities:`, agentCapabilities);
  }

  unregisterAgent(agentId) {
    const agent = this.agents.get(agentId);
    if (agent) {
      // Remove from capability index
      const agentCapabilities = agent.capabilities.length > 0 ? agent.capabilities : [agent.name];
      agentCapabilities.forEach(capability => {
        const capabilitySet = this.capabilities.get(capability);
        if (capabilitySet) {
          capabilitySet.delete(agentId);
          if (capabilitySet.size === 0) {
            this.capabilities.delete(capability);
          }
        }
      });
      
      this.agents.delete(agentId);
      console.log(`🗑️ [AgentRegistry] Agent ${agent.name} (${agentId}) unregistered`);
    }
  }

  findAgentsForQuery(query) {
    // Return all healthy agents - delegate routing decision entirely to LLM
    // This removes hardcoded keyword matching and relies on agent-announced capabilities
    const availableAgents = [];
    
    for (const [agentId, agent] of this.agents) {
      if (agent.healthy) {
        availableAgents.push(agentId);
      }
    }
    
    // Return all available agents if we have them, otherwise fallback to default
    return availableAgents.length > 0 ? availableAgents : this.getDefaultAgent();
  }

  isSemanticMatch(query, agentId) {
    // Use agent-provided capabilities for semantic matching
    const agent = this.agents.get(agentId);
    if (!agent || !agent.healthy) return false;
    
    const queryLower = query.toLowerCase();
    
    // Check if query matches any of the agent's registered capabilities
    if (agent.capabilities && agent.capabilities.length > 0) {
      return agent.capabilities.some(capability => 
        queryLower.includes(capability.toLowerCase()) ||
        capability.toLowerCase().includes(queryLower.split(' ')[0]) // Check first word
      );
    }
    
    // Fallback to agent name matching
    return queryLower.includes(agent.name.toLowerCase());
  }

  getDefaultAgent() {
    // Return first available agent as default, prefer 'general' if available
    for (const [agentId, agent] of this.agents) {
      if (agent.name === 'general') {
        return [agentId];
      }
    }
    
    // Return first available agent
    const firstAgent = this.agents.values().next().value;
    return firstAgent ? [firstAgent.agentId] : [];
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
}

/**
 * Intelligent Coordinator
 * Handles ALL routing, intelligence, and security decisions for the MCP Gateway
 */
class IntelligentCoordinator {
  constructor(ollamaUrl, mcpServerRegistry) {
    this.ollama = new Ollama({ host: ollamaUrl });
    this.mcpServerRegistry = mcpServerRegistry; // Reference to MCPServerRegistry for forwarding
    this.registry = new AgentRegistry();
    this.requestCounter = 0;
    this.streamThinkingCallback = null;
    this.initialized = false;
    
    // LLM Models
    this.coordinatorModel = process.env.COORDINATOR_MODEL || 'qwen2.5:1.5b';
    this.translationModel = process.env.TRANSLATION_MODEL || 'qwen2.5-translator';
    
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
      console.log('🔒 [Coordinator] Prisma AIRS security module loaded (available for phase3 requests)');
    } else {
      console.log('⚠️ [Coordinator] Prisma AIRS not configured - phase3 security unavailable');
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
      this.streamThinkingCallback(`[COORDINATOR] ${message}`);
    }
  }

  /**
   * Agent registration endpoint
   */
  registerAgent(agentData) {
    this.registry.registerAgent(agentData);
    return { status: "registered", agentId: agentData.agentId };
  }

  /**
   * Agent unregistration endpoint
   */
  unregisterAgent(agentId) {
    this.registry.unregisterAgent(agentId);
    return { status: "unregistered", agentId };
  }

  /**
   * Initialize the coordinator
   */
  async initialize() {
    console.log('🔧 [Coordinator] Initializing Intelligent Coordinator...');
    
    try {
      this.initialized = true;
      console.log(`✅ [Coordinator] Initialized - waiting for agent registrations...`);
      console.log(`🤖 [Coordinator] Using coordinator model: ${this.coordinatorModel}`);
      console.log(`🌍 [Coordinator] Using translation model: ${this.translationModel}`);
      
      // Warn if using extended thinking model
      if (this.coordinatorModel.includes('qwen3') || this.coordinatorModel.includes('deepseek')) {
        console.log(`⚠️  [Coordinator] WARNING: Using extended thinking model (${this.coordinatorModel})`);
        console.log(`    Extended thinking may cause routing JSON to appear in the 'thinking' field`);
        console.log(`    This is handled by the coordinator but may use more tokens`);
      }
      
      if (this.prismaAIRS && this.prismaAIRS.isConfigured()) {
        console.log(`🔒 [Coordinator] Prisma AIRS security active`);
      }
      
      // Start periodic health checks for registered agents
      this.startHealthChecks();
      
    } catch (error) {
      console.error('❌ [Coordinator] Failed to initialize:', error);
      throw error;
    }
  }

  /**
   * Start periodic health checks for registered agents
   */
  startHealthChecks() {
    setInterval(async () => {
      const agents = this.registry.getAllAgents();
      for (const agent of agents) {
        try {
          const response = await axios.get(`${agent.url}/health`, { timeout: 3000 });
          if (response.status === 200) {
            this.registry.updateAgentHealth(agent.agentId, true);
          } else {
            this.registry.updateAgentHealth(agent.agentId, false);
          }
        } catch (error) {
          this.registry.updateAgentHealth(agent.agentId, false);
          console.warn(`⚠️ [Coordinator] Agent ${agent.name} health check failed: ${error.message}`);
        }
      }
    }, 30000); // Check every 30 seconds
  }

  /**
   * Translate query from foreign language to English
   */
  async translateQuery(query, language = 'en') {
    if (language === 'en') {
      return query; // No translation needed
    }

    console.log(`🌍 [Coordinator] Translating "${query}" from ${language} to English`);
    
    try {
      const translationPrompt = `Translate this query from ${language} to English. Only return the English translation, nothing else.

Query: "${query}"`;

      const response = await this.ollama.generate({
        model: this.coordinatorModel,
        prompt: translationPrompt,
        system: 'You are a precise translation assistant. Only return the English translation with no additional text or explanation.',
        options: { temperature: 0.1 }
      });

      let translatedQuery = response.response?.trim() || query;
      
      // Remove surrounding quotes if present (LLM sometimes adds them)
      if (translatedQuery.startsWith('"') && translatedQuery.endsWith('"')) {
        translatedQuery = translatedQuery.slice(1, -1);
      }
      if (translatedQuery.startsWith("'") && translatedQuery.endsWith("'")) {
        translatedQuery = translatedQuery.slice(1, -1);
      }
      
      console.log(`🌍 [Coordinator] Translated: "${translatedQuery}"`);
      return translatedQuery;
    } catch (error) {
      console.error('❌ [Coordinator] Translation failed:', error.message);
      return query; // Return original query if translation fails
    }
  }

  /**
   * Route query to appropriate agent based on registered capabilities
   */
  async routeQuery(query, language = 'en', phase = 'phase2', userContext = null) {
    console.log(`🧭 [Coordinator] Routing query: "${query}"`);
    
    try {
      // Log all registered agents
      const allAgents = this.registry.getAllAgents();
      console.log(`📋 [Coordinator] Total registered agents: ${allAgents.length}`);
      allAgents.forEach(agent => {
        console.log(`   - ${agent.name} (${agent.agentId}) - ${agent.description.substring(0, 60)}...`);
      });
      
      // Use registry to find matching agents
      const candidateAgentIds = this.registry.findAgentsForQuery(query);
      
      if (candidateAgentIds.length === 0) {
        throw new Error('No registered agents available');
      }
      
      console.log(`✅ [Coordinator] Candidate agents for this query: ${candidateAgentIds.map(id => {
        const agent = this.registry.getAgent(id);
        return `${agent.name}`;
      }).join(', ')}`);

      // Let LLM coordinator decide routing strategy and potential query splitting
      const routingStrategy = await this.analyzeRoutingStrategy(query, candidateAgentIds);
      
      if (routingStrategy.requiresMultiple) {
        console.log(`🔀 [Coordinator] Multi-agent query detected, splitting across: ${routingStrategy.agents.map(a => a.agent).join(', ')}`);
        const multiAgentResponse = await this.handleMultiAgentQuery(query, routingStrategy, phase, userContext);
        // Return a special object to indicate this is a multi-agent final response
        return { type: 'multi-agent-response', response: multiAgentResponse };
      } else {
        // Single agent routing - use the agent specified in the JSON response
        const selectedAgentName = routingStrategy.agents[0].agent;
        const selectedAgentId = this.findAgentIdByName(selectedAgentName);
        
        if (!selectedAgentId) {
          throw new Error(`LLM selected unknown agent: "${selectedAgentName}". LLM must select from registered agents: ${this.registry.getAllAgents().map(a => a.name).join(', ')}`);
        }
        
        const selectedAgent = this.registry.getAgent(selectedAgentId);
        console.log(`🎯 [Coordinator] Routed to: ${selectedAgent.name} agent (${selectedAgentId})`);
        return { type: 'agent-id', agentId: selectedAgentId };
      }
    } catch (error) {
      console.error('❌ [Coordinator] Routing failed:', error.message);
      // Propagate error up - don't silently fall back
      throw error;
    }
  }

  /**
   * Analyze if a query might require multiple agents (future enhancement)
   */
  async analyzeQueryComplexity(query, candidateAgentIds) {
    try {
      const agentList = candidateAgentIds.map(id => {
        const agent = this.registry.getAgent(id);
        return agent.name;
      }).join(', ');

      const complexityPrompt = `Analyze this user query to determine if it requires information from multiple specialist agents.

Available agents: ${agentList}

Query: "${query}"

Does this query require information from multiple agents? Examples:
- "Show me my manager and my IT tickets" (needs HR + IT)
- "Who handles both payroll and network issues?" (needs HR + IT)
- "What's my salary and computer status?" (needs HR + IT)

CRITICAL: Respond ONLY with valid JSON. No thinking, no explanations outside JSON.

Required format:
{
  "requiresMultiple": boolean,
  "primaryAgent": "agent_name",
  "secondaryAgents": ["agent_name"],
  "reasoning": "brief explanation"
}`;

      const response = await this.ollama.generate({
        model: this.coordinatorModel,
        prompt: complexityPrompt,
        system: 'You are a JSON-only query analyzer. NEVER include <think> tags or explanations. Respond with raw JSON only.',
        options: { 
          temperature: 0.0,
          format: 'json',
          stop: ['\n\n', '<think>', '<thinking>']
        }
      });

      try {
        // Clean the response - remove thinking tags and extract JSON
        let jsonText = response.response.trim();
        jsonText = jsonText.replace(/<think>[\s\S]*?<\/think>/g, '');
        jsonText = jsonText.replace(/<thinking>[\s\S]*?<\/thinking>/g, '');
        jsonText = jsonText.trim();
        
        // Extract JSON if it's wrapped in other text
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
        
        const analysis = JSON.parse(jsonText);
        return analysis;
      } catch (parseError) {
        // Fallback if JSON parsing fails
        return {
          requiresMultiple: false,
          primaryAgent: candidateAgentIds[0] ? this.registry.getAgent(candidateAgentIds[0]).name : 'general',
          secondaryAgents: [],
          reasoning: 'JSON parsing failed, defaulting to single agent'
        };
      }
    } catch (error) {
      console.warn(`⚠️ [Coordinator] Query complexity analysis failed:`, error.message);
      // Safe fallback
      return {
        requiresMultiple: false,
        primaryAgent: candidateAgentIds[0] ? this.registry.getAgent(candidateAgentIds[0]).name : 'general',
        secondaryAgents: [],
        reasoning: 'Analysis failed, defaulting to single agent'
      };
    }
  }

  /**
   * Analyze routing strategy and determine if query splitting is needed
   */
  async analyzeRoutingStrategy(query, candidateAgentIds) {
    try {
      // Build detailed agent profiles for LLM analysis
      const agentProfiles = candidateAgentIds.map(id => {
        const agent = this.registry.getAgent(id);
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
      console.log(`📊 [Coordinator] Available agents for routing:`, candidateAgentIds.map(id => {
        const agent = this.registry.getAgent(id);
        return `${agent.name} (${id})`;
      }).join(', '));

      const strategyPrompt = `You are a JSON-only router. Output ONLY the JSON object below. No thinking, no explanation.

AVAILABLE AGENTS:
${agentProfiles}

USER QUERY: "${query}"

CRITICAL INSTRUCTIONS:
1. Review each agent's description and specialties carefully
2. Determine if the query requires information from MULTIPLE agents
3. If the query has distinct parts that belong to different specialties, route to MULTIPLE agents
4. For example:
   - "Who is my manager and which tickets require his approval?" → ["hr", "it"] (manager info from HR, tickets from IT)
   - "What's my salary and computer status?" → ["hr", "it"] (salary from HR, computer from IT)
   - "Show me my projects" → ["general"] (single agent)
5. If routing to multiple agents, split the query into appropriate sub-queries for each

Output this JSON format exactly (replace values in quotes):
{"agents": [{"agent": "agent_name", "subQuery": "specific query for this agent"}], "reasoning": "brief"}

For multiple agents:
{"agents": [{"agent": "agent1", "subQuery": "query part 1"}, {"agent": "agent2", "subQuery": "query part 2"}], "reasoning": "brief"}

Now output the JSON:
{`;

      this.sendThinkingMessage(`🤖 Analyzing query routing strategy...`);

      const response = await this.ollama.generate({
        model: this.coordinatorModel,
        prompt: strategyPrompt,
        system: `You are a JSON output formatter. You output ONLY valid JSON.
Start with { and end with }
Do not include any text before { or after }
Do not think or reason
Output JSON immediately`,
        options: { 
          temperature: 0.0,
          num_predict: 200,
          stop: [],
        }
      });

      try {
        // Validate response structure
        if (!response) {
          console.error(`❌ [Coordinator] LLM returned null/undefined response`, response);
          throw new Error('LLM returned null/undefined response');
        }

        // Handle extended thinking models (qwen3, etc.) where content is in 'thinking' field
        let responseContent = response.response;
        if (!responseContent && response.thinking) {
          console.log(`🧠 [Coordinator] Extended thinking detected, extracting from thinking field`);
          responseContent = response.thinking;
        }

        if (!responseContent || responseContent.trim().length === 0) {
          console.error(`❌ [Coordinator] LLM returned empty response`, {
            hasResponse: !!response.response,
            hasThinking: !!response.thinking,
            responseLength: response.response?.length || 0,
            thinkingLength: response.thinking?.length || 0
          });
          throw new Error('LLM returned empty response and thinking');
        }

        console.log(`🧠 [Coordinator] Extracted Raw:`, responseContent.substring(0, 500)); // Log first 500 chars

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
          console.error(`❌ [Coordinator] LLM response produced no valid JSON content`);
          throw new Error('LLM response produced no valid JSON content');
        }
        
        const strategy = JSON.parse(jsonText);
        
        // Validate the strategy structure
        if (!strategy.agents || !Array.isArray(strategy.agents) || strategy.agents.length === 0) {
          throw new Error('Invalid strategy structure: missing or empty agents array');
        }
        
        // Automatically determine if multiple agents are needed based on array length
        strategy.requiresMultiple = strategy.agents.length > 1;
        strategy.strategy = strategy.agents.length > 1 ? "parallel" : "single";
        
        console.log(`🧠 [Coordinator] Routing strategy:`, strategy);
        return strategy;
      } catch (parseError) {
        console.error(`❌ [Coordinator] Strategy JSON parsing failed:`, parseError.message);
        // Log both response and thinking fields if present
        const rawContent = response?.response || response?.thinking || 'N/A';
        console.error(`❌ [Coordinator] Raw response was:`, rawContent?.substring(0, 500));
        console.error(`❌ [Coordinator] Full error:`, parseError);
        throw new Error(`LLM routing failed - invalid JSON response. Please ensure LLM is returning valid JSON.`);
      }
    } catch (error) {
      console.error(`❌ [Coordinator] Strategy analysis failed:`, error.message);
      // Don't create a fallback strategy - let the error bubble up so we know LLM failed
      throw error;
    }
  }

  /**
   * Handle multi-agent queries by coordinating across multiple specialists
   */
  async handleMultiAgentQuery(originalQuery, routingStrategy, phase = 'phase2', userContext = null) {
    this.sendThinkingMessage(`🔀 Coordinating multi-agent response across ${routingStrategy.agents.length} specialists...`);
    
    try {
      const agentResponses = [];
      
      if (routingStrategy.strategy === "parallel") {
        // Execute queries in parallel
        const promises = routingStrategy.agents.map(async (agentTask) => {
          const agentId = this.findAgentIdByName(agentTask.agent);
          if (!agentId) {
            throw new Error(`Agent ${agentTask.agent} not found`);
          }
          
          this.sendThinkingMessage(`📤 Querying ${agentTask.agent} specialist: "${agentTask.subQuery}"`);
          const response = await this.queryAgent(agentId, agentTask.subQuery, userContext, 'en', phase);
          
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
          
          this.sendThinkingMessage(`📤 Querying ${agentTask.agent} specialist: "${agentTask.subQuery}"`);
          const response = await this.queryAgent(agentId, agentTask.subQuery, userContext, 'en', phase);
          
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
      this.sendThinkingMessage(`🔄 Synthesizing responses from all specialists...`);
      const combinedResponse = await this.synthesizeMultiAgentResponses(originalQuery, agentResponses);
      
      return combinedResponse;
      
    } catch (error) {
      console.error('❌ [Coordinator] Multi-agent query failed:', error);
      // Fallback to single agent
      const fallbackAgentId = this.findAgentIdByName(routingStrategy.agents[0].agent);
      if (fallbackAgentId) {
        this.sendThinkingMessage(`⚠️ Multi-agent coordination failed, falling back to ${routingStrategy.agents[0].agent} specialist...`);
        return await this.queryAgent(fallbackAgentId, originalQuery, userContext, 'en', phase);
      }
      throw error;
    }
  }

  /**
   * Find agent ID by name
   */
  findAgentIdByName(agentName) {
    for (const [agentId, agent] of this.registry.agents) {
      if (agent.name.toLowerCase() === agentName.toLowerCase()) {
        return agentId;
      }
    }
    return null;
  }

  /**
   * Synthesize multiple agent responses into a coherent answer
   */
  async synthesizeMultiAgentResponses(originalQuery, agentResponses) {
    const responseSummary = agentResponses.map(resp => 
      `${resp.agent.toUpperCase()} SPECIALIST: "${resp.query}"\nResponse: ${resp.response}`
    ).join('\n\n');

    const synthesisPrompt = `You are a response synthesizer. The user asked: "${originalQuery}"

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

SYNTHESIZED RESPONSE:`;

    try {
      const response = await this.ollama.generate({
        model: this.coordinatorModel,
        prompt: synthesisPrompt,
        system: 'You are an expert at synthesizing information from multiple sources into clear, comprehensive responses.',
        options: { 
          temperature: 0.3,
          top_p: 0.9
        }
      });

      return response.response;
    } catch (error) {
      console.error('❌ [Coordinator] Response synthesis failed:', error);
      // Fallback: concatenate responses
      return agentResponses.map(resp => 
        `**${resp.agent.toUpperCase()}**: ${resp.response}`
      ).join('\n\n');
    }
  }

  /**
   * Query an agent via MCP protocol (delegating to MCPServerRegistry)
   */
  async queryAgent(agentId, query, userContext = null, language = 'en', phase = 'phase2') {
    const agent = this.registry.getAgent(agentId);
    if (!agent) {
      throw new Error(`Agent ${agentId} not found in registry`);
    }

    try {
      let securityCheckResult = { maskedQuery: null, hasMasking: false };
      
      // CHECKPOINT 2: Analyze outbound request security (use passed phase)
      if (shouldUsePrismaAIRS(phase)) {
        console.log(`🔒 [Coordinator] Phase 3 active - Running Security Checkpoint 2: Outbound Request to ${agent.name}`);
        securityCheckResult = await this.analyzeOutboundRequest(query, agent.name, language);
        if (!securityCheckResult.approved) {
          console.log(`🚫 [Coordinator] Security Checkpoint 2 BLOCKED: ${securityCheckResult.category}`);
          throw new Error(`Security blocked outbound request to ${agent.name}: ${securityCheckResult.message}`);
        }
        console.log(`✅ [Coordinator] Security Checkpoint 2 PASSED`);
        
        // If sensitive data was detected and masked, use the masked query instead
        if (securityCheckResult.hasMasking) {
          console.log(`🔒 [Coordinator] Using masked query for agent (sensitive data detected)`);
        }
      }

      this.sendThinkingMessage(`🔗 Establishing connection with ${agent.name}...`);
      
      // Build enriched query with user context embedded naturally
      // Use masked query if sensitive data was detected, otherwise use original query
      const queryToSend = securityCheckResult.maskedQuery || query;
      let enrichedQuery = queryToSend;
      
      // Add user context to the query as natural language if provided
      if (userContext) {
        const contextInfo = [];
        if (userContext.name) contextInfo.push(`user: ${userContext.name}`);
        if (userContext.role) contextInfo.push(`role: ${userContext.role}`);
        if (userContext.department) contextInfo.push(`department: ${userContext.department}`);
        if (userContext.email) contextInfo.push(`email: ${userContext.email}`);
        if (userContext.employeeId) contextInfo.push(`employee ID: ${userContext.employeeId}`);
        
        if (contextInfo.length > 0) {
          enrichedQuery = `${query} [User context: ${contextInfo.join(', ')}]`;
        }
      }
      
      const queryUri = `${agent.name}://query?q=${encodeURIComponent(enrichedQuery)}`;
      
      // Make MCP resource request via MCPServerRegistry
      const resourceRequest = {
        jsonrpc: '2.0',
        method: 'resources/read',
        id: ++this.requestCounter,
        params: {
          uri: queryUri
        }
      };

      console.log(`🔍 [Coordinator] Sending resource request to ${agent.name}`);
      this.sendThinkingMessage(`📤 Sending request to ${agent.name} specialist...`);

      // Use MCPServerRegistry to forward the request
      const response = await this.mcpServerRegistry.forwardRequest(agentId, resourceRequest);

      console.log(`🔍 [Coordinator] Response from ${agent.name}:`, {
        hasResult: !!response.result,
        hasError: !!response.error
      });

      if (response.error) {
        throw new Error(`Agent ${agent.name} returned error: ${response.error.message}`);
      }

      if (response.result?.contents?.[0]?.text) {
        const responseText = response.result.contents[0].text;
        
        // CHECKPOINT 3: Analyze inbound response security (use passed phase)
        let responseToReturn = responseText;
        if (shouldUsePrismaAIRS(phase)) {
          console.log(`🔒 [Coordinator] Phase 3 active - Running Security Checkpoint 3: Inbound Response from ${agent.name}`);
          const inboundSecurity = await this.analyzeInboundResponse(query, responseText, agent.name, language);
          if (!inboundSecurity.approved) {
            console.log(`🚫 [Coordinator] Security Checkpoint 3 BLOCKED: ${inboundSecurity.category}`);
            // Return the security block info - don't throw, let processQuery handle it
            return {
              _securityBlock: true,
              message: inboundSecurity.message,
              category: inboundSecurity.category,
              reportId: inboundSecurity.reportId
            };
          }
          console.log(`✅ [Coordinator] Security Checkpoint 3 PASSED`);
          
          // If sensitive data was detected and masked in the response, use the masked response
          if (inboundSecurity.hasMasking) {
            responseToReturn = inboundSecurity.maskedResponse;
            console.log(`🔒 [Coordinator] Using masked response (sensitive data detected)`);
          }
        }
        
        return responseToReturn;
      } else {
        console.error(`❌ [Coordinator] Invalid response format from ${agent.name}:`, response);
        throw new Error('No valid response from agent');
      }
    } catch (error) {
      console.error(`❌ [Coordinator] Failed to query ${agent.name}:`, {
        message: error.message
      });
      throw error;
    }
  }

  /**
   * Process and validate agent response
   * Verifies if response matches user request, makes it concise, and translates if needed
   */
  async processAgentResponse(agentResponse, originalQuery, translatedQuery, targetLanguage = 'en', agentName) {
    try {
      console.log(`🔍 [Coordinator] Processing response from ${agentName}...`);
      
      // Step 1: Verify response relevance and extract key information
      const validationPrompt = `You are a response quality validator. Analyze if the agent response properly answers the user's question and extract the key information.

Original user question: "${originalQuery}"
${translatedQuery !== originalQuery ? `Translated question: "${translatedQuery}"` : ''}
Agent response: "${agentResponse}"

Your tasks:
1. Verify if the response answers the user's question
2. Extract the most relevant and concise information
3. Remove unnecessary explanations, thinking processes, or verbose details
4. Ignore any <think> tags or technical markup
5. Keep only the essential facts that directly answer the question

Respond with JSON only:
{
  "isRelevant": true/false,
  "keyInformation": "concise answer with only essential facts (no technical tags or markup)",
  "confidence": "high/medium/low",
  "reasoning": "brief explanation of relevance assessment"
}`;

      const validationResponse = await this.ollama.generate({
        model: this.coordinatorModel,
        prompt: validationPrompt,
        system: 'You are a response quality validator. You MUST respond with valid JSON only. Focus on extracting the most concise and relevant information.',
        options: { 
          temperature: 0.1,
          format: 'json',
          num_predict: 300
        }
      });

      let validation;
      try {
        // Clean and parse JSON response
        let jsonText = validationResponse.response.trim();
        
        // Extract JSON if it's wrapped in other text
        const jsonMatch = jsonText.match(/\{[\s\S]*\}/);
        if (jsonMatch) {
          jsonText = jsonMatch[0];
        }
        validation = JSON.parse(jsonText);
      } catch (parseError) {
        console.warn(`⚠️ [Coordinator] Validation parsing failed, using original response`);
        validation = {
          isRelevant: true,
          keyInformation: agentResponse,
          confidence: "medium",
          reasoning: "Validation parsing failed, assuming relevant"
        };
      }

      console.log(`🔍 [Coordinator] Response validation:`, {
        isRelevant: validation.isRelevant,
        confidence: validation.confidence,
        reasoning: validation.reasoning
      });

      // Step 2: Use processed response or fallback to original
      let processedResponse = validation.isRelevant ? validation.keyInformation : agentResponse;

      // Step 3: Translate back to target language if needed
      if (targetLanguage !== 'en') {
        console.log(`🌍 [Coordinator] Translating response to ${targetLanguage}`);
        processedResponse = await this.translateResponse(processedResponse, targetLanguage);
      }

      // // Step 4: Final quality check - ensure response is concise and clear
      // if (processedResponse.length > 500) {
      //   console.log(`📝 [Coordinator] Response is lengthy, making it more concise...`);
      //   processedResponse = await this.makeConcise(processedResponse, originalQuery);
      // }

      console.log(`✅ [Coordinator] Response processing completed`);
      return processedResponse;

    } catch (error) {
      console.error(`❌ [Coordinator] Response processing failed:`, error);
      // Fallback to original response if processing fails
      return targetLanguage !== 'en' ? await this.translateResponse(agentResponse, targetLanguage) : agentResponse;
    }
  }

  /**
   * Translate response to target language
   */
  async translateResponse(response, targetLanguage) {
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

      const translationResponse = await this.ollama.generate({
        model: this.coordinatorModel,
        prompt: translationPrompt,
        system: `You are a precise translation assistant. Translate only the meaningful content, ignore technical markup. Return ONLY the ${targetLanguage} translation with no additional text, tags, or explanation.`,
        options: { temperature: 0.1 }
      });

      let translatedResponse = translationResponse.response?.trim() || response;
      
      // Remove surrounding quotes if present
      if (translatedResponse.startsWith('"') && translatedResponse.endsWith('"')) {
        translatedResponse = translatedResponse.slice(1, -1);
      }
      if (translatedResponse.startsWith("'") && translatedResponse.endsWith("'")) {
        translatedResponse = translatedResponse.slice(1, -1);
      }
      
      console.log(`🌍 [Coordinator] Translated response to ${targetLanguage}`);
      return translatedResponse;
    } catch (error) {
      console.error(`❌ [Coordinator] Response translation failed:`, error);
      return response; // Return original if translation fails
    }
  }

  /**
   * Make response more concise while preserving key information
   */
  async makeConcise(response, originalQuery) {
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

      const conciseResponse = await this.ollama.generate({
        model: this.coordinatorModel,
        prompt: concisePrompt,
        system: 'You are a text optimization assistant. Make responses concise while preserving all essential information.',
        options: { temperature: 0.1 }
      });

      const conciseText = conciseResponse.response?.trim() || response;
      console.log(`📝 [Coordinator] Made response more concise`);
      return conciseText;
    } catch (error) {
      console.error(`❌ [Coordinator] Concise processing failed:`, error);
      return response;
    }
  }

  /**
   * Prisma AIRS Security Analysis - Checkpoint 1: Initial User Input
   */
  async analyzeUserInput(query, language = 'en') {
    if (!this.prismaAIRS || !this.prismaAIRS.isConfigured()) {
      return { approved: true, message: 'Security not configured', originalQuery: query };
    }

    console.log('🔒 [Coordinator] Security Checkpoint 1: Analyzing user input');
    
    const result = await this.prismaAIRS.analyzePrompt(query, {
      language,
      appName: 'mcp-gateway',
      appUser: 'user',
      aiModel: this.coordinatorModel,
      trId: `user-input-${Date.now()}`
    });

    if (!result.approved) {
      console.log('🚫 [Coordinator] User input BLOCKED by security');
    }

    // Extract masked prompt if sensitive data was detected
    let maskedQuery = query;
    if (result.maskedData?.prompt?.data) {
      maskedQuery = result.maskedData.prompt.data;
      console.log(`🔒 [Coordinator] Sensitive data detected in user input - using masked query`);
      console.log(`🔒 Detections:`, result.maskedData.prompt.pattern_detections || []);
    }

    return {
      ...result,
      originalQuery: query,
      maskedQuery: maskedQuery,
      hasMasking: maskedQuery !== query
    };
  }

  /**
   * Prisma AIRS Security Analysis - Checkpoint 2: Outbound Request to MCP Server
   */
  async analyzeOutboundRequest(subQuery, serverName, language = 'en') {
    if (!this.prismaAIRS || !this.prismaAIRS.isConfigured()) {
      return { approved: true, message: 'Security not configured', originalQuery: subQuery };
    }

    console.log(`🔒 [Coordinator] Security Checkpoint 2: Analyzing outbound request to ${serverName}`);
    
    const result = await this.prismaAIRS.analyzePrompt(subQuery, {
      language,
      appName: 'mcp-gateway',
      appUser: serverName,
      aiModel: this.coordinatorModel,
      trId: `outbound-${serverName}-${Date.now()}`
    });

    if (!result.approved) {
      console.log(`🚫 [Coordinator] Outbound request to ${serverName} BLOCKED by security`);
    }

    // Extract masked prompt if sensitive data was detected
    let maskedQuery = subQuery;
    if (result.maskedData?.prompt?.data) {
      maskedQuery = result.maskedData.prompt.data;
      console.log(`🔒 [Coordinator] Sensitive data detected - using masked prompt for outbound request`);
      console.log(`🔒 Detections:`, result.maskedData.prompt.pattern_detections || []);
    }

    return {
      ...result,
      originalQuery: subQuery,
      maskedQuery: maskedQuery,
      hasMasking: maskedQuery !== subQuery
    };
  }

  /**
   * Prisma AIRS Security Analysis - Checkpoint 3: Inbound Response from MCP Server
   */
  async analyzeInboundResponse(prompt, response, serverName, language = 'en') {
    if (!this.prismaAIRS || !this.prismaAIRS.isConfigured()) {
      return { approved: true, message: 'Security not configured', originalResponse: response };
    }

    console.log(`🔒 [Coordinator] Security Checkpoint 3: Analyzing inbound response from ${serverName}`);
    
    const result = await this.prismaAIRS.analyzePromptAndResponse(prompt, response, {
      language,
      appName: 'mcp-gateway',
      appUser: serverName,
      aiModel: this.coordinatorModel,
      trId: `inbound-${serverName}-${Date.now()}`
    });

    if (!result.approved) {
      console.log(`🚫 [Coordinator] Inbound response from ${serverName} BLOCKED by security`);
    }

    // Extract masked response if sensitive data was detected
    let maskedResponse = response;
    if (result.maskedData?.response?.data) {
      maskedResponse = result.maskedData.response.data;
      console.log(`🔒 [Coordinator] Sensitive data detected in response - using masked response`);
      console.log(`🔒 Detections:`, result.maskedData.response.pattern_detections || []);
    }

    return {
      ...result,
      originalResponse: response,
      maskedResponse: maskedResponse,
      hasMasking: maskedResponse !== response
    };
  }

  /**
   * Prisma AIRS Security Analysis - Checkpoint 4: Final Coordinated Response
   */
  async analyzeFinalResponse(prompt, response, language = 'en') {
    if (!this.prismaAIRS || !this.prismaAIRS.isConfigured()) {
      return { approved: true, message: 'Security not configured', originalResponse: response };
    }

    console.log('🔒 [Coordinator] Security Checkpoint 4: Analyzing final coordinated response');
    
    const result = await this.prismaAIRS.analyzePromptAndResponse(prompt, response, {
      language,
      appName: 'mcp-gateway',
      appUser: 'final-output',
      aiModel: this.coordinatorModel,
      trId: `final-output-${Date.now()}`
    });

    if (!result.approved) {
      console.log('🚫 [Coordinator] Final response BLOCKED by security');
    }

    // Extract masked response if sensitive data was detected
    let maskedResponse = response;
    if (result.maskedData?.response?.data) {
      maskedResponse = result.maskedData.response.data;
      console.log(`🔒 [Coordinator] Sensitive data detected in final response - using masked response`);
      console.log(`🔒 Detections:`, result.maskedData.response.pattern_detections || []);
    }

    return {
      ...result,
      originalResponse: response,
      maskedResponse: maskedResponse,
      hasMasking: maskedResponse !== response
    };
  }

  /**
   * Process user query through the MCP system with full security integration
   */
  async processQuery(query, language = 'en', phase = 'phase2', userContext = null) {
    if (!this.initialized) {
      throw new Error('IntelligentCoordinator not initialized');
    }

    console.log(`🎬 [Coordinator] Processing query: "${query}" (${language}, Phase: ${phase})`);
    this.sendThinkingMessage(`🔍 Analyzing your question...`);
    
    let queryToProcess = query;
    
    try {
      // CHECKPOINT 1: Analyze user input security (use passed phase, not instance variable)
      if (shouldUsePrismaAIRS(phase)) {
        console.log(`🔒 [Coordinator] Phase 3 active - Running Security Checkpoint 1: User Input Analysis`);
        const inputSecurity = await this.analyzeUserInput(query, language);
        if (!inputSecurity.approved) {
          console.log(`🚫 [Coordinator] Security Checkpoint 1 BLOCKED: ${inputSecurity.category}`);
          // Return security block message
          return {
            response: inputSecurity.message,
            securityBlock: true,
            category: inputSecurity.category,
            reportId: inputSecurity.reportId
          };
        }
        console.log(`✅ [Coordinator] Security Checkpoint 1 PASSED`);
        
        // If sensitive data was detected and masked, use the masked query for all downstream processing
        if (inputSecurity.hasMasking) {
          queryToProcess = inputSecurity.maskedQuery;
          console.log(`🔒 [Coordinator] Using masked query for all downstream processing`);
          console.log(`   Original: "${query}"`);
          console.log(`   Masked:   "${queryToProcess}"`);
        }
      }
    
      // Step 1: Translate if needed
      this.sendThinkingMessage(`🌐 Checking language requirements...`);
      const translatedQuery = await this.translateQuery(queryToProcess, language);
      if (translatedQuery !== queryToProcess) {
        this.sendThinkingMessage(`🔄 Translated to English: "${translatedQuery}"`);
      } else {
        this.sendThinkingMessage(`✓ No translation needed`);
      }

      // Step 2: Route to appropriate agent(s) using registry
      this.sendThinkingMessage(`🎯 Determining the best routing strategy for your query...`);
      const routingResult = await this.routeQuery(translatedQuery, language, phase, userContext);
      
      // routingResult is now always an object with type field
      if (routingResult.type === 'agent-id') {
        // Single agent routing
        const selectedAgent = this.registry.getAgent(routingResult.agentId);
        this.sendThinkingMessage(`📡 Connecting to ${selectedAgent.name} specialist...`);

        // Step 3: Query the selected agent
        this.sendThinkingMessage(`⏳ ${selectedAgent.name} specialist is processing your request...`);
        const agentResponse = await this.queryAgent(routingResult.agentId, translatedQuery, userContext, language, phase);
        
        // Check if security blocked the response at Checkpoint 3
        if (agentResponse && agentResponse._securityBlock) {
          console.log(`🚫 [Coordinator] Checkpoint 3 blocked response, returning security message`);
          return {
            response: agentResponse.message,
            securityBlock: true,
            category: agentResponse.category,
            reportId: agentResponse.reportId
          };
        }
        
        this.sendThinkingMessage(`✅ Response received from ${selectedAgent.name} specialist`);
        console.log(`✅ [Coordinator] Response from ${selectedAgent.name} agent received`);
        
        // Step 4: Process and validate the agent response
        this.sendThinkingMessage(`🔍 Processing and validating response...`);
        const processedResponse = await this.processAgentResponse(
          agentResponse, 
          query, 
          translatedQuery, 
          language, 
          selectedAgent.name
        );
        
        // CHECKPOINT 4: Analyze final response security (use passed phase)
        let finalResponseToReturn = processedResponse;
        if (shouldUsePrismaAIRS(phase)) {
          const finalSecurity = await this.analyzeFinalResponse(queryToProcess, processedResponse, language);
          if (!finalSecurity.approved) {
            return {
              response: finalSecurity.message,
              securityBlock: true,
              category: finalSecurity.category,
              reportId: finalSecurity.reportId
            };
          }
          
          // If sensitive data was detected and masked in the response, use the masked response
          if (finalSecurity.hasMasking) {
            finalResponseToReturn = finalSecurity.maskedResponse;
            console.log(`🔒 [Coordinator] Using masked response in final output (sensitive data detected)`);
          }
        }
        
        return {
          response: finalResponseToReturn,
          agentUsed: selectedAgent.name,
          translatedQuery: translatedQuery !== query ? translatedQuery : null
        };
      } else {
        // Multi-agent response - routingResult contains the final synthesized response
        this.sendThinkingMessage(`✅ Multi-agent coordination completed`);
        console.log(`✅ [Coordinator] Multi-agent response completed`);
        
        // Process multi-agent response
        this.sendThinkingMessage(`🔍 Processing and validating multi-agent response...`);
        const processedResponse = await this.processAgentResponse(
          routingResult.response, 
          query, 
          translatedQuery, 
          language, 
          'multi-agent-coordinator'
        );
        
        // CHECKPOINT 4: Analyze final response security (use passed phase)
        let finalResponseToReturn = processedResponse;
        if (shouldUsePrismaAIRS(phase)) {
          const finalSecurity = await this.analyzeFinalResponse(queryToProcess, processedResponse, language);
          if (!finalSecurity.approved) {
            return {
              response: finalSecurity.message,
              securityBlock: true,
              category: finalSecurity.category,
              reportId: finalSecurity.reportId
            };
          }
          
          // If sensitive data was detected and masked in the response, use the masked response
          if (finalSecurity.hasMasking) {
            finalResponseToReturn = finalSecurity.maskedResponse;
            console.log(`🔒 [Coordinator] Using masked response in final output (sensitive data detected)`);
          }
        }
        
        return {
          response: finalResponseToReturn,
          agentUsed: 'multi-agent-coordinator',
          translatedQuery: translatedQuery !== query ? translatedQuery : null
        };
      }
    } catch (error) {
      console.error('❌ [Coordinator] Query processing failed:', error);
      this.sendThinkingMessage(`❌ Error: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get information about all registered agents
   */
  getAgentsInfo() {
    return this.registry.getAllAgents().map(agent => ({
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
   * Health check for all registered agents
   */
  async healthCheck() {
    const allAgents = this.registry.getAllAgents();
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
        this.registry.updateAgentHealth(agent.agentId, true);
      } catch (error) {
        results.agents[agent.agentId] = {
          name: agent.name,
          status: 'unhealthy',
          url: agent.url,
          error: error.message
        };
        this.registry.updateAgentHealth(agent.agentId, false);
      }
    }

    return results;
  }

  /**
   * Process messages array through the MCP system (for MCP protocol compatibility)
   */
  async processMessages(messages, language = 'en', userContext = null) {
    if (!this.initialized) {
      throw new Error('MCPGateway not initialized');
    }

    if (!Array.isArray(messages) || messages.length === 0) {
      throw new Error('Messages array is required and must not be empty');
    }

    console.log(`💬 [Coordinator] Processing message array with ${messages.length} messages (${language})`);
    
    // Extract the most recent user message for processing
    const userMessages = messages.filter(msg => msg.role === 'user');
    const lastUserMessage = userMessages[userMessages.length - 1];
    
    if (!lastUserMessage || !lastUserMessage.content) {
      throw new Error('No valid user message found in messages array');
    }

    // Use the existing processQuery method with the latest user message
    const query = lastUserMessage.content;
    const result = await this.processQuery(query, language, {
      ...userContext,
      messageHistory: messages,
      conversationContext: this.extractConversationContext(messages)
    });

    // Add session update information for MCP protocol
    return {
      ...result,
      sessionUpdate: {
        lastProcessedMessage: lastUserMessage,
        messageCount: messages.length,
        timestamp: new Date().toISOString()
      }
    };
  }

  /**
   * Extract conversation context from message history
   */
  extractConversationContext(messages) {
    const context = {
      totalMessages: messages.length,
      userMessageCount: messages.filter(msg => msg.role === 'user').length,
      assistantMessageCount: messages.filter(msg => msg.role === 'assistant').length,
      topics: new Set(),
      recentContext: []
    };

    // Keep last 5 messages for context
    const recentMessages = messages.slice(-5);
    context.recentContext = recentMessages.map(msg => ({
      role: msg.role,
      content: msg.content?.substring(0, 200) || '', // Truncate for context
      timestamp: msg.timestamp
    }));

    // Extract potential topics from user messages
    const userMessages = messages.filter(msg => msg.role === 'user');
    userMessages.forEach(msg => {
      if (msg.content) {
        // Simple keyword extraction
        const words = msg.content.toLowerCase().split(/\s+/)
          .filter(word => word.length > 3)
          .slice(0, 5);
        words.forEach(word => context.topics.add(word));
      }
    });

    context.topics = Array.from(context.topics);
    
    return context;
  }

  /**
   * Cleanup - close connections and sessions
   */
  async cleanup() {
    console.log('🧹 [Coordinator] Cleaning up...');
    
    // Clear registry
    const allAgents = this.registry.getAllAgents();
    for (const agent of allAgents) {
      this.registry.unregisterAgent(agent.agentId);
    }
    
    this.initialized = false;
    console.log('✅ [Coordinator] Cleanup completed');
  }
}

module.exports = { IntelligentCoordinator };