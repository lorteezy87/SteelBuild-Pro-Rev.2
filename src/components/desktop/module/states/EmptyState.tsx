import React from "react";
import { Inbox } from "lucide-react";

interface Props {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  icon?: React.ComponentType<any>;
  title?: React.ReactNode;
  message?: React.ReactNode;
  action?: { label: React.ReactNode; onClick: () => void };
}

export default function EmptyState({ icon: Icon = Inbox, title, message, action }: Props) {
  return (
    <div className="desk-state" role="status">
      <Icon size={28} strokeWidth={1.5} aria-hidden="true" />
      {title ? <div className="desk-state__title">{title}</div> : null}
      {message ? <div className="desk-state__msg">{message}</div> : null}
      {action ? (
        <button type="button" onClick={action.onClick} style={{ marginTop: 4, fontSize: 12, color: "var(--text-primary)", background: "var(--bg-surface)", border: "1px solid var(--border-default, var(--border))", borderRadius: 8, padding: "6px 12px", cursor: "pointer" }}>
          {action.label}
        </button>
      ) : null}
    </div>
  );
}
