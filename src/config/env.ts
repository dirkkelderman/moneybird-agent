import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchemaBase = z.object({
  // Moneybird - OAuth (for REST API fallback)
  MONEYBIRD_CLIENT_ID: z.string().optional(),
  MONEYBIRD_CLIENT_SECRET: z.string().optional(),
  MONEYBIRD_ACCESS_TOKEN: z.string().optional(),
  
  // Moneybird - Token (for MCP or direct API)
  MONEYBIRD_TOKEN: z.string().optional(),
  
  // Moneybird - Administration
  MONEYBIRD_ADMINISTRATION_ID: z.string().optional(),
  
  // MCP Server Configuration
  MCP_SERVER_COMMAND: z.string().optional(), // e.g., "npx", "-y", "@modelcontextprotocol/server-moneybird"
  MCP_SERVER_ARGS: z.string().optional(), // JSON array of additional args
  MCP_TRANSPORT: z.enum(["stdio", "http"]).default("stdio"),
  MCP_SERVER_URL: z.string().optional(), // For HTTP transport (e.g., "https://moneybird.com/mcp/v1/read_write")
  MCP_SERVER_AUTH_TOKEN: z.string().optional(), // Bearer token for HTTP transport

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4.1"),

  // Optional: Anthropic Claude
  ANTHROPIC_API_KEY: z.string().optional(),

  // Database
  DATABASE_PATH: z.string().default("./data/moneybird-agent.db"),

  // Confidence thresholds
  CONFIDENCE_AUTO_THRESHOLD: z.coerce.number().min(0).max(100).default(95),
  CONFIDENCE_REVIEW_THRESHOLD: z.coerce.number().min(0).max(100).default(80),

  // Amount threshold for manual review (in cents)
  AMOUNT_REVIEW_THRESHOLD: z.coerce.number().default(100000), // €1000

  // Scheduler
  CRON_SCHEDULE: z.string().default("0 * * * *"), // Every hour

  // Logging
  LOG_LEVEL: z.enum(["debug", "info", "warn", "error"]).default("info"),

  // Email Notifications
  EMAIL_ENABLED: z.string().optional().default("false"),
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.string().optional().default("587"),
  EMAIL_SMTP_SECURE: z.string().optional().default("false"),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  EMAIL_FROM: z.string().optional(),
  EMAIL_TO: z.string().optional(), // Comma-separated list

  // WhatsApp Notifications (Twilio)
  WHATSAPP_ENABLED: z.string().optional().default("false"),
  WHATSAPP_PROVIDER: z.enum(["twilio", "whatsapp-business-api"]).optional(),
  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(), // WhatsApp number
  WHATSAPP_TO: z.string().optional(), // Comma-separated list of WhatsApp numbers

  // Notification Settings
  NOTIFICATIONS_ENABLED: z.string().optional().default("true"),
  NOTIFICATION_ERRORS_ONLY: z.string().optional().default("false"), // Only send on errors, not daily summaries
});

const envSchema = envSchemaBase.refine(
  (data) => {
    // Either OAuth credentials OR token must be provided
    const hasOAuth = data.MONEYBIRD_CLIENT_ID && data.MONEYBIRD_CLIENT_SECRET && data.MONEYBIRD_ACCESS_TOKEN;
    const hasToken = !!data.MONEYBIRD_TOKEN;
    return hasOAuth || hasToken;
  },
  {
    message: "Either MONEYBIRD_TOKEN or (MONEYBIRD_CLIENT_ID + MONEYBIRD_CLIENT_SECRET + MONEYBIRD_ACCESS_TOKEN) must be provided",
  }
);

export type Env = z.infer<typeof envSchema>;

let env: Env | null = null;

export function getEnv(): Env {
  if (env) {
    return env;
  }

  try {
    env = envSchema.parse(process.env);
    return env;
  } catch (error) {
    if (error instanceof z.ZodError) {
      const missing = error.errors.map((e) => e.path.join(".")).join(", ");
      throw new Error(`Missing or invalid environment variables: ${missing}`);
    }
    throw error;
  }
}

/**
 * Check if OAuth credentials are available
 */
export function hasOAuthCredentials(): boolean {
  const e = getEnv();
  return !!(e.MONEYBIRD_CLIENT_ID && e.MONEYBIRD_CLIENT_SECRET && e.MONEYBIRD_ACCESS_TOKEN);
}

/**
 * Check if token-based auth is available
 */
export function hasTokenAuth(): boolean {
  return !!getEnv().MONEYBIRD_TOKEN;
}

/**
 * Get the primary authentication method
 */
export function getAuthMethod(): "oauth" | "token" | "none" {
  if (hasOAuthCredentials()) return "oauth";
  if (hasTokenAuth()) return "token";
  return "none";
}
