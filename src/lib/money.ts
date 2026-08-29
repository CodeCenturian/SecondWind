/**
 * Safe money manipulation using integer minor units (e.g. paise for INR, cents for USD).
 * Eliminates IEEE 754 floating-point precision issues in financial operations.
 */

export interface CurrencyConfig {
  code: string;
  decimals: number;
  symbol: string;
}

export const SUPPORTED_CURRENCIES: Record<string, CurrencyConfig> = {
  INR: { code: "INR", decimals: 2, symbol: "₹" },
  USD: { code: "USD", decimals: 2, symbol: " " },
  EUR: { code: "EUR", decimals: 2, symbol: "€" },
  GBP: { code: "GBP", decimals: 2, symbol: "£" },
  SGD: { code: "SGD", decimals: 2, symbol: "S$" },
};

/**
 * Converts a decimal amount (e.g., 100.50) into integer minor units (e.g., 10050n).
 */
export function fromDecimal(amount: number | string, currency: string = "INR"): bigint {
  const config = SUPPORTED_CURRENCIES[currency.toUpperCase()] ?? { decimals: 2 };
  const str = typeof amount === "number" ? amount.toFixed(config.decimals) : amount.trim();
  
  if (!/^-?\d+(\.\d+)?$/.test(str)) {
    throw new TypeError(`Invalid decimal currency amount string: "${amount}"`);
  }

  const parts = str.split(".");
  const integerPart = parts[0] ?? "0";
  let fractionPart = parts[1] ?? "";

  // Pad or trim fraction to match currency decimals
  if (fractionPart.length < config.decimals) {
    fractionPart = fractionPart.padEnd(config.decimals, "0");
  } else if (fractionPart.length > config.decimals) {
    fractionPart = fractionPart.slice(0, config.decimals);
  }

  const sign = integerPart.startsWith("-") ? -1n : 1n;
  const cleanInt = integerPart.replace("-", "");
  const totalMinor = BigInt(cleanInt + fractionPart);

  return sign * totalMinor;
}

/**
 * Converts integer minor units (e.g., 10050n) into a decimal number (e.g., 100.5).
 */
export function toDecimal(amountMinor: bigint | number, currency: string = "INR"): number {
  const config = SUPPORTED_CURRENCIES[currency.toUpperCase()] ?? { decimals: 2 };
  const minorBigInt = BigInt(amountMinor);
  const factor = 10 ** config.decimals;
  return Number(minorBigInt) / factor;
}

/**
 * Formats integer minor units into human-readable currency string (e.g., "₹100.50").
 */
export function formatMoney(
  amountMinor: bigint | number,
  currency: string = "INR",
  locale: string = "en-IN"
): string {
  const decimal = toDecimal(amountMinor, currency);
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: currency.toUpperCase(),
  }).format(decimal);
}

/**
 * Adds two minor-unit amounts.
 */
export function addMoney(a: bigint | number, b: bigint | number): bigint {
  return BigInt(a) + BigInt(b);
}

/**
 * Subtracts minor-unit amount b from a.
 */
export function subtractMoney(a: bigint | number, b: bigint | number): bigint {
  return BigInt(a) - BigInt(b);
}

/**
 * Calculates basis points percentage (e.g., 1000 bps = 10%) on minor units with integer rounding.
 */
export function calculateBps(amountMinor: bigint | number, bps: number): bigint {
  const minor = BigInt(amountMinor);
  const bpsBigInt = BigInt(bps);
  return (minor * bpsBigInt + 5000n) / 10000n;
}

/**
 * Checks if amount is non-negative.
 */
export function isNonNegative(amountMinor: bigint | number): boolean {
  return BigInt(amountMinor) >= 0n;
}

/**
 * Checks if amount is strictly positive.
 */
export function isPositive(amountMinor: bigint | number): boolean {
  return BigInt(amountMinor) > 0n;
}
