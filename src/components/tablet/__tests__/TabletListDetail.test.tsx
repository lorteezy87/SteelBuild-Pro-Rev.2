// @vitest-environment jsdom
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import { TabletListDetail } from "../TabletListDetail";

describe("TabletListDetail", () => {
  it("renders split mode with side-by-side list and detail panes", () => {
    const { container } = render(
      <TabletListDetail
        list={<div>Project list</div>}
        detail={<div>Project detail</div>}
        stack={false}
        detailTitle="Project detail"
        onCloseDetail={() => {}}
      />
    );

    const root = container.firstElementChild;

    expect(root).toHaveClass("tablet-list-detail", "tablet-list-detail--landscape");
    expect(screen.getByText("Project list")).toBeInTheDocument();
    expect(screen.getByText("Project detail")).toBeInTheDocument();
    expect(screen.queryByRole("dialog", { name: "Project detail" })).not.toBeInTheDocument();
  });

  it("renders the list full width when split mode has no detail", () => {
    const { container } = render(
      <TabletListDetail list={<div>Project list</div>} detail={null} stack={false} />
    );

    const listPane = container.querySelector(".tablet-list-detail__list");

    expect(container.firstElementChild).toHaveClass(
      "tablet-list-detail",
      "tablet-list-detail--landscape"
    );
    expect(listPane).toHaveClass("tablet-list-detail__list--full");
    expect(screen.getByText("Project list")).toBeInTheDocument();
  });

  it("does not treat falsy detail content as missing in split mode", () => {
    const { container } = render(
      <TabletListDetail list={<div>Project list</div>} detail={0} stack={false} />
    );

    const listPane = container.querySelector(".tablet-list-detail__list");

    expect(listPane).not.toHaveClass("tablet-list-detail__list--full");
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("renders stacked detail inside a sheet while keeping the list visible", async () => {
    const user = userEvent.setup();
    const onCloseDetail = vi.fn();

    render(
      <TabletListDetail
        list={<div>Project list</div>}
        detail={<button type="button">Save changes</button>}
        stack
        detailTitle="Edit project"
        onCloseDetail={onCloseDetail}
      />
    );

    expect(screen.getByText("Project list")).toBeInTheDocument();
    expect(screen.getByRole("dialog", { name: "Edit project" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Save changes" })).toBeInTheDocument();

    await user.keyboard("{Escape}");

    expect(onCloseDetail).toHaveBeenCalledTimes(1);
  });
});
