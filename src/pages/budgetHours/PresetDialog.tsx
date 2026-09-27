import { X } from "lucide-react";
import { PRESET_LIST, type PresetDefinition } from "@/lib/budgetHourPresets";

interface PresetDialogProps {
  open: boolean;
  onClose: () => void;
  onPick: (preset: PresetDefinition) => void;
}

export default function PresetDialog({
  open,
  onClose,
  onPick,
}: PresetDialogProps) {
  if (!open) return null;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 100,
        background: "rgba(0,0,0,0.5)",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <div
        onClick={(event) => event.stopPropagation()}
        style={{
          background: "var(--bg-surface)",
          border: "1px solid var(--border-default)",
          borderRadius: 12,
          padding: 22,
          minWidth: 460,
          maxWidth: 560,
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            marginBottom: 16,
          }}
        >
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 11,
              fontWeight: 700,
              letterSpacing: "0.12em",
              textTransform: "uppercase",
              color: "var(--text-primary)",
            }}
          >
            Set Up From Template
          </div>
          <button
            onClick={onClose}
            style={{
              background: "transparent",
              border: "none",
              color: "var(--text-muted)",
              cursor: "pointer",
              padding: 0,
            }}
          >
            <X size={16} />
          </button>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          {PRESET_LIST.map((preset) => (
            <button
              key={preset.id}
              onClick={() => onPick(preset)}
              style={{
                textAlign: "left",
                background: "var(--bg-surface-low)",
                border: "1px solid var(--border-default)",
                borderRadius: 8,
                padding: "12px 14px",
                cursor: "pointer",
                transition: "border-color 0.12s, background 0.12s",
              }}
              onMouseEnter={(event) => {
                event.currentTarget.style.borderColor = "var(--accent-border)";
                event.currentTarget.style.background = "var(--hover-bg)";
              }}
              onMouseLeave={(event) => {
                event.currentTarget.style.borderColor =
                  "var(--border-default)";
                event.currentTarget.style.background =
                  "var(--bg-surface-low)";
              }}
            >
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 13,
                  fontWeight: 700,
                  color: "var(--text-primary)",
                  marginBottom: 4,
                }}
              >
                {preset.label}
              </div>
              <div
                style={{
                  fontFamily: "var(--font-body)",
                  fontSize: 11,
                  color: "var(--text-secondary)",
                  lineHeight: 1.4,
                }}
              >
                {preset.description}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
