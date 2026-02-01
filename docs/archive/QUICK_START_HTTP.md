# Quick Start - HTTP MCP Setup

## Your Configuration

Based on your Cursor setup, here's how to configure for standalone Node.js:

### .env Configuration

```env
# MCP Server - HTTP Transport
MCP_TRANSPORT=http
MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
MCP_SERVER_AUTH_TOKEN=hvbY78_Cf__NZvqZuBCUoLzCSsr1A2YOXICcu32FYag

# Moneybird Administration
MONEYBIRD_ADMINISTRATION_ID=221094161112106510

# OpenAI
OPENAI_API_KEY=your_openai_key
OPENAI_MODEL=gpt-4o

# Database
DATABASE_PATH=./data/moneybird-agent.db
```

### That's It!

The application will:
1. Connect to `https://moneybird.com/mcp/v1/read_write` via HTTP
2. Use Bearer token authentication
3. Discover available MCP tools
4. Make them available to `MoneybirdMCPClient`

## Test It

```bash
npm run test:mcp-http
```

This will test:
- MCP connection via HTTP
- List administrations
- List contacts
- Get contact details

## Run the Application

```bash
npm start
```

Check the logs for:
```json
{"level":"info","event":"mcp_client_connected","transport":"http","url":"https://moneybird.com/mcp/v1/read_write",...}
```

## How It Works

```
Node.js App → StreamableHTTPClientTransport → https://moneybird.com/mcp/v1/read_write
                                                      ↓
                                              Moneybird MCP Server
                                                      ↓
                                              Moneybird API
```

The HTTP transport uses:
- POST requests for sending messages
- Server-Sent Events (SSE) for receiving responses
- Bearer token authentication in headers
