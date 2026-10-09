// @vitest-environment jsdom
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteFile,
  downloadFile,
  getUri,
  impact,
  isNativeActionCancelled,
  isNativePlatform,
  mkdir,
  rmdir,
  share,
  toastError,
  writeFile,
} = vi.hoisted(() => ({
  deleteFile: vi.fn(),
  downloadFile: vi.fn(),
  getUri: vi.fn(),
  impact: vi.fn(),
  isNativeActionCancelled: vi.fn(),
  isNativePlatform: vi.fn(),
  mkdir: vi.fn(),
  rmdir: vi.fn(),
  share: vi.fn(),
  toastError: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: { deleteFile, getUri, mkdir, rmdir, writeFile },
}));
vi.mock("@capacitor/file-transfer", () => ({ FileTransfer: { downloadFile } }));
vi.mock("@capacitor/share", () => ({ Share: { share } }));
vi.mock("@/lib/native/capabilities", () => ({ isNativeActionCancelled, nativeImpact: impact }));
vi.mock("@/lib/native/platform", () => ({ isNativePlatform }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import {
  presentGeneratedFile,
  presentGeneratedFiles,
  presentRemoteFile,
  presentRemoteFiles,
} from "@/lib/native/fileExport";
import { setActiveOrgId } from '@/lib/activeOrg';

describe("native file presentation", () => {
  beforeEach(() => {
    setActiveOrgId('org-a');
    vi.clearAllMocks();
    isNativePlatform.mockReturnValue(false);
    writeFile.mockResolvedValue({ uri: "file:///cache/steelbuild-exports/report.csv" });
    getUri.mockImplementation(({ path }) => Promise.resolve({ uri: `file:///cache/${path}` }));
    mkdir.mockResolvedValue(undefined);
    rmdir.mockResolvedValue(undefined);
    downloadFile.mockResolvedValue({ path: "file:///cache/download" });
    deleteFile.mockResolvedValue(undefined);
    share.mockResolvedValue({ activityType: "com.apple.UIKit.activity.Mail" });
    impact.mockResolvedValue(undefined);
    isNativeActionCancelled.mockImplementation((error) => /cancel/i.test(String(error?.message || error)));
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it('does not share a generated file written after sign-out and re-entry', async () => {
    isNativePlatform.mockReturnValue(true);
    let resolveWrite!: (value: { uri: string }) => void;
    writeFile.mockImplementationOnce(() => new Promise(resolve => { resolveWrite = resolve; }));
    const pending = presentGeneratedFile({ blob: new Blob(['private']), filename: 'report.txt' });
    await vi.waitFor(() => expect(writeFile).toHaveBeenCalledOnce());
    setActiveOrgId(null); setActiveOrgId('org-a');
    resolveWrite({ uri: 'file:///private' });
    expect(await pending).toBe('cancelled');
    expect(share).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });

  it('stops a remote group before downloading its next file after an owner switch', async () => {
    isNativePlatform.mockReturnValue(true);
    let resolveDownload!: () => void;
    downloadFile.mockImplementationOnce(() => new Promise<void>(resolve => { resolveDownload = resolve; }));
    const pending = presentRemoteFiles({ files: [{ url: 'https://files.test/a', filename: 'a' }, { url: 'https://files.test/b', filename: 'b' }], title: 'Old project' });
    await vi.waitFor(() => expect(downloadFile).toHaveBeenCalledOnce());
    setActiveOrgId('org-b'); resolveDownload();
    expect(await pending).toBe('cancelled');
    expect(downloadFile).toHaveBeenCalledOnce();
    expect(share).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledOnce();
    expect(rmdir).toHaveBeenCalledOnce();
  });

  it('rejects a caller that became stale before file presentation began', async () => {
    const result = await presentGeneratedFile({ blob: new Blob(['private']), filename: 'a', isCurrent: () => false });
    expect(result).toBe('cancelled');
    expect(share).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
  });

  it("preserves a Safari-compatible browser download outside the native shell", async () => {
    vi.useFakeTimers();
    const click = vi.fn();
    const remove = vi.fn();
    const anchor = { click, remove, download: "", href: "", rel: "" };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLAnchorElement);
    vi.spyOn(document.body, "appendChild").mockImplementation((node) => node);
    const createObjectURL = vi.fn().mockReturnValue("blob:report");
    const revokeObjectURL = vi.fn();
    vi.stubGlobal("URL", { createObjectURL, revokeObjectURL });

    const result = await presentGeneratedFile({
      blob: new Blob(["a,b\n1,2"], { type: "text/csv" }),
      filename: "report.csv",
    });

    expect(result).toBe("downloaded");
    expect(anchor.download).toBe("report.csv");
    expect(anchor.href).toBe("blob:report");
    expect(document.body.appendChild).toHaveBeenCalledWith(anchor);
    expect(click).toHaveBeenCalledOnce();
    expect(remove).toHaveBeenCalledOnce();
    expect(revokeObjectURL).not.toHaveBeenCalled();
    vi.advanceTimersByTime(1_000);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:report");
    expect(writeFile).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
  });

  it("writes a temporary native file, shares it, and removes the cache copy", async () => {
    isNativePlatform.mockReturnValue(true);

    const result = await presentGeneratedFile({
      blob: new Blob(["abc"], { type: "text/csv" }),
      filename: "Project / status.csv",
      title: "Project status",
    });

    expect(result).toBe("shared");
    expect(writeFile).toHaveBeenCalledWith(expect.objectContaining({
      data: "YWJj",
      directory: "CACHE",
      path: expect.stringMatching(/^steelbuild-exports\/\d+-Project_status\.csv$/),
      recursive: true,
    }));
    expect(share).toHaveBeenCalledWith({
      title: "Project status",
      dialogTitle: "Share Project status",
      files: ["file:///cache/steelbuild-exports/report.csv"],
    });
    expect(impact).toHaveBeenCalledWith("light");
    expect(deleteFile).toHaveBeenCalledWith(expect.objectContaining({
      directory: "CACHE",
      path: expect.stringMatching(/^steelbuild-exports\/\d+-Project_status\.csv$/),
    }));
  });

  it("cleans up and reports a native share failure without rejecting the click handler", async () => {
    isNativePlatform.mockReturnValue(true);
    share.mockRejectedValue(new Error("share unavailable"));

    const result = await presentGeneratedFile({
      blob: new Blob(["abc"], { type: "application/pdf" }),
      filename: "pay-app.pdf",
    });

    expect(result).toBe("failed");
    expect(deleteFile).toHaveBeenCalledOnce();
    expect(toastError).toHaveBeenCalledWith("Could not share pay-app.pdf.");
  });

  it("treats closing the native share sheet as a neutral cancellation", async () => {
    isNativePlatform.mockReturnValue(true);
    share.mockRejectedValue(new Error("Share canceled"));

    const result = await presentGeneratedFile({
      blob: new Blob(["abc"], { type: "application/pdf" }),
      filename: "pay-app.pdf",
    });

    expect(result).toBe("cancelled");
    expect(deleteFile).toHaveBeenCalledOnce();
    expect(toastError).not.toHaveBeenCalled();
  });

  it("shares a related group of generated files in one native sheet", async () => {
    isNativePlatform.mockReturnValue(true);
    writeFile
      .mockResolvedValueOnce({ uri: "file:///cache/defense.pdf" })
      .mockResolvedValueOnce({ uri: "file:///cache/defense.csv" });

    const result = await presentGeneratedFiles({
      title: "Backcharge defense package",
      files: [
        { blob: new Blob(["pdf"]), filename: "defense.pdf" },
        { blob: new Blob(["csv"]), filename: "defense.csv" },
      ],
    });

    expect(result).toBe("shared");
    expect(share).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      files: ["file:///cache/defense.pdf", "file:///cache/defense.csv"],
    }));
    expect(deleteFile).toHaveBeenCalledTimes(2);
  });

  it("downloads a remote document directly to native cache before sharing", async () => {
    isNativePlatform.mockReturnValue(true);
    const fetchSpy = vi.fn();
    vi.stubGlobal("fetch", fetchSpy);

    const result = await presentRemoteFile({
      url: "https://files.example.com/signed/drawing.pdf",
      filename: "S1.1 drawing.pdf",
      title: "Drawing S1.1",
    });

    expect(result).toBe("shared");
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(writeFile).not.toHaveBeenCalled();
    expect(downloadFile).toHaveBeenCalledWith({
      path: expect.stringMatching(/^file:\/\/\/cache\/steelbuild-exports\/\d+\/0-S1.1_drawing\.pdf$/),
      url: "https://files.example.com/signed/drawing.pdf",
    });
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      files: [expect.stringMatching(/^file:\/\/\/cache\/steelbuild-exports\/\d+\/0-S1.1_drawing\.pdf$/)],
      title: "Drawing S1.1",
    }));
  });

  it("downloads a remote document group and opens one native share sheet", async () => {
    isNativePlatform.mockReturnValue(true);

    const result = await presentRemoteFiles({
      title: "Selected documents",
      files: [
        { url: "https://files.example.com/a.pdf", filename: "A.pdf" },
        { url: "https://files.example.com/b.pdf", filename: "B.pdf" },
      ],
    });

    expect(result).toBe("shared");
    expect(downloadFile).toHaveBeenCalledTimes(2);
    expect(share).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      files: [
        expect.stringMatching(/\/0-A\.pdf$/),
        expect.stringMatching(/\/1-B\.pdf$/),
      ],
    }));
    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(rmdir).toHaveBeenCalledOnce();
  });

  it("cleans up the batch after a remote download fails without sharing a partial group", async () => {
    isNativePlatform.mockReturnValue(true);
    downloadFile.mockResolvedValueOnce({}).mockRejectedValueOnce(new Error("HTTP 404"));

    const result = await presentRemoteFiles({
      title: "Selected documents",
      files: [
        { url: "https://files.example.com/a.pdf", filename: "A.pdf" },
        { url: "https://files.example.com/b.pdf", filename: "B.pdf" },
      ],
    });

    expect(result).toBe("failed");
    expect(share).not.toHaveBeenCalled();
    expect(deleteFile).toHaveBeenCalledTimes(2);
    expect(rmdir).toHaveBeenCalledOnce();
    expect(toastError).toHaveBeenCalledOnce();
  });
});
