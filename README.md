# 🏢 Enterprise HR/IT Assistant

Enterprise HR/IT Assistant is a secure, on-premise AI chatbot designed for HR/IT automation, providing self-service capabilities through natural language conversations.

## ✨ Key Features

- **🔒 Secure Local AI**: Ollama-powered processing keeps sensitive data on-premise
- **🌍 Multi-language Support**: English-first with automatic language detection
- **⚡ Real-time Chat**: WebSocket-based instant messaging interface
- **👥 Corporate Integration**: Employee data management & organizational intelligence
- **📋 HR/IT Automation**: Streamlined processes for common employee requests
- **🎯 Intent Routing**: Service-oriented architecture routes requests to appropriate handlers
- **🏢 Enterprise Ready**: Built for corporate environments with security in mind

## 🚀 Quick Start

### Prerequisites

- **Node.js** (v16+ required)
- **Ollama** (for AI processing) - [Install Ollama](https://ollama.ai/)

### Installation

1. **Clone the repository:**
```bash
git clone https://github.com/PaloAltoNetworks/demo-local-ai-hr-it-bot.git
cd demo-local-ai-hr-it-bot
```

2. **Install dependencies:**
```bash
npm install
```

3. **Setup environment:**
```bash
cp .env.example .env
# Edit .env with your configuration
```

4. **Install and run Ollama (optional but recommended):**
```bash
# Install Ollama from https://ollama.ai/
# Pull a model for better AI responses
ollama pull llama2
```

5. **Start the application:**
```bash
# Development mode
npm run dev

# Production mode
npm start
```

6. **Access the interface:**
Open your browser to `http://localhost:3000`

## 🎯 Use Cases

### HR Automation
- **Leave Management**: Check vacation balances, request time off
- **Policy Queries**: Get instant answers about company policies
- **Employee Directory**: Search for colleagues and contact information
- **Onboarding Support**: Guide new employees through processes

### IT Support
- **Password Resets**: Self-service password management
- **Equipment Requests**: Request laptops, monitors, accessories
- **Troubleshooting**: Get help with common IT issues
- **Access Management**: Account and permission requests

## 🛠️ Configuration

### Environment Variables

Create a `.env` file based on `.env.example`:

```bash
# Server Configuration
PORT=3000
NODE_ENV=development

# Ollama Configuration (AI Service)
OLLAMA_BASE_URL=http://localhost:11434
OLLAMA_MODEL=llama2

# Language Settings
DEFAULT_LANGUAGE=en
SERVER_LANGUAGE=en

# Rate Limiting
RATE_LIMIT_WINDOW_MS=900000
RATE_LIMIT_MAX_REQUESTS=100
```

### Ollama Setup

For optimal AI responses, install and configure Ollama:

```bash
# Install Ollama
curl -fsSL https://ollama.ai/install.sh | sh

# Pull recommended models
ollama pull llama2          # Good general model
ollama pull codellama       # Better for technical queries
ollama pull mistral         # Faster responses

# Start Ollama service
ollama serve
```

## 📊 Architecture

The Enterprise HR/IT Assistant follows a service-oriented architecture with clear separation of concerns:

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Intent Router │    │   Ollama        │
│   (Browser)     │◄──►│   (Node.js)     │◄──►│   (AI Service)  │
│                 │    │                 │    │                 │
│ • WebSocket     │    │ • HRITService   │    │ • Local AI      │
│ • Multi-lang    │    │ • RAG Router    │    │ • Secure        │
│ • Real-time UI  │    │ • Validation    │    │ • Private       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │
        │              ┌─────────────────┐
        └─────────────►│  Backend        │
                       │  Services       │
                       │                 │
                       │ • Employee      │
                       │ • Policy        │
                       │ • Tickets       │
                       │ • Applications  │
                       └─────────────────┘
```

### Service Architecture

- **Intent Router (HRITService)**: Main orchestrator that receives requests and routes them to appropriate backend services
- **RAG Orchestration**: Service-oriented LangChain integration for knowledge retrieval and intent detection
- **Backend Services**: Modular services for specific domains (HR, IT, Policy, Tickets, etc.)
- **Conversation History**: Per-session chat history with pending action support
- **Multi-step Workflows**: Support for complex interactions requiring multiple user inputs

### Architectural Principles

1. **Service Validation**: Each service validates whether requests belong to its scope and reroutes if necessary
2. **Clear Boundaries**: Services have explicit responsibilities and don't overlap functionality
3. **Intent-Based Routing**: Requests are routed based on detected intent rather than hard-coded patterns
4. **Maintainable Code**: Simple, readable structure without over-engineering
5. **Future-Ready**: Prepared for external integrations like Prisma AIRS validation

### Key Workflows

#### Intent Detection and Routing
1. User message received via WebSocket
2. HRITService processes request using RAG orchestration
3. Intent detected and confidence calculated
4. Request routed to appropriate service handler
5. Service validates scope and processes or reroutes
6. Response formatted and returned to user

#### Ticket Creation and Confirmation  
1. User request identified as requiring ticket creation
2. Relevant information extracted from conversation context
3. Ticket created with appropriate priority and assignment
4. Confirmation sent to user with ticket number
5. Follow-up actions tracked in conversation history

#### Session History Management
1. Each user session maintains conversation context
2. Multi-step interactions supported via pending actions
3. Context used to improve subsequent responses
4. History helps maintain conversation flow

## 🧪 Testing

Run the test suite:

```bash
# Run all tests
npm test

# Run tests with coverage
npm run test:coverage

# Run tests in watch mode
npm run test:watch
```

## 🔧 Development

### Available Scripts

- `npm start` - Start production server
- `npm run dev` - Start development server with auto-reload
- `npm test` - Run test suite
- `npm run lint` - Check code style

### Project Structure

```
├── server.js                           # Main application server (HRITServer)
├── services/                           # Modular backend services
│   ├── hrItService.js                  # Main intent router and orchestrator
│   ├── serviceOrientedLangChainService.js # RAG orchestration service
│   ├── languageService.js              # Multi-language support
│   ├── ollamaService.js                # AI integration service
│   ├── employeeService.js              # Employee data management
│   ├── applicationService.js           # Application access management
│   ├── policyService.js                # Policy and knowledge base
│   ├── ticketService.js                # Ticket creation and tracking
│   ├── conversationHistoryService.js   # Session and conversation management
│   └── configService.js                # Configuration and health checks
├── public/                             # Frontend assets
│   ├── index.html                      # Main UI interface
│   ├── styles.css                      # Enterprise styling
│   ├── app.js                         # Frontend JavaScript
│   └── js/languageService.js          # Client-side language handling
├── languages/                          # Language files
│   └── en.js                          # English translations (primary)
├── data/                              # Demo data files
│   ├── employees.json                 # Employee database
│   └── applications.json              # Application access database
└── tests/                             # Test suite
    ├── languageService.test.js
    └── employeeService.test.js
```

## 🌐 Multi-Language Support

The Enterprise HR/IT Assistant provides flexible language support:

- **English (Primary)**: Native support for English HR/IT terminology and workflows
- **Extensible**: Easy addition of new languages via language files
- **Auto-Detection**: Automatic language detection using linguistic analysis
- **Backend English-Only**: All service logic, prompts, and system messages in English
- **User-Facing Translation**: Frontend interface adapts to user's preferred language
- **Consistent API**: Unified API responses regardless of user language

## 🔒 Security Features

- **Local Processing**: All AI processing happens on-premise with Ollama
- **Data Privacy**: No external API calls for sensitive information
- **Rate Limiting**: Built-in protection against abuse
- **Input Validation**: Secure handling of user inputs
- **CORS Protection**: Configurable cross-origin resource sharing
- **Helmet.js**: Security headers for web protection

## 🏢 Enterprise Integration

### Employee Data Management
- Centralized employee information
- Vacation and leave tracking  
- Organizational statistics
- Department and role management

### HR/IT Process Automation
- Standardized request handling
- Policy-based responses
- Workflow automation
- Audit trail capabilities

### Customization Options
- Configurable knowledge base
- Custom HR policies
- Branded interface
- Integration APIs

## 📈 Monitoring & Analytics

La Loutre provides built-in monitoring:

- **Health Endpoint**: `/health` for service monitoring
- **Connection Status**: Real-time WebSocket status
- **AI Service Status**: Ollama connectivity monitoring
- **Usage Statistics**: Employee interaction tracking

## 🤝 Contributing

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## 📝 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🆘 Support

- **Documentation**: Check this README and inline code comments
- **Issues**: Report bugs via GitHub Issues
- **Discussions**: Use GitHub Discussions for questions

## 🙏 Acknowledgments

- **Ollama**: For providing excellent local AI capabilities
- **Palo Alto Networks**: For supporting secure enterprise AI solutions
- **Open Source Community**: For the fantastic libraries and tools used

---

**Enterprise HR/IT Assistant** - *Your secure and intelligent HR/IT companion* 🏢