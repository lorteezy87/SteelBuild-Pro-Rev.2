import React, { useState } from "react";
import { Plus } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";

const QUICK_ADD_OPTIONS = [
  { icon: "⚑", label: "Create RFI", action: "rfi" },
  { icon: "$", label: "Create CO", action: "changeorder" },
  { icon: "📋", label: "Create Daily Log", action: "dailylog" },
  { icon: "☰", label: "Create Work Package", action: "workpackage" },
  { icon: "📝", label: "Create Note", action: "productionnote" },
  { icon: "📷", label: "Upload Photo", action: "photo" },
];

export default function QuickAddFAB() {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const handleOptionClick = (action) => {
    setExpanded(false);
    const pageMap = {
      rfi: "RFIs",
      changeorder: "ChangeOrders",
      dailylog: "DailyLogs",
      workpackage: "WorkPackages",
      productionnote: "ProductionNotes",
      photo: "Photos",
    };
    navigate(createPageUrl(pageMap[action]));
  };

  return (
    <>
      {expanded && (
        <div
          onClick={() => setExpanded(false)}
          style={{
            position: "fixed",
            inset: 0,
            zIndex: 490,
          }}
        />
      )}

      <div
        style={{
          position: "fixed",
          bottom: 24,
          right: 24,
          zIndex: 500,
        }}
      >
        {expanded && (
          <div
            style={{
              position: "absolute",
              bottom: 80,
              right: 0,
              display: "flex",
              flexDirection: "column",
              gap: 8,
            }}
          >
            {QUICK_ADD_OPTIONS.map((opt, i) => (
              <div
                key={opt.action}
                onClick={() => handleOptionClick(opt.action)}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 10,
                  background: "var(--bg-surface-low)",
                  border: "1px solid var(--accent-border)",
                  borderRadius: 8,
                  padding: "8px 12px",
                  cursor: "pointer",
                  transition: "all 0.15s",
                  animation: `slideIn 0.3s ease-out ${i * 0.05}s both`,
                }}
                onMouseEnter={(e) => {
                  e.currentTarget.style.background = "var(--bg-surface-mid)";
                  e.currentTarget.style.borderColor = "var(--accent)";
                }}
                onMouseLeave={(e) => {
                  e.currentTarget.style.background = "var(--bg-surface-low)";
                  e.currentTarget.style.borderColor = "var(--accent-border)";
                }}
              >
                <span style={{ fontSize: 16 }}>{opt.icon}</span>
                <span
                  style={{
                    fontFamily: "var(--font-body)",
                    fontSize: 11,
                    color: "var(--text-primary)",
                    fontWeight: 500,
                    whiteSpace: "nowrap",
                  }}
                >
                  {opt.label}
                </span>
              </div>
            ))}
          </div>
        )}

        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            background: "var(--accent)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            boxShadow: "0 8px 24px var(--accent-muted)",
            transition: "all 0.2s",
            position: "relative",
            zIndex: 501,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.1)";
            e.currentTarget.style.boxShadow = "0 12px 32px var(--accent-border)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 8px 24px var(--accent-muted)";
          }}
        >
          <Plus size={24} strokeWidth={2.5} />
        </button>
      </div>
    </>
  );
}
