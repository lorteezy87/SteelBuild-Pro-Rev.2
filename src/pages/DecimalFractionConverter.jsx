/**
 * DecimalFractionConverter.jsx
 *
 * Convert tool for the SteelBuild calculator device. Three sub-modes:
 *   • Dec → Frac — decimal feet/inches → fractional dimension
 *   • Frac → Dec — ft/in/fraction (incl. custom) → decimal
 *   • Units      — steel-shop unit conversion (length, weight, stress, …)
 *
 * No calculate button — results update live as the user types (this is a
 * reference tool where speed matters).
 *
 * Pure math lives in:
 *   src/utils/fractionConversion.js  (decimal ↔ fraction, unit-tested)
 *   src/utils/unitConversions.js     (convert / CONVERSIONS, unit-tested)
 *
 * Chrome uses the shared calculator kit (CalcKey keycaps + calc.css tokens);
 * the page renders ONLY its tool content — the Hub provides the outer shell.
 */

import React, { useState } from "react";
import "@/components/calculators/calc.css";
import {
  SUB_MODES,
  SUB_MODE_TABS,
  DecimalToFractionPanel,
  FractionToDecimalPanel,
  UnitsPanel,
} from "./decimalFractionConverter/DecimalFractionConverterUi";

const mono = { fontFamily: "var(--font-mono)" };

export default function DecimalFractionConverter() {
  const [subMode, setSubMode] = useState(SUB_MODES.DEC_FRAC);

  return (
    <div className="sb-dashboard-reference-page" style={{ padding: 24, background: "var(--bg-page)", minHeight: "calc(100vh - 92px)" }}>
      <div style={{ maxWidth: 1080, margin: "0 auto" }}>

        {/* Header */}
        <div style={{ marginBottom: 16 }}>
          <div style={{
            fontFamily: "Space Grotesk, var(--font-display)",
            fontSize: 22, fontWeight: 800,
            textTransform: "uppercase", letterSpacing: "-0.01em",
            color: "var(--text-primary)",
          }}>
            {"Decimal ↔ Fraction Converter"}
          </div>
          <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", letterSpacing: "0.10em", marginTop: 4 }}>
            Cross-reference engineer decimals against detailer fractions · live conversion · 1/16 default
          </div>
        </div>

        {/* Sub-mode tool rail */}
        <div
          className="sbd-calc-tool-rail"
          role="tablist"
          aria-label="Conversion mode"
          style={{ marginBottom: 16 }}
        >
          {SUB_MODE_TABS.map((t) => {
            const active = subMode === t.key;
            return (
              <button
                key={t.key}
                type="button"
                role="tab"
                aria-selected={active}
                className={`sbd-calc-tool-rail__btn${active ? " sbd-calc-tool-rail__btn--active" : ""}`}
                onClick={() => setSubMode(t.key)}
              >
                {t.label}
              </button>
            );
          })}
        </div>

        {/* Active panel — single column; each sub-mode owns its layout */}
        <div className="frac-grid" style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1fr)",
          gap: 16, alignItems: "start",
        }}>
          {subMode === SUB_MODES.DEC_FRAC && <DecimalToFractionPanel />}
          {subMode === SUB_MODES.FRAC_DEC && <FractionToDecimalPanel />}
          {subMode === SUB_MODES.UNITS    && <UnitsPanel />}
        </div>

        {/* Mobile */}
        <style>{`
          @media (max-width: 820px) {
            .frac-grid { grid-template-columns: 1fr !important; }
          }
        `}</style>
      </div>
    </div>
  );
}
