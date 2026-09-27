import type { CSSProperties } from "react";

interface TitleblockActionButtonProps {
  setId: string;
  setName: string;
  locked?: boolean;
  onMarkTitleblock: (setId: string) => void;
  style?: CSSProperties;
}

export function TitleblockActionButton({
  setId, setName, locked, onMarkTitleblock, style,
}: TitleblockActionButtonProps) {
  return (
    <button
      type="button"
      className="cmd-btn cmd-btn--ghost"
      disabled={locked}
      aria-label={`Mark Titleblock for ${setName}`}
      title={locked
        ? "Locked — an admin must unlock before changing titleblock regions"
        : `Mark title, sheet number and revision regions for ${setName}`}
      onClick={() => onMarkTitleblock(setId)}
      style={style}
    >
      Mark Titleblock
    </button>
  );
}
