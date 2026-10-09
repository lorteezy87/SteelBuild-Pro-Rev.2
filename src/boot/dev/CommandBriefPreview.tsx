/** Development-only fixture: shipped presentation, synthetic records, no backend. */
import { useState } from "react";
import { createRoot } from "react-dom/client";
import { ThemeProvider } from "@/components/shared/ThemeContext";
import CommandCenterControlCenter from "@/pages/commandCenter/CommandCenterControlCenter";
import type { CommandCenterSources } from "@/pages/commandCenter/commandCenterControlCenter.derive";
import "@/globals.css";

const projectId = "command-brief-fixture";
const sources: CommandCenterSources = {
  projects: [{ id: projectId, name: "Northline Distribution Center" }],
  rfis: [
    { id: "overdue-rfi", project_id: projectId, rfi_number: "RFI-101", title: "Grid C4 brace connection", status: "Open", date_required: "2026-10-05", ball_in_court: "EOR" },
    { id: "undated-rfi", project_id: projectId, rfi_number: "RFI-102", title: "Canopy connection clarification", status: "Open" },
  ],
  submittals: [{ id: "future-submittal", project_id: projectId, submittal_number: "SUB-014", title: "Roof framing package", status: "Submitted", required_date: "2026-10-14", ball_in_court: "EOR" }],
  workPackages: [{ id: "held-package", project_id: projectId, wp_number: "WP-012", name: "East bay columns", status: "On Hold" }],
  scheduleTasks: [{ id: "near-task", project_id: projectId, task_name: "Erect east bay columns", status: "In Progress", end_date: "2026-10-08", assigned_to: "Field crew" }],
  changeOrders: [], deliveries: [],
};
const emptySources: CommandCenterSources = { ...sources, rfis: [], submittals: [], workPackages: [], scheduleTasks: [] };
const largeSources: CommandCenterSources = {
  ...emptySources,
  rfis: Array.from({ length: 115 }, (_, index) => ({
    id: `large-rfi-${index}`, project_id: projectId, rfi_number: `RFI-${String(index + 1).padStart(3, "0")}`,
    title: `Bay ${index + 1} connection review`, status: "Open", date_required: "2026-10-05", ball_in_court: "EOR",
  })),
};

function CommandBriefPreview() {
  const [opened, setOpened] = useState("");
  const [search, setSearch] = useState("");
  const [typeFilter, setTypeFilter] = useState("All");
  const [empty, setEmpty] = useState(false);
  const [large, setLarge] = useState(false);
  return (
    <main aria-label="Main content" style={{ padding: 16, minWidth: 0 }}>
      <div style={{ display: "flex", gap: 12, flexWrap: "wrap", marginBottom: 16 }}>
        <span>Development fixture · synthetic project records</span>
        <button type="button" onClick={() => { setLarge(false); setEmpty(value => !value); }}>{empty ? "Show populated snapshot" : "Show empty snapshot"}</button>
        <button type="button" onClick={() => { setEmpty(false); setLarge(value => !value); }}>{large ? "Show small snapshot" : "Show large snapshot"}</button>
        <output aria-label="Opened source">{opened}</output>
      </div>
      <CommandCenterControlCenter sources={large ? largeSources : empty ? emptySources : sources} projectName="Northline Distribution Center"
        search={search} onSearch={setSearch} typeFilter={typeFilter} onTypeChange={setTypeFilter}
        dataUpdatedAt={new Date("2026-10-06T17:58:00Z").getTime()}
        onOpenItem={item => setOpened(`${item.itemType}:${item.id}`)} onForwardLook={() => setOpened("ForwardLook")} />
    </main>
  );
}

if (import.meta.env.DEV) {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<ThemeProvider><CommandBriefPreview /></ThemeProvider>);
}
