/**
 * NodeInspector — edit whatever is selected.
 *
 * Editing lives here rather than inline on the card so that a tap on the canvas
 * has one meaning (select) and typing has one place. On a tablet that also keeps
 * the on-screen keyboard away from the object being edited, which an inline
 * editor at the bottom of the board cannot do.
 *
 * No `<form>` element: the app's design rules forbid it, and there is nothing to
 * submit — every field writes through on change.
 */

import { SCHEDULE_STATUSES } from "@/lib/schedule/taskStatus";
import type { BoardAction } from "@/lib/board/document";
import { BOARD_EDGE_KINDS, type BoardDoc, type BoardEdge, type BoardNode } from "@/lib/board/types";
import { edgeKindLabel } from "@/lib/board/connectors";

export interface NodeInspectorProps {
  doc: BoardDoc;
  selection: string[];
  selectedEdgeId: string | null;
  dispatch: (action: BoardAction, options?: { key?: string; label?: string }) => void;
  onDraftRfi: (nodeId: string) => void;
  readOnly?: boolean;
}

export default function NodeInspector({
  doc,
  selection,
  selectedEdgeId,
  dispatch,
  onDraftRfi,
  readOnly = false,
}: NodeInspectorProps) {
  const edge = selectedEdgeId ? doc.edges.find((e) => e.id === selectedEdgeId) ?? null : null;
  if (edge) return <EdgeFields edge={edge} dispatch={dispatch} readOnly={readOnly} />;

  const node = selection.length === 1 ? doc.nodes.find((n) => n.id === selection[0]) ?? null : null;

  if (selection.length > 1) {
    return (
      <div data-testid="board-inspector">
        <h3 className="sbp-panel__title">{selection.length} cards selected</h3>
        <button
          type="button"
          className="sbp-btn"
          disabled={readOnly}
          onClick={() => dispatch({ type: "delete_nodes", ids: selection }, { label: "Deleted cards" })}
        >
          Delete {selection.length} cards
        </button>
      </div>
    );
  }

  if (!node) {
    return (
      <div data-testid="board-inspector">
        <h3 className="sbp-panel__title">Inspector</h3>
        <p className="sbp-empty">Select a card to edit it.</p>
      </div>
    );
  }

  return (
    <div data-testid="board-inspector">
      <h3 className="sbp-panel__title">{node.kind}</h3>
      <NodeFields node={node} doc={doc} dispatch={dispatch} onDraftRfi={onDraftRfi} readOnly={readOnly} />
      <button
        type="button"
        className="sbp-btn"
        disabled={readOnly}
        onClick={() => dispatch({ type: "delete_nodes", ids: [node.id] }, { label: "Deleted card" })}
      >
        Delete card
      </button>
    </div>
  );
}

interface NodeFieldsProps {
  node: BoardNode;
  doc: BoardDoc;
  dispatch: NodeInspectorProps["dispatch"];
  onDraftRfi: (nodeId: string) => void;
  readOnly: boolean;
}

