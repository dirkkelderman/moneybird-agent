# MCP Standalone Setup Guide

This guide explains how to use the Moneybird MCP integration in a standalone Node.js application (without Cursor).

## Overview

The application now supports connecting to a Moneybird MCP server using the `@modelcontextprotocol/sdk` package. This allows you to run the agent in any Node.js environment.

## Prerequisites

1. Node.js 20+
2. Moneybird MCP server installed and configured
3. Moneybird API credentials

## Installation

The MCP SDK is already installed:
```bash
npm install
```

## Configuration

Add these environment variables to your `.env` file:

### Option 1: HTTP Transport (Recommended for Moneybird MCP)

```env
# MCP Server Configuration - HTTP
MCP_TRANSPORT=http
MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
MCP_SERVER_AUTH_TOKEN=your_bearer_token

# Moneybird Administration
MONEYBIRD_ADMINISTRATION_ID=your_administration_id
```

### Option 2: Stdio Transport (for local MCP servers)

```env
# MCP Server Configuration - Stdio
MCP_TRANSPORT=stdio
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=["-y", "@modelcontextprotocol/server-moneybird"]

# Or if the MCP server is a local command:
# MCP_SERVER_COMMAND=node
# MCP_SERVER_ARGS=["/path/to/moneybird-mcp-server/index.js"]

# Moneybird Credentials (passed to MCP server)
MONEYBIRD_TOKEN=your_bearer_token
MONEYBIRD_ADMINISTRATION_ID=your_administration_id
```

### MCP Server Options

**Option 1: Using npx (recommended for testing)**
```env
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=["-y", "@modelcontextprotocol/server-moneybird"]
```

**Option 2: Local installation**
```env
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS=["node_modules/@modelcontextprotocol/server-moneybird/dist/index.js"]
```

**Option 3: Custom path**
```env
MCP_SERVER_COMMAND=/usr/local/bin/moneybird-mcp-server
MCP_SERVER_ARGS=[]
```

## How It Works

1. **On Startup**: The application calls `initializeMCPClient()`
2. **Connection**: Spawns the MCP server as a subprocess using stdio transport
3. **Tool Discovery**: Lists available tools from the MCP server
4. **Tool Mapping**: Creates wrapper functions for each tool
5. **Usage**: `MoneybirdMCPClient` methods automatically use MCP tools when available

## Usage Example

```typescript
import { MoneybirdMCPClient } from "./moneybird/mcpClient.js";
import { initializeMCPClient } from "./moneybird/mcpConnection.js";

// Initialize MCP connection (usually done in index.ts)
await initializeMCPClient();

// Use the client as normal
const client = new MoneybirdMCPClient();
const administrations = await client.listAdministrations();
const contacts = await client.listContacts({ per_page: "10" });
```

## Testing

Run the application:
```bash
npm start
```

The application will:
1. Initialize the MCP client connection
2. Log available tools
3. Start the scheduler
4. Use MCP tools for all Moneybird operations

## Troubleshooting

### MCP Server Not Starting

**Error**: `MCP_SERVER_COMMAND not set`
**Solution**: Set `MCP_SERVER_COMMAND` in your `.env` file

### Connection Failed

**Error**: `mcp_client_init_failed`
**Solution**: 
- Verify the MCP server command is correct
- Check that the MCP server package is installed
- Ensure Moneybird credentials are passed correctly

### Tools Not Available

**Symptom**: Methods throw "MCP tools not available"
**Solution**: 
- Verify MCP connection was successful (check logs)
- Check that the MCP server exposes the expected tools
- Fallback to REST API if MCP tools are not available

## Fallback Behavior

If MCP tools are not available, the client will:
1. Try to use MCP tools first
2. Fall back to REST API (when implemented)
3. Throw descriptive errors if neither is available

## Production Deployment

For production, you have two options:

1. **Use MCP Server**: Configure the MCP server command in your environment
2. **Use REST API**: Implement REST API fallback using OAuth credentials

The application gracefully handles both scenarios.
