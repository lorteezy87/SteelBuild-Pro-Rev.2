import { useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/lib/AuthContext";

/**
 * UpdatePassword — the set-new-password screen shown after a user follows the
 * emailed password-reset link (H22). AuthenticatedApp renders this at top
 * precedence after any required MFA challenge. On success we sign the user out and return
 * them to the sign-in screen to log in with the new credential.
 *
 * Standalone (no app chrome) because the user is mid-recovery, may have no org,
 * and must not enter project workflows while recovery is unfinished. This is
 * client workflow containment; Supabase recovery sessions are ordinary sessions.
 */
export default function UpdatePassword() {
  const { updatePassword, finishPasswordRecovery, passwordRecoveryPhase, isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState(null);
  const busyRef = useRef(false);
  const done = passwordRecoveryPhase === "updated";
  const unavailable = passwordRecoveryPhase === "unresolved" || !isAuthenticated;

  const finish = async () => {
    const result = await finishPasswordRecovery();
    if (result.success) navigate("/", { replace: true });
    else setError(result.error || "Sign-out did not complete. Please try again.");
  };

  const handleCancel = async () => {
    if (busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    setError(null);
    try { await finish(); } finally { busyRef.current = false; setBusy(false); }
  };

  const handleSubmit = async () => {
    if (busyRef.current) return;
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
    busyRef.current = true;
    try {
      const res = await updatePassword(password);
      if (res.success) {
        setPassword("");
        setConfirm("");
        await finish();
      } else setError(res.error || "Could not update your password.");
    } finally { busyRef.current = false; setBusy(false); }
  };

  const handlePasswordKeyDown = (event) => {
    if (event.key === "Enter") {
      event.preventDefault();
      void handleSubmit();
    }
  };

  return (
    <div style={wrap}>
      <div style={card} role="dialog" aria-modal="true" aria-label="Set a new password">
        <h1 style={title}>Set a new password</h1>
        {done || unavailable ? (
          <div style={{ display: "grid", gap: 16 }}>
            <p style={body}>
              {done
                ? "Your password has been updated. Finish signing out before signing in with your new password."
                : "This recovery session could not be confirmed. Sign out, then request a new password reset link."}
            </p>
            {error && <div style={errorBox} role="alert">{error}</div>}
            <button type="button" disabled={busy} style={primaryBtn} onClick={handleCancel}>
              {busy ? "Signing out…" : "Finish signing out"}
            </button>
          </div>
        ) : (
          <div style={{ display: "grid", gap: 14 }}>
            <p style={body}>Choose a new password for your account.</p>
            <div>
              <label htmlFor="new-password" style={label}>New password
              <input
                id="new-password"
                type="password"
                autoComplete="new-password"
                className="sbd-input"
                placeholder="At least 8 characters"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                onKeyDown={handlePasswordKeyDown}
                style={input}
              />
              </label>
            </div>
            <div>
              <label htmlFor="confirm-password" style={label}>Confirm new password
              <input
                id="confirm-password"
                type="password"
                autoComplete="new-password"
                className="sbd-input"
                placeholder="Re-enter your new password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                onKeyDown={handlePasswordKeyDown}
                style={input}
              />
              </label>
            </div>
            {error && <div style={errorBox} role="alert">{error}</div>}
            <button type="button" onClick={handleSubmit} disabled={busy} style={{ ...primaryBtn, opacity: busy ? 0.65 : 1, cursor: busy ? "not-allowed" : "pointer" }}>
              {busy ? "Updating…" : "Update password"}
            </button>
            <button type="button" disabled={busy} style={ghostBtn} onClick={handleCancel}>
              Cancel
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

const wrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "var(--bg-page)",
};
const card = {
  width: "100%",
  maxWidth: 420,
  padding: 32,
  borderRadius: 18,
  background: "var(--bg-surface)",
  border: "1px solid var(--border-default)",
  boxShadow: "var(--shadow-lg)",
};
const title = { color: "var(--text-primary)", margin: "0 0 6px", fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" };
const body = { color: "var(--text-muted)", margin: 0, fontSize: 14, lineHeight: 1.5 };
const label = { display: "block", marginBottom: 6, color: "var(--text-secondary)", fontSize: 13, fontWeight: 600 };
const input = { width: "100%", marginTop: 6 };
const errorBox = { padding: "10px 13px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 10, color: "var(--status-error)", fontSize: 13 };
const primaryBtn = { width: "100%", padding: "11px 16px", borderRadius: 10, border: 0, background: "var(--accent)", color: "var(--on-accent)", fontWeight: 800, fontSize: 15 };
const ghostBtn = { width: "100%", padding: "9px 16px", borderRadius: 10, border: "1px solid var(--border-default)", background: "transparent", color: "var(--text-muted)", fontWeight: 600, fontSize: 14, cursor: "pointer" };
