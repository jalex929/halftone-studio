import type { RibbonDot, RibbonSettings } from "./ribbon";
import { shapePolygon } from "./shapes";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Real vector SVG, dots grouped by color and opacity, painted far to near. */
export function ribbonToSvg(s: RibbonSettings, dots: RibbonDot[]): string {
  const out: string[] = [];
  let key = "";
  let open = false;
  for (const d of dots) {
    const k = `${d.color}|${d.opacity}`;
    if (k !== key) {
      if (open) out.push("</g>");
      out.push(`<g fill="${d.color}"${d.opacity < 1 ? ` fill-opacity="${d.opacity}"` : ""}>`);
      key = k;
      open = true;
    }
    if (s.shape === "circle") {
      out.push(`<circle cx="${r2(d.x)}" cy="${r2(d.y)}" r="${r2(d.size / 2)}"/>`);
    } else {
      const pts = shapePolygon(s.shape, d.x, d.y, d.size, 0);
      out.push(`<polygon points="${pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ")}"/>`);
    }
  }
  if (open) out.push("</g>");
  const bg = s.transparent
    ? ""
    : `<rect width="${s.width}" height="${s.height}" fill="${s.background}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">`,
    `<title>Halftone ribbon</title>`,
    bg,
    out.join(""),
    `</svg>`,
  ].join("\n");
}

export function drawRibbon(
  ctx: CanvasRenderingContext2D,
  s: RibbonSettings,
  dots: RibbonDot[],
  scale = 1,
): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, s.width, s.height);
  if (!s.transparent) {
    ctx.fillStyle = s.background;
    ctx.fillRect(0, 0, s.width, s.height);
  }
  // Consecutive dots that share color and opacity go into one path (they're sorted by depth).
  let key = "";
  const flush = () => ctx.fill();
  ctx.beginPath();
  for (const d of dots) {
    const k = `${d.color}|${d.opacity}`;
    if (k !== key) {
      if (key) flush();
      ctx.beginPath();
      ctx.fillStyle = d.color;
      ctx.globalAlpha = d.opacity;
      key = k;
    }
    if (s.shape === "circle") {
      ctx.moveTo(d.x + d.size / 2, d.y);
      ctx.arc(d.x, d.y, d.size / 2, 0, Math.PI * 2);
    } else {
      const [first, ...rest] = shapePolygon(s.shape, d.x, d.y, d.size, 0);
      if (!first) continue;
      ctx.moveTo(first[0], first[1]);
      for (const [x, y] of rest) ctx.lineTo(x, y);
      ctx.closePath();
    }
  }
  if (key) flush();
  ctx.restore();
}
