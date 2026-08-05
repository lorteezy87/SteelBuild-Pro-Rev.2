/** Pure failure-message lookup for DesktopConnect page. */
import { DesktopConnectQueryError } from "@/lib/desktopSessionHandoff";

export type DesktopConnectFailure =
  | "query"
  | "query-empty"
  | "query-missing"
  | "session"
  | `session-${string}`
  | "crypto"
  | `crypto-${string}`
  | "handoff";

export const DESKTOP_CONNECT_FAILURE_MESSAGES: Record<string, string> = {
  "query-empty":
    "This page needs a connection link from Desktop Command Center. In the desktop app, click Connect — do not open /DesktopConnect directly or use a bookmark. (DC-QUERY-EMPTY)",
  "query-missing":
    "The connection link is incomplete (state, challenge, or public key missing). Close this tab and click Connect again from Desktop Command Center. (DC-QUERY-MISSING)",
  query:
    "The desktop connection request is invalid or expired. Start again from Desktop Command Center. (DC-QUERY)",
  session:
    "Sign in to SteelBuild in this browser tab, then click Retry. Being signed in on another tab or host is not enough. (DC-SESSION)",
  "session-access-token":
    "The browser session did not contain a usable access token. Sign in again, then restart the desktop connection. (DC-SESSION-ACCESS)",
  "session-refresh-token":
    "The browser session did not contain a usable refresh token. Sign in again, then restart the desktop connection. (DC-SESSION-REFRESH)",
  "session-expiry":
    "The browser session did not contain a usable expiry. Sign in again, then restart the desktop connection. (DC-SESSION-EXPIRY)",
  "session-user-id":
    "The browser session did not contain a usable user ID. Sign in again, then restart the desktop connection. (DC-SESSION-USER)",
  "session-email":
    "The browser session did not contain a usable account email. Sign in again, then restart the desktop connection. (DC-SESSION-EMAIL)",
  crypto:
    "This browser could not secure the desktop session. Start again from Desktop Command Center. (DC-CRYPTO)",
  "crypto-import":
    "This browser could not import the desktop public key. Start again from Desktop Command Center. (DC-CRYPTO-IMPORT)",
  "crypto-generate":
    "This browser could not generate a temporary session key. Start again from Desktop Command Center. (DC-CRYPTO-GENERATE)",
  "crypto-derive":
    "This browser could not derive the shared session secret. Start again from Desktop Command Center. (DC-CRYPTO-DERIVE)",
  "crypto-kdf":
    "This browser could not derive the session encryption key. Start again from Desktop Command Center. (DC-CRYPTO-KDF)",
  "crypto-random":
    "This browser could not generate a secure session nonce. Start again from Desktop Command Center. (DC-CRYPTO-RANDOM)",
  "crypto-encrypt":
    "This browser could not encrypt the desktop session. Start again from Desktop Command Center. (DC-CRYPTO-ENCRYPT)",
  "crypto-export":
    "This browser could not export the temporary public key. Start again from Desktop Command Center. (DC-CRYPTO-EXPORT)",
  handoff: "SteelBuild could not create the one-time desktop handoff. Try again. (DC-HANDOFF)",
};

export function desktopConnectFailureMessage(
  failure: DesktopConnectFailure | string | null | undefined,
): string {
  if (!failure) return DESKTOP_CONNECT_FAILURE_MESSAGES.query;
  return (
    DESKTOP_CONNECT_FAILURE_MESSAGES[failure] ||
    DESKTOP_CONNECT_FAILURE_MESSAGES.query
  );
}

/** Map query parse errors to stable DesktopConnect failure codes. */
export function classifyQueryFailure(error: unknown): DesktopConnectFailure {
  if (error instanceof DesktopConnectQueryError) {
    if (error.kind === "empty") return "query-empty";
    if (error.kind === "missing") return "query-missing";
  }
  return "query";
}

/** Resolve the connect query string — always fresh from the browser unless tests pin it. */
export function resolveDesktopConnectSearch(explicit?: string): string {
  if (explicit !== undefined) return explicit;
  return typeof window !== "undefined" ? window.location.search : "";
}
