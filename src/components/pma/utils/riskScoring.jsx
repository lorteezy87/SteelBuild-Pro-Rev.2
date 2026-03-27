import { base44 } from '@/api/base44Client';

export const detectPhase = (workPackages) => {
  if (!workPackages || workPackages.length === 0) return 'Preconstruction';
  const phases = workPackages.map(wp => wp.phase || '');
  if (phases.includes('Erection') || phases.includes('Field Execution'))
    return 'Field Execution';
  if (phases.includes('Fabrication')) return 'Fabrication';
  if (phases.includes('Delivery')) return 'Delivery';
  if (phases.includes('Detailing')) return 'Detailing';
  return 'Preconstruction';
};

export const scoreRisks = async (snapshot) => {
  try {
    const phase = detectPhase(snapshot?.workPackages?.activeItems);

    const prompt = `You are a senior structural steel PM. Score the following real project risks based on ONLY the actual project data provided. Return ONLY a JSON array, no markdown, no code blocks, no other text.

Current project phase: ${phase}. Prioritize risks relevant to this phase.

PROJECT DATA:
${JSON.stringify(snapshot, null, 2)}

Identify and score risks in these categories specific to structural steel:
- Long lead material exposure
- Incomplete approvals blocking work
- Stacked trade conflicts
- Fabrication bottlenecks
- Owner/GC response delays
- Drawing revision impacts on fab
- Submittal cycle delays
- Delivery sequencing risk
- Cost overrun exposure
- Labor availability

For each real risk found in the actual data, return valid JSON array:
[{
  "risk": "specific description from data",
  "category": "category from list",
  "probability": 1-5,
  "impact": 1-5,
  "score": probability * impact,
  "driver": "what specific record drives this",
  "recommendation": "next best action",
  "owner": "PM/GC/Sub/Owner/Vendor",
  "urgency": "Act Now" or "This Week" or "Monitor",
  "linkedRecords": ["RFI-003","DEL-007"]
}]

Score ONLY risks supported by real data. Do NOT generate generic risks. Return valid JSON array only.`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
    });

    if (typeof result === 'string') {
      try {
        const parsed = JSON.parse(result);
        return Array.isArray(parsed)
          ? parsed.sort((a, b) => b.score - a.score)
          : [];
      } catch {
        return [];
      }
    }
    return Array.isArray(result)
      ? result.sort((a, b) => b.score - a.score)
      : [];
  } catch (err) {
    console.error('Risk scoring error:', err);
    return [];
  }
};

export const getRiskSeverity = (score) => {
  if (score >= 17) return { level: 'critical', color: 'var(--status-error)', bg: 'var(--danger-muted)' };
  if (score >= 10) return { level: 'high', color: 'var(--status-warning)', bg: 'var(--warning-muted)' };
  if (score >= 5) return { level: 'medium', color: 'var(--status-warning)', bg: 'var(--warning-muted)' };
  return { level: 'low', color: 'var(--status-success)', bg: 'var(--success-muted)' };
};
