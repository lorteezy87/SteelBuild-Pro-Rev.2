import { describe, expect, it } from "vitest";
import * as XLSX from "xlsx";
import {
  buildPsrProjectPatch,
  getPsrReportDate,
  matchPsrToProject,
  parsePsrRows,
  readPsrSpreadsheetFile,
} from "../importPsrSpreadsheet";

const now = new Date("2026-05-16T12:00:00Z");

describe("importPsrSpreadsheet", () => {
  it("parses the SOL PSR layout into staged schedule, docs, and RFI data", () => {
    const parsed = parsePsrRows([
      ["JOB STATUS REPORT"],
      ["DATE RECEIVED", "Friday, November 28, 2025", "", "", "S & H #", "", "90001"],
      ["CUSTOMER", "NOVA"],
      ["JOB NAME", "Rivergate Logistics Center"],
      ["PROJECT MANAGER/TEAM", "Taylor Brooks"],
      ["DETAILER", "SOL"],
      ["LAST UPDATED", "11-May-26"],
      ["SCHEDULE"],
      ["Submittal Package", "IFA", "BFA", "IFA-B", "IFA-C", "IFC", "REV", "DELV"],
      ["BUILDING-1"],
      ["Anchor bolt", "24-Feb-26", "4-Mar-26", "", "", "2-Apr-26"],
      ["Main steel", "9-Mar-26", "6-Apr-26"],
      ["DESIGN REVISION", "RECEIVED", "", "DETAILER COR #", "", "SENT DATE", "APPROVED DATE"],
      ["COORDINATION DOCS.", "Requested Date", "RECEIVED", "COMMENTS"],
      ["1. Structure Drawing Bldg.1 & 2 (Construction Set)", "31-Dec-25", "10-Feb-26"],
      ["2. Architecture Drawing Bldg.1 & 2 (Construction Set)", "31-Dec-25", ""],
      ["RFI #/ DESCRIPTION", "Client RFI#", "", "SENT", "RECEIVED", "STATUS", "", "", "Remark"],
      ["90001_RFI#14 (Regarding temporary shoring scope.)", "STEELCO RFI#29", "", "6-Jan-26", "21-Mar-26", "", "", "", "NOTE#4 Not Answered."],
      ["90001_RFI#47 (Regarding beam seat tolerance query.)", "STEELCO RFI#48", "", "10-Apr-26", "28-Apr-26", "Partially answered"],
      ["90001_RFI#50 (Regarding splice plate connection.)", "", "", "28-Apr-26", "1-May-26", "Closed per synthetic IFC revision"],
      ["QUERY #/ DESCRIPTION", "", "", "SENT", "RECEIVED", "COMMENTS"],
      ["90001_Query#1 (Regarding stair quantity rework)", "", "", "11-Dec-25", "6-Feb-26", "Closed"],
      ["COMMENTS"],
      ["Joinery BFA Drawings(04/06/2026)"],
    ], { fileName: "090101=Rivergate Logistics Center (90001).xls", sheetName: "Project 90001 Schedule", now });

    expect(parsed.job_number).toBe("90001");
    expect(parsed.job_name).toBe("Rivergate Logistics Center");
    expect(parsed.schedule).toHaveLength(2);
    expect(parsed.schedule[0]).toMatchObject({ area: "BUILDING-1", package_name: "Anchor bolt" });
    expect(parsed.counts.pending_coordination_docs).toBe(1);
    expect(parsed.counts.open_rfis).toBe(2);
    expect(parsed.comments).toEqual(["Joinery BFA Drawings(04/06/2026)"]);
    expect(parsed.proposed_health_status).toBe("At Risk");
  });

  it("matches parsed PSRs to projects by S&H number before fuzzy name", () => {
    const parsed = { job_number: "25645", job_name: "ALA Buckeye" };
    const match = matchPsrToProject(parsed, [
      { id: "p1", project_number: "90001", name: "Rivergate Logistics Center" },
      { id: "p2", project_number: "25645", name: "ALA Buckeye" },
    ]);

    expect(match.project.id).toBe("p2");
    expect(match.confidence).toBe("high");
  });

  it("builds a review-approved metadata patch and keeps health opt-in", () => {
    const project = {
      id: "p1",
      name: "ALA Buckeye",
      project_number: "25645",
      health_status: "Watch",
      metadata: { existing: true, psr: { import_history: [{ file_name: "old.xls" }] } },
    };
    const parsed = parsePsrRows([
      ["JOB STATUS REPORT"],
      ["DATE RECEIVED", "Monday, March 09, 2026", "", "", "S & H #", "", "25645"],
      ["JOB NAME", "ALA Buckeye"],
      ["LAST UPDATED", "11-May-26"],
      ["SCHEDULE"],
      ["Submittal Package", "IFA", "BFA"],
      ["Main steel", "6-Apr-26", "8-May-26"],
      ["COORDINATION DOCS.", "Requested Date", "RECEIVED", "COMMENTS"],
      ["1. Structure Drawing", "17-Mar-26", ""],
      ["RFI #/ DESCRIPTION", "Client RFI#", "", "SENT", "RECEIVED", "STATUS"],
      ["25645_RFI#01 (Regarding CMU wall layout.)", "", "", "18-Mar-26", ""],
      ["COMMENTS"],
    ], { fileName: "051126=ALA Buckeye (25645).xls", sheetName: "Sol Job #26095", now });

    const metadataOnly = buildPsrProjectPatch(project, parsed, {
      importedAt: "2026-05-16T00:00:00.000Z",
    });
    expect(metadataOnly.health_status).toBeUndefined();
    expect(metadataOnly.metadata.existing).toBe(true);
    expect(metadataOnly.metadata.psr.latest.file_name).toBe("051126=ALA Buckeye (25645).xls");
    expect(getPsrReportDate({ metadata: metadataOnly.metadata })).toBe("2026-05-16T00:00:00.000Z");

    const withHealth = buildPsrProjectPatch(project, parsed, {
      applyHealthStatus: true,
      importedAt: "2026-05-16T00:00:00.000Z",
    });
    expect(withHealth.health_status).toBe("At Risk");
  });

  it("selects the current PSR sheet over legacy workbook tabs with date-only filenames", async () => {
    const workbook = XLSX.utils.book_new();
    const legacyRows = [
      ["JOB STATUS REPORT"],
      ["JOB NAME", "Alamo College DSO BP #2.5"],
      ["LAST UPDATED", "04-16-18"],
      ["COORDINATION DOCS.", "Requested Date", "RECEIVED", "COMMENTS"],
      ["1. Structure Drawing", "10-Apr-18", "12-Apr-18"],
    ];
    const currentRows = [
      ["JOB STATUS REPORT"],
      ["DATE RECEIVED", "Friday, November 28, 2025", "", "", "S & H #", "", "90001"],
      ["JOB NAME", "Rivergate Logistics Center"],
      ["LAST UPDATED", "11-May-26"],
      ["SCHEDULE"],
      ["Submittal Package", "IFA", "BFA"],
      ["Main steel", "9-Mar-26", "6-Apr-26"],
      ["RFI #/ DESCRIPTION", "Client RFI#", "", "SENT", "RECEIVED", "STATUS"],
      ["90001_RFI#47 (Regarding beam seat tolerance query.)", "STEELCO RFI#48", "", "10-Apr-26", "", "Open"],
    ];

    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(legacyRows), "Project 90001");
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet(currentRows), "Project 90001 Schedule");

    const bytes = XLSX.write(workbook, { type: "array", bookType: "xls" });
    const file = new File([bytes], "rivergate-psr-090101.xls", { type: "application/vnd.ms-excel" });

    const parsed = await readPsrSpreadsheetFile(file);

    expect(parsed.job_number).toBe("90001");
    expect(parsed.job_name).toBe("Rivergate Logistics Center");
    expect(parsed.sheet_name).toBe("Project 90001 Schedule");
  });
});
