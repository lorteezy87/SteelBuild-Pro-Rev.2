import { type FormEvent, useState } from "react";
import { SteelBuildMark } from "@/components/brand/SteelBuildMark";

type NativeSignInProps = {
  onLogin?: (credentials: { email: string; password: string }) => Promise<unknown>;
  onForgotPassword?: (email: string) => Promise<{ success: boolean; error?: string }>;
  isSubmitting?: boolean;
  loginError?: string | null;
};

export default function NativeSignIn({
  onLogin,
  onForgotPassword,
  isSubmitting = false,
  loginError,
}: NativeSignInProps) {
  const [mode, setMode] = useState<"signin" | "forgot">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState<string | null>(null);
  const [forgotNotice, setForgotNotice] = useState<string | null>(null);

  const handleLogin = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail || !password) return;
    await onLogin?.({ email: trimmedEmail, password });
  };

  const handleForgot = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const trimmedEmail = email.trim();
    if (!trimmedEmail) return;
    setForgotBusy(true);
    setForgotError(null);
    const result = await onForgotPassword?.(trimmedEmail);
    setForgotBusy(false);
    if (!result || result.success) {
      setForgotNotice(`If an account exists for ${trimmedEmail}, we've sent a password reset link. Check your email.`);
      return;
    }
    setForgotError(result.error || "Could not send the reset email. Try again.");
  };

  const error = mode === "forgot" ? forgotError : loginError;

  return (
    <main
      style={{
        minHeight: "100dvh",
        display: "grid",
        placeItems: "center",
        padding: "max(24px, env(safe-area-inset-top)) 20px max(24px, env(safe-area-inset-bottom))",
        background: "var(--bg-page, #0b0e11)",
        color: "var(--text-primary, #f8fafc)",
      }}
    >
      <section
        aria-label="SteelBuild Pro account access"
        style={{
          width: "min(100%, 430px)",
          padding: 28,
          border: "1px solid var(--border-default, #334155)",
          borderRadius: 20,
          background: "var(--bg-surface, #121820)",
          boxShadow: "0 24px 70px rgba(0, 0, 0, .35)",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14, marginBottom: 24 }}>
          <SteelBuildMark tile size={56} title="SteelBuild Pro" style={{ borderRadius: 14, display: "block" }} />
          <div>
            <div style={{ fontSize: 20, fontWeight: 800 }}>SteelBuild Pro</div>
            <div style={{ marginTop: 3, color: "var(--text-muted, #94a3b8)", fontSize: 13 }}>
              Built for people who build
            </div>
          </div>
        </div>

        {forgotNotice ? (
          <div style={{ display: "grid", gap: 18 }}>
            <div>
              <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>Check your email</h1>
              <p style={{ margin: 0, color: "var(--text-muted, #94a3b8)", lineHeight: 1.55 }}>{forgotNotice}</p>
            </div>
            <button
              type="button"
              className="sbd-btn sbd-btn-primary"
              onClick={() => { setForgotNotice(null); setMode("signin"); setPassword(""); }}
            >
              Back to sign in
            </button>
          </div>
        ) : (
          <>
            <h1 style={{ margin: "0 0 8px", fontSize: 28 }}>
              {mode === "signin" ? "Sign in to SteelBuild Pro" : "Reset your password"}
            </h1>
            <p style={{ margin: "0 0 22px", color: "var(--text-muted, #94a3b8)", lineHeight: 1.5 }}>
              {mode === "signin"
                ? "Use the account your company created on steelbuild-pro.com."
                : "Enter your account email and we'll send a reset link."}
            </p>

            <form onSubmit={mode === "signin" ? handleLogin : handleForgot} style={{ display: "grid", gap: 15 }}>
              <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 700 }}>
                Email
                <input
                  type="email"
                  autoComplete="email"
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  style={{ minHeight: 48, borderRadius: 10, border: "1px solid var(--border-default, #334155)", padding: "0 13px", background: "var(--bg-input, #0f141b)", color: "inherit", font: "inherit" }}
                />
              </label>

              {mode === "signin" && (
                <label style={{ display: "grid", gap: 7, fontSize: 13, fontWeight: 700 }}>
                  Password
                  <input
                    type="password"
                    autoComplete="current-password"
                    value={password}
                    onChange={(event) => setPassword(event.target.value)}
                    style={{ minHeight: 48, borderRadius: 10, border: "1px solid var(--border-default, #334155)", padding: "0 13px", background: "var(--bg-input, #0f141b)", color: "inherit", font: "inherit" }}
                  />
                </label>
              )}

              {error && (
                <div role="alert" style={{ color: "var(--danger-text, #fecaca)", fontSize: 13, lineHeight: 1.45 }}>
                  {error}
                </div>
              )}

              <button
                type="submit"
                className="sbd-btn sbd-btn-primary"
                disabled={mode === "signin" ? isSubmitting : forgotBusy}
                style={{ minHeight: 48 }}
              >
                {mode === "signin"
                  ? (isSubmitting ? "Signing in…" : "Sign in")
                  : (forgotBusy ? "Sending…" : "Send reset link")}
              </button>
            </form>

            <button
              type="button"
              className="sbd-btn sbd-btn-ghost"
              onClick={() => {
                setMode(mode === "signin" ? "forgot" : "signin");
                setForgotError(null);
              }}
              style={{ width: "100%", minHeight: 44, marginTop: 10 }}
            >
              {mode === "signin" ? "Forgot password?" : "Back to sign in"}
            </button>
          </>
        )}
      </section>
    </main>
  );
}
