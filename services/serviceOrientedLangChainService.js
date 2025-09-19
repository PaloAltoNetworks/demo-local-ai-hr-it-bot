const { Document } = require('@langchain/core/documents');
const { MemoryVectorStore } = require('langchain/vectorstores/memory');
const { RecursiveCharacterTextSplitter } = require('langchain/text_splitter');

/**
 * Service-Oriented LangChain Knowledge Service
 * Dynamically integrates with all registered services to provide unified RAG capabilities
 */
class ServiceOrientedLangChainService {
  constructor(ollamaService) {
    this.ollamaService = ollamaService;
    this.registeredServices = new Map();
    this.vectorStore = null;
    this.intentVectorStore = null;
    this.isInitialized = false;
    this.embeddings = new OllamaEmbeddings(ollamaService);
  }

  /**
   * Register a service with LangChain capabilities
   * @param {Object} service - Service instance
   * @param {string} serviceName - Service name
   */
  registerService(service, serviceName) {
    console.log(`🔌 Registering service: ${serviceName}`);
    
    // Check if service has LangChain integration methods
    const hasIntentPatterns = typeof service.getIntentPatterns === 'function';
    const hasDocuments = typeof service.getLangChainDocuments === 'function';
    const hasMetadata = typeof service.getServiceMetadata === 'function';

    if (!hasIntentPatterns || !hasDocuments || !hasMetadata) {
      console.warn(`⚠️  Service ${serviceName} doesn't have full LangChain integration`);
      return;
    }

    this.registeredServices.set(serviceName, {
      service: service,
      metadata: service.getServiceMetadata(),
      intents: service.getIntentPatterns(),
      documents: service.getLangChainDocuments()
    });

    console.log(`✅ Service ${serviceName} registered with ${service.getLangChainDocuments().length} documents`);
    
    // Reinitialize if already initialized
    if (this.isInitialized) {
      this.initialize();
    }
  }

  /**
   * Initialize the service with all registered services
   */
  async initialize() {
    try {
      console.log('🔧 Initializing Service-Oriented LangChain...');
      
      // Build knowledge base from all services
      await this.buildDynamicKnowledgeBase();
      
      // Build intent classifier from all services
      await this.buildDynamicIntentClassifier();
      
      this.isInitialized = true;
      console.log(`✅ LangChain initialized with ${this.registeredServices.size} services`);
    } catch (error) {
      console.error('❌ Failed to initialize LangChain service:', error);
    }
  }

  /**
   * Build knowledge base dynamically from all registered services
   */
  async buildDynamicKnowledgeBase() {
    const allDocuments = [];
    
    // Static company policies (can be moved to a PolicyService later)
    const staticPolicies = [
      new Document({
        pageContent: `Remote Work Policy: Employees can work from home up to 3 days per week with manager approval. Full remote work requires VP approval and business justification.`,
        metadata: { type: 'company_policy', category: 'remote_work', serviceSource: 'Static' }
      }),
      new Document({
        pageContent: `Password Policy: Passwords must be at least 12 characters with uppercase, lowercase, numbers, and special characters. Passwords expire every 90 days.`,
        metadata: { type: 'it_policy', category: 'security', serviceSource: 'Static' }
      })
    ];
    
    allDocuments.push(...staticPolicies);

    // Collect documents from all registered services
    for (const [serviceName, serviceData] of this.registeredServices) {
      console.log(`📚 Loading documents from ${serviceName}...`);
      const serviceDocuments = serviceData.documents.map(doc => ({
        ...doc,
        metadata: {
          ...doc.metadata,
          sourceService: serviceName
        }
      }));
      allDocuments.push(...serviceDocuments);
    }

    // Create text splitter for large documents
    const textSplitter = new RecursiveCharacterTextSplitter({
      chunkSize: 1000,
      chunkOverlap: 200
    });

    // Split documents if needed
    const splitDocs = await textSplitter.splitDocuments(allDocuments);
    
    // Create vector store
    this.vectorStore = await MemoryVectorStore.fromDocuments(splitDocs, this.embeddings);
    
    console.log(`📚 Knowledge base built with ${splitDocs.length} documents from ${this.registeredServices.size} services`);
  }

