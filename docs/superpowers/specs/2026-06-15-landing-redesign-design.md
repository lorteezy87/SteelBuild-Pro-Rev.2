# Landing page redesign — industrial-executive

Date: 2026-06-15
Status: implemented + verified live (visual direction signed off via iterative mockups during brainstorming)
Scope: rewrite `src/pages/Landing.jsx` only. No routing, auth, or backend changes.

## Goal

Replace the current dark, gold-on-near-black, condensed-headline marketing page (which read as a
"video game / gaming HUD") with a calm, **professional and executive** landing page that uses a
**tailored-industrial** visual language — the look of a steel shop drawing, not a dashboard.

## Direction (approved)

- **Palette — light & executive.** Warm ivory paper (`#FBFAF7`), near-black ink (`#17191C`), steel
  secondary text, a single **muted executive-gold** accent (`#9A7B1E` / `#B8860B`) used sparingly,
  graphite (`#2A2E35`) as a structural line color, deep steel (`#1C2430`) for primary buttons +
  footer, and one muted clay (`#A6422E`) marker on the pain points. No aurora, no glow, no glass,
  no neon. The page is intentionally lighter/quieter than the dark in-app chrome.
- **Type — tailored industrial.** Space Grotesk **medium weight, normal width** for headings (already
  loaded in `index.html`), Inter for body, a restrained amount of IBM Plex Mono for technical labels.
  No heavy/condensed display type.
- **Industrial cues (the "a little more industrial" layer):** faint blueprint/graph-paper grid on
  ivory bands; gold registration corner-ticks + a dimension-line callout on the hero product panel;
  an I-beam glyph in the hero eyebrow; graphite line icons per module (I-beam, portal frame, weld
  shield, drawing sheet, cost bars, gantt); stats restyled as an engineered spec-table with hairline
  dividers; `GAP 01–06` part-number tags on pain points; a drawing **title-block strip**
  (Project / Discipline / Scope / Rev / Sheet) above the footer.

## Page structure

Sticky nav → Hero (headline + CTAs + restrained product panel) → "The cost of gaps" (6 pain points) →
Stats spec-table (4) → "The platform" (6 module cards) → "The lifecycle" (4-step workflow) →
"Neither one speaks steel" differentiator → Demo CTA (form) → title-block strip → footer.

**Dropped from the old page:** Pricing tier table and Testimonials (no billing live; testimonials were
placeholder). Keep the strong steel-domain copy for pains / features / workflow.

## Must preserve (behavior)

- Component contract: `export default function Landing({ onLogin, isSubmitting, loginError })`.
- Sign-in modal: `handleLogin` calls `onLogin({ email, password })`; show `loginError`; disable the
  submit button while `isSubmitting`; close on Escape and on backdrop click.
- Demo form: local `demoForm` state, `handleDemoSubmit` sets `demoSent` and shows the success panel
  (no backend — unchanged from today).
- Sticky-nav scrolled state on scroll; smooth-scroll nav links to sections; mobile hamburger menu.

## Implementation requirements

- All styling self-contained in the component (inline styles + one scoped `<style>` block with the
  `lp-` prefix), the same pattern the current file uses. The page renders inside the app's
  `.steelbuild-dark` html wrapper, so the root element paints its own opaque ivory background +
  `minHeight:100vh` to cover the app aurora (mirrors how today's dark landing overrides the theme).
- **Responsive:** hero stacks; nav collapses to a hamburger; 3/4-col grids collapse (stats spec-table
  stacks cleanly on phones); demo form goes single-column; reduced section padding on small screens.
  Verify ~390px and tablet.
- **Accessibility:** semantic headings, labelled inputs, visible focus states, keyboard-operable
  modal (Escape close, focusable controls), `aria-label` on icon-only buttons. No <11px-only critical
  text without weight; maintain WCAG-AA contrast on ivory.

## Validation

`npm run lint` and a production Vite build must pass. Spot-check the route in the browser
(desktop + mobile widths): hero, sign-in modal (open/close/Escape/error), demo submit success state,
empty/scroll states. Report exactly what was run.

## Out of scope

Pricing/billing, real demo-form backend, auth changes, dark/light theming of the landing (it is
always the executive light design regardless of the app's theme default).
