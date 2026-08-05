/**
 * Presentational comment body with @mention highlighting.
 * Extracted from CommentThread — no behavior change.
 */
import React from "react";
import { COMMENT_MENTION_STYLE } from "./commentThreadHelpers";

export default function CommentBody({ body }) {
  const parts = String(body).split(/(@[\w.-]+)/g);
  return parts.map((part, i) => {
    if (/^@[\w.-]+$/.test(part)) {
      return (
        <span key={i} style={COMMENT_MENTION_STYLE}>
          {part}
        </span>
      );
    }
    return <React.Fragment key={i}>{part}</React.Fragment>;
  });
}
