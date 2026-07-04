import React, { useState } from "react";
import { Button } from "@/components/ui/button";
import { ChevronRight } from "lucide-react";

// ─── Step 0: New Set vs New Revision choice ───────────────────────────
export default function StepChoice({ onNewSet, onNewRevision, onClose }) {
  const [hovered, setHovered] = useState(null);
  const options = [
    { id: "new", icon: "📐", title: "New Drawing Set", desc: "First time uploading this drawing package — creates a new entry in the Drawing Log.", action: onNewSet },
    { id: "revision", icon: "↑", title: "New Revision", desc: "Updating an existing set (OFA → IFC, IFC → IFC Rev 1…) — replaces old revision in place.", action: onNewRevision },
  ];
  return (
    <div>
      <p style={{ fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-muted)", marginBottom: 16 }}>
        Is this a new drawing set or a new revision of an existing set?
      </p>
      <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 20 }}>
        {options.map(opt => (
          <div key={opt.id} onClick={opt.action}
            onMouseEnter={() => setHovered(opt.id)}
            onMouseLeave={() => setHovered(null)}
            style={{
              padding: "16px 18px", borderRadius: 10, cursor: "pointer",
              background: hovered === opt.id ? "var(--warning-muted)" : "var(--hover-bg)",
              border: `1px solid ${hovered === opt.id ? "var(--warning-border)" : "var(--bg-surface-high)"}`,
              transition: "all 0.12s", display: "flex", alignItems: "flex-start", gap: 14
            }}>
            <span style={{ fontSize: 22, flexShrink: 0, marginTop: 2 }}>{opt.icon}</span>
            <div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 14, fontWeight: 600, color: "var(--text-primary)", marginBottom: 4 }}>{opt.title}</div>
              <div style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", lineHeight: 1.5 }}>{opt.desc}</div>
            </div>
            <ChevronRight style={{ width: 14, height: 14, color: "var(--text-muted)", flexShrink: 0, marginLeft: "auto", marginTop: 4 }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", justifyContent: "flex-end" }}>
        <Button variant="outline" onClick={onClose}>Cancel</Button>
      </div>
    </div>
  );
}
