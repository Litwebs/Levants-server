export type CompactNumberOptions = {
  decimals?: number;
  /**
   * When true: 1200 -> "1.2k" (lowercase suffixes)
   * When false: 1200 -> "1.2K"
   */
  lowercaseSuffix?: boolean;
  /**
   * When true, trims trailing ".0" (e.g. 1.0k -> 1k)
   */
  trimTrailingZero?: boolean;
};

const UNITS: Array<{ value: number; suffix: string }> = [
  { value: 1e12, suffix: "T" },
  { value: 1e9, suffix: "B" },
  { value: 1e6, suffix: "M" },
  { value: 1e3, suffix: "K" },
];

export function formatCompactNumber(
  input: number | string | null | undefined,
  options: CompactNumberOptions = {},
): string {
  const {
    decimals = 1,
    lowercaseSuffix = true,
    trimTrailingZero = true,
  } = options;

  const num = typeof input === "string" ? Number(input) : (input ?? NaN);
  if (!Number.isFinite(num)) return "0";

  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (abs < 1000) {
    // Keep normal formatting for small integers
    const rounded = Math.round(abs);
    return `${sign}${rounded.toLocaleString("en-GB")}`;
  }

  const unit = UNITS.find((u) => abs >= u.value) ?? UNITS[UNITS.length - 1];
  const scaled = abs / unit.value;

  const safeDecimals = Math.max(0, Math.min(3, Math.floor(decimals)));
  let str = scaled.toFixed(safeDecimals);

  if (trimTrailingZero && str.includes(".")) {
    str = str.replace(/\.0+$/, "").replace(/(\.\d*[1-9])0+$/, "$1");
  }

  const suffix = lowercaseSuffix ? unit.suffix.toLowerCase() : unit.suffix;
  return `${sign}${str}${suffix}`;
}

export type FormatNumberOptions = {
  decimals?: number;
  compactDecimals?: number;
  lowercaseSuffix?: boolean;
  trimTrailingZero?: boolean;
};

export function formatNumber(
  input: number | string | null | undefined,
  options: FormatNumberOptions = {},
): string {
  const {
    decimals = 0,
    compactDecimals = 1,
    lowercaseSuffix = true,
    trimTrailingZero = true,
  } = options;

  const num = typeof input === "string" ? Number(input) : (input ?? NaN);
  if (!Number.isFinite(num)) return "0";

  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (abs < 1000) {
    const safeDecimals = Math.max(0, Math.min(6, Math.floor(decimals)));
    return `${sign}${abs.toLocaleString("en-GB", {
      minimumFractionDigits: safeDecimals,
      maximumFractionDigits: safeDecimals,
    })}`;
  }

  return formatCompactNumber(num, {
    decimals: compactDecimals,
    lowercaseSuffix,
    trimTrailingZero,
  });
}

export type FormatCurrencyOptions = {
  compact?: boolean;
  decimals?: number;
  compactDecimals?: number;
  lowercaseSuffix?: boolean;
};

export function formatCurrencyGBP(
  input: number | string | null | undefined,
  options: FormatCurrencyOptions = {},
): string {
  const {
    compact = true,
    decimals = 2,
    compactDecimals = 1,
    lowercaseSuffix = true,
  } = options;

  const num = typeof input === "string" ? Number(input) : (input ?? NaN);
  if (!Number.isFinite(num)) return "£0.00";

  const abs = Math.abs(num);
  const sign = num < 0 ? "-" : "";

  if (!compact || abs < 1000) {
    const safeDecimals = Math.max(0, Math.min(6, Math.floor(decimals)));
    return `${sign}£${abs.toLocaleString("en-GB", {
      minimumFractionDigits: safeDecimals,
      maximumFractionDigits: safeDecimals,
    })}`;
  }

  // For >= 1000, use compact suffixes
  const compactStr = formatCompactNumber(abs, {
    decimals: compactDecimals,
    lowercaseSuffix,
    trimTrailingZero: true,
  });
  return `${sign}£${compactStr}`;
}
