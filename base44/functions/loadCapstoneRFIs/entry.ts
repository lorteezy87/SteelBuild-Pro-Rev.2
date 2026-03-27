import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const rfiData = [
  { rfi_number: "1", rfi_date: "2025-03-21", title: "Grid Names Conflict", priority: "High", status: "Closed", submitted_date: "2025-03-26", responded_date: "2025-04-17" },
  { rfi_number: "2", rfi_date: "2025-03-21", title: "Column Location Conflict At Entry Storefront", priority: "High", status: "Closed", submitted_date: "2025-03-26", responded_date: "2025-04-17" },
  { rfi_number: "3", rfi_date: "2025-03-21", title: "Column Location Conflict at North Entry Canopies", priority: "High", status: "Closed", submitted_date: "2025-03-26", responded_date: "2025-04-17" },
  { rfi_number: "4", rfi_date: "2025-03-21", title: "Anchor Bolt Size Confirmation for Canopy Columns", priority: "Medium", status: "Closed", submitted_date: "2025-03-26", responded_date: "2025-04-17" },
  { rfi_number: "5", rfi_date: "2025-04-04", title: "Level 6 Column Height Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-09", responded_date: "2025-04-16" },
  { rfi_number: "6", rfi_date: "2025-04-04", title: "Beam Position & Span Confirmation at Level 5", priority: "High", status: "Closed", submitted_date: "2025-04-09", responded_date: "2025-05-01" },
  { rfi_number: "7", rfi_date: "2025-04-04", title: "Missing Structural Details & Sections Request", priority: "Critical", status: "Closed", submitted_date: "2025-04-09", responded_date: "2025-05-01" },
  { rfi_number: "8", rfi_date: "2025-04-09", title: "Steel Pans to Steel Beam Angle Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-14", responded_date: "2025-04-14" },
  { rfi_number: "9", rfi_date: "2025-04-11", title: "Plate Material Grades Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-18", responded_date: "2025-04-17" },
  { rfi_number: "10", rfi_date: "2025-04-17", title: "HSS Beam Position Confirmation at Stair 2&3", priority: "High", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-05-01" },
  { rfi_number: "11", rfi_date: "2025-04-17", title: "HSS Beam Connection Confirmation Along Grind B 9-10", priority: "High", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-05-01" },
  { rfi_number: "12", rfi_date: "2025-04-17", title: "Embed Plate Detail Confirmation at SC3 Columns", priority: "Medium", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-04-24" },
  { rfi_number: "13", rfi_date: "2025-04-17", title: "Stair 1 Step up Direction Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-05-01" },
  { rfi_number: "14", rfi_date: "2025-04-17", title: "Retaining Gaurdrail Location & Dimension Extent Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-05-01" },
  { rfi_number: "15", rfi_date: "2025-04-17", title: "Perforated Panel Size Confirmation at Exterior Canopy", priority: "Low", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-04-24" },
  { rfi_number: "16", rfi_date: "2025-04-17", title: "Perforated Panel Thickness Confirmation at Feature Stair Guardrails", priority: "Low", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-05-01" },
  { rfi_number: "17", rfi_date: "2025-04-17", title: "Canopy Column Existence Confirmation at West of Grid F", priority: "High", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-05-01" },
  { rfi_number: "18", rfi_date: "2025-04-17", title: "Canopy Columns Location Confirmation", priority: "High", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-04-24" },
  { rfi_number: "19", rfi_date: "2025-04-17", title: "W 14x74 Beam Position & Span Confirmation at Level 5", priority: "High", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-06-03" },
  { rfi_number: "20", rfi_date: "2025-04-17", title: "Angle Requirement Confirmation Below Stair Pans", priority: "Medium", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-05-01" },
  { rfi_number: "21", rfi_date: "2025-04-21", title: "Surface Prep And Primer Confirmation For Steel", priority: "Medium", status: "Closed", submitted_date: "2025-04-25", responded_date: "2025-04-25" },
  { rfi_number: "22", rfi_date: "2025-04-21", title: "Base Plate Size & Anchor Bolt Layout Confirmation for Canopy Columns", priority: "High", status: "Closed", submitted_date: "2025-04-25", responded_date: "2025-05-01" },
  { rfi_number: "23", rfi_date: "2025-04-24", title: "Roof Parapet Guardrail Details Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-05-01", responded_date: "2025-05-01" },
  { rfi_number: "24", rfi_date: "2025-04-25", title: "Non-Penetrating Elevated Walkway Information", priority: "Medium", status: "Closed", submitted_date: "2025-05-02", responded_date: "2025-08-12" },
  { rfi_number: "24.1", rfi_date: "2025-08-04", title: "W14x26 Beam Position And Elevation Confirmation At Level-5", priority: "High", status: "Closed", submitted_date: "2025-08-05", responded_date: "2025-08-11" },
  { rfi_number: "25", rfi_date: "2025-04-28", title: "Embed Size Conflict Between Column Schedule & Detail 119", priority: "High", status: "Closed", submitted_date: "2025-05-05", responded_date: "2025-05-01" },
  { rfi_number: "26", rfi_date: "2025-04-28", title: "Column Locations Confirmation at Level 2 Slab", priority: "High", status: "Closed", submitted_date: "2025-05-05", responded_date: "2025-05-01" },
  { rfi_number: "27", rfi_date: "2025-04-28", title: "Embed Size Confirmation at Ramp 2 Level 1", priority: "Medium", status: "Closed", submitted_date: "2025-05-05", responded_date: "2025-06-03" },
  { rfi_number: "28", rfi_date: "2025-04-28", title: "Embed Size Confirmation at Ramp 4 Level 1", priority: "Medium", status: "Closed", submitted_date: "2025-05-05", responded_date: "2025-05-01" },
  { rfi_number: "29", rfi_date: "2025-04-28", title: "Embed Size & Handrail Detail Confirmation at Ramp 5 Level 1", priority: "Medium", status: "Closed", submitted_date: "2025-05-05", responded_date: "2025-06-03" },
  { rfi_number: "30", rfi_date: "2025-04-28", title: "Canopy Columns Height & Connection Confirmation", priority: "High", status: "Closed", submitted_date: "2025-05-05", responded_date: "2025-05-01" },
  { rfi_number: "31", rfi_date: "2025-05-14", title: "Elevator Sill Angle Size, Extent, and Fixing Details", priority: "High", status: "Closed", submitted_date: "2025-05-19", responded_date: "2025-06-26" },
  { rfi_number: "32", rfi_date: "2025-05-14", title: "Elevator Divider Beam Elevation Confirmation At Pit Level", priority: "High", status: "Closed", submitted_date: "2025-05-19", responded_date: "2025-06-26" },
  { rfi_number: "32.1", rfi_date: "2025-06-04", title: "Elevator Divider Beam Elevation Confirmation at Level-P1", priority: "High", status: "Closed", submitted_date: "2025-06-11", responded_date: "2025-06-26" },
  { rfi_number: "33", rfi_date: "2025-05-14", title: "HSS Post Base Connection at Transformer Screening (Sector A, Level 1)", priority: "Medium", status: "Closed", submitted_date: "2025-05-19", responded_date: "2025-06-03" },
  { rfi_number: "34", rfi_date: "2025-05-14", title: "Replacement of J Anchors with Headed Studs and Impact on Slotted Hole", priority: "High", status: "Closed", submitted_date: "2025-05-19", responded_date: "2025-06-03" },
  { rfi_number: "35", rfi_date: "2025-05-14", title: "Sump Pit Frame Material Finish, Location and Anchorage Details Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-05-19", responded_date: "2025-05-19" },
  { rfi_number: "36", rfi_date: "2025-05-15", title: "Face of CMU Wall from GL 4", priority: "Medium", status: "Closed", submitted_date: "2025-05-20", responded_date: "2025-06-03" },
  { rfi_number: "37", rfi_date: "2025-05-15", title: "Guardrail Posts in Ramp Slab", priority: "Medium", status: "Closed", submitted_date: "2025-05-20", responded_date: "2025-06-03" },
  { rfi_number: "38", rfi_date: "2025-05-19", title: "Clarification Request on Guardrail Embed Detail", priority: "Medium", status: "Closed", submitted_date: "2025-05-17", responded_date: "2025-05-23" },
  { rfi_number: "39", rfi_date: "2025-05-19", title: "Clarification on CMU Wall Height for Handrail Mounting at Ramp-5", priority: "Low", status: "Closed", submitted_date: "2025-05-30", responded_date: "2025-05-23" },
  { rfi_number: "40", rfi_date: "2025-05-19", title: "Clarification on Bollard Embed and Headed Stud Detail at Level P1", priority: "Medium", status: "Closed", submitted_date: "2025-05-17", responded_date: "2025-05-23" },
  { rfi_number: "41", rfi_date: "2025-05-19", title: "Clarification on Bollard Embed and Headed Stud Details at Level-1", priority: "Medium", status: "Closed", submitted_date: "2025-05-23", responded_date: "2025-05-23" },
  { rfi_number: "42", rfi_date: "2025-05-20", title: "Confirmation on Scupper Dimensions and Locations", priority: "Low", status: "Closed", submitted_date: "2025-05-21", responded_date: "2025-05-28" },
  { rfi_number: "43", rfi_date: "2025-06-02", title: "Alternate Connection Detail", priority: "Medium", status: "Closed", submitted_date: "2025-06-06", responded_date: "2025-06-10" },
  { rfi_number: "44", rfi_date: "2025-06-04", title: "Portal Canopy Framing Confirmation", priority: "High", status: "Overdue", submitted_date: "2025-06-11", responded_date: null },
  { rfi_number: "45", rfi_date: "2025-06-09", title: "Stud Length Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-06-09", responded_date: "2025-06-27" },
  { rfi_number: "46", rfi_date: "2025-06-11", title: "Confirmation of Wood Post Sizes & Location", priority: "High", status: "Closed", submitted_date: "2025-06-11", responded_date: "2025-08-12" },
  { rfi_number: "47", rfi_date: "2025-06-12", title: "Confirmation of Wood Beam Elevations & Locations", priority: "High", status: "Closed", submitted_date: "2025-06-18", responded_date: "2025-08-12" },
  { rfi_number: "48", rfi_date: "2025-06-12", title: "Confirmation of Wood Truss Locations at Steel Columns", priority: "High", status: "Closed", submitted_date: "2025-06-18", responded_date: "2025-08-12" },
  { rfi_number: "49", rfi_date: "2025-06-12", title: "Inquiry Regarding Wood Post Dimensions,Beam Heights,& Truss Configuration", priority: "High", status: "Closed", submitted_date: "2025-06-18", responded_date: "2025-08-12" },
  { rfi_number: "50", rfi_date: "2025-07-01", title: "Clarification on Bollard, Equipment Fence, Planter, and Angle Layouts", priority: "Low", status: "Closed", submitted_date: "2025-07-01", responded_date: "2025-07-08" },
  { rfi_number: "51", rfi_date: "2025-07-01", title: "Clarification on Stair #1 Layout and Gate/Opening Dimensions", priority: "Medium", status: "Closed", submitted_date: "2025-07-01", responded_date: "2025-07-08" },
  { rfi_number: "52", rfi_date: "2025-07-07", title: "Clarification at Stair 2", priority: "Medium", status: "Closed", submitted_date: "2025-07-07", responded_date: "2025-08-06" },
  { rfi_number: "52.1", rfi_date: "2025-08-04", title: "Post BFA Questions Stair 2 (8.4.25)", priority: "Medium", status: "Closed", submitted_date: "2025-08-04", responded_date: "2025-08-11" },
  { rfi_number: "53", rfi_date: "2025-07-08", title: "Post BFA Questions On Stair 3", priority: "Medium", status: "Closed", submitted_date: "2025-07-10", responded_date: "2025-08-06" },
  { rfi_number: "54", rfi_date: "2025-07-08", title: "Post BFA Questions On Roof Guardrails", priority: "Medium", status: "Overdue", submitted_date: "2025-07-10", responded_date: null },
  { rfi_number: "55", rfi_date: "2025-07-08", title: "Additional Post BFA Question On Level P1 & L1", priority: "Medium", status: "Overdue", submitted_date: "2025-07-10", responded_date: "2025-07-15" },
  { rfi_number: "56", rfi_date: "2025-08-01", title: "Confirmation of Latest Column, Beam, and Embed Locations per RFI #084 Response & Associated Cost Impact", priority: "Critical", status: "Overdue", submitted_date: "2025-08-01", responded_date: "2025-08-08" },
  { rfi_number: "57", rfi_date: "2025-08-04", title: "Clarification On Stair Width Per RFI 98 Response", priority: "Medium", status: "Closed", submitted_date: "2025-08-05", responded_date: "2025-08-06" },
  { rfi_number: "58", rfi_date: "2025-11-20", title: "Alternate Connection Method For Columns W/O Embed Plates", priority: "High", status: "Overdue", submitted_date: "2025-11-27", responded_date: null },
  { rfi_number: "59", rfi_date: "2025-12-07", title: "CMU Stair Tower is Too Narrow", priority: "Critical", status: "Overdue", submitted_date: "2025-12-14", responded_date: null },
  { rfi_number: "60", rfi_date: "2025-12-08", title: "Clarification of Installed Elevator Shaft Embeds Due to Use of Rev. 1 Plans in Field", priority: "Critical", status: "Overdue", submitted_date: "2025-12-15", responded_date: null },
  { rfi_number: "61", rfi_date: "2026-02-02", title: "Anchor Bolt Clearance at Stair #1 Landings", priority: "High", status: "Overdue", submitted_date: "2026-02-05", responded_date: null },
  { rfi_number: "62", rfi_date: "2026-02-11", title: "Masonry Support Angles at S1, S2, & S3", priority: "High", status: "Overdue", submitted_date: "2026-02-13", responded_date: null },
  { rfi_number: "63", rfi_date: "2026-02-12", title: "Anchor Bolt Project at Canopy", priority: "Medium", status: "Closed", submitted_date: "2026-02-16", responded_date: "2026-02-13" },
  { rfi_number: "64", rfi_date: "2026-02-18", title: "Stair 1 & Stair 2 Grab Rail Return Terminations – Installed 90° Returns vs. Indicated Radiused Elbows", priority: "High", status: "Overdue", submitted_date: "2026-02-25", responded_date: "2026-02-25" },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find Capstone Tucson project
    const projects = await base44.entities.Project.list();
    const capstoneProject = projects.find(p => p.name?.toLowerCase().includes('capstone') && p.name?.toLowerCase().includes('tucson'));

    if (!capstoneProject) {
      return Response.json({ error: 'Capstone Tucson project not found' }, { status: 404 });
    }

    // Create RFIs
    const created = [];
    const errors = [];

    for (const rfi of rfiData) {
      try {
        const result = await base44.entities.RFI.create({
          project_id: capstoneProject.id,
          project_name: capstoneProject.name,
          rfi_number: rfi.rfi_number,
          title: rfi.title,
          description: `RFI #${rfi.rfi_number}: ${rfi.title}`,
          rfi_date: rfi.rfi_date,
          priority: rfi.priority,
          status: rfi.status,
          submitted_date: rfi.submitted_date,
          responded_date: rfi.responded_date,
          due_date: rfi.submitted_date,
          assigned_to: user.email,
        });
        created.push(rfi.rfi_number);
      } catch (err) {
        errors.push({ rfi_number: rfi.rfi_number, error: err.message });
      }
    }

    return Response.json({
      success: true,
      created: created.length,
      failed: errors.length,
      details: { created, errors },
    });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});