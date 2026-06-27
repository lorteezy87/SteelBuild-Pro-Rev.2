/**
 * aiscShapes.js
 *
 * Representative lb/ft values for common rolled structural-steel shapes,
 * plus coefficient constants for bar / plate stock that is calculated
 * dynamically from dimensions rather than tabled.
 *
 * SOURCE: AISC Steel Construction Manual, 15th Edition — Shapes Tables
 *         (lb/ft values). This list is NOT exhaustive; it covers the
 *         members we most commonly fabricate for commercial/industrial
 *         work. Expand as needed.
 *
 * DYNAMIC-STOCK COEFFICIENTS
 *   Density of steel = 490 lb/ft³ = 0.2836 lb/in³.
 *   lb/ft = cross-section area (in²) × 12 in × 0.2836 lb/in³
 *        = A × 3.4028
 *
 *   Round bar  A = π(d/2)² = 0.7854·d²  →  lb/ft = 2.6729 · d²
 *   Square bar A = s²                   →  lb/ft = 3.4028 · s²
 *   Flat bar   A = t · w                →  lb/ft = 3.4028 · t · w
 *   Plate      same as flat bar per ft of length.
 *
 *   NOTE on coefficients: an earlier spec for this tool listed the round-
 *   and square-bar coefficients as 0.2227 and 0.2836. Those numbers are
 *   the pounds-per-INCH form (divide the lb/ft coefficient by 12), so if
 *   you need a sanity-check against a shop handbook you may see either
 *   form. The constants below are the lb/ft versions and are what this
 *   calculator consumes.
 */

// ── Dynamic-stock coefficients (lb/ft, all inputs in inches) ────────
export const DENSITY_STEEL_LB_IN3 = 0.2836;
export const DENSITY_STEEL_LB_FT3 = 490;

// 12 · 0.2836 = 3.40278... (the "area-to-lb/ft" multiplier)
export const AREA_TO_LB_PER_FT = 3.4028;

export const PLATE_LB_PER_FT_PER_IN2 = AREA_TO_LB_PER_FT;           // plate / flat bar
export const SQUARE_BAR_LB_PER_FT    = AREA_TO_LB_PER_FT;           // multiply by s²
export const ROUND_BAR_LB_PER_FT     = AREA_TO_LB_PER_FT * 0.7854;  // 2.6729 (multiply by d²)

// ── Shape families ──────────────────────────────────────────────────
// Each row: { family, designation, weightPerFoot }

/**
 * W-shapes (wide flange).
 *
 * Covers W6–W44 with the most frequently used weights per depth. This
 * skips a lot of lighter/heavier edge cases — add them as the shop
 * catalog grows.
 */
