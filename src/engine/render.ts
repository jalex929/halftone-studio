import type { Dot } from "./halftone";
import type { Settings } from "./settings";
import { shapePolygon } from "./shapes";

const r2 = (v: number) => Math.round(v * 100) / 100;

/** Line segments overlap slightly so a solid band never shows hairline gaps. */
const lineLength = (s: Settings) => s.spacing + 0.6;

/** A real vector SVG: one element per dot, grouped by color so it stays easy to edit. */
export function toSvg(s: Settings, dots: Dot[]): string {
  const groups = new Map<string, string[]>();
  for (const d of dots) {
    let el: string;
    if (s.shape === "circle") {
      el = `<circle cx="${r2(d.x)}" cy="${r2(d.y)}" r="${r2(d.size / 2)}"/>`;
    } else {
      const pts = shapePolygon(s.shape, d.x, d.y, d.size, d.rotation, lineLength(s));
      el = `<polygon points="${pts.map(([x, y]) => `${r2(x)},${r2(y)}`).join(" ")}"/>`;
    }
    const list = groups.get(d.color);
    if (list) list.push(el);
    else groups.set(d.color, [el]);
  }
  const body = [...groups].map(([color, els]) => `<g fill="${color}">${els.join("")}</g>`);
  const bg = s.color.transparent
    ? ""
    : `<rect width="${s.width}" height="${s.height}" fill="${s.color.background}"/>`;
  return [
    `<svg xmlns="http://www.w3.org/2000/svg" width="${s.width}" height="${s.height}" viewBox="0 0 ${s.width} ${s.height}">`,
    `<title>Halftone pattern</title>`,
    bg,
    ...body,
    `</svg>`,
  ].join("\n");
}

/** Draws the same dots onto a canvas. `scale` renders at a larger pixel size (for 2x PNG). */
export function drawToCanvas(
  ctx: CanvasRenderingContext2D,
  s: Settings,
  dots: Dot[],
  scale = 1,
): void {
  ctx.save();
  ctx.setTransform(scale, 0, 0, scale, 0, 0);
  ctx.clearRect(0, 0, s.width, s.height);
  if (!s.color.transparent) {
    ctx.fillStyle = s.color.background;
    ctx.fillRect(0, 0, s.width, s.height);
  }
  // Batch every dot of a color into one path: far faster than filling one at a time.
  const byColor = new Map<string, Dot[]>();
  for (const d of dots) {
    const list = byColor.get(d.color);
    if (list) list.push(d);
    else byColor.set(d.color, [d]);
  }
  for (const [color, list] of byColor) {
    ctx.fillStyle = color;
    ctx.beginPath();
    for (const d of list) {
      if (s.shape === "circle") {
        ctx.moveTo(d.x + d.size / 2, d.y);
        ctx.arc(d.x, d.y, d.size / 2, 0, Math.PI * 2);
      } else {
        const pts = shapePolygon(s.shape, d.x, d.y, d.size, d.rotation, lineLength(s));
        const [first, ...rest] = pts;
        if (!first) continue;
        ctx.moveTo(first[0], first[1]);
        for (const [x, y] of rest) ctx.lineTo(x, y);
        ctx.closePath();
      }
    }
    ctx.fill();
  }
  ctx.restore();
}