  /**
   * Build intent classifier dynamically from all registered services
   */
  async buildDynamicIntentClassifier() {
    const allIntentExamples = [];

    // Collect intent patterns from all registered services
    for (const [serviceName, serviceData] of this.registeredServices) {
      console.log(`🎯 Loading intents from ${serviceName}...`);
      
      serviceData.intents.forEach(intentPattern => {
        intentPattern.examples.forEach(example => {
          allIntentExamples.push(new Document({
            pageContent: example,
            metadata: {
              intent: intentPattern.intent,
              confidence: intentPattern.confidence,
              serviceSource: serviceName,
              serviceHandler: intentPattern.serviceHandler
            }
          }));
        });
      });
    }

    this.intentVectorStore = await MemoryVectorStore.fromDocuments(allIntentExamples, this.embeddings);
    
    console.log(`🎯 Intent classifier built with ${allIntentExamples.length} examples from ${this.registeredServices.size} services`);
  }

  /**
   * Detect intent using service-aware vector similarity search
   * @param {string} query - User query
   * @returns {Promise<Object>} - Intent classification with service routing
   */
  async detectIntent(query) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Find similar intent examples
      const results = await this.intentVectorStore.similaritySearchWithScore(query, 5);
      
      if (results.length === 0) {
        return {
          primary: 'general_question',
          confidence: 0.5,
          reason: 'No similar examples found',
          sourceService: 'none',
          handler: null
        };
      }

      // Get the most similar intent with service routing
      const [bestMatch, score] = results[0];
      const intent = bestMatch.metadata.intent;
      const sourceService = bestMatch.metadata.serviceSource;
      const handler = bestMatch.metadata.serviceHandler;
      
      // Calculate confidence based on similarity score
      const confidence = Math.min(1.0, 1.0 - score);
      
      console.log(`🎯 Intent: ${intent} from ${sourceService} (confidence: ${confidence.toFixed(2)})`);
      
