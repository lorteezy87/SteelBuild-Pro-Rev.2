import { createClientFromRequest } from "npm:@base44/sdk@0.8.20";

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: "Unauthorized" }, { status: 401 });
    }
    const payload = await req.json();
    const {
      pdfText,
      drawingNumber,
      displayName,
      discipline,
      revisionNumber,
      markupCount,
      linkedRFIs
    } = payload;

    const apiKey = Deno.env.get("ANTHROPIC_API_KEY");
    if (!apiKey) {
      return Response.json(
        { error: "Claude API key not configured" },
        { status: 500 }
      );
    }

    const systemPrompt = `You are a licensed structural steel construction expert and drawing reviewer with 20+ years experience. You review structural drawings, shop drawings, and construction documents. You have deep expertise in AISC standards, AWS welding codes, IBC, ASCE 7, and steel construction practices.

Analyze the drawing content and return ONLY a JSON response with NO preamble or explanation outside JSON.

Return this exact structure:
{
  "summary": "2-3 sentence overview",
  "overallScore": 0-100,
  "completeness": {
    "score": 0-100,
    "issues": [
      {
        "id": "C001",
        "severity": "critical|high|medium|low|info",
        "title": "short title",
        "description": "detailed description",
        "suggestRFI": true|false
      }
    ]
  },
  "coordination": {
    "score": 0-100,
    "conflicts": []
  },
  "constructability": {
    "score": 0-100,
    "issues": []
  },
  "codeCompliance": {
    "score": 0-100,
    "issues": []
  },
  "drawingQuality": {
    "score": 0-100,
    "issues": []
  },
  "rfiPredictions": [
    {
      "likelihood": "high|medium|low",
      "topic": "what the RFI will be about",
      "reason": "why"
    }
  ],
  "positives": [
    {
      "title": "what is done well",
      "description": "detail"
    }
  ],
  "priorityActions": [
    "Most important action",
    "Second action",
    "Third action"
  ]
}`;

    const userMessage = `
DRAWING INFORMATION:
Sheet: ${drawingNumber}
Title: ${displayName}
Discipline: ${discipline}
Revision: ${revisionNumber}
Existing Markups: ${markupCount}

DRAWING TEXT CONTENT (from PDF):
${pdfText.slice(0, 8000)}

${linkedRFIs && linkedRFIs.length > 0 ? `EXISTING OPEN RFIs:
${linkedRFIs.map((r) => `${r.rfiNumber}: ${r.title} [${r.status}]`).join("\n")}` : ""}

Analyze this drawing for completeness, coordination issues, constructability, code compliance, and quality. Return only the JSON.`;

    const response = await fetch("https://api.anthropic.com/v1/messages", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-api-key": apiKey,
        "anthropic-version": "2023-06-01"
      },
      body: JSON.stringify({
        model: "claude-opus-4-1-20250805",
        max_tokens: 4000,
        system: systemPrompt,
        messages: [{ role: "user", content: userMessage }]
      })
    });

    if (!response.ok) {
      const error = await response.text();
      console.error("Claude API error:", error);
      return Response.json(
        { error: "Claude API request failed" },
        { status: 500 }
      );
    }

    const data = await response.json();
    const rawText = data.content
      .filter((b) => b.type === "text")
      .map((b) => b.text)
      .join("");

    // Strip markdown fences
    const jsonStr = rawText
      .replace(/```json\n?/g, "")
      .replace(/```\n?/g, "")
      .trim();

    const results = JSON.parse(jsonStr);

    return Response.json(results);
  } catch (err) {
    console.error("Analysis error:", err);
    return Response.json(
      { error: err.message },
      { status: 500 }
    );
  }
});