function NodeFields({ node, doc, dispatch, onDraftRfi, readOnly }: NodeFieldsProps) {
  const pinnedSheet = node.anchor
    ? doc.overlays.find((o) => o.id === node.anchor?.overlay_id) ?? null
    : null;

  return (
    <>
      {pinnedSheet ? (
        <p className="sbp-empty">
          Pinned to {pinnedSheet.sheet_number || pinnedSheet.name}. Drag it off the sheet to unpin.
        </p>
      ) : null}

      {node.kind === "note" ? (
        <label className="sbp-field">
          <span>Note</span>
          <textarea
            value={node.text}
            disabled={readOnly}
            onChange={(event) =>
              dispatch(
                { type: "update_note", id: node.id, text: event.target.value },
                { key: `text:${node.id}`, label: "Edited note" },
              )
            }
          />
        </label>
      ) : null}

      {node.kind === "delivery" ? (
        <>
          <label className="sbp-field">
            <span>Material</span>
            <input
              value={node.material}
              disabled={readOnly}
              placeholder="Anchor bolts, AB-1 through AB-24"
              onChange={(event) =>
                dispatch(
                  { type: "update_delivery", id: node.id, patch: { material: event.target.value } },
                  { key: `text:${node.id}`, label: "Edited delivery" },
                )
              }
            />
          </label>
          <label className="sbp-field">
            <span>Vendor</span>
            <input
              value={node.vendor}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  { type: "update_delivery", id: node.id, patch: { vendor: event.target.value } },
                  { key: `vendor:${node.id}`, label: "Set vendor" },
                )
              }
            />
          </label>
          <label className="sbp-field">
            <span>Needed on site</span>
            <input
              type="date"
              value={node.needed_by ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  { type: "update_delivery", id: node.id, patch: { needed_by: event.target.value || null } },
                  { label: "Dated delivery" },
                )
              }
            />
          </label>
          <label className="sbp-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={node.received}
              disabled={readOnly}
              style={{ minHeight: 0, width: 20, height: 20 }}
              onChange={(event) =>
                dispatch(
                  { type: "update_delivery", id: node.id, patch: { received: event.target.checked } },
                  { label: event.target.checked ? "Marked received" : "Cleared received" },
                )
              }
            />
            <span>Received on site</span>
          </label>
        </>
      ) : null}

      {node.kind === "photo" ? (
        <label className="sbp-field">
          <span>Caption</span>
          <input
            value={node.caption}
            disabled={readOnly}
            onChange={(event) =>
              dispatch(
                { type: "update_photo", id: node.id, caption: event.target.value },
                { key: `text:${node.id}`, label: "Edited caption" },
              )
            }
          />
        </label>
      ) : null}

      {node.kind === "link" ? (
        <>
          <label className="sbp-field">
            <span>Title</span>
            <input
              value={node.title}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  { type: "update_link", id: node.id, title: event.target.value },
                  { key: `text:${node.id}`, label: "Edited link" },
                )
              }
            />
          </label>
          <label className="sbp-field">
            <span>URL</span>
            <input
              value={node.url}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  { type: "update_link", id: node.id, url: event.target.value },
                  { key: `url:${node.id}`, label: "Edited link" },
                )
              }
            />
          </label>
        </>
      ) : null}

      {node.kind === "task" ? (
        <>
          <label className="sbp-field">
            <span>Task</span>
            <textarea
              value={node.text}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  { type: "update_task", id: node.id, patch: { text: event.target.value } },
                  { key: `text:${node.id}`, label: "Edited task" },
                )
              }
            />
          </label>
          <label className="sbp-field">
            <span>Owner (crew or vendor)</span>
            <input
              value={node.owner}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  { type: "update_task", id: node.id, patch: { owner: event.target.value } },
                  { key: `owner:${node.id}`, label: "Assigned task" },
                )
              }
            />
          </label>
          <label className="sbp-field">
            <span>Status</span>
            <select
              value={node.status}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  // The vocabulary comes from SCHEDULE_STATUSES, so a board task
                  // promoted to the schedule carries a status the database will
                  // accept. "Blocked" is not in it, and is a flag below.
                  { type: "update_task", id: node.id, patch: { status: event.target.value as typeof node.status } },
                  { label: "Changed status" },
                )
              }
            >
              {SCHEDULE_STATUSES.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label className="sbp-field">
            <span>Start</span>
            <input
              type="date"
              value={node.start_date ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  { type: "update_task", id: node.id, patch: { start_date: event.target.value || null } },
                  { label: "Scheduled task" },
                )
              }
            />
          </label>
          <label className="sbp-field">
            <span>Finish</span>
            <input
              type="date"
              value={node.end_date ?? ""}
              disabled={readOnly}
              onChange={(event) =>
                dispatch(
                  { type: "update_task", id: node.id, patch: { end_date: event.target.value || null } },
                  { label: "Scheduled task" },
                )
              }
            />
          </label>
          <label className="sbp-field" style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
            <input
              type="checkbox"
              checked={node.blocked}
              disabled={readOnly}
              style={{ minHeight: 0, width: 20, height: 20 }}
              onChange={(event) =>
                dispatch(
                  { type: "update_task", id: node.id, patch: { blocked: event.target.checked } },
                  { label: event.target.checked ? "Flagged blocked" : "Cleared blocker" },
                )
              }
            />
            <span>Blocked</span>
          </label>
          {node.blocked ? (
            <>
              <label className="sbp-field">
                <span>What is blocking it</span>
                <textarea
                  value={node.blocked_reason}
                  disabled={readOnly}
                  placeholder="Embed plate at C-4 is 3 in. low of the plan dimension"
                  onChange={(event) =>
                    dispatch(
                      { type: "update_task", id: node.id, patch: { blocked_reason: event.target.value } },
                      { key: `blocked:${node.id}`, label: "Described blocker" },
                    )
                  }
                />
              </label>
              <button type="button" className="sbp-btn" onClick={() => onDraftRfi(node.id)}>
                Draft an RFI from this
              </button>
            </>
          ) : null}
        </>
      ) : null}
    </>
  );
}

interface EdgeFieldsProps {
  edge: BoardEdge;
  dispatch: NodeInspectorProps["dispatch"];
  readOnly: boolean;
}

function EdgeFields({ edge, dispatch, readOnly }: EdgeFieldsProps) {
  return (
    <div data-testid="board-inspector">
      <h3 className="sbp-panel__title">Connector</h3>
      <label className="sbp-field">
        <span>Relationship</span>
        <select
          value={edge.kind}
          disabled={readOnly}
          onChange={(event) =>
            dispatch(
              { type: "update_edge", id: edge.id, patch: { kind: event.target.value as BoardEdge["kind"] } },
              { label: "Changed relationship" },
            )
          }
        >
          {BOARD_EDGE_KINDS.map((kind) => (
            <option key={kind} value={kind}>
              {edgeKindLabel(kind)}
            </option>
          ))}
        </select>
      </label>
      <label className="sbp-field">
        <span>Label</span>
        <input
          value={edge.label}
          disabled={readOnly}
          placeholder="after grout cures"
          onChange={(event) =>
            dispatch(
              { type: "update_edge", id: edge.id, patch: { label: event.target.value } },
              { key: `edge:${edge.id}`, label: "Labelled connector" },
            )
          }
        />
      </label>
      <p className="sbp-empty">
        Only &ldquo;{edgeKindLabel("precedes")}&rdquo; is checked against the timeline. The others are notes
        about why the two are linked.
      </p>
      <button
        type="button"
        className="sbp-btn"
        disabled={readOnly}
        onClick={() => dispatch({ type: "delete_edge", id: edge.id }, { label: "Deleted connector" })}
      >
        Delete connector
      </button>
    </div>
  );
}
