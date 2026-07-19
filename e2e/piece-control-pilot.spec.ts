import { expect, test } from "@playwright/test";
import { signInAsTestUser } from "./fixtures/supabaseUser";

const PROJECT_ID = process.env.E2E_PIECE_PROJECT_ID || "";
const OTHER_TENANT_PROJECT_ID =
  process.env.E2E_PIECE_OTHER_TENANT_PROJECT_ID || "";
const WORK_PACKAGE_ID = process.env.E2E_PIECE_WORK_PACKAGE_ID || "";
const APPROVED_DRAWING_ID = process.env.E2E_PIECE_APPROVED_DRAWING_ID || "";
const EXCEPTION_WORK_PACKAGE_ID =
  process.env.E2E_PIECE_EXCEPTION_WORK_PACKAGE_ID || "";
const FULL_WORKFLOW = process.env.E2E_PIECE_FULL_WORKFLOW === "true";

function expectRpcSuccess(data: any, error: any, command: string) {
  expect(error, `${command} transport error: ${error?.message}`).toBeNull();
  expect(
    data?.ok,
    `${command} structured failure: ${data?.error_message ?? "unknown"}`,
  ).not.toBe(false);
  return data?.ok === true && data?.result !== undefined ? data.result : data;
}

test.describe("Piece Control pilot hardening", () => {
  test.skip(
    !PROJECT_ID,
    "Set E2E_PIECE_PROJECT_ID to run Piece Control security checks.",
  );

  test("canonical tables reject direct browser mutation", async () => {
    const { supabase } = await signInAsTestUser();
    const { data, error } = await supabase
      .from("pieces")
      .insert({
        project_id: PROJECT_ID,
        piece_mark: `E2E-DIRECT-${Date.now()}`,
        quantity: 1,
      })
      .select();

    expect(data).toBeNull();
    expect(error).not.toBeNull();
    expect(`${error?.code ?? ""} ${error?.message ?? ""}`).toMatch(
      /42501|permission|row-level security/i,
    );
  });

  test("cross-tenant reads and commands cannot reach another project", async () => {
    test.skip(
      !OTHER_TENANT_PROJECT_ID,
      "Set E2E_PIECE_OTHER_TENANT_PROJECT_ID to test cross-tenant isolation.",
    );
    const { supabase } = await signInAsTestUser();
    const read = await supabase
      .from("pieces")
      .select("id")
      .eq("project_id", OTHER_TENANT_PROJECT_ID)
      .limit(1);
    expect(read.error).toBeNull();
    expect(read.data ?? []).toHaveLength(0);

    const command = await supabase.rpc("split_piece_lot", {
      p_project_id: OTHER_TENANT_PROJECT_ID,
      p_piece_id: crypto.randomUUID(),
      p_allocations: [
        { lot_code: "A", quantity: 1 },
        { lot_code: "B", quantity: 1 },
      ],
    });
    expect(command.error).toBeNull();
    expect(command.data?.ok).toBe(false);
    expect(command.data?.error_message).toMatch(/authorized|project/i);
  });

  test("full canonical lifecycle updates reporting", async () => {
    test.skip(
      !FULL_WORKFLOW || !WORK_PACKAGE_ID || !APPROVED_DRAWING_ID,
      "Set E2E_PIECE_FULL_WORKFLOW=true plus E2E_PIECE_WORK_PACKAGE_ID and E2E_PIECE_APPROVED_DRAWING_ID. Dedicated pristine test project only.",
    );
    const { supabase } = await signInAsTestUser();
    const mark = `E2E-PC-${Date.now()}`;

    const stageResponse = await supabase.rpc("stage_piece_import_batch", {
      p_project_id: PROJECT_ID,
      p_source_type: "manual",
      p_source_name: `${mark}.json`,
      p_rows: [
        {
          piece_mark: mark,
          quantity: 2,
          weight_each_lbs: 100,
          profile: "W12X26",
          material_grade: "A992",
        },
      ],
    });

    const staged = expectRpcSuccess(
      stageResponse.data,
      stageResponse.error,
      "stage_piece_import_batch",
    );

    const batchId = staged.batch_id;
    expect(batchId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const approveResponse = await supabase.rpc("approve_piece_import_batch", {
      p_batch_id: batchId,
    });

    expectRpcSuccess(
      approveResponse.data,
      approveResponse.error,
      "approve_piece_import_batch",
    );

    const applyResponse = await supabase.rpc("apply_piece_import_batch", {
      p_batch_id: batchId,
    });

    expectRpcSuccess(
      applyResponse.data,
      applyResponse.error,
      "apply_piece_import_batch",
    );

    const rootResult = await supabase
      .from("pieces")
      .select("id")
      .eq("project_id", PROJECT_ID)
      .eq("normalized_piece_mark", mark)
      .eq("lot_code", "ALL")
      .single();
    expect(rootResult.error).toBeNull();
    const rootId = rootResult.data!.id;

    expectRpcSuccess(
      ...Object.values(
        await supabase.rpc("assign_pieces_to_work_package", {
          p_project_id: PROJECT_ID,
          p_piece_ids: [rootId],
          p_work_package_id: WORK_PACKAGE_ID,
        }),
      ).slice(0, 2),
      "assign_pieces_to_work_package",
    );
    expectRpcSuccess(
      ...Object.values(
        await supabase.rpc("link_piece_drawing", {
          p_project_id: PROJECT_ID,
          p_piece_id: rootId,
          p_drawing_id: APPROVED_DRAWING_ID,
        }),
      ).slice(0, 2),
      "link_piece_drawing",
    );

    const materialResponse = await supabase.rpc(
      "create_material_requirement",
      {
        p_project_id: PROJECT_ID,
        p_requirement_code: `E2E-MAT-${Date.now()}`,
        p_description: "E2E canonical lifecycle material",
        p_profile: "W12X26",
        p_material_grade: "A992",
        p_quantity_required: 2,
        p_unit: "each",
        p_source_system: "e2e",
        p_external_ref: mark,
      },
    );

    const material = expectRpcSuccess(
      materialResponse.data,
      materialResponse.error,
      "create_material_requirement",
    );

    const materialRequirementId = material.id;
    expect(materialRequirementId).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );

    const mapResponse = await supabase.rpc(
      "map_material_requirement_to_pieces",
      {
        p_project_id: PROJECT_ID,
        p_material_requirement_id: materialRequirementId,
        p_piece_ids: [rootId],
      },
    );

    expectRpcSuccess(
      mapResponse.data,
      mapResponse.error,
      "map_material_requirement_to_pieces",
    );

    const receiptResponse = await supabase.rpc(
      "set_material_requirement_receipt_state",
      {
        p_project_id: PROJECT_ID,
        p_material_requirement_id: materialRequirementId,
        p_receipt_state: "on_hand",
        p_received_quantity: 2,
        p_receipt_source: "e2e",
        p_receipt_reference: mark,
        p_provenance: { test: true },
      },
    );

    expectRpcSuccess(
      receiptResponse.data,
      receiptResponse.error,
      "set_material_requirement_receipt_state",
    );

    const splitResponse = await supabase.rpc("split_piece_lot", {
      p_project_id: PROJECT_ID,
      p_piece_id: rootId,
      p_allocations: [
        { lot_code: "A", quantity: 1 },
        { lot_code: "B", quantity: 1 },
      ],
    });

    const split = expectRpcSuccess(
      splitResponse.data,
      splitResponse.error,
      "split_piece_lot",
    );
    expect(split.children).toHaveLength(2);
    const childIds = split.children.map((child: any) => child.piece_id);

    const gate = await supabase.rpc("evaluate_release_gate", {
      p_work_package_id: WORK_PACKAGE_ID,
    });
    expect(gate.error).toBeNull();
    expect(gate.data?.passes).toBe(true);

    const release = await supabase.rpc("release_work_package_canonical", {
      p_work_package_id: WORK_PACKAGE_ID,
      p_exception_reason: null,
    });
    expectRpcSuccess(release.data, release.error, "release_work_package_canonical");

    for (const pieceId of childIds) {
      for (const station of [
        "cut",
        "fit",
        "weld",
        "qc",
        "paint",
        "ready_to_ship",
      ]) {
        const result = await supabase.rpc("advance_piece_station", {
          p_project_id: PROJECT_ID,
          p_piece_id: pieceId,
          p_station_key: station,
          p_override: false,
          p_override_reason: null,
        });
        expectRpcSuccess(result.data, result.error, `advance_piece_station:${station}`);
      }
    }

    for (const [command, reference] of [
      ["ship_piece_lots", { shipment_number: mark, carrier: "E2E Carrier" }],
      ["deliver_piece_lots", { proof_of_delivery: mark }],
      ["erect_piece_lots", { erection_location: "E2E Grid A1" }],
    ] as const) {
      const result = await supabase.rpc(command, {
        p_project_id: PROJECT_ID,
        p_piece_ids: childIds,
        p_reference_data: reference,
      });
      expectRpcSuccess(result.data, result.error, command);
    }

    const finalPieces = await supabase
      .from("pieces")
      .select("id,lifecycle_status")
      .in("id", childIds);
    expect(finalPieces.error).toBeNull();
    expect(
      finalPieces.data?.every((piece) => piece.lifecycle_status === "erected"),
    ).toBe(true);

    const events = await supabase
      .from("piece_events")
      .select("event_type")
      .in("piece_id", childIds)
      .in("event_type", ["shipped", "delivered", "erected"]);
    expect(events.error).toBeNull();
    expect(events.data).toHaveLength(childIds.length * 3);

    const readiness = await supabase.rpc("piece_control_pilot_readiness", {
      p_project_id: PROJECT_ID,
    });
    expect(readiness.error).toBeNull();
    expect(Number(readiness.data?.metrics?.canonical_piece_count)).toBeGreaterThanOrEqual(2);
  });

  test("exception release persists its schedule risk", async () => {
    test.skip(
      !FULL_WORKFLOW || !EXCEPTION_WORK_PACKAGE_ID,
      "Set E2E_PIECE_EXCEPTION_WORK_PACKAGE_ID to a pristine test work package with canonical scope and a non-scope blocker.",
    );
    const { supabase } = await signInAsTestUser();
    const release = await supabase.rpc("release_work_package_canonical", {
      p_work_package_id: EXCEPTION_WORK_PACKAGE_ID,
      p_exception_reason: "E2E controlled exception validation",
    });
    const data = expectRpcSuccess(
      release.data,
      release.error,
      "release_work_package_canonical:exception",
    );
    expect(data.is_exception).toBe(true);
    expect(data.risk_id).toBeTruthy();

    const risk = await supabase
      .from("risks")
      .select("id,impact,status")
      .eq("id", data.risk_id)
      .single();
    expect(risk.error).toBeNull();
    expect(risk.data?.id).toBe(data.risk_id);
  });
});

