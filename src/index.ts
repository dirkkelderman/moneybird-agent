/**
 * Moneybird Agent - Main Entry Point
 * 
 * Long-running backend service that automates bookkeeping tasks.
 * Runs on a VPS with systemd or PM2.
 */

import { getEnv } from "./config/env.js";
import { getDatabase, closeDatabase } from "./storage/db.js";
import { startScheduler, stopScheduler } from "./scheduler/cron.js";
import { initializeMCPClient, closeMCPClient } from "./moneybird/mcpConnection.js";

// Initialize database on startup
getDatabase();

// Handle graceful shutdown
process.on("SIGINT", () => {
  console.log(JSON.stringify({
    level: "info",
    event: "shutdown_initiated",
    signal: "SIGINT",
    timestamp: new Date().toISOString(),
  }));

  stopScheduler();
  closeDatabase();

  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log(JSON.stringify({
    level: "info",
    event: "shutdown_initiated",
    signal: "SIGTERM",
    timestamp: new Date().toISOString(),
  }));

  stopScheduler();
  closeMCPClient().catch(console.error);
  closeDatabase();

  process.exit(0);
});

// Handle uncaught errors
process.on("uncaughtException", (error) => {
  console.error(JSON.stringify({
    level: "error",
    event: "uncaught_exception",
    error: error.message,
    stack: error.stack,
    timestamp: new Date().toISOString(),
  }));

  stopScheduler();
  closeMCPClient().catch(console.error);
  closeDatabase();
  process.exit(1);
});

process.on("unhandledRejection", (reason) => {
  console.error(JSON.stringify({
    level: "error",
    event: "unhandled_rejection",
    error: reason instanceof Error ? reason.message : String(reason),
    stack: reason instanceof Error ? reason.stack : undefined,
    timestamp: new Date().toISOString(),
  }));
});

// Main entry point
async function main() {
  try {
    // Increase max listeners to prevent warnings (needed for MCP client connections)
    // This helps with AbortSignal/EventTarget listeners from HTTP requests
    process.setMaxListeners(20);
    
    getEnv(); // Validate environment

    console.log(JSON.stringify({
      level: "info",
      event: "application_started",
      version: "0.1.0",
      node_version: process.version,
      timestamp: new Date().toISOString(),
    }));

    // Initialize MCP client connection
    try {
      await initializeMCPClient();
    } catch (mcpError) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "mcp_init_failed",
        error: mcpError instanceof Error ? mcpError.message : String(mcpError),
        note: "Application will continue but MCP tools may not be available",
        timestamp: new Date().toISOString(),
      }));
    }

    // Start scheduler
    // Note: Scheduler will fail if LangGraph isn't working, but that's OK for initial testing
    try {
      startScheduler();
      console.log(JSON.stringify({
        level: "info",
        event: "scheduler_started",
        timestamp: new Date().toISOString(),
      }));
    } catch (schedulerError) {
      console.warn(JSON.stringify({
        level: "warn",
        event: "scheduler_start_failed",
        error: schedulerError instanceof Error ? schedulerError.message : "Unknown error",
        note: "This is expected if LangGraph API needs adjustment",
        timestamp: new Date().toISOString(),
      }));
    }

    console.log(JSON.stringify({
      level: "info",
      event: "application_ready",
      timestamp: new Date().toISOString(),
    }));
  } catch (error) {
    console.error(JSON.stringify({
      level: "error",
      event: "application_startup_failed",
      error: error instanceof Error ? error.message : "Unknown error",
      stack: error instanceof Error ? error.stack : undefined,
      timestamp: new Date().toISOString(),
    }));

    process.exit(1);
  }
}

// Start the application
main();
