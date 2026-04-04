import { useMemo } from "react";
import { useQuery } from "@tanstack/react-query";
import { base44 } from "@/api/base44Client";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { PROJECT_CONTROL_CENTER_RULES, getSeverityFromScore } from "./controlCenterRules";

const ONE_DAY = 86400000;

const ENTITY_ROUTE_MAP = {
  RFI: "RFIs",
  ChangeOrder: "ChangeOrders",
  Drawing: "Drawings",
  Delivery: "Deliveries",
  Document: "Documents",
  WorkPackage: "WorkPackages",
  ScheduleTask: "Schedule",
  ActionItem: "ActionItems",
  Constraint: "Constraints",
};

function startOfToday() {
  const now = new Date();
  now.setHours(0, 0, 0, 0);
  return now;
}

function dateDiffInDays(dateString, base = startOfToday()) {
  if (!dateString) return null;
  const date = new Date(dateString);
  date.setHours(0, 0, 0, 0);
  return Math.round((date.getTime() - base.getTime()) / ONE_DAY);
}

function normalizeString(value) {
  return String(value || "").trim();
}

function lower(value) {
  return normalizeString(value).toLowerCase();
}

function money(value) {
  return Number(value) || 0;
}

function pickFirstDate(...values) {
  return values.find(Boolean) || null;
}

function pickOwner(record, fallback = "Project Manager") {
  return record?.owner || record?.assigned_to || record?.assignedTo || record?.responsible_party || record?.ball_in_court || fallback;
}

function buildLinkedRecord(entityType, record, label) {
  return {
    entityType,
    entityId: record?.id,
    label,
    route: ENTITY_ROUTE_MAP[entityType] || "Dashboard",
  };
}

function classifyPhase(record, projectPhase) {
  const raw = record?.phase || record?.project_phase || record?.discipline || record?.delivery_type || projectPhase || "Detailing";
  const normalized = lower(raw);
  if (normalized.includes("detail")) return "Detailing";
  if (normalized.includes("procure")) return "Procurement";
  if (normalized.includes("fabric")) return "Fabrication";
  if (normalized.includes("deliver")) return "Delivery";
  if (normalized.includes("erect") || normalized.includes("install")) return "Installation";
  if (normalized.includes("close")) return "Closeout";
  if (normalized.includes("pre")) return "Preconstruction";
  return raw;
}

function hasKeyword(record, keywords) {
  const haystack = [record?.title, record?.subject, record?.description, record?.notes, record?.reason, record?.impact_summary]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  return keywords.some((keyword) => haystack.includes(keyword));
}

function staleUpdateScore(record) {
  const updated = pickFirstDate(record?.updated_date, record?.last_updated_date, record?.created_date);
  const age = updated ? Math.abs(dateDiffInDays(updated)) : null;
  if (age == null) return 0;
  if (age >= 14) return PROJECT_CONTROL_CENTER_RULES.priorityWeights.staleUpdateBandHigh;
  if (age >= 7) return PROJECT_CONTROL_CENTER_RULES.priorityWeights.staleUpdateBandLow;
  return 0;
}

function exposureScore(amount) {
  if (amount >= 50000) return PROJECT_CONTROL_CENTER_RULES.priorityWeights.costExposureBandHigh;
  if (amount >= 10000) return PROJECT_CONTROL_CENTER_RULES.priorityWeights.costExposureBandMedium;
  if (amount > 0) return PROJECT_CONTROL_CENTER_RULES.priorityWeights.costExposureBandLow;
  return 0;
}

function buildPriorityItem({ title, category, entityType, record, reason, score, dueDate, owner, status, phase, quickActionLabel }) {
  return {
    id: `${entityType}-${record.id}`,
    title,
    category,
    reason,
    score,
    severity: getSeverityFromScore(score),
    dueDate,
    owner,
    status,
    phase,
    route: ENTITY_ROUTE_MAP[entityType] || "Dashboard",
    linkedRecords: [buildLinkedRecord(entityType, record, title)],
    quickActionLabel,
  };
}

