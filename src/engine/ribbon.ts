import { isHex, mix } from "./color";
import { monotoneCurve } from "./curve";
import { SHAPES, type Shape } from "./shapes";

/**
 * A ribbon of dots in 3D: a grid sheet that follows a path set by markers, twisting and
 * widening as it goes, seen in perspective. Nearer dots are bigger and brighter.
 */
export interface Marker {
  id: string;
  /** Position along the artboard, 0..1. */
  x: number;
  /** Ribbon center height, 0 (top) .. 1 (bottom). */
  y: number;
  /** Ribbon width here, as a fraction of artboard height. */
  width: number;
  /** Twist in degrees: 0 faces you flat, 90 is edge-on (a bright line). */
  twist: number;
}

export interface RibbonSettings {
  width: number;
  height: number;
  markers: Marker[];
  /** Dots along the ribbon. */
  columns: number;
  /** Dots across the ribbon. */
  rows: number;
  /** Dot diameter in pixels at middle depth. */
  dotSize: number;
  /** How strongly depth changes dot size and spacing, 0..1. */
  perspective: number;
  /** Far dots fade out, 0..1. */
  depthFade: number;
  /** Dots shrink toward the ribbon's edges, 0..1. */
  edgeSoftness: number;
  /** Ripples running along the ribbon. */
  ripple: number;
  rippleCount: number;
  /** Bends the ribbon's cross-section into an arc (the scalloped look), -1..1. */
  curl: number;
  /** Largest a dot can get, as a share of the distance to its nearest neighbor. */
  fill: number;
  /** Adds in-between columns where fast twists fan the dots apart, 0..1. */
  gapFill: number;
  shape: Shape;
  ink: string;
  /** Far color; equals ink for a single color. */
  inkFar: string;
  background: string;
  transparent: boolean;
}

export interface RibbonDot {
  x: number;
  y: number;
  size: number;
  /** 0..1, snapped to steps so SVG output stays groupable. */
  opacity: number;
  color: string;
  depth: number;
}

export const RIBBON_LIMITS = {
  width: [200, 8000],
  height: [100, 8000],
  columns: [20, 500],
  rows: [3, 140],
  dotSize: [0.5, 40],
  perspective: [0, 1],
  depthFade: [0, 1],
  edgeSoftness: [0, 1],
  ripple: [0, 1],
  rippleCount: [0, 30],
  curl: [-1, 1],
  fill: [0.2, 1.2],
  gapFill: [0, 1],
  markerWidth: [0.01, 1.5],
  twist: [-180, 180],
} as const;

const MAX_MARKERS = 12;

let idCounter = 0;
export const newMarkerId = () => `m${Date.now().toString(36)}${(idCounter++).toString(36)}`;

export function sortedMarkers(markers: Marker[]): Marker[] {
  return [...markers].sort((a, b) => a.x - b.x);
}

/** Interpolated ribbon path: center height, width and twist at any x (0..1). */
export function ribbonPath(markers: Marker[]) {
  const ms = sortedMarkers(markers);
  const xs = ms.map((m) => m.x);
  return {
    y: monotoneCurve(
      xs,
      ms.map((m) => m.y),
    ),
    width: monotoneCurve(
      xs,
      ms.map((m) => m.width),
    ),
    twist: monotoneCurve(
      xs,
      ms.map((m) => m.twist),
    ),
  };
}

/** Centerline samples per ribbon, for spacing columns evenly along the path. */
const PATH_SAMPLES = 2048;
const U0 = -0.04;
const U1 = 1.04;

