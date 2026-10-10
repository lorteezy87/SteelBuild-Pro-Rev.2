// @vitest-environment jsdom

import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter } from "react-router-dom";
import { describe, expect, it, vi } from "vitest";
import GcDocumentsPageView from "../GcDocumentsPageView";
import type { GcDocumentsPageController } from "../useGcDocumentsPageController";
import type { GcDocumentsPageData } from "../useGcDocumentsPageData";
import type { GcDocumentsPageState } from "../useGcDocumentsPageState";

const stats = {
  total: 0,
  needsReview: 0,
  impacted: 0,
  postAward: 0,
  sheetCount: 0,
  supersededCount: 0,
};

function renderView({ embedded = false, canCreate = true } = {}) {
  const setUploadOpen = vi.fn();
  const data = {
    stats,
    docTypeCounts: new Map(),
    filtered: [],
    isLoading: false,
    queryError: null,
  } as unknown as GcDocumentsPageData;
  const state = {
    search: "",
    docType: "ALL",
    impact: "ALL",
    expanded: new Set(),
    editingSet: null,
    impactTarget: null,
    uploadOpen: false,
    confirmState: null,
    saving: false,
    setSearch: vi.fn(),
    setDocType: vi.fn(),
    setImpact: vi.fn(),
    setUploadOpen,
    setEditingSet: vi.fn(),
    setImpactTarget: vi.fn(),
    setConfirmState: vi.fn(),
  } as unknown as GcDocumentsPageState;
  const controller = {
    expandAll: vi.fn(),
    collapseAll: vi.fn(),
  } as unknown as GcDocumentsPageController;

  const { container } = render(
    <MemoryRouter>
      <GcDocumentsPageView
        embedded={embedded}
        projectId="project-1"
        projectName="Central Tower"
        canCreate={canCreate}
        canEdit={false}
        canDelete={false}
        data={data}
        state={state}
        controller={controller}
      />
    </MemoryRouter>,
  );
  return { container, setUploadOpen };
}

describe("GcDocumentsPageView embedded", () => {
  it("shows a compact GC issuance section with intact filters and log action", () => {
    const { container, setUploadOpen } = renderView({ embedded: true });

    expect(container.querySelector(".gc-issuances-embedded")).toBeInTheDocument();
    expect(container.querySelector(".sb-dashboard-reference-page")).toBeNull();
    expect(screen.getByRole("heading", { level: 2, name: "GC Issuances" })).toBeInTheDocument();
    expect(screen.queryByRole("heading", { level: 1, name: "GC Documents" })).toBeNull();
    expect(screen.getByLabelText("Search GC documents")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by document type")).toBeInTheDocument();
    expect(screen.getByLabelText("Filter by steel impact")).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /log issuance/i }));
    expect(setUploadOpen).toHaveBeenCalledWith(true);
  });

  it("preserves the standalone header and permission gate", () => {
    renderView({ canCreate: false });

    expect(screen.getByRole("heading", { level: 1, name: "GC Documents" })).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: /log issuance/i })).toBeNull();
  });
});
