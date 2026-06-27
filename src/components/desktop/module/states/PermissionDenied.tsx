import React from "react";
import { Lock } from "lucide-react";

interface Props {
  message?: React.ReactNode;
}

export default function PermissionDenied({ message = "You don't have access to this." }: Props) {
  return (
    <div className="desk-state" role="alert">
      <Lock size={28} strokeWidth={1.5} aria-hidden="true" />
      <div className="desk-state__title">Access denied</div>
      <div className="desk-state__msg">{message}</div>
    </div>
  );
}
