// @vitest-environment jsdom
import { describe, it, expect } from "vitest";
import { parseFabSuiteXml, stageModelElements, teklaRowToModelElement } from "../importFabSuiteXml";

// Fixture mirrors the real TeklaPowerFab schema (default xmlns, AssemblyData →
// Assembly → AssemblyPart, AssemblyDrawings, a duplicate drawing without a
// revision, a duplicate piece mark, and a mark-less assembly).
const XML = `<?xml version="1.0" encoding="utf-8"?>
<FabSuiteDataExchange xmlns="http://www.fabsuite.com/XML_Schemas/TeklaPowerFabDataFile0109.xsd">
  <FileSourceData>
    <SourceApplication>Tekla Structures</SourceApplication>
    <SourceApplicationVersion>2024 SP6</SourceApplicationVersion>
    <FileCreationDate>2026-02-13</FileCreationDate>
  </FileSourceData>
  <ProjectData><ContractData>
    <ProjectId><ProjectNumber>25421</ProjectNumber><ProjectName>ACADEMY MS MESA</ProjectName></ProjectId>
    <DrawingData>
      <Drawing>
        <DrawingNumber>504E101</DrawingNumber><DrawingTitle>SECTION</DrawingTitle>
        <Category>General Arrangement</Category>
        <DrawingRevision><RevisionNumber>1</RevisionNumber><RevisionDescription>FOR FABRICATION</RevisionDescription><DateRevised>2026-02-13</DateRevised></DrawingRevision>
        <ModelRef>guid-ga-1</ModelRef>
      </Drawing>
      <AssemblyDrawings>
        <AssemblyDrawing>
          <DrawingNumber>502C2002</DrawingNumber><DrawingTitle>COLUMN</DrawingTitle><Category>Assembly</Category>
          <DrawingRevision><RevisionNumber>1</RevisionNumber><RevisionDescription>FOR FABRICATION</RevisionDescription><DateRevised>2026-02-13</DateRevised></DrawingRevision>
          <ModelRef>guid-asm-1</ModelRef>
        </AssemblyDrawing>
        <AssemblyDrawing>
          <DrawingNumber>502C2002</DrawingNumber><DrawingTitle>COLUMN</DrawingTitle><Category>Assembly</Category>
          <ModelRef>guid-asm-1b</ModelRef>
        </AssemblyDrawing>
      </AssemblyDrawings>
    </DrawingData>
    <AssemblyData>
      <Assembly>
        <AssemblyId>asmid-1</AssemblyId>
        <ModelRef>model-1</ModelRef>
        <AssemblyMark>502C2002</AssemblyMark>
        <AssemblyQuantity>2</AssemblyQuantity>
        <DrawingNumber>502C2002</DrawingNumber>
        <AssemblySequence><SequenceNumber>3</SequenceNumber></AssemblySequence>
        <AssemblyPart>
          <PartMark>PL2009</PartMark><MainMember>false</MainMember><PartQuantity>2</PartQuantity>
          <Shape>PL</Shape><Dimensions Metric="0">PL3/8X7</Dimensions><Grade>A36</Grade>
          <WeightEach UOM="kg">5</WeightEach>
        </AssemblyPart>
        <AssemblyPart>
          <PartMark>502C2002</PartMark><MainMember>true</MainMember><PartQuantity>1</PartQuantity>
          <Shape>W</Shape><Dimensions Metric="0">W12X26</Dimensions><Grade>A992</Grade>
          <WeightEach UOM="kg">100</WeightEach>
        </AssemblyPart>
        <OtherField FieldName="Phase Name">Phase 1</OtherField>
      </Assembly>
      <Assembly>
        <ModelRef>model-2</ModelRef>
        <AssemblyMark>BP2001</AssemblyMark>
        <AssemblyPart>
          <PartMark>BP2001</PartMark><MainMember>true</MainMember><PartQuantity>1</PartQuantity>
          <Shape>PL</Shape><Dimensions>PL1X12X12</Dimensions><Grade>A36</Grade>
          <WeightEach UOM="kg">20</WeightEach>
        </AssemblyPart>
      </Assembly>
      <Assembly>
        <ModelRef>model-1b</ModelRef>
        <AssemblyMark>502C2002</AssemblyMark>
        <AssemblyPart>
          <PartMark>502C2002</PartMark><MainMember>true</MainMember><PartQuantity>1</PartQuantity>
          <Shape>W</Shape><Dimensions>W12X26</Dimensions><Grade>A992</Grade><WeightEach UOM="kg">100</WeightEach>
        </AssemblyPart>
      </Assembly>
      <Assembly><ModelRef>model-1</ModelRef><AssemblyMark>502C2002</AssemblyMark></Assembly>
      <Assembly><ModelRef>model-x</ModelRef></Assembly>
    </AssemblyData>
  </ContractData></ProjectData>
</FabSuiteDataExchange>`;

const result = parseFabSuiteXml(XML);

