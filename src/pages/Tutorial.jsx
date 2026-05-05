import React, { useMemo, useState } from "react";
import ReactMarkdown from "react-markdown";
import { CommandBar } from "@/components/design-system";
import { PhoenixPanel } from "../components/shared/PhoenixPanel";
// Vite's `?raw` query inlines the file as a string at build time. The
// markdown source lives at docs/TUTORIAL.md so the doc and the code
// travel together — fix something in the app, fix the doc in the same
// commit. No extra fetch, no separate hosting, no CORS.
import TUTORIAL_SOURCE from "../../docs/TUTORIAL.md?raw";

/**
 * Tutorial — in-app help / onboarding.
 *
 * Renders the canonical user guide (docs/TUTORIAL.md) inside the app
 * shell so users don't have to leave for GitHub. The source is the same
 * markdown that GitHub renders, so anything that's true on the repo is
 * true in here.
 *
 * Layout decisions:
 *   - Two-column when wide enough: left rail = TOC built from H2s, right
 *     pane = the rendered prose. Below 980px we stack — TOC sits above
 *     the prose because nobody scrolls past 50 nav items to read.
 *   - The TOC scroll-syncs via plain anchors (`#section-id`) — no
 *     IntersectionObserver gymnastics. ReactMarkdown's default H2
 *     renderer doesn't emit ids, so we override `h2`/`h3` to slugify.
 *   - Search filters the prose: matching paragraphs/list items stay,
 *     others fade. Cheap and useful for "where did I see crew
 *     scheduling explained again?"
 */

// Same slug rule the TOC builder uses — keep in sync.
function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, "")
    .trim()
    .replace(/\s+/g, "-");
}

