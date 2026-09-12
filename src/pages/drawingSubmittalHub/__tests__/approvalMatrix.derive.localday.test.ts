/**
 * Local-vs-UTC day keys for Last Transmittal ordering, pinned to a fixed
 * UTC-7 "local" zone.
 *
 * The suite runs under TZ=UTC (vite.config.js), which hides exactly this
 * difference. So toDateInputValue — the one local-day conversion
 * approvalMatrix.derive uses — is swapped for a UTC-7 version here. Each case
 * fails on the regression it names, whatever zone the runner is in.
 */
import { describe, expect, it, vi } from "vitest";
import type { TransmittalRow } from "@/hooks/useTransmittals";

vi.mock("../format", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../format")>();
  const utcMinus7Day = (input: unknown): string => {
    const time = new Date(input as string | number | Date).getTime();
    return Number.isFinite(time) ? new Date(time - 7 * 3_600_000).toISOString().slice(0, 10) : "";
  };
  return { ...actual, toDateInputValue: utcMinus7Day };
});

import { buildLastOutgoingBySet, buildLastTransmittalBySet } from "../approvalMatrix.derive";
import { buildSetPackages } from "../format";

function transmittal(overrides: Partial<TransmittalRow> & { drawingIds?: string[] }): TransmittalRow {
  const { drawingIds = [], ...rest } = overrides;
  const items = drawingIds.map((drawingId, i) => ({
    id: `${rest.id ?? "t"}-item-${i}`,
    drawing_revision_id: `rev-${drawingId}`,
    drawing_id: drawingId,
    sheet_number: drawingId.toUpperCase(),
    sheet_title: null as string | null,
    revision_code: "0",
  }));
  return {
    id: "t",
    project_id: "p1",
    transmittal_number: "T-001",
    direction: "outgoing",
    source_company: null,
    received_from: null,
    sent_to: "EOR",
    subject: null,
    date_sent: null,
    date_received: null,
    notes: null,
    created_at: "2026-08-01T09:00:00Z",
    is_deleted: false,
    items,
    item_count: items.length,
    ...rest,
  };
}

const packages = buildSetPackages(
  [{ id: "d1", drawing_set_id: "s1", stage: "IFA" }] as any,
  [{ id: "s1", set_name: "Main Steel" }] as any,
  [],
);

describe("Last Transmittal day keys (fixed UTC-7 local zone)", () => {
  it("files an undated transmittal under the local day it was logged, not its UTC day", () => {
    // Logged 18:30 on Aug 2 local, which is already Aug 3 in UTC. Slicing
    // created_at tied it with a transmittal dated Aug 3, and it then won on
    // created_at.
    const last = buildLastTransmittalBySet([
      transmittal({ id: "dated", transmittal_number: "T-001", date_sent: "2026-08-03", created_at: "2026-08-01T15:00:00Z", drawingIds: ["d1"] }),
      transmittal({ id: "undated", transmittal_number: "T-002", date_sent: null, created_at: "2026-08-03T01:30:00Z", drawingIds: ["d1"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("dated");
  });

  it("keeps an entered date on the day it names, even stored as a midnight-UTC timestamp", () => {
    // Converting the entered Aug 3 (00:00Z) to local would make it Aug 2 at
    // UTC-7. That ties with an undated entry logged at noon on Aug 2, which
    // then wins on created_at.
    const last = buildLastTransmittalBySet([
      transmittal({ id: "entered", transmittal_number: "T-001", date_sent: "2026-08-03T00:00:00+00:00", created_at: "2026-07-30T15:00:00Z", drawingIds: ["d1"] }),
      transmittal({ id: "undated", transmittal_number: "T-002", date_sent: null, created_at: "2026-08-02T19:00:00Z", drawingIds: ["d1"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("entered");
  });
});

describe("Last sent day keys (fixed UTC-7 local zone)", () => {
  it("keeps an entered send date on the day it names, for ordering and for display", () => {
    // Shifting the entered Aug 3 (00:00Z) to local would make it Aug 2 at
    // UTC-7. That ties with one sent at noon UTC on Aug 2 and logged later,
    // which then wins on created_at, and the line would print Aug 2.
    const { bySet } = buildLastOutgoingBySet([
      transmittal({ id: "entered", transmittal_number: "T-001", date_sent: "2026-08-03T00:00:00+00:00", created_at: "2026-07-30T15:00:00Z", drawingIds: ["d1"] }),
      transmittal({ id: "day-before", transmittal_number: "T-002", date_sent: "2026-08-02T12:00:00+00:00", created_at: "2026-08-02T19:00:00Z", drawingIds: ["d1"] }),
    ], packages, new Map());
    expect(bySet.get("s1")).toMatchObject({ id: "entered", dateSent: "2026-08-03" });
  });
});
