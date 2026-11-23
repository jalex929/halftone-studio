import { isHex } from "./color";
import type { FieldKind, FieldSettings } from "./field";
import { SHAPES, type Shape } from "./shapes";

export type ColorMode = "solid" | "gradient" | "palette";
export type PaletteBy = "value" | "random";
export type Grid = "square" | "offset";

export interface Settings {
  width: number;
  height: number;
  field: FieldSettings;
  shape: Shape;
  grid: Grid;
  /** Distance between dot centers, in pixels. */
  spacing: number;
  /** Grid rotation in degrees. */
  angle: number;
  /** Dot size at the field's low and high ends, as a fraction of spacing. */
  minSize: number;
  maxSize: number;
  /** Falloff: below 1 grows dots early, above 1 keeps them small longer. */
  curve: number;
  /** Position wobble, 0..1 of spacing. */
  jitter: number;
  /** Size wobble, 0..1. */
  sizeNoise: number;
  seed: number;
  color: {
    mode: ColorMode;
    ink: string;
    ink2: string;
    palette: string[];
    paletteBy: PaletteBy;
    background: string;
    transparent: boolean;
  };
}

export const LIMITS = {
  width: [100, 4000],
  height: [100, 4000],
  spacing: [3, 120],
  angle: [-90, 90],
  minSize: [0, 1.5],
  maxSize: [0, 1.5],
  curve: [0.3, 3],
  jitter: [0, 1],
  sizeNoise: [0, 1],
  seed: [0, 99999],
  fieldAngle: [0, 360],
  center: [0, 1],
  scale: [0.2, 2],
  waves: [1, 12],
} as const;

/** Hard cap so a tiny spacing on a huge artboard can't freeze the tab. */
export const MAX_DOTS = 160_000;

export const ARTBOARDS = [
  { label: "Square", width: 1200, height: 1200 },
  { label: "Landscape", width: 1600, height: 900 },
  { label: "Portrait", width: 1080, height: 1350 },
  { label: "Banner", width: 1500, height: 500 },
] as const;

export const DEFAULT_SETTINGS: Settings = {
  width: 1200,
  height: 1200,
  field: { kind: "radial", angle: 45, cx: 0.5, cy: 0.5, scale: 0.8, waves: 4, invert: false },
  shape: "circle",
  grid: "square",
  spacing: 18,
  angle: 45,
  minSize: 0,
  maxSize: 1.1,
  curve: 1,
  jitter: 0,
  sizeNoise: 0,
  seed: 1,
  color: {
    mode: "solid",
    ink: "#1b1b3a",
    ink2: "#ff5a36",
    palette: ["#ff5a36", "#2d6cdf", "#ffc93c", "#1b1b3a"],
    paletteBy: "value",
    background: "#f6f1e7",
    transparent: false,
  },
};

type Patch = Omit<Partial<Settings>, "field" | "color"> & {
  field?: Partial<FieldSettings>;
  color?: Partial<Settings["color"]>;
};

function preset(patch: Patch): Settings {
  return {
    ...DEFAULT_SETTINGS,
    ...patch,
    field: { ...DEFAULT_SETTINGS.field, ...patch.field },
    color: { ...DEFAULT_SETTINGS.color, ...patch.color },
  };
}

export const PRESETS: { id: string; label: string; settings: Settings }[] = [
  { id: "sunburst", label: "Sunburst", settings: preset({}) },
  {
    id: "newsprint",
    label: "Newsprint",
    settings: preset({
      field: { kind: "linear", angle: 90 },
      spacing: 14,
      maxSize: 1.25,
      curve: 1.4,
      color: { ink: "#141414", background: "#efe9dc" },
    }),
  },
  {
    id: "riso",
    label: "Riso fade",
    settings: preset({
      field: { kind: "linear", angle: 135 },
      shape: "diamond",
      spacing: 22,
      angle: 0,
      curve: 0.8,
      color: { mode: "gradient", ink: "#ff4f8b", ink2: "#2a4bd7", background: "#fff7ea" },
    }),
  },
  {
    id: "tide",
    label: "Tide lines",
    settings: preset({
      field: { kind: "wave", angle: 90, waves: 5 },
      shape: "line",
      spacing: 12,
      angle: 0,
      minSize: 0.05,
      maxSize: 0.95,
      color: { ink: "#0f4c5c", background: "#e8f3f1" },
    }),
  },
  {
    id: "confetti",
    label: "Confetti",
    settings: preset({
      field: { kind: "noise", scale: 0.9 },
      grid: "offset",
      spacing: 26,
      angle: 0,
      curve: 1.6,
      jitter: 0.35,
      sizeNoise: 0.3,
      color: { mode: "palette", paletteBy: "random", background: "#fdf8f0" },
    }),
  },
  {
    id: "night",
    label: "Night signal",
    settings: preset({
      field: { kind: "radial", cx: 0.3, cy: 0.35, scale: 1.1 },
      shape: "hexagon",
      grid: "offset",
      spacing: 16,
      angle: 0,
      color: { mode: "gradient", ink: "#ffd23f", ink2: "#ff3c78", background: "#10142b" },
    }),
  },
];

