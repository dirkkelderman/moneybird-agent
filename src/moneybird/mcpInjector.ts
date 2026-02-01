/**
 * MCP Tool Injector
 * 
 * This module provides a way to inject MCP tools into the global scope
 * for testing or when running in environments where MCP tools are available.
 * 
 * In production, MCP tools would be provided by an MCP client library.
 */

/**
 * Inject MCP tools into global scope
 * This is useful for testing or when MCP tools are available via other means
 */
export function injectMCPTools(tools: Record<string, (...args: any[]) => Promise<any>>): void {
  for (const [name, fn] of Object.entries(tools)) {
    (globalThis as any)[name] = fn;
  }
}

/**
 * Remove MCP tools from global scope
 */
export function removeMCPTools(toolNames: string[]): void {
  for (const name of toolNames) {
    delete (globalThis as any)[name];
  }
}
