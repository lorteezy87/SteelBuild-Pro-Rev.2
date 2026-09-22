// @vitest-environment jsdom
import React from "react";
import { render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import ScopeItemList from "../ScopeItemList";

const STORAGE_PATH = "b036b47f-7b0a-4d75-9582-b4be00724742/uploads/1790057504562-lcwkdsw3zdd.pdf";
const SIGNED_URL = "https://kjrwqagyeswwoxpjkcko.supabase.co/storage/v1/object/sign/app-files/revision.pdf?token=test";

vi.mock("@/hooks/useResolvedFileUrl", () => ({
  useResolvedFileUrl: vi.fn(() => ({ url: SIGNED_URL, loading: false, error: null })),
}));

describe("ScopeItemList attachments", () => {
  it("opens a stored PDF with its resolved signed URL instead of the raw storage path", () => {
    render(
      <ScopeItemList
        items={[
          {
            id: "scope-item-1",
            description: "Verify column grid change",
            item_type: "Scope",
            category: "Structural",
            file_url: STORAGE_PATH,
            file_name: "revision.pdf",
          },
        ]}
      />,
    );

    const attachment = screen.getByRole("link", { name: "PDF" });
    expect(attachment).toHaveAttribute("href", SIGNED_URL);
    expect(attachment).not.toHaveAttribute("href", STORAGE_PATH);
  });
});