// Pull H2 (and a few H3s) titles out of the markdown to build the TOC.
// Avoids a full markdown parse — the doc has stable headings with
// "## N. Section" / "### N.M Subsection" so a regex is enough.
function buildToc(md) {
  const out = [];
  const re = /^(#{2,3})\s+(.+)$/gm;
  let m;
  while ((m = re.exec(md)) !== null) {
    const depth = m[1].length;          // 2 or 3
    const text = m[2].trim();
    out.push({ depth, text, id: slugify(text) });
  }
  return out;
}

export default function Tutorial() {
  const [search, setSearch] = useState("");

  const toc = useMemo(() => buildToc(TUTORIAL_SOURCE), []);

  // Filter mode — when the user types a search term, dim sections
  // (H2 blocks) that have no matching text. We do the filter in the
  // markdown source so the rendered output collapses naturally.
  const filteredSource = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return TUTORIAL_SOURCE;
    // Split into H2-headed chunks; keep the chunk if it contains q.
    const parts = TUTORIAL_SOURCE.split(/^(?=## )/m);
    const kept = parts.filter((p, i) => {
      if (i === 0) return true;                 // preamble always shown
      return p.toLowerCase().includes(q);
    });
    return kept.join("");
  }, [search]);

  return (
    <div style={{ padding: "20px 24px", display: "flex", flexDirection: "column", gap: 14, height: "100%", overflow: "hidden" }}>
      <CommandBar
        eyebrow="HELP"
        title="Tutorial & user guide"
        subtitle="Every module, integration, and common workflow — searchable, in-app."
      >
        <input
          placeholder="Search the guide…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{
            width: 280, padding: "6px 10px", fontSize: 12,
            background: "var(--bg-input, var(--bg-surface-low))",
            border: "1px solid var(--border-default)", borderRadius: 3,
            color: "var(--text-primary)",
          }}
        />
      </CommandBar>

      <PhoenixPanel style={{ flex: 1, minHeight: 0, display: "flex", overflow: "hidden" }}>
        {/* TOC rail */}
        <aside
          style={{
            width: 260, flexShrink: 0,
            borderRight: "1px solid var(--divider)",
            background: "var(--bg-surface-low)",
            overflowY: "auto",
            padding: "14px 12px",
          }}
        >
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, fontWeight: 700, color: "var(--text-muted)", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
            On this page
          </div>
          <nav>
            {toc.map((t) => (
              <a
                key={t.id}
                href={`#${t.id}`}
                style={{
                  display: "block",
                  padding: t.depth === 2 ? "5px 6px" : "3px 6px 3px 18px",
                  fontFamily: t.depth === 2 ? "var(--font-display)" : "var(--font-body)",
                  fontSize: t.depth === 2 ? 12 : 11,
                  fontWeight: t.depth === 2 ? 700 : 500,
                  color: t.depth === 2 ? "var(--text-primary)" : "var(--text-secondary)",
                  textDecoration: "none",
                  borderRadius: 3,
                  letterSpacing: t.depth === 2 ? "0.02em" : 0,
                  lineHeight: 1.35,
                }}
                onMouseEnter={(e) => { e.currentTarget.style.background = "var(--hover-bg, rgba(255,255,255,0.04))"; }}
                onMouseLeave={(e) => { e.currentTarget.style.background = "transparent"; }}
              >
                {t.text}
              </a>
            ))}
          </nav>
        </aside>

        {/* Prose pane */}
        <article
          className="sbp-tutorial-prose"
          style={{
            flex: 1,
            overflowY: "auto",
            padding: "24px 36px",
            color: "var(--text-primary)",
            fontFamily: "var(--font-body)",
            fontSize: 14,
            lineHeight: 1.6,
          }}
        >
          <ReactMarkdown
            components={{
              h1: ({ node, children, ...rest }) => (
                <h1
                  id={slugify(String(children))}
                  style={{ fontFamily: "var(--font-display)", fontSize: 26, fontWeight: 800, marginTop: 0, marginBottom: 16, color: "var(--text-primary)", letterSpacing: "-0.01em" }}
                  {...rest}
                >
                  {children}
                </h1>
              ),
              h2: ({ node, children, ...rest }) => (
                <h2
                  id={slugify(String(children))}
                  style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 800, marginTop: 32, marginBottom: 10, color: "var(--text-primary)", borderBottom: "1px solid var(--divider)", paddingBottom: 4 }}
                  {...rest}
                >
                  {children}
                </h2>
              ),
              h3: ({ node, children, ...rest }) => (
                <h3
                  id={slugify(String(children))}
                  style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, marginTop: 22, marginBottom: 6, color: "var(--text-primary)" }}
                  {...rest}
                >
                  {children}
                </h3>
              ),
              h4: ({ node, children, ...rest }) => (
                <h4
                  style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, marginTop: 14, marginBottom: 4, color: "var(--accent)", textTransform: "uppercase", letterSpacing: "0.04em" }}
                  {...rest}
                >
                  {children}
                </h4>
              ),
              p: ({ node, children, ...rest }) => (
                <p style={{ margin: "0 0 10px 0" }} {...rest}>{children}</p>
              ),
              ul: ({ node, children, ...rest }) => (
                <ul style={{ margin: "0 0 12px 0", paddingLeft: 22 }} {...rest}>{children}</ul>
              ),
              ol: ({ node, children, ...rest }) => (
                <ol style={{ margin: "0 0 12px 0", paddingLeft: 22 }} {...rest}>{children}</ol>
              ),
              li: ({ node, children, ...rest }) => (
                <li style={{ margin: "3px 0" }} {...rest}>{children}</li>
              ),
              code: ({ node, inline, children, ...rest }) =>
                inline ? (
                  <code
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 12,
                      background: "var(--bg-surface-low)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 3,
                      padding: "1px 5px",
                      color: "var(--accent)",
                    }}
                    {...rest}
                  >
                    {children}
                  </code>
                ) : (
                  <pre
                    style={{
                      fontFamily: "var(--font-mono)", fontSize: 12,
                      background: "var(--bg-surface-low)",
                      border: "1px solid var(--border-default)",
                      borderRadius: 4,
                      padding: "10px 12px",
                      overflowX: "auto",
                      margin: "0 0 12px 0",
                    }}
                  >
                    <code {...rest}>{children}</code>
                  </pre>
                ),
              a: ({ node, children, ...rest }) => (
                <a style={{ color: "var(--accent)", textDecoration: "underline" }} {...rest}>{children}</a>
              ),
              hr: () => <hr style={{ border: 0, borderTop: "1px solid var(--divider)", margin: "22px 0" }} />,
              blockquote: ({ node, children, ...rest }) => (
                <blockquote
                  style={{
                    borderLeft: "3px solid var(--accent)",
                    background: "var(--bg-surface-low)",
                    margin: "0 0 12px 0",
                    padding: "8px 12px",
                    color: "var(--text-secondary)",
                  }}
                  {...rest}
                >
                  {children}
                </blockquote>
              ),
              table: ({ node, children, ...rest }) => (
                <div style={{ overflowX: "auto", margin: "0 0 14px 0" }}>
                  <table
                    style={{
                      borderCollapse: "collapse",
                      width: "100%",
                      fontSize: 13,
                      border: "1px solid var(--border-default)",
                    }}
                    {...rest}
                  >
                    {children}
                  </table>
                </div>
              ),
              th: ({ node, children, ...rest }) => (
                <th
                  style={{
                    textAlign: "left",
                    padding: "8px 10px",
                    background: "var(--bg-surface-low)",
                    fontFamily: "var(--font-mono)",
                    fontSize: 10,
                    fontWeight: 700,
                    letterSpacing: "0.08em",
                    color: "var(--text-muted)",
                    textTransform: "uppercase",
                    borderBottom: "1px solid var(--border-default)",
                  }}
                  {...rest}
                >
                  {children}
                </th>
              ),
              td: ({ node, children, ...rest }) => (
                <td
                  style={{
                    padding: "8px 10px",
                    borderBottom: "1px solid var(--divider)",
                    verticalAlign: "top",
                  }}
                  {...rest}
                >
                  {children}
                </td>
              ),
              strong: ({ node, children, ...rest }) => (
                <strong style={{ fontWeight: 800, color: "var(--text-primary)" }} {...rest}>{children}</strong>
              ),
            }}
          >
            {filteredSource}
          </ReactMarkdown>

          {search.trim() && filteredSource.length < TUTORIAL_SOURCE.length * 0.4 && (
            <div
              style={{
                marginTop: 16,
                padding: "10px 12px",
                background: "var(--bg-surface-low)",
                border: "1px dashed var(--border-default)",
                borderRadius: 4,
                fontFamily: "var(--font-mono)",
                fontSize: 11,
                color: "var(--text-muted)",
              }}
            >
              Filtered to sections containing "{search}". Clear the search to see the full guide.
            </div>
          )}
        </article>
      </PhoenixPanel>
    </div>
  );
}