const KINDS: FieldKind[] = ["linear", "radial", "wave", "noise", "image"];

function num(v: unknown, [lo, hi]: readonly [number, number], fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function pick<T extends string>(v: unknown, options: readonly T[], fallback: T): T {
  return options.includes(v as T) ? (v as T) : fallback;
}

/** Turns anything (a saved draft, a shared link) into valid settings. */
export function sanitize(input: unknown): Settings {
  const d = DEFAULT_SETTINGS;
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const f = (typeof o.field === "object" && o.field ? o.field : {}) as Record<string, unknown>;
  const c = (typeof o.color === "object" && o.color ? o.color : {}) as Record<string, unknown>;
  const palette = Array.isArray(c.palette) ? c.palette.filter(isHex).slice(0, 8) : [];
  return {
    width: Math.round(num(o.width, LIMITS.width, d.width)),
    height: Math.round(num(o.height, LIMITS.height, d.height)),
    field: {
      kind: pick(f.kind, KINDS, d.field.kind),
      angle: num(f.angle, LIMITS.fieldAngle, d.field.angle),
      cx: num(f.cx, LIMITS.center, d.field.cx),
      cy: num(f.cy, LIMITS.center, d.field.cy),
      scale: num(f.scale, LIMITS.scale, d.field.scale),
      waves: num(f.waves, LIMITS.waves, d.field.waves),
      invert: typeof f.invert === "boolean" ? f.invert : d.field.invert,
    },
    shape: pick(
      o.shape,
      SHAPES.map((s) => s.id),
      d.shape,
    ),
    grid: pick(o.grid, ["square", "offset"] as const, d.grid),
    spacing: num(o.spacing, LIMITS.spacing, d.spacing),
    angle: num(o.angle, LIMITS.angle, d.angle),
    minSize: num(o.minSize, LIMITS.minSize, d.minSize),
    maxSize: num(o.maxSize, LIMITS.maxSize, d.maxSize),
    curve: num(o.curve, LIMITS.curve, d.curve),
    jitter: num(o.jitter, LIMITS.jitter, d.jitter),
    sizeNoise: num(o.sizeNoise, LIMITS.sizeNoise, d.sizeNoise),
    seed: Math.round(num(o.seed, LIMITS.seed, d.seed)),
    color: {
      mode: pick(c.mode, ["solid", "gradient", "palette"] as const, d.color.mode),
      ink: isHex(c.ink) ? c.ink : d.color.ink,
      ink2: isHex(c.ink2) ? c.ink2 : d.color.ink2,
      palette: palette.length ? palette : d.color.palette,
      paletteBy: pick(c.paletteBy, ["value", "random"] as const, d.color.paletteBy),
      background: isHex(c.background) ? c.background : d.color.background,
      transparent: typeof c.transparent === "boolean" ? c.transparent : d.color.transparent,
    },
  };
}

/** Settings as a URL-safe string for share links. Uploaded images are never included. */
export function encodeSettings(s: Settings): string {
  const bytes = new TextEncoder().encode(JSON.stringify(s));
  let bin = "";
  bytes.forEach((b) => (bin += String.fromCharCode(b)));
  return btoa(bin).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

export function decodeSettings(text: string): Settings | null {
  try {
    const bin = atob(text.replace(/-/g, "+").replace(/_/g, "/"));
    const bytes = Uint8Array.from(bin, (ch) => ch.charCodeAt(0));
    return sanitize(JSON.parse(new TextDecoder().decode(bytes)));
  } catch {
    return null;
  }
}
