import { base44 } from '@/api/base44Client';

export const assessDataCompleteness = (snapshot) => {
  const checks = [
    snapshot?.rfis?.openCount !== undefined,
    snapshot?.budget?.contractValue > 0,
    snapshot?.workPackages?.activeItems?.length >= 0,
    snapshot?.deliveries?.upcomingItems?.length >= 0,
  ];
  const score = checks.filter(Boolean).length / checks.length * 100;
  return Math.round(score);
};

export const addConfidenceScore = async (response, snapshot) => {
  try {
    const completeness = assessDataCompleteness(snapshot);
    const recordCount = snapshot?._lineage?.length || 0;

    const prompt = `Rate your confidence in the following response on a 0-100 scale. Return ONLY valid JSON, no other text, no markdown code blocks.

RESPONSE TO RATE:
${response}

DATA SOURCE QUALITY:
- Records available: ${recordCount}
- Data completeness: ${completeness}%

Rate each dimension and return valid JSON:
{
  "overall": 0-100,
  "source": "contract_language" or "approved_documents" or "historical_pattern" or "inference" or "incomplete_data",
  "dimensions": {
    "dataAvailability": 0-100,
    "dataRecency": 0-100,
    "dataCompleteness": 0-100,
    "inferenceRisk": 0-100
  },
  "caveats": ["specific thing that could be wrong"],
  "missingData": ["what data would improve this"]
}`;

    const result = await base44.integrations.Core.InvokeLLM({
      prompt,
    });

    if (typeof result === 'string') {
      try {
        return JSON.parse(result);
      } catch {
        return {
          overall: 60,
          source: 'incomplete_data',
          dimensions: { dataAvailability: 60, dataRecency: 60, dataCompleteness: 60, inferenceRisk: 60 },
          caveats: ['Could not assess confidence'],
          missingData: [],
        };
      }
    }
    return result;
  } catch (err) {
    console.error('Confidence scoring error:', err);
    return null;
  }
};

export const getConfidenceColor = (score) => {
  if (score >= 80) return '#00D68F';
  if (score >= 60) return '#FFB400';
  return '#FF3D3D';
};