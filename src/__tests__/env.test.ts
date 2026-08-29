import { describe, it, expect } from "vitest";
import { validateEnv, envSchema } from "../lib/env";

describe("Environment Validation & Server-Only Secrets", () => {
  const validMockEnv = {
    DATABASE_URL: "postgresql://postgres:postgres@localhost:5432/secondwind_dev",
    RAZORPAY_KEY_ID: "rzp_test_mockKeyId12345",
    RAZORPAY_KEY_SECRET: "mockSecretKey67890",
    RAZORPAY_WEBHOOK_SECRET: "webhookSecretToken_xyz",
    GEMINI_API_KEY: "AIzaSyMockGeminiKey_123456789",
    NODE_ENV: "test",
  };

  it("should successfully parse and return all secrets when valid", () => {
    const env = validateEnv(validMockEnv);
    expect(env.DATABASE_URL).toBe(validMockEnv.DATABASE_URL);
    expect(env.RAZORPAY_KEY_ID).toBe(validMockEnv.RAZORPAY_KEY_ID);
    expect(env.RAZORPAY_KEY_SECRET).toBe(validMockEnv.RAZORPAY_KEY_SECRET);
    expect(env.RAZORPAY_WEBHOOK_SECRET).toBe(validMockEnv.RAZORPAY_WEBHOOK_SECRET);
    expect(env.GEMINI_API_KEY).toBe(validMockEnv.GEMINI_API_KEY);
    expect(env.NODE_ENV).toBe("test");
  });

  it("should fail with clear descriptive error when DATABASE_URL is missing", () => {
    const invalidEnv = { ...validMockEnv, DATABASE_URL: undefined };
    expect(() => validateEnv(invalidEnv)).toThrowError(/DATABASE_URL is required/);
  });

  it("should fail with clear descriptive error when RAZORPAY_KEY_SECRET is missing", () => {
    const invalidEnv = { ...validMockEnv, RAZORPAY_KEY_SECRET: undefined };
    expect(() => validateEnv(invalidEnv)).toThrowError(/RAZORPAY_KEY_SECRET is required/);
  });

  it("should fail with clear descriptive error when RAZORPAY_WEBHOOK_SECRET is missing", () => {
    const invalidEnv = { ...validMockEnv, RAZORPAY_WEBHOOK_SECRET: undefined };
    expect(() => validateEnv(invalidEnv)).toThrowError(/RAZORPAY_WEBHOOK_SECRET is required/);
  });

  it("should fail with clear descriptive error when GEMINI_API_KEY is missing", () => {
    const invalidEnv = { ...validMockEnv, GEMINI_API_KEY: undefined };
    expect(() => validateEnv(invalidEnv)).toThrowError(/GEMINI_API_KEY is required/);
  });

  it("should fail when DATABASE_URL is not a valid URL format", () => {
    const invalidEnv = { ...validMockEnv, DATABASE_URL: "not-a-valid-url" };
    expect(() => validateEnv(invalidEnv)).toThrowError(/DATABASE_URL must be a valid connection URL/);
  });

  it("should default NODE_ENV to development if omitted", () => {
    const { NODE_ENV: _, ...withoutNodeEnv } = validMockEnv;
    const parsed = envSchema.parse(withoutNodeEnv);
    expect(parsed.NODE_ENV).toBe("development");
  });
});
