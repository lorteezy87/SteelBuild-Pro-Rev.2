import { entities } from "@/api/supabaseClient";

function normalizeSetName(value) {
  const trimmed = (value || "").trim();
  return trimmed || "Ungrouped Drawings";
}

function toIsoDate(value) {
  if (!value) return null;
  const text = String(value);
  return text.includes("T") ? text.slice(0, 10) : text;
}

function drawingTaskName(drawing) {
  return `${drawing.sheet_number || "DWG"} - ${drawing.title || "Drawing Review"}`.trim();
}

function setTaskName(setName) {
  return setName;
}

function buildDrawingTaskPayload(drawing, projectId, projectName, parentTaskId) {
  const startDate = toIsoDate(drawing.submitted_date) || toIsoDate(drawing.issue_date) || toIsoDate(drawing.due_date);
  const endDate = toIsoDate(drawing.due_date) || toIsoDate(drawing.return_date) || startDate;

  return {
    project_id: projectId,
    project_name: projectName || drawing.project_name || "",
    task_name: drawingTaskName(drawing),
    task_type: "Submittal",
    phase: "Detailing",
    start_date: startDate,
    end_date: endDate,
    status: drawing.stage === "Released" ? "Complete" : "Not Started",
    priority: drawing.priority_flag ? "High" : "Normal",
    percent_complete: drawing.stage === "Released" ? 100 : 0,
    linked_entity_type: "Drawing",
    linked_entity_id: drawing.id,
    parent_task_id: parentTaskId || null,
    notes: [
      `Drawing Set: ${normalizeSetName(drawing.drawing_set_name)}`,
      drawing.discipline ? `Discipline: ${drawing.discipline}` : "",
      drawing.reviewer ? `Reviewer: ${drawing.reviewer}` : "",
      drawing.spec_section ? `Spec: ${drawing.spec_section}` : "",
    ]
      .filter(Boolean)
      .join(" | "),
  };
}

function buildSetTaskPayload(setName, drawings, projectId, projectName) {
  const startDates = drawings
    .map((drawing) => toIsoDate(drawing.submitted_date) || toIsoDate(drawing.issue_date) || toIsoDate(drawing.due_date))
    .filter(Boolean)
    .sort();
  const endDates = drawings
    .map((drawing) => toIsoDate(drawing.due_date) || toIsoDate(drawing.return_date) || toIsoDate(drawing.submitted_date))
    .filter(Boolean)
    .sort();

  const allReleased = drawings.length > 0 && drawings.every((drawing) => drawing.stage === "Released");
  const anyStarted = drawings.some((drawing) => ["OFA", "BFA", "OFS", "BFS", "FFF", "Released"].includes(drawing.stage));
  const percentComplete = drawings.length
    ? Math.round(
        drawings.reduce((sum, drawing) => sum + (drawing.stage === "Released" ? 100 : 0), 0) / drawings.length
      )
    : 0;

  return {
    project_id: projectId,
    project_name: projectName || drawings[0]?.project_name || "",
    task_name: setTaskName(setName),
    task_type: "Submittal",
    phase: "Detailing",
    start_date: startDates[0] || null,
    end_date: endDates[endDates.length - 1] || startDates[0] || null,
    status: allReleased ? "Complete" : anyStarted ? "In Progress" : "Not Started",
    priority: drawings.some((drawing) => drawing.priority_flag) ? "High" : "Normal",
    percent_complete: percentComplete,
    linked_entity_type: "DrawingSet",
    linked_entity_id: setName,
    is_milestone: false,
    notes: `Drawing Set Schedule Container | Sheets: ${drawings.length}`,
  };
}

function sameValue(a, b) {
  return (a ?? null) === (b ?? null);
}

function needsUpdate(task, payload) {
  return Object.entries(payload).some(([key, value]) => !sameValue(task[key], value));
}

function groupDrawings(drawings) {
  const groups = new Map();
  drawings.forEach((drawing) => {
    const setName = normalizeSetName(drawing.drawing_set_name);
    if (!groups.has(setName)) groups.set(setName, []);
    groups.get(setName).push(drawing);
  });
  return groups;
}

export async function syncDrawingScheduleTasks({ projectId, projectName, drawings = [] }) {
  if (!projectId) return { created: 0, updated: 0, deleted: 0 };

  const activeDrawings = drawings.filter((drawing) => !drawing.is_superseded);
  const groups = groupDrawings(activeDrawings);
  const scheduleTasks = await entities.ScheduleTask.filter({ project_id: projectId });

  const drawingTasks = scheduleTasks.filter((task) => task.linked_entity_type === "Drawing");
  const setTasks = scheduleTasks.filter((task) => task.linked_entity_type === "DrawingSet");
  const legacySubmittals = scheduleTasks.filter(
    (task) => task.task_type === "Submittal" && !task.linked_entity_type
  );

  const drawingById = new Map(drawingTasks.map((task) => [String(task.linked_entity_id), task]));
  const setByName = new Map(setTasks.map((task) => [String(task.linked_entity_id), task]));

  const legacyByName = new Map();
  legacySubmittals.forEach((task) => {
    const key = String(task.task_name || "").trim();
    if (key && !legacyByName.has(key)) legacyByName.set(key, task);
  });

  let created = 0;
  let updated = 0;
  let deleted = 0;

  const seenSetIds = new Set();
  const seenDrawingIds = new Set();

  for (const [setName, setDrawings] of groups.entries()) {
    let parentTask = setByName.get(setName) || legacyByName.get(setTaskName(setName)) || null;
    const setPayload = buildSetTaskPayload(setName, setDrawings, projectId, projectName);

    if (!parentTask) {
      parentTask = await entities.ScheduleTask.create(setPayload);
      created += 1;
    } else if (needsUpdate(parentTask, setPayload)) {
      parentTask = await entities.ScheduleTask.update(parentTask.id, setPayload);
      updated += 1;
    }

    seenSetIds.add(parentTask.id);

    for (const drawing of setDrawings) {
      let childTask =
        drawingById.get(String(drawing.id)) ||
        legacyByName.get(drawingTaskName(drawing)) ||
        null;
      const childPayload = buildDrawingTaskPayload(drawing, projectId, projectName, parentTask.id);

      if (!childTask) {
        childTask = await entities.ScheduleTask.create(childPayload);
        created += 1;
      } else if (needsUpdate(childTask, childPayload)) {
        childTask = await entities.ScheduleTask.update(childTask.id, childPayload);
        updated += 1;
      }

      seenDrawingIds.add(childTask.id);
    }
  }

  for (const task of drawingTasks) {
    if (!seenDrawingIds.has(task.id)) {
      await entities.ScheduleTask.delete(task.id);
      deleted += 1;
    }
  }

  for (const task of setTasks) {
    if (!seenSetIds.has(task.id)) {
      await entities.ScheduleTask.delete(task.id);
      deleted += 1;
    }
  }

  return { created, updated, deleted };
}
