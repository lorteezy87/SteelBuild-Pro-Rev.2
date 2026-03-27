import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const rfiData = [
  { rfi_number: "1", rfi_date: "2025-11-12", title: "Building Length, Grid, & Footing Elevations", priority: "High", status: "Closed", submitted_date: "2025-11-12", responded_date: "2025-11-17" },
  { rfi_number: "2", rfi_date: "2025-11-12", title: "Beam location & connection arrangement", priority: "High", status: "Closed", submitted_date: "2026-01-12", responded_date: "2026-01-15" },
  { rfi_number: "3", rfi_date: "2025-11-20", title: "Beam & girder clashing with CMU wall.", priority: "High", status: "Closed", submitted_date: "2025-11-20", responded_date: "2025-11-24" },
  { rfi_number: "4", rfi_date: "2025-11-20", title: "Bottom of Deck Elevation", priority: "Medium", status: "Closed", submitted_date: "2025-11-20", responded_date: "2025-11-27" },
  { rfi_number: "5", rfi_date: "2025-11-12", title: "Joist, Girder Spacing & Shoe Depth", priority: "High", status: "Closed", submitted_date: "2025-11-12", responded_date: "2026-03-02" },
  { rfi_number: "6", rfi_date: "2025-11-18", title: "Beam Clashing & Connection Arrangement", priority: "High", status: "Closed", submitted_date: "2025-11-18", responded_date: "2025-11-25" },
  { rfi_number: "7", rfi_date: "2025-11-18", title: "Footing Elevation & Column Clashing with CMU Wall", priority: "High", status: "Closed", submitted_date: "2025-11-18", responded_date: "2025-11-25" },
  { rfi_number: "8", rfi_date: "2025-11-24", title: "Hoist Beam Location & Elevation", priority: "Medium", status: "Closed", submitted_date: "2025-11-24", responded_date: "2025-12-01" },
  { rfi_number: "9", rfi_date: "2025-11-26", title: "Stair Roof Beam Clashing with Joist Embed & Deck Elevation", priority: "High", status: "Closed", submitted_date: "2025-11-26", responded_date: "2025-12-01" },
  { rfi_number: "10", rfi_date: "2025-11-24", title: "Occurance of Post, Location of Post, & Channel Size", priority: "Medium", status: "Closed", submitted_date: "2025-11-24", responded_date: "2025-12-01" },
  { rfi_number: "11", rfi_date: "2025-11-25", title: "Roof Edge of Deck at Stair B", priority: "Medium", status: "Closed", submitted_date: "2025-11-25", responded_date: "2025-12-02" },
  { rfi_number: "12", rfi_date: "2025-11-26", title: "Edge of Slab & Landing Connection", priority: "Medium", status: "Closed", submitted_date: "2025-11-26", responded_date: "2025-12-01" },
  { rfi_number: "13", rfi_date: "2025-11-26", title: "Beam Member Section Size", priority: "Medium", status: "Closed", submitted_date: "2025-11-26", responded_date: "2025-12-03" },
  { rfi_number: "14", rfi_date: "2025-11-28", title: "Stair Guardrail & Tread Anchor Arrangement", priority: "Medium", status: "Closed", submitted_date: "2025-11-28", responded_date: "2026-03-02" },
  { rfi_number: "15", rfi_date: "2025-12-03", title: "SES Canopy Frame", priority: "High", status: "Overdue", submitted_date: "2025-12-03", responded_date: null },
  { rfi_number: "16", rfi_date: "2026-01-07", title: "Regarding Scope of Floor, Opening Frames, and Unit Support", priority: "Medium", status: "Closed", submitted_date: "2026-01-07", responded_date: "2026-01-14" },
  { rfi_number: "17", rfi_date: "2026-01-07", title: "Embed BFA Post Review Query", priority: "Medium", status: "Closed", submitted_date: "2026-01-07", responded_date: "2026-01-14" },
  { rfi_number: "18", rfi_date: "2026-01-07", title: "Elevator Room Layout & Scope", priority: "High", status: "Closed", submitted_date: "2026-01-07", responded_date: "2026-01-14" },
  { rfi_number: "19", rfi_date: "2026-01-07", title: "Joist Spacing Coordination", priority: "Medium", status: "Closed", submitted_date: "2026-01-07", responded_date: "2026-01-14" },
  { rfi_number: "20", rfi_date: "2026-01-11", title: "Beam & Girder Clearance with Elevator Wall", priority: "High", status: "Closed", submitted_date: "2026-01-11", responded_date: "2026-03-02" },
  { rfi_number: "21", rfi_date: "2026-01-11", title: "Ledger Arrangement at Door Opening", priority: "Medium", status: "Closed", submitted_date: "2026-01-11", responded_date: "2026-01-14" },
  { rfi_number: "22", rfi_date: "2026-01-14", title: "Regarding elevator room layout & its scope.", priority: "Medium", status: "Closed", submitted_date: "2026-01-14", responded_date: "2026-01-21" },
  { rfi_number: "23", rfi_date: "2026-01-29", title: "Elevator Shaft Wall Dimensions", priority: "High", status: "Overdue", submitted_date: "2026-01-29", responded_date: null },
  { rfi_number: "24", rfi_date: "2026-01-29", title: "Girder / Wall Clearance Conflict", priority: "High", status: "Closed", submitted_date: "2026-01-29", responded_date: "2026-03-02" },
  { rfi_number: "25", rfi_date: "2026-02-11", title: "Stair-B Mid-Landing Column Occurrence & Stair Splice", priority: "High", status: "Overdue", submitted_date: "2026-02-11", responded_date: "2026-03-02" },
  { rfi_number: "26", rfi_date: "2026-02-11", title: "Regarding Elevator Bracket Support & Pit-Ladder Requirement", priority: "Medium", status: "Closed", submitted_date: "2026-02-11", responded_date: "2026-03-02" },
  { rfi_number: "27", rfi_date: "2026-02-11", title: "Regarding Machine Room Layout Clarification at Elevator", priority: "High", status: "Overdue", submitted_date: "2026-02-11", responded_date: null },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find Academy MS Mesa project
    const projects = await base44.entities.Project.list();
    const academyProject = projects.find(p => p.name?.toLowerCase().includes('academy') && p.name?.toLowerCase().includes('mesa'));

    if (!academyProject) {
      return Response.json({ error: 'Academy MS Mesa project not found' }, { status: 404 });
    }

    // Create RFIs
    const created = [];
    const errors = [];

    for (const rfi of rfiData) {
      try {
        const result = await base44.entities.RFI.create({
          project_id: academyProject.id,
          project_name: academyProject.name,
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