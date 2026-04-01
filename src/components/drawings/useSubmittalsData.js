import { useCallback, useEffect, useState } from "react";
import { base44 } from "@/api/base44Client";
import { clearPersistedAssignment, getPersistedAssignment } from "./submittalsAssignments";
import { getDrawingSetName, PLACEHOLDER_SET_NAMES, UNASSIGNED_KEY } from "./submittalsUtils";

export function useSubmittalsData({ activeProject, pendingSetAssignmentsRef }) {
  const [drawings, setDrawings] = useState([]);
  const [drawingSets, setDrawingSets] = useState([]);
  const [projects, setProjects] = useState([]);
  const [loading, setLoading] = useState(false);

  const loadDrawings = useCallback(async () => {
    if (!activeProject?.id) {
      setDrawings([]);
      setDrawingSets([]);
      return;
    }

    setLoading(true);
    try {
      const [data, sets] = await Promise.all([
        base44.entities.Drawing.filter({ project_id: activeProject.id }, "-created_date"),
        base44.entities.DrawingSet.filter({ project_id: activeProject.id }, "-created_date").catch(() => []),
      ]);

      const normalizedDrawings = data.map((drawing) => {
        const explicitSetName = String(drawing?.drawing_set_name || "").trim();
        const pendingSetName = String(pendingSetAssignmentsRef.current.get(drawing?.id) || "").trim();
        const persistedSetName = String(getPersistedAssignment(activeProject?.id, drawing) || "").trim();
        const explicitIsValid = explicitSetName && !PLACEHOLDER_SET_NAMES.has(explicitSetName.toLowerCase());
        const pendingIsValid = pendingSetName && !PLACEHOLDER_SET_NAMES.has(pendingSetName.toLowerCase());
        const persistedIsValid = persistedSetName && !PLACEHOLDER_SET_NAMES.has(persistedSetName.toLowerCase());
        const effectiveSetName = explicitIsValid
          ? explicitSetName
          : pendingIsValid
            ? pendingSetName
            : persistedIsValid
              ? persistedSetName
              : "";
        const recoveredSetName = getDrawingSetName(
          effectiveSetName && effectiveSetName !== explicitSetName
            ? { ...drawing, drawing_set_name: effectiveSetName }
            : drawing,
          sets
        );

        if (explicitSetName === pendingSetName && explicitSetName) {
          pendingSetAssignmentsRef.current.delete(drawing.id);
        }
        if (explicitIsValid) {
          clearPersistedAssignment(activeProject?.id, drawing);
        }

        if (effectiveSetName && effectiveSetName !== explicitSetName) {
          return { ...drawing, drawing_set_name: effectiveSetName };
        }

        if (
          recoveredSetName !== UNASSIGNED_KEY &&
          (!explicitSetName || PLACEHOLDER_SET_NAMES.has(explicitSetName.toLowerCase()))
        ) {
          return { ...drawing, drawing_set_name: recoveredSetName };
        }

        return drawing;
      });

      setDrawings(normalizedDrawings);
      setDrawingSets(sets);

      const drawingsToRepair = normalizedDrawings.filter((drawing, index) => {
        const originalSetName = String(data[index]?.drawing_set_name || "").trim();
        const normalizedSetName = String(drawing?.drawing_set_name || "").trim();
        return drawing?.id && normalizedSetName && normalizedSetName !== originalSetName;
      });

      if (drawingsToRepair.length) {
        Promise.allSettled(
          drawingsToRepair.map((drawing) =>
            base44.entities.Drawing.update(drawing.id, { drawing_set_name: drawing.drawing_set_name })
          )
        ).catch(() => {});
      }
    } finally {
      setLoading(false);
    }
  }, [activeProject?.id, pendingSetAssignmentsRef]);

  useEffect(() => {
    base44.entities.Project.list().then(setProjects);
  }, []);

  return {
    drawings,
    setDrawings,
    drawingSets,
    setDrawingSets,
    projects,
    loading,
    loadDrawings,
  };
}
