import { FormEvent, useState } from "react";

import {
  DesktopConnectShell,
  desktopConnectErrorBox,
  desktopConnectLabel,
} from "@/components/desktopConnect/DesktopConnectShell";

interface DesktopConnectSignInProps {
  onLogin: (creds: { email: string; password: string }) => Promise<unknown>;
  isSubmitting?: boolean;
  loginError?: string | null;
}

/**
 * Focused sign-in for /DesktopConnect when the system browser has no session.
 * Marketing Landing hid the handoff behind a generic homepage and made
 * "I'm already signed in elsewhere" look like a successful connect.
 */
export default function DesktopConnectSignIn({
  onLogin,
  isSubmitting = false,
  loginError = null,
}: DesktopConnectSignInProps) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password || isSubmitting || submitting) return;
    setSubmitting(true);
    try {
      await onLogin({ email: email.trim(), password });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = isSubmitting || submitting;

  return (
    <DesktopConnectShell
      title="Sign in to connect"
      subtitle="This browser tab must be signed in to SteelBuild. Being signed in on another browser, profile, or tab does not complete the desktop handoff."
      footer="Your credentials stay in this browser. Desktop Command Center receives only a one-time encrypted handoff code."
    >
      <form onSubmit={handleSubmit} style={{ display: "grid", gap: 16 }}>
        <div>
          <label htmlFor="desktop-connect-email" style={desktopConnectLabel}>
            Work email
          </label>
          <input
            id="desktop-connect-email"
            type="email"
            autoComplete="username"
            className="sbd-input"
            placeholder="you@company.com"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            required
            disabled={busy}
            style={{ width: "100%" }}
          />
        </div>
        <div>
          <label htmlFor="desktop-connect-password" style={desktopConnectLabel}>
            Password
          </label>
          <input
            id="desktop-connect-password"
            type="password"
            autoComplete="current-password"
            className="sbd-input"
            placeholder="Password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            required
            disabled={busy}
            style={{ width: "100%" }}
          />
        </div>
        {loginError ? (
          <div role="alert" style={desktopConnectErrorBox}>
            {loginError}
          </div>
        ) : null}
        <button
          type="submit"
          className="sbd-btn sbd-btn-primary"
          disabled={busy}
          style={{ width: "100%", justifyContent: "center", minHeight: 44, fontSize: 14 }}
        >
          {busy ? "Signing in…" : "Sign in and continue"}
        </button>
      </form>
    </DesktopConnectShell>
  );
}
