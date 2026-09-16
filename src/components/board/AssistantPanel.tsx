/**
 * AssistantPanel — daily logs and RFI drafts from what is on the board.
 *
 * Both drafts are assembled locally by `lib/board/assistant`, so they work with
 * no signal. The panel's job is to gather the three things the board cannot know
 * — today's date, who is writing, and anything dictated — and to show the result
 * as text that can be copied straight into the app's Daily Log or RFI form.
 *
 * It deliberately does not write an RFI record. An RFI gets an official number
 * from the database sequence, and minting one from a board draft the user has
 * not read would put an unreviewed question into the project's record.
 */

import { useMemo, useState } from "react";
import { draftDailyLog, draftRfiFromTask, blockedTasks } from "@/lib/board/assistant";
import { todayIso } from "@/lib/board/timeline";
import type { BoardDoc } from "@/lib/board/types";
import { useDictation } from "./useDictation";

export interface AssistantPanelProps {
  doc: BoardDoc;
  projectName: string;
  preparedBy: string;
  /** Set by the inspector's "Draft an RFI from this" button. */
  rfiNodeId: string | null;
  onRfiNodeChange: (nodeId: string | null) => void;
}

type Mode = "log" | "rfi";

export default function AssistantPanel({
  doc,
  projectName,
  preparedBy,
  rfiNodeId,
  onRfiNodeChange,
}: AssistantPanelProps) {
  const [mode, setMode] = useState<Mode>("log");
  const [date, setDate] = useState(todayIso());
  const [copied, setCopied] = useState(false);
  const dictation = useDictation();
  const blocked = blockedTasks(doc);

  const activeRfiId = rfiNodeId ?? blocked[0]?.id ?? null;

  const log = useMemo(
    () =>
      draftDailyLog(doc, {
        date,
        project_name: projectName,
        prepared_by: preparedBy,
        transcript: dictation.transcript,
      }),
    [doc, date, projectName, preparedBy, dictation.transcript],
  );

  const rfi = useMemo(
    () =>
      activeRfiId
        ? draftRfiFromTask(doc, activeRfiId, {
            project_name: projectName,
            prepared_by: preparedBy,
            date,
            directed_to: "EOR",
          })
        : null,
    [doc, activeRfiId, projectName, preparedBy, date],
  );

  const text = mode === "log" ? log.text : rfi?.text ?? "";

  const copy = () => {
    if (!text) return;
    void navigator.clipboard
      ?.writeText(text)
      .then(() => setCopied(true))
      .catch(() => setCopied(false));
  };

  return (
    <div data-testid="board-assistant">
      <h3 className="sbp-panel__title">Field assistant</h3>

      <div className="sbp-toolbar__group" style={{ marginBottom: 10 }}>
        <button
          type="button"
          className={`sbp-btn sbp-btn--sm${mode === "log" ? " sbp-btn--active" : ""}`}
          onClick={() => setMode("log")}
        >
          Daily log
        </button>
        <button
          type="button"
          className={`sbp-btn sbp-btn--sm${mode === "rfi" ? " sbp-btn--active" : ""}`}
          onClick={() => setMode("rfi")}
        >
          RFI draft
        </button>
      </div>

      <label className="sbp-field">
        <span>Date</span>
        <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
      </label>

      {mode === "log" ? (
        <>
          <label className="sbp-field">
            <span>Dictated note (kept verbatim)</span>
            <textarea
              value={dictation.transcript}
              placeholder="Grout crew never showed, moved to canopy steel"
              onChange={(event) => dictation.setTranscript(event.target.value)}
            />
          </label>
          {dictation.supported ? (
            <button
              type="button"
              className="sbp-btn"
              onClick={dictation.listening ? dictation.stop : dictation.start}
            >
              {dictation.listening ? "Stop dictating" : "Dictate"}
            </button>
          ) : (
            <p className="sbp-empty">This browser cannot transcribe speech — type the note above.</p>
          )}
          {dictation.error ? <p className="sbp-empty">{dictation.error}</p> : null}
        </>
      ) : (
        <>
          <label className="sbp-field">
            <span>Blocked task</span>
            <select
              value={activeRfiId ?? ""}
              onChange={(event) => onRfiNodeChange(event.target.value || null)}
            >
              <option value="">Select a blocked task…</option>
              {blocked.map((task) => (
                <option key={task.id} value={task.id}>
                  {task.text || "Untitled task"}
                </option>
              ))}
            </select>
          </label>
          {blocked.length === 0 ? (
            <p className="sbp-empty">
              No task on this board is flagged blocked. Flag one in the inspector and its reason becomes
              the body of the RFI.
            </p>
          ) : null}
        </>
      )}

      {text ? (
        <>
          <pre className="sbp-draft" data-testid="board-draft">
            {text}
          </pre>
          <button type="button" className="sbp-btn" onClick={copy} style={{ marginTop: 8 }}>
            {copied ? "Copied" : "Copy draft"}
          </button>
          <p className="sbp-empty" style={{ marginTop: 6 }}>
            Read it before sending. Nothing here is filed against the project — paste it into the RFI or
            Daily Log register, which is where an official number comes from.
          </p>
        </>
      ) : null}
    </div>
  );
}
