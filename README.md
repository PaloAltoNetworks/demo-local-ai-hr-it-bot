# AI HR/IT Chatbot - MCP Gateway System

Intelligent chatbot with multi-agent routing, flexible LLM providers (Ollama/AWS Bedrock), and multilingual support.

[![The Otter](https://github.com/user-attachments/assets/71cdbc6c-5c97-4d92-841a-d3df7b216326)]https://github.com/user-attachments/assets/e4b44f5c-593d-4607-9158-cf2a0455cbc3)

## Features

- Intelligent query routing (HR, IT, General agents)
- Ollama (local, $0) or AWS Bedrock (cloud, ~$0.0045/query)
- Multi-language support
- Session management
- MCP protocol compliant

## Quick Start

```bash
# With Ollama (local development)
export LLM_PROVIDER=ollama
export OLLAMA_SERVER_URL=http://localhost:11434
docker compose up -d

# With AWS Bedrock (production)
export LLM_PROVIDER=aws
export AWS_BEARER_TOKEN_BEDROCK=your_bedrock_api_key
export AWS_REGION=us-east-1
docker compose up -d

# Verify
curl http://localhost:3001/health
```

## Documentation

See [docs/README.md](./docs/README.md) for complete documentation including configuration, API reference, troubleshooting, and deployment guide.

## Project Structure

```
chatbot-host/      - Web UI and backend API
mcp-gateway/       - Routing and LLM abstraction
mcp-server/        - HR, IT, General agents
docs/              - Complete documentation
```

## License

See LICENSE file