function buildRiskItem({ title, category, score, impactSummary, owner, dueDate, linkedRecords, mitigationStatus, phase, status }) {
  return {
    id: `${category}-${linkedRecords[0]?.entityId || title}`,
    title,
    category,
    severity: getSeverityFromScore(score),
    score,
    impactSummary,
    owner,
    dueDate,
    linkedRecords,
    mitigationStatus,
    phase,
    status,
  };
}

function buildWaitingItem({ title, waitingOn, ageDays, impact, entityType, record, latestUpdate, followUpAction, phase }) {
  return {
    id: `waiting-${entityType}-${record.id}`,
    title,
    waitingOn,
    ageDays,
    impact,
    latestUpdate,
    linkedRecord: buildLinkedRecord(entityType, record, title),
    followUpAction,
    phase,
  };
}

function buildActionItem({ title, reason, priority, entityType, record, oneClickLabel }) {
  return {
    id: `action-${entityType}-${record.id}-${title}`,
    title,
    reason,
    priority,
    linkedRecord: buildLinkedRecord(entityType, record, title),
    route: ENTITY_ROUTE_MAP[entityType] || "Dashboard",
    oneClickLabel,
  };
}

function hasPendingApproval(record) {
  const status = lower(record?.status);
  return ["submitted", "under review", "pending", "awaiting approval", "in review"].includes(status);
}

async function loadProjectControlCenterData(projectId) {
  const [rfis, changeOrders, drawings, deliveries, costCodes, expenses, actionItems, scheduleTasks, workPackages, documents] = await Promise.all([
    base44.entities.RFI.filter({ project_id: projectId }).catch(() => []),
    base44.entities.ChangeOrder.filter({ project_id: projectId }).catch(() => []),
    base44.entities.Drawing.filter({ project_id: projectId }).catch(() => []),
    base44.entities.Delivery.filter({ project_id: projectId }).catch(() => []),
    base44.entities.CostCode.filter({ project_id: projectId }).catch(() => []),
    base44.entities.Expense.filter({ project_id: projectId }).catch(() => []),
    base44.entities.ActionItem.filter({ project_id: projectId }).catch(() => []),
    base44.entities.ScheduleTask.filter({ project_id: projectId }).catch(() => []),
    base44.entities.WorkPackage.filter({ project_id: projectId }).catch(() => []),
    base44.entities.Document.filter({ project_id: projectId }).catch(() => []),
  ]);

  return { rfis, changeOrders, drawings, deliveries, costCodes, expenses, actionItems, scheduleTasks, workPackages, documents };
}

