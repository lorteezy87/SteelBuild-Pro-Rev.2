/**
 * SidebarNav — sleek, consistent left-side navigation.
 *
 * Redesign goals (replaced the emoji-icon / multi-accent version):
 *   - ONE consistent icon system (lucide-react line icons)
 *   - ONE accent color driving active state (no per-group rainbow)
 *   - Quieter group headers (subtle dividers, no colored dots)
 *   - Modern micro-interactions (smooth pill active state, hover fade)
 *   - Two modes: expanded (240px) and rail (56px, icons only)
 *   - Recents surfaced at the bottom without visually competing with nav
 *   - Keyboard-friendly: focus rings, Cmd/Ctrl+K shortcut to search
 *
 * The nav registry still lives in src/config/moduleRegistry.js
 * (SIDEBAR_GROUPS). This component only consumes it — adding a page
 * means editing the registry + the PAGE_ICON map below.
 */

import React, { useCallback, useEffect, useMemo, useState } from "react";
import {
  // Overview
  LayoutDashboard, Terminal, Sparkles, Grid3x3, Briefcase, BarChart3,
  // Project management
  CalendarRange, CalendarDays, CheckSquare, HelpCircle, DollarSign,
  Mail,
  // Design & drawings
  FileText, Eye, Box, ScanLine,
  // Production
  Package, Truck, Wrench, Users2,
  // Financials
  Wallet, TrendingUp, Receipt,
  // Documents & reports
  Folder, FileBarChart, Activity as ActivityIcon,
  // Field
  ClipboardList, Shield, ShieldAlert, FlaskConical, Camera,
  // Administration
  Contact2, Building2, UserCog, Settings as SettingsIcon,
  // Tools
  Ruler, Calculator, HardHat, ArrowLeftRight,
  // Help
  BookOpen,
  // Chrome
  ChevronsLeft, ChevronsRight, Search, Clock, ChevronRight as ChevronRightIcon,
  // Favorites
  Star,
} from "lucide-react";
import { SIDEBAR_GROUPS, loadSidebarState, saveSidebarState } from "@/config/moduleRegistry";
import { prefetchRoute } from "@/lib/routePrefetch";
import { useTheme } from "@/components/shared/ThemeContext";

// ── Page → lucide icon map ──────────────────────────────────────────
//
// Central lookup so the registry can stay text-only (emoji-free) and
// adding a new page just needs one line here. Missing entries fall
// back to a neutral circle so the sidebar never renders an empty
// slot. Keeping this map explicit (vs. auto-inferring from page name)
// guarantees a consistent visual language across the app.
const PAGE_ICON = {
  // Overview
  Dashboard:                    LayoutDashboard,
  CommandCenter:                Terminal,
  AIInsights:                   Sparkles,
  ExecutiveView:                BarChart3,
  Projects:                     Briefcase,
  PortfolioOverview:            Grid3x3,

  // Project management
  Schedule:                     CalendarRange,
  GanttChart:                   CalendarRange,
  ProjectCalendar:              CalendarDays,
  ActionItems:                  CheckSquare,
  RFIs:                         HelpCircle,
  RFIHub:                       HelpCircle,
  Submittals:                   FileText,
  ChangeOrders:                 DollarSign,
  ChangeRequests:               DollarSign,
  EmailInbox:                   Mail,
  ProjectCloseout:              Box,
  ProductionNotes:              FileText,

  // Design & drawings
  Drawings:                     FileText,
  DrawingViewer:                Eye,
  Documents:                    Folder,

  // Production
  WorkPackages:                 Package,
  Constraints:                  Shield,
  FabRelease:                   Wrench,
  Procurement:                  Package,
  LookAheadSchedule:            CalendarRange,
  Deliveries:                   Truck,
  ResourceScheduling:           Users2,
  ResourceManagement:           Users2,

  // Financials
  Financials:                   Wallet,
  CostDashboard:                TrendingUp,
  SOV:                          Receipt,
  ContractManagement:           FileText,
  Expenses:                     Wallet,

  // Documents & reports
  Reports:                      FileBarChart,
  JobStatusReport:              FileBarChart,
  Activity:                     ActivityIcon,
  AlertsCenter:                 ShieldAlert,

  // Field
  DailyLogs:                    ClipboardList,
  Photos:                       Camera,
  Inspections:                  ScanLine,
  Safety:                       Shield,
  QualityControl:               FlaskConical,
  Punchlist:                    CheckSquare,
  LEMs:                         ClipboardList,
  Warranty:                     Shield,

  // Administration
  Contacts:                     Contact2,
  Vendors:                      Building2,
  UsersManagement:              UserCog,
  Settings:                     SettingsIcon,
  ScopeExclusions:              FileText,
  Tutorial:                     BookOpen,

  // Tools
  Calculator:                   Calculator,
  FeetInchesCalculator:         Ruler,
  SteelWeightCalculator:        Calculator,
  CranePickCalculator:          HardHat,
  DecimalFractionConverter:     ArrowLeftRight,
};

