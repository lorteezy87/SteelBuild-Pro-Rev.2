import React, { useState, useRef, useEffect } from 'react';
import { usePMA } from '../usePMAContext';
import { useProjectContext } from '@/components/shared/useProjectContext';
import { base44 } from '@/api/base44Client';

import DecisionCapture from './DecisionCapture';
import AssumptionTracker from './AssumptionTracker';
import RoleSelector from './RoleSelector';
import ConfidenceDisplay from './ConfidenceDisplay';
import { getRoleInstruction, getSelectedRole } from '../utils/roleDefinitions';

const QUICK_PROMPT_CATEGORIES = [
  {
    label: 'STATUS',
    color: 'var(--accent)',
    prompts: [
      "What needs my attention today?",
      "Summarize project status",
      "What's behind schedule?",
      "How is fabrication progressing?",
    ],
  },
  {
    label: 'RISK',
    color: 'var(--status-error)',
    prompts: [
      "What are the top 3 risks right now?",
      "What could delay erection start?",
      "Which RFIs are blocking fab?",
      "Flag anything that looks like a claim",
    ],
  },
  {
    label: 'DRAFTS',
    color: 'var(--status-info)',
    prompts: [
      "Draft a weekly update email",
      "Write a GC update on RFI status",
      "Compose a delivery delay notice",
      "Draft a CO justification memo",
    ],
  },
  {
    label: 'COST',
    color: 'var(--status-warning)',
    prompts: [
      "What's our cost exposure?",
      "Which cost codes are over budget?",
      "Summarize pending change orders",
      "What's our earned value?",
    ],
  },
  {
    label: 'LOOKAHEAD',
    color: '#8B5CF6',
    prompts: [
      "What deliveries are due this week?",
      "What WPs ship next?",
      "Upcoming drawing submissions",
      "Two-week lookahead summary",
    ],
  },
];

const getPMAInstructions = () => {
  try {
    return localStorage.getItem('pma_custom_instructions') || '';
  } catch {
    return '';
  }
};

