import "server-only";
import { z } from "zod";

/**
 * Server-only environment variable schema with strict validation.
 * Ensures secrets cannot leak to client components and missing vars fail fast with clear errors.
 */
export const envSchema = z.object({
  DATABASE_URL: z
    .string({
      required_error: "DATABASE_URL is required for database connection",
    })
    .url("DATABASE_URL must be a valid connection URL"),
  RAZORPAY_KEY_ID: z
    .string({
      required_error: "RAZORPAY_KEY_ID is required for Razorpay API authentication",
    })
    .min(1, "RAZORPAY_KEY_ID cannot be empty"),
  RAZORPAY_KEY_SECRET: z
    .string({
      required_error: "RAZORPAY_KEY_SECRET is required for Razorpay API authentication",
    })
    .min(1, "RAZORPAY_KEY_SECRET cannot be empty"),
  RAZORPAY_WEBHOOK_SECRET: z
    .string({
      required_error: "RAZORPAY_WEBHOOK_SECRET is required for webhook signature verification",
    })
    .min(1, "RAZORPAY_WEBHOOK_SECRET cannot be empty"),
  GEMINI_API_KEY: z
    .string({
      required_error: "GEMINI_API_KEY is required for Google Gemini AI integration",
    })
    .min(1, "GEMINI_API_KEY cannot be empty"),
  NODE_ENV: z
    .enum(["development", "test", "production"])
    .default("development"),
});

export type Env = z.infer<typeof envSchema>;

/**
 * Validates a dictionary of environment variables and returns typed object.
 * Throws structured descriptive error if any required secret is missing or malformed.
 */
export function validateEnv(rawEnv: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(rawEnv);

  if (!result.success) {
    const formattedErrors = result.error.errors
      .map((err) => `  - [${err.path.join(".")}]: ${err.message}`)
      .join("\n");
    throw new Error(
      `[CRITICAL] Server Environment Configuration Validation Failed:\n${formattedErrors}\n\nPlease check your .env or runtime secrets.`
    );
  }

  return result.data;
}

let cachedEnv: Env | null = null;

/**
 * Access validated server-only environment variables.
 */
export function getEnv(): Env {
  if (!cachedEnv) {
    cachedEnv = validateEnv(process.env);
  }
  return cachedEnv;
}
