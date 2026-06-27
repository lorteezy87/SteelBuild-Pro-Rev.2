/**
 * Launcher — the applications overview (desktop home).
 * Photographic ModuleTile grid + category rail + live search.
 * Pure presentational: navigation is delegated via onNavigate(page).
 */
import React, { useMemo, useState } from "react";
import { Search } from "lucide-react";
import ModuleTile from "./ModuleTile";
import { LAUNCHER_CATEGORIES, modulesForCategory, searchModules } from "@/config/launcherConfig";

export default function Launcher({ onNavigate }) {
  const [category, setCategory] = useState("ALL");
  const [query, setQuery] = useState("");

  const modules = useMemo(() => {
    if (query.trim()) return searchModules(query);
    return modulesForCategory(category);
  }, [category, query]);

  return (
    <div style={{ display: "flex", flex: 1, minHeight: 0, position: "relative", zIndex: 1 }}>
      <div style={{ flex: 1, minWidth: 0, display: "flex", flexDirection: "column", padding: "18px 20px", overflowY: "auto" }}>
        <div style={{
          alignSelf: "center", display: "flex", alignItems: "center", gap: 8,
          background: "rgba(8,11,16,0.55)", border: "1px solid var(--desk-window-edge)",
          borderRadius: 20, padding: "6px 16px", marginBottom: 22, minWidth: 280,
        }}>
          <Search size={15} strokeWidth={1.8} aria-hidden="true" style={{ color: "var(--text-muted)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Type to search…"
            aria-label="Search applications"
            style={{
              background: "transparent", border: "none", outline: "none",
              color: "var(--text-primary)", fontSize: 13, fontFamily: "var(--font-body)", width: 220,
            }}
          />
        </div>

        <div style={{
          display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(180px, 1fr))",
          gap: 14, alignContent: "start",
        }}>
          {modules.map((m) => (
            <ModuleTile key={m.page} page={m.page} label={m.label} onClick={() => onNavigate(m.page)} />
          ))}
          {modules.length === 0 && (
            <p style={{ color: "var(--text-muted)", fontSize: 13, gridColumn: "1 / -1" }}>
              No modules match "{query}".
            </p>
          )}
        </div>
      </div>

      <nav aria-label="Categories" style={{
        width: 132, flexShrink: 0, padding: "20px 14px", overflowY: "auto",
        borderLeft: "1px solid var(--desk-window-edge)",
      }}>
        {LAUNCHER_CATEGORIES.map((c) => {
          const active = c === category && !query.trim();
          return (
            <button
              key={c}
              onClick={() => { setCategory(c); setQuery(""); }}
              style={{
                display: "block", width: "100%", textAlign: "left", background: "none",
                border: "none", cursor: "pointer", padding: "6px 4px",
                fontFamily: "var(--font-body)", fontSize: 11.5, letterSpacing: "0.02em",
                color: active ? "var(--accent)" : "var(--text-muted)",
              }}
            >
              {c}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
