/**
 * Unit conversion engine for SteelBuild Pro calculators.
 *
 * Linear categories use a base-unit factor map: value in base unit =
 * value * units[from]. To convert: result = value * units[from] / units[to].
 *
 * Temperature uses affine conversions (not proportional).
 */

const LINEAR_CATEGORIES = [
  {
    id: "length",
    label: "Length",
    base: "mm",
    units: {
      mm: 1,
      in: 25.4,
      ft: 304.8,
      m: 1000,
    },
  },
  {
    id: "weight",
    label: "Weight",
    base: "kg",
    units: {
      kg: 1,
      lb: 0.45359237,
      ton: 907.18474,
      tonne: 1000,
    },
  },
  {
    id: "lindensity",
    label: "Weight / Length",
    base: "kg/m",
    units: {
      "kg/m": 1,
      "lb/ft": 1.48816394,
    },
  },
  {
    id: "stress",
    label: "Stress",
    base: "MPa",
    units: {
      MPa: 1,
      ksi: 6.89475729,
    },
  },
];

const TEMP_UNITS = new Set(["degF", "degC"]);

/**
 * Convert a numeric value from one unit to another.
 *
 * Returns null when:
 * - value is not a finite number
 * - from and to units are from incompatible categories
 * - a unit is unrecognised
 */
function convert(value, from, to) {
  const v = Number(value);
  if (!isFinite(v)) return null;

  // Same unit — no conversion needed
  if (from === to) return v;

  // Temperature (affine, not proportional)
  if (TEMP_UNITS.has(from) && TEMP_UNITS.has(to)) {
    if (from === "degF" && to === "degC") return (v - 32) * 5 / 9;
    if (from === "degC" && to === "degF") return v * 9 / 5 + 32;
    return null;
  }

  // If one is a temp unit but the other isn't, incompatible
  if (TEMP_UNITS.has(from) || TEMP_UNITS.has(to)) return null;

  // Linear categories
  for (const cat of LINEAR_CATEGORIES) {
    const fromFactor = cat.units[from];
    const toFactor = cat.units[to];
    if (fromFactor !== undefined && toFactor !== undefined) {
      return v * fromFactor / toFactor;
    }
    // If only one side is found, units are from different categories → null
    if (fromFactor !== undefined || toFactor !== undefined) return null;
  }

  // Neither unit recognised in any category
  return null;
}

/**
 * Public catalogue of conversion categories.
 * Each entry exposes the ordered list of unit keys for UI use.
 */
const CONVERSIONS = [
  ...LINEAR_CATEGORIES.map((cat) => ({
    id: cat.id,
    label: cat.label,
    units: Object.keys(cat.units),
  })),
  {
    id: "temp",
    label: "Temperature",
    units: ["degF", "degC"],
  },
];

export { convert, CONVERSIONS };