      return {
        primary: intent,
        confidence: confidence,
        reason: `Vector similarity match with ${sourceService}`,
        sourceService: sourceService,
        handler: handler,
        allResults: results.map(([doc, s]) => ({
          intent: doc.metadata.intent,
          service: doc.metadata.serviceSource,
          score: s,
          example: doc.pageContent
        }))
      };
      
    } catch (error) {
      console.error('❌ Intent detection error:', error);
      return {
        primary: 'general_question',
        confidence: 0.3,
        reason: 'Error in vector search',
        sourceService: 'error',
        handler: null
      };
    }
  }

  /**
   * Enhanced query processing with service-oriented RAG
   * @param {string} query - User query
   * @param {Object} userContext - User context information
   * @returns {Promise<Object>} - Enhanced processing result with service routing
   */
  async processQueryWithServiceRAG(query, userContext = {}) {
    // Detect intent with service routing
    const intent = await this.detectIntent(query);
    
    // Get relevant context using RAG
    const ragContext = await this.getRelevantContext(query, 5);
    
    // If intent has a specific service handler, delegate to that service
    if (intent.sourceService && intent.sourceService !== 'none' && intent.handler) {
      const serviceData = this.registeredServices.get(intent.sourceService);
      if (serviceData && serviceData.service[intent.handler]) {
        console.log(`🔄 Delegating to ${intent.sourceService}.${intent.handler}`);
        
        try {
          const serviceResult = await serviceData.service[intent.handler](query, userContext);
          
          return {
            intent: intent,
            context: ragContext.context,
            ragContext: ragContext,
            serviceResult: serviceResult,
            handledByService: true,
            handlingService: intent.sourceService,
            metadata: {
              retrievedDocs: ragContext.documents.length,
              sources: ragContext.sources,
              intentConfidence: intent.confidence,
              delegatedHandler: intent.handler
            }
          };
        } catch (error) {
          console.error(`❌ Service delegation error for ${intent.sourceService}:`, error);
          // Fall back to general processing
        }
      }
    }

    // General RAG processing if no service delegation
    const fullContext = `
${ragContext.context}

User Information:
${userContext.userInfo || ''}

Query Analysis:
- Intent: ${intent.primary} (confidence: ${intent.confidence.toFixed(2)})
- Source Service: ${intent.sourceService}
- Retrieved from: ${ragContext.sources.join(', ')}
    `.trim();

    return {
      intent: intent,
      context: fullContext,
      ragContext: ragContext,
      serviceResult: null,
      handledByService: false,
      handlingService: null,
      metadata: {
        retrievedDocs: ragContext.documents.length,
        sources: ragContext.sources,
        intentConfidence: intent.confidence
      }
    };
  }

  /**
   * Get relevant context using RAG across all services
   * @param {string} query - User query
   * @param {number} k - Number of documents to retrieve
   * @returns {Promise<Object>} - Retrieved context and documents
   */
  async getRelevantContext(query, k = 3) {
    if (!this.isInitialized) {
      await this.initialize();
    }

    try {
      // Retrieve relevant documents
      const results = await this.vectorStore.similaritySearchWithScore(query, k);
      
      if (results.length === 0) {
        return {
          context: '',
          documents: [],
          sources: []
        };
      }

      // Build context from retrieved documents
      let context = 'Relevant Company Information:\n\n';
      const documents = [];
      const sources = [];

      results.forEach(([doc, score], index) => {
        const sourceService = doc.metadata.sourceService || doc.metadata.serviceSource || 'Unknown';
        context += `${index + 1}. [${sourceService}] ${doc.pageContent}\n\n`;
        documents.push({
          content: doc.pageContent,
          metadata: doc.metadata,
          relevanceScore: score,
          sourceService: sourceService
        });
        sources.push(`${doc.metadata.type || 'policy'} (${sourceService})`);
      });

      console.log(`📚 Retrieved ${results.length} documents from services: ${[...new Set(documents.map(d => d.sourceService))].join(', ')}`);
      
      return {
        context: context.trim(),
        documents: documents,
        sources: [...new Set(sources)]
      };
      
    } catch (error) {
      console.error('❌ RAG context retrieval error:', error);
      return {
        context: '',
        documents: [],
        sources: []
      };
    }
  }

  /**
   * Get registered service information
   * @returns {Object} Service registry information
   */
  getServiceRegistry() {
    const registry = {};
    
    for (const [serviceName, serviceData] of this.registeredServices) {
      registry[serviceName] = {
        metadata: serviceData.metadata,
        intentCount: serviceData.intents.length,
        documentCount: serviceData.documents.length,
        intents: serviceData.intents.map(i => i.intent)
      };
    }
    
    return registry;
  }
}

/**
 * Custom Ollama Embeddings class (same as before but extracted for reuse)
 */
class OllamaEmbeddings {
  constructor(ollamaService) {
    this.ollamaService = ollamaService;
  }

  async embedDocuments(texts) {
    const embeddings = [];
    
    for (const text of texts) {
      try {
        const embedding = await this.generateEmbedding(text);
        embeddings.push(embedding);
      } catch (error) {
        console.error('Embedding error:', error);
        embeddings.push(this.generateHashEmbedding(text));
      }
    }
    
    return embeddings;
  }

  async embedQuery(text) {
    try {
      return await this.generateEmbedding(text);
    } catch (error) {
      console.error('Query embedding error:', error);
      return this.generateHashEmbedding(text);
    }
  }

  async generateEmbedding(text) {
    const words = text.toLowerCase().split(/\s+/);
    const embedding = new Array(384).fill(0);
    
    words.forEach((word, index) => {
      const wordHash = this.simpleHash(word);
      const pos = wordHash % embedding.length;
      embedding[pos] += 1 / (index + 1);
    });
    
    const magnitude = Math.sqrt(embedding.reduce((sum, val) => sum + val * val, 0));
    return magnitude > 0 ? embedding.map(val => val / magnitude) : embedding;
  }

  generateHashEmbedding(text) {
    const embedding = new Array(384).fill(0);
    const hash = this.simpleHash(text.toLowerCase());
    
    for (let i = 0; i < embedding.length; i++) {
      embedding[i] = Math.sin(hash * (i + 1)) * 0.1;
    }
    
    return embedding;
  }

  simpleHash(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash;
    }
    return Math.abs(hash);
  }
}

module.exports = ServiceOrientedLangChainService;