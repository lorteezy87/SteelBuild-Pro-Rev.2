/**
 * Single chat bubble — user OR assistant. Renders assistant content as
 * markdown (react-markdown, already in the bundle) and user content as
 * plain text. The provenance footer is only shown for assistant replies.
 */

import React from "react";
import ReactMarkdown from "react-markdown";
import AiProvenance from "./AiProvenance";

const mono = { fontFamily: "var(--font-mono)" };

export default function AiMessageBubble({ message }) {
  const isUser = message.role === "user";

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
      <div
        style={{
          ...mono,
          fontSize: 9,
          fontWeight: 700,
          letterSpacing: "0.12em",
          textTransform: "uppercase",
          color: isUser ? "var(--accent)" : "var(--text-muted)",
          paddingLeft: isUser ? 0 : 4,
          alignSelf: isUser ? "flex-end" : "flex-start",
        }}
      >
        {isUser ? "You" : "AI"}
      </div>

      <div
        style={{
          alignSelf: isUser ? "flex-end" : "flex-start",
          maxWidth: "95%",
          padding: isUser ? "8px 12px" : "10px 14px",
          borderRadius: isUser ? 14 : 4,
          background: isUser ? "var(--accent-muted)" : "var(--bg-surface-low)",
          border: isUser ? "1px solid var(--accent)" : "1px solid var(--border-default)",
          borderLeft: isUser ? undefined : "3px solid var(--accent)",
          color: "var(--text-primary)",
          fontSize: 13,
          lineHeight: 1.55,
          fontFamily: "var(--font-body)",
          whiteSpace: isUser ? "pre-wrap" : "normal",
          wordBreak: "break-word",
        }}
      >
        {isUser ? (
          message.content
        ) : (
          <div className="sbp-ai-md">
            <ReactMarkdown
              components={{
                // Keep headings tight inside a chat bubble
                h1: (props) => <h3 style={mdHeading} {...props} />,
                h2: (props) => <h4 style={mdHeading} {...props} />,
                h3: (props) => <h5 style={mdHeading} {...props} />,
                p:  (props) => <p style={{ margin: "6px 0" }} {...props} />,
                ul: (props) => <ul style={{ margin: "6px 0", paddingLeft: 20 }} {...props} />,
                ol: (props) => <ol style={{ margin: "6px 0", paddingLeft: 20 }} {...props} />,
                li: (props) => <li style={{ margin: "2px 0" }} {...props} />,
                strong: (props) => <strong style={{ color: "var(--accent)" }} {...props} />,
                code: (props) => (
                  <code
                    style={{
                      ...mono,
                      fontSize: 11,
                      background: "rgba(255,255,255,0.06)",
                      padding: "1px 4px",
                      borderRadius: 2,
                    }}
                    {...props}
                  />
                ),
                blockquote: (props) => (
                  <blockquote
                    style={{
                      margin: "6px 0",
                      padding: "4px 10px",
                      borderLeft: "2px solid var(--accent)",
                      color: "var(--text-secondary)",
                      fontStyle: "italic",
                    }}
                    {...props}
                  />
                ),
              }}
            >
              {message.content}
            </ReactMarkdown>
            <AiProvenance provenance={message.provenance} />
          </div>
        )}
      </div>
    </div>
  );
}

const mdHeading = {
  margin: "10px 0 4px",
  fontFamily: "Space Grotesk, var(--font-display)",
  fontSize: 13.5,
  fontWeight: 800,
  letterSpacing: "-0.01em",
  color: "var(--text-primary)",
};
