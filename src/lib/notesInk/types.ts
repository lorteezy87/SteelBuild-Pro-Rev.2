export type InkTool = "pen" | "highlighter" | "eraser";
export type PaperStyle = "plain" | "ruled" | "grid";

export interface InkPoint {
  x: number;
  y: number;
  p: number;
  t: number;
  tiltX?: number;
  tiltY?: number;
}

export interface InkStroke {
  id: string;
  tool: Exclude<InkTool, "eraser"> | "eraser";
  color: string;
  size: number;
  points: InkPoint[];
}

export interface InkDocument {
  version: 1;
  paper: PaperStyle;
  strokes: InkStroke[];
}

export const INK_COLORS = [
  { id: "graphite", label: "Graphite", value: "#1A1C1E" },
  { id: "chalk", label: "Chalk", value: "#F4F1EA" },
  { id: "gold", label: "Gold", value: "#C89B20" },
  { id: "red", label: "Field red", value: "#C0392B" },
  { id: "blue", label: "Mark blue", value: "#2F6FED" },
] as const;

export const INK_SIZES = [
  { id: "s", label: "Fine", value: 1.6 },
  { id: "m", label: "Medium", value: 3.2 },
  { id: "l", label: "Bold", value: 6.4 },
] as const;
