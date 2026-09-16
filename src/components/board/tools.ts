/**
 * tools — what a tap on the canvas means right now.
 *
 * A modal toolbar rather than a long-press menu: on a tablet, in gloves, the
 * mode you are in has to be visible without a gesture to discover it.
 */

export const BOARD_TOOLS = ["select", "note", "task", "ink", "connect"] as const;
export type BoardTool = (typeof BOARD_TOOLS)[number];

export const TOOL_LABEL: Record<BoardTool, string> = {
  select: "Select",
  note: "Note",
  task: "Task",
  ink: "Draw",
  connect: "Connect",
};

export const TOOL_GLYPH: Record<BoardTool, string> = {
  select: "⬚",
  note: "▤",
  task: "✓",
  ink: "✎",
  connect: "⤳",
};

/** Tools that place a single object and then hand the board back to Select. */
export function isOneShotTool(tool: BoardTool): boolean {
  return tool === "note" || tool === "task";
}
