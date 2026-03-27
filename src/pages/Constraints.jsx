import React, { useMemo, useState } from "react";
import { base44 } from "@/api/base44Client";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useProjectContext } from "@/components/shared/useProjectContext";
import { useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import DeleteDialog from "@/components/shared/DeleteDialog";

const CONSTRAINT_TYPES = [
  "Missing Embeds",
  "Anchor Bolt Issue",
  "Approved Submittal Missing",
  "Release Pending",
  "Field Measurement Needed",
  "Access Issue",
  "Crane / Logistics Conflict",
  "Predecessor Not Complete",
  "Material Not Available",
  "Design Change Pending",
  "Other",
];

const TYPE_COLORS = {
  "Missing Embeds": "var(--status-error)",
  "Anchor Bolt Issue": "var(--status-error)",
  "Approved Submittal Missing": "var(--status-warning)",
  "Release Pending": "var(--status-warning)",
  "Field Measurement Needed": "var(--accent)",
  "Access Issue": "var(--status-error)",
  "Crane / Logistics Conflict": "var(--status-error)",
  "Predecessor Not Complete": "var(--status-warning)",
  "Material Not Available": "var(--status-warning)",
  "Design Change Pending": "var(--accent)",
  Other: "var(--text-muted)",
};

const TYPE_ICONS = {
  "Missing Embeds": "⊗",
  "Anchor Bolt Issue": "⊘",
  "Approved Submittal Missing": "▤",
  "Release Pending": "⏸",
  "Field Measurement Needed": "◎",
  "Access Issue": "⛔",
  "Crane / Logistics Conflict": "▲",
  "Predecessor Not Complete": "⛓",
  "Material Not Available": "◻",
  "Design Change Pending": "✦",
  Other: "◈",
};

const PRIORITY_CONFIG = {
  Critical: { color: "var(--status-error)", bg: "var(--danger-muted)", border: "var(--danger-border)", dot: "#FF4444" },
  High: { color: "var(--status-warning)", bg: "var(--warning-muted)", border: "var(--warning-border)", dot: "#FFB95F" },
  Medium: { color: "var(--accent)", bg: "var(--accent-muted)", border: "var(--accent-border)", dot: "#7BD0FF" },
  Low: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)", border: "rgba(144,144,149,0.25)", dot: "#909095" },
};

const STATUS_CONFIG = {
  Open: { color: "var(--status-warning)", bg: "var(--warning-muted)" },
  "In Progress": { color: "var(--accent)", bg: "var(--accent-muted)" },
  Resolved: { color: "var(--status-success)", bg: "var(--success-muted)" },
  Closed: { color: "var(--text-muted)", bg: "rgba(144,144,149,0.1)" },
};

const inputStyle = {
  width: "100%",
  background: "var(--bg-input)",
  border: "1px solid var(--border-default)",
  borderRadius: "var(--radius-input)",
  padding: "8px 12px",
  color: "var(--text-primary)",
  fontFamily: "var(--font-body)",
  fontSize: 12,
  outline: "none",
  boxSizing: "border-box",
};

const labelStyle = {
  fontFamily: "var(--font-mono)",
  fontSize: 9,
  color: "var(--text-muted)",
  letterSpacing: "0.10em",
  textTransform: "uppercase",
  display: "block",
  marginBottom: 4,
};

const formatDate = (d) =>
  d
    ? new Date(`${d}T00:00:00Z`).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "—";
