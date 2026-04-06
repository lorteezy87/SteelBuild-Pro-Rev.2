import React, { useState, useEffect, useRef, useContext } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import GlobalSearchModal from "./components/search/GlobalSearchModal";
import { Toaster } from "sonner";
import QuickAddFAB from "./components/shared/QuickAddFAB";
import { ProjectProvider } from "./components/shared/ProjectContext";
import { useProjectContext } from "./components/shared/useProjectContext";
import ProjectPillDropdown from "./components/nav/ProjectPillDropdown";
import { PMAProvider } from "./components/pma/usePMAContext";
import PMAPanel from "./components/pma/PMAPanel";
import { usePMA } from "./components/pma/usePMAContext";
import { AuthContext } from "@/lib/AuthContext";
import { useTheme } from "./components/shared/ThemeContext";

// ─── Tab → page mapping ───────────────────────────────────────────
const PRIMARY_TABS = [
{ label: "DASHBOARD", pages: ["Dashboard"] },
{ label: "PROJECTS", pages: ["Projects", "ExecutiveView"] },
{ label: "RFIs", pages: ["RFIs", "RFIHub"] },
{ label: "DRAWINGS", pages: ["Submittals", "DrawingViewer"] },
{ label: "FABRICATION", pages: ["WorkPackages", "Constraints", "FabRelease", "Procurement", "LookAhead", "LookAheadSchedule", "GanttChart"] },
{ label: "DELIVERIES", pages: ["Deliveries"] },
{ label: "SCHEDULE", pages: ["Schedule", "GanttChart", "LookAheadSchedule"] },
{ label: "FIELD", pages: ["DailyLogs", "Photos", "ProductionNotes"] },
{ label: "COST", pages: ["Financials", "CostDashboard", "ChangeOrders", "SOV"] },
{ label: "RESOURCES", pages: ["ResourceScheduling", "ResourceManagement"] },
{ label: "REPORTS", pages: ["AIInsights", "JobStatusReport", "DecisionLog", "AlertsCenter", "Activity"] },
{ label: "QUALITY", pages: ["Inspections", "Safety", "Punchlist", "QualityControl"] },
{ label: "CLOSEOUT", pages: ["ProjectCloseout", "Warranty", "ChangeRequests"] }];


const TAB_DEFAULT_PAGE = {
  "DASHBOARD": "Dashboard",
  "PROJECTS": "Projects",
  "RFIs": "RFIs",
  "DRAWINGS": "Submittals",
  "FABRICATION": "WorkPackages",
  "DELIVERIES": "Deliveries",
  "SCHEDULE": "Schedule",
  "FIELD": "DailyLogs",
  "COST": "Financials",
  "RESOURCES": "ResourceScheduling",
  "REPORTS": "AIInsights",
  "QUALITY": "Inspections",
  "CLOSEOUT": "ProjectCloseout"
};

const ALL_MODULES = [
{ icon: "◈", name: "Dashboard", group: "Overview", page: "Dashboard" },
{ icon: "◉", name: "Executive View", group: "Overview", page: "ExecutiveView" },
{ icon: "▤", name: "Projects", group: "Overview", page: "Projects" },
{ icon: "≡", name: "Scope & Exclusions", group: "Setup", page: "ScopeExclusions" },
{ icon: "☰", name: "Contacts", group: "Setup", page: "Contacts" },
{ icon: "🔔", name: "Alerts", group: "Setup", page: "AlertsCenter" },
{ icon: "▦", name: "Submittals", group: "Detailing", page: "Submittals" },
{ icon: "△", name: "3D Model Viewer", group: "Detailing", page: "ModelViewer" },
{ icon: "⚑", name: "RFI Hub", group: "Comms", page: "RFIs" },
{ icon: "⚑", name: "RFI Command Center", group: "Comms", page: "RFIHub" },
{ icon: "📝", name: "Production Notes", group: "Comms", page: "ProductionNotes" },
{ icon: "👥", name: "Meetings", group: "Comms", page: "Meetings" },
{ icon: "✓", name: "Action Items", group: "Comms", page: "ActionItems" },
{ icon: "▦", name: "Work Packages", group: "Fab", page: "WorkPackages" },
{ icon: "🚧", name: "Constraints", group: "Fab", page: "Constraints" },
{ icon: "🏭", name: "Fab Release", group: "Fabrication", page: "FabRelease" },
{ icon: "📦", name: "Procurement", group: "Fabrication", page: "Procurement" },
{ icon: "👁", name: "Look-Ahead", group: "Fab", page: "LookAheadSchedule" },
{ icon: "▥", name: "Gantt Chart", group: "Fab", page: "GanttChart" },
{ icon: "📦", name: "Deliveries", group: "Logistics", page: "Deliveries" },
{ icon: "▥", name: "Schedule", group: "Field", page: "Schedule" },
{ icon: "📋", name: "Daily Logs", group: "Field", page: "DailyLogs" },
{ icon: "📷", name: "Photos", group: "Field", page: "Photos" },
{ icon: "◎", name: "Budget Control", group: "Cost", page: "Financials" },
{ icon: "💰", name: "Cost Dashboard", group: "Cost", page: "CostDashboard" },
{ icon: "📊", name: "SOV", group: "Cost", page: "SOV" },
{ icon: "$", name: "Change Orders", group: "Cost", page: "ChangeOrders" },
{ icon: "👥", name: "Resources", group: "Resources", page: "ResourceManagement" },
{ icon: "▨", name: "Crew Scheduling", group: "Resources", page: "ResourceScheduling" },
{ icon: "📋", name: "Job Status Report", group: "Reporting", page: "JobStatusReport" },
{ icon: "✨", name: "Portfolio Overview", group: "Reporting", page: "AIInsights" },
{ icon: "📊", name: "Activity Log", group: "Reporting", page: "Activity" },
{ icon: "🔍", name: "Inspections", group: "Quality", page: "Inspections" },
{ icon: "⚠", name: "Safety", group: "Quality", page: "Safety" },
{ icon: "✓", name: "Punchlist", group: "Quality", page: "Punchlist" },
{ icon: "🧪", name: "Quality Control", group: "Quality", page: "QualityControl" },
{ icon: "🏁", name: "Project Closeout", group: "Closeout", page: "ProjectCloseout" },
{ icon: "🛡", name: "Warranty", group: "Closeout", page: "Warranty" },
{ icon: "📝", name: "Change Requests", group: "Closeout", page: "ChangeRequests" },
{ icon: "🏢", name: "Vendors", group: "Setup", page: "Vendors" }];


