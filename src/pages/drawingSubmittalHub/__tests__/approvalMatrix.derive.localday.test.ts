/**
 * Local-vs-UTC day keys for transmittal ordering, pinned to a fixed UTC-7
 * "local" zone.
 *
 * The suite runs under TZ=UTC (vite.config.js), which hides exactly this
 * difference. approvalMatrix.derive keys a dated row on its entered date as
 * written and gives an undated row no day at all, so it needs no local-day
 * conversion. toDateInputValue, the project's local-day helper, is swapped
 * for a UTC-7 version here, so a change that routes an entered date through
 * it fails these cases whatever zone the runner is in. Each case fails on the
 * regression it names.
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
    kind: "shop" as const,
    gc_drawing_id: null as string | null,
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
  it("keeps an entered date on the day it names, even stored as a midnight-UTC timestamp", () => {
    // Shifting the entered Aug 3 (00:00Z) to local would make it Aug 2 at
    // UTC-7. That ties with one dated noon UTC on Aug 2 and logged later,
    // which then wins on created_at.
    const last = buildLastTransmittalBySet([
      transmittal({ id: "entered", transmittal_number: "T-001", date_sent: "2026-08-03T00:00:00+00:00", created_at: "2026-07-30T15:00:00Z", drawingIds: ["d1"] }),
      transmittal({ id: "day-before", transmittal_number: "T-002", date_sent: "2026-08-02T12:00:00+00:00", created_at: "2026-08-02T19:00:00Z", drawingIds: ["d1"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("entered");
  });

  it("never lets an undated row logged in the local evening outrank a dated one", () => {
    // Logged 18:30 on Aug 2 local, which is already Aug 3 in UTC. Keying it on
    // created_at's UTC day tied it with the transmittal dated Aug 3, and it
    // then won on created_at. An undated row has no day, so it can't tie.
    const last = buildLastTransmittalBySet([
      transmittal({ id: "dated", transmittal_number: "T-001", date_sent: "2026-08-03", created_at: "2026-08-01T15:00:00Z", drawingIds: ["d1"] }),
      transmittal({ id: "undated", transmittal_number: "T-002", date_sent: null, created_at: "2026-08-03T01:30:00Z", drawingIds: ["d1"] }),
    ], packages);
    expect(last.get("s1")?.id).toBe("dated");
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
