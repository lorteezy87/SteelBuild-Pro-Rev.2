// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  deleteFile,
  impact,
  isNativePlatform,
  share,
  toastError,
  writeFile,
} = vi.hoisted(() => ({
  deleteFile: vi.fn(),
  impact: vi.fn(),
  isNativePlatform: vi.fn(),
  share: vi.fn(),
  toastError: vi.fn(),
  writeFile: vi.fn(),
}));

vi.mock("@capacitor/filesystem", () => ({
  Directory: { Cache: "CACHE" },
  Filesystem: { deleteFile, writeFile },
}));
vi.mock("@capacitor/share", () => ({ Share: { share } }));
vi.mock("@/lib/native/capabilities", () => ({ nativeImpact: impact }));
vi.mock("@/lib/native/platform", () => ({ isNativePlatform }));
vi.mock("sonner", () => ({ toast: { error: toastError } }));

import { presentGeneratedFile, presentGeneratedFiles, presentRemoteFile } from "@/lib/native/fileExport";

describe("presentGeneratedFile", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativePlatform.mockReturnValue(false);
    writeFile.mockResolvedValue({ uri: "file:///cache/steelbuild-exports/report.csv" });
    deleteFile.mockResolvedValue(undefined);
    share.mockResolvedValue({ activityType: "com.apple.UIKit.activity.Mail" });
    impact.mockResolvedValue(undefined);
  });

  it("preserves a normal browser download outside the native shell", async () => {
    const click = vi.fn();
    const anchor = { click, download: "", href: "", rel: "" };
    vi.spyOn(document, "createElement").mockReturnValue(anchor as unknown as HTMLAnchorElement);
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
    expect(click).toHaveBeenCalledOnce();
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

  it("fetches a remote document before sharing it from the native shell", async () => {
    isNativePlatform.mockReturnValue(true);
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      blob: async () => new Blob(["drawing"], { type: "application/pdf" }),
    }));

    const result = await presentRemoteFile({
      url: "https://files.example.com/signed/drawing.pdf",
      filename: "S1.1 drawing.pdf",
      title: "Drawing S1.1",
    });

    expect(result).toBe("shared");
    expect(writeFile).toHaveBeenCalledOnce();
    expect(share).toHaveBeenCalledWith(expect.objectContaining({
      files: ["file:///cache/steelbuild-exports/report.csv"],
      title: "Drawing S1.1",
    }));
  });
});