describe("parseFabSuiteXml", () => {
  it("reads project + source metadata and the package stage", () => {
    expect(result.ok).toBe(true);
    expect(result.project).toEqual({ number: "25421", name: "ACADEMY MS MESA" });
    expect(result.source.app).toBe("Tekla Structures");
    expect(result.source.date).toBe("2026-02-13");
    expect(result.source.stage).toBe("IFC"); // "FOR FABRICATION"
  });

  it("de-dupes drawings by number, preferring the record with a revision", () => {
    expect(result.drawings).toHaveLength(2);
    const col = result.drawings.find((d) => d.drawing_number === "502C2002");
    expect(col.revision_number).toBe("1"); // not the revision-less duplicate
    expect(col.category).toBe("Assembly");
    const ga = result.drawings.find((d) => d.drawing_number === "504E101");
    expect(ga.category).toBe("General Arrangement");
  });

  it("maps an assembly to a piece — main-member profile, summed weight, sequence, phase", () => {
    const piece = result.pieces.find((p) => p.piece_mark === "502C2002");
    expect(piece).toMatchObject({
      profile: "W12X26",        // the MainMember part's Dimensions
      material_grade: "A992",
      quantity: 2,
      weight_kg: 110,           // 5*2 + 100*1
      sequence_number: "3",
      erection_area: "Phase 1",
      drawing_no: "502C2002",
      element_guid: "model-1",
    });
  });

  it("falls back to the only part when no main member is flagged", () => {
    const bp = result.pieces.find((p) => p.piece_mark === "BP2001");
    expect(bp.profile).toBe("PL1X12X12");
    expect(bp.weight_kg).toBe(20);
  });

  it("keeps each instance (same mark, different GUID) but skips dup GUIDs + mark-less", () => {
    expect(result.pieces).toHaveLength(3); // two 502C2002 instances + BP2001
    expect(result.pieces.filter((p) => p.piece_mark === "502C2002")).toHaveLength(2);
    expect(result.stats.skippedPieces).toBe(2); // dup GUID + mark-less
  });

  it("rejects a non-FabSuite document", () => {
    const r = parseFabSuiteXml("<?xml version='1.0'?><Something/>");
    expect(r.ok).toBe(false);
    expect(r.error).toMatch(/FabSuite|Tekla EPM/i);
  });

  it("rejects unparseable XML", () => {
    const r = parseFabSuiteXml("<a><b></a>");
    expect(r.ok).toBe(false);
  });
});

describe("stageModelElements", () => {
  it("matches existing model_elements by GUID (update), new GUIDs are creates", () => {
    const { rows, stats } = stageModelElements(result.pieces, [
      { id: "m1", element_guid: "model-1", piece_mark: "502C2002", is_deleted: false },
    ]);
    expect(stats).toEqual({ create: 2, update: 1 }); // model-1 updates; model-1b + model-2 create
    const updated = rows.find((r) => r.element_guid === "model-1");
    expect(updated).toMatchObject({ action: "update", existing_id: "m1" });
    const fresh = rows.find((r) => r.element_guid === "model-1b");
    expect(fresh.action).toBe("create"); // same mark, different instance → NOT collapsed
  });

  it("ignores soft-deleted and guid-less existing rows", () => {
    const { stats } = stageModelElements(result.pieces, [
      { id: "m1", element_guid: "model-1", is_deleted: true },
    ]);
    expect(stats.update).toBe(0);
  });
});

describe("teklaRowToModelElement", () => {
  const VALID_SOURCES = ["csv", "ifc", "manual"];

  it("produces a constraint-valid source value (csv)", () => {
    const staged = { action: "create", existing_id: null, piece_mark: "502C2002", element_guid: "model-1", profile: "W12X26" };
    const row = teklaRowToModelElement(staged, "proj-1");
    expect(VALID_SOURCES).toContain(row.source);
    expect(row.source).toBe("csv");
  });

  it("records the Tekla origin in metadata.import_format", () => {
    const staged = { action: "create", existing_id: null, piece_mark: "502C2002", element_guid: "model-1" };
    const row = teklaRowToModelElement(staged, "proj-1");
    expect(row.metadata).toMatchObject({ import_format: "tekla_epm_xml" });
  });

  it("preserves existing metadata fields without clobbering them", () => {
    const staged = { action: "create", existing_id: null, piece_mark: "X1", element_guid: "g-x", metadata: { erp_ref: "ABC123" } };
    const row = teklaRowToModelElement(staged, "proj-1");
    expect(row.metadata).toMatchObject({ erp_ref: "ABC123", import_format: "tekla_epm_xml" });
  });

  it("strips action and existing_id from the output row", () => {
    const staged = { action: "update", existing_id: "some-id", piece_mark: "X2", element_guid: "g-2" };
    const row = teklaRowToModelElement(staged, "proj-1");
    expect(row).not.toHaveProperty("action");
    expect(row).not.toHaveProperty("existing_id");
  });

  it("sets project_id from the argument", () => {
    const staged = { action: "create", existing_id: null, piece_mark: "X3", element_guid: "g-3" };
    const row = teklaRowToModelElement(staged, "my-project-id");
    expect(row.project_id).toBe("my-project-id");
  });
});
