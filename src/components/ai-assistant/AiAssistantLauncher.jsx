/**
 * Floating launcher for the project-scoped assistant drawer.
 *
 * Global search owns Cmd/Ctrl+K, so this component intentionally has no global
 * keyboard listener. The explicit button remains available on every
 * authenticated page without competing with search or form input shortcuts.
 */

import React, { useState } from "react";
import { Sparkles } from "lucide-react";
import AiAssistantDrawer from "./AiAssistantDrawer";

export default function AiAssistantLauncher() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open Project Assistant"
        title="Open Project Assistant"
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 500,
          height: 48,
          padding: "0 16px",
          display: "inline-flex",
          alignItems: "center",
          gap: 8,
          background:
            "linear-gradient(135deg, rgba(200,155,32,0.95) 0%, rgba(200,155,32,0.75) 100%)",
          color: "var(--accent-text, #111)",
          border: "1px solid var(--accent)",
          borderRadius: 24,
          cursor: "pointer",
          fontFamily: "Space Grotesk, var(--font-display)",
          fontWeight: 800,
          fontSize: 13,
          letterSpacing: "0.01em",
          boxShadow:
            "0 8px 24px rgba(200,155,32,0.35), 0 2px 6px rgba(0,0,0,0.35)",
          transition: "transform 0.12s, box-shadow 0.12s",
        }}
        onMouseEnter={(e) => {
          e.currentTarget.style.transform = "translateY(-1px)";
          e.currentTarget.style.boxShadow =
            "0 10px 28px rgba(200,155,32,0.45), 0 3px 8px rgba(0,0,0,0.4)";
        }}
        onMouseLeave={(e) => {
          e.currentTarget.style.transform = "none";
          e.currentTarget.style.boxShadow =
            "0 8px 24px rgba(200,155,32,0.35), 0 2px 6px rgba(0,0,0,0.35)";
        }}
      >
        <Sparkles size={15} />
        Project Assistant
      </button>

      <AiAssistantDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
