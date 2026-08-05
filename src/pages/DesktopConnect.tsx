import { useEffect, useState } from "react";

import {
  DesktopConnectShell,
  DesktopConnectSpinner,
  desktopConnectBody,
  desktopConnectErrorBox,
} from "@/components/desktopConnect/DesktopConnectShell";
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
import { desktopConnectFailureMessage, classifyQueryFailure, resolveDesktopConnectSearch } from "./desktopConnect/desktopConnectPageHelpers";

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
  /** When omitted, each attempt reads window.location.search (supports Retry). */
  search?: string;
  parseQuery?: (search: string) => DesktopConnectQuery;
}

type DesktopConnectFailure =
  | "query"
  | "query-empty"
  | "query-missing"
  | "session"
  | `session-${DesktopSessionValidationField}`
  | "crypto"
  | `crypto-${DesktopSessionCryptoStage}`
  | "handoff";

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

export { resolveDesktopConnectSearch };

export function DesktopConnect({
  dependencies = defaultDependencies,
  search,
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
        const activeSearch = resolveDesktopConnectSearch(search);
        const query = parseQuery(activeSearch);
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
            failureStage === "query"
              ? classifyQueryFailure(error)
              : failureStage === "crypto" && error instanceof DesktopSessionValidationError
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

  if (status === "connecting") {
    return (
      <DesktopConnectShell
        title="Connect SteelBuild"
        subtitle="Connecting securely to Desktop Command Center. Sign in in this tab if prompted."
      >
        <DesktopConnectSpinner label="Connecting securely…" />
      </DesktopConnectShell>
    );
  }

  if (status === "returning") {
    return (
      <DesktopConnectShell
        title="Handoff ready"
        subtitle="If Desktop Command Center is still waiting, click the button below and allow the app to open."
        footer="This link is one-time and expires quickly. It never contains your password or refresh token."
      >
        {callbackUrl ? (
          <a
            href={callbackUrl}
            className="sbd-btn sbd-btn-primary"
            style={{
              display: "inline-flex",
              width: "100%",
              justifyContent: "center",
              minHeight: 44,
              fontSize: 14,
              textDecoration: "none",
            }}
          >
            Open Desktop Command Center
          </a>
        ) : null}
      </DesktopConnectShell>
    );
  }

  return (
    <DesktopConnectShell
      title="Connection failed"
      subtitle="The secure desktop connection could not be completed."
    >
      <div role="alert" style={{ ...desktopConnectErrorBox, marginBottom: 18 }}>
        {failure ? desktopConnectFailureMessage(failure) : "The secure desktop connection could not be completed."}
      </div>
      <button
        type="button"
        className="sbd-btn sbd-btn-primary"
        onClick={() => setAttempt((value) => value + 1)}
        style={{ width: "100%", justifyContent: "center", minHeight: 44, fontSize: 14 }}
      >
        Retry connection
      </button>
      <p style={{ ...desktopConnectBody, margin: "16px 0 0" }}>
        Sign in to SteelBuild in this browser tab before retrying. Close this tab and start again from Desktop Command Center if the problem persists.
      </p>
    </DesktopConnectShell>
  );
}

export default DesktopConnect;
