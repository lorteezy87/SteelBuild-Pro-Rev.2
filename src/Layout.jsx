/**
 * Layout.jsx - Application shell
 *
 * Thin composition layer that wires together:
 *  - Top utility bar (brand, search, density, modules, bell, user, project)
 *  - Desktop sidebar navigation
 *  - Mobile hamburger drawer
 *  - Content area with error banner
 *  - Global search modal, quick-add FAB, toast notifications
 *
 * All data definitions live in src/config/moduleRegistry.js.
 * All sub-components live in src/components/nav/.
 */

import React, { useState, useEffect, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { Toaster } from "sonner";

// Nav components (extracted from Layout)
import ModulesDropdown from "./components/nav/ModulesDropdown";
import BellDropdown from "./components/nav/BellDropdown";
import SidebarNav from "./components/nav/SidebarNav";
import MobileDrawer, { HamburgerMenu } from "./components/nav/MobileDrawer";
import ThemeToggleButton from "./components/nav/ThemeToggleButton";
import ProjectErrorBanner from "./components/nav/ProjectErrorBanner";

// Shared components
import GlobalSearchModal from "./components/search/GlobalSearchModal";
import QuickAddFAB from "./components/shared/QuickAddFAB";
import ProjectPillDropdown from "./components/nav/ProjectPillDropdown";

// Context
import { useProjectContext } from "./components/shared/useProjectContext";
import { AuthContext } from "@/lib/AuthContext";

// Utilities
import { batchProcess } from "@/utils/batchProcess";

// Config
import { PRIMARY_TABS, TAB_DEFAULT_PAGE } from "@/config/moduleRegistry";

// ─────────────────────────────────────────────────────────────────────
export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();

  // Auth
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;
  const logout = authCtx?.logout || (() => {});

  // UI state
  const [gridOpen, setGridOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  // Density preference
  useEffect(() => {
    try {
      const saved = localStorage.getItem("sbp-density");
      if (saved) document.documentElement.setAttribute("data-density", saved);
    } catch { /* ignore */ }
  }, []);

  // Active project
  const { activeProject: ctxActiveProject } = useProjectContext();
  const activeProjectId = ctxActiveProject?.id || null;

  // Responsive breakpoint
  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  // Cmd+K search shortcut
  useEffect(() => {
    const handler = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen(true);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, []);

  // ── Nav badge data ───────────────────────────────────────────────
  const qc = useQueryClient();

  const { data: allAlerts = [] } = useQuery({
    queryKey: ["alerts-nav", activeProjectId],
    queryFn: async () => {
      try {
        // Fetch all alerts for this project, then filter client-side.
        // This avoids 400 errors if is_dismissed column doesn't exist yet.
        const raw = await base44.entities.Alert.filter({ project_id: activeProjectId });
        return raw.filter((a) => !a.is_dismissed && !a.dismissed_at);
      } catch (err) {
        console.warn("[Layout] alerts query failed:", err?.message || err);
        return [];
      }
    },
    refetchInterval: 120000, staleTime: 60000, enabled: !!activeProjectId,
    retry: false,
  });

  const { data: navRFIs = [] } = useQuery({
    queryKey: ["rfis-nav-count", activeProjectId],
    queryFn: () => base44.entities.RFI.filter({ project_id: activeProjectId }),
    refetchInterval: 120000, staleTime: 60000, enabled: !!activeProjectId,
  });

  const { data: navDrawings = [] } = useQuery({
    queryKey: ["drawings-nav-count", activeProjectId],
    queryFn: () => base44.entities.Drawing.filter({ project_id: activeProjectId }),
    refetchInterval: 120000, staleTime: 60000, enabled: !!activeProjectId,
  });

  const { data: navDeliveries = [] } = useQuery({
    queryKey: ["deliveries-nav-count", activeProjectId],
    queryFn: () => base44.entities.Delivery.filter({ project_id: activeProjectId }),
    refetchInterval: 120000, staleTime: 60000, enabled: !!activeProjectId,
  });

  const overdueRFICount = navRFIs.filter((r) =>
    r.date_required && new Date(r.date_required) < new Date() &&
    !["Answered", "Closed"].includes(r.status)
  ).length;

  const overdueDrawingCount = navDrawings.filter((d) =>
    d.due_date && new Date(d.due_date) < new Date() && d.stage !== "Released"
  ).length;

  const overdueDeliveryCount = navDeliveries.filter((d) =>
    d.scheduled_date && new Date(d.scheduled_date) < new Date() && d.status !== "Delivered"
  ).length;

  const markAllReadMut = useMutation({
    mutationFn: async () => {
      const unread = allAlerts.filter((a) => !a.is_read);
      try {
        return await batchProcess(unread, (a) =>
          base44.entities.Alert.update(a.id, { is_read: true })
        );
      } catch {
        // is_read column may not exist yet — silently degrade
        console.warn("[Layout] markAllRead failed — is_read column may not exist");
        return { succeeded: [], failed: unread };
      }
    },
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts-nav"] }),
  });

  const unreadAlerts = allAlerts.filter((a) => !a.is_read && !a.is_dismissed);
  const unreadCount = unreadAlerts.length;

  // Page tracking (non-critical)
  useEffect(() => {
    if (!currentPageName) return;
    try { /* Base44 internal page tracking */ } catch { /* suppress */ }
  }, [currentPageName]);

  // ── Navigation handlers ──────────────────────────────────────────
  const activeTab = PRIMARY_TABS.find((t) => t.pages.includes(currentPageName));

  const handleTabClick = (tab) => {
    const dest = TAB_DEFAULT_PAGE[tab.label];
    if (dest) navigate(createPageUrl(dest));
  };

  const handleNavigate = (page) => navigate(createPageUrl(page));

  // ── Render ───────────────────────────────────────────────────────
  return (
    <div style={{
      minHeight: "100vh", width: "100%",
      display: "flex", alignItems: "flex-start", justifyContent: "center",
      padding: 0, background: "var(--bg-base)",
      fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif",
    }}>
      {/* Mobile Drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} onNavigate={handleNavigate} />

      <div style={{
        background: "var(--bg-surface)", borderRadius: 0,
        width: "100%", maxWidth: "100%", minHeight: "100vh",
        overflow: "hidden", boxShadow: "none",
        position: "relative", display: "flex", flexDirection: "column",
      }}>
        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0, height: 2,
          background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
          zIndex: 200, opacity: 0.6,
        }} />

        {/* ── TOP UTILITY BAR ─────────────────────────────────────── */}
        <nav className="nav-glass" style={{
          height: 36,
          background: "var(--nav-bg)", borderBottom: "1px solid var(--border-default)",
          padding: "0 12px",
          display: "flex", alignItems: "center", justifyContent: "space-between",
          flexShrink: 0, position: "relative", zIndex: 100, gap: 8,
          backdropFilter: "blur(20px)", WebkitBackdropFilter: "blur(20px)",
        }}>
          {/* LEFT: Brand + Hamburger */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isMobile && <HamburgerMenu open={mobileOpen} onToggle={() => setMobileOpen((o) => !o)} />}
            <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => handleNavigate("Dashboard")}>
              <img src="/logo.png" alt="SteelBuild Pro" style={{ height: 26, width: "auto", objectFit: "contain" }} />
            </div>
            {!isMobile && <div style={{ width: 1, height: 16, background: "var(--divider)", margin: "0 6px" }} />}
            {!isMobile && (
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.1em", textTransform: "uppercase" }}>
                {currentPageName?.replace(/([A-Z])/g, " $1").trim() || "Dashboard"}
              </span>
            )}
          </div>

          {/* RIGHT: Actions */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Search trigger */}
            {!isMobile && (
              <div
                onClick={() => setSearchOpen(true)}
                title="Search (Cmd+K)"
                style={{
                  height: 32, borderRadius: 8,
                  background: "var(--hover-bg)", border: "1px solid var(--border-default)",
                  display: "flex", alignItems: "center", gap: 8,
                  padding: "0 10px", cursor: "pointer",
                  color: "var(--text-muted)", transition: "all 0.15s", minWidth: 180,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--accent-muted)"; e.currentTarget.style.borderColor = "var(--accent-border)"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "var(--hover-bg)"; e.currentTarget.style.borderColor = "var(--border-default)"; }}
              >
                <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" style={{ flexShrink: 0, opacity: 0.6 }}>
                  <circle cx="8" cy="8" r="6" /><line x1="14" y1="14" x2="19" y2="19" />
                </svg>
                <span style={{ fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-muted)", flex: 1 }}>Search...</span>
                <span style={{
                  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 600,
                  color: "var(--text-muted)", background: "var(--bg-surface-high)",
                  border: "1px solid var(--border-default)", borderRadius: 4,
                  padding: "1px 5px", lineHeight: "16px",
                }}>
                  {navigator.platform?.includes("Mac") ? "\u2318K" : "Ctrl+K"}
                </span>
              </div>
            )}

            {/* Density toggle + Modules grid — desktop only */}
            {!isMobile && (
              <div style={{ position: "relative" }}>
                <div
                  title="Toggle compact/comfortable density"
                  onClick={() => {
                    const html = document.documentElement;
                    const current = html.getAttribute("data-density");
                    const next = current === "compact" ? "comfortable" : "compact";
                    html.setAttribute("data-density", next);
                    try { localStorage.setItem("sbp-density", next); } catch { /* ignore */ }
                  }}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: "var(--hover-bg)", border: "1px solid var(--border)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer", color: "var(--text-muted)", transition: "all 0.15s",
                    fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700,
                  }}
                >
                  {"\u2261"}
                </div>

                <div
                  title="All Modules"
                  onClick={() => setGridOpen((o) => !o)}
                  style={{
                    width: 32, height: 32, borderRadius: 8,
                    background: gridOpen ? "var(--accent-muted)" : "var(--hover-bg)",
                    border: `1px solid ${gridOpen ? "var(--accent-border)" : "var(--border)"}`,
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    color: gridOpen ? "var(--accent)" : "var(--text-muted)",
                    transition: "all 0.15s",
                  }}
                >
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
                    <rect x="0" y="0" width="6" height="6" rx="1.5" />
                    <rect x="8" y="0" width="6" height="6" rx="1.5" />
                    <rect x="0" y="8" width="6" height="6" rx="1.5" />
                    <rect x="8" y="8" width="6" height="6" rx="1.5" />
                  </svg>
                </div>

                <ModulesDropdown
                  open={gridOpen}
                  onClose={() => setGridOpen(false)}
                  onNavigate={handleNavigate}
                  userRole={user?.role}
                  alertCounts={{
                    unread: unreadCount,
                    rfi: allAlerts.filter((a) =>
                      (a.alert_type === "RFI Overdue" || a.alert_type === "RFI_Overdue") && !a.is_dismissed
                    ).length,
                    co: allAlerts.filter((a) => a.alert_type === "CO Pending" && !a.is_dismissed).length,
                    drawings: overdueDrawingCount,
                    deliveries: overdueDeliveryCount,
                  }}
                />
              </div>
            )}

            {/* Theme Toggle */}
            <ThemeToggleButton />

            {/* Bell */}
            <BellDropdown
              alerts={unreadAlerts}
              unreadCount={unreadCount}
              onMarkAllRead={() => markAllReadMut.mutate()}
              onViewAll={() => handleNavigate("AlertsCenter")}
            />

            {/* User + Sign Out */}
            <div style={{ display: "flex", alignItems: "center", gap: 12, marginLeft: "auto", paddingRight: 0 }}>
              <div style={{
                fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)",
                letterSpacing: "0.10em", textTransform: "uppercase",
              }}>
                {user?.email || user?.full_name || ""}
              </div>
              <button
                onClick={logout}
                style={{
                  background: "var(--bg-hover)", border: "1px solid var(--border)",
                  borderRadius: 6, padding: "4px 12px",
                  color: "var(--text-muted)", fontFamily: "var(--font-mono)",
                  fontSize: 8, letterSpacing: "0.10em", cursor: "pointer",
                  transition: "all 0.15s", textTransform: "uppercase", fontWeight: 600,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--danger-muted)";
                  e.currentTarget.style.borderColor = "var(--danger-border)";
                  e.currentTarget.style.color = "var(--danger)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-hover)";
                  e.currentTarget.style.borderColor = "var(--border)";
                  e.currentTarget.style.color = "var(--text-muted)";
                }}
              >
                SIGN OUT
              </button>
            </div>

            {/* Project pill dropdown */}
            <ProjectPillDropdown />
          </div>
        </nav>

        {/* ── SIDEBAR + CONTENT ───────────────────────────────────── */}
        <div style={{ display: "flex", flex: 1, minHeight: 0, overflow: "hidden" }}>
          {!isMobile && (
            <SidebarNav
              currentPageName={currentPageName}
              onNavigate={handleNavigate}
              visible={!isMobile}
            />
          )}

          <div style={{ flex: 1, display: "flex", flexDirection: "column", minWidth: 0, overflow: "hidden" }}>
            <main style={{
              flex: 1, overflowY: "auto", padding: 0,
              background: "var(--bg-base)", color: "var(--text-primary)",
              display: "flex", flexDirection: "column",
            }}>
              <ProjectErrorBanner />
              {children}
            </main>
          </div>
        </div>

        {/* ── OVERLAYS ────────────────────────────────────────────── */}
        <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />
        <QuickAddFAB />
        <Toaster
          position="bottom-right"
          toastOptions={{
            style: {
              background: "var(--bg-elevated)",
              border: "1px solid var(--border-strong)",
              color: "var(--text-primary)",
              fontFamily: "'Inter', sans-serif",
              fontSize: 13, borderRadius: 10,
              boxShadow: "var(--shadow-lg)",
            },
          }}
        />
      </div>
    </div>
  );
}
