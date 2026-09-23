// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SetOnlyInfoRow } from "../DrawingsTableRows";
import type { DrawingGroup } from "../drawingsTableDerive";

// A drawing set's file_url is typed in by a member and rendered as the
// "Open Drive folder" link for everyone on the project. A javascript: URL
// there ran script in whoever clicked it (audit SEC-2).

function renderSetRow(fileUrl: string) {
  const group = { parent: { file_url: fileUrl, revision_history: "", metadata: null } } as unknown as DrawingGroup;
  render(
    <table>
      <tbody>
        <SetOnlyInfoRow group={group} />
      </tbody>
    </table>,
  );
}

describe("SetOnlyInfoRow Drive link", () => {
  it("links an https Drive folder", () => {
    renderSetRow("https://drive.google.com/drive/folders/abc");
    expect(screen.getByRole("link", { name: /open drive folder/i }).getAttribute("href"))
      .toBe("https://drive.google.com/drive/folders/abc");
  });

  it("renders no link for a javascript: URL", () => {
    renderSetRow("javascript:alert(document.cookie)");
    expect(screen.queryByRole("link", { name: /open drive folder/i })).toBeNull();
  });
});
