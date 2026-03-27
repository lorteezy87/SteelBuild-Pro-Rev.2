import { createClientFromRequest } from 'npm:@base44/sdk@0.8.20';

Deno.serve(async (req) => {
  try {
    const base44 = createClientFromRequest(req);
    const user = await base44.auth.me();

    if (!user) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 });
    }
    if (user.role !== 'admin') {
      return Response.json({ error: 'Forbidden: Admin access required' }, { status: 403 });
    }

    const url = new URL(req.url);
    const pathParts = url.pathname.split('/');
    const action = pathParts[pathParts.length - 1]; // 'memory' or memoryId

    const apiKey = Deno.env.get('BASE44apiKEY');
    const appId = Deno.env.get('BASE44_APP_ID');
    const agentName = 'default';

    if (!apiKey || !appId) {
      return Response.json({ error: 'Configuration error' }, { status: 500 });
    }

    const baseUrl = `https://app.base44.com/api/apps/${appId}/agents`;

    if (req.method === 'GET') {
      // Fetch memories
      const res = await fetch(`${baseUrl}/${agentName}/memory`, {
        headers: { 'api_key': apiKey }
      });
      const data = await res.json();
      return Response.json(Array.isArray(data) ? data : []);
    }

    if (req.method === 'POST') {
      // Add memory
      const body = await req.json();
      const res = await fetch(`${baseUrl}/${agentName}/memory`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'api_key': apiKey
        },
        body: JSON.stringify({
          content: body.content,
          category: body.category
        })
      });
      const data = await res.json();
      return Response.json(data);
    }

    if (req.method === 'DELETE') {
      // Delete memory
      const memoryId = url.searchParams.get('memoryId');
      const res = await fetch(`${baseUrl}/${agentName}/memory/${memoryId}`, {
        method: 'DELETE',
        headers: { 'api_key': apiKey }
      });
      return Response.json({ success: true });
    }

    return Response.json({ error: 'Method not allowed' }, { status: 405 });
  } catch (error) {
    return Response.json({ error: error.message }, { status: 500 });
  }
});