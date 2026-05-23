/**
 * emailSendService.test.js — reply/reply-all default construction.
 *
 * buildReplyDefaults is pure: it derives To/CC, the Re: subject, threading
 * ids, and the quoted body from an original message. The recipient list
 * fields can arrive as arrays, JSON strings, or comma-separated strings, so
 * the parsing tolerance matters.
 */

import { describe, it, expect, vi } from "vitest";

// emailSendService imports the supabase client at module load; stub it.
vi.mock("@/lib/supabase", () => ({ supabase: { auth: {} } }));

import { buildReplyDefaults } from "../emailSendService";

const baseMessage = {
  id: "m1",
  external_id: "<abc@mail.example>",
  thread_id: null,
  subject: "Drawing question",
  sender_email: "sender@x.com",
  sender_name: "Sam Sender",
  recipients: JSON.stringify(["me@x.com", "other@x.com"]),
  cc: ["cc1@x.com", "sender@x.com"],
  body_text: "Line one\nLine two",
  received_at: "2026-05-01T10:00:00Z",
};

describe("buildReplyDefaults — reply", () => {
  it("addresses only the sender and carries threading ids", () => {
    const d = buildReplyDefaults(baseMessage, "reply", "me@x.com");
    expect(d.to).toEqual(["sender@x.com"]);
    expect(d.cc).toEqual([]);
    expect(d.subject).toBe("Re: Drawing question");
    expect(d.in_reply_to_external_id).toBe("<abc@mail.example>");
    expect(d.reply_to_message_id).toBe("m1");
    // thread_id falls back to external_id when thread_id is absent
    expect(d.thread_id).toBe("<abc@mail.example>");
  });

  it("does not double-prefix an existing Re: subject", () => {
    const d = buildReplyDefaults({ ...baseMessage, subject: "Re: Already replied" }, "reply");
    expect(d.subject).toBe("Re: Already replied");
  });

  it("prefers an existing thread_id over external_id", () => {
    const d = buildReplyDefaults({ ...baseMessage, thread_id: "thread-99" }, "reply");
    expect(d.thread_id).toBe("thread-99");
  });

  it("yields an empty To when the original has no sender", () => {
    const d = buildReplyDefaults({ ...baseMessage, sender_email: null }, "reply");
    expect(d.to).toEqual([]);
  });

  it("quotes the original body attributed to the sender", () => {
    const d = buildReplyDefaults(baseMessage, "reply");
    expect(d.quoted_body).toContain("Sam Sender wrote:");
    expect(d.quoted_body).toContain("> Line one");
    expect(d.quoted_body).toContain("> Line two");
  });
});

describe("buildReplyDefaults — reply_all", () => {
  it("CCs the other recipients, excluding the sender and current user", () => {
    const d = buildReplyDefaults(baseMessage, "reply_all", "me@x.com");
    expect(d.to).toEqual(["sender@x.com"]);
    // recipients(me, other) + cc(cc1, sender) minus sender + minus me
    expect(d.cc).toContain("other@x.com");
    expect(d.cc).toContain("cc1@x.com");
    expect(d.cc).not.toContain("sender@x.com");
    expect(d.cc).not.toContain("me@x.com");
    expect(d.cc).toHaveLength(2);
  });

  it("excludes the current user case-insensitively", () => {
    const d = buildReplyDefaults(baseMessage, "reply_all", "ME@X.COM");
    expect(d.cc).not.toContain("me@x.com");
  });

  it("parses recipients given as a comma-separated string", () => {
    const msg = { ...baseMessage, recipients: "a@x.com, b@x.com", cc: null };
    const d = buildReplyDefaults(msg, "reply_all", "a@x.com");
    expect(d.cc).toEqual(["b@x.com"]);
  });

  it("parses recipients given as a plain array", () => {
    const msg = { ...baseMessage, recipients: ["p@x.com", "q@x.com"], cc: [] };
    const d = buildReplyDefaults(msg, "reply_all", "");
    expect(d.cc).toContain("p@x.com");
    expect(d.cc).toContain("q@x.com");
  });
});
