import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { normalizeMfaCode, isMfaCodeReady } from "./mfa/mfaChallengeHelpers";

/**
 * MfaChallenge — the login step-up screen (H23). Shown at top precedence by
 * AuthenticatedApp whenever the session is aal1 but the account has a verified
 * TOTP factor. The user enters the current 6-digit code; on success the session
 * upgrades to aal2, `mfaRequired` clears, and the app renders.
 *
 * Standalone (no app chrome) — the user has not completed authentication yet.
 */
export default function MfaChallenge() {
  const { completeMfaChallenge, logout } = useAuth();
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    const clean = normalizeMfaCode(code);
    if (!isMfaCodeReady(code)) {
      setError("Enter the 6-digit code from your authenticator app.");
      return;
    }
    setBusy(true);
    const res = await completeMfaChallenge(clean);
    setBusy(false);
    if (!res.success) {
      setError(res.error || "That code was not accepted. Try again.");
      setCode("");
    }
    // On success, mfaRequired flips to false and this screen unmounts.
  };

  return (
    <div style={wrap}>
      <div style={card} role="dialog" aria-modal="true" aria-label="Two-factor verification">
        <h1 style={title}>Two-factor verification</h1>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <p style={body}>Enter the 6-digit code from your authenticator app to finish signing in.</p>
          <div>
            <label htmlFor="mfa-code" style={label}>Authentication code</label>
            <input
              id="mfa-code"
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              className="sbd-input"
              placeholder="123456"
              value={code}
              onChange={(e) => setCode(e.target.value)}
              maxLength={7}
              autoFocus
              style={{ ...input, letterSpacing: "0.3em", fontSize: 20, textAlign: "center" }}
            />
          </div>
          {error && <div style={errorBox} role="alert">{error}</div>}
          <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.65 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
            {busy ? "Verifying…" : "Verify"}
          </button>
          <button type="button" style={ghostBtn} onClick={() => { logout(); }}>
            Sign out
          </button>
        </form>
      </div>
    </div>
  );
}

const wrap = { minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, background: "var(--bg-page)" };
const card = { width: "100%", maxWidth: 400, padding: 32, borderRadius: 18, background: "var(--bg-surface)", border: "1px solid var(--border-default)", boxShadow: "var(--shadow-lg)" };
const title = { color: "var(--text-primary)", margin: "0 0 6px", fontSize: 22, fontWeight: 800, letterSpacing: "-.02em" };
const body = { color: "var(--text-muted)", margin: 0, fontSize: 14, lineHeight: 1.5 };
const label = { display: "block", marginBottom: 6, color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 };
const input = { width: "100%" };
const errorBox = { padding: "10px 13px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 10, color: "var(--status-error)", fontSize: 13 };
const primaryBtn = { width: "100%", padding: "11px 16px", borderRadius: 10, border: 0, background: "var(--accent)", color: "var(--on-accent)", fontWeight: 800, fontSize: 15 };
const ghostBtn = { width: "100%", padding: "9px 16px", borderRadius: 10, border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 14, cursor: "pointer" };