const W_SHAPES = [
  // W6
  { designation: "W6X9",   weightPerFoot: 9.0 },
  { designation: "W6X12",  weightPerFoot: 12.0 },
  { designation: "W6X15",  weightPerFoot: 15.0 },
  { designation: "W6X16",  weightPerFoot: 16.0 },
  { designation: "W6X20",  weightPerFoot: 20.0 },
  { designation: "W6X25",  weightPerFoot: 25.0 },

  // W8
  { designation: "W8X10",  weightPerFoot: 10.0 },
  { designation: "W8X13",  weightPerFoot: 13.0 },
  { designation: "W8X15",  weightPerFoot: 15.0 },
  { designation: "W8X18",  weightPerFoot: 18.0 },
  { designation: "W8X21",  weightPerFoot: 21.0 },
  { designation: "W8X24",  weightPerFoot: 24.0 },
  { designation: "W8X28",  weightPerFoot: 28.0 },
  { designation: "W8X31",  weightPerFoot: 31.0 },
  { designation: "W8X35",  weightPerFoot: 35.0 },
  { designation: "W8X40",  weightPerFoot: 40.0 },
  { designation: "W8X48",  weightPerFoot: 48.0 },
  { designation: "W8X58",  weightPerFoot: 58.0 },
  { designation: "W8X67",  weightPerFoot: 67.0 },

  // W10
  { designation: "W10X12", weightPerFoot: 12.0 },
  { designation: "W10X15", weightPerFoot: 15.0 },
  { designation: "W10X17", weightPerFoot: 17.0 },
  { designation: "W10X19", weightPerFoot: 19.0 },
  { designation: "W10X22", weightPerFoot: 22.0 },
  { designation: "W10X26", weightPerFoot: 26.0 },
  { designation: "W10X30", weightPerFoot: 30.0 },
  { designation: "W10X33", weightPerFoot: 33.0 },
  { designation: "W10X39", weightPerFoot: 39.0 },
  { designation: "W10X45", weightPerFoot: 45.0 },
  { designation: "W10X49", weightPerFoot: 49.0 },
  { designation: "W10X54", weightPerFoot: 54.0 },
  { designation: "W10X60", weightPerFoot: 60.0 },
  { designation: "W10X68", weightPerFoot: 68.0 },
  { designation: "W10X77", weightPerFoot: 77.0 },
  { designation: "W10X88", weightPerFoot: 88.0 },
  { designation: "W10X100", weightPerFoot: 100.0 },
  { designation: "W10X112", weightPerFoot: 112.0 },

  // W12
  { designation: "W12X14",  weightPerFoot: 14.0 },
  { designation: "W12X16",  weightPerFoot: 16.0 },
  { designation: "W12X19",  weightPerFoot: 19.0 },
  { designation: "W12X22",  weightPerFoot: 22.0 },
  { designation: "W12X26",  weightPerFoot: 26.0 },
  { designation: "W12X30",  weightPerFoot: 30.0 },
  { designation: "W12X35",  weightPerFoot: 35.0 },
  { designation: "W12X40",  weightPerFoot: 40.0 },
  { designation: "W12X45",  weightPerFoot: 45.0 },
  { designation: "W12X50",  weightPerFoot: 50.0 },
  { designation: "W12X53",  weightPerFoot: 53.0 },
  { designation: "W12X58",  weightPerFoot: 58.0 },
  { designation: "W12X65",  weightPerFoot: 65.0 },
  { designation: "W12X72",  weightPerFoot: 72.0 },
  { designation: "W12X79",  weightPerFoot: 79.0 },
  { designation: "W12X87",  weightPerFoot: 87.0 },
  { designation: "W12X96",  weightPerFoot: 96.0 },
  { designation: "W12X106", weightPerFoot: 106.0 },
  { designation: "W12X120", weightPerFoot: 120.0 },
  { designation: "W12X136", weightPerFoot: 136.0 },
  { designation: "W12X152", weightPerFoot: 152.0 },
  { designation: "W12X170", weightPerFoot: 170.0 },
  { designation: "W12X190", weightPerFoot: 190.0 },
  { designation: "W12X210", weightPerFoot: 210.0 },
  { designation: "W12X230", weightPerFoot: 230.0 },
  { designation: "W12X252", weightPerFoot: 252.0 },
  { designation: "W12X279", weightPerFoot: 279.0 },
  { designation: "W12X305", weightPerFoot: 305.0 },
  { designation: "W12X336", weightPerFoot: 336.0 },

  // W14
  { designation: "W14X22",  weightPerFoot: 22.0 },
  { designation: "W14X26",  weightPerFoot: 26.0 },
  { designation: "W14X30",  weightPerFoot: 30.0 },
  { designation: "W14X34",  weightPerFoot: 34.0 },
  { designation: "W14X38",  weightPerFoot: 38.0 },
  { designation: "W14X43",  weightPerFoot: 43.0 },
  { designation: "W14X48",  weightPerFoot: 48.0 },
  { designation: "W14X53",  weightPerFoot: 53.0 },
  { designation: "W14X61",  weightPerFoot: 61.0 },
  { designation: "W14X68",  weightPerFoot: 68.0 },
  { designation: "W14X74",  weightPerFoot: 74.0 },
  { designation: "W14X82",  weightPerFoot: 82.0 },
  { designation: "W14X90",  weightPerFoot: 90.0 },
  { designation: "W14X99",  weightPerFoot: 99.0 },
  { designation: "W14X109", weightPerFoot: 109.0 },
  { designation: "W14X120", weightPerFoot: 120.0 },
  { designation: "W14X132", weightPerFoot: 132.0 },
  { designation: "W14X145", weightPerFoot: 145.0 },
  { designation: "W14X159", weightPerFoot: 159.0 },
  { designation: "W14X176", weightPerFoot: 176.0 },
  { designation: "W14X193", weightPerFoot: 193.0 },
  { designation: "W14X211", weightPerFoot: 211.0 },
  { designation: "W14X233", weightPerFoot: 233.0 },
  { designation: "W14X257", weightPerFoot: 257.0 },
  { designation: "W14X283", weightPerFoot: 283.0 },
  { designation: "W14X311", weightPerFoot: 311.0 },
  { designation: "W14X342", weightPerFoot: 342.0 },
  { designation: "W14X370", weightPerFoot: 370.0 },
  { designation: "W14X398", weightPerFoot: 398.0 },
  { designation: "W14X426", weightPerFoot: 426.0 },
  { designation: "W14X455", weightPerFoot: 455.0 },
  { designation: "W14X500", weightPerFoot: 500.0 },
  { designation: "W14X550", weightPerFoot: 550.0 },
  { designation: "W14X605", weightPerFoot: 605.0 },
  { designation: "W14X665", weightPerFoot: 665.0 },
  { designation: "W14X730", weightPerFoot: 730.0 },

  // W16
  { designation: "W16X26", weightPerFoot: 26.0 },
  { designation: "W16X31", weightPerFoot: 31.0 },
  { designation: "W16X36", weightPerFoot: 36.0 },
  { designation: "W16X40", weightPerFoot: 40.0 },
  { designation: "W16X45", weightPerFoot: 45.0 },
  { designation: "W16X50", weightPerFoot: 50.0 },
  { designation: "W16X57", weightPerFoot: 57.0 },
  { designation: "W16X67", weightPerFoot: 67.0 },
  { designation: "W16X77", weightPerFoot: 77.0 },
  { designation: "W16X89", weightPerFoot: 89.0 },
  { designation: "W16X100", weightPerFoot: 100.0 },

  // W18
  { designation: "W18X35",  weightPerFoot: 35.0 },
  { designation: "W18X40",  weightPerFoot: 40.0 },
  { designation: "W18X46",  weightPerFoot: 46.0 },
  { designation: "W18X50",  weightPerFoot: 50.0 },
  { designation: "W18X55",  weightPerFoot: 55.0 },
  { designation: "W18X60",  weightPerFoot: 60.0 },
  { designation: "W18X65",  weightPerFoot: 65.0 },
  { designation: "W18X71",  weightPerFoot: 71.0 },
  { designation: "W18X76",  weightPerFoot: 76.0 },
  { designation: "W18X86",  weightPerFoot: 86.0 },
  { designation: "W18X97",  weightPerFoot: 97.0 },
  { designation: "W18X106", weightPerFoot: 106.0 },
  { designation: "W18X119", weightPerFoot: 119.0 },
  { designation: "W18X130", weightPerFoot: 130.0 },
  { designation: "W18X143", weightPerFoot: 143.0 },
  { designation: "W18X158", weightPerFoot: 158.0 },
  { designation: "W18X175", weightPerFoot: 175.0 },
  { designation: "W18X192", weightPerFoot: 192.0 },
  { designation: "W18X211", weightPerFoot: 211.0 },
  { designation: "W18X234", weightPerFoot: 234.0 },
  { designation: "W18X258", weightPerFoot: 258.0 },
  { designation: "W18X283", weightPerFoot: 283.0 },
  { designation: "W18X311", weightPerFoot: 311.0 },

  // W21
  { designation: "W21X44",  weightPerFoot: 44.0 },
  { designation: "W21X48",  weightPerFoot: 48.0 },
  { designation: "W21X50",  weightPerFoot: 50.0 },
  { designation: "W21X55",  weightPerFoot: 55.0 },
  { designation: "W21X57",  weightPerFoot: 57.0 },
  { designation: "W21X62",  weightPerFoot: 62.0 },
  { designation: "W21X68",  weightPerFoot: 68.0 },
  { designation: "W21X73",  weightPerFoot: 73.0 },
  { designation: "W21X83",  weightPerFoot: 83.0 },
  { designation: "W21X93",  weightPerFoot: 93.0 },
  { designation: "W21X101", weightPerFoot: 101.0 },
  { designation: "W21X111", weightPerFoot: 111.0 },
  { designation: "W21X122", weightPerFoot: 122.0 },
  { designation: "W21X132", weightPerFoot: 132.0 },
  { designation: "W21X147", weightPerFoot: 147.0 },
  { designation: "W21X166", weightPerFoot: 166.0 },
  { designation: "W21X182", weightPerFoot: 182.0 },
  { designation: "W21X201", weightPerFoot: 201.0 },

  // W24
  { designation: "W24X55",  weightPerFoot: 55.0 },
  { designation: "W24X62",  weightPerFoot: 62.0 },
  { designation: "W24X68",  weightPerFoot: 68.0 },
  { designation: "W24X76",  weightPerFoot: 76.0 },
  { designation: "W24X84",  weightPerFoot: 84.0 },
  { designation: "W24X94",  weightPerFoot: 94.0 },
  { designation: "W24X103", weightPerFoot: 103.0 },
  { designation: "W24X104", weightPerFoot: 104.0 },
  { designation: "W24X117", weightPerFoot: 117.0 },
  { designation: "W24X131", weightPerFoot: 131.0 },
  { designation: "W24X146", weightPerFoot: 146.0 },
  { designation: "W24X162", weightPerFoot: 162.0 },
  { designation: "W24X176", weightPerFoot: 176.0 },
  { designation: "W24X192", weightPerFoot: 192.0 },
  { designation: "W24X207", weightPerFoot: 207.0 },
  { designation: "W24X229", weightPerFoot: 229.0 },
  { designation: "W24X250", weightPerFoot: 250.0 },
  { designation: "W24X279", weightPerFoot: 279.0 },
  { designation: "W24X306", weightPerFoot: 306.0 },
  { designation: "W24X335", weightPerFoot: 335.0 },
  { designation: "W24X370", weightPerFoot: 370.0 },

  // W27
  { designation: "W27X84",  weightPerFoot: 84.0 },
  { designation: "W27X94",  weightPerFoot: 94.0 },
  { designation: "W27X102", weightPerFoot: 102.0 },
  { designation: "W27X114", weightPerFoot: 114.0 },
  { designation: "W27X129", weightPerFoot: 129.0 },
  { designation: "W27X146", weightPerFoot: 146.0 },
  { designation: "W27X161", weightPerFoot: 161.0 },
  { designation: "W27X178", weightPerFoot: 178.0 },
  { designation: "W27X194", weightPerFoot: 194.0 },
  { designation: "W27X217", weightPerFoot: 217.0 },
  { designation: "W27X235", weightPerFoot: 235.0 },
  { designation: "W27X258", weightPerFoot: 258.0 },
  { designation: "W27X281", weightPerFoot: 281.0 },
  { designation: "W27X307", weightPerFoot: 307.0 },
  { designation: "W27X336", weightPerFoot: 336.0 },
  { designation: "W27X368", weightPerFoot: 368.0 },
  { designation: "W27X539", weightPerFoot: 539.0 },

  // W30
  { designation: "W30X90",  weightPerFoot: 90.0 },
  { designation: "W30X99",  weightPerFoot: 99.0 },
  { designation: "W30X108", weightPerFoot: 108.0 },
  { designation: "W30X116", weightPerFoot: 116.0 },
  { designation: "W30X124", weightPerFoot: 124.0 },
  { designation: "W30X132", weightPerFoot: 132.0 },
  { designation: "W30X148", weightPerFoot: 148.0 },
  { designation: "W30X173", weightPerFoot: 173.0 },
  { designation: "W30X191", weightPerFoot: 191.0 },
  { designation: "W30X211", weightPerFoot: 211.0 },
  { designation: "W30X235", weightPerFoot: 235.0 },
  { designation: "W30X261", weightPerFoot: 261.0 },
  { designation: "W30X292", weightPerFoot: 292.0 },
  { designation: "W30X326", weightPerFoot: 326.0 },
  { designation: "W30X357", weightPerFoot: 357.0 },
  { designation: "W30X391", weightPerFoot: 391.0 },

  // W33
  { designation: "W33X118", weightPerFoot: 118.0 },
  { designation: "W33X130", weightPerFoot: 130.0 },
  { designation: "W33X141", weightPerFoot: 141.0 },
  { designation: "W33X152", weightPerFoot: 152.0 },
  { designation: "W33X169", weightPerFoot: 169.0 },
  { designation: "W33X201", weightPerFoot: 201.0 },
  { designation: "W33X221", weightPerFoot: 221.0 },
  { designation: "W33X241", weightPerFoot: 241.0 },
  { designation: "W33X263", weightPerFoot: 263.0 },
  { designation: "W33X291", weightPerFoot: 291.0 },
  { designation: "W33X318", weightPerFoot: 318.0 },
  { designation: "W33X354", weightPerFoot: 354.0 },
  { designation: "W33X387", weightPerFoot: 387.0 },

  // W36
  { designation: "W36X135", weightPerFoot: 135.0 },
  { designation: "W36X150", weightPerFoot: 150.0 },
  { designation: "W36X160", weightPerFoot: 160.0 },
  { designation: "W36X170", weightPerFoot: 170.0 },
  { designation: "W36X182", weightPerFoot: 182.0 },
  { designation: "W36X194", weightPerFoot: 194.0 },
  { designation: "W36X210", weightPerFoot: 210.0 },
  { designation: "W36X232", weightPerFoot: 232.0 },
  { designation: "W36X247", weightPerFoot: 247.0 },
  { designation: "W36X262", weightPerFoot: 262.0 },
  { designation: "W36X282", weightPerFoot: 282.0 },
  { designation: "W36X302", weightPerFoot: 302.0 },
  { designation: "W36X330", weightPerFoot: 330.0 },
  { designation: "W36X361", weightPerFoot: 361.0 },
  { designation: "W36X395", weightPerFoot: 395.0 },
  { designation: "W36X441", weightPerFoot: 441.0 },
  { designation: "W36X487", weightPerFoot: 487.0 },
  { designation: "W36X529", weightPerFoot: 529.0 },
  { designation: "W36X652", weightPerFoot: 652.0 },

  // W40
  { designation: "W40X149", weightPerFoot: 149.0 },
  { designation: "W40X167", weightPerFoot: 167.0 },
  { designation: "W40X183", weightPerFoot: 183.0 },
  { designation: "W40X211", weightPerFoot: 211.0 },
  { designation: "W40X235", weightPerFoot: 235.0 },
  { designation: "W40X249", weightPerFoot: 249.0 },
  { designation: "W40X264", weightPerFoot: 264.0 },
  { designation: "W40X278", weightPerFoot: 278.0 },
  { designation: "W40X294", weightPerFoot: 294.0 },
  { designation: "W40X327", weightPerFoot: 327.0 },
  { designation: "W40X362", weightPerFoot: 362.0 },
  { designation: "W40X372", weightPerFoot: 372.0 },
  { designation: "W40X392", weightPerFoot: 392.0 },
  { designation: "W40X397", weightPerFoot: 397.0 },
  { designation: "W40X431", weightPerFoot: 431.0 },
  { designation: "W40X503", weightPerFoot: 503.0 },
  { designation: "W40X593", weightPerFoot: 593.0 },
  { designation: "W40X655", weightPerFoot: 655.0 },

  // W44
  { designation: "W44X230", weightPerFoot: 230.0 },
  { designation: "W44X262", weightPerFoot: 262.0 },
  { designation: "W44X290", weightPerFoot: 290.0 },
  { designation: "W44X335", weightPerFoot: 335.0 },
];

