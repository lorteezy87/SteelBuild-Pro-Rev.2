// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import ProcessingStep from "../ProcessingStep";

const noop = () => {};

interface ProcessingStatus {
  steps: { id: string; label: string; done?: boolean; warning?: boolean; detail?: string }[];
  currentStepId: string | null;
  progress: number;
  message: string;
}
interface FileResult {
  fileName: string;
  status: string;
  error?: string;
  sheetCount: number;
}

const idle: ProcessingStatus = { steps: [], currentStepId: null, progress: 0, message: "" };

/**
 * The regression these cover:
 *
 * When every file fails to upload, useFileUploadAndExtract records each
 * failure as { status: "failed", error } and the controller stops on step 3
 * with "No drawing sheets were extracted. Check the failed file details and
 * try again." That copy names details this screen never received — it took
 * only `error`, and the per-file `error` was rendered solely by SuccessStep,
 * which that path never reaches. The user was told to look at something the
 * UI could not show, so a 403, a timeout and an unresolved workspace were
 * indistinguishable.
 */
describe("ProcessingStep failure details", () => {
  it("shows the real reason each file failed, not just the generic message", () => {
    render(
      <ProcessingStep
        processingStatus={idle}
        onCancel={noop}
        error="No drawing sheets were extracted. Check the failed file details and try again."
        fileResults={[
          { fileName: "S-201.pdf", status: "failed", error: "File upload timed out after 90s — please retry", sheetCount: 0 },
        ] as FileResult[]}
      />,
    );
    expect(screen.getByText("Processing Failed")).toBeInTheDocument();
    expect(screen.getByText("S-201.pdf")).toBeInTheDocument();
    expect(
      screen.getByText("File upload timed out after 90s — please retry"),
    ).toBeInTheDocument();
  });

  it("lists every failed file, so one error does not hide the others", () => {
    render(
      <ProcessingStep
        processingStatus={idle}
        onCancel={noop}
        error="No drawing sheets were extracted. Check the failed file details and try again."
        fileResults={[
          { fileName: "S-201.pdf", status: "failed", error: "new row violates row-level security policy", sheetCount: 0 },
          { fileName: "S-202.pdf", status: "failed", error: "Workspace is still loading — please try again in a moment.", sheetCount: 0 },
        ] as FileResult[]}
      />,
    );
    expect(screen.getByText("S-201.pdf")).toBeInTheDocument();
    expect(screen.getByText("S-202.pdf")).toBeInTheDocument();
    expect(screen.getByText("new row violates row-level security policy")).toBeInTheDocument();
    expect(
      screen.getByText("Workspace is still loading — please try again in a moment."),
    ).toBeInTheDocument();
  });

  // A failure with no message must still name the file rather than render an
  // empty box, which reads as "no reason given" and is worse than saying so.
  it("names the file even when the error carries no message", () => {
    render(
      <ProcessingStep
        processingStatus={idle}
        onCancel={noop}
        error="No drawing sheets were extracted. Check the failed file details and try again."
        fileResults={[{ fileName: "S-203.pdf", status: "failed", error: "", sheetCount: 0 }] as FileResult[]}
      />,
    );
    expect(screen.getByText("S-203.pdf")).toBeInTheDocument();
    expect(screen.getByText("Upload failed for an unknown reason.")).toBeInTheDocument();
  });

  it("does not list files that succeeded", () => {
    render(
      <ProcessingStep
        processingStatus={idle}
        onCancel={noop}
        error="Something else went wrong."
        fileResults={[
          { fileName: "ok.pdf", status: "success", sheetCount: 4 },
          { fileName: "bad.pdf", status: "failed", error: "boom", sheetCount: 0 },
        ] as FileResult[]}
      />,
    );
    expect(screen.queryByText("ok.pdf")).not.toBeInTheDocument();
    expect(screen.getByText("bad.pdf")).toBeInTheDocument();
  });

  // The prop is optional; older call sites and the in-progress render must not
  // break on a missing array.
  it("renders the error screen with no fileResults at all", () => {
    render(<ProcessingStep processingStatus={idle} onCancel={noop} error="Plain failure." />);
    expect(screen.getByText("Plain failure.")).toBeInTheDocument();
    expect(screen.getByText("Processing Failed")).toBeInTheDocument();
  });

  it("shows progress, not failures, while still running", () => {
    render(
      <ProcessingStep
        processingStatus={{ steps: [], currentStepId: "upload", progress: 20, message: "Uploading S-201.pdf…" }}
        onCancel={noop}
        error={null}
        fileResults={[{ fileName: "bad.pdf", status: "failed", error: "boom", sheetCount: 0 }] as FileResult[]}
      />,
    );
    expect(screen.getByText("Processing Drawing Set")).toBeInTheDocument();
    expect(screen.queryByText("boom")).not.toBeInTheDocument();
  });
});
