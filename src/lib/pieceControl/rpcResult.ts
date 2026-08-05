export interface StructuredRpcFailure {
  ok: false;
  failure_id?: string;
  command?: string;
  error_code?: string;
  error_message: string;
}

export function unwrapPieceControlRpc<T>(data: T | StructuredRpcFailure): T {
  if (
    data &&
    typeof data === "object" &&
    "ok" in data &&
    (data as StructuredRpcFailure).ok === false
  ) {
    const failure = data as StructuredRpcFailure;
    const suffix = failure.failure_id ? ` Audit ${failure.failure_id}.` : "";
    throw new Error(`${failure.error_message}${suffix}`);
  }
  return data as T;
}

