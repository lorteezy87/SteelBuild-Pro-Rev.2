export const detectAssumptions = (text) => {
  if (!text) return [];
  
  const patterns = [
    { regex: /assuming\s+(.+?)(?:\.|,|;|$)/gi, category: 'Design Completeness' },
    { regex: /assumed\s+(.+?)(?:\.|,|;|$)/gi, category: 'Design Completeness' },
    { regex: /pending\s+(?:confirmation|verification|approval)\s+(.+?)(?:\.|,|;|$)/gi, category: 'Owner Response' },
    { regex: /subject\s+to\s+(.+?)(?:\.|,|;|$)/gi, category: 'Owner Response' },
    { regex: /if\s+(.+?)\s+(?:is|are)\s+(?:correct|confirmed)(.+?)(?:\.|,|;|$)/gi, category: 'Other' },
    { regex: /expects?\s+(.+?)\s+(?:by|on)\s+(.+?)(?:\.|,|;|$)/gi, category: 'Date' },
    { regex: /delivery\s+of\s+(.+?)\s+(?:by|on|in)\s+(.+?)(?:\.|,|;|$)/gi, category: 'Lead Time' },
    { regex: /(?:allocated|assigned|available)\s+(.+?)(?:\.|,|;|$)/gi, category: 'Manpower' },
  ];

  const assumptions = [];
  const seen = new Set();

  patterns.forEach(({ regex, category }) => {
    let match;
    while ((match = regex.exec(text)) !== null) {
      const assumption = match[0].trim().replace(/[,;]+$/, '');
      if (!seen.has(assumption)) {
        seen.add(assumption);
        assumptions.push({
          text: assumption,
          category,
          confidence: 'High',
        });
      }
    }
  });

  return assumptions;
};