// ─── time ago helper ──────────────────────────────────────────────
function timeAgo(dateStr) {
  if (!dateStr) return "";
  const diff = Date.now() - new Date(dateStr).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  return `${Math.floor(hrs / 24)}d ago`;
}

const SEVERITY_COLOR = {
  Critical: "var(--status-error)",
  High: "var(--status-warning)",
  Medium: "var(--status-warning)",
  Low: "var(--text-muted)"
};

// ─── NavTab ───────────────────────────────────────────────────────
function NavTab({ tab, active, onClick }) {
  const [hovered, setHovered] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      style={{
        fontFamily: "var(--font-mono)",
        fontSize: 10,
        fontWeight: active ? 700 : 600,
        letterSpacing: "0.10em",
        textTransform: "uppercase",
        color: active ? "var(--accent)" : hovered ? "var(--text-primary)" : "var(--text-secondary)",
        padding: "12px 14px",
        height: 52,
        display: "flex", alignItems: "center",
        cursor: "pointer",
        background: "transparent",
        border: "none",
        borderBottom: active ? "2px solid var(--accent)" : "2px solid transparent",
        borderRadius: 0,
        transition: "all 0.15s",
        flexShrink: 0,
        whiteSpace: "nowrap",
      }}>
      {tab.label}
    </button>);
}

// ─── Modules Dropdown ─────────────────────────────────────────────
const NAV_GROUPS = [
{
  label: "OVERVIEW",
  items: [
  { label: "Dashboard", icon: "◈", page: "Dashboard" },
  { label: "Executive View", icon: "▤", page: "ExecutiveView" }]

},
{
  label: "USER",
  items: [
  { label: "Settings", icon: "⚙", page: "Settings" }]

},
{
  label: "JOB SETUP",
  items: [
  { label: "Projects", icon: "⊟", page: "Projects" },
  { label: "Scope & Exclusions", icon: "≡", page: "ScopeExclusions" },
  { label: "Contacts", icon: "👤", page: "Contacts" },
  { label: "Alerts", icon: "🔔", page: "AlertsCenter", badgeKey: "unread" },
  { label: "User Management", icon: "👥", page: "UsersManagement" }]

},
{
  label: "DOCUMENTS & DRAWINGS",
  items: [
  { label: "Document Repository", icon: "📁", page: "Documents" },
  { label: "Drawing Log", icon: "⊞", page: "Submittals", badgeKey: "drawings" },
  { label: "Drawing Viewer", icon: "📐", page: "DrawingViewer" },
  { label: "3D Model Viewer", icon: "△", page: "ModelViewer" }]

},
{
  label: "COMMUNICATIONS",
  items: [
  { label: "RFI Hub (Classic)", icon: "⚑", page: "RFIs", badgeKey: "rfi" },
  { label: "RFI Hub (Command Center)", icon: "⚑", page: "RFIHub", badgeKey: "rfi" },
  { label: "Meetings", icon: "👥", page: "Meetings" },
  { label: "Action Items", icon: "☑", page: "ActionItems" },
  { label: "Production Notes", icon: "📝", page: "ProductionNotes" }]

},
{
  label: "FABRICATION",
  items: [
  { label: "Work Packages", icon: "▦", page: "WorkPackages" },
  { label: "Constraints", icon: "🚧", page: "Constraints" },
  { label: "Fab Release", icon: "🏭", page: "FabRelease" },
  { label: "Procurement", icon: "📦", page: "Procurement" },
  { label: "Look-Ahead", icon: "👁", page: "LookAheadSchedule" }]

},
{
  label: "FIELD & LOGISTICS",
  items: [
  { label: "Daily Logs", icon: "📋", page: "DailyLogs" },
  { label: "Deliveries", icon: "📦", page: "Deliveries" },
  { label: "Photos", icon: "📷", page: "Photos" }]

},
{
  label: "SCHEDULING",
  items: [
  { label: "Gantt Schedule", icon: "▥", page: "Schedule" },
  { label: "Resource Board", icon: "👥", page: "ResourceManagement" },
  { label: "Weekly Look-Ahead", icon: "📅", page: "LookAheadSchedule" }]

},
{
  label: "COST CONTROL",
  items: [
  { label: "Budget Control", icon: "◎", page: "Financials" },
  { label: "Schedule of Values", icon: "📊", page: "SOV" },
  { label: "Change Orders", icon: "$", page: "ChangeOrders", badgeKey: "co" },
  { label: "Expenses", icon: "💰", page: "Expenses" }]

},
{
  label: "REPORTING",
  items: [
  { label: "Job Status Report", icon: "📋", page: "JobStatusReport" },
  { label: "Decision Log", icon: "📋", page: "DecisionLog" },
  { label: "Portfolio Overview", icon: "✦", page: "AIInsights" },
  { label: "Activity Log", icon: "📊", page: "Activity" }]

}];


const COLUMN_1_GROUPS = ["OVERVIEW", "JOB SETUP", "DOCUMENTS & DRAWINGS", "COMMUNICATIONS"];
const COLUMN_2_GROUPS = ["FABRICATION", "FIELD & LOGISTICS", "SCHEDULING"];
const COLUMN_3_GROUPS = ["COST CONTROL", "REPORTING"];

const getColumn = (groupLabel) => {
  if (COLUMN_1_GROUPS.includes(groupLabel)) return 0;
  if (COLUMN_2_GROUPS.includes(groupLabel)) return 1;
  return 2;
};

