import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const rfiData = [
  { rfi_number: "1", rfi_date: "2025-04-17", title: "Regarding Grid conflict between Arch. & Stru.", priority: "High", status: "Closed", submitted_date: "2025-04-17", responded_date: "2025-04-17" },
  { rfi_number: "1.1", rfi_date: "2025-06-03", title: "Grid Conflict Between Arch. & Structural", priority: "High", status: "Closed", submitted_date: "2025-06-03", responded_date: "2025-06-03" },
  { rfi_number: "2", rfi_date: "2025-04-17", title: "Regarding Beam Layout Adjustment To Avoid Clashing", priority: "High", status: "Closed", submitted_date: "2025-04-17", responded_date: "2025-05-08" },
  { rfi_number: "3", rfi_date: "2025-04-17", title: "Regarding Beam To CMU Wall Connection Substitution Confirmation", priority: "High", status: "Closed", submitted_date: "2025-04-17", responded_date: "2025-05-08" },
  { rfi_number: "4", rfi_date: "2025-04-18", title: "Regarding Up-size Ledger Embed Plate Thickness To Match With Beam Embed", priority: "Medium", status: "Closed", submitted_date: "2025-04-18", responded_date: "2025-06-03" },
  { rfi_number: "5", rfi_date: "2025-04-18", title: "Regarding Connection Arrangement of Beam To Embed", priority: "High", status: "Closed", submitted_date: "2025-04-18", responded_date: "2025-05-08" },
  { rfi_number: "5.1", rfi_date: "2025-05-27", title: "HSS Stub Column Weld Detail", priority: "Medium", status: "Closed", submitted_date: "2025-05-27", responded_date: "2025-05-27" },
  { rfi_number: "6", rfi_date: "2025-04-18", title: "Regarding Fireproofing Requirement", priority: "Medium", status: "Closed", submitted_date: "2025-04-18", responded_date: "2025-05-08" },
  { rfi_number: "7", rfi_date: "2025-04-23", title: "Steel Cross Member Weld Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-23", responded_date: "2025-06-03" },
  { rfi_number: "8", rfi_date: "2025-04-23", title: "Connection of Inclined Beam, along GL-3", priority: "High", status: "Closed", submitted_date: "2025-04-23", responded_date: "2025-05-08" },
  { rfi_number: "9", rfi_date: "2025-04-23", title: "Top of Beam Conflict at Storefront, along GL-3", priority: "High", status: "Closed", submitted_date: "2025-04-23", responded_date: "2025-05-08" },
  { rfi_number: "10", rfi_date: "2025-04-23", title: "Lintel 'LT4' Connection Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-23", responded_date: "2025-05-08" },
  { rfi_number: "11", rfi_date: "2025-04-23", title: "Shear Plate Thickness Conflict & Weld Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-23", responded_date: "2025-05-08" },
  { rfi_number: "12", rfi_date: "2025-04-23", title: "Deck Attachment at the Top of Wall Connection Arrangement", priority: "Medium", status: "Closed", submitted_date: "2025-04-23", responded_date: "2025-05-08" },
  { rfi_number: "13", rfi_date: "2025-04-23", title: "Slope & Elevation Discrepancies", priority: "High", status: "Closed", submitted_date: "2025-04-23", responded_date: "2025-05-08" },
  { rfi_number: "13.1", rfi_date: "2025-06-03", title: "Clarification against BFA/RFI response", priority: "Medium", status: "Closed", submitted_date: "2025-06-03", responded_date: "2025-06-03" },
  { rfi_number: "14", rfi_date: "2025-04-24", title: "Missing W 21 X 44 Connection at Grid Line 2", priority: "High", status: "Closed", submitted_date: "2025-04-24", responded_date: "2025-05-08" },
  { rfi_number: "15", rfi_date: "2025-05-02", title: "Column Location Confirmation Under Patio Framing", priority: "Medium", status: "Closed", submitted_date: "2025-05-02", responded_date: "2025-05-08" },
  { rfi_number: "16", rfi_date: "2025-05-02", title: "CMU Pier Location Conflict", priority: "High", status: "Closed", submitted_date: "2025-05-02", responded_date: "2025-05-08" },
  { rfi_number: "17", rfi_date: "2025-06-12", title: "Regarding Beam Bearing Connection at MCJ", priority: "Medium", status: "Closed", submitted_date: "2025-06-12", responded_date: "2025-08-04" },
  { rfi_number: "18", rfi_date: "2025-06-17", title: "Clarification on Roof Slope, Beam Elevations, Canopy Framing Adjustments, & Deck Orientation", priority: "High", status: "Closed", submitted_date: "2025-06-17", responded_date: "2025-08-22" },
  { rfi_number: "19", rfi_date: "2025-07-02", title: "Concerns Regarding BFA Comments - Revised", priority: "Medium", status: "Closed", submitted_date: "2025-07-02", responded_date: "2025-08-23" },
  { rfi_number: "20", rfi_date: "2025-07-02", title: "Regarding Post BFA Query/Concern", priority: "Medium", status: "Closed", submitted_date: "2025-07-02", responded_date: "2025-08-23" },
  { rfi_number: "21", rfi_date: "2025-07-08", title: "Regarding Bottom of Beam Clarification", priority: "Medium", status: "Closed", submitted_date: "2025-07-08", responded_date: "2025-08-27" },
  { rfi_number: "22", rfi_date: "2025-07-16", title: "Shim Plate Substitution", priority: "Low", status: "Closed", submitted_date: "2025-07-16", responded_date: "2025-07-16" },
  { rfi_number: "22.1", rfi_date: "2025-08-04", title: "Canopy Side Deck Bearing Arrangement", priority: "Medium", status: "Closed", submitted_date: "2025-08-04", responded_date: "2025-08-04" },
  { rfi_number: "23", rfi_date: "2025-07-17", title: "Coordination and Clarifications for Steel, Canopy, Gutter, and Fence", priority: "High", status: "Closed", submitted_date: "2025-07-17", responded_date: "2025-07-17" },
  { rfi_number: "24", rfi_date: "2025-08-22", title: "Coordination Required Between Deck Drawing And Steel Layout", priority: "High", status: "Closed", submitted_date: "2025-08-22", responded_date: "2025-08-22" },
  { rfi_number: "25", rfi_date: "2025-08-22", title: "Clarification Required For Outstanding Concern/Question", priority: "Medium", status: "Closed", submitted_date: "2025-08-22", responded_date: "2025-08-22" },
  { rfi_number: "26", rfi_date: "2025-09-16", title: "Regarding Embed Elevation Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-09-16", responded_date: "2025-09-16" },
  { rfi_number: "27", rfi_date: "2025-09-16", title: "Regarding Coordination with deck and joist drawing", priority: "Medium", status: "Closed", submitted_date: "2025-09-16", responded_date: "2025-09-16" },
  { rfi_number: "28", rfi_date: "2025-09-02", title: "Regarding Main Steel Post BFA queries", priority: "Medium", status: "Closed", submitted_date: "2025-09-02", responded_date: "2025-09-02" },
  { rfi_number: "29", rfi_date: "2025-09-02", title: "Clarification required for RTU opening dimension", priority: "Medium", status: "Closed", submitted_date: "2025-09-02", responded_date: "2025-09-02" },
  { rfi_number: "30", rfi_date: "2025-10-08", title: "Drain Pipe Size and Location Confirmation", priority: "Low", status: "Closed", submitted_date: "2025-10-08", responded_date: "2025-10-08" },
  { rfi_number: "31", rfi_date: "2025-10-15", title: "Continuous Column Section in Lieu of A Splice Connection", priority: "High", status: "Overdue", submitted_date: "2025-10-15", responded_date: null },
  { rfi_number: "32", rfi_date: "2025-11-12", title: "Lintel Beam Column Spacing at Grid D.1 & D.9", priority: "High", status: "Overdue", submitted_date: "2025-11-12", responded_date: null },
  { rfi_number: "33", rfi_date: "2025-12-02", title: "Layout Confirmation On Mechanical Unit", priority: "Medium", status: "Overdue", submitted_date: "2025-12-02", responded_date: null },
  { rfi_number: "34", rfi_date: "2026-01-09", title: "Anchor Bolts Set At The Incorrect Elevation", priority: "Critical", status: "Overdue", submitted_date: "2026-01-09", responded_date: null },
  { rfi_number: "35", rfi_date: "2026-01-12", title: "Misaligned Anchor Bolts at Canopy", priority: "Critical", status: "Overdue", submitted_date: "2026-01-12", responded_date: null },
  { rfi_number: "36", rfi_date: "2026-02-02", title: "Column Alignment and Required Column Shifts at GL-2", priority: "High", status: "Closed", submitted_date: "2026-02-02", responded_date: "2026-01-29" },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find Crosswalk Church project
    const projects = await base44.entities.Project.list();
    const crosswalkProject = projects.find(p => p.name?.toLowerCase().includes('crosswalk'));

    if (!crosswalkProject) {
      return Response.json({ error: 'Crosswalk Church project not found' }, { status: 404 });
    }

    // Create RFIs
    const created = [];
    const errors = [];

    for (const rfi of rfiData) {
      try {
        const result = await base44.entities.RFI.create({
          project_id: crosswalkProject.id,
          project_name: crosswalkProject.name,
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