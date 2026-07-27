import React, { useEffect, useState } from "react";
import { Modal, Button } from "@/components/design-system";
import { toast } from "sonner";
import { buildRfiNudge, parseEmails } from "@/lib/rfiNudge";
import { sendEmail } from "@/services/emailSendService";

const fieldStyle = {
  width: "100%", background: "var(--bg-input)", border: "1px solid var(--border-default)",
  borderRadius: 6, padding: "8px 10px", fontFamily: "var(--font-body)", fontSize: 12,
  color: "var(--text-primary)", outline: "none",
};
const labelStyle = {
  fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)",
  letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4, display: "block",
};

/**
 * NudgeDraftModal — review-and-send a pre-drafted RFI follow-up.
 *
 * The draft is generated deterministically (buildRfiNudge). NOTHING is sent
 * automatically: the email only goes out when the user explicitly clicks
 * "Send Email", and "Copy" lets them paste it into their own client instead.
 */
export default function NudgeDraftModal({ rfi, open, onClose, fromName }) {
  const [to, setTo] = useState("");
  const [subject, setSubject] = useState("");
  const [body, setBody] = useState("");
  const [sending, setSending] = useState(false);

  useEffect(() => {
    if (!rfi || !open) return;
    const draft = buildRfiNudge(rfi, { fromName });
    setTo(draft.suggestedTo.join(", "));
    setSubject(draft.subject);
    setBody(draft.body);
    setSending(false);
  }, [rfi, open, fromName]);

  if (!rfi || !open) return null;

  const recipients = parseEmails(to);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(`Subject: ${subject}\n\n${body}`);
      toast.success("Draft copied to clipboard");
    } catch {
      toast.error("Could not copy to clipboard");
    }
  };

  const handleSend = async () => {
    if (recipients.length === 0) {
      toast.error("Add at least one recipient email before sending");
      return;
    }
    setSending(true);
    try {
      const result = await sendEmail({
        project_id: rfi.project_id,
        to: recipients,
        subject,
        body_text: body,
      });
      if (result.success) {
        toast.success(`Nudge sent to ${recipients.join(", ")}`);
        onClose?.();
      } else {
        toast.error(`Send failed: ${result.error || "unknown error"}`);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      eyebrow={`${rfi.rfi_number || "RFI"} / NUDGE`}
      title="Draft follow-up email"
      width={640}
      footer={
        <>
          <Button variant="ghost" onClick={onClose}>Cancel</Button>
          <Button variant="outline" icon="copy" onClick={handleCopy}>Copy</Button>
          <Button
            variant="primary"
            icon="mail"
            onClick={handleSend}
            disabled={sending || recipients.length === 0}
          >
            {sending ? "Sending…" : "Send Email"}
          </Button>
        </>
      }
    >
      <div style={{
        display: "flex", gap: 8, alignItems: "flex-start",
        background: "var(--accent-muted, var(--info-muted))",
        border: "1px solid var(--border-default)", borderRadius: 8,
        padding: "8px 12px", marginBottom: 14,
      }}>
        <span style={{ fontFamily: "var(--font-body)", fontSize: 11, color: "var(--text-secondary)", lineHeight: 1.5 }}>
          Review and edit this draft before sending. <strong>Nothing is sent automatically</strong> —
          the email goes out only when you click <strong>Send Email</strong>, or use <strong>Copy</strong> to send it from your own mail client.
        </span>
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>To (comma-separated)</label>
        <input
          style={fieldStyle}
          value={to}
          onChange={(e) => setTo(e.target.value)}
          placeholder="reviewer@firm.com, gc@builder.com"
        />
        {to.trim() && recipients.length === 0 && (
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--status-error)", marginTop: 4 }}>
            No valid email address detected.
          </div>
        )}
      </div>

      <div style={{ marginBottom: 12 }}>
        <label style={labelStyle}>Subject</label>
        <input style={fieldStyle} value={subject} onChange={(e) => setSubject(e.target.value)} />
      </div>

      <div>
        <label style={labelStyle}>Message</label>
        <textarea
          style={{ ...fieldStyle, minHeight: 220, resize: "vertical", fontFamily: "var(--font-body)", lineHeight: 1.5 }}
          value={body}
          onChange={(e) => setBody(e.target.value)}
        />
      </div>
    </Modal>
  );
}
