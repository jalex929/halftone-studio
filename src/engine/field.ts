import { cellRandom } from "./random";

export type FieldKind = "linear" | "radial" | "wave" | "noise" | "image";

export interface FieldSettings {
  kind: FieldKind;
  /** Direction in degrees (linear, wave). */
  angle: number;
  /** Center, 0..1 of the artboard (radial). */
  cx: number;
  cy: number;
  /** Radial reach, or noise blob size. 0.2..2. */
  scale: number;
  /** Number of bands across the artboard (wave). */
  waves: number;
  invert: boolean;
}

/** Brightness map of an uploaded image: 0 = black, 1 = white; alpha 0 = transparent. */
export interface ImageField {
  width: number;
  height: number;
  luminance: Float32Array;
  alpha: Float32Array;
}

/** Returns 0..1 for a point in artboard pixels. 1 means the biggest dot. */
export type Field = (x: number, y: number) => number;

const clamp01 = (v: number) => (v < 0 ? 0 : v > 1 ? 1 : v);

function smooth(t: number) {
  return t * t * (3 - 2 * t);
}

function valueNoise(x: number, y: number, seed: number): number {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const tx = smooth(x - xi);
  const ty = smooth(y - yi);
  const a = cellRandom(xi, yi, seed, 7);
  const b = cellRandom(xi + 1, yi, seed, 7);
  const c = cellRandom(xi, yi + 1, seed, 7);
  const d = cellRandom(xi + 1, yi + 1, seed, 7);
  return a + (b - a) * tx + (c - a) * ty + (a - b - c + d) * tx * ty;
}

function sampleImage(img: ImageField, u: number, v: number): number {
  // Bilinear sample in image pixels; outside the image counts as empty.
  if (u < 0 || v < 0 || u > img.width - 1 || v > img.height - 1) return 0;
  const x0 = Math.floor(u);
  const y0 = Math.floor(v);
  const x1 = Math.min(x0 + 1, img.width - 1);
  const y1 = Math.min(y0 + 1, img.height - 1);
  const tx = u - x0;
  const ty = v - y0;
  const at = (x: number, y: number) => {
    const k = y * img.width + x;
    // Dark, opaque pixels make big dots; transparent pixels make none.
    return (1 - (img.luminance[k] ?? 1)) * (img.alpha[k] ?? 0);
  };
  const top = at(x0, y0) + (at(x1, y0) - at(x0, y0)) * tx;
  const bottom = at(x0, y1) + (at(x1, y1) - at(x0, y1)) * tx;
  return top + (bottom - top) * ty;
}

export function makeField(
  s: FieldSettings,
  width: number,
  height: number,
  seed: number,
  image?: ImageField | null,
): Field {
  const rad = (s.angle * Math.PI) / 180;
  const cos = Math.cos(rad);
  const sin = Math.sin(rad);
  const extent = 0.5 * (Math.abs(cos) * width + Math.abs(sin) * height) || 1;
  const along = (x: number, y: number) =>
    0.5 + ((x - width / 2) * cos + (y - height / 2) * sin) / (2 * extent);
  const across = (x: number, y: number) =>
    0.5 + (-(x - width / 2) * sin + (y - height / 2) * cos) / (2 * extent);

  let base: Field;
  switch (s.kind) {
    case "linear":
      base = (x, y) => clamp01(along(x, y));
      break;
    case "radial": {
      const r = Math.max(1, s.scale * 0.5 * Math.hypot(width, height));
      const ox = s.cx * width;
      const oy = s.cy * height;
      base = (x, y) => clamp01(1 - Math.hypot(x - ox, y - oy) / r);
      break;
    }
    case "wave":
      base = (x, y) => {
        const wobble = 0.08 * Math.sin(2 * Math.PI * 2 * across(x, y));
        return 0.5 + 0.5 * Math.sin(2 * Math.PI * (s.waves * along(x, y) + wobble));
      };
      break;
    case "noise": {
      const cell = Math.max(8, s.scale * 0.25 * Math.min(width, height));
      base = (x, y) =>
        clamp01(
          0.7 * valueNoise(x / cell, y / cell, seed) +
            0.3 * valueNoise((x / cell) * 2.3, (y / cell) * 2.3, seed + 1),
        );
      break;
    }
    case "image": {
      if (!image) {
        base = () => 0.5;
        break;
      }
      // Fit the whole image inside the artboard, centered.
      const fit = Math.min(width / image.width, height / image.height);
      const ox = (width - image.width * fit) / 2;
      const oy = (height - image.height * fit) / 2;
      base = (x, y) => clamp01(sampleImage(image, (x - ox) / fit - 0.5, (y - oy) / fit - 0.5));
      break;
    }
  }
  return s.invert ? (x, y) => 1 - base(x, y) : base;
}
