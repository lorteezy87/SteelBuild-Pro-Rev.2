/**
 * Floating "Ask AI" launcher that opens the schedule-assistant drawer.
 *
 * Stacked above QuickAddFAB so both remain clickable. Lives inside Layout
 * so it's available on every authenticated page.
 */

import React, { useEffect, useState } from "react";
import { Sparkles } from "lucide-react";
import AiAssistantDrawer from "./AiAssistantDrawer";

const mono = { fontFamily: "var(--font-mono)" };

export default function AiAssistantLauncher() {
  const [open, setOpen] = useState(false);

  // Keyboard shortcut: Cmd/Ctrl + K toggles the drawer from anywhere.
  // Matches the convention used by Global Search (Cmd+/) — different key
  // so they don't collide.
  useEffect(() => {
    const onKey = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === "k") {
        if (document.activeElement?.tagName === "INPUT") return;
        e.preventDefault();
        setOpen((o) => !o);
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        aria-label="Open AI Schedule Assistant"
        title="Ask AI (Ctrl+K)"
        style={{
          position: "fixed",
          bottom: 88, // stack above QuickAddFAB (bottom: 24, height ~56)
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
        Ask AI
        <span
          style={{
            ...mono,
            fontSize: 9,
            fontWeight: 700,
            padding: "2px 6px",
            marginLeft: 4,
            background: "rgba(0,0,0,0.15)",
            color: "rgba(0,0,0,0.65)",
            borderRadius: 3,
            letterSpacing: "0.04em",
          }}
        >
          ⌘K
        </span>
      </button>

      <AiAssistantDrawer open={open} onClose={() => setOpen(false)} />
    </>
  );
}
