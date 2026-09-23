import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";

// index.ts imports Deno-only modules, so Vitest cannot execute it. These pin the
// wiring the pure senderPolicy tests cannot see: that the entrypoint actually
// routes through the policy, and in the right order. The Deno typecheck
// (`Release Edge Function typecheck` in ci.yml) covers that it compiles.
const source = fs.readFileSync(
  path.resolve(process.cwd(), "supabase/functions/email-send/index.ts"),
  "utf8",
);
const handler = source.slice(source.indexOf("async function handle("));

function indexIn(text: string, needle: string): number {
  const at = text.indexOf(needle);
  expect(at, `expected to find ${needle}`).toBeGreaterThanOrEqual(0);
  return at;
}

describe("email-send entrypoint (SEC-N1)", () => {
  it("decides the sender through the server-side policy", () => {
    expect(handler).toContain("resolveSender(");
    // The verified-sender list is read from the service-role-only table,
    // scoped to the project's org.
    expect(source).toContain("/rest/v1/email_verified_senders?org_id=eq.");
    expect(source).toContain('Deno.env.get("EMAIL_SEND_ALLOWED_DOMAINS")');
  });

  it("no longer counts sends from rows a member can delete", () => {
    // email_messages is member-writable (FOR ALL policy), so deleting your own
    // outbound rows used to reset the hourly cap.
    expect(source).not.toMatch(/email_messages\?sent_by=eq\./);
    expect(source).toContain("/rest/v1/rpc/email_send_reserve");
  });

  it("verifies the sender and reserves a slot before any provider call", () => {
    const resolve = indexIn(handler, "resolveSender(");
    const reserve = indexIn(handler, "reserveSendSlot(");
    const graph = indexIn(handler, "sendViaMsGraph(");
    const resend = indexIn(handler, "sendViaResend(");
    expect(resolve).toBeLessThan(reserve);
    expect(reserve).toBeLessThan(graph);
    expect(reserve).toBeLessThan(resend);
  });

  it("records the server-resolved sender, not the caller-supplied one", () => {
    expect(source).not.toContain("sender_email: req.from_email");
    expect(source).toContain("sender_email: sender.email");
  });

  it("builds the Resend from header through the sanitizer", () => {
    expect(handler).toContain("formatFromHeader(");
    expect(handler).not.toMatch(/`\$\{fromName\} <\$\{fromEmail\}>`/);
  });
});