/** HSS Square (lb/ft from AISC Shapes Tables). */
const HSS_RECT_SHAPES = [
  { designation: "HSS4X4X1/4",    weightPerFoot: 12.21 },
  { designation: "HSS4X4X3/8",    weightPerFoot: 17.27 },
  { designation: "HSS4X4X1/2",    weightPerFoot: 21.63 },
  { designation: "HSS5X5X1/4",    weightPerFoot: 15.62 },
  { designation: "HSS5X5X3/8",    weightPerFoot: 22.37 },
  { designation: "HSS5X5X1/2",    weightPerFoot: 28.43 },
  { designation: "HSS6X6X1/4",    weightPerFoot: 19.02 },
  { designation: "HSS6X6X3/8",    weightPerFoot: 27.48 },
  { designation: "HSS6X6X1/2",    weightPerFoot: 35.24 },
  { designation: "HSS6X6X5/8",    weightPerFoot: 42.30 },
  { designation: "HSS7X7X1/4",    weightPerFoot: 22.42 },
  { designation: "HSS7X7X3/8",    weightPerFoot: 32.58 },
  { designation: "HSS7X7X1/2",    weightPerFoot: 42.05 },
  { designation: "HSS7X7X5/8",    weightPerFoot: 50.81 },
  { designation: "HSS8X8X1/4",    weightPerFoot: 25.82 },
  { designation: "HSS8X8X3/8",    weightPerFoot: 37.69 },
  { designation: "HSS8X8X1/2",    weightPerFoot: 48.85 },
  { designation: "HSS8X8X5/8",    weightPerFoot: 59.32 },
  { designation: "HSS10X10X1/4",  weightPerFoot: 32.63 },
  { designation: "HSS10X10X3/8",  weightPerFoot: 47.90 },
  { designation: "HSS10X10X1/2",  weightPerFoot: 62.46 },
  { designation: "HSS10X10X5/8",  weightPerFoot: 76.33 },
  { designation: "HSS12X12X1/4",  weightPerFoot: 39.43 },
  { designation: "HSS12X12X3/8",  weightPerFoot: 58.10 },
  { designation: "HSS12X12X1/2",  weightPerFoot: 76.07 },
  { designation: "HSS12X12X5/8",  weightPerFoot: 93.34 },
  { designation: "HSS14X14X1/2",  weightPerFoot: 89.68 },
  { designation: "HSS14X14X5/8",  weightPerFoot: 110.36 },
  { designation: "HSS16X16X1/2",  weightPerFoot: 103.30 },
  { designation: "HSS16X16X5/8",  weightPerFoot: 127.37 },
  // Common rectangular (non-square) HSS
  { designation: "HSS6X4X1/4",    weightPerFoot: 15.62 },
  { designation: "HSS6X4X3/8",    weightPerFoot: 22.37 },
  { designation: "HSS6X4X1/2",    weightPerFoot: 28.43 },
  { designation: "HSS8X4X1/4",    weightPerFoot: 19.02 },
  { designation: "HSS8X4X3/8",    weightPerFoot: 27.48 },
  { designation: "HSS8X4X1/2",    weightPerFoot: 35.24 },
  { designation: "HSS8X6X1/4",    weightPerFoot: 22.42 },
  { designation: "HSS8X6X3/8",    weightPerFoot: 32.58 },
  { designation: "HSS8X6X1/2",    weightPerFoot: 42.05 },
  { designation: "HSS10X6X1/4",   weightPerFoot: 25.82 },
  { designation: "HSS10X6X3/8",   weightPerFoot: 37.69 },
  { designation: "HSS10X6X1/2",   weightPerFoot: 48.85 },
  { designation: "HSS12X6X3/8",   weightPerFoot: 42.79 },
  { designation: "HSS12X6X1/2",   weightPerFoot: 55.66 },
  { designation: "HSS12X8X3/8",   weightPerFoot: 47.90 },
  { designation: "HSS12X8X1/2",   weightPerFoot: 62.46 },
];

