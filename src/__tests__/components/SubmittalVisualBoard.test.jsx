// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import SubmittalVisualBoard from "@/components/submittals/SubmittalVisualBoard";

function isoDaysFromNow(offset) {
  const date = new Date();
  date.setDate(date.getDate() + offset);
  return date.toISOString().slice(0, 10);
}

const setPackage = {
  key: "id:set-1",
  setId: "set-1",
  name: "Anchor Bolts - OFA",
  parent: {
    id: "set-1",
    set_name: "Anchor Bolts - OFA",
    drawing_set_number: "AB-1",
    discipline: "Structural",
  },
  sheets: [
    { id: "d1", drawing_set_id: "set-1", stage: "OFA", due_date: isoDaysFromNow(5) },
    { id: "d2", drawing_set_id: "set-1", stage: "OFA", due_date: isoDaysFromNow(6) },
  ],
  submittals: [
    {
      id: "sub-1",
      submittal_number: "05-1000",
      title: "Anchor bolts",
      status: "Submitted",
      ball_in_court: "EOR",
      submitted_date: isoDaysFromNow(-2),
      required_date: isoDaysFromNow(5),
      drawing_set_ids: ["set-1"],
    },
  ],
};

const unlinkedSubmittal = {
  id: "sub-2",
  submittal_number: "05-2000",
  title: "Embed plates",
  status: "Revise and Resubmit",
  ball_in_court: "Detailer",
  required_date: isoDaysFromNow(-1),
  drawing_set_ids: [],
};

describe("SubmittalVisualBoard", () => {
  it("groups linked drawing-set packages by derived submittal stage", () => {
    render(
      <SubmittalVisualBoard
        setPackages={[setPackage]}
        submittals={[...setPackage.submittals, unlinkedSubmittal]}
      />,
    );

    expect(screen.getByText("Out for approval")).toBeInTheDocument();
    expect(screen.getByText("Anchor Bolts - OFA")).toBeInTheDocument();
    expect(screen.getByText(/Sub 05-1000/)).toBeInTheDocument();
  });

  it("surfaces unlinked resubmittals as action cards", () => {
    render(
      <SubmittalVisualBoard
        setPackages={[setPackage]}
        submittals={[...setPackage.submittals, unlinkedSubmittal]}
      />,
    );

    expect(screen.getByText("05-2000 - Embed plates")).toBeInTheDocument();
    expect(screen.getAllByText("Unlinked").length).toBeGreaterThan(0);
    // R&R is a first-class board column (2026-07-25): the column header AND
    // the card badge both read "R&R", so assert at least one of each family.
    expect(screen.getAllByText("R&R").length).toBeGreaterThanOrEqual(2);
  });

  it("opens the matching register tab when a card is selected", () => {
    const onOpenTab = vi.fn();
    render(
      <SubmittalVisualBoard
        setPackages={[setPackage]}
        submittals={[...setPackage.submittals, unlinkedSubmittal]}
        onOpenTab={onOpenTab}
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: /anchor bolts - ofa/i }));
    expect(onOpenTab).toHaveBeenCalledWith("submittals");
  });
});
