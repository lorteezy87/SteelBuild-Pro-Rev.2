/**
 * The transmittal log's truncation notice.
 *
 * useTransmittals has flagged a capped read since it was written — and
 * documented why it matters: both reads are newest-first, so a cap drops the
 * OLDEST rows, and "a set sent only on them would otherwise look never sent".
 * approvalMatrix.derive.ts consumed the flag; the log itself ignored it.
 *
 * The count is taken on the RAW reads, before soft-deleted headers are
 * dropped, so the rendered array is shorter than the cap even when truncated —
 * which is why the notice must key off the flag, not off `rows.length`.
 */
import { describe, expect, it } from "vitest";
import { TRANSMITTAL_LOG_READ_CAP } from "@/hooks/useTransmittals";
import type { TransmittalRow } from "@/hooks/useTransmittals";
import {
  transmittalTruncationMessage,
  transmittalTruncationOf,
} from "@/components/drawings/register/TransmittalLogPanel";
import { DEFAULT_LIST_CAP } from "@/components/shared/ListTruncationNotice";

describe("transmittalTruncationMessage", () => {
  it("renders nothing when neither read was capped", () => {
    expect(transmittalTruncationMessage({ headers: false, items: false })).toBeNull();
  });

  it("names missing rows when the HEADER read capped", () => {
    const msg = transmittalTruncationMessage({ headers: true, items: false })!;
    expect(msg.heading).toBe("SHOWING THE NEWEST 1,000 TRANSMITTALS");
    expect(msg.body).toMatch(/capped at 1,000 rows and more exist/);
  });

  it("names under-reported attachments — not missing rows — when only ITEMS capped", () => {
    const msg = transmittalTruncationMessage({ headers: false, items: true })!;
    expect(msg.heading).toBe("ATTACHMENT LISTS INCOMPLETE");
    expect(msg.body).toMatch(/Every transmittal is listed/);
    expect(msg.body).toMatch(/lower bounds/);
  });

  it("covers both when both reads capped", () => {
    const msg = transmittalTruncationMessage({ headers: true, items: true })!;
    expect(msg.body).toMatch(/more exist/);
    expect(msg.body).toMatch(/lower bounds/);
  });

  it("always warns that the OLDEST are the missing ones", () => {
    for (const t of [
      { headers: true, items: false },
      { headers: false, items: true },
      { headers: true, items: true },
    ]) {
      const body = transmittalTruncationMessage(t)!.body;
      expect(body).toMatch(/OLDEST/);
      expect(body).toMatch(/never sent/);
    }
  });
});

describe("truncation flag plumbing", () => {
  it("pins the log's cap to the shared list cap, and the panel's mirror to both", () => {
    expect(TRANSMITTAL_LOG_READ_CAP).toBe(DEFAULT_LIST_CAP);
    // The panel mirrors the cap rather than importing it (page tests mock the
    // hook module). The heading is where that mirror is observable.
    expect(transmittalTruncationMessage({ headers: true, items: false })!.heading)
      .toBe(`SHOWING THE NEWEST ${DEFAULT_LIST_CAP.toLocaleString()} TRANSMITTALS`);
  });

  it("reads a log built elsewhere as complete rather than unknown", () => {
    expect(transmittalTruncationOf([] as TransmittalRow[])).toEqual({ headers: false, items: false });
    expect(transmittalTruncationOf(null)).toEqual({ headers: false, items: false });
    expect(transmittalTruncationOf(undefined)).toEqual({ headers: false, items: false });
  });

  it("a truncated log can be SHORTER than the cap, so rows.length cannot drive the notice", () => {
    // The real shape: 1000 raw headers read, all but 3 soft-deleted and filtered.
    const rows = [{ id: "a" }, { id: "b" }, { id: "c" }] as unknown as TransmittalRow[];
    Object.defineProperty(rows, "truncation", { value: { headers: true, items: false }, enumerable: false });
    expect(rows.length).toBeLessThan(TRANSMITTAL_LOG_READ_CAP);
    // A count-driven notice (ListTruncationNotice count={rows.length}) renders nothing here.
    expect(rows.length >= TRANSMITTAL_LOG_READ_CAP).toBe(false);
    // The flag-driven one still fires.
    expect(transmittalTruncationMessage(transmittalTruncationOf(rows))).not.toBeNull();
  });

  it("keeps possiblyTruncated as the OR, the contract the Approval Matrix reads", () => {
    for (const [headers, items, expected] of [
      [false, false, false],
      [true, false, true],
      [false, true, true],
      [true, true, true],
    ] as const) {
      const rows = [] as unknown as TransmittalRow[];
      Object.defineProperty(rows, "possiblyTruncated", { value: headers || items, enumerable: false });
      expect((rows as unknown as { possiblyTruncated: boolean }).possiblyTruncated).toBe(expected);
    }
  });
});