/** HSS Round (OD × wall). */
const HSS_ROUND_SHAPES = [
  { designation: "HSS3.500X0.216",  weightPerFoot: 7.58 },
  { designation: "HSS4.000X0.226",  weightPerFoot: 9.11 },
  { designation: "HSS4.500X0.237",  weightPerFoot: 10.79 },
  { designation: "HSS5.000X0.258",  weightPerFoot: 13.00 },
  { designation: "HSS5.563X0.258",  weightPerFoot: 14.62 },
  { designation: "HSS6.000X0.280",  weightPerFoot: 17.10 },
  { designation: "HSS6.625X0.280",  weightPerFoot: 18.97 },
  { designation: "HSS7.000X0.285",  weightPerFoot: 20.42 },
  { designation: "HSS8.625X0.322",  weightPerFoot: 28.55 },
  { designation: "HSS9.625X0.342",  weightPerFoot: 33.90 },
  { designation: "HSS10.000X0.375", weightPerFoot: 38.61 },
  { designation: "HSS10.750X0.365", weightPerFoot: 40.48 },
  { designation: "HSS12.000X0.375", weightPerFoot: 46.59 },
  { designation: "HSS12.750X0.375", weightPerFoot: 49.56 },
];

/** Channels (C-shapes). */
const C_SHAPES = [
  { designation: "C3X4.1",   weightPerFoot: 4.1 },
  { designation: "C3X5",     weightPerFoot: 5.0 },
  { designation: "C3X6",     weightPerFoot: 6.0 },
  { designation: "C4X5.4",   weightPerFoot: 5.4 },
  { designation: "C4X7.25",  weightPerFoot: 7.25 },
  { designation: "C5X6.7",   weightPerFoot: 6.7 },
  { designation: "C5X9",     weightPerFoot: 9.0 },
  { designation: "C6X8.2",   weightPerFoot: 8.2 },
  { designation: "C6X10.5",  weightPerFoot: 10.5 },
  { designation: "C6X13",    weightPerFoot: 13.0 },
  { designation: "C7X9.8",   weightPerFoot: 9.8 },
  { designation: "C7X12.25", weightPerFoot: 12.25 },
  { designation: "C7X14.75", weightPerFoot: 14.75 },
  { designation: "C8X11.5",  weightPerFoot: 11.5 },
  { designation: "C8X13.75", weightPerFoot: 13.75 },
  { designation: "C8X18.75", weightPerFoot: 18.75 },
  { designation: "C9X13.4",  weightPerFoot: 13.4 },
  { designation: "C9X15",    weightPerFoot: 15.0 },
  { designation: "C9X20",    weightPerFoot: 20.0 },
  { designation: "C10X15.3", weightPerFoot: 15.3 },
  { designation: "C10X20",   weightPerFoot: 20.0 },
  { designation: "C10X25",   weightPerFoot: 25.0 },
  { designation: "C10X30",   weightPerFoot: 30.0 },
  { designation: "C12X20.7", weightPerFoot: 20.7 },
  { designation: "C12X25",   weightPerFoot: 25.0 },
  { designation: "C12X30",   weightPerFoot: 30.0 },
  { designation: "C15X33.9", weightPerFoot: 33.9 },
  { designation: "C15X40",   weightPerFoot: 40.0 },
  { designation: "C15X50",   weightPerFoot: 50.0 },
];

