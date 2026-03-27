import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });
    if (user.role !== 'admin') return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });

    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const twoWeeksAgo = new Date(today); twoWeeksAgo.setDate(today.getDate() - 14);

    const [rfis, drawings, cos, deliveries, workPackages] = await Promise.all([
      base44.entities.RFI.list(),
      base44.entities.Drawing.list(),
      base44.entities.ChangeOrder.list(),
      base44.entities.Delivery.list(),
      base44.entities.WorkPackage.list(),
    ]);

    const newAlerts = [];

    // RFI overdue
    rfis.filter(r => r.due_date && new Date(r.due_date) < today && !['Answered','Closed'].includes(r.status)).forEach(r => {
      const days = Math.floor((today - new Date(r.due_date)) / 86400000);
      const rfiLabel = r.rfi_number ? `${r.rfi_number} — ${r.title}` : r.title;
      newAlerts.push({ alert_type: "RFI Overdue", severity: days > 14 ? "Critical" : days > 7 ? "High" : "Medium", title: `RFI Overdue: ${rfiLabel}`, message: `${rfiLabel} is ${days} day${days !== 1 ? 's' : ''} overdue. Status: ${r.status}.`, record_id: r.id, record_type: "RFI", project_id: r.project_id, project_name: r.project_name, is_read: false, is_dismissed: false });
    });

    // Drawing overdue
    drawings.filter(d => d.due_date && new Date(d.due_date) < today && d.stage !== 'Released').forEach(d => {
      const days = Math.floor((today - new Date(d.due_date)) / 86400000);
      newAlerts.push({ alert_type: "Drawing Overdue", severity: days > 14 ? "High" : "Medium", title: `Drawing Overdue: ${d.sheet_number}`, message: `${d.title} (${d.sheet_number}) is ${days} day${days !== 1 ? 's' : ''} past due. Stage: ${d.stage}.`, record_id: d.id, record_type: "Drawing", project_id: d.project_id, project_name: d.project_name, is_read: false, is_dismissed: false });
    });

    // CO pending > 14 days
    cos.filter(c => c.submitted_date && new Date(c.submitted_date) < twoWeeksAgo && ['Submitted','Under Review'].includes(c.status)).forEach(c => {
      const days = Math.floor((today - new Date(c.submitted_date)) / 86400000);
      newAlerts.push({ alert_type: "CO Pending", severity: "High", title: `CO Pending: ${c.co_number || c.title}`, message: `Change Order "${c.title}" has been pending for ${days} days with no approval.`, record_id: c.id, record_type: "ChangeOrder", project_id: c.project_id, project_name: c.project_name, is_read: false, is_dismissed: false });
    });

    // Delivery missed
    deliveries.filter(d => d.scheduled_date && new Date(d.scheduled_date) < today && !['Delivered'].includes(d.status)).forEach(d => {
      newAlerts.push({ alert_type: "Delivery Missed", severity: "High", title: `Missed Delivery: ${d.delivery_id || d.vendor}`, message: `Delivery from ${d.vendor} was scheduled for ${d.scheduled_date} and has not been received. Status: ${d.status}.`, record_id: d.id, record_type: "Delivery", project_id: d.project_id, project_name: d.project_name, is_read: false, is_dismissed: false });
    });

    // Labor over budget
    workPackages.filter(w => {
      const budget = (Number(w.shop_hours_budget) || 0) + (Number(w.field_hours_budget) || 0);
      const actual = (Number(w.shop_hours_actual) || 0) + (Number(w.field_hours_actual) || 0);
      return budget > 0 && actual > budget;
    }).forEach(w => {
      const budget = (Number(w.shop_hours_budget) || 0) + (Number(w.field_hours_budget) || 0);
      const actual = (Number(w.shop_hours_actual) || 0) + (Number(w.field_hours_actual) || 0);
      const pct = Math.round((actual / budget) * 100);
      newAlerts.push({ alert_type: "Labor Over Budget", severity: pct > 120 ? "Critical" : "High", title: `Labor Over Budget: ${w.wp_number || w.name}`, message: `Work Package "${w.name}" is at ${pct}% labor burn (${actual} actual vs ${budget} budget hours).`, record_id: w.id, record_type: "WorkPackage", project_id: w.project_id, project_name: w.project_name, is_read: false, is_dismissed: false });
    });

    // Clear old unread/undismissed alerts before inserting fresh ones
    const existingAlerts = await base44.asServiceRole.entities.Alert.list();
    const toDelete = existingAlerts.filter(a => !a.is_dismissed && !a.is_read);
    await Promise.all(toDelete.map(a => base44.asServiceRole.entities.Alert.delete(a.id)));
    // Small delay to avoid write conflicts
    await new Promise(r => setTimeout(r, 200));
    await Promise.all(newAlerts.map(a => base44.asServiceRole.entities.Alert.create(a)));

    return Response.json({ generated: newAlerts.length, alerts: newAlerts });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});