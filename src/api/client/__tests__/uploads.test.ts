import { beforeEach, describe, expect, it, vi } from "vitest";

const {
  uploadMock,
  fromMock,
  getActiveOrgIdMock,
  assertUploadAllowedMock,
  sanitizeFilenameMock,
  remapQuotaErrorMock,
} = vi.hoisted(() => {
  const upload = vi.fn();
  return {
    uploadMock: upload,
    fromMock: vi.fn(() => ({ upload })),
    getActiveOrgIdMock: vi.fn(),
    assertUploadAllowedMock: vi.fn(),
    sanitizeFilenameMock: vi.fn((name: string) => name),
    remapQuotaErrorMock: vi.fn(),
  };
});

vi.mock("@/lib/supabase", () => ({
  supabase: {
    storage: {
      from: fromMock,
    },
  },
}));

vi.mock("@/lib/activeOrg", () => ({
  getActiveOrgId: getActiveOrgIdMock,
}));

vi.mock("@/lib/uploadValidation", () => ({
  assertUploadAllowed: assertUploadAllowedMock,
  sanitizeFilename: sanitizeFilenameMock,
}));

vi.mock("@/lib/quotaExceeded", () => ({
  remapQuotaError: remapQuotaErrorMock,
}));

import { UploadFile } from "@/api/client/uploads";

describe("UploadFile", () => {
  beforeEach(() => {
    uploadMock.mockReset();
    fromMock.mockClear();
    getActiveOrgIdMock.mockReset();
    assertUploadAllowedMock.mockReset();
    sanitizeFilenameMock.mockReset();
    sanitizeFilenameMock.mockImplementation((name: string) => name);
    remapQuotaErrorMock.mockReset();
  });

  it("fails closed when org context is unresolved", async () => {
    getActiveOrgIdMock.mockReturnValue(null);
    await expect(UploadFile({ file: new File(["x"], "a.pdf"), workflow: "default" } as never))
      .rejects.toThrow(/Workspace is still loading/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("fails closed when org context is malformed", async () => {
    getActiveOrgIdMock.mockReturnValue("not-a-uuid");
    await expect(UploadFile({ file: new File(["x"], "a.pdf"), workflow: "default" } as never))
      .rejects.toThrow(/valid workspace context/i);
    expect(uploadMock).not.toHaveBeenCalled();
  });

  it("writes to org-scoped uploads path only", async () => {
    getActiveOrgIdMock.mockReturnValue("11111111-1111-4111-8111-111111111111");
    uploadMock.mockResolvedValue({ data: { path: "11111111-1111-4111-8111-111111111111/uploads/x.pdf" }, error: null });
    const file = new File(["hello"], "drawing.pdf", { type: "application/pdf" });

    const result = await UploadFile({ file, workflow: "drawings_upload" } as never);

    expect(fromMock).toHaveBeenCalledWith("app-files");
    expect(uploadMock).toHaveBeenCalledTimes(1);
    const uploadPath = uploadMock.mock.calls[0][0] as string;
    expect(uploadPath).toMatch(/^11111111-1111-4111-8111-111111111111\/uploads\//);
    expect(assertUploadAllowedMock).toHaveBeenCalledWith(file, "drawings_upload");
    expect(result.path).toContain("11111111-1111-4111-8111-111111111111/uploads/");
  });
});