// Fallback for anything missing — also a decent default shape.
const FallbackIcon = Grid3x3;

// ── Local storage helpers ───────────────────────────────────────────
const RAIL_LS_KEY    = "sbp-sidebar-rail";
const RECENTS_LS_KEY = "sbp-sidebar-recents";
const MAX_RECENTS    = 4;

function loadRailState() {
  try { return localStorage.getItem(RAIL_LS_KEY) === "1"; } catch { return false; }
}
function saveRailState(v) {
  try { localStorage.setItem(RAIL_LS_KEY, v ? "1" : "0"); } catch { /* noop */ }
}
function loadRecents() {
  try {
    const raw = localStorage.getItem(RECENTS_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveRecents(pages) {
  try { localStorage.setItem(RECENTS_LS_KEY, JSON.stringify(pages)); } catch { /* noop */ }
}

// ── Favorites persistence ───────────────────────────────────────────
const FAVORITES_LS_KEY = "sbp-sidebar-favorites";

function loadFavorites() {
  try {
    const raw = localStorage.getItem(FAVORITES_LS_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch { return []; }
}
function saveFavorites(pages) {
  try { localStorage.setItem(FAVORITES_LS_KEY, JSON.stringify(pages)); } catch { /* noop */ }
}

// ── Component ───────────────────────────────────────────────────────
export default function SidebarNav({ currentPageName, onNavigate, visible }) {
  const { theme } = useTheme();
  const isLightTheme = theme === "light";
  const [collapsed, setCollapsed] = useState(loadSidebarState);
  const [railModeState, setRailMode] = useState(loadRailState);
  const [recents, setRecents]     = useState(loadRecents);
  const [showRecents, setShowRecents] = useState(true);
  const [favorites, setFavorites] = useState(loadFavorites);
  const railMode = isLightTheme ? false : railModeState;

  // Recent-pages tracking — kept here so reloads remember the last
  // few pages you visited.
  useEffect(() => {
    if (!currentPageName) return;
    setRecents((prev) => {
      const next = [currentPageName, ...prev.filter((p) => p !== currentPageName)].slice(0, MAX_RECENTS);
      saveRecents(next);
      return next;
    });
  }, [currentPageName]);

  const toggleGroup = (label) => {
    setCollapsed((prev) => {
      const next = { ...prev, [label]: !prev[label] };
      saveSidebarState(next);
      return next;
    });
  };

  const toggleRail = () => {
    setRailMode((r) => {
      const next = !r;
      saveRailState(next);
      return next;
    });
  };

  const allCollapsibleGroups = SIDEBAR_GROUPS.filter((g) => g.collapsible);
  const anyExpanded = allCollapsibleGroups.some((g) => !collapsed[g.label]);

  const toggleAll = () => {
    const newState = {};
    const shouldCollapse = anyExpanded;
    allCollapsibleGroups.forEach((g) => { newState[g.label] = shouldCollapse; });
    setCollapsed(newState);
    saveSidebarState(newState);
  };

  // ── Favorites logic ──────────────────────────────────────────────
  const toggleFavorite = useCallback((page) => {
    setFavorites((prev) => {
      const next = prev.includes(page)
        ? prev.filter((p) => p !== page)
        : [...prev, page];
      saveFavorites(next);
      return next;
    });
  }, []);

  const favoriteItems = useMemo(() => {
    const flat = SIDEBAR_GROUPS.flatMap((g) =>
      g.items.map((it) => ({ ...it, _group: g.label }))
    );
    return favorites
      .map((p) => flat.find((it) => it.page === p))
      .filter(Boolean);
  }, [favorites]);

  // Recents filtered against the flat registry so a deleted/renamed
  // page falls out cleanly instead of rendering a dead entry.
  const recentItems = useMemo(() => {
    const flat = SIDEBAR_GROUPS.flatMap((g) =>
      g.items.map((it) => ({ ...it, _group: g.label }))
    );
    return recents
      .map((p) => flat.find((it) => it.page === p))
      .filter(Boolean)
      .filter((it) => it.page !== currentPageName)
      .slice(0, 3);
  }, [recents, currentPageName]);

  const openGlobalSearch = () => {
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", metaKey: true, bubbles: true }));
    window.dispatchEvent(new KeyboardEvent("keydown", { key: "k", ctrlKey: true, bubbles: true }));
  };

  if (!visible) return null;

  const width = isLightTheme ? 176 : (railMode ? 56 : 240);

  return (
    <aside
      aria-label="Primary navigation"
      className={`sbd-sidebar${isLightTheme ? " is-light-sidebar" : ""}`}
      style={{
        width, minWidth: width,
        display: "flex",
        flexDirection: "column",
        flexShrink: 0,
        height: "100%",
        overflow: "hidden",
        position: "relative",
        transition: "width 200ms cubic-bezier(0.25, 0.85, 0.35, 1), min-width 200ms cubic-bezier(0.25, 0.85, 0.35, 1)",
      }}
    >
      {/* ── Top control strip ───────────────────────────────────── */}
      {isLightTheme && (
        <div
          className="light-sidebar-brand"
          style={{
            height: 48,
            display: "flex",
            alignItems: "center",
            padding: "0 12px",
            borderBottom: "1px solid var(--divider)",
          }}
        >
          <div
            aria-hidden
            style={{
              width: 24,
              height: 24,
              border: "1px solid var(--border-default)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              color: "var(--accent)",
              marginRight: 7,
            }}
          >
            <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinejoin="round">
              <path d="M8 2.5 14 13H2L8 2.5Z" />
              <path d="M8 6.5V10" />
              <path d="M8 12h.01" />
            </svg>
          </div>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 900, letterSpacing: "0.02em", color: "var(--text-primary)", lineHeight: 1 }}>
              STEELBUILD PRO
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700, letterSpacing: "0.18em", color: "var(--text-muted)", lineHeight: 1.3, marginTop: 3 }}>
              CONSTRUCTION OPS
            </div>
          </div>
        </div>
      )}

      {!isLightTheme && <div
        style={{
          padding: railMode ? "12px 8px 8px" : "12px 14px 8px",
          display: "flex",
          alignItems: "center",
          justifyContent: railMode ? "center" : "space-between",
          gap: 6,
          borderBottom: "1px solid var(--divider)",
        }}
      >
        {!railMode && (
          <button
            onClick={toggleAll}
            aria-label={anyExpanded ? "Collapse all groups" : "Expand all groups"}
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.14em",
              color: "var(--text-muted)",
              padding: "2px 4px",
              borderRadius: 3,
              transition: "color 140ms",
            }}
            onMouseEnter={(e) => (e.currentTarget.style.color = "var(--text-primary)")}
            onMouseLeave={(e) => (e.currentTarget.style.color = "var(--text-muted)")}
          >
            {anyExpanded ? "COLLAPSE" : "EXPAND"}
          </button>
        )}
        <button
          onClick={toggleRail}
          title={railMode ? "Expand sidebar" : "Collapse to icons"}
          aria-label={railMode ? "Expand sidebar" : "Collapse to icons"}
          style={{
            width: 28, height: 28,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "transparent",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            cursor: "pointer",
            color: "var(--text-muted)",
            transition: "all 140ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.color = "var(--accent)";
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.background = "var(--accent-muted)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.background = "transparent";
          }}
        >
          {railMode ? <ChevronsRight size={14} strokeWidth={1.75} /> : <ChevronsLeft size={14} strokeWidth={1.75} />}
        </button>
      </div>}

      {/* ── Global search trigger ──────────────────────────────── */}
      {!isLightTheme && <div style={{ padding: railMode ? "10px 8px 4px" : "10px 14px 4px" }}>
        <button
          onClick={openGlobalSearch}
          title="Search (⌘K)"
          aria-label="Search"
          style={{
            width: "100%",
            height: 32,
            display: "flex",
            alignItems: "center",
            justifyContent: railMode ? "center" : "flex-start",
            gap: 8,
            padding: railMode ? 0 : "0 10px",
            background: "var(--bg-surface-low)",
            border: "1px solid var(--border-default)",
            borderRadius: 8,
            color: "var(--text-muted)",
            cursor: "pointer",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            transition: "all 140ms",
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.borderColor = "var(--accent-border)";
            e.currentTarget.style.color = "var(--text-primary)";
            e.currentTarget.style.background = "var(--bg-surface)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.borderColor = "var(--border-default)";
            e.currentTarget.style.color = "var(--text-muted)";
            e.currentTarget.style.background = "var(--bg-surface-low)";
          }}
        >
          <Search size={14} strokeWidth={1.75} />
          {!railMode && (
            <>
              <span style={{ flex: 1, textAlign: "left" }}>Search</span>
              <kbd
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 9,
                  padding: "2px 5px",
                  borderRadius: 3,
                  background: "var(--bg-surface)",
                  border: "1px solid var(--divider)",
                  color: "var(--text-muted)",
                  letterSpacing: "0.04em",
                }}
              >
                ⌘K
              </kbd>
            </>
          )}
        </button>
      </div>}

      {/* ── Navigation groups (scroll area) ────────────────────── */}
      <nav
        style={{
          flex: 1,
          padding: "10px 0 12px",
          overflowY: "auto",
          overflowX: "hidden",
          position: "relative",
        }}
      >
        {/* ── Favorites section ─────────────────────────────────── */}
        {!railMode && favoriteItems.length > 0 && (
          <FavoritesSection
            items={favoriteItems}
            currentPageName={currentPageName}
            onNavigate={onNavigate}
            onUnpin={toggleFavorite}
          />
        )}
        {railMode && favoriteItems.length > 0 && (
          <FavoritesSectionRail
            items={favoriteItems}
            currentPageName={currentPageName}
            onNavigate={onNavigate}
            onUnpin={toggleFavorite}
          />
        )}

        {SIDEBAR_GROUPS.map((group, groupIdx) => {
          const isCollapsed = group.collapsible && collapsed[group.label];
          const hasFavs = favoriteItems.length > 0;
          return (
            <div key={group.label} style={{ marginTop: (groupIdx === 0 && !hasFavs) ? 0 : (groupIdx === 0 && hasFavs) ? 0 : (railMode ? 8 : 12) }}>
              {railMode ? (
                // Rail mode: minimalist divider between groups
                groupIdx > 0 && (
                  <div
                    style={{
                      height: 1,
                      margin: "4px 12px 8px",
                      background: "var(--divider)",
                      opacity: 0.6,
                    }}
                  />
                )
              ) : (
                // Expanded mode: quiet group header with hover chevron
                <button
                  onClick={group.collapsible ? () => toggleGroup(group.label) : undefined}
                  disabled={!group.collapsible}
                  style={{
                    width: "100%",
                    padding: "6px 14px 4px",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    cursor: group.collapsible ? "pointer" : "default",
                    background: "none",
                    border: "none",
                    userSelect: "none",
                    textAlign: "left",
                  }}
                  onMouseEnter={(e) => {
                    if (group.collapsible) {
                      const label = e.currentTarget.querySelector("[data-label]");
                      if (label) label.style.color = "var(--text-secondary)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    const label = e.currentTarget.querySelector("[data-label]");
                    if (label) label.style.color = "var(--text-muted)";
                  }}
                >
                  <span
                    data-label
                    className="sbd-nav-section"
                    style={{
                      fontFamily: "var(--font-mono)",
                      fontSize: 9,
                      fontWeight: 700,
                      letterSpacing: "0.16em",
                      color: "var(--text-muted)",
                      transition: "color 140ms",
                    }}
                  >
                    {group.label}
                  </span>
                  {group.collapsible && (
                    <ChevronRightIcon
                      size={12}
                      strokeWidth={2}
                      style={{
                        color: "var(--text-muted)",
                        transform: isCollapsed ? "rotate(0deg)" : "rotate(90deg)",
                        transition: "transform 180ms cubic-bezier(0.25, 0.85, 0.35, 1)",
                      }}
                    />
                  )}
                </button>
              )}

              <div
                style={{
                  display: (!railMode && isCollapsed) ? "none" : "block",
                  marginTop: railMode ? 0 : 2,
                }}
              >
                {group.items.map((item) => (
                  <SidebarLink
                    key={item.page}
                    item={item}
                    active={currentPageName === item.page}
                    railMode={railMode}
                    onClick={() => onNavigate(item.page)}
                    isFavorite={favorites.includes(item.page)}
                    onToggleFavorite={toggleFavorite}
                  />
                ))}
              </div>
            </div>
          );
        })}
      </nav>

      {/* ── Recent section — only in expanded mode, when relevant ─ */}
      {!railMode && recentItems.length > 0 && showRecents && (
        <div
          style={{
            padding: "8px 14px 12px",
            borderTop: "1px solid var(--divider)",
            background: "var(--bg-surface-low)",
          }}
        >
          <button
            onClick={() => setShowRecents((v) => !v)}
            style={{
              width: "100%",
              background: "none",
              border: "none",
              padding: "4px 0 6px",
              display: "flex",
              alignItems: "center",
              gap: 6,
              cursor: "pointer",
              color: "var(--text-muted)",
            }}
          >
            <Clock size={10} strokeWidth={2} />
            <span style={{
              fontFamily: "var(--font-mono)",
              fontSize: 8,
              fontWeight: 700,
              letterSpacing: "0.16em",
              textTransform: "uppercase",
            }}>
              Recent
            </span>
          </button>
          <div style={{ display: "flex", flexDirection: "column", gap: 1 }}>
            {recentItems.map((it) => {
              const Icon = PAGE_ICON[it.page] || FallbackIcon;
              return (
                <button
                  key={it.page}
                  onClick={() => onNavigate(it.page)}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 8,
                    padding: "5px 8px",
                    background: "none",
                    border: "none",
                    borderRadius: 5,
                    cursor: "pointer",
                    width: "100%",
                    textAlign: "left",
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    color: "var(--text-muted)",
                    transition: "all 120ms",
                  }}
                  onMouseEnter={(e) => {
                    prefetchRoute(it.page);
                    e.currentTarget.style.background = "var(--nav-hover-bg, rgba(255,255,255,0.04))";
                    e.currentTarget.style.color = "var(--text-secondary)";
                  }}
                  onFocus={() => prefetchRoute(it.page)}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "none";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}
                >
                  <Icon size={12} strokeWidth={1.75} style={{ flexShrink: 0, opacity: 0.7 }} />
                  <span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                    {it.label}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </aside>
  );
}

// ── Favorites section (expanded mode) ──────────────────────────────
function FavoritesSection({ items, currentPageName, onNavigate, onUnpin }) {
  const [collapsed, setCollapsed] = useState(false);

  return (
    <div style={{ marginBottom: 8 }}>
      <button
        onClick={() => setCollapsed((v) => !v)}
        style={{
          width: "100%",
          padding: "6px 14px 4px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          cursor: "pointer",
          background: "none",
          border: "none",
          userSelect: "none",
          textAlign: "left",
        }}
        onMouseEnter={(e) => {
          const label = e.currentTarget.querySelector("[data-label]");
          if (label) label.style.color = "var(--text-secondary)";
        }}
        onMouseLeave={(e) => {
          const label = e.currentTarget.querySelector("[data-label]");
          if (label) label.style.color = "var(--accent)";
        }}
      >
        <span style={{ display: "flex", alignItems: "center", gap: 5 }}>
          <Star size={9} strokeWidth={2.5} style={{ color: "var(--accent)", fill: "var(--accent)" }} />
          <span
            data-label
            className="sbd-nav-section"
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 9,
              fontWeight: 700,
              letterSpacing: "0.16em",
              color: "var(--accent)",
              transition: "color 140ms",
            }}
          >
            FAVORITES
          </span>
        </span>
        <ChevronRightIcon
          size={12}
          strokeWidth={2}
          style={{
            color: "var(--text-muted)",
            transform: collapsed ? "rotate(0deg)" : "rotate(90deg)",
            transition: "transform 180ms cubic-bezier(0.25, 0.85, 0.35, 1)",
          }}
        />
      </button>
      {!collapsed && (
        <div style={{ marginTop: 2 }}>
          {items.map((item) => (
            <FavoriteLink
              key={item.page}
              item={item}
              active={currentPageName === item.page}
              onClick={() => onNavigate(item.page)}
              onUnpin={() => onUnpin(item.page)}
            />
          ))}
        </div>
      )}
      {/* Divider beneath favorites */}
      <div
        style={{
          height: 1,
          margin: collapsed ? "6px 14px 4px" : "8px 14px 4px",
          background: "var(--divider)",
          opacity: 0.6,
        }}
      />
    </div>
  );
}

