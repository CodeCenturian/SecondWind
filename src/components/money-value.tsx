import React from "react";
import { formatMoney } from "@/lib/money";

interface MoneyValueProps {
  amountMinor: bigint | number;
  currency?: string;
  className?: string;
  showSubunits?: boolean;
}

export function MoneyValue({
  amountMinor,
  currency = "INR",
  className = "",
  showSubunits = false,
}: MoneyValueProps) {
  const formatted = formatMoney(amountMinor, currency);
  const minorStr = typeof amountMinor === "bigint" ? amountMinor.toString() : Math.round(amountMinor).toString();

  return (
    <span className={`text-mono ${className}`} style={{ fontVariantNumeric: "tabular-nums" }}>
      {formatted}
      {showSubunits && (
        <span style={{ fontSize: "0.7em", opacity: 0.65, marginLeft: "4px" }}>
          ({minorStr} paise)
        </span>
      )}
    </span>
  );
}
