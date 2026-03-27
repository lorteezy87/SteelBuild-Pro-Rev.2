import Anthropic from 'npm:@anthropic-ai/sdk';
import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

Deno.serve(async (req) => {
  try {
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        },
      });
    }

    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();
    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const body = await req.json();
    const { prompt, system, max_tokens = 1000 } = body;

    if (!prompt) {
      return Response.json(
        { error: 'prompt is required' },
        { status: 400 }
      );
    }

    const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
    if (!apiKey) {
      console.error('ANTHROPIC_API_KEY secret is not set');
      return Response.json(
        { error: 'API key not configured' },
        { status: 500 }
      );
    }

    const client = new Anthropic({ apiKey });

    const params = {
      model: 'claude-sonnet-4-20250514',
      max_tokens,
      messages: [
        { role: 'user', content: prompt }
      ],
    };

    if (system) {
      params.system = system;
    }

    const message =
      await client.messages.create(params);

    const text =
      message.content?.[0]?.text || '';

    return Response.json({ text });

  } catch (err) {
    console.error('anthropicProxy error:', err);
    return Response.json(
      {
        error: err.message || 'Internal server error',
        details: String(err),
      },
      { status: 500 }
    );
  }
});