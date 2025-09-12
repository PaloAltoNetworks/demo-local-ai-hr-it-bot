# 🦦 La Loutre - Enterprise HR/IT AI Assistant

La Loutre is an enterprise-grade AI assistant designed for HR/IT automation, providing secure on-premise employee self-service through natural language conversations.

## ✨ Key Features

- **🔒 Secure Local AI**: Ollama-powered processing keeps sensitive data on-premise
- **🌍 Multi-language Support**: French (primary) & English with auto-detection
- **⚡ Real-time Chat**: WebSocket-based instant messaging interface
- **👥 Corporate Integration**: Employee data management & organizational intelligence
- **📋 HR/IT Automation**: Streamlined processes for common employee requests
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

# Security
JWT_SECRET=your-super-secret-jwt-key
SESSION_SECRET=your-session-secret

# Language Settings
DEFAULT_LANGUAGE=fr
SUPPORTED_LANGUAGES=fr,en

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

```
┌─────────────────┐    ┌─────────────────┐    ┌─────────────────┐
│   Frontend      │    │   Backend       │    │   Ollama        │
│   (Browser)     │◄──►│   (Node.js)     │◄──►│   (AI Service)  │
│                 │    │                 │    │                 │
│ • React Chat    │    │ • WebSocket     │    │ • Local AI      │
│ • Multi-lang    │    │ • Express API   │    │ • Secure        │
│ • Real-time     │    │ • HR/IT Logic   │    │ • Private       │
└─────────────────┘    └─────────────────┘    └─────────────────┘
        │                       │
        │              ┌─────────────────┐
        └─────────────►│  Employee DB    │
                       │  (In-Memory)    │
                       │                 │
                       │ • Demo Data     │
                       │ • HR Records    │
                       │ • Statistics    │
                       └─────────────────┘
```

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
├── server.js              # Main application server
├── services/              # Core business logic
│   ├── languageService.js # Multi-language support
│   ├── ollamaService.js   # AI integration
│   ├── employeeService.js # Employee data management
│   └── hrItService.js     # HR/IT automation logic
├── public/                # Frontend assets
│   ├── index.html         # Main UI
│   ├── styles.css         # Styling
│   └── app.js            # Frontend JavaScript
└── tests/                # Test suite
    ├── languageService.test.js
    └── employeeService.test.js
```

## 🌐 Multi-Language Support

La Loutre automatically detects the language of user inputs and responds appropriately:

- **French (Primary)**: Native support for French HR/IT terminology
- **English**: Full English support for international teams
- **Auto-Detection**: Automatic language detection using linguistic analysis
- **Consistent UI**: Interface adapts to selected language

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

**La Loutre** - *Votre assistant RH/IT sécurisé et intelligent* 🦦