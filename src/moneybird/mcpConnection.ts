/**
 * MCP Connection Module
 * 
 * Handles connection to the Moneybird MCP server via HTTP.
 */

import { Client } from "@modelcontextprotocol/sdk/client/index.js";
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
    if (!env.MCP_SERVER_URL || !env.MCP_SERVER_AUTH_TOKEN) {
      throw new Error("MCP_SERVER_URL and MCP_SERVER_AUTH_TOKEN are required");
    }

    const url = new URL(env.MCP_SERVER_URL);
    
    // Create HTTP transport
    const transport = new StreamableHTTPClientTransport(url, {
      requestInit: {
        headers: {
          Authorization: `Bearer ${env.MCP_SERVER_AUTH_TOKEN}`,
        },
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
    try {
      await mcpClient.close();
    } catch (error) {
      console.error(JSON.stringify({
        level: "error",
        event: "mcp_client_close_failed",
        error: error instanceof Error ? error.message : String(error),
        timestamp: new Date().toISOString(),
      }));
    }
    mcpClient = null;
    mcpTools = null;
  }
}
