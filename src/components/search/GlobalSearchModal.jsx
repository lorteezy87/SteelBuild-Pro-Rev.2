import React, { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { entities } from "@/api/supabaseClient";
import { createPageUrl } from "@/utils";
import { Search } from "lucide-react";
import { useProjectContext } from "@/components/shared/ProjectContext";
import {
  filterQuickNavModules,
  buildSearchDisplayItems,
  runCachedGlobalSearch,
  ICON_MAP,
  COLOR_MAP,
} from "./globalSearchHelpers";

// Stable empty array — prevents infinite re-render loops from useCallback/useEffect
// dependency chains when queries are disabled and would otherwise return new [] refs.
const EMPTY = [];


/* ── Quick-nav modules for empty-query state ────────────────────────────── */
const QUICK_NAV = [
  { icon: "◈", name: "Dashboard",    page: "Dashboard",               group: "Navigate" },
  { icon: "⚑", name: "RFI Hub",      page: "RFIs",                    group: "Navigate" },
  { icon: "▦", name: "Detailing",    page: "DrawingSubmittalHub",     group: "Navigate" },
  { icon: "☰", name: "Work Packages",page: "WorkPackages",            group: "Navigate" },
  { icon: "📦", name: "Deliveries",  page: "Deliveries",              group: "Navigate" },
  { icon: "◎", name: "Budget Control",   page: "CostHub",              group: "Navigate" },
  { icon: "▣", name: "Piece Register", page: "PieceRegister",         group: "Navigate" },
  { icon: "📑", name: "Contracts",   page: "ContractManagement",      group: "Navigate" },
  { icon: "$", name: "Change Orders", page: "ChangeOrders",            group: "Navigate" },
  { icon: "📁", name: "Documents",   page: "Documents",               group: "Navigate" },
  { icon: "✨", name: "Portfolio",              page: "PortfolioHub",              group: "Navigate" },
];

const SCOPE_OPTIONS = [
  { key: "project", label: "This Project" },
  { key: "all",     label: "All Projects" },
  { key: "contacts", label: "Contacts" },
];

export default function GlobalSearchModal({ open, onClose }) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState([]);
  const [recentSearches, setRecentSearches] = useState([]);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searchScope, setSearchScope] = useState("project");
  const inputRef = useRef(null);
  const listRef = useRef(null);
  const navigate = useNavigate();

  // Get active project for scope filtering
  const { activeProject } = useProjectContext();

  const isOpen = !!open;

  // Cached entity queries — only fetch when modal is open, reuse for 5 minutes
  const SEARCH_STALE_TIME = 5 * 60 * 1000;

  const { data: cachedProjects = EMPTY, isLoading: loadingProjects } = useQuery({
    queryKey: ["search-projects"],
    queryFn: () => entities.Project.list(),
    enabled: isOpen,
    staleTime: SEARCH_STALE_TIME,
  });

  const { data: cachedRFIs = EMPTY, isLoading: loadingRFIs } = useQuery({
    queryKey: ["search-rfis"],
    queryFn: () => entities.RFI.list(),
    enabled: isOpen,
    staleTime: SEARCH_STALE_TIME,
  });

  const { data: cachedDrawings = EMPTY, isLoading: loadingDrawings } = useQuery({
    queryKey: ["search-drawings"],
    queryFn: () => entities.Drawing.list(),
    enabled: isOpen,
    staleTime: SEARCH_STALE_TIME,
  });

  const { data: cachedWPs = EMPTY, isLoading: loadingWPs } = useQuery({
    queryKey: ["search-workpackages"],
    queryFn: () => entities.WorkPackage.list(),
    enabled: isOpen,
    staleTime: SEARCH_STALE_TIME,
  });

  const { data: cachedCOs = EMPTY, isLoading: loadingCOs } = useQuery({
    queryKey: ["search-changeorders"],
    queryFn: () => entities.ChangeOrder.list(),
    enabled: isOpen,
    staleTime: SEARCH_STALE_TIME,
  });

  const { data: cachedContacts = EMPTY, isLoading: loadingContacts } = useQuery({
    queryKey: ["search-contacts"],
    queryFn: () => entities.Contact.list(),
    enabled: isOpen,
    staleTime: SEARCH_STALE_TIME,
  });

  const indexLoading = loadingProjects || loadingRFIs || loadingDrawings || loadingWPs || loadingCOs || loadingContacts;

  useEffect(() => {
    try {
      const stored = localStorage.getItem("__steelbuild_recent_searches");
      if (stored) setRecentSearches(JSON.parse(stored));
    } catch (e) { /* corrupted data, ignore */ }
  }, []);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setResults(EMPTY);
      setSelectedIndex(0);
      setLoading(false);
      setSearchScope("project");
    } else {
      setTimeout(() => inputRef.current?.focus(), 50);
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

  const runSearch = useCallback((q) => {
    if (!q || q.length < 2) { setResults(EMPTY); setLoading(false); return; }
    setLoading(true);
    const searchResults = runCachedGlobalSearch({
      query: q,
      searchScope,
      activeProjectId: activeProject?.id,
      caches: {
        projects: cachedProjects,
        rfis: cachedRFIs,
        drawings: cachedDrawings,
        workPackages: cachedWPs,
        changeOrders: cachedCOs,
        contacts: cachedContacts,
      },
    });
    setResults(searchResults);
    setLoading(false);
  }, [cachedProjects, cachedRFIs, cachedDrawings, cachedWPs, cachedCOs, cachedContacts, searchScope, activeProject]);

  // Debounced search — re-run when scope changes or cached data updates
  useEffect(() => {
    if (query.length < 2) {
      setResults((prev) => prev.length === 0 ? prev : EMPTY);
      setLoading(false);
      return;
    }
    setLoading(true);
    const t = setTimeout(() => runSearch(query), 250);
    return () => clearTimeout(t);
  }, [query, searchScope, runSearch]);

  // Module quick-nav filtered by query
  const filteredModules = useMemo(
    () => filterQuickNavModules(QUICK_NAV, query),
    [query],
  );

  // Combined display items
  const displayItems = useMemo(
    () => buildSearchDisplayItems(results, filteredModules),
    [results, filteredModules],
  );

  // Reset selection when items change
  useEffect(() => {
    setSelectedIndex(0);
  }, [displayItems.length]);

  const handleSearch = useCallback((q) => {
    setQuery(q);
    setSelectedIndex(0);
  }, []);

  const handleSelect = (result) => {
    if (result.type !== "Module") {
      const searches = [result.title, ...recentSearches.filter((s) => s !== result.title)].slice(0, 5);
      localStorage.setItem("__steelbuild_recent_searches", JSON.stringify(searches));
    }
    navigate(createPageUrl(result.page));
    onClose?.();
  };

  const handleKeyDown = (e) => {
    if (e.key === "Escape") {
      onClose?.();
    } else if (e.key === "1" && e.altKey) {
      e.preventDefault();
      setSearchScope("project");
    } else if (e.key === "2" && e.altKey) {
      e.preventDefault();
      setSearchScope("all");
    } else if (e.key === "3" && e.altKey) {
      e.preventDefault();
      setSearchScope("contacts");
    } else if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.min(prev + 1, displayItems.length - 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelectedIndex((prev) => Math.max(prev - 1, 0));
    } else if (e.key === "Enter" && selectedIndex >= 0 && displayItems[selectedIndex]) {
      handleSelect(displayItems[selectedIndex]);
    }
  };

  // Auto-scroll selected item into view
  useEffect(() => {
    if (listRef.current && selectedIndex >= 0) {
      const el = listRef.current.children[selectedIndex];
      if (el) el.scrollIntoView({ block: "nearest" });
    }
  }, [selectedIndex]);

  if (!open) return null;

  return (
    <>
      {/* Backdrop */}
      <div
        onClick={onClose}
        aria-hidden="true"
        style={{
          position: "fixed",
          inset: 0,
          background: "rgba(0,0,0,0.65)",
          backdropFilter: "blur(4px)",
          WebkitBackdropFilter: "blur(4px)",
          zIndex: 1000,
          animation: "fadeIn 0.15s ease",
        }}
      />

      {/* Command Palette */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Global search"
        style={{
          position: "fixed",
          top: "15%",
          left: "50%",
          transform: "translateX(-50%)",
          width: "92%",
          maxWidth: 680,
          background: "var(--glass-bg, rgba(16,18,24,0.92))",
          border: "1px solid var(--accent-border)",
          borderRadius: 14,
          backdropFilter: "blur(20px)",
          WebkitBackdropFilter: "blur(20px)",
          zIndex: 1001,
          boxShadow: "0 20px 60px rgba(0,0,0,0.8), 0 0 40px rgba(59,130,246,0.08)",
          animation: "slideUp 0.2s ease",
          overflow: "hidden",
        }}
      >
        {/* Search Input */}
        <div
          style={{
            padding: "14px 18px",
            borderBottom: "1px solid var(--divider)",
            display: "flex",
            alignItems: "center",
            gap: 10,
          }}
        >
          <Search size={18} color="var(--accent)" />
          <input
            ref={inputRef}
            type="text"
            value={query}
            onChange={(e) => handleSearch(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder="Search or jump to... (RFIs, drawings, projects, contacts)"
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
          {indexLoading && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
              animation: "gentlePulse 1s ease infinite",
            }}>
              LOADING SEARCH INDEX...
            </span>
          )}
          {loading && !indexLoading && (
            <span style={{
              fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
              animation: "gentlePulse 1s ease infinite",
            }}>
              SEARCHING...
            </span>
          )}
          <kbd style={{
            fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
            background: "var(--bg-surface-high)", border: "1px solid var(--border-default)",
            borderRadius: 4, padding: "2px 6px",
          }}>
            ESC
          </kbd>
        </div>

        {/* Scope Filter Pills */}
        <div style={{
          padding: "8px 18px 4px",
          display: "flex",
          alignItems: "center",
          gap: 6,
          borderBottom: "1px solid var(--divider)",
          paddingBottom: 8,
        }}>
          {SCOPE_OPTIONS.map((scope) => {
            const isActive = searchScope === scope.key;
            return (
              <button
                key={scope.key}
                onClick={() => setSearchScope(scope.key)}
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  padding: "3px 10px",
                  borderRadius: 9999,
                  border: `1px solid ${isActive ? "var(--accent)" : "var(--border-default)"}`,
                  background: isActive ? "var(--info-muted)" : "transparent",
                  color: isActive ? "var(--accent)" : "var(--text-muted)",
                  cursor: "pointer",
                  letterSpacing: "0.04em",
                  fontWeight: isActive ? 600 : 400,
                  transition: "all 0.15s ease",
                  outline: "none",
                }}
              >
                {scope.label}
              </button>
            );
          })}
          <span style={{
            marginLeft: "auto",
            fontFamily: "var(--font-mono)",
            fontSize: 8,
            color: "var(--text-muted)",
            opacity: 0.6,
            letterSpacing: "0.06em",
          }}>
            Alt+1/2/3 to switch scope
          </span>
        </div>

        {/* Scope indicator */}
        {query.length > 0 && (
          <div style={{
            padding: "4px 18px",
            fontFamily: "var(--font-mono)",
            fontSize: 9,
            color: "var(--text-muted)",
            opacity: 0.7,
          }}>
            Searching: {SCOPE_OPTIONS.find(s => s.key === searchScope)?.label}
            {searchScope === "project" && activeProject
              ? ` (${activeProject.project_name || activeProject.name || "—"})`
              : ""}
          </div>
        )}

        {/* Results / Quick Nav */}
        <div ref={listRef} style={{ maxHeight: 380, overflowY: "auto", padding: "4px 0" }}>
          {/* Recent searches when no query */}
          {query.length === 0 && recentSearches.length > 0 && (
            <>
              <div style={{
                padding: "8px 18px 4px",
                fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
                letterSpacing: "0.14em", textTransform: "uppercase",
              }}>
                Recent
              </div>
              {recentSearches.slice(0, 3).map((search, i) => (
                <div
                  key={`recent-${i}`}
                  onClick={() => handleSearch(search)}
                  style={{
                    padding: "8px 18px",
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                    fontFamily: "var(--font-mono)", fontSize: 12,
                    display: "flex", alignItems: "center", gap: 8,
                    transition: "background 0.1s",
                  }}
                  onMouseEnter={(e) => (e.currentTarget.style.background = "var(--hover-bg)")}
                  onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
                >
                  <span style={{ fontSize: 12, color: "var(--text-muted)" }}>↩</span>
                  {search}
                </div>
              ))}
              <div style={{ height: 1, background: "var(--hover-bg)", margin: "4px 18px" }} />
            </>
          )}

          {/* Section label */}
          {displayItems.length > 0 && (
            <div style={{
              padding: "8px 18px 4px",
              fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
              letterSpacing: "0.14em", textTransform: "uppercase",
            }}>
              {results.length > 0 ? `${results.length} Results` : "Quick Navigation"}
            </div>
          )}

          {/* Items */}
          {displayItems.map((item, idx) => {
            const isSelected = selectedIndex === idx;
            const typeColor = COLOR_MAP[item.type] || "var(--text-muted)";
            return (
              <div
                key={`${item.type}-${item.id}`}
                onClick={() => handleSelect(item)}
                style={{
                  padding: "10px 18px",
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  cursor: "pointer",
                  background: isSelected ? "rgba(59,130,246,0.08)" : "transparent",
                  borderLeft: isSelected ? "2px solid var(--accent)" : "2px solid transparent",
                  transition: "all 0.1s",
                  minHeight: 44,
                }}
                onMouseEnter={() => setSelectedIndex(idx)}
              >
                {/* Type icon */}
                <span style={{
                  fontSize: 16,
                  color: typeColor,
                  flexShrink: 0,
                  width: 24,
                  textAlign: "center",
                }}>
                  {item.icon || ICON_MAP[item.type]}
                </span>

                {/* Content */}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{
                    fontFamily: "var(--font-body)", fontSize: 13, color: "var(--text-primary)",
                    fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}>
                    {item.title}
                  </div>
                  {item.subtitle && (
                    <div style={{
                      fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)",
                      marginTop: 1,
                    }}>
                      {item.subtitle}
                    </div>
                  )}
                </div>

                {/* Type badge */}
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
                  color: typeColor, background: `${typeColor}15`,
                  border: `1px solid ${typeColor}30`,
                  borderRadius: 4, padding: "2px 8px",
                  letterSpacing: "0.06em", textTransform: "uppercase",
                  flexShrink: 0,
                }}>
                  {item.type === "Module" ? "GO" : item.type.replace("WorkPackage", "WP").replace("ChangeOrder", "CO")}
                </span>

                {/* Enter hint for selected */}
                {isSelected && (
                  <kbd style={{
                    fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)",
                    background: "var(--bg-surface-high)", border: "1px solid var(--border-default)",
                    borderRadius: 3, padding: "1px 5px", flexShrink: 0,
                  }}>
                    ↵
                  </kbd>
                )}
              </div>
            );
          })}

          {/* No results */}
          {query.length >= 2 && results.length === 0 && !loading && !indexLoading && (
            <div style={{
              padding: "40px 18px",
              textAlign: "center",
              color: "var(--text-muted)",
              fontFamily: "var(--font-mono)", fontSize: 11,
            }}>
              <div style={{ fontSize: 28, marginBottom: 8, opacity: 0.3 }}>⌕</div>
              No results for "{query}"
              <div style={{ fontSize: 9, marginTop: 8, color: "var(--text-muted)" }}>
                Try searching by RFI number, drawing sheet, project name, or contact
              </div>
            </div>
          )}
        </div>

        {/* Footer */}
        <div style={{
          borderTop: "1px solid var(--hover-bg)",
          padding: "8px 18px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
        }}>
          <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
            <span><kbd style={{ background: "var(--bg-surface-high)", borderRadius: 2, padding: "1px 4px", marginRight: 4 }}>↑↓</kbd> Navigate</span>
            <span><kbd style={{ background: "var(--bg-surface-high)", borderRadius: 2, padding: "1px 4px", marginRight: 4 }}>↵</kbd> Open</span>
            <span><kbd style={{ background: "var(--bg-surface-high)", borderRadius: 2, padding: "1px 4px", marginRight: 4 }}>Alt+1/2/3</kbd> Scope</span>
            <span><kbd style={{ background: "var(--bg-surface-high)", borderRadius: 2, padding: "1px 4px", marginRight: 4 }}>esc</kbd> Close</span>
          </div>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.10em" }}>
            STEELBUILD COMMAND PALETTE
          </span>
        </div>
      </div>
    </>
  );
}