export function useProjectControlCenterData() {
  const { activeProject } = useProjectContext();
  const query = useQuery({
    queryKey: ["project-control-center", activeProject?.id],
    enabled: Boolean(activeProject?.id),
    staleTime: 60000,
    queryFn: () => loadProjectControlCenterData(activeProject.id),
  });

  const derived = useMemo(() => {
    const today = startOfToday();
    const data = query.data;

    if (!activeProject || !data) {
      return { priorities: [], risks: [], waitingOn: [], recommendedActions: [], metrics: null, recentRevisions: [], overdueItems: [] };
    }

    const priorities = [];
    const risks = [];
    const waitingOn = [];
    const recommendedActions = [];
    const overdueItems = [];

    data.rfis.forEach((rfi) => {
      const dueDate = pickFirstDate(rfi.date_required, rfi.due_date);
      const dueDiff = dateDiffInDays(dueDate, today);
      const overdueDays = dueDiff != null && dueDiff < 0 ? Math.abs(dueDiff) : 0;
      const open = !["answered", "closed"].includes(lower(rfi.status));
      if (!open) return;

      let score = overdueDays * PROJECT_CONTROL_CENTER_RULES.priorityWeights.overdueDay;
      if (dueDiff != null && dueDiff >= 0 && dueDiff <= 3) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.dueWithinThreeDays;
      if (hasKeyword(rfi, ["fabrication", "shop", "detail", "detailing"])) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksFabrication;
      if (hasKeyword(rfi, ["erection", "field", "install", "embed", "connection"])) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksErection;
      if (["gc", "engineer", "architect", "contractor"].includes(lower(rfi.ball_in_court))) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.pendingExternalResponse;
      score += staleUpdateScore(rfi);

      const title = `RFI ${rfi.rfi_number || rfi.id} · ${rfi.title || "Unresolved RFI"}`;
      const owner = pickOwner(rfi, rfi.ball_in_court || "Project Manager");
      const phase = classifyPhase(rfi, activeProject.phase);
      const reasonParts = [];
      if (overdueDays > 0) reasonParts.push(`${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`);
      if (hasKeyword(rfi, ["fabrication", "shop", "detail", "detailing"])) reasonParts.push("blocking detailing / fabrication");
      if (hasKeyword(rfi, ["erection", "field", "install", "embed", "connection"])) reasonParts.push("field / erection impact");
      if (["gc", "engineer", "architect", "contractor"].includes(lower(rfi.ball_in_court))) reasonParts.push(`waiting on ${rfi.ball_in_court}`);
      const reason = reasonParts.join(" · ") || "Open project question needs closure";

      priorities.push(buildPriorityItem({ title, category: "RFI", entityType: "RFI", record: rfi, reason, score, dueDate, owner, status: rfi.status || "Open", phase, quickActionLabel: "Open RFI Hub" }));

      if (["gc", "engineer", "architect", "contractor"].includes(lower(rfi.ball_in_court))) {
        waitingOn.push(
          buildWaitingItem({
            title,
            waitingOn: `Waiting On ${rfi.ball_in_court}`,
            ageDays: Math.abs(dateDiffInDays(pickFirstDate(rfi.created_date, rfi.updated_date), today) || 0),
            impact: hasKeyword(rfi, ["fabrication", "shop", "detail", "detailing"])
              ? "Fabrication blocked"
              : hasKeyword(rfi, ["erection", "field", "install"])
              ? "Erection / field sequencing risk"
              : "Coordination response pending",
            entityType: "RFI",
            record: rfi,
            latestUpdate: pickFirstDate(rfi.updated_date, rfi.created_date),
            followUpAction: `Send follow-up to ${rfi.ball_in_court}`,
            phase,
          })
        );
      }

      recommendedActions.push(buildActionItem({ title: overdueDays > 0 ? "Send follow-up on overdue RFI" : "Review open RFI status", reason, priority: getSeverityFromScore(score), entityType: "RFI", record: rfi, oneClickLabel: "Open RFI" }));

      overdueItems.push(...(overdueDays > 0 ? [{ id: `overdue-rfi-${rfi.id}`, title, type: "RFI", dueDate, owner, route: ENTITY_ROUTE_MAP.RFI }] : []));
    });

    data.changeOrders.forEach((co) => {
      const status = lower(co.status);
      if (["approved", "rejected", "void", "closed"].includes(status)) return;

      const dueDate = pickFirstDate(co.required_date, co.due_date, co.updated_date);
      const amount = money(co.co_amount || co.amount || co.value);
      let score = exposureScore(amount);
      if (status.includes("submitted") || status.includes("review")) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.approvalDependency;
      if (hasKeyword(co, ["installed", "field", "change order", "pricing"])) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksErection;
      score += staleUpdateScore(co);

      const title = `CO ${co.co_number || co.id} · ${co.title || "Pending change order"}`;
      const owner = pickOwner(co);
      const phase = classifyPhase(co, activeProject.phase);
      const reason = `${amount ? `$${amount.toLocaleString()} exposure` : "Unpriced exposure"} · ${co.status || "Pending"} approval`;

      priorities.push(buildPriorityItem({ title, category: "Change Order", entityType: "ChangeOrder", record: co, reason, score, dueDate, owner, status: co.status || "Pending", phase, quickActionLabel: "Open CO" }));
      risks.push(buildRiskItem({ title, category: "Cost Risk", score, impactSummary: amount ? `Pending commercial exposure of $${amount.toLocaleString()}` : "Pending commercial exposure not yet priced", owner, dueDate, linkedRecords: [buildLinkedRecord("ChangeOrder", co, title)], mitigationStatus: status.includes("review") ? "Awaiting approval" : "Needs pricing / action", phase, status: co.status || "Pending" }));
      recommendedActions.push(buildActionItem({ title: amount > 0 ? "Review pending change order exposure" : "Issue change order pricing request", reason, priority: getSeverityFromScore(score), entityType: "ChangeOrder", record: co, oneClickLabel: "Open CO Log" }));
    });

    data.drawings.forEach((drawing) => {
      const stage = lower(drawing.stage);
      const hasRevision = normalizeString(drawing.revision_number);
      const isReleased = ["released", "void", "superseded"].includes(stage);
      if (isReleased || !hasRevision) return;

      const dueDate = pickFirstDate(drawing.due_date, drawing.updated_date, drawing.issue_date);
      const score =
        PROJECT_CONTROL_CENTER_RULES.priorityWeights.revisionUnacknowledged +
        staleUpdateScore(drawing) +
        (hasKeyword(drawing, ["erection", "field", "embed", "connection"]) ? PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksErection : 0);
      const title = `${drawing.sheet_number || "Sheet"} · ${drawing.title || "Drawing"}`;
      const owner = pickOwner(drawing, "Detailer");
      const phase = classifyPhase(drawing, "Detailing");
      const reason = `Revision ${drawing.revision_number} is active and not released`;

      priorities.push(buildPriorityItem({ title, category: "Revision", entityType: "Drawing", record: drawing, reason, score, dueDate, owner, status: drawing.stage || "Revision", phase, quickActionLabel: "Open Drawing Log" }));
      risks.push(buildRiskItem({ title, category: "Drawing / Revision Risk", score, impactSummary: "Active revision needs acknowledgment before downstream release", owner, dueDate, linkedRecords: [buildLinkedRecord("Drawing", drawing, title)], mitigationStatus: drawing.stage || "Needs review", phase, status: drawing.stage || "Open" }));
      recommendedActions.push(buildActionItem({ title: "Review unacknowledged revision", reason, priority: getSeverityFromScore(score), entityType: "Drawing", record: drawing, oneClickLabel: "Open Drawing" }));
    });

    data.deliveries.forEach((delivery) => {
      const status = lower(delivery.status);
      if (status === "delivered") return;

      const isProcurement = lower(delivery.delivery_type) === "procurement";
      const dueDate = pickFirstDate(delivery.required_date, delivery.scheduled_date);
      const dueDiff = dateDiffInDays(dueDate, today);
      const overdueDays = dueDiff != null && dueDiff < 0 ? Math.abs(dueDiff) : 0;
      let score = overdueDays * PROJECT_CONTROL_CENTER_RULES.priorityWeights.overdueDay;
      if (isProcurement) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksDelivery;
      if (hasKeyword(delivery, ["field measure", "embed", "connection", "erection"])) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksErection;
      score += staleUpdateScore(delivery);

      const title = `${delivery.delivery_id || delivery.id} · ${delivery.description || "Delivery item"}`;
      const owner = pickOwner(delivery, delivery.vendor_name || "Vendor");
      const phase = classifyPhase(delivery, isProcurement ? "Procurement" : "Delivery");
      const reason = overdueDays > 0
        ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue`
        : isProcurement
        ? "Procurement item can affect release and delivery sequence"
        : "Delivery timing needs control";

      risks.push(buildRiskItem({ title, category: isProcurement ? "Procurement Risk" : "Schedule Risk", score, impactSummary: reason, owner, dueDate, linkedRecords: [buildLinkedRecord("Delivery", delivery, title)], mitigationStatus: delivery.status || "Open", phase, status: delivery.status || "Open" }));
      recommendedActions.push(buildActionItem({ title: isProcurement ? "Resolve overdue procurement item" : "Update delivery commitment", reason, priority: getSeverityFromScore(score), entityType: "Delivery", record: delivery, oneClickLabel: "Open Delivery" }));

      const waitingOnParty = delivery.ball_in_court || delivery.waiting_on;
      if (["vendor", "gc", "field"].includes(lower(waitingOnParty))) {
        waitingOn.push(
          buildWaitingItem({
            title,
            waitingOn: `Waiting On ${waitingOnParty}`,
            ageDays: Math.abs(dateDiffInDays(pickFirstDate(delivery.updated_date, delivery.created_date), today) || 0),
            impact: isProcurement ? "Material commitment / long-lead risk" : "Delivery sequence risk",
            entityType: "Delivery",
            record: delivery,
            latestUpdate: pickFirstDate(delivery.updated_date, delivery.created_date),
            followUpAction: `Confirm commitment with ${waitingOnParty}`,
            phase,
          })
        );
      }

      overdueItems.push(...(overdueDays > 0 ? [{ id: `overdue-delivery-${delivery.id}`, title, type: isProcurement ? "Procurement" : "Delivery", dueDate, owner, route: ENTITY_ROUTE_MAP.Delivery }] : []));
    });

    data.actionItems.forEach((item) => {
      const isConstraint = lower(item.category) === "constraint";
      const status = lower(item.status);
      if (["complete", "closed", "resolved"].includes(status)) return;

      const dueDate = pickFirstDate(item.due_date, item.updated_date);
      const dueDiff = dateDiffInDays(dueDate, today);
      const overdueDays = dueDiff != null && dueDiff < 0 ? Math.abs(dueDiff) : 0;
      const owner = pickOwner(item);
      const phase = classifyPhase(item, activeProject.phase);
      let score = overdueDays * PROJECT_CONTROL_CENTER_RULES.priorityWeights.overdueDay;
      if (isConstraint || hasKeyword(item, ["field", "embed", "connection", "layout"])) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.unresolvedFieldIssue;
      score += staleUpdateScore(item);

      const title = item.title || "Open action item";
      const entityType = isConstraint ? "Constraint" : "ActionItem";
      const reason = overdueDays > 0 ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue` : isConstraint ? "Open project constraint needs resolution" : "Open action item needs closure";

      priorities.push(buildPriorityItem({ title, category: isConstraint ? "Constraint" : "Action Item", entityType, record: item, reason, score, dueDate, owner, status: item.status || "Open", phase, quickActionLabel: isConstraint ? "Open Constraint Log" : "Open Action Item" }));
      risks.push(buildRiskItem({ title, category: isConstraint ? "Field Coordination Risk" : "Schedule Risk", score, impactSummary: reason, owner, dueDate, linkedRecords: [buildLinkedRecord(entityType, item, title)], mitigationStatus: item.status || "Open", phase, status: item.status || "Open" }));

      const waitingOnParty = item.ball_in_court || item.waiting_on;
      if (["gc", "engineer", "architect", "detailer", "shop", "field", "vendor"].includes(lower(waitingOnParty))) {
        waitingOn.push(
          buildWaitingItem({
            title,
            waitingOn: `Waiting On ${waitingOnParty}`,
            ageDays: Math.abs(dateDiffInDays(pickFirstDate(item.updated_date, item.created_date), today) || 0),
            impact: isConstraint ? "Constraint blocking work" : "Pending follow-up / handoff",
            entityType,
            record: item,
            latestUpdate: pickFirstDate(item.updated_date, item.created_date),
            followUpAction: `Follow up with ${waitingOnParty}`,
            phase,
          })
        );
      }

      overdueItems.push(...(overdueDays > 0 ? [{ id: `overdue-action-${item.id}`, title, type: isConstraint ? "Constraint" : "Action Item", dueDate, owner, route: ENTITY_ROUTE_MAP[entityType] }] : []));
    });

    data.documents.forEach((document) => {
      const status = lower(document.status);
      if (!["submitted", "under review", "pending", "draft", "awaiting approval"].includes(status)) return;

      const dueDate = pickFirstDate(document.due_date, document.required_date, document.updated_date);
      const dueDiff = dateDiffInDays(dueDate, today);
      const overdueDays = dueDiff != null && dueDiff < 0 ? Math.abs(dueDiff) : 0;
      let score = overdueDays * PROJECT_CONTROL_CENTER_RULES.priorityWeights.overdueDay;
      score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.approvalDependency;
      if (hasKeyword(document, ["shop drawing", "submittal", "approval", "review"])) {
        score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksFabrication;
      }
      score += staleUpdateScore(document);

      const title = `${document.document_number || document.id} · ${document.title || document.name || "Pending document"}`;
      const owner = pickOwner(document, "Project Manager");
      const phase = classifyPhase(document, activeProject.phase);
      const reason = overdueDays > 0
        ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} overdue and still awaiting review`
        : "Approval / submittal workflow still open";

      priorities.push(buildPriorityItem({
        title,
        category: "Submittal / Approval",
        entityType: "Document",
        record: document,
        reason,
        score,
        dueDate,
        owner,
        status: document.status || "Pending",
        phase,
        quickActionLabel: "Open Document",
      }));

      risks.push(buildRiskItem({
        title,
        category: "Approval Risk",
        score,
        impactSummary: hasKeyword(document, ["shop drawing", "fabrication"]) ? "Pending document approval can hold detailing or fabrication release." : "Pending document approval still needs action.",
        owner,
        dueDate,
        linkedRecords: [buildLinkedRecord("Document", document, title)],
        mitigationStatus: document.status || "Pending",
        phase,
        status: document.status || "Pending",
      }));

      recommendedActions.push(buildActionItem({
        title: overdueDays > 0 ? "Escalate approval delay" : "Review pending submittal status",
        reason,
        priority: getSeverityFromScore(score),
        entityType: "Document",
        record: document,
        oneClickLabel: "Open Documents",
      }));

      if (["gc", "engineer", "architect"].includes(lower(document.ball_in_court || document.waiting_on))) {
        const waitingOnParty = document.ball_in_court || document.waiting_on;
        waitingOn.push(
          buildWaitingItem({
            title,
            waitingOn: `Waiting On ${waitingOnParty}`,
            ageDays: Math.abs(dateDiffInDays(pickFirstDate(document.updated_date, document.created_date), today) || 0),
            impact: "Approval dependency is still unresolved.",
            entityType: "Document",
            record: document,
            latestUpdate: pickFirstDate(document.updated_date, document.created_date),
            followUpAction: `Follow up with ${waitingOnParty}`,
            phase,
          })
        );
      }

      overdueItems.push(...(overdueDays > 0 ? [{
        id: `overdue-document-${document.id}`,
        title,
        type: "Submittal",
        dueDate,
        owner,
        route: ENTITY_ROUTE_MAP.Document,
      }] : []));
    });

    data.scheduleTasks.forEach((task) => {
      const status = lower(task.status);
      if (["complete", "done", "closed"].includes(status)) return;

      const dueDate = pickFirstDate(task.finish_date, task.end_date, task.due_date);
      const startDate = pickFirstDate(task.start_date);
      const dueDiff = dateDiffInDays(dueDate, today);
      const overdueDays = dueDiff != null && dueDiff < 0 ? Math.abs(dueDiff) : 0;
      let score = overdueDays * PROJECT_CONTROL_CENTER_RULES.priorityWeights.overdueDay;
      if (task.is_critical_path || lower(task.critical_path) === "true") score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.criticalPathTask;
      else if (task.float_days != null && Number(task.float_days) <= 3) score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.nearCriticalTask;
      score += staleUpdateScore(task);

      const title = `${task.task_id || task.wbs_code || task.id} · ${task.name || task.title || "Schedule task"}`;
      const owner = pickOwner(task, "Project Manager");
      const phase = classifyPhase(task, activeProject.phase);
      const reason = overdueDays > 0 ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} behind schedule` : task.is_critical_path || lower(task.critical_path) === "true" ? "On critical path" : "Near-critical schedule activity";

      risks.push(buildRiskItem({ title, category: "Schedule Risk", score, impactSummary: reason, owner, dueDate, linkedRecords: [buildLinkedRecord("ScheduleTask", task, title)], mitigationStatus: task.status || "Open", phase, status: task.status || "Open" }));
      recommendedActions.push(buildActionItem({ title: overdueDays > 0 ? "Update fabrication completion date" : "Review critical schedule task", reason, priority: getSeverityFromScore(score), entityType: "ScheduleTask", record: task, oneClickLabel: "Open Schedule" }));
      overdueItems.push(...(overdueDays > 0 ? [{ id: `overdue-task-${task.id}`, title, type: "Task", dueDate, owner, route: ENTITY_ROUTE_MAP.ScheduleTask }] : []));

      if (startDate && dateDiffInDays(startDate, today) <= 3 && hasKeyword(task, ["field measure", "measure"])) {
        recommendedActions.push(buildActionItem({ title: "Confirm field measure before release", reason: "Upcoming scheduled work still depends on field verification", priority: "High", entityType: "ScheduleTask", record: task, oneClickLabel: "Open Schedule" }));
      }
    });

    data.workPackages.forEach((workPackage) => {
      const status = lower(workPackage.status);
      if (["complete", "closed"].includes(status)) return;

      const phase = classifyPhase(workPackage, workPackage.phase || activeProject.phase);
      const dueDate = pickFirstDate(workPackage.required_date, workPackage.end_date, workPackage.due_date, workPackage.updated_date);
      const dueDiff = dateDiffInDays(dueDate, today);
      const overdueDays = dueDiff != null && dueDiff < 0 ? Math.abs(dueDiff) : 0;
      const percentComplete = Number(workPackage.percent_complete) || 0;
      let score = overdueDays * PROJECT_CONTROL_CENTER_RULES.priorityWeights.overdueDay;
      if (phase === "Fabrication" && percentComplete < 100) {
        score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksFabrication;
      }
      if (phase === "Installation" && percentComplete < 100) {
        score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.blocksErection;
      }
      if (dueDiff != null && dueDiff >= 0 && dueDiff <= 3 && percentComplete < 75) {
        score += PROJECT_CONTROL_CENTER_RULES.priorityWeights.dueWithinThreeDays;
      }
      score += staleUpdateScore(workPackage);

      if (score === 0) return;

      const title = `${workPackage.wp_number || workPackage.id} · ${workPackage.name || "Work package"}`;
      const owner = pickOwner(workPackage, "Project Manager");
      const reason = overdueDays > 0
        ? `${overdueDays} day${overdueDays === 1 ? "" : "s"} late with ${percentComplete}% complete`
        : `${percentComplete}% complete with near-term phase pressure`;

      risks.push(buildRiskItem({
        title,
        category: phase === "Fabrication" ? "Schedule Risk" : "Field Coordination Risk",
        score,
        impactSummary: reason,
        owner,
        dueDate,
        linkedRecords: [buildLinkedRecord("WorkPackage", workPackage, title)],
        mitigationStatus: workPackage.status || "Open",
        phase,
        status: workPackage.status || "Open",
      }));

      recommendedActions.push(buildActionItem({
        title: phase === "Fabrication" ? "Review fabrication slippage" : "Notify superintendent of impacted sequence",
        reason,
        priority: getSeverityFromScore(score),
        entityType: "WorkPackage",
        record: workPackage,
        oneClickLabel: "Open Work Packages",
      }));
    });

    const costBudget = data.costCodes.reduce((sum, code) => sum + money(code.revised_budget || code.budget), 0);
    const committedCost = data.costCodes.reduce((sum, code) => sum + money(code.committed_cost), 0);
    const actualCost = data.expenses.reduce((sum, expense) => sum + money(expense.amount), 0);
    const potentialCOExposure = data.changeOrders.filter((co) => !["approved", "closed", "void"].includes(lower(co.status))).reduce((sum, co) => sum + money(co.co_amount || co.amount), 0);

    const fabPackages = data.workPackages.filter((wp) => lower(wp.phase).includes("fabric") || lower(wp.phase).includes("shop"));
    const fabCompletionPercentage = fabPackages.length ? Math.round(fabPackages.reduce((sum, wp) => sum + (Number(wp.percent_complete) || 0), 0) / fabPackages.length) : 0;
    const erectionPackages = data.workPackages.filter((wp) => lower(wp.phase).includes("erect") || lower(wp.phase).includes("install"));
    const erectionProgressPercentage = erectionPackages.length ? Math.round(erectionPackages.reduce((sum, wp) => sum + (Number(wp.percent_complete) || 0), 0) / erectionPackages.length) : 0;

    const recentRevisions = data.drawings
      .filter((drawing) => normalizeString(drawing.revision_number))
      .sort((a, b) => new Date(pickFirstDate(b.updated_date, b.issue_date) || 0) - new Date(pickFirstDate(a.updated_date, a.issue_date) || 0))
      .slice(0, 6)
      .map((drawing) => ({
        id: drawing.id,
        title: `${drawing.sheet_number || "Sheet"} · ${drawing.title || "Drawing"}`,
        revision: drawing.revision_number,
        stage: drawing.stage || "Open",
        updatedDate: pickFirstDate(drawing.updated_date, drawing.issue_date),
        route: ENTITY_ROUTE_MAP.Drawing,
      }));

    const sortedRisks = [...risks].sort((a, b) => b.score - a.score);
    const metrics = {
      openRFIs: data.rfis.filter((rfi) => !["answered", "closed"].includes(lower(rfi.status))).length,
      overdueRFIs: overdueItems.filter((item) => item.type === "RFI").length,
      pendingSubmittals: data.documents.filter((doc) => hasPendingApproval(doc) || lower(doc.status) === "draft").length,
      pendingChangeOrders: data.changeOrders.filter((co) => !["approved", "closed", "void"].includes(lower(co.status))).length,
      potentialCOExposure,
      committedCostVsBudget: `$${committedCost.toLocaleString()} / $${costBudget.toLocaleString()}`,
      actualCostVsBudget: `$${actualCost.toLocaleString()} / $${costBudget.toLocaleString()}`,
      fabCompletionPercentage,
      erectionProgressPercentage,
      overdueTasks: overdueItems.filter((item) => item.type === "Task").length,
      unresolvedRevisions: recentRevisions.filter((revision) => !["Released", "Superseded", "Void"].includes(revision.stage)).length,
      hottestRiskThisWeek: sortedRisks[0]?.title || "No acute risks",
    };

    return {
      priorities: priorities.sort((a, b) => b.score - a.score).slice(0, 12),
      risks: sortedRisks.slice(0, 24),
      waitingOn: waitingOn.sort((a, b) => b.ageDays - a.ageDays).slice(0, 24),
      recommendedActions: recommendedActions
        .sort((a, b) => {
          const order = { Critical: 4, High: 3, Medium: 2, Low: 1 };
          return (order[b.priority] || 0) - (order[a.priority] || 0);
        })
        .slice(0, 12),
      metrics,
      recentRevisions,
      overdueItems: overdueItems.sort((a, b) => new Date(a.dueDate || 0) - new Date(b.dueDate || 0)).slice(0, 12),
    };
  }, [activeProject, query.data]);

  return { activeProject, ...query, ...derived };
}
