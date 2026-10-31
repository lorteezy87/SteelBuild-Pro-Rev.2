/** Approved public marketing design with the existing account handlers. */
import React, { useState, useEffect } from "react";
import { Link } from "react-router-dom";
import { BrandLogo } from "@/components/nav/BrandLogo";
import MarketingLanding from "@/components/landing/MarketingLanding";
import { isStoreShell } from "@/lib/native/platform";
import { DC_FONT, DC_LIGHT, DC_SIGNAL } from "@/pages/documentControl/boardReportTheme";

// Public sign-in surface renders outside the app Layout, so it reads the
// Board Report constants directly (the same source the app-wide layer mirrors).
const C = {
  base: DC_LIGHT.pageBg,
  surface: DC_LIGHT.paneBg,
  surfaceSoft: DC_LIGHT.wellBg,
  ink: DC_LIGHT.text,
  body: DC_LIGHT.textSecondary,
  muted: DC_LIGHT.textMuted,
  line: DC_LIGHT.rowBorder,
  line2: DC_LIGHT.paneBorder,
  accent: DC_SIGNAL.accent,
  accentHi: DC_SIGNAL.accentLight,
  accentText: DC_SIGNAL.accentInk,
  onAccent: DC_SIGNAL.onAccent,
  red: DC_SIGNAL.redText,
};

const F = {
  body: DC_FONT.ui,
  display: DC_FONT.ui,
  mono: DC_FONT.mono,
};


const monoLabel = (extra = {}) => ({
  fontFamily: F.mono,
  fontSize: 10,
  fontWeight: 700,
  letterSpacing: "0.06em",
  textTransform: "uppercase",
  color: C.muted,
  ...extra,
});