/** Miscellaneous Channels (MC-shapes). */
const MC_SHAPES = [
  { designation: "MC6X12",    weightPerFoot: 12.0 },
  { designation: "MC6X16.3",  weightPerFoot: 16.3 },
  { designation: "MC8X18.7",  weightPerFoot: 18.7 },
  { designation: "MC8X22.8",  weightPerFoot: 22.8 },
  { designation: "MC10X22",   weightPerFoot: 22.0 },
  { designation: "MC10X28.5", weightPerFoot: 28.5 },
  { designation: "MC12X31",   weightPerFoot: 31.0 },
  { designation: "MC12X35",   weightPerFoot: 35.0 },
  { designation: "MC12X45",   weightPerFoot: 45.0 },
  { designation: "MC12X50",   weightPerFoot: 50.0 },
  { designation: "MC13X50",   weightPerFoot: 50.0 },
];

/** Angles — equal + unequal legs. */
const L_SHAPES = [
  // Equal legs
  { designation: "L2X2X1/8",       weightPerFoot: 1.65 },
  { designation: "L2X2X3/16",      weightPerFoot: 2.44 },
  { designation: "L2X2X1/4",       weightPerFoot: 3.19 },
  { designation: "L2X2X3/8",       weightPerFoot: 4.70 },
  { designation: "L2-1/2X2-1/2X3/16", weightPerFoot: 3.07 },
  { designation: "L2-1/2X2-1/2X1/4",  weightPerFoot: 4.10 },
  { designation: "L2-1/2X2-1/2X3/8",  weightPerFoot: 5.90 },
  { designation: "L3X3X3/16",      weightPerFoot: 3.71 },
  { designation: "L3X3X1/4",       weightPerFoot: 4.90 },
  { designation: "L3X3X3/8",       weightPerFoot: 7.20 },
  { designation: "L3X3X1/2",       weightPerFoot: 9.40 },
  { designation: "L3-1/2X3-1/2X1/4",  weightPerFoot: 5.80 },
  { designation: "L3-1/2X3-1/2X3/8",  weightPerFoot: 8.50 },
  { designation: "L3-1/2X3-1/2X1/2",  weightPerFoot: 11.10 },
  { designation: "L4X4X1/4",       weightPerFoot: 6.60 },
  { designation: "L4X4X3/8",       weightPerFoot: 9.80 },
  { designation: "L4X4X1/2",       weightPerFoot: 12.80 },
  { designation: "L4X4X5/8",       weightPerFoot: 15.70 },
  { designation: "L4X4X3/4",       weightPerFoot: 18.50 },
  { designation: "L5X5X5/16",      weightPerFoot: 10.30 },
  { designation: "L5X5X3/8",       weightPerFoot: 12.30 },
  { designation: "L5X5X1/2",       weightPerFoot: 16.20 },
  { designation: "L5X5X5/8",       weightPerFoot: 20.00 },
  { designation: "L5X5X3/4",       weightPerFoot: 23.60 },
  { designation: "L6X6X3/8",       weightPerFoot: 14.90 },
  { designation: "L6X6X1/2",       weightPerFoot: 19.60 },
  { designation: "L6X6X5/8",       weightPerFoot: 24.20 },
  { designation: "L6X6X3/4",       weightPerFoot: 28.70 },
  { designation: "L6X6X1",         weightPerFoot: 37.40 },
  { designation: "L8X8X1/2",       weightPerFoot: 26.40 },
  { designation: "L8X8X5/8",       weightPerFoot: 32.70 },
  { designation: "L8X8X3/4",       weightPerFoot: 38.90 },
  { designation: "L8X8X1",         weightPerFoot: 51.00 },

  // Unequal legs
  { designation: "L3X2X1/4",       weightPerFoot: 4.10 },
  { designation: "L3X2X3/8",       weightPerFoot: 5.90 },
  { designation: "L3-1/2X2-1/2X1/4",  weightPerFoot: 4.90 },
  { designation: "L3-1/2X2-1/2X3/8",  weightPerFoot: 7.20 },
  { designation: "L4X3X1/4",       weightPerFoot: 5.80 },
  { designation: "L4X3X3/8",       weightPerFoot: 8.50 },
  { designation: "L4X3X1/2",       weightPerFoot: 11.10 },
  { designation: "L4X3-1/2X3/8",   weightPerFoot: 9.10 },
  { designation: "L4X3-1/2X1/2",   weightPerFoot: 11.90 },
  { designation: "L5X3X3/8",       weightPerFoot: 9.80 },
  { designation: "L5X3X1/2",       weightPerFoot: 12.80 },
  { designation: "L5X3-1/2X3/8",   weightPerFoot: 10.40 },
  { designation: "L5X3-1/2X1/2",   weightPerFoot: 13.60 },
  { designation: "L6X4X3/8",       weightPerFoot: 12.30 },
  { designation: "L6X4X1/2",       weightPerFoot: 16.20 },
  { designation: "L6X4X5/8",       weightPerFoot: 20.00 },
  { designation: "L6X4X3/4",       weightPerFoot: 23.60 },
  { designation: "L8X6X1/2",       weightPerFoot: 23.00 },
  { designation: "L8X6X5/8",       weightPerFoot: 28.50 },
  { designation: "L8X6X3/4",       weightPerFoot: 33.80 },
  { designation: "L8X6X1",         weightPerFoot: 44.20 },
];

