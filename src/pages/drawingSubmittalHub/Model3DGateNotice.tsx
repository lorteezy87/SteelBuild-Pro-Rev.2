/**
 * Model3DGateNotice — the 3D Model tab's body when the viewer_3d flag isn't on.
 *
 * The flag gates the tab's BODY, never its link. ?hub_tab=model3d always opens
 * the 3D Model tab (hubLinks keeps model3d a key in every flag state), and the
 * hub lists the tab while the flag is on or while it's the open tab. So a 3D
 * link opened by someone without the flag says so here, instead of silently
 * showing the Control Board.
 *
 * Compact and in-panel on purpose. ModuleDisabledNotice is a full-page module
 * gate, and the rest of the hub still works with 3D off.
 */
import { Box } from "lucide-react";

const HEADING_ID = "dcc-model3d-off";

/**
 * While the flags query is unresolved. useFlag reads false until it lands, so
 * this, not the notice, is what a user who has the flag sees first.
 */
export function Model3DGateLoading() {
  return (
    <p role="status" style={{ margin: 0, padding: "12px 2px", fontSize: 13, color: "var(--cmd-text-muted)" }}>
      Loading the 3D model viewer…
    </p>
  );
}

/** Flags loaded, and viewer_3d is off for this user. */
export function Model3DGateNotice() {
  return (
    <section
      aria-labelledby={HEADING_ID}
      style={{
        display: "flex",
        alignItems: "flex-start",
        gap: 12,
        padding: "12px 14px",
        borderRadius: 10,
        border: "1px solid var(--cmd-border)",
        background: "var(--cmd-surface)",
        color: "var(--cmd-text)",
      }}
    >
      <Box size={16} aria-hidden="true" style={{ flexShrink: 0, marginTop: 2, color: "var(--cmd-text-muted)" }} />
      <div style={{ minWidth: 0 }}>
        <h3 id={HEADING_ID} style={{ margin: 0, fontSize: 14, fontWeight: 700, color: "var(--cmd-text)" }}>
          3D model viewer is off
        </h3>
        <p style={{ margin: "4px 0 0", fontSize: 12, color: "var(--cmd-text-muted)" }}>
          3D model viewer is turned off for this workspace. Ask an admin to enable it.
        </p>
      </div>
    </section>
  );
}