function ModulesDropdown({ open, onClose, onNavigate, userRole, alertCounts = {} }) {
  const ref = useRef(null);
  const [search, setSearch] = useState("");
  const [windowWidth, setWindowWidth] = useState(window.innerWidth);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {if (ref.current && !ref.current.contains(e.target)) onClose();};
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  useEffect(() => {
    if (!open) setSearch("");
  }, [open]);

  useEffect(() => {
    const handler = () => setWindowWidth(window.innerWidth);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

  if (!open) return null;

  const isMobile = windowWidth < 760;
  const dropdownWidth = isMobile ? 280 : 720;
  const isSearching = search.trim().length > 0;

  const searchResults = isSearching ?
  NAV_GROUPS.
  flatMap((g) => g.items).
  filter((item) => item.label.toLowerCase().includes(search.toLowerCase())) :
  [];

  const columns = [[], [], []];
  NAV_GROUPS.forEach((group) => {
    columns[getColumn(group.label)].push(group);
  });

  const totalModules = NAV_GROUPS.flatMap((g) => g.items).length;

  return (
    <div ref={ref} style={{
      position: "absolute", top: "calc(100% + 4px)", right: 0,
      width: dropdownWidth,
      background: "var(--bg-surface-secondary)",
      border: "1px solid var(--border-default)",
      borderRadius: 14,
      boxShadow: "var(--shadow-lg)",
      zIndex: 999,
      overflow: "hidden",
      display: "flex",
      flexDirection: "column",
      maxHeight: isMobile ? "calc(100vh - 72px)" : "auto"
    }}>
      {/* Search bar */}
      <div style={{ padding: "10px 14px 8px", borderBottom: "1px solid var(--divider)" }}>
        <input
          placeholder="Search modules..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          autoFocus
          style={{
            width: "100%",
            background: "var(--bg-input)",
            border: "1px solid var(--border-default)",
            borderRadius: 6,
            padding: "6px 10px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 12,
            outline: "none",
            boxSizing: "border-box"
          }} />

      </div>

      {/* 3-column grid (hidden when searching) */}
      {!isSearching &&
      <div style={{
        display: "grid",
        gridTemplateColumns: isMobile ? "1fr" : "1fr 1fr 1fr",
        alignItems: "start",
        gap: 0,
        padding: isMobile ? "6px 0 12px" : "6px 0 12px",
        overflowY: isMobile ? "auto" : "visible",
        maxHeight: isMobile ? "calc(100vh - 140px)" : "none"
      }}>
          {columns.map((column, colIdx) =>
        <div
          key={colIdx}
          style={{
            borderRight: colIdx < 2 && !isMobile ? "1px solid var(--divider)" : "none",
            padding: "0"
          }}>

              {column.map((group, groupIdx) =>
          <div key={group.label}>
                  <div style={{
              padding: groupIdx === 0 ? "8px 14px 3px" : "8px 14px 3px",
              fontFamily: "var(--font-mono)",
              fontSize: 7,
              fontWeight: 700,
              letterSpacing: "0.20em",
              color: "var(--accent)",
              borderTop: groupIdx === 0 ? "none" : "1px solid var(--divider)",
              marginTop: groupIdx === 0 ? 0 : 4,
              userSelect: "none"
            }}>
                    {group.label}
                  </div>
                  {group.items.map((item) => {
              const isAdminOnly = item.adminOnly && userRole !== 'admin';
              return (
                <div
                  key={item.page}
                  onClick={() => {if (!isAdminOnly) {onNavigate(item.page);onClose();}}}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 10,
                    padding: "7px 14px",
                    cursor: isAdminOnly ? "not-allowed" : "pointer",
                    borderLeft: "2px solid transparent",
                    borderRadius: 0,
                    transition: "all 0.1s ease",
                    userSelect: "none",
                    opacity: isAdminOnly ? 0.4 : 1
                  }}
                  onMouseEnter={(e) => {
                    if (!isAdminOnly) {
                      e.currentTarget.style.background = "var(--nav-hover-bg)";
                      e.currentTarget.style.borderLeft = "2px solid var(--accent)";
                      e.currentTarget.style.borderRadius = "0";
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "transparent";
                    e.currentTarget.style.borderLeft = "2px solid transparent";
                  }}
                  title={isAdminOnly ? "Admin only" : ""}>

                        <span style={{ fontSize: 13, width: 16, textAlign: "center", opacity: 0.65, flexShrink: 0 }}>
                          {item.icon}
                        </span>
                        <span style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 12,
                    fontWeight: 500,
                    color: "var(--text-secondary)",
                    flex: 1,
                    lineHeight: 1.2
                  }}>
                          {item.label}
                          {isAdminOnly && <span style={{ fontSize: 10, color: "#FF3D3D", marginLeft: 6 }}>👑</span>}
                        </span>
                        {item.badgeKey && alertCounts[item.badgeKey] > 0 &&
                  <span style={{
                    background: "var(--status-error)",
                    color: "white",
                    borderRadius: 10,
                    padding: "1px 6px",
                    fontSize: 8,
                    fontFamily: "var(--font-mono)",
                    fontWeight: 700,
                    minWidth: 16,
                    textAlign: "center"
                  }}>
                            {alertCounts[item.badgeKey]}
                          </span>
                  }
                      </div>);

            })}
                </div>
          )}
            </div>
        )}
        </div>
      }

      {/* Search results (flat list) */}
      {isSearching &&
      <div style={{ padding: "4px 0 8px", maxHeight: "calc(100vh - 140px)", overflowY: "auto" }}>
          {searchResults.length > 0 ?
        searchResults.map((item) => {
          const isAdminOnly = item.adminOnly && userRole !== 'admin';
          return (
            <div
              key={item.page}
              onClick={() => {if (!isAdminOnly) {onNavigate(item.page);onClose();}}}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 10,
                padding: "7px 14px",
                cursor: isAdminOnly ? "not-allowed" : "pointer",
                borderLeft: "2px solid transparent",
                transition: "all 0.1s ease",
                userSelect: "none",
                opacity: isAdminOnly ? 0.4 : 1
              }}
              onMouseEnter={(e) => {
                if (!isAdminOnly) {
                  e.currentTarget.style.background = "var(--nav-hover-bg)";
                  e.currentTarget.style.borderLeft = "2px solid var(--accent)";
                }
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "transparent";
                e.currentTarget.style.borderLeft = "2px solid transparent";
              }}
              title={isAdminOnly ? "Admin only" : ""}>

                  <span style={{ fontSize: 13, width: 16, textAlign: "center", opacity: 0.65, flexShrink: 0 }}>
                    {item.icon}
                  </span>
              <span style={{
                fontFamily: "var(--font-body)",
                fontSize: 12,
                fontWeight: 500,
                color: "var(--text-secondary)",
                flex: 1,
                lineHeight: 1.2
              }}>
                    {item.label}
                    {isAdminOnly && <span style={{ fontSize: 10, color: "#FF3D3D", marginLeft: 6 }}>👑</span>}
                  </span>
                  {item.badgeKey && alertCounts[item.badgeKey] > 0 &&
              <span style={{
                background: "var(--status-error)",
                color: "white",
                borderRadius: 10,
                padding: "1px 6px",
                fontSize: 8,
                fontFamily: "var(--font-mono)",
                fontWeight: 700,
                minWidth: 16,
                textAlign: "center"
              }}>
                      {alertCounts[item.badgeKey]}
                    </span>
              }
                </div>);

        }) :

        <div style={{
          padding: "20px 14px",
          textAlign: "center",
          fontFamily: "var(--font-body)",
          fontSize: 11,
          color: "rgba(200,210,230,0.35)"
        }}>
              No modules match "{search}"
            </div>
        }
        </div>
      }

      {/* Footer */}
      <div style={{
         borderTop: "1px solid var(--divider)",
         padding: "7px 14px",
         display: "flex",
         justifyContent: "space-between",
         alignItems: "center",
         background: "var(--bg-surface)"
       }}>
         <div style={{
           display: 'flex',
           flexDirection: 'column',
           lineHeight: 1,
         }}>
           <span style={{
             fontFamily: "'Space Grotesk', sans-serif",
             fontSize: 14,
             fontWeight: 800,
             letterSpacing: '-0.02em',
             color: 'var(--accent)',
             textTransform: 'uppercase',
           }}>
             STEELBUILD
           </span>
           <span style={{
             fontFamily: "var(--font-mono)",
             fontSize: 8,
             fontWeight: 500,
             letterSpacing: '0.20em',
             color: 'var(--text-muted)',
             textTransform: 'uppercase',
             marginTop: 1,
           }}>
             PRO · REV 2
           </span>
         </div>
        <span style={{
          fontFamily: "var(--font-mono)",
          fontSize: 7,
          color: "var(--accent)"
        }}>
          {totalModules} MODULES
        </span>
      </div>
    </div>);

}

