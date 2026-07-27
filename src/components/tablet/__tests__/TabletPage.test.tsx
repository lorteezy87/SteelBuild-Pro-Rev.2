// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { TabletPage } from "../TabletPage";
import { TabletActionBar } from "../TabletActionBar";

describe("TabletPage", () => {
  it("renders title, actions, and children", () => {
    render(
      <TabletPage title="Projects" actions={<button type="button">New</button>}>
        <p>Body</p>
        <TabletActionBar>
          <button type="button">Save</button>
        </TabletActionBar>
      </TabletPage>
    );
    expect(screen.getByRole("heading", { name: "Projects" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "New" })).toBeInTheDocument();
    expect(screen.getByText("Body")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save" })).toBeInTheDocument();
  });
});
