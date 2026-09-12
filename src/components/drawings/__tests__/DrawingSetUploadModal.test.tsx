// @vitest-environment jsdom
import type { ReactNode } from "react";
import { render } from "@testing-library/react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { beforeEach, describe, expect, it, vi } from "vitest";

const m = vi.hoisted(() => ({
  role: "pm",
  reviewProps: [] as Array<Record<string, unknown>>,
  creationArgs: [] as Array<Record<string, unknown>>,
  handleCreate: vi.fn(),
}));

// The real permission table, fed a chosen project role, so the modal's gate is
// judged against the same floors and entity overrides the rest of the UI uses.
vi.mock("@/services/permissions", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/services/permissions")>();
  return {
    ...actual,
    usePermissions: () => ({
      can: (action: string, entity: string | null = null) => actual.canPerform(m.role, action, entity),
    }),
  };
});
vi.mock("@/components/ui/dialog", () => ({
  Dialog: ({ open, children }: { open?: boolean; children?: ReactNode }) => (open ? <div>{children}</div> : null),
  DialogContent: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogHeader: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
  DialogTitle: ({ children }: { children?: ReactNode }) => <div>{children}</div>,
}));
vi.mock("../upload/useUploadWizardState", () => ({
  useUploadWizardState: () => ({
    step: 4, setStep: vi.fn(),
    files: [] as File[], setFiles: vi.fn(),
    meta: { setName: "Main Steel – L2 Rev A", revision: "A" }, setMeta: vi.fn(),
    processingStatus: { steps: [] as unknown[], currentStepId: null as string | null, progress: 0, message: "" },
    sheets: [] as unknown[], setSheets: vi.fn(),
    fileResults: [] as unknown[], createdCount: 0, processError: null as string | null, supersedeResult: null as unknown,
    aiFilledFields: {}, uploadBatchId: null as string | null,
    reset: vi.fn(), handleClose: vi.fn(),
  }),
}));
vi.mock("../upload/useFileUploadAndExtract", () => ({
  useFileUploadAndExtract: () => ({ handleUploadAndProcess: vi.fn() }),
}));
vi.mock("../upload/useDrawingSetCreation", () => ({
  useDrawingSetCreation: (args: Record<string, unknown>) => {
    m.creationArgs.push(args);
    return { handleCreate: m.handleCreate };
  },
}));
vi.mock("../uploadSteps/ReviewStep", () => ({
  default: (props: Record<string, unknown>) => {
    m.reviewProps.push(props);
    return <div data-testid="review-step" />;
  },
}));
// Only the Review step (4) renders; stub the others so pdf.js never loads.
vi.mock("../uploadSteps/ChoiceStep", () => ({ default: (): null => null }));
vi.mock("../uploadSteps/SetInfoStep", () => ({ default: (): null => null }));
vi.mock("../uploadSteps/FileDropStep", () => ({ default: (): null => null }));
vi.mock("../uploadSteps/ProcessingStep", () => ({ default: (): null => null }));
vi.mock("../uploadSteps/SuccessStep", () => ({ default: (): null => null }));

import DrawingSetUploadModal from "../DrawingSetUploadModal";
import { canPerform } from "@/services/permissions";

const PROJECT = { id: "p1", name: "Proj" };

function renderModal(activeProject: { id: string; name: string } | null = PROJECT) {
  const client = new QueryClient();
  render(
    <QueryClientProvider client={client}>
      <DrawingSetUploadModal
        open
        onClose={() => {}}
        onComplete={() => {}}
        activeProject={activeProject}
        onNewRevision={() => {}}
        existingDrawings={[]}
        existingSetNames={[]}
      />
    </QueryClientProvider>,
  );
  expect(m.reviewProps.length).toBeGreaterThan(0);
  return { review: m.reviewProps.at(-1), creation: m.creationArgs.at(-1) };
}

beforeEach(() => {
  m.role = "pm";
  m.reviewProps.length = 0;
  m.creationArgs.length = 0;
});

describe("DrawingSetUploadModal — who may supersede another set's pages", () => {
  it.each(["pm", "admin", "owner"])("a project %s gets the controls, and the Review step gets the project", (role) => {
    m.role = role;
    const { review, creation } = renderModal();
    expect(review).toMatchObject({ canSupersede: true, projectId: "p1" });
    expect(review?.onCreate).toBe(m.handleCreate);
    expect(creation).toMatchObject({ canSupersede: true, activeProject: PROJECT });
  });

  // Superseding writes drawings, and production RLS allows that from pm up.
  it.each(["field", "viewer"])("a project %s never does", (role) => {
    m.role = role;
    const { review, creation } = renderModal();
    expect(review).toMatchObject({ canSupersede: false, projectId: "p1" });
    expect(creation).toMatchObject({ canSupersede: false });
  });

  it("gates on drawing:create, which the client's looser drawing:edit override would not", () => {
    // Why the field case means something: field users may edit drawings in the client.
    expect(canPerform("field", "edit", "drawing")).toBe(true);
    expect(canPerform("field", "create", "drawing")).toBe(false);
  });

  it("with no active project, the Review step gets no project id", () => {
    const { review } = renderModal(null);
    expect(review).toMatchObject({ projectId: null });
  });
});
