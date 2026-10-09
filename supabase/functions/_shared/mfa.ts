import { jsonResponse } from "./cors.ts";

interface VerifiedAuthUser {
  id: string;
  factors?: { status: string }[];
}

/**
 * Call ONLY after Auth getUser(token) or GET /auth/v1/user accepted this exact
 * bearer token. Decoding below is not signature verification. Factors come from
 * that trusted, current Auth response, never JWT/user_metadata or request JSON.
 * Auth omits `factors` for users without any factors (supabase-js User contract).
 */
export function mfaDenialForVerifiedUser(
  user: VerifiedAuthUser,
  authorization: string,
  request: Request,
): Response | null {
  let claims: { sub?: string; aal?: string };
  try {
    const token = authorization.match(/^Bearer (\S+)$/i)?.[1];
    const parts = token?.split(".");
    if (!parts || parts.length !== 3) throw new Error("Invalid token");
    const payload = parts[1].replace(/-/g, "+").replace(/_/g, "/");
    claims = JSON.parse(atob(payload.padEnd(Math.ceil(payload.length / 4) * 4, "=")));
    if (!claims || claims.sub !== user.id || !user.id) throw new Error("Wrong subject");
    if (claims.aal !== undefined && claims.aal !== "aal1" && claims.aal !== "aal2") {
      throw new Error("Unknown assurance level");
    }
  } catch {
    return jsonResponse({ error: "Invalid or expired session", code: "invalid_session" }, 401, request);
  }

  // A malformed Auth response cannot be treated as evidence of no enrollment.
  if (user.factors !== undefined && (!Array.isArray(user.factors) || user.factors.some(
    (factor) => !factor || !["verified", "unverified"].includes(factor.status),
  ))) {
    return jsonResponse({ error: "Unable to verify MFA enrollment", code: "mfa_check_failed" }, 503, request);
  }
  if (user.factors?.some((factor) => factor.status === "verified") && claims.aal !== "aal2") {
    return jsonResponse({ error: "Complete multi-factor authentication to continue", code: "mfa_required" }, 403, request);
  }
  return null;
}
