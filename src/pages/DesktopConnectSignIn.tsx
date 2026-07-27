import { FormEvent, useState } from "react";

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

  const handleSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!email.trim() || !password) return;
    await onLogin({ email: email.trim(), password });
  };

  return (
    <main
      style={{
        minHeight: "100vh",
        display: "grid",
        placeItems: "center",
        padding: 24,
        background: "#F5F7FA",
        fontFamily: "Inter, system-ui, sans-serif",
        color: "#101827",
      }}
    >
      <section
        style={{
          width: "100%",
          maxWidth: 440,
          background: "#fff",
          border: "1px solid #E2E8F0",
          borderRadius: 16,
          padding: 32,
          boxShadow: "0 12px 40px rgba(16, 24, 39, 0.08)",
        }}
      >
        <p style={{ letterSpacing: "0.08em", textTransform: "uppercase", color: "#8491A6", margin: 0 }}>
          Desktop Command Center
        </p>
        <h1 style={{ margin: "12px 0 8px", fontSize: 28, lineHeight: 1.2 }}>
          Sign in to connect SteelBuild
        </h1>
        <p style={{ margin: "0 0 24px", color: "#536179", lineHeight: 1.5 }}>
          This browser tab must be signed in. Being signed in on another browser,
          profile, or SteelBuild tab does not complete the desktop handoff.
        </p>
        <form onSubmit={handleSubmit} style={{ display: "grid", gap: 14 }}>
          <label style={{ display: "grid", gap: 6, fontSize: 14, fontWeight: 600 }}>
            Work email
            <input
              type="email"
              autoComplete="username"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #CBD5E1",
                fontSize: 16,
              }}
            />
          </label>
          <label style={{ display: "grid", gap: 6, fontSize: 14, fontWeight: 600 }}>
            Password
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              required
              style={{
                padding: "12px 14px",
                borderRadius: 10,
                border: "1px solid #CBD5E1",
                fontSize: 16,
              }}
            />
          </label>
          {loginError ? (
            <p role="alert" style={{ margin: 0, color: "#DC2626", fontSize: 14 }}>
              {loginError}
            </p>
          ) : null}
          <button
            type="submit"
            disabled={isSubmitting}
            style={{
              marginTop: 8,
              padding: "12px 16px",
              border: 0,
              borderRadius: 10,
              background: "#2563EB",
              color: "#fff",
              fontWeight: 700,
              fontSize: 16,
              cursor: isSubmitting ? "wait" : "pointer",
            }}
          >
            {isSubmitting ? "Signing in…" : "Sign in and continue"}
          </button>
        </form>
      </section>
    </main>
  );
}
