export class RequestBoundaryError extends Error {
  constructor(message: string, readonly status: 400 | 403 | 413 | 503) {
    super(message);
  }
}

/** Bound streamed bytes, including requests without (or with a false) length. */
export async function readBoundedJson(req: Request, maxBytes: number): Promise<Record<string, unknown>> {
  const tooLarge = () => new RequestBoundaryError('Request too large. Split the document and retry.', 413);
  if (Number(req.headers.get('content-length')) > maxBytes) throw tooLarge();
  const reader = req.body?.getReader();
  if (!reader) throw new RequestBoundaryError('Expected a JSON object.', 400);
  const decoder = new TextDecoder();
  const chunks: string[] = [];
  let bytes = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      bytes += value.byteLength;
      if (bytes > maxBytes) {
        await reader.cancel();
        throw tooLarge();
      }
      chunks.push(decoder.decode(value, { stream: true }));
    }
    chunks.push(decoder.decode());
  } finally {
    reader.releaseLock();
  }
  try {
    const body: unknown = JSON.parse(chunks.join(''));
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw new Error();
    return body as Record<string, unknown>;
  } catch {
    throw new RequestBoundaryError('Expected a valid JSON object.', 400);
  }
}

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/** Use the caller's JWT, never service_role, for the org-aware access predicate. */
export async function authorizeTelemetryProject(
  projectId: unknown,
  config: { url: string; anonKey: string; authorization: string },
): Promise<string | null> {
  if (projectId === undefined || projectId === null || projectId === '') return null;
  if (typeof projectId !== 'string' || !UUID_RE.test(projectId)) {
    throw new RequestBoundaryError('Invalid project_id.', 400);
  }
  let response: Response;
  try {
    response = await fetch(`${config.url}/rest/v1/rpc/user_has_project_access`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', apikey: config.anonKey, Authorization: config.authorization },
      body: JSON.stringify({ p_project_id: projectId }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    throw new RequestBoundaryError('Project access cannot be verified. Please retry.', 503);
  }
  if (!response.ok) throw new RequestBoundaryError('Project access cannot be verified. Please retry.', 503);
  let allowed: unknown;
  try { allowed = await response.json(); } catch {
    throw new RequestBoundaryError('Project access cannot be verified. Please retry.', 503);
  }
  if (allowed !== true) throw new RequestBoundaryError('Project access denied.', 403);
  return projectId;
}