export default function Landing({ onLogin, onSignUp, onForgotPassword, isSubmitting, loginError }) {
  // The native App Store shell is sign-in only. Account creation and billing
  // remain on the web, so native users never enter the marketing/pricing flow.
  const native = isStoreShell();
  const [showLogin, setShowLogin] = useState(native);
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
    if (!showLogin || native) return undefined;
    const handler = (e) => { if (e.key === "Escape") setShowLogin(false); };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [native, showLogin]);

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
      <style>{` .lp-overlay, .lp-overlay h2 { font-family: ${F.body}; }        .lp-btn { appearance: none; border: 1px solid transparent; border-radius: 6px; display: inline-flex; align-items: center; justify-content: center; gap: 8px; min-height: 44px; padding: 12px 22px; font-size: 14px; font-weight: 600; cursor: pointer; transition: border-color .16s, background .16s, opacity .16s; }
        .lp-btn-primary { color: ${C.onAccent}; background: ${C.accent}; border-color: ${C.accent}; }
        .lp-btn-primary:hover { background: ${C.accentHi}; }
        .lp-btn-secondary { color: ${C.ink}; background: ${C.surface}; border-color: ${C.line2}; }
        .lp-btn-secondary:hover { border-color: ${C.ink}; }
        .lp-card { background: ${C.surface}; border: 1px solid ${C.line2}; border-radius: 8px; }
        .lp-input { width: 100%; box-sizing: border-box; padding: 13px 14px; border: 1px solid ${C.line2}; border-radius: 6px; background: ${C.surface}; color: ${C.ink}; font-family: ${F.body}; font-size: 14px; outline: none; transition: border-color .15s, box-shadow .15s; }
        .lp-input:focus { border-color: ${C.ink}; box-shadow: 0 0 0 2px ${C.accent}; }
        .lp-input::placeholder { color: ${C.muted}; }
        .lp-overlay { position: fixed; inset: 0; z-index: 100; display: flex; align-items: center; justify-content: center; padding: 20px; background: rgba(12,15,18,.55); overflow-y: auto; }
`}</style>
      {!native && <MarketingLanding onStart={() => openAuth("signup")} onLogin={() => openAuth("signin")} />}
      {showLogin && (
        <div className="lp-overlay" style={native ? { background: C.base, backdropFilter: "none", paddingTop: "calc(20px + env(safe-area-inset-top, 0px))", paddingBottom: "calc(20px + env(safe-area-inset-bottom, 0px))" } : undefined} onClick={(e) => { if (!native && e.target === e.currentTarget) setShowLogin(false); }}>
          <div role="dialog" aria-modal="true" aria-label={authMode === "signup" ? "Create account" : "Sign in"} className="lp-card" style={{ width: "100%", maxWidth: 438, padding: 32, borderRadius: 8, position: "relative", boxShadow: "0 24px 60px rgba(0,0,0,.35)" }}>
            {!native && <button onClick={() => setShowLogin(false)} aria-label="Close sign in" style={{ position: "absolute", top: 16, right: 16, border: 0, background: C.surfaceSoft, color: C.body, borderRadius: 6, width: 34, height: 34, cursor: "pointer", fontSize: 18 }}>×</button>}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 22 }}>
              <BrandLogo height={78} title="SteelBuild Pro" />
              <div style={{ color: C.muted, fontSize: 13 }}>Built for people who build</div>
            </div>
            {(signupNotice || forgotNotice) ? (
              <div style={{ display: "grid", gap: 18 }}>
                <div><h2 style={{ color: C.ink, margin: "0 0 8px", fontSize: 30, fontStretch: "85%", letterSpacing: "-.01em" }}>Check your email</h2><p style={{ color: C.body, margin: 0, lineHeight: 1.55, fontSize: 14 }}>{signupNotice || forgotNotice}</p></div>
                <button type="button" onClick={() => { setSignupNotice(null); setForgotNotice(null); setAuthMode("signin"); setPassword(""); }} className="lp-btn lp-btn-primary">Back to sign in</button>
              </div>
            ) : (
              <>
                <div style={{ marginBottom: 22 }}>
                  <h2 style={{ color: C.ink, margin: "0 0 6px", fontSize: 32, fontStretch: "85%", letterSpacing: "-.01em", fontWeight: 800 }}>{authMode === "signup" ? "Create your account" : authMode === "forgot" ? "Reset your password" : "Sign in"}</h2>
                  <p style={{ color: C.body, margin: 0, fontSize: 14 }}>{authMode === "signup" ? "Start a free workspace for your team." : authMode === "forgot" ? "Enter your account email and we'll send a reset link." : "Access your projects and modules."}</p>
                </div>
                <form onSubmit={authMode === "signup" ? handleSignUp : authMode === "forgot" ? handleForgot : handleLogin} style={{ display: "grid", gap: 15 }}>
                  {authMode === "signup" && <div><label htmlFor="auth-fullname" style={monoLabel({ display: "block", marginBottom: 6 })}>Full name</label><input id="auth-fullname" className="lp-input" type="text" autoComplete="name" placeholder="Jane Smith" value={fullName} onChange={(e) => setFullName(e.target.value)} /></div>}
                  <div><label htmlFor="auth-email" style={monoLabel({ display: "block", marginBottom: 6 })}>Email</label><input id="auth-email" className="lp-input" type="email" autoComplete="email" placeholder="you@company.com" value={email} onChange={(e) => setEmail(e.target.value)} /></div>
                  {authMode !== "forgot" && <div><label htmlFor="auth-password" style={monoLabel({ display: "block", marginBottom: 6 })}>Password</label><input id="auth-password" className="lp-input" type="password" autoComplete={authMode === "signup" ? "new-password" : "current-password"} placeholder={authMode === "signup" ? "At least 8 characters" : "Password"} value={password} onChange={(e) => setPassword(e.target.value)} /></div>}
                  {authMode === "signin" && <div style={{ textAlign: "right", marginTop: -6 }}><button type="button" onClick={() => { setAuthMode("forgot"); setForgotError(null); setForgotNotice(null); }} style={{ background: "none", border: 0, padding: 0, color: C.accentText, fontWeight: 800, cursor: "pointer", font: "inherit", fontSize: 12.5 }}>Forgot password?</button></div>}
                  {(authMode === "signup" ? signupError : authMode === "forgot" ? forgotError : loginError) && <div style={{ padding: "10px 13px", background: "var(--danger-muted)", border: "1px solid var(--danger-border)", borderRadius: 6, color: C.red, fontSize: 13 }} role="alert">{authMode === "signup" ? signupError : authMode === "forgot" ? forgotError : loginError}</div>}
                  {authMode === "signup" && (
                    <label htmlFor="auth-terms" style={{ display: "flex", alignItems: "flex-start", gap: 10, fontSize: 12.5, color: C.body, lineHeight: 1.45, cursor: "pointer" }}>
                      <input
                        id="auth-terms"
                        type="checkbox"
                        checked={termsAccepted}
                        onChange={(e) => setTermsAccepted(e.target.checked)}
                        style={{ marginTop: 2, accentColor: C.accentText, width: 16, height: 16, flexShrink: 0 }}
                      />
                      <span>
                        I agree to the{" "}
                        <a href="/terms" target="_blank" rel="noopener noreferrer" style={{ color: C.accentText, textDecoration: "none", fontWeight: 800 }}>Terms of Service</a>
                        {" "}and{" "}
                        <a href="/privacy" target="_blank" rel="noopener noreferrer" style={{ color: C.accentText, textDecoration: "none", fontWeight: 800 }}>Privacy Policy</a>.
                      </span>
                    </label>
                  )}
                  <button type="submit" disabled={authMode === "signup" ? (signupBusy || !termsAccepted) : authMode === "forgot" ? forgotBusy : isSubmitting} className="lp-btn lp-btn-primary" style={{ width: "100%", opacity: (authMode === "signup" ? (signupBusy || !termsAccepted) : authMode === "forgot" ? forgotBusy : isSubmitting) ? .65 : 1, cursor: (authMode === "signup" ? (signupBusy || !termsAccepted) : authMode === "forgot" ? forgotBusy : isSubmitting) ? "not-allowed" : "pointer" }}>{authMode === "signup" ? (signupBusy ? "Creating account…" : "Create account") : authMode === "forgot" ? (forgotBusy ? "Sending…" : "Send reset link") : (isSubmitting ? "Signing in…" : "Sign in")}</button>
                </form>
                <div style={{ marginTop: 18, textAlign: "center", fontSize: 13.5, color: C.body }}>
                  {authMode === "signup" ? <>Already have an account? <button type="button" onClick={() => { setAuthMode("signin"); setSignupError(null); }} style={{ background: "none", border: 0, padding: 0, color: C.accentText, fontWeight: 700, cursor: "pointer", font: "inherit" }}>Sign in</button></> : authMode === "forgot" ? <>Remembered it? <button type="button" onClick={() => { setAuthMode("signin"); setForgotError(null); }} style={{ background: "none", border: 0, padding: 0, color: C.accentText, fontWeight: 700, cursor: "pointer", font: "inherit" }}>Back to sign in</button></> : native ? null : <>New to SteelBuild Pro? <button type="button" onClick={() => { setAuthMode("signup"); setSignupError(null); }} style={{ background: "none", border: 0, padding: 0, color: C.accentText, fontWeight: 700, cursor: "pointer", font: "inherit" }}>Create an account</button></>}
                </div>
              </>
            )}
            {/* The native app has no signup screen, where the legal links
                otherwise live, and Apple requires the privacy policy to be
                reachable in the app (guideline 5.1.1). Router links, not
                target="_blank": the iOS shell drops new-window navigations. */}
            {native && (
              <nav aria-label="Legal" style={{ marginTop: 18, display: "flex", justifyContent: "center", gap: 16, fontSize: 12.5 }}>
                <Link to="/privacy" style={{ color: C.accentText, textDecoration: "none", fontWeight: 800 }}>Privacy Policy</Link>
                <Link to="/terms" style={{ color: C.accentText, textDecoration: "none", fontWeight: 800 }}>Terms of Service</Link>
              </nav>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
