export const corsHeaders: Record<string, string> = {
  "Access-Control-Allow-Origin": "*",
  // Include sentry-trace + baggage so the browser's Sentry tracing headers
  // don't trip the CORS preflight on browser→function calls.
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type, sentry-trace, baggage",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

export function jsonResponse(data: unknown, status = 200): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export function errorResponse(status: number, message: string): Response {
  return jsonResponse({ error: message }, status);
}
