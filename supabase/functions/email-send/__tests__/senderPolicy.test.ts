import { describe, expect, it } from "vitest";

import {
  emailDomain,
  formatFromHeader,
  interpretReservation,
  parseAllowedDomains,
  parseHourlyLimit,
  resolveSender,
} from "../senderPolicy";

// SEC-N1 (audit 2026-09-23): any project member could add an email_accounts row
// with any address, and email-send only checked that `from` matched an ACTIVE
// row. A self-signed-up user is the owner of their own org, so an admin-only
// write policy alone cannot stop them: the server has to decide which address a
// tenant may send as, from data the tenant cannot write.

const ALLOWED = parseAllowedDomains("acme-steel.example, Platform.Example ");

describe("resolveSender", () => {
  const verified = ["projects@acme-steel.example"];

  it("refuses an active project account the platform has not verified", () => {
    // The attack: a tenant admin adds ceo@acme-steel.example as an account and
    // sends. Before the fix the only test was "is it an active row".
    const decision = resolveSender({
      requestedFrom: "ceo@acme-steel.example",
      activeAccounts: [{ email_address: "ceo@acme-steel.example" }],
      verifiedAddresses: verified,
      allowedDomains: ALLOWED,
    });
    expect(decision).toMatchObject({ ok: false, status: 403 });
  });

  it("does not fall back to an unverified account when no from is supplied", () => {
    // Every real caller omits from_email and takes the first active account.
    const decision = resolveSender({
      activeAccounts: [{ email_address: "ceo@acme-steel.example" }],
      verifiedAddresses: verified,
      allowedDomains: ALLOWED,
    });
    expect(decision).toMatchObject({ ok: false, status: 403 });
  });

  it("defaults to the first active account that is verified and on an allowed domain", () => {
    const decision = resolveSender({
      activeAccounts: [
        { email_address: "ceo@acme-steel.example", display_name: "CEO" },
        { email_address: "Projects@Acme-Steel.example", display_name: "Acme Projects" },
      ],
      verifiedAddresses: verified,
      allowedDomains: ALLOWED,
    });
    expect(decision).toEqual({ ok: true, email: "Projects@Acme-Steel.example", name: "Acme Projects" });
  });

  it("accepts a requested address that is active and verified, case-insensitively", () => {
    const decision = resolveSender({
      requestedFrom: " PROJECTS@acme-steel.example ",
      requestedName: "Site Team",
      activeAccounts: [{ email_address: "projects@acme-steel.example", display_name: "Acme Projects" }],
      verifiedAddresses: ["Projects@ACME-STEEL.example"],
      allowedDomains: ALLOWED,
    });
    expect(decision).toEqual({ ok: true, email: "projects@acme-steel.example", name: "Site Team" });
  });

  it("refuses a verified address that is not an active account on this project", () => {
    // Verification is per org; the project admin still chooses which mailbox a
    // project uses, and a deactivated account must stop sending.
    const decision = resolveSender({
      requestedFrom: "projects@acme-steel.example",
      activeAccounts: [],
      verifiedAddresses: verified,
      allowedDomains: ALLOWED,
    });
    expect(decision).toMatchObject({ ok: false, status: 403 });
  });

  it("refuses a verified address whose domain the platform has not enabled", () => {
    const decision = resolveSender({
      requestedFrom: "projects@acme-steel.example",
      activeAccounts: [{ email_address: "projects@acme-steel.example" }],
      verifiedAddresses: verified,
      allowedDomains: parseAllowedDomains("platform.example"),
    });
    expect(decision).toMatchObject({ ok: false, status: 403 });
  });

  it("matches domains exactly, not by suffix", () => {
    const decision = resolveSender({
      requestedFrom: "projects@evil-acme-steel.example",
      activeAccounts: [{ email_address: "projects@evil-acme-steel.example" }],
      verifiedAddresses: ["projects@evil-acme-steel.example"],
      allowedDomains: ALLOWED,
    });
    expect(decision).toMatchObject({ ok: false, status: 403 });
  });

  it("fails closed when no sending domain is configured", () => {
    const decision = resolveSender({
      requestedFrom: "projects@acme-steel.example",
      activeAccounts: [{ email_address: "projects@acme-steel.example" }],
      verifiedAddresses: verified,
      allowedDomains: parseAllowedDomains(undefined),
    });
    expect(decision).toMatchObject({ ok: false, status: 503 });
  });

  it("keeps the existing 400 when the project has no active account at all", () => {
    const decision = resolveSender({
      activeAccounts: [],
      verifiedAddresses: verified,
      allowedDomains: ALLOWED,
    });
    expect(decision).toMatchObject({ ok: false, status: 400 });
  });

  it("never lets the display name smuggle in a second address", () => {
    const decision = resolveSender({
      requestedName: 'x <ceo@acme-steel.example> "',
      activeAccounts: [{ email_address: "projects@acme-steel.example" }],
      verifiedAddresses: verified,
      allowedDomains: ALLOWED,
    });
    expect(decision.ok).toBe(true);
    if (!decision.ok) return;
    const header = formatFromHeader(decision.name, decision.email);
    expect(header.match(/</g)).toHaveLength(1);
    expect(header.endsWith("<projects@acme-steel.example>")).toBe(true);
  });
});

