// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { ComponentType } from "react";
import type { FabApprovalEvidenceRows } from "@/lib/exports/fabReleaseEvidence";

const mocks = vi.hoisted(() => ({
  loadApproval: vi.fn(),
  loadRfis: vi.fn(),
  recordRelease: vi.fn(),
  presentFiles: vi.fn(),
  toastError: vi.fn(),
}));

vi.mock("@/lib/supabase", () => ({ supabase: { from: vi.fn(() => {
  const query = {
    select: () => query,
    eq: () => query,
    order: () => query,
    range: async () => ({ data: [] as unknown[], error: null as Error | null }),
  };
  return query;
}) } }));
vi.mock("@/api/supabaseClient", () => ({ resolveFileUrl: vi.fn(), entities: {} }));
vi.mock("@/lib/exports/fabReleaseEvidence", async (importOriginal) => {
  const real = await importOriginal<typeof import("@/lib/exports/fabReleaseEvidence")>();
  return { ...real, loadFabApprovalEvidence: mocks.loadApproval, loadFabGateRfis: mocks.loadRfis };
});
vi.mock("@/lib/fabRelease/releaseStatus", () => ({
  recordFabRelease: mocks.recordRelease,
  FabReleaseBlockedError: class FabReleaseBlockedError extends Error {},
}));
vi.mock("@/lib/native/fileExport", () => ({ presentGeneratedFiles: mocks.presentFiles }));
vi.mock("sonner", () => ({ toast: { error: mocks.toastError, success: vi.fn() } }));

import ExportFabReleaseModal from "../ExportFabReleaseModal";

const drawing = {
  id: "drawing-1",
  project_id: "project-1",
  drawing_set_id: "set-1",
  drawing_set_name: "Shop Steel",
  sheet_number: "S-101",
  stage: "IFC",
  linked_rfi_ids: "RFI-700",
  is_deleted: false,
};
const sets = [{ id: "set-1", set_name: "Shop Steel" }];
const approval: FabApprovalEvidenceRows = {
  submittals: [{
    id: "sub-1", submittal_type: "Shop Drawing", status: "Approved", ball_in_court: "GC",
    drawing_set_ids: ["set-1"], submitted_date: null, updated_at: null, round_number: 1,
    is_deleted: false, deleted_at: null,
  }],
  drawingSignoffs: [],
  drawingRevisions: [],
};

const Modal = ExportFabReleaseModal as ComponentType<{
  open: boolean;
  onClose: () => void;
  kind: "fab_release" | "turnover" | "claims";
  project: { id: string; name: string; metadata: { require_fab_signoffs: boolean } };
  drawings: typeof drawing[];
  drawingSets: typeof sets;
}>;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.loadApproval.mockResolvedValue(approval);
  mocks.loadRfis.mockResolvedValue([]);
});
afterEach(cleanup);

function show(kind: "fab_release" | "turnover" | "claims" = "fab_release") {
  return render(
    <Modal
      open
      onClose={vi.fn()}
      kind={kind}
      project={{ id: "project-1", name: "Steel Tower", metadata: { require_fab_signoffs: false } }}
      drawings={[drawing]}
      drawingSets={sets}
    />,
  );
}

describe("fab and turnover export evidence", () => {
  it.each(["fab_release", "turnover"] as const)("blocks %s when approval evidence fails instead of showing zero matches", async (kind) => {
    mocks.loadApproval.mockRejectedValue(new Error("submittal page unavailable"));
    show(kind);

    expect(screen.getByText(/Checking approval evidence/i)).toBeTruthy();
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/approval evidence unavailable/i));
    expect(screen.queryByText(/^0$/)).toBeNull();
    expect(screen.getByRole("button", { name: /evidence unavailable/i }).hasAttribute("disabled")).toBe(true);
    expect(mocks.recordRelease).not.toHaveBeenCalled();
  });

  it("keeps the PM override unavailable when linked-RFI evidence fails", async () => {
    mocks.loadRfis.mockRejectedValue(new Error("RFI page unavailable"));
    show();

    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/RFI evidence unavailable/i));
    expect(screen.queryByText(/PM override/i)).toBeNull();
    expect(screen.getByRole("button", { name: /evidence unavailable/i }).hasAttribute("disabled")).toBe(true);
    expect(mocks.recordRelease).not.toHaveBeenCalled();
  });

  it("records and presents a package only after all evidence resolves, with current sign-off details", async () => {
    let resolveApproval: (rows: FabApprovalEvidenceRows) => void = () => { throw new Error("Approval resolver missing"); };
    mocks.loadApproval.mockReturnValue(new Promise<FabApprovalEvidenceRows>((resolve) => { resolveApproval = resolve; }));
    mocks.recordRelease.mockResolvedValue({ id: "release-1" });
    mocks.presentFiles.mockResolvedValue("downloaded");
    show();

    expect(screen.getByRole("button", { name: /checking evidence/i }).hasAttribute("disabled")).toBe(true);
    expect(mocks.recordRelease).not.toHaveBeenCalled();
    resolveApproval({
      ...approval,
      drawingRevisions: [{ id: "revision-current", drawing_id: "drawing-1", is_current: true, archived_at: null }],
      drawingSignoffs: [{
        id: "stamp-1", drawing_id: "drawing-1", drawing_revision_id: "revision-current",
        stamp_type: "approved_for_fabrication", stamped_by_name: "Current PM",
        stamped_at: "2026-10-07T12:00:00Z", is_voided: false,
      }],
    });

    await waitFor(() => expect(screen.getByRole("button", { name: "Export Package" }).hasAttribute("disabled")).toBe(false));
    fireEvent.click(screen.getByRole("button", { name: "Export Package" }));
    await waitFor(() => expect(mocks.presentFiles).toHaveBeenCalledTimes(1));
    expect(mocks.recordRelease).toHaveBeenCalledTimes(1);

    const manifest = (mocks.presentFiles.mock.calls[0][0] as { files: Array<{ blob: Blob }> }).files[0].blob;
    const csv = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsText(manifest);
    });
    expect(csv).toContain("Current PM");
    expect(csv).toContain("approved_for_fabrication");
  });

  it("exports claims without fab approval and gate reads", async () => {
    mocks.presentFiles.mockResolvedValue("downloaded");
    show("claims");

    expect(screen.getByRole("button", { name: "Export Package" }).hasAttribute("disabled")).toBe(false);
    fireEvent.click(screen.getByRole("button", { name: "Export Package" }));
    await waitFor(() => expect(mocks.presentFiles).toHaveBeenCalledTimes(1));
    expect(mocks.loadApproval).not.toHaveBeenCalled();
    expect(mocks.loadRfis).not.toHaveBeenCalled();
    expect(mocks.recordRelease).not.toHaveBeenCalled();
  });
});
