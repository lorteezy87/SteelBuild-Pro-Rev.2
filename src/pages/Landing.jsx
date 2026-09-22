/** Approved public marketing design with the existing account handlers. */
import React, { useState, useEffect } from "react";
import { SteelBuildMark } from "@/components/brand/SteelBuildMark";
import MarketingLanding from "@/components/landing/MarketingLanding";

const C = {
  // Dual-theme hex allowlist: public landing uses a fixed executive-light brand palette.
  base: "#F5F7FA",
  surface: "#FFFFFF",
  surfaceSoft: "#F8FAFC",
  ink: "#101827",
  navy: "#172033",
  body: "#536179",
  muted: "#8491A6",
  line: "#E2E8F0",
  line2: "#CBD5E1",
  amber: "#F5A800",
  amberDark: "#C47D00",
  blue: "#2563EB",
  green: "#059669",
  red: "#DC2626",
};

const F = {
  body: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  display: "'Inter', system-ui, -apple-system, BlinkMacSystemFont, sans-serif",
  mono: "'IBM Plex Mono', 'SFMono-Regular', Consolas, monospace",
};


const monoLabel = (extra = {}) => ({
  fontFamily: F.mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.14em",
  textTransform: "uppercase",
  color: C.muted,
  ...extra,
});

export default function Landing({ onLogin, onSignUp, onForgotPassword, isSubmitting, loginError }) {
  const [showLogin, setShowLogin] = useState(false);
  const [authMode, setAuthMode] = useState("signin"); // "signin" | "signup" | "forgot"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [fullName, setFullName] = useState("");
  const [signupBusy, setSignupBusy] = useState(false);
  const [signupError, setSignupError] = useState(null);
  const [termsAccepted, setTermsAccepted] = useState(false);
  const [signupNotice, setSignupNotice] = useState(null);
  const [forgotBusy, setForgotBusy] = useState(false);
  const [forgotError, setForgotError] = useState(null);
  const [forgotNotice, setForgotNotice] = useState(null);

  useEffect(() => {
    if (!showLogin) return undefined;
    const handler = (e) => { if (e.key === "Escape") setShowLogin(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [showLogin]);

  useEffect(() => {
    if (showLogin) {
      setSignupNotice(null);
      setSignupError(null);
    }
  }, [showLogin]);

  const openAuth = (mode) => {
    setAuthMode(mode);
    setSignupError(null);
    setSignupNotice(null);
    setForgotNotice(null);
    setForgotError(null);
    setShowLogin(true);
  };

  const handleLogin = async (e) => {
    e.preventDefault();
    if (!email.trim() || !password) return;
    await onLogin?.({ email: email.trim(), password });
  };

  const handleSignUp = async (e) => {
    e.preventDefault();
    setSignupError(null);
    if (!email.trim() || !password) return;
    if (!termsAccepted) {
      setSignupError("Please accept the Terms of Service and Privacy Policy to create an account.");
      return;
    }
    if (password.length < 8) {
      setSignupError("Use at least 8 characters for your password.");
      return;
    }
    setSignupBusy(true);
    const res = await onSignUp?.({
      email: email.trim(),
      password,
      fullName: fullName.trim() || undefined,
      termsAccepted: true,
    });
    setSignupBusy(false);
    if (res?.success) {
      if (res.needsConfirmation) {
        setSignupNotice(`We sent a confirmation link to ${email.trim()}. Click it to activate your account, then sign in.`);
      }
    } else if (res?.error) {
      setSignupError(res.error.message);
    }
  };

  const handleForgot = async (e) => {
    e.preventDefault();
    setForgotError(null);
    if (!email.trim()) return;
    setForgotBusy(true);
    const res = await onForgotPassword?.(email.trim());
    setForgotBusy(false);
    // Neutral confirmation regardless of whether the account exists — never
    // disclose account existence via this surface.
    if (!res || res.success) {
      setForgotNotice(`If an account exists for ${email.trim()}, we've sent a password reset link. Check your email.`);
    } else {
      setForgotError(res.error || "Could not send the reset email. Try again.");
    }
  };

  return (
    <div className="lp-page">
      <style>{` .lp-overlay, .lp-overlay h2 { font-family: ${F.body}; }        .lp-btn { appearance: none; border: 1px solid transparent; border-radius: 12px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 12px 22px; font-size: 14px; font-weight: 800; letter-spacing: -.01em; cursor: pointer; transition: transform .16s, box-shadow .16s, border-color .16s, background .16s, opacity .16s; }
        .lp-btn:hover { transform: translateY(-2px); }
        .lp-btn-primary { color: #1F1600; background: linear-gradient(180deg, #FFC94D, ${C.amber}); box-shadow: 0 12px 28px rgba(245,168,0,.28), inset 0 1px 0 rgba(255,255,255,.55); border-color: #E7A116; }
        .lp-btn-secondary { color: ${C.navy}; background: #FFFFFF; border-color: ${C.line2}; box-shadow: 0 10px 24px rgba(15,23,42,.08); }
        .lp-btn-secondary:hover { border-color: ${C.amber}; box-shadow: 0 14px 28px rgba(15,23,42,.11); }
        .lp-card { background: rgba(255,255,255,.86); border: 1px solid ${C.line}; border-radius: 24px; box-shadow: 0 18px 54px rgba(15,23,42,.08); }
        .lp-input { width: 100%; box-sizing: border-box; padding: 13px 14px; border: 1px solid ${C.line2}; border-radius: 12px; background: #FFFFFF; color: ${C.ink}; font-family: ${F.body}; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
        .lp-input:focus { border-color: ${C.amber}; box-shadow: 0 0 0 4px rgba(245,168,0,.16); }
        .lp-input::placeholder { color: ${C.muted}; }
        .lp-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(15,23,42,.56); backdrop-filter: blur(10px); overflow-y: auto; }
          .lp-btn:hover { transform: none !important; }`}</style>
      <MarketingLanding onStart={() => openAuth("signup")} onLogin={() => openAuth("signin")} />
      {showLogin && (
        <div className="lp-overlay" onClick={(e) => { if (e.target === e.currentTarget) setShowLogin(false); }}>
          <div role="dialog" aria-modal="true" aria-label={authMode === "signup" ? "Create account" : "Sign in"} className="lp-card" style={{ width: "100%", maxWidth: 438, padding: 32, borderRadius: 24, position: "relative", boxShadow: "0 34px 90px rgba(15,23,42,.28)" }}>
            <button onClick={() => setShowLogin(false)} aria-label="Close sign in" style={{ position: "absolute", top: 16, right: 16, border: 0, background: "var(--bg-surface-low)", color: C.body, borderRadius: 10, width: 34, height: 34, cursor: "pointer", fontSize: 18 }}>×</button>
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
              <SteelBuildMark tile size={54} title="SteelBuild-Pro" style={{ borderRadius: 14, display: "block" }} />
              <div><div style={{ color: C.ink, fontWeight: 950, fontSize: 20, letterSpacing: "-.045em" }}>SteelBuild-Pro</div><div style={{ color: C.muted, fontSize: 13 }}>Built for people who build</div></div>
            </div>
            {(signupNotice || forgotNotice) ? (
              <div style={{ display: "grid", gap: 18 }}>
                <div><h2 style={{ color: C.ink, margin: "0 0 8px", fontSize: 30, letterSpacing: "-.04em" }}>Check your email</h2><p style={{ color: C.body, margin: 0, lineHeight: 1.55, fontSize: 14 }}>{signupNotice || forgotNotice}</p></div>
                <button type="button" onClick={() => { setSignupNotice(null); setForgotNotice(null); setAuthMode("signin"); setPassword(""); }} className="lp-btn lp-btn-primary">Back to sign in</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 22 }}>
                  <h2 style={{ color: C.ink, margin: "0 0 6px", fontSize: 32, letterSpacing: "-.05em", fontWeight: 950 }}>{authMode === "signup" ? "Create your account" : authMode === "forgot" ? "Reset your password" : "Sign in"}</h2>
                  <p style={{ color: C.body, margin: 0, fontSize: 14 }}>{authMode === "signup" ? "Start a free workspace for your team." : authMode === "forgot" ? "Enter your account email and we'll send a reset link." : "Access your projects and modules."}</p>
                </div>
                <form onSubmit={authMode === "signup" ? handleSignUp : authMode === "forgot" ? handleForgot : handleLogin} style={{ display: "grid", gap: 15 }}>
                  {authMode === "signup" && <div><label htmlFor="auth-fullname" style={monoLabel({ display: "block", marginBottom: 6 })}>Full name</label><input id="auth-fullname" className="lp-input" type="text" autoComplete="name" placeholder="Jane Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>}
                  <div><label htmlFor="auth-email" style={monoLabel({ display: "block", marginBottom: 6 })}>Email</label><input id="auth-email" className="lp-input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  {authMode !== "forgot" && <div><label htmlFor="auth-password" style={monoLabel({ display: "block", marginBottom: 6 })}>Password</label><input id="auth-password" className="lp-input" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder={authMode === "signup" ? "At least 8 characters" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
                  {authMode === "signin" && <div style={{ textAlign: "right", marginTop: -6 }}><button type="button" onClick={() => { setAuthMode("forgot"); setForgotError(null); setForgotNotice(null); }} style={{ background: "none", border: 0, padding: 0, color: C.amberDark, fontWeight: 800, cursor: "pointer", font: "inherit", fontSize: 12.5 }}>Forgot password?</button></div>}
                  {(authMode === "signup" ? signupError : authMode === "forgot" ? forgotError : loginError) && <div style={{ padding: "10px 13px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 12, color: C.red, fontSize: 13 }} role="alert">{authMode === "signup" ? signupError : authMode === "forgot" ? forgotError : loginError}</div>}
                  {authMode === "signup" && (
                    <label htmlFor="auth-terms" style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12.5, color: C.body, lineHeight: 1.45, cursor: "pointer" }}>
                      <input
                        id="auth-terms"
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        style={{ marginTop: 2, accentColor: C.amberDark, width: 16, height: 16, flexShrink: 0 }}
                      />
                      <span>
                        I agree to the{" "}
                        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: C.amberDark, textDecoration: "none", fontWeight: 800 }}>Terms of Service</a>
                        {" "}and{" "}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: C.amberDark, textDecoration: "none", fontWeight: 800 }}>Privacy Policy</a>.
                      </span>
                    </label>
                  )}
                  <button type="submit" disabled={authMode === "signup" ? (signupBusy || !termsAccepted) : authMode === "forgot" ? forgotBusy : isSubmitting} className="lp-btn lp-btn-primary" style={{ width: "100%", opacity: (authMode === "signup" ? (signupBusy || !termsAccepted) : authMode === "forgot" ? forgotBusy : isSubmitting) ? .65 : 1, cursor: (authMode === "signup" ? (signupBusy || !termsAccepted) : authMode === "forgot" ? forgotBusy : isSubmitting) ? "not-allowed" : "pointer" }}>{authMode === "signup" ? (signupBusy ? "Creating account…" : "Create account") : authMode === "forgot" ? (forgotBusy ? "Sending…" : "Send reset link") : (isSubmitting ? "Signing in…" : "Sign in")}</button>
                </form>
                <div style={{ marginTop: 18, textAlign: "center", fontSize: 13.5, color: C.body }}>
                  {authMode === "signup" ? <>Already have an account? <button type="button" onClick={() => { setAuthMode("signin"); setSignupError(null); }} style={{ background: "none", border: 0, padding: 0, color: C.amberDark, fontWeight: 900, cursor: "pointer", font: "inherit" }}>Sign in</button></> : authMode === "forgot" ? <>Remembered it? <button type="button" onClick={() => { setAuthMode("signin"); setForgotError(null); }} style={{ background: "none", border: 0, padding: 0, color: C.amberDark, fontWeight: 900, cursor: "pointer", font: "inherit" }}>Back to sign in</button></> : <>New to SteelBuild Pro? <button type="button" onClick={() => { setAuthMode("signup"); setSignupError(null); }} style={{ background: "none", border: 0, padding: 0, color: C.amberDark, fontWeight: 900, cursor: "pointer", font: "inherit" }}>Create an account</button></>}
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
