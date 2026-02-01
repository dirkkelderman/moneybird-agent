# Environment Setup for HTTP MCP

## Based on Your Cursor Configuration

Your Cursor MCP config shows:
- URL: `https://moneybird.com/mcp/v1/read_write`
- Bearer Token: `hvbY78_Cf__NZvqZuBCUoLzCSsr1A2YOXICcu32FYag`

## Update Your .env

Add or update these lines in your `.env` file:

```env
# MCP Server - HTTP Transport (matches your Cursor setup)
MCP_TRANSPORT=http
MCP_SERVER_URL=https://moneybird.com/mcp/v1/read_write
MCP_SERVER_AUTH_TOKEN=hvbY78_Cf__NZvqZuBCUoLzCSsr1A2YOXICcu32FYag

# Note: MCP_SERVER_AUTH_TOKEN should be just the token (without "Bearer " prefix)
# The code will add "Bearer " automatically
```

## Test Configuration

Run the HTTP test:
```bash
npm run test:mcp-http
```

## Start Application

```bash
npm start
```

You should see in the logs:
```json
{"level":"info","event":"mcp_client_connected","transport":"http","url":"https://moneybird.com/mcp/v1/read_write",...}
```

## What Happens

1. Application starts
2. Reads `MCP_TRANSPORT=http` from .env
3. Connects to `MCP_SERVER_URL` via HTTP
4. Sends `Authorization: Bearer {MCP_SERVER_AUTH_TOKEN}` header
5. Discovers available MCP tools
6. Makes them available to `MoneybirdMCPClient`

## Troubleshooting

**Connection fails?**
- Verify `MCP_SERVER_URL` is correct
- Check `MCP_SERVER_AUTH_TOKEN` is valid (just the token, no "Bearer " prefix)
- Ensure the MCP server is accessible

**Tools not available?**
- Check logs for "mcp_client_connected" event
- Verify tools are listed in the "tools_available" array
- Check MCP server is responding correctly
