/**
 * LauncherPage — route target for "/Launcher". Renders the desktop Launcher grid
 * as page content so it appears inside whichever shell is active (it's the
 * landing target for desktop-shell users and a deep-link target otherwise).
 */
import React, { useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { createPageUrl } from "@/utils";
import Launcher from "@/components/desktop/Launcher";

export default function LauncherPage() {
  const navigate = useNavigate();
  const handleNavigate = useCallback((page) => navigate(createPageUrl(page)), [navigate]);
  return (
    <div style={{ display: "flex", flex: 1, minHeight: "100%", flexDirection: "column" }}>
      <Launcher onNavigate={handleNavigate} />
    </div>
  );
}
