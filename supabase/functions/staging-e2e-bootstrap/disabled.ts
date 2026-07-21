import "jsr:@supabase/functions-js/edge-runtime.d.ts";

Deno.serve(() =>
  new Response(JSON.stringify({ error: "Maintenance endpoint permanently closed." }), {
    status: 410,
    headers: { "content-type": "application/json", "cache-control": "no-store" },
  })
);
