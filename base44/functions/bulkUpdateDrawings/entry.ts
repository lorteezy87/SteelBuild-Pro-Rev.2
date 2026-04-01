import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const sleep = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

const isRateLimitError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "");
  return /rate limit/i.test(message) || /\b429\b/.test(message);
};

const updateWithRetry = async (
  base44: ReturnType<typeof createClientFromRequest>,
  id: string,
  patch: Record<string, unknown>,
) => {
  let lastError: unknown = null;

  for (let attempt = 0; attempt < 7; attempt += 1) {
    try {
      const updated = await base44.entities.Drawing.update(id, patch);
      return updated;
    } catch (error) {
      lastError = error;
      if (!isRateLimitError(error) || attempt === 6) {
        throw error;
      }
      const backoffMs = [1500, 2500, 4000, 6000, 8500, 11000][attempt] ?? 12000;
      await sleep(backoffMs);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("Drawing update failed");
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const updates = Array.isArray(body?.updates) ? body.updates : [];

    if (!updates.length) {
      return Response.json({ error: "updates array is required" }, { status: 400 });
    }

    const results = [];
    for (const item of updates) {
      const id = String(item?.id || "").trim();
      const patch = item?.patch && typeof item.patch === "object" ? item.patch : null;
      if (!id || !patch) continue;
      const updated = await updateWithRetry(base44, id, patch);
      results.push(updated);
      await sleep(700);
    }

    return Response.json({ success: true, count: results.length, results });
  } catch (error) {
    const status = isRateLimitError(error) ? 429 : 500;
    return Response.json(
      { error: error instanceof Error ? error.message : "Unknown error" },
      { status }
    );
  }
});
