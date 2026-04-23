import React, { useState } from "react";
import { Plus } from "lucide-react";
import { createPageUrl } from "@/utils";
import { useNavigate } from "react-router-dom";

const QUICK_ADD_OPTIONS = [
  { icon: "⚑", label: "New RFI", action: "rfi" },
  { icon: "$", label: "New CO", action: "changeorder" },
  { icon: "📋", label: "Daily Log", action: "dailylog" },
  { icon: "☰", label: "Work Pkg", action: "workpackage" },
  { icon: "📝", label: "Prod Note", action: "productionnote" },
  { icon: "📷", label: "Upload Photo", action: "photo" },
];

export default function QuickAddFAB() {
  const [expanded, setExpanded] = useState(false);
  const navigate = useNavigate();

  const handleOptionClick = (action) => {
    setExpanded(false);
    // Navigate to the relevant page AND append ?new=1 so the destination
    // page auto-opens its create modal on mount. Previously this just
    // navigated and left the user to hunt for the New button — defeating
    // the purpose of a quick-add FAB. Each destination page handles the
    // `new` query param below in its own useEffect.
    const pageMap = {
      rfi: "RFIs",
      changeorder: "ChangeOrders",
      dailylog: "DailyLogs",
      workpackage: "WorkPackages",
      productionnote: "ProductionNotes",
      photo: "Photos",
    };
    const page = pageMap[action];
    if (!page) return;
    navigate(`${createPageUrl(page)}?new=1`);
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
        {/* Quick Add Options */}
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
                key={i}
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

        {/* FAB Button — Neon Command orange square */}
        <button
          onClick={() => setExpanded(!expanded)}
          style={{
            width: 56,
            height: 56,
            borderRadius: 4,
            background: "var(--accent-orange)",
            border: "none",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            cursor: "pointer",
            color: "#fff",
            boxShadow: "0 0 20px rgba(255,107,0,0.45)",
            transition: "all 0.15s",
            position: "relative",
            zIndex: 501,
          }}
          onMouseEnter={(e) => {
            e.currentTarget.style.transform = "scale(1.06)";
            e.currentTarget.style.boxShadow = "0 0 32px rgba(255,107,0,0.65)";
          }}
          onMouseLeave={(e) => {
            e.currentTarget.style.transform = "scale(1)";
            e.currentTarget.style.boxShadow = "0 0 20px rgba(255,107,0,0.45)";
          }}
        >
          <Plus size={26} strokeWidth={2.5} />
        </button>

        <style>{`
          @keyframes slideIn {
            from {
              opacity: 0;
              transform: translateX(20px);
            }
            to {
              opacity: 1;
              transform: translateX(0);
            }
          }
        `}</style>
      </div>
    </>
  );
}