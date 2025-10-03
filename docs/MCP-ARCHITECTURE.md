# MCP Architecture Documentation

## Overview

This document outlines the Model Context Protocol (MCP) architecture for our chatbot system, following the official MCP standard and best practices as defined by the MCP specification and enterprise recommendations.

## MCP Standard Components

According to the MCP specification, there are three key components:

### 1. **Host**
- The UI of the AI application that the human user interacts with
- Examples: Claude Desktop, ChatGPT, or our chatbot frontend
- **Our Implementation**: Chatbot frontend + backend API

### 2. **Client** 
- Sits inside the host and maintains a 1:1 connection with MCP server
- Routes messages between host and server
- Acts as intermediary and handles the communication protocol
- **Our Implementation**: MCP client embedded in chatbot backend

### 3. **Server**
- External to the host and exposes specific tools, data, and prompts
- Provides tools in AI-friendly JSON format with descriptions
- Maintains stateful, conversational interactions
- **Our Implementation**: HR-Agent, IT-Agent, General-Agent

## Current Architecture Issues

### ❌ Problems with Current Design

1. **Coordinator Role Confusion**:
   - Currently named "MCPAgentCoordinator" but acts as MCP Gateway/Proxy
   - Mixes frontend serving (Host responsibility) with routing (Gateway responsibility)
   - Not a true MCP Server according to standard

2. **Missing True MCP Client**:
   - Current HTTP calls instead of persistent MCP protocol connections
   - No proper session state management
   - No stateful conversations between client and servers

3. **Naming Convention Issues**:
   - "Coordinator" doesn't align with MCP standard terminology
   - Service names don't clearly indicate MCP roles

## Recommended MCP-Compliant Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    CHATBOT HOST                                 │
│  ┌─────────────────┐    ┌─────────────────────────────────────┐ │
│  │    Frontend     │    │         Backend API                 │ │
│  │   (User UI)     │    │    ┌─────────────────────────────┐  │ │
│  │                 │    │    │      MCP CLIENT             │  │ │
│  │                 │    │    │  • Stateful connections     │  │ │
│  │                 │    │    │  • Session management       │  │ │
│  │                 │    │    │  • Protocol translation     │  │ │
│  │                 │    │    └─────────────────────────────┘  │ │
│  └─────────────────┘    └─────────────────────────────────────┘ │
└───────────────────────────────────│─────────────────────────────┘
                                    │ MCP Protocol
┌───────────────────────────────────│─────────────────────────────┐
│                    MCP GATEWAY                                  │
│  ┌─────────────────────────────────▼─────────────────────────────┤
│  │  ENTERPRISE MCP GATEWAY FEATURES:                           │
│  │  • Security & access control (RBAC)                         │
│  │  • Tool filtering & optimization                            │
│  │  • Agent routing & load balancing                           │
│  │  • Observability & monitoring                               │
│  │  • Session state management                                 │
│  │  • Runtime guardrails                                       │
│  │  • Prompt/output sanitization                               │
│  └──────────────────────────────────────────────────────────────┤
└─────────────────┬─────────────┬─────────────┬───────────────────┘
                  │ MCP         │ MCP         │ MCP
┌─────────────────▼──┐ ┌────────▼──┐ ┌────────▼──┐
│   HR MCP SERVER   │ │ IT MCP    │ │ GENERAL   │
│                   │ │ SERVER    │ │MCP SERVER │
│ TOOLS:            │ │           │ │           │
│ • get_employee    │ │TOOLS:     │ │TOOLS:     │
│ • search_hr_data  │ │• get_ticket│ │• search   │
│ • create_report   │ │• update_IT │ │• general  │
│                   │ │• IT_query │ │• knowledge│
│ RESOURCES:        │ │           │ │           │
│ • employee_db     │ │RESOURCES: │ │RESOURCES: │
│ • hr_policies     │ │• ticket_db│ │• knowledge│
└───────────────────┘ └───────────┘ └───────────┘
```

## MCP Standard Naming Conventions

### Service Names
- **Host**: `chatbot-host` (frontend + backend API)
- **Gateway**: `mcp-gateway` (current "coordinator" renamed)
- **Servers**: 
  - `hr-mcp-server`
  - `it-mcp-server` 
  - `general-mcp-server`

### Class Names
- **Gateway**: `MCPGateway` (instead of `MCPAgentCoordinator`)
- **Client**: `MCPClient` (to be implemented)
- **Servers**: `HRMCPServer`, `ITMCPServer`, `GeneralMCPServer`

### Docker Services
```yaml
services:
  # MCP Host (User-facing application)
  chatbot-host:
    build: ./chatbot
    
  # MCP Gateway (Enterprise routing & security)
  mcp-gateway:
    build: ./mcp-gateway
    
  # MCP Servers (Domain-specific tools)
  hr-mcp-server:
    build: ./mcp-server/hr-mcp-server
    
  it-mcp-server:
    build: ./mcp-server/it-mcp-server
    
  general-mcp-server:
    build: ./mcp-server/general-mcp-server
