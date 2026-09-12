import { beforeEach, describe, expect, it, vi } from "vitest";

// vi.mock factories are hoisted ABOVE plain `const` declarations, so a factory
// that closes over a bare const throws "Cannot access 'fromMock' before
// initialization" the moment the mocked module is imported. vi.hoisted lifts
// these with the factories, which is the supported way to share mock fns.
const {
  uploadMock,
  fromMock,
  getActiveOrgIdMock,
  assertUploadAllowedMock,
  sanitizeFilenameMock,
  remapQuotaErrorMock,
  quotaExceededUserMessageMock,
} = vi.hoisted(() => {
  const upload = vi.fn();
  return {
    uploadMock: upload,
    fromMock: vi.fn(() => ({ upload })),
    getActiveOrgIdMock: vi.fn(),
    assertUploadAllowedMock: vi.fn(),
    sanitizeFilenameMock: vi.fn((name: string) => name),
    remapQuotaErrorMock: vi.fn(),
    quotaExceededUserMessageMock: vi.fn(),
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
  quotaExceededUserMessage: quotaExceededUserMessageMock,
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
    // The real one always throws (its return type is `never`); the mock must
    // too, or a failed upload would fall through to `data.path` on null.
    remapQuotaErrorMock.mockImplementation((err: unknown) => { throw err; });
    quotaExceededUserMessageMock.mockReset();
    quotaExceededUserMessageMock.mockReturnValue(null);
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

  // ── Dropped-connection retry ───────────────────────────────────────────
  // A 385 KB PDF upload was seen failing with net::ERR_HTTP2_PROTOCOL_ERROR:
  // preflight logged 200, the POST never logged at all, supabase-js reported
  // `StorageUnknownError: Failed to fetch`. It is the first step of the
  // revision-upload wizard, so one blip discarded OCR, LLM extraction and
  // sheet matching too. These use the REAL backoff, so they are a little slow
  // on purpose — the delays are part of what is being pinned.

  const ORG = "11111111-1111-4111-8111-111111111111";
  const netFail = { name: "StorageUnknownError", message: "Failed to fetch" };

  it("retries a dropped connection and returns the eventual success", async () => {
    getActiveOrgIdMock.mockReturnValue(ORG);
    uploadMock
      .mockResolvedValueOnce({ data: null, error: netFail })
      .mockResolvedValueOnce({ data: { path: `${ORG}/uploads/ok.pdf` }, error: null });

    const file = new File(["hello"], "rev.pdf", { type: "application/pdf" });
    const result = await UploadFile({ file, workflow: "drawings" } as never);

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(result.path).toBe(`${ORG}/uploads/ok.pdf`);
  });

  it("reuses the SAME path across retries so a partial success cannot orphan a file", async () => {
    getActiveOrgIdMock.mockReturnValue(ORG);
    uploadMock
      .mockResolvedValueOnce({ data: null, error: netFail })
      .mockResolvedValueOnce({ data: { path: `${ORG}/uploads/ok.pdf` }, error: null });

    await UploadFile({ file: new File(["x"], "a.pdf"), workflow: "drawings" } as never);

    expect(uploadMock.mock.calls[0][0]).toBe(uploadMock.mock.calls[1][0]);
  });

  it("treats a Duplicate on a RETRY as success — the first attempt did land", async () => {
    // The path carries a timestamp and random suffix, so nothing but our own
    // earlier attempt can occupy it. A collision here means the request DID
    // reach storage and only the response was lost.
    getActiveOrgIdMock.mockReturnValue(ORG);
    uploadMock
      .mockResolvedValueOnce({ data: null, error: netFail })
      .mockResolvedValueOnce({ data: null, error: { statusCode: "409", error: "Duplicate", message: "The resource already exists" } });

    const result = await UploadFile({ file: new File(["x"], "a.pdf"), workflow: "drawings" } as never);

    expect(uploadMock).toHaveBeenCalledTimes(2);
    expect(result.path).toBe(uploadMock.mock.calls[0][0]);
    // Attempt 1's network error legitimately passes through remapQuotaError
    // (which rethrows it, triggering the retry). What must NOT happen is the
    // Duplicate being raised at the user — it is our own earlier write.
    const raised = remapQuotaErrorMock.mock.calls.map((c) => c[0]);
    expect(raised).toHaveLength(1);
    expect(raised[0]).toBe(netFail);
  });

  it("does NOT swallow a Duplicate on the FIRST attempt", async () => {
    // No retry happened, so a collision is a genuine surprise, not our own
    // lost response — it must surface rather than be reported as success.
    getActiveOrgIdMock.mockReturnValue(ORG);
    uploadMock.mockResolvedValueOnce({
      data: null,
      error: { statusCode: "409", error: "Duplicate", message: "The resource already exists" },
    });

    await expect(
      UploadFile({ file: new File(["x"], "a.pdf"), workflow: "drawings" } as never),
    ).rejects.toBeTruthy();
    expect(uploadMock).toHaveBeenCalledTimes(1);
    expect(remapQuotaErrorMock).toHaveBeenCalled();
  });

  it("does not retry a refusal the server already decided", async () => {
    getActiveOrgIdMock.mockReturnValue(ORG);
    uploadMock.mockResolvedValue({ data: null, error: { statusCode: "413", message: "Payload too large" } });

    await expect(
      UploadFile({ file: new File(["x"], "a.pdf"), workflow: "drawings" } as never),
    ).rejects.toBeTruthy();
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });

  it("surfaces a quota error immediately instead of retrying it", async () => {
    // "Storage is full" must reach the user on the first attempt, not after
    // two backoffs — it will never succeed by repeating.
    getActiveOrgIdMock.mockReturnValue(ORG);
    quotaExceededUserMessageMock.mockReturnValue("File storage is full.");
    remapQuotaErrorMock.mockImplementation(() => { throw new Error("File storage is full."); });
    uploadMock.mockResolvedValue({ data: null, error: { name: "StorageUnknownError", message: "quota has been exceeded" } });

    await expect(
      UploadFile({ file: new File(["x"], "a.pdf"), workflow: "drawings" } as never),
    ).rejects.toThrow(/storage is full/i);
    expect(uploadMock).toHaveBeenCalledTimes(1);
  });
});
