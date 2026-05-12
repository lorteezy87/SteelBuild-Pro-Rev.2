import { describe, expect, it } from "vitest";
import { buildPriorityFeed, buildReleaseGateActionDrafts } from "../pccEngine";

describe("buildReleaseGateActionDrafts", () => {
  it("creates human-approved action drafts for missing release confirmations", () => {
    const scored = buildPriorityFeed([
      {
        id: "wp-1",
        entityId: "1",
        type: "WorkPackage",
        title: "WP-003 Panels",
        subtitle: "Fabrication",
        status: "In Progress",
        target_date: "2026-05-13",
        assigned_to: "NL",
        project_id: "project-1",
        project_name: "Skyport",
        confirmations: {
          vif_confirmed: false,
          field_dimensions_confirmed: true,
          shop_drawing_revision_checked: false,
          e_sheet_checked: true,
          load_list_complete: true,
          sequence_aligned: true,
          site_ready: true,
        },
      },
    ]);

    const drafts = buildReleaseGateActionDrafts(scored);

    expect(drafts).toHaveLength(2);
    expect(drafts.map((draft) => draft.metadata.confirmation_key)).toEqual([
      "vif_confirmed",
      "shop_drawing_revision_checked",
    ]);
    expect(drafts[0]).toMatchObject({
      project_id: "project-1",
      assigned_to: "NL",
      status: "Open",
      metadata: {
        created_from: "pcc_release_gate",
        source_type: "WorkPackage",
        source_id: "1",
      },
    });
  });

  it("does not duplicate drafts that already have matching action items", () => {
    const scored = buildPriorityFeed([
      {
        id: "del-7",
        entityId: "7",
        type: "Delivery",
        title: "Truck 4",
        target_date: "2026-05-14",
        project_id: "project-1",
        confirmations: {
          vif_confirmed: true,
          field_dimensions_confirmed: true,
          shop_drawing_revision_checked: true,
          e_sheet_checked: true,
          load_list_complete: false,
          sequence_aligned: true,
          site_ready: true,
        },
      },
    ]);

    const drafts = buildReleaseGateActionDrafts(scored, [
      { metadata: { pcc_release_gate_key: "Delivery:7:load_list_complete" } },
    ]);

    expect(drafts).toEqual([]);
  });
});
