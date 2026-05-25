import type { ParsedMppTask } from "./types";

export const PHASE_NAME_MAP: Record<string, string> = {
  DETAILING: "Detailing",
  FABRICATION: "Fabrication",
  DELIVERY: "Delivery",
  EQUIPMENT: "Procurement",
  INSTALLATION: "Installation",
  "INSTALLATION/ERECTION": "Installation",
  ERECTION: "Installation",
  CLOSEOUT: "Closeout",
  "PRE-CONSTRUCTION": "Pre-Construction",
  PROCUREMENT: "Procurement",
};

export function parseMsProjectXml(xml: string): ParsedMppTask[] {
  const doc = new DOMParser().parseFromString(xml, "text/xml");
  const taskNodes = Array.from(doc.getElementsByTagName("Task"));

  // Build resource map: UID → name
  const resourceMap: Record<string, string> = {};
  Array.from(doc.getElementsByTagName("Resource")).forEach((r) => {
    const rUid = r.getElementsByTagName("UID")[0]?.textContent;
    const rName = r.getElementsByTagName("Name")[0]?.textContent;
    if (rUid && rName) resourceMap[rUid] = rName;
  });

  // Build assignment map: TaskUID → [resource names]
  const assignmentMap: Record<string, string[]> = {};
  Array.from(doc.getElementsByTagName("Assignment")).forEach((a) => {
    const tUid = a.getElementsByTagName("TaskUID")[0]?.textContent;
    const rUid = a.getElementsByTagName("ResourceUID")[0]?.textContent;
    if (tUid && rUid && resourceMap[rUid]) {
      if (!assignmentMap[tUid]) assignmentMap[tUid] = [];
      assignmentMap[tUid].push(resourceMap[rUid]);
    }
  });

  const tasks: ParsedMppTask[] = [];
  taskNodes.forEach((node) => {
    const uid = node.getElementsByTagName("UID")[0]?.textContent;
    if (!uid || uid === "0") return; // skip root project summary
    const isSummary = node.getElementsByTagName("Summary")[0]?.textContent === "1";
    const outlineLevel = Number(node.getElementsByTagName("OutlineLevel")[0]?.textContent) || 0;
    const outlineNumber = node.getElementsByTagName("OutlineNumber")[0]?.textContent || "";
    const name = node.getElementsByTagName("Name")[0]?.textContent || "Task";
    const start = node.getElementsByTagName("Start")[0]?.textContent?.slice(0, 10) || null;
    const finish = node.getElementsByTagName("Finish")[0]?.textContent?.slice(0, 10) || null;
    const pct = Number(node.getElementsByTagName("PercentComplete")[0]?.textContent) || 0;
    const milestone = node.getElementsByTagName("Milestone")[0]?.textContent === "1";
    const durationStr = node.getElementsByTagName("Duration")[0]?.textContent || "";
    // MS Project duration is like "PT48H0M0S" — extract hours and convert to days
    const durationMatch = durationStr.match(/PT(\d+)H/);
    const durationDays = durationMatch ? Math.round(Number(durationMatch[1]) / 8) : null;
    const notes = node.getElementsByTagName("Notes")[0]?.textContent || "";
    const preds = Array.from(node.getElementsByTagName("PredecessorLink")).map((p) => {
      const predUid = p.getElementsByTagName("PredecessorUID")[0]?.textContent;
      const linkType = p.getElementsByTagName("Type")[0]?.textContent; // 0=FF, 1=FS, 2=SF, 3=SS
      const lagDuration = p.getElementsByTagName("LinkLag")[0]?.textContent; // in tenths of minutes
      return { predUid, linkType: linkType || "1", lagDuration: lagDuration || "0" };
    }).filter((p) => p.predUid);
    const resources = assignmentMap[uid] || [];
    tasks.push({ uid, name, start, finish, pct, preds, isSummary, outlineLevel, outlineNumber, milestone, durationDays, resources, notes });
  });
  return tasks;
}

/**
 * Derive phase from the WBS hierarchy.
 * If the task's parent summary task name matches a known phase, use it.
 * Otherwise fall back to the PHASES heuristic.
 */
export function derivePhaseFromHierarchy(task: ParsedMppTask, allParsed: ParsedMppTask[]): string | null {
  // Walk up the outline levels to find the topmost summary (outline level 1)
  const ol = task.outlineLevel;
  if (ol <= 1) return task.name; // This IS a phase-level summary
  // Find the preceding summary at outline level 1
  const taskIdx = allParsed.indexOf(task);
  for (let i = taskIdx - 1; i >= 0; i--) {
    if (allParsed[i].isSummary && allParsed[i].outlineLevel === 1) {
      return allParsed[i].name;
    }
  }
  return null;
}

export function inferTaskType(name: string, isSummary: boolean, isMilestone: boolean): string {
  if (isMilestone) return "Milestone";
  if (isSummary) return "Task";
  const n = (name || "").toLowerCase();
  if (/\b(fab|fabricat|weld|cut|fit-up|shop)\b/.test(n)) return "Fabrication";
  if (/\b(deliver|ship|truck|freight|haul)\b/.test(n)) return "Delivery";
  if (/\b(erect|install|field|crane|bolt|set|rig)\b/.test(n)) return "Install";
  if (/\b(submit|drawing|detail|review|approval)\b/.test(n)) return "Submittal";
  if (/\b(rfi|request for)\b/.test(n)) return "RFI";
  return "Task";
}
