import { toLocalDay } from "@/utils/dates";
import { getRuntimeUserPreferences } from "./runtime";

type DateInput = string | number | Date | null | undefined;

export function formatUserDate(input: DateInput): string {
  const date = toLocalDay(input);
  if (!date) return "—";
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  switch (getRuntimeUserPreferences().date_format) {
    case "DD/MM/YYYY": return `${d}/${m}/${y}`;
    case "YYYY-MM-DD": return `${y}-${m}-${d}`;
    default: return `${m}/${d}/${y}`;
  }
}

export function formatUserTime(input: DateInput): string {
  const date = input instanceof Date ? input : new Date(input ?? Number.NaN);
  if (!Number.isFinite(date.getTime())) return "—";
  const is24Hour = getRuntimeUserPreferences().time_format === "24h";
  return new Intl.DateTimeFormat("en-US", {
    hour: "numeric",
    minute: "2-digit",
    hour12: !is24Hour,
  }).format(date);
}

export function formatUserNumber(
  input: unknown,
  options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {},
): string {
  const value = Number(input);
  if (!Number.isFinite(value)) return "0";
  const style = getRuntimeUserPreferences().number_format;
  if (style === "1234.56") {
    return value.toLocaleString("en-US", { useGrouping: false, ...options });
  }
  const locale = style === "1 234,56" ? "fr-FR" : "en-US";
  return value.toLocaleString(locale, options).replace(/[\u00a0\u202f]/g, " ");
}

export function formatUserCurrency(input: unknown, fractionDigits = 2): string {
  const value = Number(input);
  const currency = getRuntimeUserPreferences().currency_format;
  const locale = currency === "EUR" ? "de-DE" : currency === "CAD" ? "en-CA" : "en-US";
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(Number.isFinite(value) ? value : 0);
}

export function formatUserMeasurement(input: unknown, kind: "weight" | "length" = "weight"): string {
  const value = Number(input);
  if (!Number.isFinite(value)) return kind === "weight" ? "0 lb" : "0 ft";
  const metric = getRuntimeUserPreferences().measurement_units === "metric";
  if (kind === "weight") {
    const display = metric ? Math.round(value * 0.45359237) : value;
    return `${formatUserNumber(display, { maximumFractionDigits: 0 })} ${metric ? "kg" : "lb"}`;
  }
  const display = metric ? value * 0.3048 : value;
  return `${formatUserNumber(display, { maximumFractionDigits: 2 })} ${metric ? "m" : "ft"}`;
}
