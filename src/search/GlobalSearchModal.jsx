import React, { useState, useEffect, useRef, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { base44 } from "@/api/base44Client";
import { createPageUrl } from "@/utils";
import { Search, X, ChevronRight } from "lucide-react";

const ICON_MAP = {
  Project: "▤",
  RFI: "⚑",
  Drawing: "▦",
  WorkPackage: "☰",
  ChangeOrder: "$",
  Contact: "👤",
};

const COLOR_MAP = {
  Project: "var(--accent)",
  RFI: "var(--status-info)",
  Drawing: "var(--status-warning)",
  WorkPackage: "var(--status-success)",
  ChangeOrder: "var(--status-error)",
  Contact: "#8B5CF6",
};

export default function GlobalSearchModal({ open, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(-1);
  const inputRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    const stored = localStorage.getItem("__steelbuild_recent_searches");
    if (stored) setRecentSearches(JSON.parse(stored));
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults([]);
      setSelectedIndex(-1);
    } else {
      inputRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        onClose?.();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  // Debounced search — fires 250ms after the user stops typing
  useEffect(() => {
    if (query.length < 2) { setResults([]); return; }
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query]); // eslint-disable-line react-hooks/exhaustive-deps

  const runSearch = useCallback(async (q) => {
    const ql = q.toLowerCase();
    try {
      const [projects, rfis, drawings, workPackages, changeOrders, contacts] = await Promise.all([
        base44.entities.Project.list(),
        base44.entities.RFI.list(),
        base44.entities.Drawing.list(),
        base44.entities.WorkPackage.list(),
        base44.entities.ChangeOrder.list(),
        base44.entities.Contact.list(),
      ]);

      const searchResults = [];

      projects
        .filter(p => p.name.toLowerCase().includes(ql) || p.project_number?.toLowerCase().includes(ql))
        .forEach(p => searchResults.push({ type: "Project", id: p.id, title: p.name, subtitle: `${p.project_number} · ${p.phase || "—"}`, status: p.health_status, projectId: p.id, page: "Projects" }));

      rfis
        .filter(r => r.rfi_number?.toLowerCase().includes(ql) || r.title.toLowerCase().includes(ql) || r.description?.toLowerCase().includes(ql))
        .slice(0, 5)
        .forEach(r => searchResults.push({ type: "RFI", id: r.id, title: `${r.rfi_number} · ${r.title}`, subtitle: `${r.project_name} · ${r.status}`, status: r.priority, projectId: r.project_id, page: "RFIs" }));

      drawings
        .filter(d => d.sheet_number?.toLowerCase().includes(ql) || d.title.toLowerCase().includes(ql))
        .slice(0, 5)
        .forEach(d => searchResults.push({ type: "Drawing", id: d.id, title: `${d.sheet_number} · ${d.title}`, subtitle: `${d.project_name} · ${d.stage}`, status: d.stage, projectId: d.project_id, page: "Submittals" }));

      workPackages
        .filter(w => w.wp_number?.toLowerCase().includes(ql) || w.name.toLowerCase().includes(ql))
        .slice(0, 5)
        .forEach(w => searchResults.push({ type: "WorkPackage", id: w.id, title: `${w.wp_number} · ${w.name}`, subtitle: `${w.project_name} · ${w.status}`, status: w.status, projectId: w.project_id, page: "WorkPackages" }));

      changeOrders
        .filter(c => c.co_number?.toLowerCase().includes(ql) || c.title.toLowerCase().includes(ql))
        .slice(0, 5)
        .forEach(c => searchResults.push({ type: "ChangeOrder", id: c.id, title: `${c.co_number} · ${c.title}`, subtitle: `${c.project_name} · ${c.status}`, status: c.status, projectId: c.project_id, page: "ChangeOrders" }));

      contacts
        .filter(c => c.first_name?.toLowerCase().includes(ql) || c.last_name?.toLowerCase().includes(ql) || c.company?.toLowerCase().includes(ql))
        .slice(0, 5)
        .forEach(c => searchResults.push({ type: "Contact", id: c.id, title: `${c.first_name} ${c.last_name}`, subtitle: `${c.company || "—"} · ${c.role || "—"}`, status: c.contact_type, projectId: c.project_id, page: "Contacts" }));

      setResults(searchResults.slice(0, 12));
    } catch (error) {
      console.error("Search error:", error);
    }
  }, []);

  const handleSearch = useCallback((q) => {
    setQuery(q);
    setSelectedIndex(-1);
  }, []);

  const handleSelect = (result) => {
    const searches = [result.title, ...recentSearches.filter((s) => s !== result.title)].slice(0, 5);
    localStorage.setItem("__steelbuild_recent_searches", JSON.stringify(searches));
    navigate(createPageUrl(result.page));
    onClose?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      onClose?.();
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, results.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, -1));
    } else if (e.key === "Enter" && selectedIndex >= 0) {
      handleSelect(results[selectedIndex]);
    }
  };

  if (!open) return null;

  return (
    <>
      <div
        onClick={onClose}
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.7)",
          zIndex: 1000,
        }}
      />

      <div
        style={{
          position: "fixed",
          top: "20%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "90%",
          maxWidth: 640,
          background: "var(--bg-surface-low)",
          border: "1px solid var(--accent-border)",
          borderRadius: 16,
          backdropFilter: "blur(8px)",
          zIndex: 1001,
          boxShadow: "0 20px 60px rgba(0,0,0,0.8)",
        }}
      >
        {/* Search Input */}
        <div
          style={{
            padding: "12px 16px",
            borderBottom: "1px solid rgba(255,255,255,0.06)",
            display: "flex",
            alignItems: "center",
            gap: 8,
          }}
        >
          <Search size={18} color="var(--text-muted)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search RFIs, drawings, projects, work packages..."
            style={{
              flex: 1,
              background: "transparent",
              border: "none",
              fontFamily: "var(--font-mono)",
              fontSize: 14,
              color: "var(--text-primary)",
              outline: "none",
            }}
          />
          <button
            onClick={onClose}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text-muted)",
              padding: 4,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Results or Recent */}
        <div
          style={{
            maxHeight: 400,
            overflowY: "auto",
            padding: "8px 0",
          }}
        >
          {query.length < 2 && recentSearches.length > 0 && (
            <div>
              <div
                style={{
                  padding: "8px 16px",
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  color: "var(--text-muted)",
                  letterSpacing: "0.1em",
                  textTransform: "uppercase",
                }}
              >
                Recent Searches
              </div>
              {recentSearches.map((search, i) => (
                <div
                  key={i}
                  onClick={() => handleSearch(search)}
                  style={{
                    padding: "8px 16px",
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                    fontSize: 13,
                    borderLeft: "2px solid transparent",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--accent-muted)";
                    e.currentTarget.style.borderLeftColor = "var(--accent)";
                    e.currentTarget.style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderLeftColor = "transparent";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                >
                  {search}
                </div>
              ))}
            </div>
          )}

          {results.length > 0 && (
            <div>
              {results.map((result, idx) => (
                <div
                  key={`${result.type}-${result.id}`}
                  onClick={() => handleSelect(result)}
                  style={{
                    padding: "10px 16px",
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    cursor: "pointer",
                    background:
                      selectedIndex === idx ? "var(--accent-muted)" : "transparent",
                    borderLeft:
                      selectedIndex === idx
                        ? "2px solid var(--accent)"
                        : "2px solid transparent",
                    transition: "all 0.1s",
                  }}
                  onMouseEnter={(e) => setSelectedIndex(idx)}
                >
                  <span
                    style={{
                      fontSize: 16,
                      color: COLOR_MAP[result.type],
                      flexShrink: 0,
                    }}
                  >
                    {ICON_MAP[result.type]}
                  </span>

                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div
                      style={{
                        fontFamily: "var(--font-body)",
                        fontSize: 13,
                        color: "var(--text-primary)",
                        fontWeight: 500,
                      }}
                    >
                      {result.title}
                    </div>
                    <div
                      style={{
                        fontFamily: "var(--font-mono)",
                        fontSize: 10,
                        color: "var(--text-muted)",
                        marginTop: 2,
                      }}
                    >
                      {result.subtitle}
                    </div>
                  </div>

                  <div
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      color: "var(--text-muted)",
                      flexShrink: 0,
                    }}
                  >
                    ↵
                  </div>
                </div>
              ))}
            </div>
          )}

          {query.length >= 2 && results.length === 0 && (
            <div
              style={{
                padding: "40px 16px",
                textAlign: "center",
                color: "var(--text-muted)",
                fontSize: 13,
              }}
            >
              No results for "{query}"
            </div>
          )}
        </div>
      </div>
    </>
  );
}