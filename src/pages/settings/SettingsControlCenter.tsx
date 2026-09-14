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
import { Settings, Gauge, LayoutDashboard, Palette, Star, FolderCheck, RefreshCw } from "lucide-react";
import "@/styles/command.css";
import { PageHero, KpiStrip, useCommandSkin } from "@/components/command";
import type { KpiCellDef } from "@/components/command";
import { photoFor } from "@/config/launcherConfig";
import {
  buildSettingsSummary,
} from "./settingsControlCenter.derive";
import type { SettingsUser, SettingsPrefs, SettingsSyncState } from "./settingsControlCenter.derive";

export interface SettingsControlCenterProps {
  /** The authenticated user (from AuthContext). */
  user: SettingsUser | null | undefined;
  /** Persisted user prefs (from auth.me()). */
  prefs: SettingsPrefs | null | undefined;
  /** Number of visible settings tab sections for this user. */
  visibleSectionCount: number;
  /** Current status of the centralized preference save pipeline. */
  syncState?: SettingsSyncState;
  /** The full existing settings body — tabs sidebar + content card — rendered verbatim. */
  children: ReactNode;
}

export default function SettingsControlCenter({
  user,
  prefs,
  visibleSectionCount,
  syncState = "idle",
  children,
}: SettingsControlCenterProps) {
  useCommandSkin();

  const s = useMemo(
    () => buildSettingsSummary(user, prefs, visibleSectionCount, syncState),
    [user, prefs, visibleSectionCount, syncState],
  );

  // Hero chips: identity context
  const chips = [
    { label: s.roleLabel, tone: s.isAdmin ? ("info" as const) : ("neutral" as const) },
    ...(s.isAdmin ? [{ label: "Workspace Admin", tone: "good" as const }] : []),
  ];

  // Personalization summary: every value is derived from a persisted preference.
  const kpiCells: KpiCellDef[] = [
    ...(s.presetLabel !== null
      ? [
          {
            label: "Workspace Preset",
            value: s.presetLabel,
            sublabel: "personal workflow",
            tone: "info" as const,
            Icon: LayoutDashboard,
          },
        ]
      : []),
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
    ...(s.densityLabel !== null
      ? [{ label: "Table Density", value: s.densityLabel, sublabel: "workspace-wide", tone: "neutral" as const, Icon: Gauge }]
      : []),
    ...(s.pinnedModuleCount !== null || s.favoriteProjectCount !== null
      ? [{
            label: "Favorite Projects",
            value: `${s.favoriteProjectCount ?? 0} selected`,
          sublabel: `${s.pinnedModuleCount ?? 0} pinned modules`,
          tone: "neutral" as const,
          Icon: Star,
        }]
      : []),
    ...(s.defaultProjectLabel !== null
      ? [{ label: "Default Project", value: s.defaultProjectLabel, sublabel: "for project tools", tone: "neutral" as const, Icon: FolderCheck }]
      : []),
    ...(s.syncLabel !== null
      ? [{
          label: "Preference Sync",
          value: s.syncLabel,
          sublabel: s.syncLabel === "Needs attention" ? "last save failed" : "saved to your account",
          tone: s.syncLabel === "Needs attention" ? "danger" as const : "good" as const,
          Icon: RefreshCw,
        }]
      : []),
  ];

  const displayName = user?.full_name || user?.email || "Signed in";

  return (
    <div className="settings-cc">
      <PageHero
        Icon={Settings}
        title="Settings"
        subtitle="Personalize how SteelBuild Pro looks, behaves, and prioritizes your work."
        chips={chips}
        photoSrc={photoFor("Settings") ?? undefined}
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