export function generateRibbon(s: RibbonSettings): RibbonDot[] {
  if (s.markers.length === 0) return [];
  const W = s.width;
  const H = s.height;
  const path = ribbonPath(s.markers);
  const baseCols = Math.round(s.columns);
  const rows = Math.round(s.rows);
  // Camera distance: far away (flat look) at perspective 0, close (strong depth) at 1.
  const focal = H * (6 - 5 * s.perspective);
  const cx = W / 2;
  const cy = H / 2;
  const maxDepth = H * 0.75;

  // 1. Space columns evenly along the centerline (arc length), not evenly in x, so steep
  //    climbs keep the same dot rhythm as flat stretches. The ribbon runs a little past both
  //    edges so it leaves the frame instead of stopping in it.
  const lengths = new Float64Array(PATH_SAMPLES + 1);
  let prevX = U0 * W;
  let prevY = path.y(U0) * H;
  for (let k = 1; k <= PATH_SAMPLES; k++) {
    const u = U0 + ((U1 - U0) * k) / PATH_SAMPLES;
    const x = u * W;
    const y = path.y(u) * H;
    lengths[k] = (lengths[k - 1] ?? 0) + Math.hypot(x - prevX, y - prevY);
    prevX = x;
    prevY = y;
  }
  const total = lengths[PATH_SAMPLES] ?? 1;
  const colU: number[] = [];
  let k = 0;
  for (let c = 0; c <= baseCols; c++) {
    const target = (total * c) / baseCols;
    while (k < PATH_SAMPLES - 1 && (lengths[k + 1] ?? 0) < target) k++;
    const a = lengths[k] ?? 0;
    const b = lengths[k + 1] ?? a + 1;
    const f = b > a ? (target - a) / (b - a) : 0;
    colU.push(U0 + ((U1 - U0) * (k + f)) / PATH_SAMPLES);
  }

  // 2. Build the 3D grid with a proper ribbon frame: the cross-section turns around the
  //    path's direction, so slopes don't shear or pinch the ribbon.
  const du = 1e-4;
  const buildGrid = (us: number[]) => {
    const n = us.length * rows;
    const g = {
      x: new Float64Array(n),
      y: new Float64Array(n),
      z: new Float64Array(n),
      scale: new Float64Array(n),
    };
    for (let c = 0; c < us.length; c++) {
      const u = us[c]!;
      const centerY = path.y(u) * H;
      const tx = W;
      const ty = ((path.y(u + du) - path.y(u - du)) / (2 * du)) * H;
      const tl = Math.hypot(tx, ty) || 1;
      const nx = -ty / tl;
      const ny = tx / tl;
      const half = (Math.max(0, path.width(u)) * H) / 2;
      const theta = (path.twist(u) * Math.PI) / 180;
      const cos = Math.cos(theta);
      const sin = Math.sin(theta);
      for (let r = 0; r < rows; r++) {
        const v = rows === 1 ? 0 : -1 + (2 * r) / (rows - 1);
        const local = v * half;
        // Curl bends each cross-section into an arc, perpendicular to its own direction.
        const bend = s.curl * half * 0.6 * (v * v - 1 / 3);
        const wave = s.ripple * half * 0.25 * Math.sin(2 * Math.PI * s.rippleCount * u + v * 2.4);
        const inPlane = local * cos - bend * sin + wave;
        const px = u * W + nx * inPlane;
        const py = centerY + ny * inPlane;
        const pz = local * sin + bend * cos;
        const scale = focal / (focal + pz);
        const i = c * rows + r;
        g.scale[i] = scale;
        g.z[i] = pz;
        g.x[i] = cx + (px - cx) * scale;
        g.y[i] = cy + (py - cy) * scale;
      }
    }
    return g;
  };

  // 2b. Gap fill: where a fast twist fans neighboring columns far apart on screen (the spiky
  //     strips), add in-between columns. Their dots size themselves to the room they have, so
  //     the twist fills in with small dots and reads as one continuous sheet.
  let us = colU;
  let grid = buildGrid(us);
  // For each refined column: which base interval it belongs to, and whether it's an added one.
  let colInterval: Int32Array | null = null;
  let colAdded: Uint8Array | null = null;
  const baseGap = new Float64Array(baseCols * rows);
  let gapLimit = Infinity;
  if (s.gapFill > 0 && rows > 1) {
    const intervalMax = new Float64Array(baseCols);
    const all: number[] = [];
    for (let c = 0; c < baseCols; c++) {
      let m = 0;
      for (let r = 0; r < rows; r++) {
        const i = c * rows + r;
        const j = i + rows;
        const d = Math.hypot(grid.x[i]! - grid.x[j]!, grid.y[i]! - grid.y[j]!);
        baseGap[i] = d;
        if (d > m) m = d;
        if ((r & 3) === 0) all.push(d);
      }
      intervalMax[c] = m;
    }
    all.sort((p, q) => p - q);
    const typical = Math.max(0.5, all[all.length >> 1] ?? 1);
    // Low fill only splits gaps 3x the typical spacing; 100% splits anything over 1.15x.
    const limit = typical * (3 - 1.85 * s.gapFill);
    gapLimit = limit;
    const split = new Int32Array(baseCols);
    for (let c = 0; c < baseCols; c++) split[c] = Math.min(12, Math.ceil(intervalMax[c]! / limit));
    // Ramp density up and down gradually (neighbors differ by at most 1 extra column), so
    // filled areas blend in instead of showing seams where the density jumps.
    for (let c = 1; c < baseCols; c++) split[c] = Math.max(split[c]!, split[c - 1]! - 1);
    for (let c = baseCols - 2; c >= 0; c--) split[c] = Math.max(split[c]!, split[c + 1]! - 1);
    const budget = baseCols * 3; // extra columns allowed, keeps the worst case fast
    let added = 0;
    const refined: number[] = [];
    const interval: number[] = [];
    const isAdded: number[] = [];
    for (let c = 0; c < baseCols; c++) {
      const u0 = colU[c]!;
      const u1 = colU[c + 1]!;
      refined.push(u0);
      interval.push(c);
      isAdded.push(0);
      const m = split[c]!;
      for (let k2 = 1; k2 < m && added < budget; k2++, added++) {
        refined.push(u0 + ((u1 - u0) * k2) / m);
        interval.push(c);
        isAdded.push(1);
      }
    }
    refined.push(colU[baseCols]!);
    interval.push(baseCols - 1);
    isAdded.push(0);
    if (added > 0) {
      us = refined;
      grid = buildGrid(us);
      colInterval = Int32Array.from(interval);
      colAdded = Uint8Array.from(isAdded);
    }
  }
  const cols = us.length - 1;
  const { x: gx, y: gy, z: gz, scale: gScale } = grid;

  // 3. Size every dot to the room it actually has on screen, like a real halftone screen:
  //    a dot never grows past `fill` of the distance to its neighbors, so squeezed areas
  //    stay crisp separate dots instead of merging into lines.
  //    Each neighbor distance is measured once and shared by both dots.
  const gapAlong = new Float64Array(cols * rows); // between column c and c+1, row r
  for (let c = 0; c < cols; c++) {
    for (let r = 0; r < rows; r++) {
      const i = c * rows + r;
      const j = i + rows;
      gapAlong[i] = Math.hypot(gx[i]! - gx[j]!, gy[i]! - gy[j]!);
    }
  }
  const gapAcross = new Float64Array((cols + 1) * rows); // between row r and r+1, column c
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r < rows - 1; r++) {
      const i = c * rows + r;
      gapAcross[i] = Math.hypot(gx[i]! - gx[i + 1]!, gy[i]! - gy[i + 1]!);
    }
  }
  // Per-row values: where the row sits across the ribbon and how much the edge softens it.
  const rowEdge = new Float64Array(rows);
  for (let r = 0; r < rows; r++) {
    const v = rows === 1 ? 0 : -1 + (2 * r) / (rows - 1);
    rowEdge[r] = 1 - s.edgeSoftness * Math.abs(v) ** 3;
  }
  const sizePower = 1 + 2 * s.perspective;
  const oneInk = s.ink === s.inkFar;
  const dots: RibbonDot[] = [];
  for (let c = 0; c <= cols; c++) {
    for (let r = 0; r < rows; r++) {
      const i = c * rows + r;
      const scale = gScale[i]!;
      if (scale <= 0) continue;
      const added = colAdded !== null && colAdded[c] === 1;
      // Added (gap-fill) dots only go where the original columns spread too far apart.
      if (added && baseGap[colInterval![c]! * rows + r]! <= gapLimit) continue;
      let along = Infinity;
      if (colAdded && !added) {
        // An original dot keeps the room it had before gap fill, so it doesn't shrink.
        // Original column B starts base interval B (the last one ends interval B - 1).
        const B = c === cols ? baseCols : colInterval![c]!;
        if (B < baseCols) along = baseGap[B * rows + r]!;
        if (B > 0) along = Math.min(along, baseGap[(B - 1) * rows + r]!);
      } else {
        if (c > 0) along = gapAlong[i - rows]!;
        if (c < cols) along = Math.min(along, gapAlong[i]!);
      }
      let across = Infinity;
      if (r > 0) across = gapAcross[i - 1]!;
      if (r < rows - 1) across = Math.min(across, gapAcross[i]!);
      // Edge-on, a whole column collapses to one spot; let it read as one dot on the path.
      const room = Math.max(Math.min(along, across), 0.5 * along);
      const edge = rowEdge[r]!;
      const wanted = s.dotSize * scale ** sizePower * edge;
      const size = Math.min(wanted, s.fill * room * edge);
      if (size < 0.3) continue;
      const x = gx[i]!;
      const y = gy[i]!;
      if (x < -size || x > W + size || y < -size || y > H + size) continue;
      const pz = gz[i]!;
      const depth01 = Math.max(0, Math.min(1, 0.5 + pz / (2 * maxDepth)));
      const opacity = Math.round((1 - s.depthFade * depth01) * 20) / 20;
      if (opacity <= 0) continue;
      dots.push({
        x,
        y,
        size,
        opacity,
        color: oneInk ? s.ink : mix(s.ink, s.inkFar, depth01, 16),
        depth: pz,
      });
    }
  }

  return paintOrder(dots);
}

