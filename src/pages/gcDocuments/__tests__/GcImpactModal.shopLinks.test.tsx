// @vitest-environment jsdom
import React from "react";
import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import GcImpactModal from "../GcImpactModal";
import type { GcIssuance } from "../gcDocumentsPageDerive";
import type { RowWithAliases } from "@/api/supabaseClient";

vi.mock("../dsPrimitives", () => ({
  Modal: ({ open, children, footer }: { open: boolean; children: React.ReactNode; footer: React.ReactNode }) =>
    open ? <div role="dialog">{children}{footer}</div> : null,
  Button: ({ children, ...props }: React.ButtonHTMLAttributes<HTMLButtonElement>) =>
    <button type="button" {...props}>{children}</button>,
}));

const issuance = {
  id: "gc-1", label: "ASI 012", sheets: [{ drawing_number: "S-301" }],
  set: { id: "gc-1", set_name: "ASI 012 — S-301 change", steel_impact: "unknown", impact_notes: null },
} as unknown as GcIssuance;

function shopSet(id: string, name: string): RowWithAliases<"drawing_sets"> {
  return { id, set_name: name, register: "structural", project_id: "project-1" } as unknown as RowWithAliases<"drawing_sets">;
}

describe("reviewed GC impact mapping", () => {
  it("leaves the impact-notes workflow usable while the link backend is unavailable", () => {
    const onSave = vi.fn();
    const onSaveLinks = vi.fn();
    render(<GcImpactModal open issuance={issuance} linksStatus="unavailable"
      shopSetsStatus="available" shopSets={[shopSet("shop-1", "S-301 shop set")]}
      onSave={onSave} onSaveLinks={onSaveLinks} onClose={vi.fn()} />);

    expect(screen.getByRole("status").textContent).toMatch(/links are unavailable/i);
    expect(screen.queryByRole("button", { name: "SAVE SET LINKS" })).toBeNull();
    fireEvent.click(screen.getByRole("radio", { name: /Impacts steel/i }));
    fireEvent.change(screen.getByLabelText("What it affects"), { target: { value: "Changed canopy connection" } });
    fireEvent.click(screen.getByRole("button", { name: "RECORD" }));
    expect(onSave).toHaveBeenCalledWith("impacted", "Changed canopy connection");
    expect(onSaveLinks).not.toHaveBeenCalled();
  });

  it("never auto-links a matching GC sheet number and can find the 1,001st shop set", () => {
    const onSaveLinks = vi.fn();
    const shopSets = Array.from({ length: 1001 }, (_, index) =>
      shopSet(`shop-${index}`, index === 1000 ? "S-301 shop set" : `Shop Set ${index}`));
    render(<GcImpactModal open issuance={issuance} linksStatus="available"
      shopSetsStatus="available" shopSets={shopSets} linkedShopSetIds={[]}
      onSave={vi.fn()} onSaveLinks={onSaveLinks} onClose={vi.fn()} />);

    expect(screen.getByText("No shop sets explicitly linked.")).toBeInTheDocument();
    expect(screen.getByText(/Showing 80 of 1001/)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "SAVE SET LINKS" })).toBeDisabled();
    fireEvent.change(screen.getByLabelText("Find shop drawing set"), { target: { value: "S-301 shop" } });
    const checkbox = screen.getByRole("checkbox", { name: /S-301 shop set/i });
    expect(checkbox).not.toBeChecked();
    fireEvent.click(checkbox);
    fireEvent.click(screen.getByRole("button", { name: "SAVE SET LINKS" }));
    expect(onSaveLinks).toHaveBeenCalledWith(["shop-1000"]);
  });

  it("blocks a no-impact disposition while exact affected links remain", () => {
    const onSave = vi.fn();
    render(<GcImpactModal open issuance={issuance} linksStatus="available"
      shopSetsStatus="available" shopSets={[shopSet("shop-1", "Canopy shop set")]}
      linkedShopSetIds={["shop-1"]} onSave={onSave} onSaveLinks={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: /No steel impact/i }));
    fireEvent.click(screen.getByRole("button", { name: "RECORD" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Remove the affected shop-set links/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("still blocks no impact when exact links are known but the shop-set roster fails", () => {
    const onSave = vi.fn();
    render(<GcImpactModal open issuance={issuance} linksStatus="available"
      shopSetsStatus="unavailable" linkedShopSetIds={["shop-1"]}
      onSave={onSave} onSaveLinks={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: /No steel impact/i }));
    fireEvent.click(screen.getByRole("button", { name: "RECORD" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Remove the affected shop-set links/i);
    expect(onSave).not.toHaveBeenCalled();
  });

  it("withholds no impact while exact link evidence is unavailable", () => {
    const onSave = vi.fn();
    render(<GcImpactModal open issuance={issuance} linksStatus="unavailable"
      shopSetsStatus="available" shopSets={[shopSet("shop-1", "Canopy shop set")]}
      onSave={onSave} onSaveLinks={vi.fn()} onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole("radio", { name: /No steel impact/i }));
    fireEvent.click(screen.getByRole("button", { name: "RECORD" }));
    expect(screen.getByRole("alert").textContent).toMatch(/Verify the affected shop-set links/i);
    expect(onSave).not.toHaveBeenCalled();
  });
});
