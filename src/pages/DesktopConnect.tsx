import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import {
  DESKTOP_SESSION_ALGORITHM,
  DesktopSessionCryptoError,
  DesktopSessionValidationError,
  buildDesktopCallbackUrl,
  encryptDesktopSession,
  parseDesktopConnectQuery,
  type DesktopConnectQuery,
  type DesktopEncryptedSession,
  type DesktopSessionCryptoStage,
  type DesktopSessionValidationField,
  type MinimalDesktopSession,
} from "@/lib/desktopSessionHandoff";

type BrowserSession = {
  access_token: string;
  refresh_token: string;
  expires_at?: number;
  user: { id: string; email?: string | null };
};

export interface DesktopConnectDependencies {
  getSession(): Promise<BrowserSession | null>;
  waitForSession?(timeoutMs?: number): Promise<BrowserSession | null>;
  encryptSession(input: {
    algorithm: typeof DESKTOP_SESSION_ALGORITHM;
    state: string;
    publicKey: JsonWebKey;
    session: MinimalDesktopSession;
  }): Promise<DesktopEncryptedSession>;
  createHandoff(input: {
    state: string;
    codeChallenge: string;
    encryptedSession: DesktopEncryptedSession;
  }): Promise<{ code: string; expiresAt: string }>;
  attemptSoftRedirect?(url: string): void;
  redirect(url: string): void;
}

interface DesktopConnectProps {
  dependencies?: DesktopConnectDependencies;
  search?: string;
  parseQuery?: (search: string) => DesktopConnectQuery;
}

type DesktopConnectFailure =
  | "query"
  | "session"
  | `session-${DesktopSessionValidationField}`
  | "crypto"
  | `crypto-${DesktopSessionCryptoStage}`
  | "handoff";

const failureMessages: Record<DesktopConnectFailure, string> = {
  query: "The desktop connection request is invalid or expired. Start again from Desktop Command Center. (DC-QUERY)",
  session: "Sign in to SteelBuild in this browser tab, then click Retry. Being signed in on another tab or host is not enough. (DC-SESSION)",
  "session-access-token": "The browser session did not contain a usable access token. Sign in again, then restart the desktop connection. (DC-SESSION-ACCESS)",
  "session-refresh-token": "The browser session did not contain a usable refresh token. Sign in again, then restart the desktop connection. (DC-SESSION-REFRESH)",
  "session-expiry": "The browser session did not contain a usable expiry. Sign in again, then restart the desktop connection. (DC-SESSION-EXPIRY)",
  "session-user-id": "The browser session did not contain a usable user ID. Sign in again, then restart the desktop connection. (DC-SESSION-USER)",
  "session-email": "The browser session did not contain a usable account email. Sign in again, then restart the desktop connection. (DC-SESSION-EMAIL)",
  crypto: "This browser could not secure the desktop session. Start again from Desktop Command Center. (DC-CRYPTO)",
  "crypto-import": "This browser could not import the desktop public key. Start again from Desktop Command Center. (DC-CRYPTO-IMPORT)",
  "crypto-generate": "This browser could not generate a temporary session key. Start again from Desktop Command Center. (DC-CRYPTO-GENERATE)",
  "crypto-derive": "This browser could not derive the shared session secret. Start again from Desktop Command Center. (DC-CRYPTO-DERIVE)",
  "crypto-kdf": "This browser could not derive the session encryption key. Start again from Desktop Command Center. (DC-CRYPTO-KDF)",
  "crypto-random": "This browser could not generate a secure session nonce. Start again from Desktop Command Center. (DC-CRYPTO-RANDOM)",
  "crypto-encrypt": "This browser could not encrypt the desktop session. Start again from Desktop Command Center. (DC-CRYPTO-ENCRYPT)",
  "crypto-export": "This browser could not export the temporary public key. Start again from Desktop Command Center. (DC-CRYPTO-EXPORT)",
  handoff: "SteelBuild could not create the one-time desktop handoff. Try again. (DC-HANDOFF)",
};

async function waitForBrowserSession(timeoutMs = 8_000): Promise<BrowserSession | null> {
  const { data, error } = await supabase.auth.getSession();
  if (!error && data.session) return data.session as BrowserSession;

  return await new Promise((resolve) => {
    let settled = false;
    const finish = (session: BrowserSession | null) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      subscription.subscription.unsubscribe();
      resolve(session);
    };
    const timer = setTimeout(() => finish(null), timeoutMs);
    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      if (session) finish(session as BrowserSession);
    });
    void supabase.auth.getSession().then(({ data: latest }) => {
      if (latest.session) finish(latest.session as BrowserSession);
    });
  });
}

