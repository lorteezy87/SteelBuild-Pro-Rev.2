export const OUTPUT_TOKEN_CEILING = 16000;

function finiteNumber(value: unknown, field: string): number {
  if ((typeof value !== 'number' && typeof value !== 'string') || (typeof value === 'string' && !value.trim())) {
    throw new Error(`${field} must be a finite number`);
  }
  const number = Number(value);
  if (!Number.isFinite(number)) throw new Error(`${field} must be a finite number`);
  return number;
}

/** Normalize before dispatch so provider coercion cannot bypass the ceiling. */
export function normalizeRequestLimits(body: Record<string, unknown>, provider: string): { maxTokens: number; temperature?: number } {
  const requested = body.maxTokens === undefined ? 1000 : finiteNumber(body.maxTokens, 'maxTokens');
  if (requested < 1) throw new Error('maxTokens must be at least 1');
  const maxTokens = Math.min(Math.floor(requested), OUTPUT_TOKEN_CEILING);
  if (body.temperature === undefined) return { maxTokens };
  const temperature = finiteNumber(body.temperature, 'temperature');
  const ceiling = provider === 'anthropic' ? 1 : 2;
  if (temperature < 0 || temperature > ceiling) throw new Error(`temperature must be between 0 and ${ceiling}`);
  return { maxTokens, temperature };
}