// ─── Project Pill Dropdown ────────────────────────────────────────
// ProjectPillDropdown moved to components/nav/ProjectPillDropdown.jsx

// ProjectOption moved to components/nav/ProjectPillDropdown.jsx

// ─── Notification Bell Dropdown ───────────────────────────────────
function BellDropdown({ alerts, unreadCount, onMarkAllRead, onViewAll }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    if (!open) return;
    const h = (e) => {if (ref.current && !ref.current.contains(e.target)) setOpen(false);};
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open]);

  const recent = alerts.slice(0, 8);

  return (
    <div ref={ref} style={{ position: "relative" }}>
      <div
        onClick={() => setOpen((o) => !o)}
        style={{
          width: 32, height: 32,
          borderRadius: 8,
          background: open ? "var(--accent-muted)" : "var(--hover-bg)",
             border: `1px solid ${open ? "var(--accent-border)" : "var(--border)"}`,
          display: "flex", alignItems: "center", justifyContent: "center",
          cursor: "pointer",
          position: "relative",
          transition: "all 0.15s"
        }}>

        <svg width="14" height="14" viewBox="0 0 20 20" fill={open ? "var(--accent)" : "var(--text-muted)"}>
          <path d="M10 2a6 6 0 00-6 6v3.586l-.707.707A1 1 0 004 14h12a1 1 0 00.707-1.707L16 11.586V8a6 6 0 00-6-6zM10 18a3 3 0 01-3-3h6a3 3 0 01-3 3z" />
        </svg>
        {unreadCount > 0 &&
        <span style={{
          position: "absolute", top: 3, right: 3,
          background: "var(--status-error)",
          borderRadius: 8,
          minWidth: 14, height: 14,
          display: "flex", alignItems: "center", justifyContent: "center",
          fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700,
          color: "white",
          padding: "0 3px",
          boxShadow: "0 0 6px var(--status-error)80",
          lineHeight: 1
        }}>{unreadCount > 99 ? "99+" : unreadCount}</span>
        }
      </div>

      {open &&
      <div style={{
        position: "absolute", top: "calc(100% + 8px)", right: 0,
        width: 320,
        background: "var(--bg-surface-secondary)",
        border: "1px solid var(--border-default)",
        borderTop: "2px solid var(--accent)",
        borderRadius: 12,
        boxShadow: "var(--shadow-lg)",
        zIndex: 2000,
        overflow: "hidden"
      }}>
          {/* Header */}
          <div style={{ padding: "10px 14px", display: "flex", alignItems: "center", justifyContent: "space-between", borderBottom: "1px solid var(--divider)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-primary)", fontWeight: 700, letterSpacing: "0.08em" }}>ALERTS</span>
              {unreadCount > 0 && <span style={{ background: "var(--status-error)", color: "white", borderRadius: 10, padding: "1px 6px", fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700 }}>{unreadCount}</span>}
            </div>
            {unreadCount > 0 &&
          <button onClick={onMarkAllRead} style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--accent)", letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer", padding: "2px 6px", borderRadius: 4, transition: "background 0.1s" }}>
                MARK ALL READ
              </button>
          }
          </div>

          {/* Alert list */}
          <div style={{ maxHeight: 320, overflowY: "auto" }}>
            {recent.length === 0 ?
          <div style={{ padding: 24, textAlign: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>No unread alerts</div> :
          recent.map((a) =>
          <AlertRow key={a.id} alert={a} />
          )}
          </div>

          {/* Footer */}
          <div style={{ padding: "8px 14px", borderTop: "1px solid var(--divider)", display: "flex", justifyContent: "flex-end" }}>
            <button onClick={() => {onViewAll();setOpen(false);}} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.08em", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 4 }}>
              VIEW ALL ALERTS →
            </button>
          </div>
        </div>
      }
    </div>);

}

