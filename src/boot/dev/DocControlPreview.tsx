/** Development-only fixture: shipped document-control panels, synthetic records, no backend. */
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useState } from "react";
import { ThemeProvider } from "@/components/shared/ThemeContext";
import { useCommandSkin } from "@/components/command";
import ReviewDelayCard from "@/components/submittals/ReviewDelayCard";
import WhyWaitingWhoPanel from "@/components/shared/WhyWaitingWhoPanel";
import SavedViewsControl from "@/components/shared/SavedViewsControl";
import { DRAWING_SET_TRACKED_FIELDS, SUBMITTAL_TRACKED_FIELDS } from "@/lib/recordMovement";
import "@/globals.css";
// The hub shell (DetailingCommandShell) loads the command kit stylesheet.
import "@/styles/command.css";

const projectId = "doc-control-fixture";
const today = "2026-10-06";

const submittals = [
  { id: "sub-1", submittal_number: "SUB-014", title: "Roof framing package", status: "Under Review", reviewer: "EOR" },
  { id: "sub-2", submittal_number: "SUB-015", title: "Main building columns", status: "Under Review", reviewer: "EOR" },
  { id: "sub-3", submittal_number: "SUB-016", title: "Canopy steel", status: "Approved", reviewer: "Architect" },
  { id: "sub-4", submittal_number: "SUB-017", title: "Stairs and rails", status: "Under Review", reviewer: "GC" },
];
const roundsBySubmittal = {
  "sub-1": [{ submittal_id: "sub-1", round_number: 1, status: "Under Review", submitted_date: "2026-08-24", reviewer: "EOR" }],
  "sub-2": [
    { submittal_id: "sub-2", round_number: 1, status: "Revise and Resubmit", submitted_date: "2026-07-06", returned_date: "2026-08-03", reviewer: "EOR" },
    { submittal_id: "sub-2", round_number: 2, status: "Under Review", submitted_date: "2026-09-08", reviewer: "EOR" },
  ],
  "sub-3": [{ submittal_id: "sub-3", round_number: 1, status: "Approved", submitted_date: "2026-09-01", returned_date: "2026-09-11", reviewer: "Architect" }],
  "sub-4": [{ submittal_id: "sub-4", round_number: 1, status: "Under Review", reviewer: "GC" }],
};

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false, staleTime: Infinity } } });
queryClient.setQueryData(["record-audit", "submittals", "sub-2", projectId], [
  { created_at: "2026-09-08T16:10:00Z", action: "UPDATE", old_values: { status: "Revise and Resubmit", ball_in_court: "Detailer", round_number: 1 }, new_values: { status: "Under Review", ball_in_court: "EOR", round_number: 2 } },
  { created_at: "2026-08-03T21:40:00Z", action: "UPDATE", old_values: { status: "Under Review", ball_in_court: "EOR" }, new_values: { status: "Revise and Resubmit", ball_in_court: "Detailer" } },
]);
queryClient.setQueryData(["record-audit", "drawing_sets", "set-1", projectId], []);

function DocControlPreview() {
  // The Approvals tab and both registers render inside the command skin.
  useCommandSkin();
  const [applied, setApplied] = useState("");
  return (
    <main aria-label="Main content" style={{ padding: 16, minWidth: 0, maxWidth: 1100, margin: "0 auto" }}>
      <p>Development fixture · synthetic project records</p>
      <section aria-label="Saved views fixture" style={{ marginBottom: 16 }}>
        <SavedViewsControl register="drawing_register" currentFilters={{ query: "S-1", statusFilter: "on_hold" }} onApply={(v) => setApplied(v.name)} />
        <output aria-label="Applied view" style={{ marginLeft: 8 }}>{applied}</output>
      </section>
      <WhyWaitingWhoPanel
        entityTable="submittals"
        recordId="sub-2"
        projectId={projectId}
        fields={SUBMITTAL_TRACKED_FIELDS}
        waitingOn={[
          { what: "Reviewer response", why: "Out for approval since 2026-09-08", owner: "EOR" },
          { what: "RFI 014 open", why: "Beam B12 top of steel", owner: "EOR" },
        ]}
        ballInCourt="EOR"
        person="Structural EOR"
        dueDate="2026-09-22"
        nextMove="Record return (BFA)"
        today={today}
      />
      <WhyWaitingWhoPanel
        entityTable="drawing_sets"
        recordId="set-1"
        projectId={projectId}
        fields={DRAWING_SET_TRACKED_FIELDS}
        waitingOn={[]}
        waitingOnStatus="unavailable"
        ballInCourt={null}
        nextMove="Verify set approval records"
      />
      <ReviewDelayCard
        submittals={submittals}
        roundsBySubmittal={roundsBySubmittal}
        today={today}
        projectMeta={{ detailing_lead_days: { approval: 10 } }}
        basis="working"
        projectLabel="EX-0001 Example Project"
      />
    </main>
  );
}

if (import.meta.env.DEV) {
  const root = document.getElementById("root");
  if (root) createRoot(root).render(<ThemeProvider><QueryClientProvider client={queryClient}><DocControlPreview /></QueryClientProvider></ThemeProvider>);
}
