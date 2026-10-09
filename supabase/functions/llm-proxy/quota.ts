import { configuredLimit, EdgeBoundaryError, operationKey, operationFingerprint, reserveOperation } from "../_shared/edgeOperation.ts";
import { modelCostReservation } from "./providers/cost.ts";

/** Reject billing features outside the token-only rate card. Custom JSON tools
 * still work. Anthropic native tools and cache writes have separate charges. */
export function assertTokenOnlyRequest(body: Record<string, unknown>): void {
  if (Array.isArray(body.tools) && body.tools.some(tool => !tool || typeof tool !== 'object' || 'type' in tool)) {
    throw new EdgeBoundaryError('Only custom function tools are supported.', 400);
  }
  const queue: unknown[] = [body.messages, body.tools, body.system];
  while (queue.length) {
    const item = queue.pop();
    if (!item || typeof item !== 'object') continue;
    if (Object.hasOwn(item, 'cache_control')) throw new EdgeBoundaryError('Prompt cache controls are not supported.', 400);
    for (const value of Object.values(item)) if (value && typeof value === 'object') queue.push(value);
  }
}

export async function reserveLlmOperation(req: Request, userId: string, projectId: string | null, body: Record<string, unknown>, provider: string, model: string) {
  assertTokenOnlyRequest(body);
  const budget = modelCostReservation(provider, model, body.maxTokens as number);
  body.maxTokens = budget.maxTokens;
  return reserveOperation({ kind: 'llm-proxy', userId, projectId, key: operationKey(req),
    fingerprint: await operationFingerprint({ body, provider, model }),
    countLimit: configuredLimit('LLM_DAILY_REQUEST_LIMIT', 0),
    costLimit: configuredLimit('LLM_DAILY_COST_LIMIT_USD', 0, false),
    reservedCost: budget.cost,
  });
}
