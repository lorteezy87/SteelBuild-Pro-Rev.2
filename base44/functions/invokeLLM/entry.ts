import { createClientFromRequest } from 'npm:@base44/sdk@0.8.21';

const stringifyContent = (content: unknown): string => {
  if (typeof content === 'string') return content;
  if (Array.isArray(content)) {
    return content
      .map((item) => {
        if (typeof item === 'string') return item;
        if (item && typeof item === 'object' && 'text' in item) {
          return String((item as { text?: unknown }).text || '');
        }
        return '';
      })
      .filter(Boolean)
      .join('\n');
  }
  return String(content || '');
};

const buildPrompt = ({
  prompt,
  system,
  messages,
}: {
  prompt?: string;
  system?: string;
  messages?: Array<{ role?: string; content?: unknown }>;
}) => {
  const parts: string[] = [];

  if (system) {
    parts.push(`SYSTEM:\n${system}`);
  }

  if (Array.isArray(messages) && messages.length > 0) {
    const rendered = messages
      .map((message) => {
        const role = String(message?.role || 'user').toUpperCase();
        const content = stringifyContent(message?.content);
        return content ? `${role}:\n${content}` : null;
      })
      .filter(Boolean);

    if (rendered.length > 0) {
      parts.push(rendered.join('\n\n'));
    }
  } else if (prompt) {
    parts.push(prompt);
  }

  return parts.join('\n\n').trim();
};

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    let user = null;
    try {
      user = await base44.auth.me();
    } catch {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { prompt, system, messages } = await req.json();
    const finalPrompt = buildPrompt({ prompt, system, messages });

    if (!finalPrompt) {
      return Response.json({ error: 'A prompt or messages payload is required' }, { status: 400 });
    }

    const result = await base44.integrations.Core.InvokeLLM({
      prompt: finalPrompt,
    });

    const text =
      typeof result === 'string'
        ? result
        : typeof result?.text === 'string'
          ? result.text
          : JSON.stringify(result);

    return Response.json({ text });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return Response.json({ error: message }, { status: 500 });
  }
});
