import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const ANTHROPIC_API_KEY = Deno.env.get('ANTHROPIC_API_KEY');

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, system, maxTokens = 1000, model = 'claude-sonnet-4-6', messages } = await req.json();

    if (!ANTHROPIC_API_KEY) {
      return Response.json({ error: 'ANTHROPIC_API_KEY not configured' }, { status: 500 });
    }

    // Build messages array — use provided messages or fall back to prompt
    const msgs = messages || [{ role: 'user', content: prompt }];

    const body = {
      model,
      max_tokens: maxTokens,
      messages: msgs,
    };
    if (system) body.system = system;

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': ANTHROPIC_API_KEY,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const err = await response.text();
      return Response.json({ error: `Anthropic API error: ${response.status} ${err}` }, { status: response.status });
    }

    const data = await response.json();
    const text = data.content?.[0]?.text || '';
    return Response.json({ text });

  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});