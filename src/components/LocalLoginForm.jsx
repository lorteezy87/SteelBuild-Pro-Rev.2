import React, { useState } from 'react';

export default function LocalLoginForm({ onSubmit, isSubmitting, errorMessage }) {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    await onSubmit({ email: email.trim(), password });
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-page)", padding: "0 24px" }}>
      <div style={{ width: "100%", maxWidth: 420, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2, padding: 32 }}>
        <div style={{ marginBottom: 28 }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.25em", color: "var(--nc-accent-cyan)", marginBottom: 10 }}>LOCAL_DEV_LOGIN</p>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>SIGN_IN TO STEELBUILD_PRO</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Localhost sign-in handled directly to avoid the hosted callback flow.
          </p>
        </div>

        <form style={{ display: "flex", flexDirection: "column", gap: 16 }} onSubmit={handleSubmit}>
          <div>
            <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--text-muted)", marginBottom: 6 }}>EMAIL</label>
            <input
              autoComplete="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="you@company.com"
            />
          </div>

          <div>
            <label style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.15em", color: "var(--text-muted)", marginBottom: 6 }}>PASSWORD</label>
            <input
              autoComplete="current-password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Password"
            />
          </div>

          {errorMessage && (
            <div style={{ padding: "10px 14px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 2, fontFamily: "var(--font-body)", fontSize: 12, color: "var(--nc-accent-red)" }}>
              {errorMessage}
            </div>
          )}

          <button
            type="submit"
            disabled={isSubmitting}
            style={{ width: "100%", padding: "10px 0", background: "var(--nc-accent-orange)", color: "#FFFFFF", border: "none", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 11, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", cursor: isSubmitting ? "not-allowed" : "pointer", opacity: isSubmitting ? 0.6 : 1 }}
          >
            {isSubmitting ? 'SIGNING_IN...' : 'SIGN_IN →'}
          </button>
        </form>
      </div>
    </div>
  );
}
