import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const [projects, allWorkPackages] = await Promise.all([
      base44.entities.Project.list(),
      base44.entities.WorkPackage.list(),
    ]);

    const updates = [];

    for (const project of projects) {
      const wps = allWorkPackages.filter(wp => wp.project_id === project.id);
      if (wps.length === 0) continue;

      // Weighted progress by tonnage (falls back to simple avg)
      const totalTonnage = wps.reduce((s, wp) => s + (Number(wp.tonnage) || 0), 0);
      let projectProgress;
      if (totalTonnage > 0) {
        const weightedSum = wps.reduce((s, wp) => {
          return s + ((Number(wp.tonnage) || 0) * (Number(wp.percent_complete) || 0));
        }, 0);
        projectProgress = Math.round(weightedSum / totalTonnage);
      } else {
        projectProgress = Math.round(wps.reduce((s, wp) => s + (Number(wp.percent_complete) || 0), 0) / wps.length);
      }
      projectProgress = Math.min(100, Math.max(0, projectProgress));

      // Determine phase from active WP work
      const allComplete = wps.every(wp => wp.status === "Complete");
      const anyErection = wps.some(wp => wp.phase === "Erection" && wp.status === "In Progress");
      const anyFabrication = wps.some(wp => wp.phase === "Fabrication" && wp.status === "In Progress");
      const anyInProgress = wps.some(wp => wp.status === "In Progress");

      let newPhase = project.phase;
      if (allComplete) newPhase = "Closeout";
      else if (anyErection) newPhase = "Erection";
      else if (anyFabrication) newPhase = "Fabrication";
      else if (anyInProgress) newPhase = "Detailing";

      // Health status from labor overruns
      const laborOverruns = wps.filter(wp => {
        const budget = (Number(wp.shop_hours_budget) || 0) + (Number(wp.field_hours_budget) || 0);
        const actual = (Number(wp.shop_hours_actual) || 0) + (Number(wp.field_hours_actual) || 0);
        return budget > 0 && actual > budget * 1.1;
      });
      const criticalOverruns = wps.filter(wp => {
        const budget = (Number(wp.shop_hours_budget) || 0) + (Number(wp.field_hours_budget) || 0);
        const actual = (Number(wp.shop_hours_actual) || 0) + (Number(wp.field_hours_actual) || 0);
        return budget > 0 && actual > budget * 1.25;
      });
      const delayedWPs = wps.filter(wp => wp.status === "On Hold");

      let newHealth = "On Track";
      if (criticalOverruns.length > 0 || delayedWPs.length >= 2) newHealth = "At Risk";
      else if (laborOverruns.length > 0 || delayedWPs.length > 0) newHealth = "Watch";

      const hasChanged = newPhase !== project.phase || newHealth !== project.health_status;

      if (hasChanged) {
        try {
          await base44.entities.Project.update(project.id, { phase: newPhase, health_status: newHealth });
          updates.push({ project_id: project.id, project_name: project.name, project_number: project.project_number, wp_count: wps.length, progress: projectProgress, phase: newPhase, health: newHealth, labor_overruns: laborOverruns.length, changed: true });
        } catch (err) {
          updates.push({ project_id: project.id, project_name: project.name, error: err.message, changed: false });
        }
      } else {
        updates.push({ project_id: project.id, project_name: project.name, project_number: project.project_number, wp_count: wps.length, progress: projectProgress, phase: newPhase, health: newHealth, changed: false });
      }
    }

    return Response.json({ processed: projects.length, updated: updates.filter(u => u.changed).length, results: updates, timestamp: new Date().toISOString() });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});