// ── Favorites section (rail mode) ─────────────────────────────────
function FavoritesSectionRail({ items, currentPageName, onNavigate, onUnpin }) {
  return (
    <div style={{ marginBottom: 4 }}>
      <div
        style={{
          display: "flex",
          justifyContent: "center",
          padding: "4px 0 2px",
        }}
      >
        <Star size={10} strokeWidth={2.5} style={{ color: "var(--accent)", fill: "var(--accent)" }} />
      </div>
      {items.map((item) => {
        const Icon = PAGE_ICON[item.page] || FallbackIcon;
        const active = currentPageName === item.page;
        return (
          <FavoriteRailLink
            key={item.page}
            item={item}
            active={active}
            onClick={() => onNavigate(item.page)}
          />
        );
      })}
      <div
        style={{
          height: 1,
          margin: "4px 12px 8px",
          background: "var(--divider)",
          opacity: 0.6,
        }}
      />
    </div>
  );
}

// ── Single favorite link (expanded) ───────────────────────────────
function FavoriteLink({ item, active, onClick, onUnpin }) {
  const [hovered, setHovered] = useState(false);
  const Icon = PAGE_ICON[item.page] || FallbackIcon;
  const warmRoute = () => prefetchRoute(item.page);

  const iconColor = active
    ? "var(--accent)"
    : hovered ? "var(--text-primary)" : "var(--text-secondary)";
  const textColor = active
    ? "var(--text-primary)"
    : hovered ? "var(--text-primary)" : "var(--text-secondary)";

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={`sbd-nav-item${active ? " is-active" : ""}`}
        onFocus={warmRoute}
        style={{
          position: "relative",
          width: "calc(100% - 12px)",
          height: 32,
          margin: "1px 6px",
          padding: "0 10px 0 30px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: active
            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
            : hovered ? "var(--nav-hover-bg, rgba(255,255,255,0.04))" : "transparent",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          transition: "background 140ms",
          userSelect: "none",
          textAlign: "left",
        }}
      >
        {active && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: -6,
              top: 6, bottom: 6,
              width: 2,
              background: "var(--accent)",
              borderRadius: "0 2px 2px 0",
              boxShadow: "0 0 6px var(--accent)",
            }}
          />
        )}
        <Icon
          size={15}
          strokeWidth={1.75}
          color={iconColor}
          style={{ flexShrink: 0, transition: "color 140ms" }}
        />
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            fontWeight: active ? 600 : 500,
            color: textColor,
            flex: 1,
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: active ? "0.005em" : "0",
            transition: "color 140ms",
          }}
        >
          {item.label}
        </span>
      </button>
      {/* Unpin star — visible on hover */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onUnpin(); }}
          title="Remove from favorites"
          aria-label={`Unpin ${item.label}`}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 4,
            color: "var(--accent)",
            transition: "opacity 120ms",
            zIndex: 2,
          }}
        >
          <Star size={11} strokeWidth={2} fill="var(--accent)" />
        </button>
      )}
    </div>
  );
}

