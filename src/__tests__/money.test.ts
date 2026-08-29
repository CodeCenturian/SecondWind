import { describe, it, expect } from "vitest";
import {
  fromDecimal,
  toDecimal,
  formatMoney,
  addMoney,
  subtractMoney,
  calculateBps,
  isNonNegative,
  isPositive,
} from "../lib/money";

describe("Money Utilities (Integer Minor Units)", () => {
  it("should convert decimal to minor units accurately without float error", () => {
    // 0.1 + 0.2 in standard JS floats is 0.30000000000000004
    const a = fromDecimal("0.10", "INR"); // 10 paise
    const b = fromDecimal("0.20", "INR"); // 20 paise
    const sum = addMoney(a, b);
    expect(sum).toBe(30n);
    expect(toDecimal(sum, "INR")).toBe(0.3);
  });

  it("should handle large INR amounts in minor units (paise)", () => {
    const amountStr = "1250000.75"; // ₹12,50,000.75
    const minor = fromDecimal(amountStr, "INR");
    expect(minor).toBe(125000075n);
    expect(toDecimal(minor, "INR")).toBe(1250000.75);
  });

  it("should format currency with proper symbols and commas", () => {
    const formatted = formatMoney(125000075n, "INR", "en-IN");
    // Should include currency symbol and formatted digits
    expect(formatted).toContain("12,50,000.75");
  });

  it("should subtract and check non-negative values correctly", () => {
    const total = 50000n; // ₹500.00
    const refund = 15000n; // ₹150.00
    const remaining = subtractMoney(total, refund);

    expect(remaining).toBe(35000n);
    expect(isNonNegative(remaining)).toBe(true);
    expect(isPositive(remaining)).toBe(true);
  });

  it("should calculate basis points accurately with rounding", () => {
    // 250 bps = 2.50% on ₹1,000.00 (100,000 paise) = ₹25.00 (2,500 paise)
    const fee = calculateBps(100000n, 250);
    expect(fee).toBe(2500n);
  });

  it("should throw error on invalid string amount inputs", () => {
    expect(() => fromDecimal("invalid-amount", "INR")).toThrow(TypeError);
    expect(() => fromDecimal("12.34.56", "INR")).toThrow(TypeError);
  });
});
