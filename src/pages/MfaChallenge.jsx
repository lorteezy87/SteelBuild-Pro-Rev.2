import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
import { normalizeMfaCode, isMfaCodeReady } from "./mfa/mfaChallengeHelpers";
import {
  AUTH_FORM_WRAP_STYLE,
  authFormCardStyle,
  authFormTitleStyle,
  AUTH_FORM_BODY_STYLE,
  AUTH_FORM_LABEL_STYLE,
  AUTH_FORM_INPUT_STYLE,
  AUTH_FORM_ERROR_BOX_STYLE,
  AUTH_FORM_PRIMARY_BTN_STYLE,
  AUTH_FORM_GHOST_BTN_STYLE,
} from "./authFormChromeHelpers";

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

const card = authFormCardStyle(400);
const title = authFormTitleStyle(22);
const wrap = AUTH_FORM_WRAP_STYLE;
const body = AUTH_FORM_BODY_STYLE;
const label = AUTH_FORM_LABEL_STYLE;
const input = AUTH_FORM_INPUT_STYLE;
const errorBox = AUTH_FORM_ERROR_BOX_STYLE;
const primaryBtn = AUTH_FORM_PRIMARY_BTN_STYLE;
const ghostBtn = AUTH_FORM_GHOST_BTN_STYLE;
