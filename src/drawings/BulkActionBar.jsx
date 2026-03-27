import React, { useState, useRef, useEffect } from "react";
import { Trash2, X } from "lucide-react";

const DISCIPLINES = ["Structural", "Arch", "MEP", "Civil", "Misc Metals"];
const STAGES = ["Not Started", "OFA", "BFA", "OFS", "BFS", "FFF", "Released"];
const IFC_STATUSES = ["IFR", "IFC", "IFA", "Void"];

function DropPopover({ label, options, onApply, count }) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState(null);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const handleApply = () => {
    if (!selected) return;
    onApply(selected);
    setSelected(null);
    setOpen(false);
  };

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "2px 8px", height: 22, borderRadius: 5, cursor: "pointer",
          background: open ? "var(--accent-muted)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${open ? "var(--accent-border)" : "rgba(255,255,255,0.10)"}`,
          color: open ? "var(--accent)" : "var(--text-secondary)", fontFamily: "var(--font-mono)",
          fontSize: 8, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 3
        }}
      >
        {label} ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200,
          background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
          borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          minWidth: 180, overflow: "hidden"
        }}>
          {options.map(opt => (
            <div
              key={opt}
              onClick={() => setSelected(opt)}
              style={{
                padding: "7px 12px", cursor: "pointer",
                background: selected === opt ? "var(--accent-muted)" : "transparent",
                fontFamily: "var(--font-body)", fontSize: 12,
                color: selected === opt ? "var(--accent)" : "var(--text-secondary)",
                display: "flex", alignItems: "center", gap: 8
              }}
            >
              <span style={{
                width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                background: selected === opt ? "var(--accent)" : "rgba(255,255,255,0.12)",
                border: selected === opt ? "none" : "1px solid rgba(255,255,255,0.25)"
              }} />
              {opt}
            </div>
          ))}
          <div style={{ padding: "8px 10px", borderTop: "1px solid rgba(255,255,255,0.06)" }}>
            <button
              onClick={handleApply}
              disabled={!selected}
              style={{
                width: "100%", padding: "6px 0", borderRadius: 6, cursor: selected ? "pointer" : "not-allowed",
                background: selected ? "var(--accent)" : "rgba(255,255,255,0.04)",
                border: "none", color: selected ? "#fff" : "var(--text-muted)",
                fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em"
              }}
            >
              Apply to {count} drawings
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function RevisionPopover({ onApply, count }) {
  const [open, setOpen] = useState(false);
  const [val, setVal] = useState("");
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => { if (ref.current && !ref.current.contains(e.target)) setOpen(false); };
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          padding: "2px 8px", height: 22, borderRadius: 5, cursor: "pointer",
          background: open ? "var(--accent-muted)" : "rgba(255,255,255,0.05)",
          border: `1px solid ${open ? "var(--accent-border)" : "rgba(255,255,255,0.10)"}`,
          color: open ? "var(--accent)" : "var(--text-secondary)", fontFamily: "var(--font-mono)",
          fontSize: 8, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 3
        }}
      >
        REVISION ▾
      </button>
      {open && (
        <div style={{
          position: "absolute", top: "calc(100% + 6px)", left: 0, zIndex: 200,
          background: "var(--bg-surface-low)", border: "1px solid var(--border-default)",
          borderRadius: 10, boxShadow: "0 12px 32px rgba(0,0,0,0.7)",
          minWidth: 200, padding: 12
        }}>
          <input
            autoFocus
            value={val}
            onChange={e => setVal(e.target.value)}
            placeholder="e.g. 2"
            style={{ width: "100%", marginBottom: 8 }}
          />
          <button
            onClick={() => { if (val.trim()) { onApply(val.trim()); setVal(""); setOpen(false); } }}
            disabled={!val.trim()}
            style={{
              width: "100%", padding: "6px 0", borderRadius: 6, cursor: val.trim() ? "pointer" : "not-allowed",
              background: val.trim() ? "var(--accent)" : "rgba(255,255,255,0.04)",
              border: "none", color: val.trim() ? "#fff" : "rgba(160,175,210,0.30)",
              fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, letterSpacing: "0.08em"
            }}
          >
            Apply to {count} drawings
          </button>
        </div>
      )}
    </div>
  );
}

const bulkBtn = {
  background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.10)",
  borderRadius: 5, padding: "2px 8px", height: 22, cursor: "pointer",
  color: "var(--text-secondary)", fontFamily: "var(--font-mono)",
  fontSize: 8, letterSpacing: "0.08em", display: "flex", alignItems: "center", gap: 3
  };

export default function BulkActionBar({ count, onBulkUpdate, onBulkDelete, onClear }) {
  return (
    <div style={{
      display: "flex", alignItems: "center", gap: 6,
      padding: "0 16px", height: 32, flexShrink: 0,
      background: "var(--accent-muted)", borderBottom: "1px solid var(--accent-border)"
    }}>
      <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", fontWeight: 700, letterSpacing: "0.08em", flexShrink: 0 }}>
        ☑ {count} SELECTED
      </span>
      <button onClick={onClear} style={{ ...bulkBtn, background: "none", border: "none", color: "rgba(160,175,210,0.50)", gap: 2 }}>
        <X style={{ width: 9, height: 9 }} /> CLEAR
      </button>
      <div style={{ width: 1, height: 14, background: "rgba(255,255,255,0.10)", flexShrink: 0 }} />
      <DropPopover label="STAGE" options={STAGES} onApply={v => onBulkUpdate("stage", v)} count={count} compact />
      <RevisionPopover onApply={v => onBulkUpdate("revision_number", v)} count={count} compact />
      <DropPopover label="DISCIPLINE" options={DISCIPLINES} onApply={v => onBulkUpdate("discipline", v)} count={count} compact />
      <DropPopover label="IFC" options={IFC_STATUSES} onApply={v => onBulkUpdate("ifc_status", v)} count={count} compact />
      <div style={{ flex: 1 }} />
      <button onClick={onBulkDelete} style={{ ...bulkBtn, color: "rgba(255,100,100,0.75)", borderColor: "rgba(255,61,61,0.22)" }}>
        <Trash2 style={{ width: 9, height: 9 }} /> DELETE
      </button>
    </div>
  );
}