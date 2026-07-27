// @vitest-environment jsdom
import React from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { beforeEach, describe, expect, it, vi } from "vitest";

const { drawingTransmittal, drawingTransmittalItem } = vi.hoisted(() => ({
  drawingTransmittal: {
    create: vi.fn(),
    update: vi.fn().mockResolvedValue({ id: "t-1" }),
    delete: vi.fn().mockResolvedValue({ success: true }),
  },
  drawingTransmittalItem: {
    create: vi.fn(),
    delete: vi.fn(),
  },
}));

vi.mock("@/api/supabaseClient", () => ({
  entities: {
    DrawingTransmittal: drawingTransmittal,
    DrawingTransmittalItem: drawingTransmittalItem,
  },
}));
vi.mock("@/services/permissions", () => ({
  usePermissions: () => ({ can: () => true }),
}));
vi.mock("@/hooks/useTransmittals", () => ({
  useTransmittals: () => ({
    data: [{
      id: "t-1",
      project_id: "project-1",
      transmittal_number: "T-010",
      direction: "outgoing",
      received_from: null,
      sent_to: "GC",
      subject: "Approval drawings",
      date_sent: "2026-07-20",
      date_received: null,
      notes: "Initial issue",
      item_count: 1,
      items: [{ id: "item-1", drawing_revision_id: "rev-1" }],
    }],
    isLoading: false,
    error: null,
  }),
}));
vi.mock("@/hooks/useDrawingRegister", () => ({
  useDrawingRegister: () => ({ data: [{
    drawing_id: "drawing-1",
    current_revision_id: "rev-1",
    sheet_number: "S-1",
    current_revision: "1",
    sheet_title: "Framing plan",
  }] }),
}));
vi.mock("@/components/command", () => ({
  Pill: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));
vi.mock("sonner", () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

import { TransmittalLogPanel } from "../TransmittalLogPanel";

function renderPanel() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <TransmittalLogPanel projectId="project-1" />
    </QueryClientProvider>,
  );
}

describe("TransmittalLogPanel record maintenance", () => {
  beforeEach(() => vi.clearAllMocks());

  it("edits an existing transmittal instead of leaving the log read-only", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Edit T-010" }));
    const subject = screen.getByPlaceholderText("Subject");
    await user.clear(subject);
    await user.type(subject, "Revised approval drawings");
    await user.click(screen.getByRole("button", { name: "Save changes" }));

    expect(drawingTransmittal.update).toHaveBeenCalledWith("t-1", expect.objectContaining({
      subject: "Revised approval drawings",
    }));
  });

  it("requires confirmation and deletes the transmittal through its entity client", async () => {
    const user = userEvent.setup();
    renderPanel();

    await user.click(screen.getByRole("button", { name: "Delete T-010" }));
    await user.click(screen.getByRole("button", { name: "Confirm delete T-010" }));

    expect(drawingTransmittal.delete).toHaveBeenCalledWith("t-1");
  });
});
