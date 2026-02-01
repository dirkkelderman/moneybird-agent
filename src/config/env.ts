import { z } from "zod";
import dotenv from "dotenv";

dotenv.config();

const envSchemaBase = z.object({
  // Moneybird - MCP (primary method)
  MCP_SERVER_URL: z.string().default("https://moneybird.com/mcp/v1/read_write"),
  MCP_SERVER_AUTH_TOKEN: z.string().min(1, "MCP_SERVER_AUTH_TOKEN is required"),
  MONEYBIRD_ADMINISTRATION_ID: z.string().optional(),

  // Moneybird - OAuth (optional, for REST API fallback only)
  MONEYBIRD_CLIENT_ID: z.string().optional(),
  MONEYBIRD_CLIENT_SECRET: z.string().optional(),
  MONEYBIRD_ACCESS_TOKEN: z.string().optional(),

  // OpenAI
  OPENAI_API_KEY: z.string().min(1, "OPENAI_API_KEY is required"),
  OPENAI_MODEL: z.string().default("gpt-4.1"),


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

  // Notifications (optional - only set if you want notifications)
  EMAIL_SMTP_HOST: z.string().optional(),
  EMAIL_SMTP_PORT: z.coerce.number().optional().default(587),
  EMAIL_SMTP_USER: z.string().optional(),
  EMAIL_SMTP_PASS: z.string().optional(),
  EMAIL_TO: z.string().optional(), // Comma-separated emails

  TWILIO_ACCOUNT_SID: z.string().optional(),
  TWILIO_AUTH_TOKEN: z.string().optional(),
  TWILIO_WHATSAPP_FROM: z.string().optional(),
  WHATSAPP_TO: z.string().optional(), // Comma-separated phone numbers
});

const envSchema = envSchemaBase;

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
 * Check if OAuth credentials are available (for REST API fallback)
 */
export function hasOAuthCredentials(): boolean {
  const e = getEnv();
  return !!(e.MONEYBIRD_CLIENT_ID && e.MONEYBIRD_CLIENT_SECRET && e.MONEYBIRD_ACCESS_TOKEN);
}
