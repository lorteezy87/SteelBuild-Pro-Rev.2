// Contrast ratio calculator per WCAG
function luminance(r, g, b) {
  const [rs, gs, bs] = [r, g, b].map(x => {
    x = x / 255;
    return x <= 0.03928 ? x / 12.92 : Math.pow((x + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}

function contrast(rgb1, rgb2) {
  const l1 = luminance(...rgb1);
  const l2 = luminance(...rgb2);
  const lighter = Math.max(l1, l2);
  const darker = Math.min(l1, l2);
  return (lighter + 0.05) / (darker + 0.05);
}

// rgba(8, 11, 16, 0.72) on dark canvas #0a0e15
// Blending: result = foreground * alpha + background * (1 - alpha)
const bg = [10, 14, 21]; // #0a0e15 approximate
const topbar_top = [8, 11, 16]; // at 0.72 opacity
const topbar_blended = [
  Math.round(topbar_top[0] * 0.72 + bg[0] * 0.28),
  Math.round(topbar_top[1] * 0.72 + bg[1] * 0.28),
  Math.round(topbar_top[2] * 0.72 + bg[2] * 0.28),
];

const dock_top = [20, 27, 36]; // at 0.7 opacity
const dock_blended = [
  Math.round(dock_top[0] * 0.7 + bg[0] * 0.3),
  Math.round(dock_top[1] * 0.7 + bg[1] * 0.3),
  Math.round(dock_top[2] * 0.7 + bg[2] * 0.3),
];

const window_top = [22, 29, 39]; // at 0.92 opacity
const window_blended = [
  Math.round(window_top[0] * 0.92 + bg[0] * 0.08),
  Math.round(window_top[1] * 0.92 + bg[1] * 0.08),
  Math.round(window_top[2] * 0.92 + bg[2] * 0.08),
];

// Text colors
const text_primary = [232, 235, 242]; // #E8EBF2 (normal mode)
const text_primary_hc = [255, 255, 255]; // #FFFFFF (high-contrast mode)
const text_secondary = [168, 180, 200]; // #A8B4C8 (normal mode secondary -> high-contrast muted)
const text_secondary_hc = [214, 222, 240]; // #D6DEF0 (high-contrast secondary)

console.log("TOPBAR (rgba(8,11,16,0.72)) blended:", topbar_blended);
console.log("  Normal text-primary (#E8EBF2):", contrast(topbar_blended, text_primary).toFixed(2), "1");
console.log("  HC text-primary (#FFFFFF):", contrast(topbar_blended, text_primary_hc).toFixed(2), "1");
console.log("  HC text-secondary (#D6DEF0):", contrast(topbar_blended, text_secondary_hc).toFixed(2), "1");

console.log("\nDOCK (rgba(20,27,36,0.7)) blended:", dock_blended);
console.log("  Normal text-primary (#E8EBF2):", contrast(dock_blended, text_primary).toFixed(2), "1");
console.log("  Normal text-muted (#7B8BA2):", contrast(dock_blended, [123, 139, 162]).toFixed(2), "1");
console.log("  HC text-primary (#FFFFFF):", contrast(dock_blended, text_primary_hc).toFixed(2), "1");

console.log("\nWINDOW (rgba(22,29,39,0.92)) blended:", window_blended);
console.log("  Normal text-secondary (#A8B4C8):", contrast(window_blended, text_secondary).toFixed(2), "1");
console.log("  HC text-secondary (#D6DEF0):", contrast(window_blended, text_secondary_hc).toFixed(2), "1");

console.log("\nWCAG AA pass = 4.5:1 (normal text) or 3:1 (large/UI)");
