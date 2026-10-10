# Rigging guidance and ground-bearing arithmetic correction

Status: source correction and focused regressions; not hosted acceptance or
engineering certification. The mathematical load, angle and pressure formulas,
capacity thresholds, manufacturer chart requirements and planning-only scope
remain unchanged.

## Reversed low-angle advice

The actual `buildWarnings` output used by Crane Pick told a user below 30 degrees
to reduce sling length or widen pick points to raise the angle. Widening pick
spacing at an unchanged hook height lowers the angle from horizontal and increases
leg tension. The former advice could therefore worsen the condition it warned of.
The offset-CG warning also prescribed changing a sling or pick points without
requiring a review of the resulting geometry and load sharing.

The corrected text calls for sling-manufacturer or qualified-person review and
explains the narrowly stated geometric relationship: with unchanged pick-point
spacing, a higher hook position increases the horizontal angle. Sling lengths,
headroom and component ratings must be rechecked; the offset case also names both
leg lengths and load shares. It does not approve a lift or prescribe a particular
rigging alteration.

[OSHA's wire-rope sling guidance](https://www.osha.gov/safe-sling-use/wire)
requires manufacturer or qualified-person recommendations for horizontal angles
below 30 degrees. [Crosby's sling-angle guidance](https://info.training.thecrosbygroup.com/sling-angles-best-practices)
describes the reduction in sling tension and crushing force with larger
horizontal angles. The geometric conclusion above is independently checked with
the application's actual helpers: height 2 / half-span 4 gives 26.565 degrees;
widening the half-span to 6 gives 18.435 degrees; raising height to 4 with the
original half-span gives 45 degrees. The corresponding tension changes have the
expected direction for the same synthetic load.

## False green bearing result

The ground-bearing helper validated finite inputs but not their computed results.
Two individually finite pad dimensions of `1e200` multiplied to Infinity. The
actual panel then showed **0 psf, 0% of allowable, OK**, despite the invalid
footprint. Small finite values could similarly underflow to zero or produce
infinite pressure/required area.

The helper now returns no result unless every computed physical quantity is
finite and positive. Ordinary engineering formulas and thresholds are unchanged;
there is no new arbitrary dimensional limit. The panel identifies non-positive
required inputs, negative mat weight and unsupported numeric ranges with an
actionable validation message. Unfinished blank inputs remain quiet; blank or
zero optional mat weight remains valid.

## Verification and limits

Before correction, two warning regressions and seven arithmetic boundary cases
failed for the reproduced defects. A component reproduction displayed the false
green result, and a zero dimension silently removed the output without explaining
the input error. The corrected pure-helper and component tests pass alongside
the existing rigging, crane math and bearing cases. Final counts and exact-source
application gates must be read from the release CI; this document alone does not
establish publication.

This is not a review of every crane chart, field input, mat stiffness, soil value,
load-sharing arrangement, lifting regulation or engineering calculation in the
application. Existing manufacturer/qualified-person requirements and the separate
authenticated viewport acceptance remain in effect.
