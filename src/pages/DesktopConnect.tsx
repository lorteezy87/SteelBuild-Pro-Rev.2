import { useEffect, useState } from "react";

import { supabase } from "@/lib/supabase";
import {
  DESKTOP_SESSION_ALGORITHM,
  buildDesktopCallbackUrl,
  encryptDesktopSession,
  parseDesktopConnectQuery,
  type DesktopConnectQuery,
  type DesktopEncryptedSession,
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
  redirect(url: string): void;
}

interface DesktopConnectProps {
  dependencies?: DesktopConnectDependencies;
  search?: string;
  parseQuery?: (search: string) => DesktopConnectQuery;
}

const defaultDependencies: DesktopConnectDependencies = {
  async getSession() {
    const { data, error } = await supabase.auth.getSession();
    if (error) throw error;
    return data.session as BrowserSession | null;
  },
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

  useEffect(() => {
    let active = true;
    setStatus("connecting");

    void (async () => {
      try {
        const query = parseQuery(search);
        const browserSession = await dependencies.getSession();
        if (!browserSession?.expires_at || !browserSession.user.email) {
          throw new Error("Authenticated SteelBuild session is unavailable");
        }
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
        const handoff = await dependencies.createHandoff({
          state: query.state,
          codeChallenge: query.challenge,
          encryptedSession,
        });
        const callback = buildDesktopCallbackUrl({ code: handoff.code, state: query.state });
        if (!active) return;
        setStatus("returning");
        dependencies.redirect(callback);
      } catch {
        if (active) setStatus("error");
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
      {status === "connecting" && <p>Connecting securely to the desktop application…</p>}
      {status === "returning" && <p>Connected. Returning to Desktop Command Center…</p>}
      {status === "error" && (
        <>
          <p>The secure desktop connection could not be completed. The request may have expired.</p>
          <button type="button" onClick={() => setAttempt((value) => value + 1)}>Retry connection</button>
        </>
      )}
    </main>
  );
}

export default DesktopConnect;
