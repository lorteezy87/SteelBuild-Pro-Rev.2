const APPROVED_STAGES = [
  "Released",
  "IFC",
  "Issued for Construction",
  "FFF",
  "BFS",
  "Approved",
];

export const validateWPCreate = (wp, linkedDrawings, projectDrawings = []) => {
  const errors = [];

  if (!linkedDrawings || linkedDrawings.length === 0) {
    errors.push({
      field: "linkedDrawings",
      message:
        "At least one drawing must be linked before creating a work package.",
      rule: "DRAWINGS_REQUIRED",
    });
  }

  const validDrawings = linkedDrawings?.filter((id) =>
    projectDrawings.some((d) => d.id === id)
  );

  if (validDrawings?.length !== linkedDrawings?.length) {
    errors.push({
      field: "linkedDrawings",
      message: "One or more linked drawings not found in this project.",
      rule: "DRAWING_NOT_FOUND",
    });
  }

  return errors;
};

export const canStartFabrication = (wp) => {
  if (!wp.linked_drawing_ids && !wp.linkedDrawings) {
    return {
      allowed: false,
      reason: "No drawings linked to this work package.",
      action: "Link drawings first.",
    };
  }

  const hasDrawings =
    wp.linked_drawing_ids?.split(",").filter((s) => s.trim()).length > 0 ||
    (wp.linkedDrawings && wp.linkedDrawings.length > 0);

  if (!hasDrawings) {
    return {
      allowed: false,
      reason: "No drawings linked to this work package.",
      action: "Link drawings first.",
    };
  }

  const linkedIds =
    wp.linked_drawing_ids?.split(",").map((s) => s.trim()).filter(Boolean) ||
    [];
  const approvedCount = (wp.linkedDrawings || []).filter((d) =>
    APPROVED_STAGES.includes(d.stage || d.status)
  ).length;

  if (linkedIds.length > 0 && approvedCount < linkedIds.length) {
    return {
      allowed: false,
      reason: `${linkedIds.length - approvedCount} drawing(s) not yet Released`,
      action: "Wait for all linked drawings to be approved.",
    };
  }

  const validPriorStatuses = [
    "Detailing",
    "In Detailing",
    "Detailing Complete",
    "Ready for Fabrication",
    "Pending",
    "Not Started",
  ];

  const statusMatch = validPriorStatuses.some((s) =>
    wp.status?.toLowerCase().includes(s.toLowerCase())
  );

  if (!statusMatch) {
    return {
      allowed: false,
      reason:
        "Work package must complete detailing before fabrication can begin.",
      action: "Update status to Detailing Complete first.",
    };
  }

  return { allowed: true };
};

export const canScheduleDelivery = (delivery, workPackages) => {
  const linkedWPId =
    delivery.work_package_id ||
    delivery.workPackageId ||
    delivery.work_package?.id;

  if (!linkedWPId) {
    return {
      allowed: false,
      reason: "Delivery must be linked to a Work Package.",
      action: "Link a work package to this delivery.",
    };
  }

  const wp = workPackages.find((w) => w.id === linkedWPId);

  if (!wp) {
    return {
      allowed: false,
      reason: "Linked work package not found.",
      action: "Verify the work package exists.",
    };
  }

  const blockedStatuses = ["Not Started"];
  const isBlocked = blockedStatuses.some(
    (s) => wp.status?.toLowerCase() === s.toLowerCase()
  );

  if (isBlocked) {
    return {
      allowed: false,
      reason: `Work Package "${wp.name}" has not started fabrication yet.`,
      action:
        "Begin fabrication on the work package before scheduling a delivery.",
      wpName: wp.name,
      wpStatus: wp.status,
    };
  }

  return { allowed: true };
};

export const canStartInstallation = (wp, deliveries) => {
  const linkedDeliveries = deliveries.filter(
    (d) =>
      d.work_package_id === wp.id ||
      d.workPackageId === wp.id ||
      d.work_package?.id === wp.id
  );

  if (linkedDeliveries.length === 0) {
    return {
      allowed: false,
      reason: "No deliveries linked to this work package.",
      action: "Create and complete a delivery record first.",
    };
  }

  const delivered = linkedDeliveries.filter(
    (d) => d.status === "Delivered" || d.status === "Received"
  );

  if (delivered.length === 0) {
    return {
      allowed: false,
      reason: `${linkedDeliveries.length} delivery record(s) exist but none are marked Delivered yet.`,
      action: "Mark delivery as Delivered before starting installation.",
      deliveries: linkedDeliveries.map((d) => ({
        name: d.description || "DEL-" + d.delivery_id,
        status: d.status,
      })),
    };
  }

  return { allowed: true };
};

export const getWorkflowStatus = (wp, drawings = [], deliveries = []) => {
  const hasDrawings =
    wp.linked_drawing_ids?.split(",").filter((s) => s.trim()).length > 0;

  if (!hasDrawings) {
    return {
      step: "Drawings",
      blocked: true,
      message: "No drawings linked",
    };
  }

  const linkedIds =
    wp.linked_drawing_ids?.split(",").map((s) => s.trim()).filter(Boolean) ||
    [];
  const approvedDrawingCount = drawings.filter(
    (d) => linkedIds.includes(d.id) && APPROVED_STAGES.includes(d.stage || d.status)
  ).length;

  if (linkedIds.length > 0 && approvedDrawingCount < linkedIds.length) {
    return {
      step: "Drawings Pending",
      blocked: true,
      message: `${linkedIds.length - approvedDrawingCount} drawing(s) not yet Released`,
    };
  }

  if (
    wp.phase === "Erection" ||
    wp.phase === "Delivery" ||
    wp.status?.toLowerCase().includes("install")
  ) {
    const delivered = deliveries.filter(
      (d) =>
        d.work_package_id === wp.id &&
        (d.status === "Delivered" || d.status === "Received")
    );
    if (!delivered.length) {
      return {
        step: "Delivery",
        blocked: true,
        message: "No delivery confirmed",
      };
    }
  }

  return {
    step: wp.status || wp.phase,
    blocked: false,
    message: "On track",
  };
};

export const getDraftDrawingsWarning = (linkedDrawingIds, allDrawings) => {
  if (!linkedDrawingIds) return null;

  const ids = Array.isArray(linkedDrawingIds)
    ? linkedDrawingIds
    : String(linkedDrawingIds)
        .split(",")
        .map((s) => s.trim())
        .filter(Boolean);

  const draftDrawings = allDrawings.filter(
    (drawing) =>
      ids.includes(drawing.id) &&
      !APPROVED_STAGES.includes(drawing.stage || drawing.status)
  );

  if (!draftDrawings.length) return null;

  return {
    count: draftDrawings.length,
    message: `${draftDrawings.length} linked drawing(s) are not yet released.`,
    drawings: draftDrawings,
  };
};
