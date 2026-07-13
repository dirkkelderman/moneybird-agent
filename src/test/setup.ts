/**
 * Vitest setup: runs before each test file.
 *
 * Provides the required env vars with dummy values (config is validated
 * lazily via getEnv), points the database at in-memory SQLite, and stubs
 * fetch so no unit test can ever touch the network.
 */

process.env.MCP_SERVER_AUTH_TOKEN = process.env.MCP_SERVER_AUTH_TOKEN || "test-token";
process.env.OPENAI_API_KEY = process.env.OPENAI_API_KEY || "test-key";
process.env.DATABASE_PATH = ":memory:";
process.env.MCP_MAX_RETRIES = process.env.MCP_MAX_RETRIES || "3";
process.env.LOG_LEVEL = "error";

// No network in unit tests — a fetch call is a test bug, fail loudly.
(globalThis as any).fetch = async () => {
  throw new Error("Network access attempted in a unit test");
};
