/**
 * BluebeamCallback.jsx — OAuth redirect handler for Bluebeam Max.
 *
 * Bluebeam redirects here after the user authorizes. This page:
 *   1. Extracts the authorization code from the URL
 *   2. Posts it back to the opener window via postMessage
 *   3. Closes itself (popup flow) or shows a success message (redirect flow)
 *
 * Route: /bluebeam/callback (or wherever BLUEBEAM_REDIRECT_URI points)
 */

import React, { useEffect, useState } from "react";

export default function BluebeamCallback() {
  const [status, setStatus] = useState("processing");
  const [message, setMessage] = useState("Completing Bluebeam authorization…");

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const code = params.get("code");
    const state = params.get("state");
    const error = params.get("error");
    const errorDescription = params.get("error_description");

    if (error) {
      setStatus("error");
      setMessage(errorDescription || error || "Authorization was denied.");

      // Notify opener if in popup
      if (window.opener) {
        window.opener.postMessage({
          type: "bluebeam-oauth-callback",
          error: errorDescription || error,
        }, window.location.origin);
        setTimeout(() => window.close(), 1500);
      }
      return;
    }

    if (!code) {
      setStatus("error");
      setMessage("No authorization code received. Please try again.");
      return;
    }

    // Post the code + state to the opener (popup flow). State is required by
    // the Edge Function to recover the PKCE verifier for this flow.
    if (window.opener) {
      window.opener.postMessage({
        type: "bluebeam-oauth-callback",
        code,
        state,
      }, window.location.origin);

      setStatus("success");
      setMessage("Connected! This window will close automatically.");
      setTimeout(() => window.close(), 1200);
    } else {
      // Redirect flow (non-popup) — user navigated directly
      // Exchange the code inline
      setStatus("success");
      setMessage("Authorization complete. You can close this tab and return to SteelBuild Pro.");
    }
  }, []);

  const colors = {
    processing: { bg: "rgba(59,130,246,0.10)", border: "rgba(59,130,246,0.30)", text: "rgba(147,197,253,0.95)" },
    success: { bg: "rgba(34,197,94,0.10)", border: "rgba(34,197,94,0.30)", text: "rgba(134,239,172,0.95)" },
    error: { bg: "rgba(239,68,68,0.10)", border: "rgba(239,68,68,0.30)", text: "rgba(252,165,165,0.95)" },
  };

  const c = colors[status];

  return (
    <div style={{
      minHeight: "100vh",
      display: "flex",
      alignItems: "center",
      justifyContent: "center",
      background: "#0D1117",
      color: "#e6edf3",
      fontFamily: "system-ui, -apple-system, sans-serif",
    }}>
      <div style={{
        background: c.bg,
        border: `1px solid ${c.border}`,
        borderRadius: 12,
        padding: "32px 40px",
        textAlign: "center",
        maxWidth: 420,
      }}>
        <div style={{ fontSize: 14, fontWeight: 600, color: c.text, marginBottom: 8 }}>
          {status === "processing" && "⏳ "}
          {status === "success" && "✓ "}
          {status === "error" && "✗ "}
          Bluebeam Max
        </div>
        <div style={{ fontSize: 13, color: "#b1bfd3" }}>
          {message}
        </div>
      </div>
    </div>
  );
}
