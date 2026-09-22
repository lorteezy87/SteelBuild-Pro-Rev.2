import React from "react";
import { useResolvedFileUrl } from "@/hooks/useResolvedFileUrl";

/**
 * Opens private project attachments only after their stored object path has
 * been resolved to a signed URL. Never fall back to the raw storage path:
 * browsers treat that value as an app-relative route and show the SPA 404.
 */
export default function ScopeAttachmentLink({ fileUrl, children, title, style, ...anchorProps }) {
  const { url, loading } = useResolvedFileUrl(fileUrl);

  if (!url) {
    return (
      <span
        aria-disabled="true"
        title={loading ? "Preparing attachment…" : "Attachment unavailable"}
        style={{ ...style, cursor: "not-allowed", opacity: 0.65 }}
      >
        {children}
      </span>
    );
  }

  return (
    <a
      {...anchorProps}
      href={url}
      target="_blank"
      rel="noreferrer"
      title={title}
      style={style}
    >
      {children}
    </a>
  );
}
