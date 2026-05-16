export function rfiNumberDedupKey(value) {
  const digits = String(value || "").replace(/\D/g, "");
  if (!digits) return null;
  return String(Number(digits));
}

export function normalizeRfiNumber(value) {
  const raw = String(value || "").trim();
  if (!raw) return "";
  const key = rfiNumberDedupKey(raw);
  if (!key) return raw;
  return `RFI #${key.padStart(3, "0")}`;
}
