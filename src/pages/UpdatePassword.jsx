import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";
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
 * UpdatePassword — the set-new-password screen shown after a user follows the
 * emailed password-reset link (H22). AuthenticatedApp renders this at top
 * precedence whenever `isPasswordRecovery` is true, so the recovery session is
 * used only to set a new password. On success we sign the user out and return
 * them to the sign-in screen to log in with the new credential.
 *
 * Standalone (no app chrome) because the user is mid-recovery, may have no org,
 * and must not touch tenant data with a recovery-scoped session.
 */
export default function UpdatePassword() {
  const { updatePassword, logout } = useAuth();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const [done, setDone] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters for your new password.");
      return;
    }
    if (password !== confirm) {
      setError("The passwords do not match.");
      return;
    }
    setBusy(true);
    const res = await updatePassword(password);
    setBusy(false);
    if (res.success) {
      setDone(true);
      // Drop the recovery session so the next screen is a clean sign-in.
      try { await logout(); } catch { /* best-effort */ }
    } else {
      setError(res.error || "Could not update your password.");
    }
  };

  return (
    <div style={wrap}>
      <div style={card} role="dialog" aria-modal="true" aria-label="Set a new password">
        <h1 style={title}>Set a new password</h1>
        {done ? (
          <div style={{ display: "grid", gap: 16 }}>
            <p style={body}>
              Your password has been updated. You can now sign in with your new password.
            </p>
            <button type="button" style={primaryBtn} onClick={() => { window.location.href = "/"; }}>
              Back to sign in
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
            <p style={body}>Choose a new password for your account.</p>
            <div>
              <label htmlFor="new-password" style={label}>New password</label>
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                className="sbd-input"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                style={input}
              />
            </div>
            <div>
              <label htmlFor="confirm-password" style={label}>Confirm new password</label>
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                className="sbd-input"
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                style={input}
              />
            </div>
            {error && <div style={errorBox} role="alert">{error}</div>}
            <button type="submit" disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.65 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
              {busy ? "Updating…" : "Update password"}
            </button>
            <button type="button" style={ghostBtn} onClick={() => { window.location.href = "/"; }}>
              Cancel
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

const wrap = AUTH_FORM_WRAP_STYLE;
const card = authFormCardStyle(420);
const title = authFormTitleStyle(24);
const body = AUTH_FORM_BODY_STYLE;
const label = AUTH_FORM_LABEL_STYLE;
const input = AUTH_FORM_INPUT_STYLE;
const errorBox = AUTH_FORM_ERROR_BOX_STYLE;
const primaryBtn = AUTH_FORM_PRIMARY_BTN_STYLE;
const ghostBtn = AUTH_FORM_GHOST_BTN_STYLE;
