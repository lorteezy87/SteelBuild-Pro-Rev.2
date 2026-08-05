export type BulkDurationMode = "set" | "add" | "subtract" | string;

export function parseBulkDurationValue(value: string): number {
  return parseInt(value, 10);
}

export function isBulkDurationValid(
  value: string,
  mode: BulkDurationMode,
): boolean {
  const parsed = parseBulkDurationValue(value);
  return Number.isFinite(parsed) && (mode === "set" ? parsed >= 0 : parsed !== 0);
}

export function validateBulkDurationInput(
  value: string,
  mode: BulkDurationMode,
): string {
  if (value === "") return "Enter a duration value.";
  const parsed = parseBulkDurationValue(value);
  if (!Number.isFinite(parsed)) return "Must be a whole number.";
  if (mode === "set" && parsed < 0) return "Duration cannot be negative.";
  if (mode !== "set" && parsed === 0) return "Offset must be non-zero.";
  return "";
}