function AlertRow({ alert }) {
  const color = SEVERITY_COLOR[alert.severity] || "rgba(200,210,230,0.44)";
  return (
    <div style={{ padding: "8px 14px", borderBottom: "1px solid var(--divider)", display: "flex", gap: 8, alignItems: "flex-start" }}>
      <div style={{ width: 7, height: 7, borderRadius: "50%", background: color, flexShrink: 0, marginTop: 4, boxShadow: `0 0 5px ${color}88` }} />
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{alert.title}</div>
        {alert.project_name && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--accent)", letterSpacing: "0.06em", marginTop: 1 }}>{alert.project_name}</div>}
      </div>
      <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", whiteSpace: "nowrap", flexShrink: 0, marginTop: 2 }}>{timeAgo(alert.created_date)}</div>
    </div>);

}

// ─── Mobile Hamburger ─────────────────────────────────────────────
function HamburgerMenu({ open, onToggle }) {
  return (
    <button
      onClick={onToggle}
      style={{
        width: 32, height: 32, borderRadius: 8,
        background: "var(--hover-bg)",
        border: "1px solid var(--border)",
        display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: 4,
        cursor: "pointer", flexShrink: 0
      }}>

      {open ?
      <svg width="14" height="14" viewBox="0 0 14 14" fill="none" stroke="rgba(255,255,255,0.60)" strokeWidth="1.5" strokeLinecap="round">
          <line x1="2" y1="2" x2="12" y2="12" /><line x1="12" y1="2" x2="2" y2="12" />
        </svg> :

      <>
          <div style={{ width: 14, height: 1.5, background: "var(--text-secondary)", borderRadius: 1 }} />
          <div style={{ width: 10, height: 1.5, background: "var(--text-muted)", borderRadius: 1, alignSelf: "flex-start", marginLeft: 9 }} />
          <div style={{ width: 14, height: 1.5, background: "var(--text-secondary)", borderRadius: 1 }} />
        </>
      }
    </button>);

}

// ─── Mobile Drawer ────────────────────────────────────────────────
function MobileDrawer({ open, onClose, onNavigate }) {
  const ref = useRef(null);
  useEffect(() => {
    if (!open) return;
    const h = (e) => {if (ref.current && !ref.current.contains(e.target)) onClose();};
    document.addEventListener("mousedown", h);
    return () => document.removeEventListener("mousedown", h);
  }, [open, onClose]);

  return (
    <>
      {open && <div style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 900 }} />}
      <div ref={ref} style={{
        position: "fixed", top: 0, left: 0, bottom: 0,
        width: 280,
        background: "var(--bg-sidebar)",
        borderRight: "1px solid var(--divider)",
        zIndex: 950,
        transform: open ? "translateX(0)" : "translateX(-100%)",
        transition: "transform 0.25s cubic-bezier(0.4, 0, 0.2, 1)",
        overflowY: "auto",
        display: "flex", flexDirection: "column"
      }}>
        <div style={{ padding: "16px 16px 8px", borderBottom: "1px solid var(--divider)", display: "flex", alignItems: "center" }}>
          <img
            src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69aa43d230072438d933f70b/fa3bd3f80_steelbuild-pro-logo-v3.png"
            alt="SteelBuild Pro"
            style={{ height: 32, width: "auto", objectFit: "contain" }} />

        </div>
        <div style={{ padding: "8px 8px" }}>
          {PRIMARY_TABS.map((tab) =>
          <button key={tab.label} onClick={() => {onNavigate(TAB_DEFAULT_PAGE[tab.label]);onClose();}} style={{
            width: "100%", textAlign: "left", padding: "9px 12px",
            fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: "0.10em",
            color: "var(--text-secondary)", background: "none", border: "none",
            borderRadius: 8, cursor: "pointer", display: "block",
            transition: "background 0.1s, color 0.1s"
          }}
          onMouseEnter={(e) => {e.currentTarget.style.background = "var(--hover-bg)";e.currentTarget.style.color = "var(--accent)";}}
          onMouseLeave={(e) => {e.currentTarget.style.background = "none";e.currentTarget.style.color = "var(--text-muted)";}}>
            {tab.label}</button>
          )}
        </div>
        <div style={{ height: 1, background: "var(--divider)", margin: "4px 0" }} />
        <div style={{ padding: "8px 8px", fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", letterSpacing: "0.14em", paddingLeft: 12, paddingBottom: 4 }}>ALL MODULES</div>
        <div style={{ padding: "0 8px 16px" }}>
          {ALL_MODULES.map((mod, i) =>
          <button key={i} onClick={() => {onNavigate(mod.page);onClose();}} style={{
            width: "100%", textAlign: "left", padding: "7px 12px",
            display: "flex", alignItems: "center", gap: 8,
            fontFamily: "var(--font-body)", fontSize: 12, color: "var(--text-secondary)",
            background: "none", border: "none", borderRadius: 8, cursor: "pointer", transition: "all 0.1s"
          }}
          onMouseEnter={(e) => {e.currentTarget.style.background = "var(--hover-bg)";e.currentTarget.style.color = "var(--accent)";}}
          onMouseLeave={(e) => {e.currentTarget.style.background = "none";e.currentTarget.style.color = "var(--text-muted)";}}>

             <span style={{ fontSize: 13, width: 16, textAlign: "center" }}>{mod.icon}</span>
              {mod.name}
            </button>
          )}
        </div>
      </div>
    </>);

}