/**
 * Far-to-near order. Packs a depth key and the dot's index into one number so the browser's
 * native numeric sort does the work: several times faster than a comparator on 30k objects.
 */
function paintOrder(dots: RibbonDot[]): RibbonDot[] {
  const n = dots.length;
  const keys = new Float64Array(n);
  const SHIFT = 2 ** 21; // room for up to ~2M dots
  for (let i = 0; i < n; i++) {
    // Larger depth (farther) first; depth quantized to 1/16 px, plenty for paint order.
    const q = Math.round(-(dots[i]?.depth ?? 0) * 16) + 2 ** 26;
    keys[i] = q * SHIFT + i;
  }
  keys.sort();
  const out = new Array<RibbonDot>(n);
  for (let i = 0; i < n; i++) out[i] = dots[(keys[i] ?? 0) % SHIFT]!;
  return out;
}

/** Degrees of twist per 1% of artboard width above which a twist counts as sharp. */
export const SHARP_TWIST = 6;

/** Neighboring marker pairs whose twist changes faster than SHARP_TWIST. */
export function sharpTwists(markers: Marker[]): { a: Marker; b: Marker }[] {
  const ms = sortedMarkers(markers);
  const out: { a: Marker; b: Marker }[] = [];
  for (let i = 0; i < ms.length - 1; i++) {
    const a = ms[i]!;
    const b = ms[i + 1]!;
    const span = Math.max(0.005, b.x - a.x) * 100;
    if (Math.abs(b.twist - a.twist) / span > SHARP_TWIST) out.push({ a, b });
  }
  return out;
}

