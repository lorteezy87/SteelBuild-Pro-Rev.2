// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, render, screen } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";

const filter = vi.fn();
vi.mock("@/api/client/recordAudit", () => ({ fetchRecordAudit: (...args: unknown[]) => filter(...args) }));

import WhyWaitingWhoPanel from "../WhyWaitingWhoPanel";
import { SUBMITTAL_TRACKED_FIELDS } from "@/lib/recordMovement";

afterEach(() => {
  cleanup();
  filter.mockReset();
});

function renderPanel(props: Partial<Parameters<typeof WhyWaitingWhoPanel>[0]> = {}) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <WhyWaitingWhoPanel
        entityTable="submittals"
        recordId="s1"
        projectId="p1"
        fields={SUBMITTAL_TRACKED_FIELDS}
        waitingOn={[]}
        ballInCourt="EOR"
        {...props}
      />
    </QueryClientProvider>,
  );
}

describe("WhyWaitingWhoPanel", () => {
  it("shows the last server-audited move, blockers and the owner", async () => {
    filter.mockResolvedValue([
      { created_at: "2026-07-10T17:00:00Z", action: "UPDATE", old_values: { status: "Submitted", ball_in_court: "GC" }, new_values: { status: "Under Review", ball_in_court: "EOR" } },
    ]);
    renderPanel({
      waitingOn: [{ what: "Reviewer response", why: "Out for approval since 2026-07-06", owner: "EOR" }],
      person: "J. Smith",
      dueDate: "2026-07-20",
      today: "2026-07-23",
      nextMove: "Record return (BFA)",
    });
    expect(await screen.findByText("Status Submitted → Under Review · Ball in court GC → EOR")).toBeInTheDocument();
    expect(filter).toHaveBeenCalledWith({ projectId: "p1", table: "submittals", recordId: "s1", limit: 40 });
    expect(screen.getByText("Reviewer response")).toBeInTheDocument();
    expect(screen.getByText("EOR", { selector: "strong" })).toBeInTheDocument();
    expect(screen.getByText(/J\. Smith/)).toBeInTheDocument();
    expect(screen.getByText(/\(3d over\)/)).toBeInTheDocument();
    expect(screen.getByText(/Next: Record return \(BFA\)/)).toBeInTheDocument();
  });

  it("says the trail is unavailable on a failed read, never 'no moves'", async () => {
    filter.mockRejectedValue(new Error("rls"));
    renderPanel();
    expect(await screen.findByRole("alert")).toHaveTextContent("Audit trail unavailable");
    expect(screen.queryByText(/No recorded workflow moves/)).not.toBeInTheDocument();
  });

  it("states an empty trail, no blockers and no recorded owner plainly", async () => {
    filter.mockResolvedValue([]);
    renderPanel({ ballInCourt: null });
    expect(await screen.findByText("No recorded workflow moves yet.")).toBeInTheDocument();
    expect(screen.getByText("No recorded blockers.")).toBeInTheDocument();
    expect(screen.getByText("No ball in court recorded")).toBeInTheDocument();
  });

  it("never reports a capped blocker read as complete", async () => {
    filter.mockResolvedValue([]);
    renderPanel({ waitingOnStatus: "incomplete", waitingOn: [{ what: "RFI 014 open" }] });
    expect(await screen.findByText(/Blocker check incomplete/)).toHaveTextContent("Found so far: RFI 014 open.");
    expect(screen.queryByText("No recorded blockers.")).not.toBeInTheDocument();
  });
});