describe("formatFromHeader", () => {
  it("quotes the display name and strips header-significant characters", () => {
    expect(formatFromHeader('Acme "Projects"\r\nBcc: x', "a@acme-steel.example"))
      .toBe('"Acme Projects Bcc: x" <a@acme-steel.example>');
  });

  it("returns the bare address when the name is blank after cleaning", () => {
    expect(formatFromHeader(" <> ", "a@acme-steel.example")).toBe("a@acme-steel.example");
  });
});

describe("emailDomain / parseAllowedDomains", () => {
  it("lower-cases and trims", () => {
    expect(emailDomain(" A@Acme-Steel.Example ")).toBe("acme-steel.example");
    expect([...parseAllowedDomains(" A.example ,, b.EXAMPLE,@c.example ")]).toEqual([
      "a.example",
      "b.example",
      "c.example",
    ]);
  });

  it("rejects malformed addresses", () => {
    expect(emailDomain("no-at-sign")).toBeNull();
    expect(emailDomain("a@b@c.example")).toBeNull();
    expect(emailDomain("a@")).toBeNull();
    expect(emailDomain(42)).toBeNull();
  });
});

describe("parseHourlyLimit", () => {
  it("defaults when unset and honours an explicit 0 as disabled", () => {
    expect(parseHourlyLimit(undefined)).toBe(100);
    expect(parseHourlyLimit("")).toBe(100);
    expect(parseHourlyLimit("25")).toBe(25);
    expect(parseHourlyLimit("0")).toBe(0);
  });

  it("does not turn a typo into an unlimited cap", () => {
    expect(parseHourlyLimit("1O0")).toBe(100);
    expect(parseHourlyLimit("-5")).toBe(100);
    expect(parseHourlyLimit("2.5")).toBe(100);
  });
});

describe("interpretReservation", () => {
  const id = "0f8fad5b-d9cb-469f-a165-70867728950e";

  it("allows when the server reserved a slot", () => {
    expect(interpretReservation([{ allowed: true, event_id: id, sent_last_hour: 3 }]))
      .toEqual({ ok: true, eventId: id });
    // PostgREST may unwrap a single-row set-returning function.
    expect(interpretReservation({ allowed: true, event_id: id, sent_last_hour: 1 }))
      .toEqual({ ok: true, eventId: id });
  });

  it("returns 429 without leaking the configured cap", () => {
    const result = interpretReservation([{ allowed: false, event_id: null, sent_last_hour: 100 }]);
    expect(result).toMatchObject({ ok: false, status: 429 });
    expect(JSON.stringify(result)).not.toContain("100");
  });

  it("fails closed on anything it cannot read", () => {
    for (const payload of [null, [], "ok", [{}], [{ allowed: "true" }], [{ allowed: true, event_id: "x" }]]) {
      expect(interpretReservation(payload)).toMatchObject({ ok: false, status: 503 });
    }
  });
});
