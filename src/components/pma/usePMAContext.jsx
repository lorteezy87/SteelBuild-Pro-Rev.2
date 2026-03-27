import React, { createContext, useContext, useState, useEffect, useCallback } from 'react';
import { base44 } from '@/api/base44Client';

import { useProjectContext } from '@/components/shared/useProjectContext';
import { generateSessionId, createAuditRecord, runPolicyChecks } from './auditUtils';

const PMAContext = createContext();

export function PMAProvider({ children }) {
  const { activeProject } = useProjectContext();

  // ── 1. ALL STATE FIRST ──────────────────────────────────────
  const [isOpen, setIsOpen] = useState(false);
  const [activeTab, setActiveTab] = useState('insights');
  const [unreadInsights, setUnreadInsights] = useState(0);
  const [projectSnapshot, setProjectSnapshot] = useState(null);
  const [insights, setInsights] = useState(null);
  const [conversationHistory, setConversationHistory] = useState([]);
  const [pmMemory, setPMMemory] = useState(null);
  const [tasks, setTasks] = useState([]);
  const [isLoadingInsights, setIsLoadingInsights] = useState(false);
  const [acknowledgedAlerts, setAcknowledgedAlerts] = useState([]);
  const [sessionId] = useState(() => generateSessionId());
  const [auditLogs, setAuditLogs] = useState([]);
  const [weeklyBaseline, setWeeklyBaseline] = useState(null);

  // ── 2. HELPER ───────────────────────────────────────────────
  const getInstructions = () => {
    try { return localStorage.getItem('pma_custom_instructions') || ''; }
    catch { return ''; }
  };

  // ── 3. ALL CALLBACKS ────────────────────────────────────────

  const buildProjectSnapshot = useCallback(async () => {
    if (!activeProject) return null;
    try {
      const [
        rfis, changeOrders, drawings, workPkgs,
        deliveries, costCodes, dailyLogs, submittals,
        actionItems, schedule, expenses,
      ] = await Promise.all([
        base44.entities.RFI.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.ChangeOrder.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.Drawing.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.WorkPackage.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.Delivery.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.CostCode.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.DailyLog.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.Document.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.ActionItem.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.ScheduleTask.filter({ project_id: activeProject.id }).catch(() => []),
        base44.entities.Expense.filter({ project_id: activeProject.id }).catch(() => []),
      ]);
      const today = new Date();
      today.setHours(0, 0, 0, 0);
      const sevenDaysAgo = new Date(today.getTime() - 7 * 86400000);
      const sevenDaysAhead = new Date(today.getTime() + 7 * 86400000);
      const project = activeProject;
      const projectExpenses = expenses.filter(e => e.project_id === activeProject.id || e.projectId === activeProject.id);
      // RFI summaries
      const openRFIs = rfis.filter(r => r.status !== 'Closed');
      const overdueRFIs = openRFIs.filter(r => r.due_date && new Date(r.due_date) < today);
      const recentRFIs = rfis.filter(r => r.created_date && new Date(r.created_date) >= sevenDaysAgo);

      // Change order summaries
      const pendingCOs = changeOrders.filter(c => ['Draft', 'Submitted'].includes(c.status));
      const approvedCOs = changeOrders.filter(c => c.status === 'Approved' && c.updated_date && new Date(c.updated_date) >= sevenDaysAgo);
      const totalCOValue = approvedCOs.reduce((sum, c) => sum + (Number(c.co_amount) || 0), 0);

      // Delivery summaries
      const upcomingDeliveries = deliveries.filter(d =>
        d.scheduled_date && new Date(d.scheduled_date) >= today && new Date(d.scheduled_date) <= sevenDaysAhead && d.status !== 'Delivered'
      );
      const recentDeliveries = deliveries.filter(d =>
        d.status === 'Delivered' && d.updated_date && new Date(d.updated_date) >= sevenDaysAgo
      );
      const lateDeliveries = deliveries.filter(d =>
        d.scheduled_date && new Date(d.scheduled_date) < today && d.status !== 'Delivered'
      );

      // Submittal summaries
      const overdueSubmittals = submittals.filter(s =>
        s.due_date && new Date(s.due_date) < today && !['Approved', 'Void'].includes(s.status)
      );
      const pendingSubmittals = submittals.filter(s => ['Submitted', 'Under Review'].includes(s.status));
      const recentlyApproved = submittals.filter(s =>
        ['Approved', 'Approved as Noted'].includes(s.status) && s.returned_date && new Date(s.returned_date) >= sevenDaysAgo
      );

      // Work package summaries
      const activeWPs = workPkgs.filter(w => ['In Progress', 'Fabricating'].includes(w.status));
      const completedWPs = workPkgs.filter(w => w.status === 'Complete' && w.updated_date && new Date(w.updated_date) >= sevenDaysAgo);
      const avgProgress = activeWPs.length > 0
        ? Math.round(activeWPs.reduce((sum, wp) => sum + (Number(wp.percent_complete) || 0), 0) / activeWPs.length)
        : 0;

      // Budget summary
      const totalBudget = Number(project.revised_contract_value || project.original_contract_value || 0);
      const totalCommitted = projectExpenses.filter(e => e.payment_status !== 'Voided').reduce((sum, e) => sum + (Number(e.amount) || 0), 0);
      const budgetPct = totalBudget > 0 ? Math.round(totalCommitted / totalBudget * 100) : 0;

      // Action items summaries
      const overdueAI = actionItems.filter(a => a.status !== 'Complete' && a.due_date && new Date(a.due_date) < today);
      const dueThisWeek = actionItems.filter(a => a.status !== 'Complete' && a.due_date && new Date(a.due_date) >= today && new Date(a.due_date) <= sevenDaysAhead);

      // Build source lineage
      const sourceLineage = [];

      rfis.forEach((r) =>
        sourceLineage.push({
          entityType: 'RFI',
          entityId: r.id,
          entityNumber: r.rfi_number,
          fieldAccessed: ['status', 'dueDate', 'priority', 'title'],
          valueSnapshot: {
            status: r.status,
            dueDate: r.due_date,
            priority: r.priority,
            title: r.title,
          },
          retrievedAt: new Date().toISOString(),
        })
      );

      changeOrders.forEach((c) =>
        sourceLineage.push({
          entityType: 'ChangeOrder',
          entityId: c.id,
          entityNumber: c.co_number,
          fieldAccessed: ['status', 'coAmount', 'title'],
          valueSnapshot: {
            status: c.status,
            coAmount: c.co_amount,
            title: c.title,
          },
          retrievedAt: new Date().toISOString(),
        })
      );

      deliveries.forEach((d) =>
        sourceLineage.push({
          entityType: 'Delivery',
          entityId: d.id,
          entityNumber: d.delivery_id,
          fieldAccessed: ['status', 'scheduledDate', 'description'],
          valueSnapshot: {
            status: d.status,
            scheduledDate: d.scheduled_date,
            description: d.description,
          },
          retrievedAt: new Date().toISOString(),
        })
      );

      const snap = {
        project: {
          name: project.name,
          number: project.project_number,
          phase: project.phase,
          healthStatus: project.health_status,
          startDate: project.start_date,
          endDate: project.target_completion_date,
          daysToEnd: project.target_completion_date
            ? Math.ceil((new Date(project.target_completion_date) - today) / 86400000)
            : null,
          contractValue: totalBudget,
          gcName: project.general_contractor || project.client,
        },
        rfis: {
          total: rfis.length,
          open: openRFIs.length,
          overdue: overdueRFIs.length,
          critical: rfis.filter(r => r.priority === 'Critical' && r.status !== 'Closed').length,
          newThisWeek: recentRFIs.length,
          overdueItems: overdueRFIs.slice(0, 3).map(r => ({
            number: r.rfi_number,
            subject: r.title,
            dueDate: r.due_date,
          })),
          records: rfis,
        },
        changeOrders: {
          pending: pendingCOs.length,
          totalValue: changeOrders.reduce((sum, c) => sum + (c.co_amount || 0), 0),
          approved: changeOrders.filter(c => c.status === 'Approved').length,
          approvedThisWeek: approvedCOs.length,
          approvedValue: totalCOValue,
          pendingItems: pendingCOs.slice(0, 3).map(c => ({
            number: c.co_number,
            description: c.title,
            amount: c.co_amount,
          })),
          records: changeOrders,
        },
        workPackages: {
          total: workPkgs.length,
          onTrack: activeWPs.length,
          delayed: workPkgs.filter(w => w.status === 'On Hold').length,
          avgComplete: avgProgress,
          completedThisWeek: completedWPs.length,
          activeItems: activeWPs.slice(0, 4).map(wp => ({
            number: wp.wp_number,
            name: wp.name,
            progress: wp.percent_complete,
            phase: wp.phase,
          })),
          records: workPkgs,
        },
        deliveries: {
          upcoming: upcomingDeliveries.length,
          recent: recentDeliveries.length,
          late: lateDeliveries.length,
          upcomingItems: upcomingDeliveries.slice(0, 3).map(d => ({
            name: d.description || 'Delivery',
            date: d.scheduled_date,
          })),
          lateItems: lateDeliveries.slice(0, 2).map(d => ({
            name: d.description || 'Delivery',
            date: d.scheduled_date,
          })),
          records: deliveries,
        },
        submittals: {
          overdue: overdueSubmittals.length,
          pending: pendingSubmittals.length,
          approved: recentlyApproved.length,
          overdueItems: overdueSubmittals.slice(0, 3).map(s => ({
            number: s.sheet_number,
            title: s.title,
            dueDate: s.due_date,
          })),
          records: submittals,
        },
        budget: {
          contractValue: totalBudget,
          committed: totalCommitted,
          pctUsed: budgetPct,
          remaining: totalBudget - totalCommitted,
          records: costCodes,
        },
        actionItems: {
          overdueCount: overdueAI.length,
          dueThisWeekCount: dueThisWeek.length,
          overdueItems: overdueAI.slice(0, 3).map(a => ({
            title: a.title,
            assignedTo: a.assigned_to,
            dueDate: a.due_date,
          })),
          records: actionItems,
        },
        generatedAt: new Date().toLocaleDateString('en-US', {
          weekday: 'long',
          year: 'numeric',
          month: 'long',
          day: 'numeric',
        }),
        _lineage: sourceLineage,
        _snapshotTime: new Date().toISOString(),
        _projectId: activeProject.id,
        _projectName: activeProject.name,
      };
      setProjectSnapshot(snap);
      return snap;
    } catch (e) {
      console.error('Error building project snapshot:', e);
      return null;
    }
  }, [activeProject]);

  const generateInsights = useCallback(async () => {
    console.log('PMA generateInsights called, activeProject:', activeProject?.name || 'NONE');
    if (!activeProject?.id) {
      setInsights(null);
      setIsLoadingInsights(false);
      return;
    }
    
    setIsLoadingInsights(true);
    try {
      // Build live snapshot first so the briefing uses real data
      const snap = await buildProjectSnapshot();

      if (!snap) {
        console.error('PMA: buildProjectSnapshot returned null — no active project or fetch failed');
        setInsights('⚠ Could not load project data. Make sure a project is selected in the top right and try again.');
        setIsLoadingInsights(false);
        return;
      }
      const pName = activeProject?.name || 'project';
      const pNum = activeProject?.project_number || '';
      const pPhase = activeProject?.phase || '';
      const instructions = getInstructions();
      const today = new Date().toLocaleDateString('en-US', {
        weekday: 'long', month: 'long', day: 'numeric', year: 'numeric',
      });

      // Build a compact data summary for the briefing
      const dataSummary = snap ? `
LIVE PROJECT DATA (as of ${today}):
- RFIs: ${snap.rfis?.total || 0} total, ${snap.rfis?.open || 0} open, ${snap.rfis?.overdue || 0} overdue, ${snap.rfis?.critical || 0} critical
- Change Orders: ${snap.changeOrders?.pending || 0} pending ($${((snap.changeOrders?.totalValue) || 0).toLocaleString()})
- Work Packages: ${snap.workPackages?.total || 0} total, ${snap.workPackages?.onTrack || 0} active, avg ${snap.workPackages?.avgComplete || 0}% complete
- Deliveries: ${snap.deliveries?.upcoming || 0} upcoming this week, ${snap.deliveries?.late || 0} late
- Submittals: ${snap.submittals?.pending || 0} pending, ${snap.submittals?.overdue || 0} overdue
- Budget: $${(snap.budget?.contractValue || 0).toLocaleString()} contract, ${snap.budget?.pctUsed || 0}% committed
- Action Items: ${snap.actionItems?.overdueCount || 0} overdue, ${snap.actionItems?.dueThisWeekCount || 0} due this week
- Days to completion: ${snap.project?.daysToEnd != null ? snap.project.daysToEnd + ' days' : 'not set'}
${snap.rfis?.overdueItems?.length > 0 ? `- Overdue RFIs: ${snap.rfis.overdueItems.map(r => `RFI-${r.number} (${r.subject})`).join(', ')}` : ''}
${snap.deliveries?.lateItems?.length > 0 ? `- Late deliveries: ${snap.deliveries.lateItems.map(d => d.name).join(', ')}` : ''}` : '';

      const systemPrompt = `You are the embedded Project Manager Assistant for SteelBuild Pro, a structural steel fabrication and erection management platform. You have been given LIVE project data from the database. Your job is to analyze it and produce a sharp, specific briefing.

RULES:
- Reference ACTUAL numbers from the data — never say "several" when you have a count
- Reference ACTUAL RFI numbers, WP names, CO numbers from the data
- Never use placeholders like [X] or [Name]
- If a number is 0, say so — don't skip it
- Be direct. No filler phrases.
- You are a senior PM with 20 years in structural steel
${instructions ? `\nPM CUSTOM INSTRUCTIONS (follow always):\n${instructions}` : ''}`;

      const userPrompt = `Today is ${today}.

PROJECT: ${pName} ${pNum ? `(${pNum})` : ''} | Phase: ${pPhase || 'Not set'}

=== LIVE DATA FROM DATABASE ===
RFIs: ${snap?.rfis?.total || 0} total | ${snap?.rfis?.open || 0} open | ${snap?.rfis?.overdue || 0} OVERDUE | ${snap?.rfis?.critical || 0} critical
${snap?.rfis?.overdueItems?.length > 0 ? `Overdue RFIs:\n${snap.rfis.overdueItems.map(r => `  - ${r.number || 'No#'}: ${r.subject} (was due ${r.dueDate})`).join('\n')}` : 'No overdue RFIs.'}

Work Packages: ${snap?.workPackages?.total || 0} total | ${snap?.workPackages?.onTrack || 0} active | avg ${snap?.workPackages?.avgComplete || 0}% complete
${snap?.workPackages?.activeItems?.length > 0 ? `Active WPs:\n${snap.workPackages.activeItems.map(w => `  - ${w.number || ''} ${w.name}: ${w.progress || 0}% (${w.phase})`).join('\n')}` : 'No active work packages.'}

Deliveries: ${snap?.deliveries?.upcoming || 0} upcoming this week | ${snap?.deliveries?.late || 0} LATE
${snap?.deliveries?.lateItems?.length > 0 ? `Late deliveries:\n${snap.deliveries.lateItems.map(d => `  - ${d.name} (was due ${d.date})`).join('\n')}` : ''}
${snap?.deliveries?.upcomingItems?.length > 0 ? `Coming up:\n${snap.deliveries.upcomingItems.map(d => `  - ${d.name} on ${d.date}`).join('\n')}` : ''}

Change Orders: ${snap?.changeOrders?.pending || 0} pending | ${snap?.changeOrders?.approved || 0} approved | total value $${(snap?.changeOrders?.totalValue || 0).toLocaleString()}
${snap?.changeOrders?.pendingItems?.length > 0 ? `Pending COs:\n${snap.changeOrders.pendingItems.map(c => `  - ${c.number || 'CO'}: ${c.description} ($${(c.amount || 0).toLocaleString()})`).join('\n')}` : ''}

Submittals: ${snap?.submittals?.pending || 0} pending EOR | ${snap?.submittals?.overdue || 0} overdue
${snap?.submittals?.overdueItems?.length > 0 ? `Overdue submittals:\n${snap.submittals.overdueItems.map(s => `  - ${s.number}: ${s.title} (due ${s.dueDate})`).join('\n')}` : ''}

Budget: $${(snap?.budget?.contractValue || 0).toLocaleString()} contract | $${(snap?.budget?.committed || 0).toLocaleString()} committed (${snap?.budget?.pctUsed || 0}%) | $${(snap?.budget?.remaining || 0).toLocaleString()} remaining

Action Items: ${snap?.actionItems?.overdueCount || 0} overdue | ${snap?.actionItems?.dueThisWeekCount || 0} due this week
${snap?.actionItems?.overdueItems?.length > 0 ? `Overdue items:\n${snap.actionItems.overdueItems.map(a => `  - ${a.title} (${a.assignedTo || 'Unassigned'}, due ${a.dueDate})`).join('\n')}` : ''}

Schedule: ${snap?.project?.daysToEnd != null ? `${snap.project.daysToEnd} days to completion (${snap.project.endDate})` : 'Completion date not set'}
Project health: ${snap?.project?.healthStatus || 'Not set'}
=== END DATA ===

Write the daily briefing. Use the EXACT numbers and names from the data above.

FORMAT:
**DAILY BRIEFING — ${pName}**
[2-3 sentences with actual numbers: open RFIs, active WPs, upcoming deliveries]

**TOP PRIORITIES TODAY**
1. [Most urgent item with specific reference to data]
2. [Second priority]
3. [Third priority]

**RISKS**
[2-3 bullets referencing actual overdue items, late deliveries, or budget concerns from the data]

**RECOMMENDED ACTION**
[One specific recommendation based on the data]`;

      const result = await base44.functions.invoke('anthropicProxy', {
        prompt: userPrompt,
        system: systemPrompt,
      });
      const text = typeof result === 'string'
        ? result
        : result?.text || result?.content || result?.response || 'No response generated.';
      setInsights(text || 'No response generated.');
      setUnreadInsights(text ? 1 : 0);
      
    } catch (err) {
      console.error('PMA Insights FULL ERROR:', err);
      console.error('Error message:', err.message);
      console.error('Error details:', JSON.stringify(err, null, 2));
      setInsights(`⚠ Insights error: ${err.message || JSON.stringify(err)}\n\nOpen browser console (F12) → Console tab for full details.`);
    } finally {
      setIsLoadingInsights(false);
    }
  }, [activeProject, buildProjectSnapshot]);

  const savePMMemory = useCallback((memory) => {
    if (!activeProject) return;
    setPMMemory(memory);
    localStorage.setItem(`pma-memory-${activeProject.id}`, JSON.stringify(memory));
  }, [activeProject]);

  const saveWeeklyBaseline = useCallback((snapshot) => {
    if (!activeProject) return;
    setWeeklyBaseline(snapshot);
    localStorage.setItem(`pma-baseline-${activeProject.id}`, JSON.stringify(snapshot));
  }, [activeProject]);

  const createActionItemFromChat = useCallback(async (title, assignedTo, dueDate, priority = 'Medium') => {
    if (!activeProject?.id) return null;
    try {
      const newItem = await base44.entities.ActionItem.create({
        title,
        project_id: activeProject.id,
        project_name: activeProject.name,
        assigned_to: assignedTo,
        due_date: dueDate,
        priority,
        status: 'Open',
        description: `Created via PMA chat on ${new Date().toLocaleDateString()}`,
      });
      return newItem;
    } catch (err) {
      console.error('Failed to create action item:', err);
      return null;
    }
  }, [activeProject]);

  // ── 4. ALL useEFFECTS LAST (after all functions declared) ───

  useEffect(() => {
    if (!activeProject) return;
    try {
      const stored = localStorage.getItem(`pma-memory-${activeProject.id}`);
      if (stored) setPMMemory(JSON.parse(stored));
      const baseline = localStorage.getItem(`pma-baseline-${activeProject.id}`);
      if (baseline) setWeeklyBaseline(JSON.parse(baseline));
    } catch (e) {
      console.error('Error loading PM memory:', e);
    }
  }, [activeProject]);

  useEffect(() => {
    if (isOpen && activeProject?.id) {
      setInsights(null);
      generateInsights();
    }
  }, [isOpen, activeProject?.id]);

  return (
    <PMAContext.Provider value={{
      isOpen, setIsOpen,
      activeTab, setActiveTab,
      unreadInsights, setUnreadInsights,
      projectSnapshot,
      insights, setInsights,
      generateInsights,
      isLoadingInsights,
      conversationHistory, setConversationHistory,
      pmMemory, savePMMemory,
      tasks, setTasks,
      acknowledgedAlerts, setAcknowledgedAlerts,
      buildProjectSnapshot,
      createActionItemFromChat,
      sessionId,
      auditLogs, setAuditLogs,
      createAuditRecord,
      runPolicyChecks,
      weeklyBaseline,
      saveWeeklyBaseline,
    }}>
      {children}
    </PMAContext.Provider>
  );
}

export function usePMA() {
  const ctx = useContext(PMAContext);
  if (!ctx) throw new Error('usePMA must be used within PMAProvider');
  return ctx;
}