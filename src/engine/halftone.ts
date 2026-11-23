import { mix } from "./color";
import { makeField, type ImageField } from "./field";
import { cellRandom } from "./random";
import { MAX_DOTS, type Settings } from "./settings";

export interface Dot {
  x: number;
  y: number;
  /** Diameter for circles, outline size for other shapes, thickness for lines. */
  size: number;
  rotation: number;
  color: string;
}

export interface Pattern {
  dots: Dot[];
  /** True when the dot cap was hit and the pattern was cut short. */
  capped: boolean;
}

/** Dots smaller than this (in pixels) are left out: they would not show and only bloat the SVG. */
const MIN_VISIBLE = 0.35;

export function generatePattern(s: Settings, image?: ImageField | null): Pattern {
  const { width: w, height: h, spacing } = s;
  const field = makeField(s.field, w, h, s.seed, image);
  const rad = (s.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  // Rotated grid big enough to cover the artboard at any angle.
  const half = Math.hypot(w, h) / 2;
  const n = Math.ceil(half / spacing) + 1;
  const range = s.maxSize - s.minSize;
  const dots: Dot[] = [];
  let capped = false;

  outer: for (let j = -n; j <= n; j++) {
    const rowShift = s.grid === "offset" && (j & 1) !== 0 ? 0.5 : 0;
    for (let i = -n; i <= n; i++) {
      let gx = (i + rowShift) * spacing;
      let gy = j * spacing;
      if (s.jitter > 0) {
        gx += (cellRandom(i, j, s.seed, 1) - 0.5) * s.jitter * spacing;
        gy += (cellRandom(i, j, s.seed, 2) - 0.5) * s.jitter * spacing;
      }
      const x = w / 2 + gx * cos - gy * sin;
      const y = h / 2 + gx * sin + gy * cos;
      if (x < 0 || y < 0 || x > w || y > h) continue;

      const v = field(x, y);
      let size = spacing * (s.minSize + range * Math.pow(v, s.curve));
      if (s.sizeNoise > 0) size *= 1 + s.sizeNoise * (cellRandom(i, j, s.seed, 3) - 0.5);
      if (size < MIN_VISIBLE) continue;
      if (s.shape === "line") size = Math.min(size, spacing);

      let color = s.color.ink;
      if (s.color.mode === "gradient") color = mix(s.color.ink, s.color.ink2, v);
      else if (s.color.mode === "palette") {
        const p = s.color.palette;
        const t = s.color.paletteBy === "random" ? cellRandom(i, j, s.seed, 4) : v;
        color = p[Math.min(p.length - 1, Math.floor(t * p.length))] ?? s.color.ink;
      }

      dots.push({ x, y, size, rotation: s.angle, color });
      if (dots.length >= MAX_DOTS) {
        capped = true;
        break outer;
      }
    }
  }
  return { dots, capped };
}
