import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";
import { parseMPP } from "npm:@tensor-estate/tsmpp@0.1.0";

const PHASES = [
  "Pre-Construction",
  "Detailing",
  "Procurement",
  "Fabrication",
  "Delivery",
  "Installation",
  "Closeout",
];

function normalizePhaseCandidate(value: string | null | undefined) {
  const title = String(value || "").trim().toLowerCase();
  if (!title) return null;

  if (title.includes("pre-con") || title.includes("precon") || title.includes("preconstruction")) return "Pre-Construction";
  if (title.includes("detail") || title.includes("submittal") || title.includes("rfi")) return "Detailing";
  if (title.includes("procure") || title.includes("purchase") || title.includes("material") || title.includes("mill")) return "Procurement";
  if (title.includes("fab") || title.includes("shop") || title.includes("paint") || title.includes("galv")) return "Fabrication";
  if (title.includes("deliver") || title.includes("ship") || title.includes("logistics") || title.includes("haul")) return "Delivery";
  if (title.includes("erect") || title.includes("install") || title.includes("field") || title.includes("bolt") || title.includes("deck")) return "Installation";
  if (title.includes("closeout") || title.includes("punch") || title.includes("warranty") || title.includes("final")) return "Closeout";

  return null;
}

function derivePhaseFromTaskName(taskName: string | null | undefined) {
  const title = String(taskName || "").trim().toLowerCase();
  if (!title) return PHASES[0];

  if (title.includes("bid") || title.includes("permit") || title.includes("contract") || title.includes("proposal") || title.includes("pre-con") || title.includes("precon")) return "Pre-Construction";
  if (title.includes("detail") || title.includes("drawing") || title.includes("submittal") || title.includes("rfi")) return "Detailing";
  if (title.includes("procure") || title.includes("po") || title.includes("purchase") || title.includes("material") || title.includes("order") || title.includes("mill")) return "Procurement";
  if (title.includes("fab") || title.includes("shop") || title.includes("weld") || title.includes("cut") || title.includes("fit-up") || title.includes("paint") || title.includes("galv")) return "Fabrication";
  if (title.includes("deliver") || title.includes("ship") || title.includes("truck")) return "Delivery";
  if (title.includes("erect") || title.includes("install") || title.includes("field") || title.includes("bolt") || title.includes("beam") || title.includes("column") || title.includes("deck")) return "Installation";
  if (title.includes("closeout") || title.includes("punchlist") || title.includes("punch") || title.includes("warranty") || title.includes("final") || title.includes("inspect") || title.includes("close")) return "Closeout";

  return PHASES[0];
}

function decodeBase64(value: string) {
  const binary = atob(value);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

function buildOutlineWbs(base: number, stack: number[]) {
  return `${base}.${stack.join("")}`;
}

Deno.serve(async (req) => {
  try {
    if (req.method !== "POST") {
      return Response.json({ error: "Method not allowed" }, { status: 405 });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }

    const body = await req.json();
    const projectId = body?.project_id;
    const fileName = body?.file_name || "schedule.mpp";
    const fileBase64 = body?.file_base64;

    if (!projectId || !fileBase64) {
      return Response.json({ error: "project_id and file_base64 are required" }, { status: 400 });
    }

    const bytes = decodeBase64(fileBase64);
    const project = await parseMPP(bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength));
    const allTasks = Array.isArray(project?.tasks) ? project.tasks : [];
    const taskMap = new Map(allTasks.map((task) => [task.id, task]));

    const resolveTaskPhase = (task: { parentId: number | null; name: string }) => {
      let cursor = task.parentId;
      while (cursor != null) {
        const parent = taskMap.get(cursor);
        if (!parent) break;
        const phase = normalizePhaseCandidate(parent.name);
        if (phase) return phase;
        cursor = parent.parentId;
      }
      return derivePhaseFromTaskName(task.name);
    };

    const importableTasks = allTasks;
    if (!importableTasks.length) {
      return Response.json({ error: "No importable tasks were found in the MPP file." }, { status: 400 });
    }

    const createdBySourceId = new Map<number, string>();
    const phaseStacks = new Map<string, number[]>();

    for (const task of importableTasks) {
      const phase = resolveTaskPhase(task);
      const base = (PHASES.indexOf(phase) >= 0 ? PHASES.indexOf(phase) : 0) + 1;
      const depth = Math.max(1, Math.min(3, Number(task.level) || 1));
      const stack = phaseStacks.has(phase) ? [...(phaseStacks.get(phase) || [])] : [];
      while (stack.length > depth) stack.pop();
      while (stack.length < depth) stack.push(0);
      stack[depth - 1] = (stack[depth - 1] || 0) + 1;
      phaseStacks.set(phase, stack);

      const created = await base44.entities.ScheduleTask.create({
        project_id: projectId,
        task_name: task.name || "Task",
        task_type: task.isSummary ? "Summary" : task.isMilestone ? "Milestone" : "Task",
        phase,
        wbs_code: buildOutlineWbs(base, stack),
        start_date: task.startDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        end_date: task.finishDate?.slice(0, 10) || task.startDate?.slice(0, 10) || new Date().toISOString().slice(0, 10),
        status: "Not Started",
        percent_complete: 0,
        priority: "Normal",
        notes: `Imported from ${fileName}${task.predecessors?.length ? ` | Original predecessors: ${task.predecessors.map((pred) => `${pred.taskId}${pred.type && pred.type !== "FS" ? ` (${pred.type})` : ""}`).join(", ")}` : ""}`,
      });
      createdBySourceId.set(task.id, created.id);
    }

    const predecessorUpdates: Promise<unknown>[] = [];
    for (const task of importableTasks) {
      if (task.isSummary || !task.predecessors?.length) continue;
      const createdId = createdBySourceId.get(task.id);
      if (!createdId) continue;

      const predecessorIds = task.predecessors
        .map((pred) => createdBySourceId.get(pred.taskId))
        .filter(Boolean)
        .join(",");

      if (!predecessorIds) continue;
      predecessorUpdates.push(base44.entities.ScheduleTask.update(createdId, { predecessor_ids: predecessorIds }));
    }

    if (predecessorUpdates.length) {
      await Promise.all(predecessorUpdates);
    }

    return Response.json({
      imported_count: importableTasks.length,
      predecessor_link_count: predecessorUpdates.length,
      project_name: project?.name || null,
    });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Import failed",
        details: String(error),
      },
      { status: 500 }
    );
  }
});