/**
 * Shape families the calculator knows about. The order here is the order
 * shown in the family dropdown. Each entry carries the list of
 * designations (for tabled families) and a `dynamic` flag (for stock
 * that takes raw dimensional inputs instead).
 */
export const SHAPE_FAMILIES = [
  { key: "W",          label: "W-Shape",            shapes: W_SHAPES,         dynamic: false },
  { key: "HSS_RECT",   label: "HSS Rectangular",    shapes: HSS_RECT_SHAPES,  dynamic: false },
  { key: "HSS_ROUND",  label: "HSS Round",          shapes: HSS_ROUND_SHAPES, dynamic: false },
  { key: "C",          label: "Channel (C)",        shapes: C_SHAPES,         dynamic: false },
  { key: "MC",         label: "Miscellaneous Channel (MC)", shapes: MC_SHAPES, dynamic: false },
  { key: "L",          label: "Angle (L)",          shapes: L_SHAPES,         dynamic: false },
  { key: "PL",         label: "Plate (PL)",         shapes: [],               dynamic: "plate" },
  { key: "ROUND_BAR",  label: "Round Bar",          shapes: [],               dynamic: "round-bar" },
  { key: "SQUARE_BAR", label: "Square Bar",         shapes: [],               dynamic: "square-bar" },
  { key: "FLAT_BAR",   label: "Flat Bar",           shapes: [],               dynamic: "flat-bar" },
];