// ── Single favorite rail link ─────────────────────────────────────
function FavoriteRailLink({ item, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  const Icon = PAGE_ICON[item.page] || FallbackIcon;
  const warmRoute = () => prefetchRoute(item.page);

  const iconColor = active
    ? "var(--accent)"
    : hovered ? "var(--text-primary)" : "var(--text-secondary)";

  return (
    <div style={{ position: "relative", padding: "1px 6px" }}>
      <button
        onClick={onClick}
        title={item.label}
        aria-label={item.label}
        aria-current={active ? "page" : undefined}
        className={`sbd-nav-item${active ? " is-active" : ""}`}
        onMouseEnter={() => { setHovered(true); warmRoute(); }}
        onMouseLeave={() => setHovered(false)}
        onFocus={warmRoute}
        style={{
          width: 44, height: 36,
          margin: "0 auto",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          background: active
            ? "color-mix(in srgb, var(--accent) 14%, transparent)"
            : hovered ? "var(--nav-hover-bg, rgba(255,255,255,0.04))" : "transparent",
          border: active
            ? "1px solid color-mix(in srgb, var(--accent) 40%, transparent)"
            : "1px solid transparent",
          borderRadius: 8,
          cursor: "pointer",
          transition: "all 140ms",
          position: "relative",
        }}
      >
        <Icon size={16} strokeWidth={1.75} color={iconColor} style={{ transition: "color 140ms" }} />
        {active && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: -8, top: 8, bottom: 8,
              width: 2,
              background: "var(--accent)",
              borderRadius: "0 2px 2px 0",
              boxShadow: "0 0 6px var(--accent)",
            }}
          />
        )}
      </button>
      {hovered && (
        <div
          role="tooltip"
          style={{
            position: "absolute",
            left: 52,
            top: "50%",
            transform: "translateY(-50%)",
            background: "var(--bg-elevated, var(--bg-surface))",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "5px 10px",
            fontFamily: "var(--font-body)",
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text-primary)",
            whiteSpace: "nowrap",
            boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
            zIndex: 1000,
            pointerEvents: "none",
          }}
        >
          {item.label}
        </div>
      )}
    </div>
  );
}