export default function PMAChat() {
  const {
    conversationHistory,
    setConversationHistory,
    buildProjectSnapshot,
    createActionItemFromChat,
    sessionId,
    createAuditRecord,
    runPolicyChecks,
    pinnedMessages,
    setPinnedMessages,
    setActiveTab,
  } = usePMA();
  const { activeProject } = useProjectContext();
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [generatedEmail, setGeneratedEmail] = useState(null);
  const [copyFeedback, setCopyFeedback] = useState(false);
  const [createdTask, setCreatedTask] = useState(null);
  const messagesEndRef = useRef(null);
  const [user, setUser] = useState(null);
  const [selectedRole, setSelectedRole] = useState('pm');
  const [confidenceMap, setConfidenceMap] = useState({});
  const [quickCategory, setQuickCategory] = useState(QUICK_PROMPT_CATEGORIES[0]);
  const [contextMode, setContextMode] = useState('PROJECT');
  const [customContext, setCustomContext] = useState('');

  useEffect(() => {
    base44.auth.me().then(setUser).catch(console.error);
    setSelectedRole(getSelectedRole());
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [conversationHistory]);

  const sendMessage = async () => {
    const text = input.trim();
    if (!text || isLoading) return;

    // Intent detection
    const isWeeklyEmailRequest = /weekly\s+update|email|draft.*email/i.test(text);
    const isCreateTaskRequest = /create\s+task|assign|add\s+action|remind\s+me|todo|task:/i.test(text);
    const isLookaheadRequest = /lookahead|next week|upcoming|schedule.*week|two.week|this week/i.test(text);
    const isBudgetQuestion = /cost|budget|exposure|over.budget|earned value|burn rate|cost code|variance/i.test(text);
    const isClaimAlert = /claim|notice|delay|force majeure|differing site|change order|dispute|impact/i.test(text);
    const isRFIQuestion = /rfi|request for information|ball in court|bic/i.test(text);
    const isDeliveryQuestion = /deliver|material|shipment|vendor|procurement|PO/i.test(text);

    setConversationHistory((prev) => [
      ...prev,
      { role: 'user', content: text },
    ]);
    setInput('');
    setIsLoading(true);
    setGeneratedEmail(null);
    setCreatedTask(null);

    try {
      // Handle task creation
      if (isCreateTaskRequest && activeProject) {
        const parsePrompt = `Extract task details from this request and return ONLY valid JSON (no markdown, no code blocks):
"${text}"

Return exactly this format:
{
  "title": "task title (max 100 chars)",
  "assignedTo": "person name or 'me' or 'team'",
  "dueDate": "YYYY-MM-DD or null",
  "priority": "High" or "Medium" or "Low"
}`;

        const parseResult = await base44.functions.invoke('anthropicProxy', {
          prompt: parsePrompt,
        });
        const parsed = typeof parseResult === 'string'
          ? parseResult
          : parseResult?.text || parseResult?.content || parseResult?.response || '';

        let taskData = { title: 'New Task', assignedTo: 'me', dueDate: null, priority: 'Medium' };
        try {
          taskData = JSON.parse(parsed);
        } catch (e) {
          console.warn('Could not parse task JSON:', parsed);
        }

        const created = await createActionItemFromChat(
          taskData.title,
          taskData.assignedTo,
          taskData.dueDate,
          taskData.priority
        );

        if (created) {
          setCreatedTask(created);
          const snapshot = await buildProjectSnapshot();
          
          // Create audit record
          await createAuditRecord({
            actionType: 'DECISION_RECORDED',
            triggeredBy: text,
            outputSummary: `Action item created: ${created.title}`,
            snapshot: snapshot || {},
            projectId: activeProject.id,
            projectName: activeProject.name,
            sessionId,
            userId: user?.id,
            userRole: user?.role,
          });

          setConversationHistory((prev) => [
            ...prev,
            {
              role: 'assistant',
              content: `✓ Action item created: "${created.title}" assigned to ${created.assigned_to}${created.due_date ? ` (due ${new Date(created.due_date).toLocaleDateString()})` : ''}`,
              isTaskCreation: true,
            },
          ]);
        } else {
          setConversationHistory((prev) => [
            ...prev,
            { role: 'assistant', content: '⚠ Could not create action item. Try again.' },
          ]);
        }
      } else if (isWeeklyEmailRequest && activeProject) {
        const snapshot = await buildProjectSnapshot();
        
        if (!snapshot) {
          setConversationHistory((prev) => [
            ...prev,
            { role: 'assistant', content: '⚠ Could not build project snapshot. Please try again.' },
          ]);
          setIsLoading(false);
          return;
        }

        const weeklyEmailPrompt = `You are a senior project manager at a structural steel fabrication and erection company. Write a COMPLETE, professional weekly project update email using ONLY the real data provided below. Do not use placeholder text, brackets, or generic language. Every item must reference actual project data.

PROJECT SNAPSHOT (as of ${snapshot.generatedAt}):
${JSON.stringify(snapshot, null, 2)}

WRITE COMPLETE EMAIL WITH THESE EXACT SECTIONS:

**SUBJECT LINE:**
Weekly Update — ${snapshot.project.name} | ${snapshot.generatedAt}

**EMAIL BODY (plain text, no markdown):**

Opening: One sentence with actual project name and current phase status.

FABRICATION STATUS:
${snapshot.workPackages.activeItems.length > 0 
  ? snapshot.workPackages.activeItems.map(w => `• ${w.name}: ${w.progress}% complete (${w.phase})`).join('\n')
  : '• No active work packages this period'}
${snapshot.workPackages.completedThisWeek > 0 ? `Completed this week: ${snapshot.workPackages.completedThisWeek} package(s)` : ''}

RFI STATUS:
• Open RFIs: ${snapshot.rfis.open}
${snapshot.rfis.overdueItems.length > 0 ? snapshot.rfis.overdueItems.map(r => `• OVERDUE: RFI-${r.number} — ${r.subject}`).join('\n') : '• No overdue RFIs'}
${snapshot.rfis.newThisWeek > 0 ? `• New this week: ${snapshot.rfis.newThisWeek}` : ''}

SUBMITTALS:
• Pending review: ${snapshot.submittals.pending}
• Overdue: ${snapshot.submittals.overdue}
${snapshot.submittals.overdueItems.length > 0 ? snapshot.submittals.overdueItems.map(s => `  - Drawing ${s.number}: ${s.title}`).join('\n') : ''}

UPCOMING DELIVERIES (next 7 days):
${snapshot.deliveries.upcomingItems.length > 0 
  ? snapshot.deliveries.upcomingItems.map(d => `• ${d.name} — ${new Date(d.date).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}`).join('\n')
  : '• None scheduled'}
${snapshot.deliveries.lateItems.length > 0 ? snapshot.deliveries.lateItems.map(d => `• LATE: ${d.name}`).join('\n') : ''}

CHANGE ORDERS:
• Pending approval: ${snapshot.changeOrders.pending} CO(s)
${snapshot.changeOrders.approvedThisWeek > 0 ? `• Approved this week: ${snapshot.changeOrders.approvedThisWeek} ($${snapshot.changeOrders.approvedValue.toLocaleString('en-US', { maximumFractionDigits: 0 })})` : ''}

BUDGET STATUS:
• Contract value: $${snapshot.budget.contractValue.toLocaleString('en-US', { maximumFractionDigits: 0 })}
• Committed to date: $${snapshot.budget.committed.toLocaleString('en-US', { maximumFractionDigits: 0 })} (${snapshot.budget.pctUsed}%)
${snapshot.budget.pctUsed > 90 ? '• ⚠ ALERT: Budget utilization over 90%' : ''}

ACTION ITEMS:
${snapshot.actionItems.overdueCount > 0 ? `• Overdue: ${snapshot.actionItems.overdueCount}` : '• No overdue action items'}
${snapshot.actionItems.dueThisWeekCount > 0 ? `• Due this week: ${snapshot.actionItems.dueThisWeekCount}` : ''}

Closing: One professional sentence wrapping up the status.

Sign off as: Project Management Team

IMPORTANT:
- No [bracketed placeholders]
- No "I hope this email finds you well"
- Keep under 400 words
- Use actual numbers, names, and dates from data above
- Professional construction industry tone`;

        const emailResult = await base44.functions.invoke('anthropicProxy', {
          prompt: weeklyEmailPrompt,
        });
        const emailContent = (typeof emailResult === 'string'
          ? emailResult
          : emailResult?.text || emailResult?.content || emailResult?.response || '') || 'Error generating email';

        // Parse email into subject and body
        const subjectMatch = emailContent.match(/SUBJECT.*?:\s*(.+)/i);
        const bodyMatch = emailContent.match(/EMAIL BODY[^]*?:(.+)/i);
        const subject = subjectMatch ? subjectMatch[1].trim() : 'Weekly Update Email';
        const body = bodyMatch ? bodyMatch[1].trim() : emailContent;

        setGeneratedEmail({ subject, body, fullText: emailContent });
        
        // Create audit record
        await createAuditRecord({
          actionType: 'EMAIL_GENERATED',
          triggeredBy: text,
          outputSummary: `Weekly update email for ${activeProject.name}`,
          snapshot,
          projectId: activeProject.id,
          projectName: activeProject.name,
          sessionId,
          userId: user?.id,
          userRole: user?.role,
        });

        setConversationHistory((prev) => [
          ...prev,
          {
            role: 'assistant',
            content: `✓ Weekly email generated from live project data. Review below and copy to send.`,
            isEmailGeneration: true,
          },
        ]);
      } else {
        const pName = activeProject?.name || 'Unknown';
        const pNum = activeProject?.project_number || '';
        const pPhase = activeProject?.phase || '';
        const instructions = getPMAInstructions();
        const roleInstruction = getRoleInstruction(selectedRole);

        const snapshot = activeProject ? await buildProjectSnapshot() : null;

        // Context selector filtering
        let scopedSnapshot = snapshot;
        if (snapshot) {
          if (contextMode === 'RFIS') {
            scopedSnapshot = { project: snapshot.project, rfis: snapshot.rfis };
          } else if (contextMode === 'FINANCIALS') {
            scopedSnapshot = { project: snapshot.project, budget: snapshot.budget, changeOrders: snapshot.changeOrders, costCodes: snapshot.budget?.records };
          } else if (contextMode === 'SCHEDULE') {
            scopedSnapshot = { project: snapshot.project, workPackages: snapshot.workPackages, deliveries: snapshot.deliveries, submittals: snapshot.submittals };
          } else if (contextMode === 'PORTFOLIO') {
            // handled in future enhancement, for now use full snapshot
            scopedSnapshot = snapshot;
          }
        }

        const dataBlock = scopedSnapshot ? `
=== LIVE PROJECT DATA ===
Project: ${scopedSnapshot.project.name} ${pNum} | Phase: ${pPhase} | Health: ${scopedSnapshot.project.healthStatus || 'Not set'}
Days to completion: ${scopedSnapshot.project.daysToEnd != null ? scopedSnapshot.project.daysToEnd + 'd' : 'not set'}
Contract: $${(scopedSnapshot.budget?.contractValue || 0).toLocaleString()} | Committed: ${scopedSnapshot.budget?.pctUsed || 0}%

RFIs: ${scopedSnapshot.rfis?.open || 0} open | ${scopedSnapshot.rfis?.overdue || 0} overdue | ${scopedSnapshot.rfis?.critical || 0} critical
${scopedSnapshot.rfis?.overdueItems?.length > 0 ? scopedSnapshot.rfis.overdueItems.map(r => `  OVERDUE: ${r.number} — ${r.subject} (due ${r.dueDate})`).join('\n') : ''}

Work Packages: ${scopedSnapshot.workPackages?.total || 0} total | avg ${scopedSnapshot.workPackages?.avgComplete || 0}% complete
${scopedSnapshot.workPackages?.activeItems?.length > 0 ? scopedSnapshot.workPackages.activeItems.map(w => `  ${w.number} ${w.name}: ${w.progress}% (${w.phase})`).join('\n') : ''}

Deliveries: ${scopedSnapshot.deliveries?.upcoming || 0} upcoming | ${scopedSnapshot.deliveries?.late || 0} late
${scopedSnapshot.deliveries?.lateItems?.length > 0 ? scopedSnapshot.deliveries.lateItems.map(d => `  LATE: ${d.name}`).join('\n') : ''}

Change Orders: ${scopedSnapshot.changeOrders?.pending || 0} pending | $${(scopedSnapshot.changeOrders?.totalValue || 0).toLocaleString()} total
Submittals: ${scopedSnapshot.submittals?.pending || 0} pending | ${scopedSnapshot.submittals?.overdue || 0} overdue
Action Items: ${scopedSnapshot.actionItems?.overdueCount || 0} overdue | ${scopedSnapshot.actionItems?.dueThisWeekCount || 0} due this week
=== END DATA ===` : '';

        const systemPrompt = `You are the Project Manager Assistant (PMA) in SteelBuild Pro. You have LIVE data from the project database. Use it.

RULES — NEVER BREAK THESE:
- Always reference specific data: RFI numbers, WP names, actual dollar amounts
- Never say "I don't have access to" — you DO have the data above
- Never use placeholders or brackets
- If asked about something not in the data, say what IS there
- Be direct, specific, construction-industry tone
- Lead with the most critical finding

Project: ${pName} ${pNum}${pPhase ? ` | Phase: ${pPhase}` : ''}
${roleInstruction}
${instructions ? `\nPM INSTRUCTIONS:\n${instructions}` : ''}

${dataBlock}`;

        const history = conversationHistory
          .filter(m => m.content && !m.isEmailGeneration && !m.isTaskCreation)
          .slice(-8)
          .map(m => ({ role: m.role, content: m.content }));
        history.push({ role: 'user', content: text });

        // Intent-specific enrichment
        let augmentedPrompt = text;
        if (snapshot) {
          if (isRFIQuestion) augmentedPrompt = `LIVE RFI DATA:\n${JSON.stringify(snapshot.rfis, null, 2)}\n\n${text}`;
          if (isBudgetQuestion) augmentedPrompt = `BUDGET & COST DATA:\n${JSON.stringify(snapshot.budget, null, 2)}\nCHANGE ORDERS:\n${JSON.stringify(snapshot.changeOrders, null, 2)}\n\n${text}`;
          if (isLookaheadRequest) augmentedPrompt = `LOOKAHEAD DATA (Deliveries + WPs + Submittals):\n${JSON.stringify({ deliveries: snapshot.deliveries, workPackages: snapshot.workPackages, submittals: snapshot.submittals }, null, 2)}\n\n${text}`;
          if (isDeliveryQuestion) augmentedPrompt = `DELIVERY DATA:\n${JSON.stringify(snapshot.deliveries, null, 2)}\n\n${text}`;
          if (isClaimAlert) augmentedPrompt = `POTENTIAL CLAIM CHECK:\n${JSON.stringify({ rfis: snapshot.rfis, changeOrders: snapshot.changeOrders, deliveries: snapshot.deliveries }, null, 2)}\n\n${text}`;
        }

        if (contextMode === 'CUSTOM' && customContext) {
          augmentedPrompt = `CUSTOM CONTEXT:\n${customContext}\n\n${augmentedPrompt}`;
        }

        const replyResult = await base44.functions.invoke('anthropicProxy', {
          prompt: augmentedPrompt,
          system: systemPrompt,
          messages: history,
        });
        const reply = (typeof replyResult === 'string'
          ? replyResult
          : replyResult?.text || replyResult?.content || replyResult?.response || '') || 'No response.';

        setConversationHistory(prev => [
          ...prev,
          { role: 'assistant', content: reply },
        ]);

        if (activeProject) {
          createAuditRecord({
            actionType: 'CHAT_RESPONSE',
            triggeredBy: text,
            outputSummary: reply.substring(0, 80),
            snapshot: snapshot || {},
            projectId: activeProject.id,
            projectName: activeProject.name,
            sessionId,
            userId: user?.id,
            userRole: user?.role,
          }).catch(console.warn);
        }
      }
    } catch (err) {
      console.error('PMA Chat error:', err);
      setConversationHistory((prev) => [
        ...prev,
        {
          role: 'assistant',
          content: `⚠ PMA error: ${err.message || JSON.stringify(err)}\n\nCheck F12 console for details.`,
        },
      ]);
    } finally {
      setIsLoading(false);
    }
  };

  const copyEmail = () => {
    if (generatedEmail?.fullText) {
      navigator.clipboard.writeText(generatedEmail.fullText);
      setCopyFeedback(true);
      setTimeout(() => setCopyFeedback(false), 2000);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 220px)' }}>
      <RoleSelector />
      {/* Generated Email Display */}
      {generatedEmail && (
        <div style={{ marginBottom: 12, background: 'rgba(255,255,255,0.03)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
            <div>
              <div style={{ fontFamily: 'var(--font-mono)', fontSize: 8, color: 'rgba(160,175,210,0.45)', letterSpacing: '0.12em', marginBottom: 4 }}>
                SUBJECT
              </div>
              <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, color: '#F2F4F8', fontWeight: 500, marginBottom: 8 }}>
                {generatedEmail.subject}
              </div>
            </div>
            <button
              onClick={copyEmail}
              style={{
                background: copyFeedback ? 'var(--success-muted)' : 'var(--accent-border)',
                border: '1px solid var(--accent-border)',
                borderRadius: 6,
                padding: '4px 8px',
                fontFamily: 'var(--font-mono)',
                fontSize: 8,
                color: copyFeedback ? 'var(--status-success)' : 'var(--accent)',
                cursor: 'pointer',
                fontWeight: 700,
                transition: 'all 0.2s',
              }}
            >
              {copyFeedback ? '✓ COPIED' : '📋 COPY'}
            </button>
          </div>
          <div style={{
            background: 'rgba(10,13,20,0.5)',
            border: '1px solid rgba(255,255,255,0.05)',
            borderRadius: 8,
            padding: '12px 14px',
            fontFamily: 'var(--font-body)',
            fontSize: 11,
            color: 'var(--text-secondary)',
            lineHeight: 1.7,
            whiteSpace: 'pre-wrap',
            maxHeight: 320,
            overflowY: 'auto',
          }}>
            {generatedEmail.body}
          </div>
        </div>
      )}

      {/* Quick prompts categories */}
      <div style={{ marginBottom: 10 }}>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
          {QUICK_PROMPT_CATEGORIES.map((cat) => (
            <button
              key={cat.label}
              onClick={() => setQuickCategory(cat)}
              style={{
                background: quickCategory.label === cat.label ? cat.color + '22' : 'var(--bg-surface-low)',
                border: `1px solid ${quickCategory.label === cat.label ? cat.color + '55' : 'var(--border-default)'}`,
                color: quickCategory.label === cat.label ? cat.color : 'var(--text-secondary)',
                borderRadius: 999,
                padding: '6px 12px',
                fontFamily: 'var(--font-mono)',
                fontSize: 9,
                fontWeight: 700,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                letterSpacing: '0.08em',
              }}
            >
              {cat.label}
            </button>
          ))}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill,minmax(180px,1fr))', gap: 8 }}>
          {quickCategory.prompts.map((prompt) => (
            <button
              key={prompt}
              onClick={() => setInput(prompt)}
              style={{
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--border-default)',
                borderRadius: 6,
                padding: '8px 10px',
                fontFamily: 'var(--font-body)',
                fontSize: 10,
                color: 'var(--text-primary)',
                cursor: 'pointer',
                textAlign: 'left',
              }}
            >
              {prompt}
            </button>
          ))}
        </div>
      </div>

      {/* Messages */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
        {conversationHistory.length === 0 ? (
          <div style={{ textAlign: 'center', color: 'rgba(160,175,210,0.4)', padding: '20px 0' }}>
            <div style={{ fontFamily: 'var(--font-body)', fontSize: 12, marginBottom: 6 }}>
              Ask PMA anything about this project
            </div>
          </div>
        ) : (
          conversationHistory.map((msg, i) => (
            <div
              key={i}
              style={{
                display: 'flex',
                justifyContent: msg.role === 'user' ? 'flex-end' : 'flex-start',
                gap: 8,
                position: 'relative',
              }}
            >
              {msg.role === 'assistant' && (
                <div
                  style={{
                    fontSize: 12,
                    color: 'var(--accent)',
                    marginTop: 2,
                  }}
                >
                  ✦
                </div>
              )}
              <div
                style={{
                  maxWidth: '85%',
                  background: msg.role === 'user' ? 'var(--accent-muted)' : 'var(--bg-surface-low)',
                  border:
                    msg.role === 'user'
                      ? 'none'
                      : '1px solid var(--accent-border)',
                  borderLeft: msg.role === 'user' ? 'none' : '3px solid var(--accent)',
                  borderRadius: 8,
                  padding: '8px 12px',
                  fontFamily: 'var(--font-body)',
                  fontSize: 11,
                  color: 'var(--text-primary)',
                  lineHeight: 1.4,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                  position: 'relative',
                }}
              >
                {msg.content}

                {msg.role === 'assistant' && (
                  <div style={{ marginTop: 8, display: 'flex', flexDirection: 'column', gap: 6 }}>
                    <DecisionCapture
                      message={msg.content}
                      projectId={activeProject?.id}
                      projectName={activeProject?.name}
                      sessionId={sessionId}
                      onClose={() => {}}
                    />
                    <AssumptionTracker
                      message={msg.content}
                      projectId={activeProject?.id}
                      projectName={activeProject?.name}
                      sessionId={sessionId}
                    />
                    {confidenceMap[conversationHistory.indexOf(msg)] && (
                      <ConfidenceDisplay confidence={confidenceMap[conversationHistory.indexOf(msg)]} />
                    )}
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      <ActionButton label="📋 Copy" onClick={() => navigator.clipboard.writeText(msg.content)} />
                      <ActionButton label="📌 Pin" onClick={() => setPinnedMessages([...pinnedMessages, msg])} />
                      <ActionButton
                        label="📝 Create Action Item"
                        onClick={() => createActionItemFromChat(msg.content, 'team', null, 'Medium')}
                      />
                      <ActionButton
                        label="📧 Use in Email"
                        onClick={() => {
                          setActiveTab?.('draft');
                          localStorage.setItem('pma-draft-preload', msg.content);
                        }}
                      />
                    </div>
                  </div>
                )}
              </div>
            </div>
          ))
        )}
        {isLoading && (
          <div
            style={{
              display: 'flex',
              gap: 6,
              alignItems: 'center',
              color: 'var(--accent)',
              fontFamily: 'var(--font-body)',
              fontSize: 10,
            }}
          >
            <span>✦</span>
            <span>PMA is thinking...</span>
          </div>
        )}
        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      <div style={{ borderTop: '1px solid var(--accent-border)', paddingTop: 8 }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8, gap: 8 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, fontFamily: 'var(--font-mono)', fontSize: 8, color: 'var(--text-muted)', letterSpacing: '0.08em' }}>
            <span>Context:</span>
            <select
              value={contextMode}
              onChange={(e) => setContextMode(e.target.value)}
              style={{
                background: 'var(--bg-surface-low)',
                border: '1px solid var(--border-default)',
                color: 'var(--text-primary)',
                fontSize: 9,
                fontFamily: 'var(--font-mono)',
                borderRadius: 6,
                padding: '4px 8px',
              }}
            >
              {['PROJECT', 'PORTFOLIO', 'RFIS', 'FINANCIALS', 'SCHEDULE', 'CUSTOM'].map((mode) => (
                <option key={mode} value={mode}>{mode}</option>
              ))}
            </select>
            {contextMode === 'CUSTOM' && (
              <input
                value={customContext}
                onChange={(e) => setCustomContext(e.target.value)}
                placeholder="Describe custom context..."
                style={{
                  background: 'var(--bg-input)',
                  border: '1px solid var(--border-default)',
                  color: 'var(--text-primary)',
                  fontSize: 9,
                  fontFamily: 'var(--font-body)',
                  borderRadius: 6,
                  padding: '4px 8px',
                  minWidth: 160,
                }}
              />
            )}
          </div>
          <button
            onClick={() => setConversationHistory([])}
            style={{
              background: 'transparent',
              border: '1px solid var(--border-default)',
              color: 'var(--text-muted)',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              borderRadius: 6,
              padding: '4px 8px',
              cursor: 'pointer',
              textTransform: 'uppercase',
              letterSpacing: '0.08em',
            }}
          >
            Clear Chat
          </button>
        </div>
        {activeProject && (
          <div style={{
            fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--text-muted)',
            letterSpacing: '0.10em', marginBottom: 4, display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <div style={{ width: 5, height: 5, borderRadius: '50%', background: 'var(--status-success)', boxShadow: '0 0 4px var(--status-success)' }} />
            LIVE DATA — {activeProject.name}
          </div>
        )}
        {!activeProject && (
          <div style={{ fontFamily: 'var(--font-mono)', fontSize: 7, color: 'var(--status-warning)', letterSpacing: '0.10em', marginBottom: 4 }}>
            ⚠ SELECT A PROJECT FOR PROJECT-SPECIFIC ANSWERS
          </div>
        )}
        <div
          style={{
            display: 'flex',
            gap: 6,
            alignItems: 'flex-end',
            background: 'var(--bg-input)',
            border: '1px solid var(--accent-border)',
            borderRadius: 8,
            padding: '6px 8px',
            marginBottom: 8,
          }}
        >
          <textarea
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                sendMessage();
              }
            }}
            placeholder="Ask PMA anything..."
            rows={1}
            style={{
              flex: 1,
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text-primary)',
              fontFamily: 'var(--font-body)',
              fontSize: 11,
              resize: 'none',
              lineHeight: 1.4,
              maxHeight: 80,
              overflowY: 'auto',
            }}
          />
          <button
            onClick={sendMessage}
            disabled={!input.trim() || isLoading}
            style={{
              background: 'linear-gradient(135deg,var(--accent),var(--secondary))',
              border: 'none',
              borderRadius: 6,
              padding: '5px 10px',
              color: 'white',
              fontFamily: 'var(--font-mono)',
              fontSize: 8,
              fontWeight: 700,
              cursor: input.trim() ? 'pointer' : 'not-allowed',
              opacity: input.trim() ? 1 : 0.4,
              flexShrink: 0,
            }}
          >
            ✦ Send
          </button>
        </div>

        {/* Quick prompts */}
        {conversationHistory.length === 0 && (
          <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
            {quickCategory.prompts.map((prompt) => (
              <button
                key={prompt}
                onClick={() => setInput(prompt)}
                style={{
                  background: 'var(--accent-muted)',
                  border: '1px solid var(--accent-border)',
                  borderRadius: 6,
                  padding: '3px 8px',
                  fontFamily: 'var(--font-mono)',
                  fontSize: 8,
                  color: 'var(--accent)',
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                {prompt}
              </button>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function ActionButton({ label, onClick }) {
  return (
    <button
      onClick={onClick}
      style={{
        border: '1px solid var(--border-default)',
        background: 'var(--bg-surface)',
        color: 'var(--text-secondary)',
        fontFamily: 'var(--font-mono)',
        fontSize: 8,
        padding: '4px 8px',
        borderRadius: 6,
        cursor: 'pointer',
        letterSpacing: '0.06em',
        textTransform: 'uppercase',
      }}
    >
      {label}
    </button>
  );
}
