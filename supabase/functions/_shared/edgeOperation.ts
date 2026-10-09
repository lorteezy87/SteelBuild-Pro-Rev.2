// Durable service-only reservations. A transport failure never authorizes a
// provider call, and no pending/unknown reservation is automatically released.
export class EdgeBoundaryError extends Error {
  constructor(message: string, readonly status: number) { super(message); }
}

export function configuredLimit(name: string, fallback: number, integer = true): number {
  const raw = Deno.env.get(name);
  if (raw === undefined) return fallback;
  if (!/^(0|[1-9]\d*)(\.\d+)?$/.test(raw)) throw new EdgeBoundaryError("Usage limit configuration is unavailable.", 503);
  const value = Number(raw);
  if (!Number.isFinite(value) || value < 0 || value >= 1e9 || (integer && !Number.isSafeInteger(value))) {
    throw new EdgeBoundaryError("Usage limit configuration is unavailable.", 503);
  }
  return value;
}

async function bytesWithinLimit(source: Request | Response, maxBytes: number, signal?: AbortSignal): Promise<Uint8Array<ArrayBuffer>> {
  if (Number(source.headers.get("content-length")) > maxBytes) {
    void source.body?.cancel().catch(() => {});
    throw new EdgeBoundaryError("Request or response is too large.", 413);
  }
  const reader = source.body?.getReader();
  if (!reader) return new Uint8Array();
  const chunks: Uint8Array[] = [];
  signal?.throwIfAborted();
  const cancel = () => { void reader.cancel().catch(() => {}); };
  signal?.addEventListener("abort", cancel, { once: true });
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      signal?.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) { void reader.cancel().catch(() => {}); throw new EdgeBoundaryError("Request or response is too large.", 413); }
      chunks.push(value);
    }
  } finally { signal?.removeEventListener("abort", cancel); reader.releaseLock(); }
  signal?.throwIfAborted();
  const result = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) { result.set(chunk, offset); offset += chunk.length; }
  return result;
}

async function deadline<T>(run: (signal: AbortSignal) => Promise<T>, timeoutMs: number): Promise<T> {
  const controller = new AbortController();
  let timer: ReturnType<typeof setTimeout> | undefined;
  const expired = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { reject(new EdgeBoundaryError("External operation timed out; its outcome may be unknown.", 503)); controller.abort(); }, timeoutMs);
  });
  try { return await Promise.race([run(controller.signal), expired]); }
  finally { clearTimeout(timer); controller.abort(); }
}

/** Bound bytes before JSON/multipart materialization, even for chunked bodies. */
export async function boundedRequest(req: Request, maxBytes: number): Promise<Request> {
  const bytes = await deadline(signal => bytesWithinLimit(req, maxBytes, signal), 15_000);
  return new Request(req.url, { method: req.method, headers: req.headers, body: bytes });
}

/** The deadline covers fetch AND response consumption, not just headers. */
export async function fetchWithDeadline(input: string | URL | Request, init: RequestInit = {}, timeoutMs = 10_000, maxResponseBytes = 1024 * 1024): Promise<Response> {
  return await deadline(async signal => {
    const upstreamSignal = init.signal ?? (input instanceof Request ? input.signal : undefined);
    const combined = upstreamSignal ? AbortSignal.any([signal, upstreamSignal]) : signal;
    const response = await fetch(input, { ...init, signal: combined });
    const bytes = await bytesWithinLimit(response, maxResponseBytes, combined);
    return new Response([204,205,304].includes(response.status) ? null : bytes, { status: response.status, statusText: response.statusText, headers: response.headers });
  }, timeoutMs);
}

export function operationKey(req: Request): string {
  const key = req.headers.get("idempotency-key");
  if (!key || !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new EdgeBoundaryError("A valid Idempotency-Key is required. Update the client and retry the same operation.", 400);
  }
  return key.toLowerCase();
}
export async function operationFingerprint(value: unknown): Promise<string> {
  const bytes = new TextEncoder().encode(JSON.stringify(value));
  const hash = new Uint8Array(await crypto.subtle.digest("SHA-256", bytes));
  return Array.from(hash, b => b.toString(16).padStart(2,"0")).join("");
}

type Operation = { operationId: string; replay?: { result: unknown; status: number } };
async function ledgerRpc(name: string, args: Record<string, unknown>): Promise<unknown> {
  const url=Deno.env.get("SUPABASE_URL"), key=Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) throw new EdgeBoundaryError("Operation accounting is unavailable.",503);
  try {
    const response=await fetchWithDeadline(`${url}/rest/v1/rpc/${name}`, { method:"POST", headers:{"Content-Type":"application/json",apikey:key,Authorization:`Bearer ${key}`},body:JSON.stringify(args) },5_000,2*1024*1024);
    if(!response.ok) throw new Error("Ledger unavailable");
    return await response.json();
  } catch { throw new EdgeBoundaryError("Operation accounting is unavailable. Retry with the same operation key.",503); }
}
export async function reserveOperation(input: {kind:"email-send"|"llm-proxy"|"email-classify";userId:string|null;projectId:string|null;key:string;fingerprint:string;countLimit:number;costLimit?:number;reservedCost?:number}):Promise<Operation> {
  const raw=await ledgerRpc("reserve_edge_operation",{p_kind:input.kind,p_user_id:input.userId,p_project_id:input.projectId,p_request_key:input.key,p_fingerprint:input.fingerprint,p_count_limit:input.countLimit,p_cost_limit:input.costLimit??0,p_reserved_cost:input.reservedCost??0});
  if (!raw || typeof raw!=="object") throw new EdgeBoundaryError("Operation accounting is unavailable.",503);
  const row=raw as Record<string,unknown>;
  if(row.decision==="limited") throw new EdgeBoundaryError("Usage limit reached. Try again after the usage window resets.",429);
  if(row.decision==="conflict") throw new EdgeBoundaryError("This operation key was already used for different content.",409);
  if(["pending","unknown","completed"].includes(String(row.decision))) throw new EdgeBoundaryError("This operation may already have completed. Do not repeat it with a new key; reconcile its outcome first.",409);
  if(typeof row.operation_id!=="string" || !/^[0-9a-f-]{36}$/i.test(row.operation_id)) throw new EdgeBoundaryError("Operation accounting is unavailable.",503);
  if(row.decision==="reserved") return {operationId:row.operation_id};
  if(row.decision==="replay" && row.result!=null && Number.isInteger(row.response_status) && Number(row.response_status)>=200 && Number(row.response_status)<=599) return {operationId:row.operation_id,replay:{result:row.result,status:Number(row.response_status)}};
  throw new EdgeBoundaryError("Operation accounting is unavailable.",503);
}
export async function finishOperation(id:string,state:"completed"|"unknown",result:unknown=null,status=200,actualCost:number|null=null):Promise<void> {
  const ok=await ledgerRpc("finish_edge_operation",{p_operation_id:id,p_state:state,p_result:result,p_response_status:status,p_actual_cost:actualCost});
  if(ok!==true) throw new EdgeBoundaryError("Operation completion could not be recorded. Reconcile before repeating it.",409);
}