/** Helper — look up a single row by its designation, regardless of family. */
export function findShape(designation) {
  if (!designation) return null;
  const upper = designation.toUpperCase();
  for (const fam of SHAPE_FAMILIES) {
    const hit = fam.shapes.find((s) => s.designation === upper);
    if (hit) return { ...hit, family: fam.key, familyLabel: fam.label };
  }
  return null;
}

/**
 * Compute lb/ft for a dynamic-stock family given its dimensional inputs.
 * Returns null if inputs are incomplete or non-positive.
 *
 *   plate       { thickness, width }          (inches)
 *   round-bar   { diameter }                  (inches)
 *   square-bar  { side }                      (inches)
 *   flat-bar    { thickness, width }          (inches)
 */
export function computeDynamicLbPerFt(kind, dims) {
  if (!dims) return null;
  const pos = (n) => Number.isFinite(n) && n > 0;

  if (kind === "plate" || kind === "flat-bar") {
    const { thickness, width } = dims;
    if (!pos(thickness) || !pos(width)) return null;
    return PLATE_LB_PER_FT_PER_IN2 * thickness * width;
  }
  if (kind === "round-bar") {
    const { diameter } = dims;
    if (!pos(diameter)) return null;
    return ROUND_BAR_LB_PER_FT * diameter * diameter;
  }
  if (kind === "square-bar") {
    const { side } = dims;
    if (!pos(side)) return null;
    return SQUARE_BAR_LB_PER_FT * side * side;
  }
  return null;
}
