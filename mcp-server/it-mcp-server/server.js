import path from 'path';
import fs from 'fs/promises';
import { MCPAgentBase } from './shared/mcp-agent-base.js';
import { Ollama } from 'ollama';
import { ResourceTemplate } from '@modelcontextprotocol/sdk/server/mcp.js';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * IT Agent MCP Server
 * Specialized agent for IT support and technical issues
 */
class ITAgent extends MCPAgentBase {
  constructor() {
    super('it', 'Specialized agent for IT support tickets, technical issues, and troubleshooting');
    
    this.dataTypes = ['tickets', 'systems', 'hardware', 'software'];
    this.preferredModel = process.env.AGENT_MODEL || 'llama3.2:3b';
    this.ollama = new Ollama({ host: process.env.OLLAMA_URL || 'http://host.docker.internal:11434' });
  }

  /**
   * Set up MCP resources for IT data
   */
  setupResources() {
    // IT tickets database resource
    this.server.registerResource(
      "tickets",
      "it://tickets",
      {
        title: "IT Tickets Database",
        description: "Complete IT support tickets database with ticket IDs, statuses, priorities, assigned technicians, and resolution details",
        mimeType: "text/csv"
      },
      async (uri) => {
        const ticketData = await this.fetchITData();
        return {
          contents: [{
            uri: uri.href,
            text: ticketData
          }]
        };
      }
    );

    // Dynamic ticket resource
    this.server.registerResource(
      "ticket",
      new ResourceTemplate("it://tickets/{ticketId}", { list: undefined }),
      {
        title: "IT Ticket Details",
        description: "Individual IT ticket information and status",
        mimeType: 'text/plain'
      },
      async (uri, { ticketId }) => {
        const ticketData = await this.fetchITData();
        // Filter for specific ticket
        const lines = ticketData.split('\n');
        const header = lines[0];
        const ticketRow = lines.find(line => 
          line.toLowerCase().includes(ticketId.toLowerCase()) ||
          line.startsWith(ticketId)
        );
        
        const result = ticketRow ? `${header}\n${ticketRow}` : `Ticket ${ticketId} not found`;
        return {
          contents: [{
            uri: uri.href,
            text: result
          }]
        };
      }
    );

    // Query resource for processing IT queries with user context
    this.server.registerResource(
      "query",
      new ResourceTemplate('it://query{?q*}'),
      {
        title: 'IT Query with User Context',
        description: 'Handle IT queries with user context information',
        mimeType: 'text/plain'
      },
      async (uri, params) => {
        try {
          // Parse query from URI
          const urlObj = new URL(uri.href);
          const query = urlObj.searchParams.get('q');
          
          if (!query) {
            throw new Error('No query parameter provided');
          }
          
          // Process the enriched query that contains user context naturally embedded
          const response = await this.processQuery(query);
          
          return {
            contents: [{
              uri: uri.href,
              text: response
            }]
          };
        } catch (error) {
          console.error(`❌ [${this.agentName}] Query processing error:`, error);
          return {
            contents: [{
              uri: uri.href,
              text: `Error processing query: ${error.message}`
            }]
          };
        }
      }
    );

    console.log(`🎫 [${this.agentName}] IT resources registered`);
  }

  /**
   * Get available resources for resources/list
   */
  getAvailableResources() {
    return [
      {
        uri: "it://tickets",
        name: "tickets",
        description: "Complete IT support tickets database with ticket IDs, statuses, priorities, assigned technicians, and resolution details",
        mimeType: "text/csv"
      },
      {
        uri: "it://tickets/{ticketId}",
        name: "ticket",
        description: "Individual IT ticket information and status",
        mimeType: "text/plain"
      },
      {
        uri: "it://query{?q*}",
        name: "query",
        description: "Handle IT queries with user context information",
        mimeType: "text/plain"
      }
    ];
  }

  /**
   * Get agent capabilities
   */
  getCapabilities() {
    return [
      'IT ticket status tracking and resolution assistance',
      'Technical troubleshooting with specific company context',
      'System access, authentication, and login assistance',
      'Software and hardware support with ticketing history',
      'IT security policies, SSL/SSH keys, antivirus management',
      'System status, maintenance windows, and patch management',
      'Network connectivity, VPN, firewalls, and load balancing',
      'Password reset, MFA, and account management',
      'Cloud services (AWS, Azure, Google Cloud) support',
      'Development tools and CI/CD pipeline assistance',
      'Database connectivity and access management',
      'Backup, disaster recovery, and data restoration',
      'Application support (Teams, Slack, Zoom, Jira, Salesforce)',
      'Hardware peripherals (monitors, printers, keyboards, webcams)',
      'Issue pattern analysis and preventive recommendations',
      'Escalation routing to appropriate technical teams',
      'Recurring issue identification and workarounds'
    ];
  }

  /**
   * Get agent metadata
   */
  getMetadata() {
    return {
      name: 'it',
      displayName: 'IT Support Agent',
      description: 'Specialized agent for IT support and technical issues including ticket management and troubleshooting',
      version: '1.0.0',
      category: 'Information Technology',
      author: 'System',
      tags: ['it', 'support', 'technical', 'tickets', 'troubleshooting', 'systems'],
      preferredModel: this.preferredModel
    };
  }

