/**
 * Retry for requests that never reached the server.
 *
 * Written for the storage upload path after a 385 KB PDF upload died with
 * `net::ERR_HTTP2_PROTOCOL_ERROR` — the CORS preflight logged 200, the POST was
 * never logged at all, and supabase-js surfaced it as
 * `StorageUnknownError: Failed to fetch`. The same file had uploaded fine four
 * minutes earlier. Nothing was wrong with the request; the connection was.
 *
 * That single-attempt upload is the first step of the revision-upload wizard,
 * so one dropped connection discarded the whole run — OCR, LLM extraction and
 * sheet matching included.
 *
 * The distinction that matters is between "the server never saw this" and "the
 * server saw it and said no". Only the first is safe to repeat blindly: a 409,
 * a 413 or an auth failure will give the same answer every time, and retrying
 * them just delays the error the user needs to read.
 */

/** Backoff between attempts. Two retries — the user is watching a spinner. */
export const DEFAULT_RETRY_DELAYS_MS: readonly number[] = [400, 1200];

type ErrorLike = {
  name?: string;
  message?: string;
  status?: number;
  statusCode?: string | number;
};

function asErrorLike(err: unknown): ErrorLike {
  return err && typeof err === "object" ? (err as ErrorLike) : {};
}

/** HTTP status, from either of the two shapes supabase-js uses. */
function statusOf(err: unknown): number | null {
  const e = asErrorLike(err);
  const raw = e.status ?? e.statusCode;
  if (raw == null) return null;
  const n = typeof raw === "string" ? Number.parseInt(raw, 10) : raw;
  return Number.isFinite(n) ? n : null;
}

/**
 * Status codes worth repeating. 408/425 are explicit "try again", 429 is rate
 * limiting, and 5xx is the server failing to answer rather than refusing.
 * Everything else in 4xx is a decision, not a hiccup.
 */
const RETRYABLE_STATUSES = new Set([408, 425, 429, 500, 502, 503, 504]);

/** Browser wording for a fetch that never completed, across engines. */
const NETWORK_FAILURE_RE =
  /failed to fetch|networkerror|network request failed|load failed|connection closed|err_http2|err_network|err_connection|socket hang up|terminated/i;

/**
 * Did this request fail before the server could answer?
 *
 * `StorageUnknownError` is supabase-js's wrapper for a rejected fetch — it is
 * only produced when there is no HTTP response at all, which makes it the
 * cleanest signal available. A bare `TypeError` is what fetch itself throws.
 */
export function isTransientNetworkError(err: unknown): boolean {
  const e = asErrorLike(err);

  const status = statusOf(err);
  if (status != null) return RETRYABLE_STATUSES.has(status);

  if (e.name === "StorageUnknownError" || e.name === "FunctionsFetchError") return true;
  if (e.name === "AbortError" || e.name === "TimeoutError") return false; // deliberate cancellation
  if (err instanceof TypeError) return true;

  return NETWORK_FAILURE_RE.test(e.message ?? "");
}

const sleepReal = (ms: number) => new Promise<void>((r) => { setTimeout(r, ms); });

export interface TransientRetryOptions {
  /** Delay before each retry. Length decides how many retries happen. */
  delaysMs?: readonly number[];
  /** Override the retry decision (e.g. to exclude quota errors). */
  shouldRetry?: (err: unknown) => boolean;
  /** Injected for tests, so they need not wait out real backoff. */
  sleep?: (ms: number) => Promise<void>;
  /** Called before each retry — for progress copy, telemetry or logging. */
  onRetry?: (info: { attempt: number; of: number; error: unknown; delayMs: number }) => void;
}

/**
 * Run `fn`, repeating it while the failure looks like a dropped connection.
 *
 * `fn` receives the 1-based attempt number so a caller can tell a first try
 * from a repeat — the upload path uses it to decide whether an "already
 * exists" collision means its own earlier attempt actually landed.
 *
 * The final failure is rethrown untouched: callers and error reporting see the
 * original error, not a retry wrapper.
 */
export async function withTransientRetry<T>(
  fn: (attempt: number) => Promise<T>,
  options: TransientRetryOptions = {},
): Promise<T> {
  const delays = options.delaysMs ?? DEFAULT_RETRY_DELAYS_MS;
  const shouldRetry = options.shouldRetry ?? isTransientNetworkError;
  const sleep = options.sleep ?? sleepReal;

  let lastError: unknown;
  for (let attempt = 1; attempt <= delays.length + 1; attempt += 1) {
    try {
      return await fn(attempt);
    } catch (err) {
      lastError = err;
      const delayMs = delays[attempt - 1];
      if (delayMs === undefined || !shouldRetry(err)) throw err;
      options.onRetry?.({ attempt, of: delays.length + 1, error: err, delayMs });
      await sleep(delayMs);
    }
  }
  throw lastError;
}