// ─── Theme Toggle ─────────────────────────────────────────────
function ThemeToggleButton() {
  const { theme, toggleTheme } = useTheme();
  const isDark = theme === "dark";
  return (
    <button
      onClick={toggleTheme}
      title={isDark ? "Switch to light mode" : "Switch to dark mode"}
      style={{
        width: 32, height: 32,
        borderRadius: 8,
        background: "var(--bg-hover)",
        border: "1px solid var(--border)",
        display: "flex", alignItems: "center", justifyContent: "center",
        cursor: "pointer",
        color: "var(--text-muted)",
        transition: "all 0.15s",
        flexShrink: 0,
      }}
      onMouseEnter={e => {
        e.currentTarget.style.background = "var(--nav-hover-bg)";
        e.currentTarget.style.color = "var(--text-primary)";
      }}
      onMouseLeave={e => {
        e.currentTarget.style.background = "var(--bg-hover)";
        e.currentTarget.style.color = "var(--text-muted)";
      }}
    >
      {isDark ? (
        <svg width="14" height="14" viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 2a1 1 0 011 1v1a1 1 0 11-2 0V3a1 1 0 011-1zm4 8a4 4 0 11-8 0 4 4 0 018 0zm-.464 4.95l.707.707a1 1 0 001.414-1.414l-.707-.707a1 1 0 00-1.414 1.414zm2.12-10.607a1 1 0 010 1.414l-.706.707a1 1 0 11-1.414-1.414l.707-.707a1 1 0 011.414 0zM17 11a1 1 0 100-2h-1a1 1 0 100 2h1zm-7 4a1 1 0 011 1v1a1 1 0 11-2 0v-1a1 1 0 011-1zM5.05 6.464A1 1 0 106.465 5.05l-.708-.707a1 1 0 00-1.414 1.414l.707.707zm1.414 8.486l-.707.707a1 1 0 01-1.414-1.414l.707-.707a1 1 0 011.414 1.414zM4 11a1 1 0 100-2H3a1 1 0 000 2h1z" clipRule="evenodd" />
        </svg>
      ) : (
        <svg width="13" height="13" viewBox="0 0 20 20" fill="currentColor">
          <path d="M17.293 13.293A8 8 0 016.707 2.707a8.001 8.001 0 1010.586 10.586z" />
        </svg>
      )}
    </button>
  );
}

// ─── PMA Button Component ─────────────────────────────────────
function PMAButton() {
  const { isOpen, setIsOpen, unreadInsights, isLoadingInsights } = usePMA();

  const statusLabel = isLoadingInsights
    ? 'LOADING'
    : unreadInsights > 0
    ? 'READY'
    : 'IDLE';

  const pulseStyle =
    unreadInsights > 0
      ? {
          animation: 'pma-pulse 2s infinite',
          boxShadow: '0 0 0 0 rgba(0,229,255,0.45)',
        }
      : {};

  return (
    <button
      onClick={() => setIsOpen(!isOpen)}
      title="Project Management Assistant · ⌘⇧P to open"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '6px 14px',
        background: isOpen ? 'rgba(0,229,255,0.15)' : 'rgba(0,229,255,0.06)',
        border: '1px solid',
        borderColor: isOpen ? 'rgba(0,229,255,0.50)' : 'rgba(0,229,255,0.20)',
        borderRadius: 16,
        cursor: 'pointer',
        fontFamily: 'var(--font-mono)',
        fontSize: 9,
        fontWeight: 700,
        color: isOpen ? '#00E5FF' : 'rgba(0,229,255,0.65)',
        letterSpacing: '0.08em',
        transition: 'all 0.2s',
        position: 'relative',
        boxShadow: isOpen ? '0 0 16px rgba(0,229,255,0.25)' : 'none',
        ...pulseStyle,
      }}
    >
      <style>{`
        @keyframes pma-pulse {
          0% { box-shadow: 0 0 0 0 rgba(0,229,255,0.45); }
          70% { box-shadow: 0 0 0 8px rgba(0,229,255,0); }
          100% { box-shadow: 0 0 0 0 rgba(0,229,255,0); }
        }
      `}</style>
      <span style={{ fontSize: 11 }}>✦</span>
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-start', lineHeight: 1 }}>
        <span>PMA</span>
        <span
          style={{
            fontSize: 7,
            color:
              statusLabel === 'READY'
                ? 'var(--status-success)'
                : statusLabel === 'LOADING'
                ? 'var(--status-warning)'
                : 'var(--text-muted)',
            display: 'flex',
            alignItems: 'center',
            gap: 4,
          }}
        >
          <span
            style={{
              width: 6,
              height: 6,
              borderRadius: '50%',
              background:
                statusLabel === 'READY'
                  ? 'var(--status-success)'
                  : statusLabel === 'LOADING'
                  ? 'var(--status-warning)'
                  : 'var(--text-muted)',
              boxShadow:
                statusLabel === 'READY'
                  ? '0 0 6px var(--status-success)'
                  : statusLabel === 'LOADING'
                  ? '0 0 6px var(--status-warning)'
                  : 'none',
              flexShrink: 0,
            }}
          />
          {statusLabel}
        </span>
      </div>
      {unreadInsights > 0 && (
        <span
          style={{
            background: '#FF3D3D',
            borderRadius: 10,
            padding: '0 6px',
            fontSize: 8,
            color: 'white',
            fontWeight: 800,
            lineHeight: 1.4,
          }}
        >
          {unreadInsights}
        </span>
      )}
    </button>
  );
}

// ─── Project error banner (renders inside ProjectProvider) ────────
function ProjectErrorBanner() {
  const { projectLoadError } = useProjectContext();
  if (!projectLoadError) return null;
  return (
    <div style={{
      marginBottom: 16,
      padding: "12px 16px",
      background: "var(--warning-muted)",
      border: "1px solid var(--warning-border)",
      borderLeft: "4px solid var(--status-error)",
      borderRadius: "var(--radius-card)",
      fontFamily: "var(--font-mono)",
      fontSize: 11,
      color: "var(--status-error)",
    }}>
      <strong>⚠ Project data unavailable:</strong> {projectLoadError}
      <span style={{ color: "var(--text-muted)", marginLeft: 12 }}>
        — Verify the Project entity schema exists in the Base44 app admin.
      </span>
    </div>
  );
}

