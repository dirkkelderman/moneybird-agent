/**
 * MCP Connection Module
 * 
 * Handles connection to the Moneybird MCP server for standalone Node.js usage.
 * This module initializes the MCP client and makes tools available.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { getEnv } from "../config/env.js";

let mcpClient: Client | null = null;
let mcpTools: Map<string, (...args: any[]) => Promise<any>> | null = null;

/**
 * Initialize MCP client connection
 */
export async function initializeMCPClient(): Promise<void> {
  if (mcpClient) {
    return; // Already initialized
  }

  const env = getEnv();

  try {
    // For stdio transport (spawning MCP server as subprocess)
    if (env.MCP_TRANSPORT === "stdio") {
      if (!env.MCP_SERVER_COMMAND) {
        console.warn("MCP_SERVER_COMMAND not set - MCP tools will not be available");
        return;
      }

      // Parse server command and args
      const command = env.MCP_SERVER_COMMAND;
      let args: string[] = [];
      
      if (env.MCP_SERVER_ARGS) {
        try {
          args = JSON.parse(env.MCP_SERVER_ARGS);
        } catch {
          args = env.MCP_SERVER_ARGS.split(" ").filter(Boolean);
        }
      }

      // Create stdio transport
      const transport = new StdioClientTransport({
        command,
        args: args.length > 0 ? args : undefined,
        env: {
          ...process.env,
          // Pass Moneybird credentials to MCP server if needed
          ...(env.MONEYBIRD_TOKEN && { MONEYBIRD_TOKEN: env.MONEYBIRD_TOKEN }),
          ...(env.MONEYBIRD_ADMINISTRATION_ID && { MONEYBIRD_ADMINISTRATION_ID: env.MONEYBIRD_ADMINISTRATION_ID }),
        },
      });

      // Create MCP client
      mcpClient = new Client(
        {
          name: "moneybird-agent",
          version: "0.1.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect
      await mcpClient.connect(transport);

      // List available tools
      const toolsList = await mcpClient.listTools();
      
      // Create tool map
      mcpTools = new Map();
      
      for (const tool of toolsList.tools) {
        // Create wrapper function for each tool
        mcpTools.set(tool.name, async (params: any) => {
          if (!mcpClient) {
            throw new Error("MCP client not initialized");
          }
          const result = await mcpClient.callTool({
            name: tool.name,
            arguments: params || {},
          });
          
          // Handle different content types
          if (result.content && Array.isArray(result.content) && result.content.length > 0) {
            const firstContent = result.content[0] as any;
            if (firstContent.type === "text" && firstContent.text) {
              try {
                return JSON.parse(firstContent.text);
              } catch {
                return firstContent.text;
              }
            }
            if (firstContent.type === "resource" && firstContent.data) {
              return firstContent.data;
            }
          }
          
          return result;
        });
      }

      console.log(JSON.stringify({
        level: "info",
        event: "mcp_client_connected",
        transport: "stdio",
        tools_available: Array.from(mcpTools.keys()),
        timestamp: new Date().toISOString(),
      }));
    } else if (env.MCP_TRANSPORT === "http" && env.MCP_SERVER_URL) {
      // HTTP transport (for HTTP-based MCP servers)
      const url = new URL(env.MCP_SERVER_URL);
      
      // Prepare headers
      const headers: Record<string, string> = {};
      if (env.MCP_SERVER_AUTH_TOKEN) {
        headers["Authorization"] = `Bearer ${env.MCP_SERVER_AUTH_TOKEN}`;
      }
      
      // Create HTTP transport
      const transport = new StreamableHTTPClientTransport(url, {
        requestInit: {
          headers,
        },
      });

      // Create MCP client
      mcpClient = new Client(
        {
          name: "moneybird-agent",
          version: "0.1.0",
        },
        {
          capabilities: {},
        }
      );

      // Connect
      await mcpClient.connect(transport);

      // List available tools
      const toolsList = await mcpClient.listTools();
      
      // Create tool map
      mcpTools = new Map();
      
      for (const tool of toolsList.tools) {
        // Create wrapper function for each tool
        mcpTools.set(tool.name, async (params: any) => {
          if (!mcpClient) {
            throw new Error("MCP client not initialized");
          }
          const result = await mcpClient.callTool({
            name: tool.name,
            arguments: params || {},
          });
          
          // Handle different content types
          if (result.content && Array.isArray(result.content) && result.content.length > 0) {
            const firstContent = result.content[0] as any;
            if (firstContent.type === "text" && firstContent.text) {
              try {
                return JSON.parse(firstContent.text);
              } catch {
                return firstContent.text;
              }
            }
            if (firstContent.type === "resource" && firstContent.data) {
              return firstContent.data;
            }
          }
          
          return result;
        });
      }

      console.log(JSON.stringify({
        level: "info",
        event: "mcp_client_connected",
        transport: "http",
        url: env.MCP_SERVER_URL,
        tools_available: Array.from(mcpTools.keys()),
        timestamp: new Date().toISOString(),
      }));
    } else {
      console.warn(JSON.stringify({
        level: "warn",
        event: "mcp_config_missing",
        note: "MCP_TRANSPORT=http requires MCP_SERVER_URL, or MCP_TRANSPORT=stdio requires MCP_SERVER_COMMAND",
        timestamp: new Date().toISOString(),
      }));
    }
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "mcp_client_init_failed",
      error: error instanceof Error ? error.message : String(error),
      timestamp: new Date().toISOString(),
    }));
    throw error;
  }
}

/**
 * Get MCP tool function by name
 */
export function getMCPTool(name: string): ((...args: any[]) => Promise<any>) | null {
  if (!mcpTools) {
    return null;
  }
  return mcpTools.get(name) || null;
}

/**
 * Check if MCP client is initialized
 */
export function isMCPInitialized(): boolean {
  return mcpClient !== null && mcpTools !== null;
}

/**
 * Close MCP client connection
 */
export async function closeMCPClient(): Promise<void> {
  if (mcpClient) {
    await mcpClient.close();
    mcpClient = null;
    mcpTools = null;
  }
}
