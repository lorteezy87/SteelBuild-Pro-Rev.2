import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const rfiData = [
  { rfi_number: "1", rfi_date: "2025-04-22", title: "Concrete Ramp & Embed Location Verification", priority: "Medium", status: "Closed", submitted_date: "2025-04-22", responded_date: "2025-05-08" },
  { rfi_number: "2", rfi_date: "2025-04-22", title: "Canopy Frame & Rod Brace Dimension Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-22", responded_date: "2025-05-05" },
  { rfi_number: "3", rfi_date: "2025-04-25", title: "Scope Clarification", priority: "Medium", status: "Closed", submitted_date: "2025-04-25", responded_date: "2025-04-28" },
  { rfi_number: "4", rfi_date: "2025-04-28", title: "Canopy Details Confirmation at Classroom Bldg.", priority: "Medium", status: "Closed", submitted_date: "2025-04-28", responded_date: "2025-05-05" },
  { rfi_number: "5", rfi_date: "2025-04-28", title: "Confirmation of Approver Notes", priority: "Medium", status: "Closed", submitted_date: "2025-04-28", responded_date: "2025-05-05" },
  { rfi_number: "6", rfi_date: "2025-04-28", title: "Confirmation of Ladder Dimensions, Bracket Connections, and Weld Details", priority: "Medium", status: "Closed", submitted_date: "2025-04-28", responded_date: "2025-05-05" },
  { rfi_number: "7", rfi_date: "2025-04-28", title: "Confirmation of Bollard, Gate, and Scupper Details", priority: "Medium", status: "Closed", submitted_date: "2025-04-28", responded_date: "2025-05-05" },
  { rfi_number: "8", rfi_date: "2025-04-28", title: "Clarification on Wagner, Anchor, Grabrail, and Ramp Details", priority: "Medium", status: "Closed", submitted_date: "2025-04-28", responded_date: "2025-05-05" },
  { rfi_number: "9", rfi_date: "2025-04-28", title: "RTU Support Frames", priority: "Medium", status: "Closed", submitted_date: "2025-04-28", responded_date: "2025-05-21" },
  { rfi_number: "10", rfi_date: "2025-04-28", title: "Clarification on Column Location @ Platform Stage Area", priority: "Medium", status: "Closed", submitted_date: "2025-04-28", responded_date: "2025-05-08" },
  { rfi_number: "11", rfi_date: "2025-05-07", title: "K Joist (Bridge Detail) Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-05-07", responded_date: "2025-05-08" },
  { rfi_number: "12", rfi_date: "2025-05-07", title: "Roof Opening Dimensions (RTU Framing Plan)", priority: "Medium", status: "Closed", submitted_date: "2025-05-07", responded_date: "2025-05-08" },
  { rfi_number: "13", rfi_date: "2025-07-08", title: "Request to Revise Connection Detail from Anchor Bolts to Welded Connection at CMU", priority: "Medium", status: "Closed", submitted_date: "2025-07-08", responded_date: "2025-08-27" },
  { rfi_number: "14", rfi_date: "2025-08-27", title: "Anchor Bolt Substitution Request", priority: "Medium", status: "Closed", submitted_date: "2025-08-27", responded_date: "2025-08-27" },
  { rfi_number: "15", rfi_date: "2025-07-30", title: "Awning Support Arm Wall Plate Elevation Adjustment Request", priority: "Medium", status: "Closed", submitted_date: "2025-07-30", responded_date: "2025-08-27" },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find ALA Apache Junction project
    const projects = await base44.entities.Project.list();
    const alaProject = projects.find(p => p.name?.toLowerCase().includes('ala') && p.name?.toLowerCase().includes('apache'));

    if (!alaProject) {
      return Response.json({ error: 'ALA Apache Junction project not found' }, { status: 404 });
    }

    // Create RFIs
    const created = [];
    const errors = [];

    for (const rfi of rfiData) {
      try {
        const result = await base44.entities.RFI.create({
          project_id: alaProject.id,
          project_name: alaProject.name,
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