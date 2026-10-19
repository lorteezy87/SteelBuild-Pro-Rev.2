// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import "@testing-library/jest-dom";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";

const present = vi.fn(async (_opts: { blob: Blob; filename: string; title?: string }) => ({ presented: true }));
vi.mock("@/lib/native/fileExport", () => ({ presentGeneratedFile: (opts: { blob: Blob; filename: string; title?: string }) => present(opts) }));

import ReviewDelayCard from "../ReviewDelayCard";

afterEach(() => {
  cleanup();
  present.mockClear();
});

const TODAY = "2026-08-03";
const SUBMITTALS = [
  { id: "a", submittal_number: "SUB-010", title: "Columns", status: "Under Review", reviewer: "EOR" },
  { id: "b", submittal_number: "SUB-011", title: "Joists", status: "Approved", reviewer: "Architect" },
  { id: "c", submittal_number: "SUB-012", title: "Stairs", status: "Under Review", reviewer: "EOR" },
];
const ROUNDS = {
  a: [{ submittal_id: "a", round_number: 1, status: "Under Review", submitted_date: "2026-06-15", reviewer: "EOR" }],
  b: [{ submittal_id: "b", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-10", reviewer: "Architect" }],
  c: [{ submittal_id: "c", round_number: 1, status: "Under Review", reviewer: "EOR" }],
};

describe("ReviewDelayCard", () => {
  it("summarises late, still-out and unmeasured rounds against the review period", () => {
    render(<ReviewDelayCard submittals={SUBMITTALS} roundsBySubmittal={ROUNDS} today={TODAY} />);
    const card = screen.getByTestId("review-delay-card");
    expect(within(card).getByText(/Review period 10 working days/)).toBeInTheDocument();
    // SUB-010 is out 25 working days past due → listed with the 21+ notice step.
    const table = within(card).getByRole("table");
    expect(within(table).getByText("SUB-010")).toBeInTheDocument();
    expect(within(table).getByText("Still out")).toBeInTheDocument();
    expect(within(table).getByText("21+ · notice")).toBeInTheDocument();
    // SUB-011 came back on time and is not in the late list.
    expect(within(table).queryByText("SUB-011")).not.toBeInTheDocument();
    // SUB-012 has no sent date: unmeasured, not on time.
    fireEvent.click(within(card).getByRole("button", { name: /Show 1 unmeasured round/ }));
    expect(within(card).getByText(/No sent date recorded/)).toBeInTheDocument();
  });

  it("states the calendar basis when the hub runs on calendar days", () => {
    render(<ReviewDelayCard submittals={SUBMITTALS} roundsBySubmittal={ROUNDS} today={TODAY} basis="calendar" projectMeta={{ detailing_lead_days: { approval: 14 } }} />);
    expect(screen.getByText(/Review period 14 calendar days/)).toBeInTheDocument();
  });

  it("shows an empty state without rounds and disables export", () => {
    render(<ReviewDelayCard submittals={[]} roundsBySubmittal={{}} today={TODAY} />);
    expect(screen.getByText("No submitted review rounds yet.")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Export CSV" })).toBeDisabled();
  });

  it("exports the delay log as CSV named for the job", async () => {
    render(<ReviewDelayCard submittals={SUBMITTALS} roundsBySubmittal={ROUNDS} today={TODAY} projectLabel="26314 QC Police HQ" />);
    fireEvent.click(screen.getByRole("button", { name: "Export CSV" }));
    await waitFor(() => expect(present).toHaveBeenCalledTimes(1));
    const opts = present.mock.calls[0][0];
    expect(opts.filename).toBe("approval-delay-log-26314-qc-police-hq-2026-08-03.csv");
    // jsdom's Blob has no .text(); read it the way a browser FileReader would.
    const text = await new Promise<string>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.readAsText(opts.blob);
    });
    expect(text.split("\n")).toHaveLength(4);
    expect(text).toContain('"SUB-010"');
  });

  it("measures a round against its drawing set's own review period", () => {
    render(
      <ReviewDelayCard
        submittals={[{ id: "b", submittal_number: "SUB-011", status: "Approved", drawing_set_ids: ["set-1"] }]}
        roundsBySubmittal={{ b: [{ submittal_id: "b", round_number: 1, status: "Approved", submitted_date: "2026-07-06", returned_date: "2026-07-15" }] }}
        today={TODAY}
        packageMetaBySetId={new Map([["set-1", { detailing_lead_days: { approval: 3 } }]])}
      />,
    );
    // 3 working days from Mon 07-06 → due Thu 07-09; back Wed 07-15 → 4 over.
    expect(screen.getByText(/some drawing sets set their own/)).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("SUB-011")).toBeInTheDocument();
    expect(within(screen.getByRole("table")).getByText("4")).toBeInTheDocument();
  });
});
