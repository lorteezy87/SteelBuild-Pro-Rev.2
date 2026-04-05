import React from 'react';

const UserNotRegisteredError = () => {
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", background: "var(--bg-page)" }}>
      <div style={{ maxWidth: 480, width: "100%", padding: 32, background: "var(--bg-surface)", border: "1px solid var(--border-default)", borderRadius: 2 }}>
        <div style={{ textAlign: "center" }}>
          <div style={{ display: "inline-flex", alignItems: "center", justifyContent: "center", width: 56, height: 56, marginBottom: 20, borderRadius: "50%", background: "var(--warning-muted)", border: "1px solid var(--warning-border)" }}>
            <svg width="24" height="24" fill="none" stroke="var(--nc-accent-orange)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" viewBox="0 0 24 24">
              <path d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
          </div>
          <h1 style={{ fontFamily: "var(--font-mono)", fontSize: 18, fontWeight: 700, color: "var(--text-primary)", marginBottom: 12, textTransform: "uppercase", letterSpacing: "0.08em" }}>ACCESS_RESTRICTED</h1>
          <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", marginBottom: 24, lineHeight: 1.6 }}>
            You are not registered to use this application. Contact the app administrator to request access.
          </p>
          <div style={{ padding: "14px 16px", background: "var(--bg-surface-low)", border: "1px solid var(--border-default)", borderRadius: 2, textAlign: "left" }}>
            <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 8, textTransform: "uppercase", letterSpacing: "0.08em" }}>If you believe this is an error:</p>
            <ul style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", paddingLeft: 16, margin: 0, lineHeight: 1.8 }}>
              <li>Verify you are logged in with the correct account</li>
              <li>Contact the app administrator for access</li>
              <li>Try logging out and back in again</li>
            </ul>
          </div>
        </div>
      </div>
    </div>
  );
};

export default UserNotRegisteredError;
