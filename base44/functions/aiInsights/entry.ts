import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) return Response.json({ error: 'Unauthorized' }, { status: 401 });

    const body = await req.json();
    const { rfis = [], costCodes = [], drawings = [], workPackages = [], pendingCOs = [] } = body;

    const today = new Date();
    const overdueRFIs = rfis.filter(r => r.due_date && new Date(r.due_date) < today && !['Answered','Closed'].includes(r.status)).map(r => ({ ...r, daysOverdue: Math.floor((today - new Date(r.due_date)) / 86400000) }));
    const overBudgetCodes = costCodes.filter(c => (Number(c.budget_amount) || 0) > 0 && ((Number(c.actual_cost) - Number(c.budget_amount)) / Number(c.budget_amount)) > 0.1);
    const overdueDrawings = drawings.filter(d => d.due_date && new Date(d.due_date) < today && d.stage !== 'Released');
    const behindWPs = workPackages.filter(w => {
      const budget = (Number(w.shop_hours_budget) || 0) + (Number(w.field_hours_budget) || 0);
      const actual = (Number(w.shop_hours_actual) || 0) + (Number(w.field_hours_actual) || 0);
      return w.status === 'In Progress' && (w.percent_complete || 0) < 50 && budget > 0 && actual > budget * 0.6;
    });

    const contextData = {
      overdueRFIs: overdueRFIs.length,
      criticalRFIs: rfis.filter(r => r.priority === 'Critical' && !['Answered','Closed'].includes(r.status)).length,
      overdueRFIDetails: overdueRFIs.slice(0, 5).map(r => `${r.rfi_number || r.title}: ${r.daysOverdue} days overdue, priority: ${r.priority}`),
      overBudgetCodes: overBudgetCodes.length,
      overBudgetDetails: overBudgetCodes.slice(0, 5).map(c => {
        const b = Number(c.budget_amount) || 0;
        const a = Number(c.actual_cost) || 0;
        const pct = b > 0 ? (((a - b) / b) * 100).toFixed(1) : '∞';
        return `${c.cost_code_number} (${c.description}): budget $${b.toLocaleString()}, actual $${a.toLocaleString()}, variance ${pct}%`;
      }),
      overdueDrawings: overdueDrawings.length,
      overdueDrawingDetails: overdueDrawings.slice(0, 5).map(d => `${d.sheet_number} (${d.title}): due ${d.due_date}, stage: ${d.stage}`),
      behindWorkPackages: behindWPs.length,
      pendingCOsCount: pendingCOs.length,
      pendingCOsValue: pendingCOs.reduce((s, c) => s + (Number(c.co_amount) || 0), 0),
      totalRFIs: rfis.length,
      totalDrawings: drawings.length,
      totalWorkPackages: workPackages.length,
    };

    const prompt = `You are a structural steel project management expert analyzing real project data. Identify risks, anomalies, and recommendations based on the data provided.

Project data summary:
- Overdue RFIs: ${contextData.overdueRFIs} (${contextData.criticalRFIs} critical)${contextData.overdueRFIDetails.length > 0 ? '\n  Details: ' + contextData.overdueRFIDetails.join('; ') : ''}
- Over-budget cost codes: ${contextData.overBudgetCodes}${contextData.overBudgetDetails.length > 0 ? '\n  Details: ' + contextData.overBudgetDetails.join('; ') : ''}
- Overdue drawings: ${contextData.overdueDrawings}${contextData.overdueDrawingDetails.length > 0 ? '\n  Details: ' + contextData.overdueDrawingDetails.join('; ') : ''}
- Work packages behind schedule: ${contextData.behindWorkPackages}
- Pending change orders: ${contextData.pendingCOsCount} (total value: $${contextData.pendingCOsValue?.toLocaleString()})
- Total RFIs: ${contextData.totalRFIs}, Drawings: ${contextData.totalDrawings}, Work Packages: ${contextData.totalWorkPackages}

Provide 2-4 items per category. Be specific and actionable. Focus on steel fabrication and erection project management concerns.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
      response_json_schema: {
        type: "object",
        properties: {
          risks: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                severity: { type: "string" },
                category: { type: "string" }
              }
            }
          },
          recommendations: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                severity: { type: "string" },
                category: { type: "string" }
              }
            }
          },
          anomalies: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                severity: { type: "string" },
                category: { type: "string" }
              }
            }
          },
          positives: {
            type: "array",
            items: {
              type: "object",
              properties: {
                title: { type: "string" },
                description: { type: "string" },
                severity: { type: "string" },
                category: { type: "string" }
              }
            }
          }
        }
      }
    });

    return Response.json({ insights: result, contextData });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});