/** Eases a sharp twist: keeps its middle angle, shrinks the change to a gentle rate. */
export function smoothTwist(a: Marker, b: Marker): { a: number; b: number } {
  const span = Math.max(0.005, b.x - a.x) * 100;
  const mid = (a.twist + b.twist) / 2;
  const delta = Math.sign(b.twist - a.twist) * Math.min(Math.abs(b.twist - a.twist), 4 * span);
  return { a: mid - delta / 2, b: mid + delta / 2 };
}

export const NAVY = "#0e2238";
export const SLATE = "#4f6c8c";

export const DEFAULT_RIBBON: RibbonSettings = {
  width: 2000,
  height: 1125,
  markers: [
    { id: "a", x: 0, y: 0.6, width: 0.3, twist: 15 },
    { id: "b", x: 0.45, y: 0.56, width: 0.24, twist: 80 },
    { id: "c", x: 0.75, y: 0.72, width: 0.5, twist: -20 },
    { id: "d", x: 1, y: 0.45, width: 0.75, twist: -55 },
  ],
  columns: 190,
  rows: 38,
  dotSize: 5,
  perspective: 0.55,
  depthFade: 0.35,
  edgeSoftness: 0.5,
  ripple: 0.2,
  rippleCount: 9,
  curl: 0.5,
  fill: 0.8,
  gapFill: 0.7,
  shape: "circle",
  ink: "#ffffff",
  inkFar: "#ffffff",
  background: "#000000",
  transparent: false,
};

type RibbonPatch = Partial<RibbonSettings>;
const make = (p: RibbonPatch): RibbonSettings => ({ ...DEFAULT_RIBBON, ...p });
const m = (x: number, y: number, width: number, twist: number, id: string): Marker => ({
  id,
  x,
  y,
  width,
  twist,
});

