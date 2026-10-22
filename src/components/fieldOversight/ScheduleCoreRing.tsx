/**
 * ScheduleCoreRing — the next ten working days as a ring. Each segment is a
 * day, toned by the field gate (critical / warning / clear / nothing on site);
 * the first two carry an outer gate bracket. Ticks inside are the erection
 * tasks and deliveries on that day.
 *
 * Colours are read from the command-skin CSS variables at draw time so the
 * ring follows light and SteelBuild Dark without a literal colour in source.
 */
import { useCallback, useEffect, useRef, useState } from "react";
import type { MouseEvent } from "react";
import type { CoreDay, CoreTone } from "@/lib/fieldOversight";

const TAU = Math.PI * 2;

function cssVar(el: Element, name: string): string {
  return getComputedStyle(el).getPropertyValue(name).trim();
}

function shortDay(iso: string): string {
  return new Date(`${iso}T12:00:00Z`).toLocaleDateString("en-US", { weekday: "short", day: "numeric", timeZone: "UTC" });
}

export interface ScheduleCoreRingProps {
  days: readonly CoreDay[];
  ariaLabel: string;
}

export function ScheduleCoreRing({ days, ariaLabel }: ScheduleCoreRingProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const [hover, setHover] = useState<number>(-1);
  const reduceMotion = typeof window !== "undefined" && typeof window.matchMedia === "function"
    && window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  const draw = useCallback((t: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const box = canvas.getBoundingClientRect();
    if (!box.width || !box.height) return;
    const dpr = Math.min(window.devicePixelRatio || 1, 3);
    const W = Math.round(box.width * dpr);
    const H = Math.round(box.height * dpr);
    if (canvas.width !== W || canvas.height !== H) { canvas.width = W; canvas.height = H; }
    const g = canvas.getContext("2d");
    if (!g) return;
    g.setTransform(dpr, 0, 0, dpr, 0, 0);
    g.clearRect(0, 0, box.width, box.height);

    const color: Record<CoreTone | "gold" | "border" | "muted" | "text", string> = {
      critical: cssVar(canvas, "--cmd-danger"),
      warning: cssVar(canvas, "--cmd-warn"),
      clear: cssVar(canvas, "--cmd-good"),
      empty: cssVar(canvas, "--cmd-chip-bg"),
      gold: cssVar(canvas, "--cmd-gold"),
      border: cssVar(canvas, "--cmd-border"),
      muted: cssVar(canvas, "--cmd-text-muted"),
      text: cssVar(canvas, "--cmd-text"),
    };
    const cx = box.width / 2;
    const cy = box.height / 2;
    const R = Math.max(60, Math.min(box.width, box.height) / 2 - 24);
    const n = Math.max(days.length, 1);
    const a0 = -Math.PI / 2;
    const step = TAU / n;
    const gap = step * 0.12;

    // Web
    g.strokeStyle = color.border;
    g.lineWidth = 1;
    for (const f of [0.36, 0.56, 0.76]) { g.beginPath(); g.arc(cx, cy, R * f, 0, TAU); g.stroke(); }

    // Sweep
    if (!reduceMotion) {
      const sw = t * 0.0004;
      g.strokeStyle = color.gold;
      for (let i = 0; i < 40; i++) {
        g.globalAlpha = Math.pow(1 - i / 40, 2) * 0.12;
        g.lineWidth = R * 0.4;
        g.beginPath(); g.arc(cx, cy, R * 0.56, sw - i * 0.015, sw - i * 0.015 + 0.016); g.stroke();
      }
      g.globalAlpha = 1;
    }

    days.forEach((d, i) => {
      const s = a0 + i * step + gap / 2;
      const e = a0 + (i + 1) * step - gap / 2;
      const hot = hover === i;
      g.strokeStyle = color[d.tone] || color.empty;
      g.lineWidth = hot ? 13 : 9;
      g.lineCap = "butt";
      g.beginPath(); g.arc(cx, cy, R * 0.9, s, e); g.stroke();
      if (d.inGate) {
        g.strokeStyle = color.gold;
        g.lineWidth = 2;
        g.beginPath(); g.arc(cx, cy, R * 0.98, s, e); g.stroke();
      }
      // Ticks: one per task / delivery, spread across the segment.
      const marks = d.tasks.length + d.deliveries.length;
      for (let k = 0; k < marks; k++) {
        const a = s + (e - s) * ((k + 1) / (marks + 1));
        g.strokeStyle = k < d.tasks.length ? color.text : color.gold;
        g.lineWidth = 2;
        g.lineCap = "round";
        g.beginPath();
        g.moveTo(cx + Math.cos(a) * R * 0.66, cy + Math.sin(a) * R * 0.66);
        g.lineTo(cx + Math.cos(a) * R * 0.76, cy + Math.sin(a) * R * 0.76);
        g.stroke();
      }
      // Day label
      const am = (s + e) / 2;
      g.fillStyle = hot ? color.text : color.muted;
      g.font = "600 9px ui-monospace, monospace";
      g.textAlign = "center";
      g.textBaseline = "middle";
      g.fillText(String(Number(d.date.slice(8, 10))), cx + Math.cos(am) * (R * 0.9 + 16), cy + Math.sin(am) * (R * 0.9 + 16));
    });
  }, [days, hover, reduceMotion]);

  useEffect(() => {
    let raf = 0;
    const loop = (t: number) => {
      draw(t);
      if (!reduceMotion && !document.hidden) raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const onResize = () => draw(performance.now());
    window.addEventListener("resize", onResize);
    return () => { cancelAnimationFrame(raf); window.removeEventListener("resize", onResize); };
  }, [draw, reduceMotion]);

  const onMove = (ev: MouseEvent<HTMLCanvasElement>) => {
    const box = ev.currentTarget.getBoundingClientRect();
    const dx = ev.clientX - box.left - box.width / 2;
    const dy = ev.clientY - box.top - box.height / 2;
    const r = Math.hypot(dx, dy);
    const R = Math.max(60, Math.min(box.width, box.height) / 2 - 24);
    if (r < R * 0.6 || r > R * 1.1) { setHover(-1); return; }
    let a = Math.atan2(dy, dx) + Math.PI / 2;
    if (a < 0) a += TAU;
    setHover(Math.floor(a / (TAU / Math.max(days.length, 1))));
  };

  const hovered = hover >= 0 ? days[hover] : undefined;
  return (
    <>
      <canvas
        ref={canvasRef}
        className="fo-gate__canvas"
        role="img"
        aria-label={ariaLabel}
        onMouseMove={onMove}
        onMouseLeave={() => setHover(-1)}
      />
      <span className="sr-only" aria-live="polite">
        {hovered ? `${shortDay(hovered.date)}: ${hovered.tasks.length} erection, ${hovered.deliveries.length} deliveries, ${hovered.tone}` : ""}
      </span>
      {hovered ? (
        <div className="fo-gate__legend" style={{ justifyContent: "center" }}>
          {shortDay(hovered.date)} · {hovered.tasks.length} erection · {hovered.deliveries.length} delivery
          {hovered.readinessOpen ? ` · ${hovered.readinessOpen} readiness open` : ""}
          {hovered.weatherSeverity !== null && hovered.weatherSeverity >= 2 ? " · weather risk" : ""}
        </div>
      ) : null}
    </>
  );
}