  /**
   * Get keywords for query matching
   */
  getKeywords() {
    return [
      // Core IT terms
      'ticket', 'incident', 'support', 'issue', 'problem', 'bug', 'error', 'failure',
      'computer', 'laptop', 'desktop', 'workstation', 'hardware', 'software', 'device',
      
      // Networking
      'network', 'wifi', 'wireless', 'internet', 'connection', 'connectivity', 'connected',
      'vpn', 'firewall', 'router', 'bandwidth', 'speed', 'latency', 'ping', 'dns',
      'load-balancer', 'proxy', 'ethernet', 'tcp', 'ip', 'port',
      
      // Authentication & Security
      'login', 'password', 'authentication', 'access', 'permission', 'account', 'credential',
      'mfa', '2fa', 'two-factor', 'security', 'ssl', 'certificate', 'ssh', 'key',
      'antivirus', 'malware', 'virus', 'security', 'breach', 'encrypted', 'encryption',
      
      // Communication & Collaboration
      'email', 'outlook', 'slack', 'teams', 'zoom', 'meeting', 'call', 'message',
      'sharepoint', 'drive', 'storage', 'sync', 'synchronization', 'collaboration',
      
      // Systems & Services
      'system', 'server', 'database', 'backup', 'restore', 'recovery', 'disaster',
      'cloud', 'aws', 'azure', 'google', 'patch', 'update', 'upgrade', 'deployment',
      
      // Development & Tools
      'git', 'github', 'gitlab', 'docker', 'container', 'ci', 'cd', 'pipeline',
      'jira', 'github', 'ide', 'visual', 'code', 'python', 'node', 'npm', 'development',
      
      // Hardware & Peripherals
      'printer', 'monitor', 'display', 'keyboard', 'mouse', 'usb', 'port', 'peripheral',
      'webcam', 'microphone', 'audio', 'speaker', 'tablet', 'phone', 'mobile',
      
      // Applications
      'application', 'app', 'software', 'office', 'excel', 'word', 'powerpoint',
      'adobe', 'photoshop', 'illustrator', 'chrome', 'firefox', 'browser',
      'salesforce', 'crm', 'erp', 'accounting', 'finance',
      
      // Actions & Issues
      'install', 'uninstall', 'update', 'upgrade', 'configure', 'troubleshoot',
      'crash', 'freeze', 'hang', 'slow', 'performance', 'lag', 'not working',
      'cannot', "can't", 'unable', 'failed', 'failure', 'error', 'warning',
      
      // General IT
      'it', 'technical', 'tech', 'help desk', 'support desk', 'it support', 'technical support'
    ];
  }

  /**
   * Check if agent can handle query
   */
  canHandle(query, context = {}) {
    const keywords = this.getKeywords();
    const queryLower = query.toLowerCase();
    
    let score = 0;
    keywords.forEach(keyword => {
      if (queryLower.includes(keyword.toLowerCase())) {
        score += 15; // Higher score for IT keywords
      }
    });
    
    return Math.min(score, 100);
  }

