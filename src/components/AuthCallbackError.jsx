import React from 'react';

const clearLocalAuthState = () => {
  try {
    window.localStorage.removeItem('base44_access_token');
    window.localStorage.removeItem('token');
    window.sessionStorage.removeItem('base44_login_attempted');
  } catch (error) {
    console.error('Failed to clear local auth state:', error);
  }
};

export default function AuthCallbackError({ authError, hasToken, onRetry }) {
  const handleReset = () => {
    clearLocalAuthState();
    window.location.assign('/');
  };

  return (
    <div style={{ display: "flex", minHeight: "100vh", alignItems: "center", justifyContent: "center", background: "var(--bg-page)", padding: "0 24px" }}>
      <div style={{ width: "100%", maxWidth: 600, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2, padding: 32 }}>
        <div style={{ marginBottom: 24 }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, textTransform: "uppercase", letterSpacing: "0.25em", color: "var(--accent)", marginBottom: 10 }}>AUTH_CHECK_FAILED</p>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 20, fontWeight: 700, color: "var(--text-primary)", marginBottom: 8 }}>Login callback did not complete cleanly.</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", lineHeight: 1.6 }}>
            The app stopped the redirect loop. See debug info below.
          </p>
        </div>

        <div style={{ marginBottom: 20, background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 2, padding: "14px 16px", fontFamily: "var(--font-mono)", fontSize: 12 }}>
          <div style={{ marginBottom: 6 }}><span style={{ color: "var(--text-muted)" }}>AUTH_REASON: </span><span style={{ color: "var(--text-primary)" }}>{authError?.type || 'unknown'}</span></div>
          <div style={{ marginBottom: 6 }}><span style={{ color: "var(--text-muted)" }}>MESSAGE: </span><span style={{ color: "var(--text-primary)" }}>{authError?.message || 'No message returned'}</span></div>
          <div><span style={{ color: "var(--text-muted)" }}>TOKEN_PRESENT: </span><span style={{ color: hasToken ? "var(--accent)" : "var(--status-error)" }}>{hasToken ? 'YES' : 'NO'}</span></div>
        </div>

        <div style={{ marginBottom: 24, background: "var(--warning-muted)", border: "1px solid var(--warning-border)", borderRadius: 2, padding: "12px 16px", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.6, fontFamily: "var(--font-body)" }}>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>WHAT_THIS_MEANS</p>
          <p>If token says <strong style={{ color: "var(--text-primary)" }}>NO</strong> — the login page authenticated but didn't send a token back. If <strong style={{ color: "var(--text-primary)" }}>YES</strong> — the token was rejected by the backend or your user record needs attention.</p>
        </div>

        <div style={{ display: "flex", flexWrap: "wrap", gap: 10 }}>
          <button style={{ padding: "8px 18px", background: "var(--accent)", color: "#FFFFFF", border: "none", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }} onClick={onRetry}>
            TRY SIGN IN AGAIN
          </button>
          <button style={{ padding: "8px 18px", background: "transparent", color: "var(--text-muted)", border: "1px solid var(--border-default)", borderRadius: 2, fontFamily: "var(--font-mono)", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", cursor: "pointer" }} onClick={handleReset}>
            CLEAR LOCAL SESSION
          </button>
        </div>
      </div>
    </div>
  );
}
