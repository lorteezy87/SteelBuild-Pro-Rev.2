import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Pin, Star } from "lucide-react";
import { entities } from "@/api/supabaseClient";
import {
  PERSONALIZATION_PRESETS,
  applyPersonalizationPreset,
} from "@/lib/userPreferences/presets";
import type { UserPreferences, WorkspacePreset } from "@/lib/userPreferences/schema";
import { PresetChangeSummary } from "./PresetChangeSummary";

type PresetId = Exclude<WorkspacePreset, "custom">;
type ProjectChoice = { id: string; name?: string | null; project_number?: string | null };

const MODULES = [
  ["Projects", "Projects"], ["Drawings", "Drawings"], ["Submittals", "Submittals"],
  ["RFIs", "RFIs"], ["Schedule", "Schedule"], ["PieceRegister", "Piece Register"],
  ["ProductionStatus", "Production Status"], ["Deliveries", "Deliveries"],
  ["FieldToday", "Field Today"], ["DailyLogs", "Daily Logs"], ["Reports", "Reports"],
  ["Financials", "Financials"],
] as const;

const labelStyle = { fontFamily: "var(--font-mono)", fontSize: 8, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase" as const, marginBottom: 10 };

export function WorkspaceTab({
  preferences,
  onSave,
  isSaving,
  projects: providedProjects,
}: {
  preferences: UserPreferences;
  onSave: (patch: Partial<UserPreferences> | UserPreferences) => void;
  isSaving: boolean;
  projects?: ProjectChoice[];
}) {
  const [pendingPreset, setPendingPreset] = useState<PresetId | null>(null);
  const { data: fetchedProjects = [] } = useQuery({
    queryKey: ["projects-for-personalization"],
    queryFn: () => entities.Project.list() as Promise<ProjectChoice[]>,
    enabled: providedProjects === undefined,
    staleTime: 5 * 60 * 1000,
  });
  const projects = providedProjects ?? fetchedProjects;
  const sortedProjects = useMemo(() => [...projects].sort((a, b) => (a.name ?? "").localeCompare(b.name ?? "")), [projects]);
  const pendingPreferences = pendingPreset ? applyPersonalizationPreset(preferences, pendingPreset) : null;

  const toggleProject = (id: string) => {
    const next = preferences.favorite_project_ids.includes(id)
      ? preferences.favorite_project_ids.filter((projectId) => projectId !== id)
      : [...preferences.favorite_project_ids, id];
    onSave({ favorite_project_ids: next });
  };

  const toggleModule = (id: string) => {
    const next = preferences.pinned_modules.includes(id)
      ? preferences.pinned_modules.filter((moduleId) => moduleId !== id)
      : [...preferences.pinned_modules, id];
    onSave({ pinned_modules: next });
  };

  return (
    <div>
      <h2 style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--text-primary)", margin: "0 0 6px", textTransform: "uppercase", letterSpacing: "0.06em" }}>My Workspace</h2>
      <p style={{ fontSize: 11, color: "var(--text-muted)", margin: "0 0 24px" }}>Choose a working style, favorite modules, and projects without changing your permissions.</p>

      <section style={{ marginBottom: 28 }}>
        <div style={labelStyle}>Workflow Preset</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(165px, 1fr))", gap: 10 }}>
          {(Object.entries(PERSONALIZATION_PRESETS) as Array<[PresetId, typeof PERSONALIZATION_PRESETS[PresetId]]>).map(([id, preset]) => {
            const active = preferences.workspace_preset === id;
            return (
              <button key={id} type="button" aria-label={`${preset.label} preset`} onClick={() => setPendingPreset(id)} style={{ textAlign: "left", padding: 12, borderRadius: 8, border: `1px solid ${active ? "var(--accent)" : "var(--border-default)"}`, background: active ? "var(--accent-muted)" : "var(--bg-surface-low)", color: "var(--text-primary)", cursor: "pointer" }}>
                <span style={{ display: "flex", justifyContent: "space-between", gap: 8, fontWeight: 700, fontSize: 12 }}>{preset.label}{active ? <Check size={14} color="var(--accent)" /> : null}</span>
                <span style={{ display: "block", marginTop: 5, fontSize: 10, color: "var(--text-muted)", lineHeight: 1.4 }}>{preset.description}</span>
              </button>
            );
          })}
        </div>
        {pendingPreset && pendingPreferences ? (
          <PresetChangeSummary presetId={pendingPreset} next={pendingPreferences} isSaving={isSaving} onCancel={() => setPendingPreset(null)} onApply={() => { onSave(pendingPreferences); setPendingPreset(null); }} />
        ) : null}
      </section>

      <section style={{ marginBottom: 28 }}>
        <div style={labelStyle}>Navigation Favorites</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(145px, 1fr))", gap: 8 }}>
          {MODULES.map(([id, label]) => {
            const selected = preferences.pinned_modules.includes(id);
            return <button key={id} type="button" onClick={() => toggleModule(id)} style={{ display: "flex", alignItems: "center", gap: 7, padding: "9px 10px", borderRadius: 6, border: `1px solid ${selected ? "var(--accent-border)" : "var(--border-default)"}`, background: selected ? "var(--accent-muted)" : "var(--bg-surface-low)", color: selected ? "var(--accent)" : "var(--text-primary)", cursor: "pointer" }}><Pin size={12} fill={selected ? "currentColor" : "none"} />{label}</button>;
          })}
        </div>
      </section>

      <section>
        <div style={labelStyle}>Favorite Projects</div>
        <div style={{ border: "1px solid var(--border-default)", borderRadius: 8, overflow: "hidden" }}>
          {sortedProjects.length === 0 ? <div style={{ padding: 14, color: "var(--text-muted)", fontSize: 11 }}>No accessible projects.</div> : sortedProjects.map((project, index) => {
            const selected = preferences.favorite_project_ids.includes(project.id);
            return (
              <div key={project.id} style={{ display: "flex", alignItems: "center", gap: 10, padding: "10px 12px", borderBottom: index < sortedProjects.length - 1 ? "1px solid var(--divider)" : 0 }}>
                <button type="button" aria-label={`${selected ? "Remove" : "Favorite"} ${project.name ?? "project"}`} onClick={() => toggleProject(project.id)} style={{ border: 0, background: "transparent", color: selected ? "var(--accent)" : "var(--text-muted)", cursor: "pointer", padding: 2 }}><Star size={15} fill={selected ? "currentColor" : "none"} /></button>
                <div style={{ flex: 1, fontSize: 12, color: "var(--text-primary)" }}>{project.name ?? "Project"}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{project.project_number ?? "—"}</div>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}
