// @vitest-environment jsdom
/**
 * ModelMappingSection — the Control Board's "3D model mapping" card.
 *
 * REGRESSION GUARD. The card used to infer "has a roster?" from the loaded
 * element array, but that array is gated to the 3D tab, so on a project with a
 * full roster (live rosters run to ~28k members) the Control Board announced
 * "No model members yet — export a member/assembly report (CSV) from Tekla or
 * SDS2 and import it". It also put an Import button next to that claim, which
 * fed the importer an empty dedupe basis and duplicated the roster on commit.
 *
 * The card now reads TWO facts: the cheap HEAD count (does a roster exist?) and
 * the loaded array (is it loaded here?). These tests pin each state to what it
 * is allowed to claim.
 */
import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModelMappingSection } from "../triageBoard";

const EMPTY_STATE = /No model members yet/i;

describe("ModelMappingSection", () => {
  it("does NOT claim 'no members yet' when a roster exists but is not loaded", () => {
    render(
      <ModelMappingSection
        summary={{ total: 0 } as any}
        elements={[]}
        rosterCount={27750}
        onImport={() => {}}
        onLoadRoster={() => {}}
      />,
    );
    expect(screen.queryByText(EMPTY_STATE)).toBeNull();
    expect(screen.getByText(/27,750 members imported/i)).toBeTruthy();
    expect(screen.getByText(/mapping not loaded/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /Load mapping/i })).toBeTruthy();
  });

  it("badges the roster count from the HEAD count, not the loaded array", () => {
    render(
      <ModelMappingSection summary={{ total: 0 } as any} elements={[]} rosterCount={16771} onImport={() => {}} />,
    );
    expect(screen.getByText("16,771 members")).toBeTruthy();
  });

  it("shows the import empty state only when the count proves the roster is empty", () => {
    render(
      <ModelMappingSection summary={{ total: 0 } as any} elements={[]} rosterCount={0} onImport={() => {}} />,
    );
    expect(screen.getByText(EMPTY_STATE)).toBeTruthy();
  });

  it("claims nothing while the count is still unknown", () => {
    render(
      <ModelMappingSection summary={{ total: 0 } as any} elements={[]} rosterCount={null} onImport={() => {}} />,
    );
    expect(screen.queryByText(EMPTY_STATE)).toBeNull();
    expect(screen.getByText(/Checking for model members/i)).toBeTruthy();
  });

  it("renders the real mapping once the roster is loaded", () => {
    render(
      <ModelMappingSection
        summary={{ total: 3, mappedPct: 67, counts: {}, idsByStatus: {} } as any}
        elements={[{ id: "a" }, { id: "b" }, { id: "c" }]}
        rosterCount={3}
        onImport={() => {}}
      />,
    );
    expect(screen.queryByText(EMPTY_STATE)).toBeNull();
    expect(screen.queryByText(/mapping not loaded/i)).toBeNull();
    expect(screen.getByText(/Linked to detailing packages/i)).toBeTruthy();
    expect(screen.getByText("67%")).toBeTruthy();
  });

  it("asks for the roster on demand instead of loading it with the page", () => {
    const onLoadRoster = vi.fn();
    render(
      <ModelMappingSection
        summary={{ total: 0 } as any}
        elements={[]}
        rosterCount={9000}
        onImport={() => {}}
        onLoadRoster={onLoadRoster}
      />,
    );
    screen.getByRole("button", { name: /Load mapping/i }).click();
    expect(onLoadRoster).toHaveBeenCalledTimes(1);
  });

  it("disables the load button while the roster is being paged in", () => {
    render(
      <ModelMappingSection
        summary={{ total: 0 } as any}
        elements={[]}
        rosterCount={9000}
        rosterLoading
        onImport={() => {}}
        onLoadRoster={() => {}}
      />,
    );
    const btn = screen.getByRole("button", { name: /Loading members/i }) as HTMLButtonElement;
    expect(btn.disabled).toBe(true);
  });

  it("offers the import affordance in every state", () => {
    for (const rosterCount of [null, 0, 1200]) {
      const { unmount } = render(
        <ModelMappingSection summary={{ total: 0 } as any} elements={[]} rosterCount={rosterCount as any} onImport={() => {}} />,
      );
      expect(screen.getByRole("button", { name: /Import member CSV/i })).toBeTruthy();
      unmount();
    }
  });
});
