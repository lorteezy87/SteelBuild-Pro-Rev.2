// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

const { takePhoto, share, impact, isNativePlatform } = vi.hoisted(() => ({
  takePhoto: vi.fn(),
  share: vi.fn(),
  impact: vi.fn(),
  isNativePlatform: vi.fn(),
}));

vi.mock("@capacitor/camera", () => ({
  Camera: { takePhoto },
  CameraDirection: { Rear: "REAR" },
}));
vi.mock("@capacitor/share", () => ({ Share: { share } }));
vi.mock("@capacitor/haptics", () => ({
  Haptics: { impact },
  ImpactStyle: { Light: "LIGHT", Medium: "MEDIUM" },
}));
vi.mock("@/lib/native/platform", () => ({ isNativePlatform }));

import {
  captureNativePhoto,
  nativeImpact,
  shareCurrentReport,
} from "@/lib/native/capabilities";

describe("native app capabilities", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    isNativePlatform.mockReturnValue(true);
  });

  it("captures a jobsite photo as an uploadable file", async () => {
    const blob = new Blob(["image-bytes"], { type: "image/jpeg" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));
    takePhoto.mockResolvedValue({ webPath: "capacitor://photo/1", metadata: { format: "jpeg" } });

    const file = await captureNativePhoto();

    expect(takePhoto).toHaveBeenCalledWith(expect.objectContaining({
      cameraDirection: "REAR",
      correctOrientation: true,
    }));
    expect(file).toBeInstanceOf(File);
    expect(file?.type).toBe("image/jpeg");
    expect(file?.name).toMatch(/^steelbuild-photo-.*\.jpg$/);
  });

  it("opens the native share sheet for the current report and confirms with haptics", async () => {
    share.mockResolvedValue(undefined);
    impact.mockResolvedValue(undefined);

    await shareCurrentReport({
      title: "Project Status",
      url: "https://steelbuild-pro.com/Reports/project-status",
    });

    expect(share).toHaveBeenCalledWith({
      title: "Project Status",
      text: "SteelBuild Pro report: Project Status",
      url: "https://steelbuild-pro.com/Reports/project-status",
      dialogTitle: "Share Project Status",
    });
    expect(impact).toHaveBeenCalledWith({ style: "LIGHT" });
  });

  it("skips plugin calls in a regular web browser", async () => {
    isNativePlatform.mockReturnValue(false);

    expect(await captureNativePhoto()).toBeNull();
    await nativeImpact("medium");
    await shareCurrentReport({ title: "Project Status", url: "https://example.com" });

    expect(takePhoto).not.toHaveBeenCalled();
    expect(share).not.toHaveBeenCalled();
    expect(impact).not.toHaveBeenCalled();
  });
});
