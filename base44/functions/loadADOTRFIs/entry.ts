import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

const rfiData = [
  { rfi_number: "1", rfi_date: "2025-02-11", title: "Ramp Rail Requirements at Existing Ramp", priority: "Medium", status: "Closed", submitted_date: "2025-02-11", responded_date: "2025-08-27" },
  { rfi_number: "2", rfi_date: "2025-04-02", title: "Confirmation Regarding Field Conditions", priority: "Medium", status: "Closed", submitted_date: "2025-04-02", responded_date: "2025-08-27" },
  { rfi_number: "3", rfi_date: "2025-04-02", title: "Sleeve Length Confirmation", priority: "Medium", status: "Closed", submitted_date: "2025-04-02", responded_date: "2025-08-27" },
  { rfi_number: "4", rfi_date: "2025-04-02", title: "Ramp Rails Workout Dimensions", priority: "High", status: "Overdue", submitted_date: "2025-04-02", responded_date: null },
  { rfi_number: "5", rfi_date: "2025-04-02", title: "Canopy Rod Brace Workout Dimension", priority: "Medium", status: "Closed", submitted_date: "2025-04-02", responded_date: "2025-08-27" },
  { rfi_number: "6", rfi_date: "2025-06-02", title: "Canopy/Column Connection Detail", priority: "Medium", status: "Closed", submitted_date: "2025-06-02", responded_date: "2025-08-27" },
  { rfi_number: "7", rfi_date: "2025-06-09", title: "Column Location & Beam Length Confirmation", priority: "High", status: "Closed", submitted_date: "2025-06-09", responded_date: "2025-08-27" },
  { rfi_number: "8", rfi_date: "2025-07-18", title: "Substitution Request - Simpson ATR Bolt with Set Epoxy System to Expansion Anchors", priority: "Medium", status: "Closed", submitted_date: "2025-07-18", responded_date: "2025-08-27" },
  { rfi_number: "9", rfi_date: "2025-07-25", title: "Substitute Connection Detail for Rear Canopy", priority: "Medium", status: "Closed", submitted_date: "2025-07-25", responded_date: "2025-08-27" },
  { rfi_number: "10", rfi_date: "2025-12-03", title: "Alternate Connection for Ramp Rail Posts", priority: "High", status: "Overdue", submitted_date: "2025-12-03", responded_date: null },
];

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user?.role || user.role !== 'admin') {
      return Response.json({ error: 'Admin access required' }, { status: 403 });
    }

    // Find ADOT Tucson MVD Renovation project
    const projects = await base44.entities.Project.list();
    const adotProject = projects.find(p => p.name?.toLowerCase().includes('adot') && p.name?.toLowerCase().includes('tucson'));

    if (!adotProject) {
      return Response.json({ error: 'ADOT Tucson project not found' }, { status: 404 });
    }

    // Create RFIs
    const created = [];
    const errors = [];

    for (const rfi of rfiData) {
      try {
        const result = await base44.entities.RFI.create({
          project_id: adotProject.id,
          project_name: adotProject.name,
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