  /**
   * Get system prompt for IT agent
   */
  getSystemPrompt() {
    return `You are an expert IT support specialist with comprehensive access to the company's IT systems, ticket database, and technical knowledge. Your role is to provide accurate, helpful IT support information.

CORE RESPONSIBILITIES:
- IT ticket status tracking and resolution assistance
- Technical troubleshooting and diagnostic guidance
- System access, login, and authentication support
- Software and hardware support with specific company context
- IT security policies, best practices, and incident response
- System status, maintenance windows, and planned updates
- Network connectivity and infrastructure issues
- Cloud services, APIs, and development tools

TICKET DATABASE CONTEXT:
You have access to the company's IT ticket database containing real support tickets. When relevant to the user's query:
- Reference specific ticket IDs, statuses, and resolution times
- Identify patterns (e.g., recurring issues, common problem areas)
- Provide context about assigned technicians and support teams
- Track issue escalation and critical tickets
- Understand the company's IT infrastructure and systems

RESPONSE STYLE:
- Be technical but clear and accessible to all employees
- Provide specific, actionable information based on actual ticket data
- Include relevant ticket numbers when discussing similar issues
- Offer step-by-step guidance for common problems
- Suggest escalation to specific technical teams when needed
- Use professional, solution-oriented language
- Provide estimated resolution times based on similar issues

TECHNICAL EXPERTISE AREAS:
- Network issues (VPN, WiFi, connectivity, firewalls, load balancing)
- Application support (Microsoft Office, Slack, Teams, Zoom, Jira, GitLab, Salesforce)
- Hardware (laptops, monitors, peripherals, printers, USB devices)
- Software deployment, updates, and licensing
- Security (SSL certificates, SSH keys, VPN, MDM, antivirus, firewalls)
- Cloud services (AWS, Google Drive, Azure)
- Development tools (Git, Docker, CI/CD, Node.js, Python, IDEs)
- Database connectivity and access
- Data backup, recovery, and disaster recovery
- System administration and patching

ANALYSIS CAPABILITIES:
- Identify recurring technical issues from ticket history
- Suggest preventive measures based on issue patterns
- Provide context about system changes affecting multiple users
- Recommend workarounds for known issues
- Alert about critical issues or security concerns

CRITICAL RULES:
1. Base recommendations on actual company ticket data and real systems mentioned
2. Reference specific ticket IDs and issue descriptions when relevant
3. Provide accurate information about ticket statuses and assigned teams
4. When suggesting solutions, acknowledge similar resolved tickets
5. Always validate suggestions against known issues and resolutions

DATA-DRIVEN RESPONSES:
- "Based on ticket INC-2025-XXXX, we resolved this by..." (when applicable)
- "We've seen similar issues (tickets: INC-2025-..., INC-2025-...) resolved by..."
- "Your issue matches ticket category: [category] - we typically resolve these in [time]"
- Show employee names and roles when discussing related issues
- Reference technician expertise when recommending escalation

SECURITY PROTOCOLS:
- Never provide actual passwords or security credentials
- Recommend secure authentication methods
- Always escalate security incidents appropriately
- Reference security ticket category when relevant
- Emphasize importance of VPN, SSL, and access control

ESCALATION GUIDELINES:
- Direct to Robert Taylor for network/infrastructure issues
- Direct to Dmitri Volkov for systems/storage/virtualization
- Direct to Lars Eriksson for security/SSL/SSH/certificates
- Direct to Chloe Williams for software deployment/cloud
- Direct to Mohammed Benali for applications/troubleshooting

LIMITATIONS:
- If information isn't in the ticket database, say: "I don't have that specific information in our IT database"
- For queries outside IT scope, respond with: "This appears to be outside IT support scope"
- For urgent security issues, always recommend immediate escalation

TONE:
Professional, helpful, and solution-focused. Balance technical depth with accessibility.`;
  }

  /**
   * Process IT query
   */
  async processQuery(query) {
    this.sendThinkingMessage("Analyzing IT support request...");
    
    try {
      // Fetch IT ticket data - this will throw if no data available
      let itData;
      try {
        itData = await this.fetchITData();
      } catch (dataError) {
        this.sendThinkingMessage("❌ IT ticket database is not available");
        console.error(`❌ [${this.agentName}] Database unavailable:`, dataError.message);
        return "I'm sorry, but the IT ticket database is currently unavailable. Please contact IT support to restore the ticket data file. I cannot provide IT support information without access to the ticket database.";
      }
      
      this.sendThinkingMessage("Checking IT systems and ticket database...");
      
      // Create IT-specific prompt (query now contains user context naturally)
      const itPrompt = `${this.getSystemPrompt()}

IT DATA CONTEXT:
${itData}

USER QUERY: ${query}

IT SPECIALIST RESPONSE:`;

      const result = await this.ollama.generate({
        model: this.preferredModel,
        prompt: itPrompt,
        options: {
          temperature: 0.2 // Low temperature for accurate technical information
        }
      });
      
      return result.response;
      
    } catch (error) {
      console.error('❌ IT Agent processing error:', error);
      return "I encountered an error while accessing IT information. Please contact the IT help desk directly for immediate assistance.";
    }
  }

  /**
   * Fetch IT data (reads from local data file)
   */
  async fetchITData(context = {}) {
    try {
      // Read from the local tickets.csv file in the agent directory
      const csvPath = path.join(__dirname, 'tickets.csv');
      
      try {
        const csvData = await fs.readFile(csvPath, 'utf8');
        return `IT Ticket Database:\n${csvData}`;
      } catch (fileError) {
        console.error('❌ No tickets.csv found in IT agent directory:', fileError.message);
        throw new Error('IT ticket database is not available. Please contact IT support to restore the ticket data file.');
      }
      
    } catch (error) {
      console.error('❌ Error fetching IT data:', error);
      throw error; // Propagate the error instead of returning fallback message
    }
  }



  /**
   * Health check with IT-specific information
   */
  async healthCheck() {
    const baseHealth = await super.healthCheck();
    
    // Add IT-specific health checks
    try {
      const models = await this.ollama.list();
      const ollamaHealth = {
        status: 'healthy',
        models: models.models?.map(m => m.name) || []
      };
      
      return {
        ...baseHealth,
        ollama: ollamaHealth,
        preferredModel: this.preferredModel,
        dataTypes: this.dataTypes,
        keywordCount: this.getKeywords().length
      };
    } catch (error) {
      return {
        ...baseHealth,
        ollama: {
          status: 'unhealthy',
          error: error.message
        },
        preferredModel: this.preferredModel,
        dataTypes: this.dataTypes,
        keywordCount: this.getKeywords().length
      };
    }
  }
}

// Start the MCP server if this file is run directly
if (import.meta.url === `file://${process.argv[1]}`) {
  const agent = new ITAgent();
  agent.start().catch(error => {
    console.error('❌ Failed to start IT Agent MCP server:', error);
    process.exit(1);
  });
}

export { ITAgent };