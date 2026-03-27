import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

const ENTITY_FIELD_MAP = {
  RFI: "rfi_number",
  CO: "co_number",
  DRAWING: "drawing_id",
  SUBMITTAL: "submittal_number",
  WORK_PACKAGE: "wp_number",
  DAILY_LOG: "log_id",
  DELIVERY: "delivery_id",
  MEETING: "meeting_number",
  ACTION_ITEM: "action_id",
  PRODUCTION_NOTE: "id",
  LOOK_AHEAD: "id",
  CONTACT: "id",
};

const PREFIXES = {
  RFI: { prefix: "RFI", pad: 3 },
  CO: { prefix: "CO", pad: 3 },
  DRAWING: { prefix: "DWG", pad: 3 },
  SUBMITTAL: { prefix: "SUB", pad: 3 },
  WORK_PACKAGE: { prefix: "WP", pad: 2 },
  DAILY_LOG: { prefix: "LOG", pad: 4 },
  DELIVERY: { prefix: "DEL", pad: 3 },
  MEETING: { prefix: "MTG", pad: 3 },
  ACTION_ITEM: { prefix: "AI", pad: 3 },
  PRODUCTION_NOTE: { prefix: "PN", pad: 3 },
  LOOK_AHEAD: { prefix: "LA", pad: 3 },
  CONTACT: { prefix: "CON", pad: 3 },
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user || user.role !== "admin") {
      return Response.json(
        { error: "Forbidden: Admin access required" },
        { status: 403 }
      );
    }

    const projects = await base44.entities.Project.list();
    const types = Object.keys(ENTITY_FIELD_MAP);
    const results = [];

    for (const project of projects) {
      for (const type of types) {
        try {
          // Get entity data
          let records = [];
          if (type === "RFI") {
            records = await base44.entities.RFI.filter({
              project_id: project.id,
            });
          } else if (type === "CO") {
            records = await base44.entities.ChangeOrder.filter({
              project_id: project.id,
            });
          } else if (type === "DRAWING") {
            records = await base44.entities.Drawing.filter({
              project_id: project.id,
            });
          } else if (type === "WORK_PACKAGE") {
            records = await base44.entities.WorkPackage.filter({
              project_id: project.id,
            });
          } else if (type === "DAILY_LOG") {
            records = await base44.entities.DailyLog.filter({
              project_id: project.id,
            });
          } else if (type === "DELIVERY") {
            records = await base44.entities.Delivery.filter({
              project_id: project.id,
            });
          } else if (type === "MEETING") {
            records = await base44.entities.Meeting.filter({
              project_id: project.id,
            });
          } else if (type === "ACTION_ITEM") {
            records = await base44.entities.ActionItem.filter({
              project_id: project.id,
            });
          }

          if (records.length === 0) continue;

          // Extract sequence numbers from existing IDs
          const maxSeq = Math.max(
            ...records.map((r) => {
              const field = ENTITY_FIELD_MAP[type];
              const id = r[field] || "";
              const num = parseInt(id.replace(/[^0-9]/g, ""));
              return isNaN(num) ? 0 : num;
            })
          );

          // Upsert sequence record
          const existing = await base44.entities.ProjectNumberSequence.filter({
            project_id: project.id,
            record_type: type,
          });

          const config = PREFIXES[type];
          if (existing.length > 0) {
            await base44.entities.ProjectNumberSequence.update(
              existing[0].id,
              {
                last_sequence: maxSeq,
              }
            );
          } else {
            await base44.entities.ProjectNumberSequence.create({
              project_id: project.id,
              record_type: type,
              last_sequence: maxSeq,
              prefix: config.prefix,
              pad_length: config.pad,
            });
          }

          results.push({
            project: project.name,
            type,
            count: records.length,
            maxSeq,
          });
        } catch (err) {
          console.error(`Error processing ${type} for ${project.name}:`, err);
        }
      }
    }

    return Response.json({
      status: "success",
      message: `Rebuilt ${results.length} sequences across projects`,
      results,
    });
  } catch (error) {
    console.error("Rebuild error:", error);
    return Response.json(
      { error: error.message },
      { status: 500 }
    );
  }
});