// ─── Main Layout ──────────────────────────────────────────────────
export default function Layout({ children, currentPageName }) {
  const navigate = useNavigate();
  
  // Use useContext directly to avoid throwing error when AuthProvider not available
  const authCtx = useContext(AuthContext);
  const user = authCtx?.user || null;
  const logout = authCtx?.logout || (() => {});
  const [gridOpen, setGridOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(window.innerWidth < 900);

  useEffect(() => {
    const handler = () => setIsMobile(window.innerWidth < 900);
    window.addEventListener("resize", handler);
    return () => window.removeEventListener("resize", handler);
  }, []);

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

  const qc = useQueryClient();

  const { data: allAlerts = [] } = useQuery({
    queryKey: ["alerts-nav"],
    queryFn: () => base44.entities.Alert.filter({ is_dismissed: false }),
    initialData: [],
    staleTime: 30000
  });

  const { data: navRFIs = [] } = useQuery({
    queryKey: ["rfis-nav-count"],
    queryFn: () => base44.entities.RFI.list("-date_required", 500),
    initialData: [],
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: navDrawings = [] } = useQuery({
    queryKey: ["drawings-nav-count"],
    queryFn: () => base44.entities.Drawing.list("-due_date", 500),
    initialData: [],
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const { data: navDeliveries = [] } = useQuery({
    queryKey: ["deliveries-nav-count"],
    queryFn: () => base44.entities.Delivery.list("-scheduled_date", 500),
    initialData: [],
    refetchInterval: 120000,
    staleTime: 60000,
  });

  const overdueRFICount = navRFIs.filter(r =>
    r.date_required &&
    new Date(r.date_required) < new Date() &&
    !["Answered", "Closed"].includes(r.status)
  ).length;

  const overdueDrawingCount = navDrawings.filter((drawing) =>
    drawing.due_date &&
    new Date(drawing.due_date) < new Date() &&
    drawing.stage !== "Released"
  ).length;

  const overdueDeliveryCount = navDeliveries.filter((d) =>
    d.scheduled_date &&
    new Date(d.scheduled_date) < new Date() &&
    d.status !== "Delivered"
  ).length;

  const markAllReadMut = useMutation({
    mutationFn: () => Promise.all(
      allAlerts.filter((a) => !a.is_read).map((a) => base44.entities.Alert.update(a.id, { is_read: true }))
    ),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["alerts-nav"] })
  });

  const unreadAlerts = allAlerts.filter((a) => !a.is_read && !a.is_dismissed);
  const unreadCount = unreadAlerts.length;

  // Guard: suppress any 405 errors from Base44 page tracking
  useEffect(() => {
    if (!currentPageName) return;
    // Non-critical page tracking — suppress 405 errors silently
    try {


      // Base44 internal page tracking fires here
      // If it returns 405, we suppress it to avoid console pollution
    } catch (err) {console.debug('Page tracking unavailable:', currentPageName);}
  }, [currentPageName]);

  const activeTab = PRIMARY_TABS.find((t) => t.pages.includes(currentPageName));

  const handleTabClick = (tab) => {
    const dest = TAB_DEFAULT_PAGE[tab.label];
    if (dest) navigate(createPageUrl(dest));
  };

  const handleNavigate = (page) => navigate(createPageUrl(page));

  // Noise texture SVG data URI
  return (
    <ProjectProvider>
      <PMAProvider>
        <div style={{
          minHeight: "100vh",
          width: "100%",
          display: "flex",
          alignItems: "flex-start",
          justifyContent: "center",
          padding: 0,
          background: "var(--bg-base)",
          fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, sans-serif"
        }}>
      {/* Mobile Drawer */}
      <MobileDrawer open={mobileOpen} onClose={() => setMobileOpen(false)} onNavigate={handleNavigate} />

      <div style={{
            background: "var(--bg-surface)",
            borderRadius: 0,
            width: "100%",
            maxWidth: "100%",
            minHeight: "100vh",
            overflow: "hidden",
            boxShadow: "none",
            position: "relative",
            display: "flex",
            flexDirection: "column"
          }}>
        {/* Top accent line */}
        <div style={{
          position: "absolute", top: 0, left: 0, right: 0,
          height: 2,
          background: "linear-gradient(90deg, transparent, var(--accent), transparent)",
          zIndex: 200,
          opacity: 0.6,
        }} />

        {/* TOP NAV */}
        <nav className="nav-glass" style={{
              height: 52,
              background: "rgba(10,10,10,0.95)",
              borderBottom: "1px solid #1E1E1E",
              padding: "0 16px",
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              flexShrink: 0,
              position: "relative",
              zIndex: 100,
              gap: 8,
              backdropFilter: "blur(20px)",
              WebkitBackdropFilter: "blur(20px)"
            }}>
          {/* LEFT — Brand + Hamburger on mobile */}
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
            {isMobile && <HamburgerMenu open={mobileOpen} onToggle={() => setMobileOpen((o) => !o)} />}
            <div style={{ display: "flex", alignItems: "center", cursor: "pointer" }} onClick={() => handleNavigate("Dashboard")}>
              <img
                    src="https://qtrypzzcjebvfcihiynt.supabase.co/storage/v1/object/public/base44-prod/public/69aa43d230072438d933f70b/fa3bd3f80_steelbuild-pro-logo-v3.png"
                    alt="SteelBuild Pro"
                    style={{ height: 36, width: "auto", objectFit: "contain" }} />

            </div>
            {!isMobile && <div style={{ width: 1, height: 20, background: "var(--divider)", margin: "0 8px" }} />}
          </div>

          {/* CENTER — Tabs (hidden on mobile) */}
          {!isMobile &&
              <div style={{ display: "flex", alignItems: "center", flex: 1, justifyContent: "center", overflowX: "auto", scrollbarWidth: "none" }}>
              {PRIMARY_TABS.map((tab) => (
                <div key={tab.label} style={{ position: "relative", display: "flex", alignItems: "center" }}>
                  <NavTab
                    tab={tab}
                    active={activeTab?.label === tab.label}
                    onClick={() => handleTabClick(tab)} />
                  {tab.label === "RFIs" && overdueRFICount > 0 && (
                    <span style={{
                      position: "absolute", top: 8, right: 2,
                      fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700,
                      background: "var(--status-error)", color: "#fff",
                      padding: "1px 4px", borderRadius: 2,
                      minWidth: 14, textAlign: "center", lineHeight: "14px",
                      pointerEvents: "none",
                    }}>
                      {overdueRFICount}
                    </span>
                  )}
                  {tab.label === "DRAWINGS" && overdueDrawingCount > 0 && (
                    <span style={{
                      position: "absolute", top: 8, right: 2,
                      fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700,
                      background: "var(--status-error)", color: "#fff",
                      padding: "1px 4px", borderRadius: 2,
                      minWidth: 14, textAlign: "center", lineHeight: "14px",
                      pointerEvents: "none",
                    }}>
                      {overdueDrawingCount}
                    </span>
                  )}
                  {tab.label === "DELIVERIES" && overdueDeliveryCount > 0 && (
                    <span style={{
                      position: "absolute", top: 8, right: 2,
                      fontFamily: "var(--font-mono)", fontSize: 7, fontWeight: 700,
                      background: "var(--status-error)", color: "#fff",
                      padding: "1px 4px", borderRadius: 2,
                      minWidth: 14, textAlign: "center", lineHeight: "14px",
                      pointerEvents: "none",
                    }}>
                      {overdueDeliveryCount}
                    </span>
                  )}
                </div>
              ))}
            </div>
              }

          {/* RIGHT — Icons */}
          <div style={{ display: "flex", alignItems: "center", gap: 6, flexShrink: 0 }}>
            {/* Search icon */}
            {!isMobile &&
                <div
                  onClick={() => setSearchOpen(true)}
                  title="Search (Cmd+K)"
                  style={{
                    width: 32, height: 32,
                    borderRadius: 8,
                    background: "var(--hover-bg)",
                    border: "1px solid var(--border-default)",
                    display: "flex", alignItems: "center", justifyContent: "center",
                    cursor: "pointer",
                    color: "var(--text-secondary)",
                    transition: "all 0.15s",
                  }}
                  onMouseEnter={(e) => {
                    e.currentTarget.style.background = "var(--accent-muted)";
                    e.currentTarget.style.borderColor = "var(--accent-border)";
                    e.currentTarget.style.color = "var(--accent)";
                  }}
                  onMouseLeave={(e) => {
                    e.currentTarget.style.background = "var(--hover-bg)";
                    e.currentTarget.style.borderColor = "var(--border)";
                    e.currentTarget.style.color = "var(--text-muted)";
                  }}>

                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round">
                  <circle cx="8" cy="8" r="6" />
                  <line x1="14" y1="14" x2="19" y2="19" />
                </svg>
              </div>
                }

            {/* Grid / Modules — desktop only */}
            {!isMobile &&
                <div style={{ position: "relative" }}>
                <div
                    onClick={() => setGridOpen((g) => !g)}
                    title="All Modules"
                    style={{
                      width: 32, height: 32,
                      borderRadius: 8,
                      background: gridOpen ? "var(--accent-muted)" : "var(--hover-bg)",
                      border: `1px solid ${gridOpen ? "var(--accent-border)" : "var(--border)"}`,
                      display: "flex", alignItems: "center", justifyContent: "center",
                      cursor: "pointer",
                      color: gridOpen ? "var(--accent)" : "var(--text-muted)",
                      transition: "all 0.15s"
                    }}>

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
                        (a.alert_type === "RFI Overdue" || a.alert_type === "RFI_Overdue") &&
                        !a.is_dismissed
                      ).length,
                      co: allAlerts.filter((a) => a.alert_type === "CO Pending" && !a.is_dismissed).length,
                      drawings: overdueDrawingCount,
                      deliveries: overdueDeliveryCount,
                    }} />

              </div>
                }

            {/* Theme Toggle */}
            {!isMobile && <ThemeToggleButton />}

            {/* PMA Button */}
            {!isMobile && <PMAButton />}

            {/* Bell with dropdown */}
            <BellDropdown
                  alerts={unreadAlerts}
                  unreadCount={unreadCount}
                  onMarkAllRead={() => markAllReadMut.mutate()}
                  onViewAll={() => handleNavigate("AlertsCenter")} />


            {/* User Display & Sign Out */}
            <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 12,
                  marginLeft: 'auto',
                  paddingRight: 0
                }}>
              <div style={{
                    fontFamily: "var(--font-mono)",
                    fontSize: 8,
                    color: 'var(--text-muted)',
                    letterSpacing: '0.10em',
                    textTransform: 'uppercase'
                  }}>
                {user?.email || user?.full_name || ''}
              </div>
              <button
                    onClick={logout}
                    style={{
                      background: 'var(--bg-hover)',
                      border: '1px solid var(--border)',
                      borderRadius: 6,
                      padding: '4px 12px',
                      color: 'var(--text-muted)',
                      fontFamily: "var(--font-mono)",
                      fontSize: 8,
                      letterSpacing: '0.10em',
                      cursor: 'pointer',
                      transition: 'all 0.15s',
                      textTransform: 'uppercase',
                      fontWeight: 600
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.background = 'var(--danger-muted)';
                      e.currentTarget.style.borderColor = 'var(--danger-border)';
                      e.currentTarget.style.color = 'var(--danger)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.background = 'var(--bg-hover)';
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.color = 'var(--text-muted)';
                    }}>

                SIGN OUT
              </button>
            </div>

            {/* Project pill dropdown */}
            <ProjectPillDropdown />

          </div>
        </nav>

        {/* CONTENT */}
        <main style={{ flex: 1, overflowY: "auto", padding: 0, background: "var(--bg-base)", color: "var(--text-primary)", display: "flex", flexDirection: "column" }}>
          <ProjectErrorBanner />
          {children}
        </main>

        {/* Global Search Modal */}
        <GlobalSearchModal open={searchOpen} onClose={() => setSearchOpen(false)} />

        {/* Quick Add FAB */}
        <QuickAddFAB />

        {/* PMA Panel */}
        <PMAPanel />

        {/* Toast notifications */}
        <Toaster
              position="bottom-right"
              toastOptions={{
                style: {
                  background: "var(--bg-elevated)",
                  border: "1px solid var(--border-strong)",
                  color: "var(--text-primary)",
                  fontFamily: "'Inter', sans-serif",
                  fontSize: 13,
                  borderRadius: 10,
                  boxShadow: "var(--shadow-lg)",
                }
              }} />

      </div>
    </div>
      </PMAProvider>
    </ProjectProvider>
  );


}