const defaultDependencies: DesktopConnectDependencies = {
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session as BrowserSession | null;
  },
  waitForSession: waitForBrowserSession,
  encryptSession: encryptDesktopSession,
  async createHandoff(input) {
    const { data, error } = await supabase.functions.invoke("command-center-session-handoff", {
      body: {
        action: "create",
        state: input.state,
        codeChallenge: input.codeChallenge,
        encryptedSession: input.encryptedSession,
      },
    });
    if (error || typeof data?.code !== "string" || typeof data?.expiresAt !== "string") {
      throw new Error("Unable to create desktop handoff");
    }
    return { code: data.code, expiresAt: data.expiresAt };
  },
  attemptSoftRedirect(url) {
    try {
      const iframe = document.createElement("iframe");
      iframe.style.display = "none";
      iframe.setAttribute("aria-hidden", "true");
      iframe.src = url;
      document.body.appendChild(iframe);
      window.setTimeout(() => iframe.remove(), 3_000);
    } catch {
      // Best-effort only; the explicit button remains the reliable path.
    }
  },
  redirect(url) {
    window.location.assign(url);
  },
};

export function DesktopConnect({
  dependencies = defaultDependencies,
  search = window.location.search,
  parseQuery = parseDesktopConnectQuery,
}: DesktopConnectProps) {
  const [attempt, setAttempt] = useState(0);
  const [status, setStatus] = useState<"connecting" | "returning" | "error">("connecting");
  const [failure, setFailure] = useState<DesktopConnectFailure | null>(null);
  const [callbackUrl, setCallbackUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    let failureStage: DesktopConnectFailure = "query";
    setStatus("connecting");
    setFailure(null);
    setCallbackUrl(null);

    void (async () => {
      try {
        const query = parseQuery(search);
        failureStage = "session";
        const browserSession = await (dependencies.waitForSession?.(8_000)
          ?? dependencies.getSession());
        if (!browserSession?.expires_at || !browserSession.user.email) {
          throw new Error("Authenticated SteelBuild session is unavailable");
        }
        failureStage = "crypto";
        const encryptedSession = await dependencies.encryptSession({
          algorithm: DESKTOP_SESSION_ALGORITHM,
          state: query.state,
          publicKey: query.publicKey,
          session: {
            accessToken: browserSession.access_token,
            refreshToken: browserSession.refresh_token,
            expiresAt: browserSession.expires_at,
            user: { id: browserSession.user.id, email: browserSession.user.email },
          },
        });
        failureStage = "handoff";
        const handoff = await dependencies.createHandoff({
          state: query.state,
          codeChallenge: query.challenge,
          encryptedSession,
        });
        const callback = buildDesktopCallbackUrl({ code: handoff.code, state: query.state });
        if (!active) return;
        setCallbackUrl(callback);
        setStatus("returning");
        dependencies.attemptSoftRedirect?.(callback);
      } catch (error) {
        if (active) {
          setFailure(
            failureStage === "crypto" && error instanceof DesktopSessionValidationError
              ? `session-${error.field}`
              : failureStage === "crypto" && error instanceof DesktopSessionCryptoError
                ? `crypto-${error.stage}`
                : failureStage,
          );
          setStatus("error");
        }
      }
    })();

    return () => {
      active = false;
    };
  }, [attempt, dependencies, parseQuery, search]);

  return (
    <main style={{ maxWidth: 560, margin: "8vh auto", padding: 32 }} aria-live="polite">
      <p style={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "var(--text-muted)" }}>
        Desktop Command Center
      </p>
      <h1>Connect SteelBuild</h1>
      {status === "connecting" && (
        <p>Connecting securely to the desktop application… Sign in in this tab if prompted.</p>
      )}
      {status === "returning" && (
        <>
          <p>Handoff ready. If Desktop Command Center is still waiting, click the button below and allow the app to open.</p>
          {callbackUrl ? (
            <p style={{ marginTop: 24 }}>
              <a
                href={callbackUrl}
                style={{
                  display: "inline-block",
                  padding: "12px 18px",
                  background: "var(--accent, #1677ff)",
                  color: "#fff",
                  textDecoration: "none",
                  borderRadius: 8,
                  fontWeight: 600,
                }}
              >
                Open Desktop Command Center
              </a>
            </p>
          ) : null}
        </>
      )}
      {status === "error" && (
        <>
          <p>{failure ? failureMessages[failure] : "The secure desktop connection could not be completed."}</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry connection</button>
        </>
      )}
    </main>
  );
}

export default DesktopConnect;
