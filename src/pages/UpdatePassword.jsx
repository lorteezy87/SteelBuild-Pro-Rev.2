import { useState } from "react";
import { useAuth } from "@/lib/AuthContext";

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

const wrap = {
  minHeight: "100vh",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
  padding: 20,
  background: "#0B1220",
};
const card = {
  width: "100%",
  maxWidth: 420,
  padding: 32,
  borderRadius: 18,
  background: "#111A2B",
  border: "1px solid #23324B",
  boxShadow: "0 30px 80px rgba(0,0,0,.45)",
};
const title = { color: "#F1F5F9", margin: "0 0 6px", fontSize: 24, fontWeight: 800, letterSpacing: "-.02em" };
const body = { color: "#94A3B8", margin: 0, fontSize: 14, lineHeight: 1.5 };
const label = { display: "block", marginBottom: 6, color: "#CBD5E1", fontSize: 13, fontWeight: 600 };
const input = { width: "100%" };
const errorBox = { padding: "10px 13px", background: "#3F1D1D", border: "1px solid #7F1D1D", borderRadius: 10, color: "#FCA5A5", fontSize: 13 };
const primaryBtn = { width: "100%", padding: "11px 16px", borderRadius: 10, border: 0, background: "#F2A706", color: "#111", fontWeight: 800, fontSize: 15 };
const ghostBtn = { width: "100%", padding: "9px 16px", borderRadius: 10, border: "1px solid #23324B", background: "transparent", color: "#94A3B8", fontWeight: 600, fontSize: 14, cursor: "pointer" };
