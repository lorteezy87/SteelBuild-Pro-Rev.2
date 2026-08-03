// @vitest-environment jsdom

import { createContext } from "react";
import { describe, expect, it, vi } from "vitest";

vi.mock("@/components/shared/ProjectContext", () => ({ ProjectContext: createContext({ projects: [] }) }));
vi.mock("@/components/shared/OrgContext", () => ({ useOrg: () => ({ currentOrg: null }) }));

import { shouldShowArchiveEmpty } from "../ArchivePage";

describe("ArchivePage states", () => {
  it("shows the empty state only for a successful, non-loading zero-row result", () => {
    expect(shouldShowArchiveEmpty({ isLoading: true, isError: false, isSuccess: false, count: 0 })).toBe(false);
    expect(shouldShowArchiveEmpty({ isLoading: false, isError: true, isSuccess: false, count: 0 })).toBe(false);
    expect(shouldShowArchiveEmpty({ isLoading: false, isError: false, isSuccess: true, count: 0 })).toBe(true);
  });
});
