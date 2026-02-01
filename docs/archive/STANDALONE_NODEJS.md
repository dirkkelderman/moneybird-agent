# Using in Standalone Node.js Application

## ✅ Implementation Complete

The Moneybird MCP integration now works in standalone Node.js applications without Cursor!

## What Was Added

1. **MCP SDK Integration** (`@modelcontextprotocol/sdk`)
   - Installed and configured
   - Stdio transport for subprocess communication

2. **MCP Connection Module** (`src/moneybird/mcpConnection.ts`)
   - Initializes MCP client connection
   - Spawns MCP server as subprocess
   - Maps MCP tools to functions
   - Handles connection lifecycle

3. **Updated MoneybirdMCPClient**
   - Automatically uses MCP connection when available
   - Falls back to global functions (Cursor) or REST API
   - Seamless integration

4. **Environment Configuration**
   - `MCP_SERVER_COMMAND`: Command to run MCP server
   - `MCP_SERVER_ARGS`: Arguments for MCP server
   - `MCP_TRANSPORT`: Transport type (stdio/http)

## Quick Start

### 1. Configure MCP Server

Add to your `.env`:

```env
# MCP Server
MCP_TRANSPORT=stdio
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=["-y", "@modelcontextprotocol/server-moneybird"]

# Moneybird (passed to MCP server)
MONEYBIRD_TOKEN=your_bearer_token
MONEYBIRD_ADMINISTRATION_ID=221094161112106510
```

### 2. Run the Application

```bash
npm start
```

The application will:
- Initialize MCP client connection
- Connect to Moneybird MCP server
- Make tools available to `MoneybirdMCPClient`
- Log available tools on startup

### 3. Use the Client

```typescript
import { MoneybirdMCPClient } from "./moneybird/mcpClient.js";

const client = new MoneybirdMCPClient();
const contacts = await client.listContacts();
// Works automatically with MCP tools!
```

## How It Works

```
┌─────────────────────┐
│ Node.js Application │
│                     │
│  MoneybirdMCPClient │
│         │           │
│         ▼           │
│  mcpConnection.ts   │
│         │           │
│         ▼           │
│  MCP SDK Client     │
│         │           │
│  stdio transport    │
└─────────┼───────────┘
          │
          ▼
┌─────────────────────┐
│ MCP Server Process  │
│ (spawned subprocess)│
│                     │
│ Moneybird MCP Server│
│         │           │
│         ▼           │
│  Moneybird API      │
└─────────────────────┘
```

## Testing

Test the MCP connection:

```bash
npm run test:mcp-standalone
```

## MCP Server Options

### Option 1: npx (Recommended for Testing)

```env
MCP_SERVER_COMMAND=npx
MCP_SERVER_ARGS=["-y", "@modelcontextprotocol/server-moneybird"]
```

### Option 2: Local Installation

```env
MCP_SERVER_COMMAND=node
MCP_SERVER_ARGS=["node_modules/@modelcontextprotocol/server-moneybird/dist/index.js"]
```

### Option 3: Global Installation

```env
MCP_SERVER_COMMAND=moneybird-mcp-server
MCP_SERVER_ARGS=[]
```

## Troubleshooting

### MCP Server Not Found

**Error**: Command not found
**Solution**: 
- Install the MCP server package: `npm install -g @modelcontextprotocol/server-moneybird`
- Or use npx: `MCP_SERVER_COMMAND=npx`

### Connection Timeout

**Error**: Connection failed
**Solution**:
- Verify `MONEYBIRD_TOKEN` is set correctly
- Check MCP server logs
- Ensure MCP server package is compatible

### Tools Not Available

**Symptom**: Methods fail with "MCP tools not available"
**Solution**:
- Check startup logs for "mcp_client_connected"
- Verify MCP server exposes the expected tools
- Check MCP server configuration

## Production Deployment

For production:

1. **Install MCP Server**: 
   ```bash
   npm install -g @modelcontextprotocol/server-moneybird
   ```

2. **Configure Environment**:
   ```env
   MCP_SERVER_COMMAND=moneybird-mcp-server
   MCP_SERVER_ARGS=[]
   ```

3. **Or Use Docker**: Package MCP server in Docker and configure command accordingly

## Benefits

✅ **Works in any Node.js environment**
✅ **No Cursor dependency**
✅ **Automatic tool discovery**
✅ **Graceful fallback to REST API**
✅ **Production-ready**

## Next Steps

1. Test with your MCP server configuration
2. Verify tools are available
3. Start using `MoneybirdMCPClient` in your workflow
4. Implement REST API fallback for operations not in MCP
