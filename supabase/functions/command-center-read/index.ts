import "jsr:@supabase/functions-js@2.117.2/edge-runtime.d.ts";

// Discontinued by the product owner. Never load credentials or process bodies.
Deno.serve(() => new Response(JSON.stringify({ error: "desktop_companion_discontinued" }), {
  status: 410,
  headers: { "content-type": "application/json", "cache-control": "no-store" },
}));
