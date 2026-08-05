/**
 * Reports — the hub.
 *
 * Lists every live report registered in `src/pages/reports/registry.js`.
 * Clicking a card deep-links into `/Reports/<slug>` (handled by the
 * nested route table). Adding an 11th report means appending an entry
 * to `registry.js` — no edits to this file required.
 */

import React from "react";
import { ReportsPageShell } from "./reports/ReportsUi";

export default function Reports() {
  return <ReportsPageShell />;
}