// ── Single nav link ─────────────────────────────────────────────────
function SidebarLink({ item, active, railMode, onClick, isFavorite, onToggleFavorite }) {
  const [hovered, setHovered] = useState(false);
  const Icon = PAGE_ICON[item.page] || FallbackIcon;
  const warmRoute = () => prefetchRoute(item.page);

  // Common colors per state — keeps hover + active feeling consistent
  // across rail and expanded modes.
  const iconColor = active
    ? "var(--accent)"
    : hovered ? "var(--text-primary)" : "var(--text-secondary)";
  const textColor = active
    ? "var(--text-primary)"
    : hovered ? "var(--text-primary)" : "var(--text-secondary)";

  if (railMode) {
    return (
      <div style={{ position: "relative", padding: "1px 6px" }}>
        <button
          onClick={onClick}
          title={item.label}
          aria-label={item.label}
          aria-current={active ? "page" : undefined}
          className={`sbd-nav-item${active ? " is-active" : ""}`}
          onMouseEnter={() => { setHovered(true); warmRoute(); }}
          onMouseLeave={() => setHovered(false)}
          onFocus={warmRoute}
          style={{
            width: 44, height: 36,
            margin: "0 auto",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: active
              ? "color-mix(in srgb, var(--accent) 14%, transparent)"
              : hovered ? "var(--nav-hover-bg, rgba(255,255,255,0.04))" : "transparent",
            border: active
              ? "1px solid color-mix(in srgb, var(--accent) 40%, transparent)"
              : "1px solid transparent",
            borderRadius: 8,
            cursor: "pointer",
            transition: "all 140ms",
            position: "relative",
          }}
        >
          <Icon size={16} strokeWidth={1.75} color={iconColor} style={{ transition: "color 140ms" }} />
          {active && (
            <span
              aria-hidden
              style={{
                position: "absolute",
                left: -8, top: 8, bottom: 8,
                width: 2,
                background: "var(--accent)",
                borderRadius: "0 2px 2px 0",
                boxShadow: "0 0 6px var(--accent)",
              }}
            />
          )}
        </button>
        {hovered && (
          <div
            role="tooltip"
            style={{
              position: "absolute",
              left: 52,
              top: "50%",
              transform: "translateY(-50%)",
              background: "var(--bg-elevated, var(--bg-surface))",
              border: "1px solid var(--border-default)",
              borderRadius: 6,
              padding: "5px 10px",
              fontFamily: "var(--font-body)",
              fontSize: 11,
              fontWeight: 600,
              color: "var(--text-primary)",
              whiteSpace: "nowrap",
              boxShadow: "0 6px 20px rgba(0,0,0,0.35)",
              zIndex: 1000,
              pointerEvents: "none",
            }}
          >
            {item.label}
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      style={{ position: "relative" }}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
    >
      <button
        onClick={onClick}
        aria-current={active ? "page" : undefined}
        className={`sbd-nav-item${active ? " is-active" : ""}`}
        onFocus={warmRoute}
        style={{
          position: "relative",
          width: "calc(100% - 12px)",
          height: 32,
          margin: "1px 6px",
          padding: "0 10px 0 30px",
          display: "flex",
          alignItems: "center",
          gap: 10,
          background: active
            ? "color-mix(in srgb, var(--accent) 10%, transparent)"
            : hovered ? "var(--nav-hover-bg, rgba(255,255,255,0.04))" : "transparent",
          border: "none",
          borderRadius: 6,
          cursor: "pointer",
          transition: "background 140ms",
          userSelect: "none",
          textAlign: "left",
        }}
      >
        {/* 2px active indicator — a consistent fixed marker, not a sliding
            bar, which felt too aggressive. Anchored to the left edge
            of the row so the eye locks onto it cleanly. */}
        {active && (
          <span
            aria-hidden
            style={{
              position: "absolute",
              left: -6,
              top: 6, bottom: 6,
              width: 2,
              background: "var(--accent)",
              borderRadius: "0 2px 2px 0",
              boxShadow: "0 0 6px var(--accent)",
            }}
          />
        )}
        <Icon
          size={15}
          strokeWidth={1.75}
          color={iconColor}
          style={{ flexShrink: 0, transition: "color 140ms" }}
        />
        <span
          style={{
            fontFamily: "var(--font-body)",
            fontSize: 12.5,
            fontWeight: active ? 600 : 500,
            color: textColor,
            flex: 1,
            lineHeight: 1.2,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            letterSpacing: active ? "0.005em" : "0",
            transition: "color 140ms",
          }}
        >
          {item.label}
        </span>
      </button>
      {/* Pin/star toggle — appears on hover */}
      {hovered && (
        <button
          onClick={(e) => { e.stopPropagation(); onToggleFavorite(item.page); }}
          title={isFavorite ? "Remove from favorites" : "Add to favorites"}
          aria-label={isFavorite ? `Unpin ${item.label}` : `Pin ${item.label}`}
          style={{
            position: "absolute",
            right: 10,
            top: "50%",
            transform: "translateY(-50%)",
            width: 20,
            height: 20,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            background: "none",
            border: "none",
            cursor: "pointer",
            borderRadius: 4,
            color: isFavorite ? "var(--accent)" : "var(--text-muted)",
            transition: "color 120ms",
            zIndex: 2,
          }}
        >
          <Star
            size={11}
            strokeWidth={2}
            fill={isFavorite ? "var(--accent)" : "none"}
          />
        </button>
      )}
    </div>
  );
}
