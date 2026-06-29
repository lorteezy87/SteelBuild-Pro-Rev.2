/**
 * Settings Control Center — light Command UI shell for the Settings page.
 *
 * Wraps the existing settings body (tabs + forms) in the Command UI chrome:
 * - PageHero: icon, title, subtitle, user identity chip
 * - KpiStrip: real config facts only (role, visible sections, pinned modules,
 *   theme — all omitted rather than fabricated when the source is absent)
 *
 * The `children` slot receives the complete existing settings body verbatim
 * so that all form saves, tab navigation, and mutation logic remain unchanged.
 *
 * Design constraint: do NOT replace the forms with a DataTable. This page
 * is configuration UI, not a data-table module.
 */
import { useMemo } from "react";
import type { ReactNode } from "react";
import { Settings, ShieldCheck, LayoutDashboard, Palette } from "lucide-react";
import "@/styles/command.css";
import { PageHero, KpiStrip, useCommandSkin } from "@/components/command";
import type { KpiCellDef } from "@/components/command";
import {
  buildSettingsSummary,
} from "./settingsControlCenter.derive";
import type { SettingsUser, SettingsPrefs } from "./settingsControlCenter.derive";

export interface SettingsControlCenterProps {
  /** The authenticated user (from AuthContext). */
  user: SettingsUser | null | undefined;
  /** Persisted user prefs (from auth.me()). */
  prefs: SettingsPrefs | null | undefined;
  /** Number of visible settings tab sections for this user. */
  visibleSectionCount: number;
  /** The full existing settings body — tabs sidebar + content card — rendered verbatim. */
  children: ReactNode;
}

export default function SettingsControlCenter({
  user,
  prefs,
  visibleSectionCount,
  children,
}: SettingsControlCenterProps) {
  useCommandSkin();

  const s = useMemo(
    () => buildSettingsSummary(user, prefs, visibleSectionCount),
    [user, prefs, visibleSectionCount],
  );

  // Hero chips: identity context
  const chips = [
    { label: s.roleLabel, tone: s.isAdmin ? ("info" as const) : ("neutral" as const) },
    ...(s.isAdmin ? [{ label: "Workspace Admin", tone: "good" as const }] : []),
  ];

  // KPI cells: only real facts, only when a source exists
  const kpiCells: KpiCellDef[] = [
    {
      label: "Access Level",
      value: s.roleLabel,
      sublabel: s.isAdmin ? "full workspace access" : "project-scoped access",
      tone: s.isAdmin ? "info" : "neutral",
      Icon: ShieldCheck,
    },
    {
      label: "Settings Sections",
      value: s.visibleSectionCount,
      sublabel: "visible to your role",
      tone: "neutral",
      Icon: LayoutDashboard,
    },
    // Pinned modules: only show when the pref has been explicitly set
    ...(s.pinnedModuleCount !== null
      ? [
          {
            label: "Pinned Modules",
            value: s.pinnedModuleCount,
            sublabel: "on your dashboard",
            tone: "neutral" as const,
            Icon: LayoutDashboard,
          },
        ]
      : []),
    // Theme: only show when a value is stored
    ...(s.themeLabel !== null
      ? [
          {
            label: "Display Theme",
            value: s.themeLabel,
            sublabel: "current preference",
            tone: "neutral" as const,
            Icon: Palette,
          },
        ]
      : []),
  ];

  const displayName = user?.full_name || user?.email || "Signed in";

  return (
    <div className="settings-cc">
      <PageHero
        Icon={Settings}
        title="Settings"
        subtitle="Configure system preferences, project settings, notifications, and access."
        chips={chips}
        stats={[
          { value: displayName, label: "Account" },
        ]}
      />

      <KpiStrip cells={kpiCells} />

      {/*
        The children slot receives the full existing settings body verbatim —
        including the sidebar tab nav, the sbd-card content panel, and all
        mutation hooks. Nothing inside is re-implemented; it is rendered as-is
        so that all saves and tab transitions work identically to the classic path.
      */}
      <div
        className="settings-cc__body"
        style={{ marginTop: "var(--cmd-section-gap, 24px)" }}
      >
        {children}
      </div>
    </div>
  );
}