export const RIBBON_PRESETS: { id: string; label: string; settings: RibbonSettings }[] = [
  { id: "hero", label: "Hero twist", settings: make({}) },
  {
    id: "rise",
    label: "Rise and fold",
    settings: make({
      width: 2000,
      height: 375,
      markers: [
        m(0, 0.6, 0.6, -30, "a"),
        m(0.17, 0.75, 0.5, 10, "b"),
        m(0.36, 0.15, 0.9, 60, "c"),
        m(0.58, 0.75, 0.6, 85, "d"),
        m(1, 0.55, 0.9, -20, "e"),
      ],
      columns: 220,
      rows: 34,
      dotSize: 3,
      ripple: 0.15,
      ink: SLATE,
      inkFar: SLATE,
      background: NAVY,
    }),
  },
  {
    id: "drift",
    label: "Low drift",
    settings: make({
      width: 2000,
      height: 375,
      markers: [
        m(0, 0.62, 0.25, 40, "a"),
        m(0.3, 0.72, 0.2, 70, "b"),
        m(0.6, 0.55, 0.55, 15, "c"),
        m(0.9, 0.95, 0.35, 75, "d"),
        m(1, 0.98, 0.3, 80, "e"),
      ],
      columns: 240,
      rows: 26,
      dotSize: 2.4,
      depthFade: 0.5,
      ripple: 0.1,
      ink: SLATE,
      inkFar: SLATE,
      background: NAVY,
    }),
  },
  {
    id: "peak",
    label: "Single peak",
    settings: make({
      width: 2000,
      height: 375,
      markers: [
        m(0, 0.98, 0.15, 30, "a"),
        m(0.5, 0.8, 0.45, 20, "b"),
        m(0.74, 0.25, 0.6, 50, "c"),
        m(0.85, 0.8, 0.4, 85, "d"),
        m(1, 0.55, 0.7, 10, "e"),
      ],
      columns: 230,
      rows: 30,
      dotSize: 2.6,
      ink: SLATE,
      inkFar: SLATE,
      background: NAVY,
    }),
  },
];

function num(v: unknown, [lo, hi]: readonly [number, number], fallback: number): number {
  return typeof v === "number" && Number.isFinite(v) ? Math.min(hi, Math.max(lo, v)) : fallback;
}

function sanitizeMarker(v: unknown): Marker | null {
  if (typeof v !== "object" || v === null) return null;
  const o = v as Record<string, unknown>;
  if (typeof o.x !== "number" || typeof o.y !== "number") return null;
  return {
    id: typeof o.id === "string" && o.id.length <= 40 ? o.id : newMarkerId(),
    x: num(o.x, [0, 1], 0.5),
    y: num(o.y, [0, 1], 0.5),
    width: num(o.width, RIBBON_LIMITS.markerWidth, 0.3),
    twist: num(o.twist, RIBBON_LIMITS.twist, 0),
  };
}

/** Turns anything (a saved draft, a shared link) into valid ribbon settings. */
export function sanitizeRibbon(input: unknown): RibbonSettings {
  const d = DEFAULT_RIBBON;
  const o = (typeof input === "object" && input !== null ? input : {}) as Record<string, unknown>;
  const markers = Array.isArray(o.markers)
    ? o.markers
        .map(sanitizeMarker)
        .filter((x): x is Marker => x !== null)
        .slice(0, MAX_MARKERS)
    : [];
  const L = RIBBON_LIMITS;
  return {
    width: Math.round(num(o.width, L.width, d.width)),
    height: Math.round(num(o.height, L.height, d.height)),
    markers: markers.length >= 2 ? markers : d.markers,
    columns: Math.round(num(o.columns, L.columns, d.columns)),
    rows: Math.round(num(o.rows, L.rows, d.rows)),
    dotSize: num(o.dotSize, L.dotSize, d.dotSize),
    perspective: num(o.perspective, L.perspective, d.perspective),
    depthFade: num(o.depthFade, L.depthFade, d.depthFade),
    edgeSoftness: num(o.edgeSoftness, L.edgeSoftness, d.edgeSoftness),
    ripple: num(o.ripple, L.ripple, d.ripple),
    rippleCount: num(o.rippleCount, L.rippleCount, d.rippleCount),
    curl: num(o.curl, L.curl, d.curl),
    fill: num(o.fill, L.fill, d.fill),
    gapFill: num(o.gapFill, L.gapFill, d.gapFill),
    shape: SHAPES.some((x) => x.id === o.shape) ? (o.shape as Shape) : d.shape,
    ink: isHex(o.ink) ? o.ink : d.ink,
    inkFar: isHex(o.inkFar) ? o.inkFar : d.inkFar,
    background: isHex(o.background) ? o.background : d.background,
    transparent: typeof o.transparent === "boolean" ? o.transparent : d.transparent,
  };
}

export { MAX_MARKERS };
