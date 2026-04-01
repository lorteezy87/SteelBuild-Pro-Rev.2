import React, { useEffect, useMemo, useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { PHASES } from "@/utils/phases";

const STATUS_OPTIONS = ["Not Started", "In Progress", "Complete", "Delayed", "On Hold"];
const PRIORITY_OPTIONS = ["Critical", "High", "Normal", "Low"];
const TASK_TYPE_OPTIONS = ["Fabrication", "Delivery", "Install", "Submittal", "RFI", "Milestone", "Task"];

const INITIAL_FORM = {
  status: "",
  phase: "",
  priority: "",
  task_type: "",
  assigned_to: "",
  start_date: "",
  end_date: "",
  percent_complete: "",
};

export default function BulkEditTasksModal({ open, onClose, onApply, count = 0, isSubmitting = false }) {
  const [formData, setFormData] = useState(INITIAL_FORM);

  useEffect(() => {
    if (open) {
      setFormData(INITIAL_FORM);
    }
  }, [open]);

  const patch = useMemo(() => {
    const nextPatch = {};

    Object.entries(formData).forEach(([key, value]) => {
      if (value === "" || value === null || value === undefined) return;
      nextPatch[key] = key === "percent_complete" ? Number(value) : value;
    });

    return nextPatch;
  }, [formData]);

  const hasChanges = Object.keys(patch).length > 0;

  const handleApply = () => {
    if (!hasChanges || isSubmitting) return;
    onApply?.(patch);
  };

  return (
    <Dialog open={open} onOpenChange={(nextOpen) => !nextOpen && onClose?.()}>
      <DialogContent className="max-w-2xl border-[var(--accent-border)] bg-[var(--bg-surface)]">
        <DialogHeader>
          <DialogTitle>Bulk Edit Schedule Tasks</DialogTitle>
          <DialogDescription>
            Apply the same values to {count} selected {count === 1 ? "task" : "tasks"}. Leave any field blank to keep the current value.
          </DialogDescription>
        </DialogHeader>

        <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16 }}>
          <FormField
            label="Status"
            type="select"
            value={formData.status}
            onChange={(value) => setFormData((prev) => ({ ...prev, status: value }))}
            options={STATUS_OPTIONS}
            placeholder="Leave unchanged"
          />
          <FormField
            label="Priority"
            type="select"
            value={formData.priority}
            onChange={(value) => setFormData((prev) => ({ ...prev, priority: value }))}
            options={PRIORITY_OPTIONS}
            placeholder="Leave unchanged"
          />
          <FormField
            label="Phase"
            type="select"
            value={formData.phase}
            onChange={(value) => setFormData((prev) => ({ ...prev, phase: value }))}
            options={PHASES}
            placeholder="Leave unchanged"
          />
          <FormField
            label="Task Type"
            type="select"
            value={formData.task_type}
            onChange={(value) => setFormData((prev) => ({ ...prev, task_type: value }))}
            options={TASK_TYPE_OPTIONS}
            placeholder="Leave unchanged"
          />
          <FormField
            label="Assigned To"
            value={formData.assigned_to}
            onChange={(value) => setFormData((prev) => ({ ...prev, assigned_to: value }))}
            placeholder="Leave unchanged"
          />
          <FormField
            label="% Complete"
            type="number"
            value={formData.percent_complete}
            onChange={(value) => setFormData((prev) => ({ ...prev, percent_complete: value }))}
            placeholder="Leave unchanged"
            min={0}
            max={100}
          />
          <FormField
            label="Start Date"
            type="date"
            value={formData.start_date}
            onChange={(value) => setFormData((prev) => ({ ...prev, start_date: value }))}
          />
          <FormField
            label="End Date"
            type="date"
            value={formData.end_date}
            onChange={(value) => setFormData((prev) => ({ ...prev, end_date: value }))}
          />
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={isSubmitting}>
            Cancel
          </Button>
          <Button onClick={handleApply} disabled={!hasChanges || isSubmitting}>
            {isSubmitting ? "Applying..." : "Apply Changes"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function FormField({
  label,
  type = "text",
  value,
  onChange,
  options = [],
  placeholder,
  min,
  max,
}) {
  const baseStyle = {
    width: "100%",
    background: "var(--bg-sidebar)",
    border: "1px solid var(--accent-border)",
    borderRadius: 8,
    padding: "9px 10px",
    fontFamily: "var(--font-body)",
    fontSize: 12,
    color: "var(--text-primary)",
  };

  return (
    <div>
      <label
        style={{
          display: "block",
          marginBottom: 6,
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          letterSpacing: "0.08em",
          textTransform: "uppercase",
          color: "var(--text-secondary)",
        }}
      >
        {label}
      </label>

      {type === "select" ? (
        <select value={value || ""} onChange={(e) => onChange(e.target.value)} style={baseStyle}>
          <option value="">{placeholder || "Select an option"}</option>
          {options.map((option) => (
            <option key={option} value={option}>
              {option}
            </option>
          ))}
        </select>
      ) : (
        <input
          type={type}
          value={value || ""}
          min={min}
          max={max}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          style={baseStyle}
        />
      )}
    </div>
  );
}