```

## MCP Protocol Features

### Key Differences from REST APIs

| Aspect | REST API | MCP |
|--------|----------|-----|
| **Connection** | Stateless, per-request | Stateful, persistent session |
| **Tool Discovery** | Fixed endpoints | Dynamic runtime discovery |
| **Context** | No session context | Maintains conversation state |
| **Format** | Various (JSON/XML) | Standardized JSON protocol |
| **AI Integration** | Not AI-friendly | Purpose-built for AI agents |

### MCP Communication Flow

1. **Initialization**: Client connects to server
2. **Capability Discovery**: Server advertises available tools
3. **Tool Selection**: Client selects needed tools
4. **Stateful Execution**: Ongoing conversation with context
5. **Session Management**: Context maintained across requests

## Implementation Phases

### Phase 1: Rename & Restructure (COMPLETED ✅)
- [x] Remove legacy plugin system references
- [x] Rename services to follow MCP conventions
- [x] Separate chatbot-host from mcp-gateway
- [x] Update directory structure and naming
- [x] Create MCP-compliant docker-compose.yml
- [x] Update documentation

### Phase 2: MCP Protocol Implementation
- [ ] Implement true MCP client in chatbot backend
- [ ] Add persistent connections between client and gateway
- [ ] Implement session state management
- [ ] Add proper tool discovery mechanism

### Phase 3: Enterprise Gateway Features
- [ ] Add security controls (RBAC)
- [ ] Implement tool filtering
- [ ] Add monitoring and observability
- [ ] Runtime guardrails and sanitization

## Security Considerations

Based on MCP security best practices:

### New MCP-Specific Threats
- **Tool Poisoning**: Malicious tools providing false information
- **Rug Pull Attacks**: Tools changing behavior after trust established
- **Server Spoofing**: Fake MCP servers mimicking legitimate ones
- **Session Hijacking**: Unauthorized access to stateful sessions
- **Cross-Server Shadowing**: Tools with similar names across servers

### Required Security Measures
- Continuous tool metadata screening
- Prompt and output sanitization
- Runtime behavior guardrails
- Permission-based access controls (RBAC)
- Finely-scoped access tokens with OAuth
- Session encryption and validation

## File Structure (Target)

```
chatbot2/
├── chatbot-host/              # MCP Host (user-facing app)
│   ├── frontend/             # User interface
│   ├── backend/              # API server + MCP client
│   │   ├── mcp-client.js     # MCP protocol client
│   │   ├── api-server.js     # Frontend API
│   │   └── session-manager.js
│   └── Dockerfile
├── mcp-gateway/              # MCP Gateway (routing & security)
│   ├── gateway.js            # Core gateway logic
│   ├── agent-registry.js     # MCP server registry
│   ├── security/             # Security controls
│   └── Dockerfile
├── mcp-server/                   # MCP Servers
│   ├── hr-mcp-server/
│   ├── it-mcp-server/
│   └── general-mcp-server/
└── docker-compose.yml
```

## Environment Variables

### MCP Gateway
- `MCP_GATEWAY_PORT=3001`
- `MCP_SECURITY_ENABLED=true`
- `MCP_TOOL_FILTERING=true`

### MCP Servers
- `HR_MCP_SERVER_URL=http://hr-mcp-server:3000`
- `IT_MCP_SERVER_URL=http://it-mcp-server:3000`
- `GENERAL_MCP_SERVER_URL=http://general-mcp-server:3000`

### Chatbot Host
- `CHATBOT_HOST_PORT=3002`
- `MCP_GATEWAY_URL=http://mcp-gateway:3001`

## References

- [MCP Manager Blog: MCP vs API](https://mcpmanager.ai/blog/mcp-vs-api/)
- [MCP Security Best Practices](https://mcpmanager.ai/blog/mcp-security-best-practices/)
- [MCP Gateway Documentation](https://mcpmanager.ai/blog/mcp-gateway/)
- [Model Context Protocol Specification](https://spec.modelcontextprotocol.io/)

---

**Status**: Draft - Architecture planning phase
**Last Updated**: October 1, 2025
**Next Steps**: Implement Phase 1 restructuring with proper MCP naming conventions