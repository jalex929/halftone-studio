import {
  DEFAULT_RIBBON,
  RIBBON_PRESETS,
  generateRibbon,
  sanitizeRibbon,
  sharpTwists,
  smoothTwist,
  untwist,
} from "./ribbon";
import { ribbonToSvg } from "./ribbonRender";
import { monotoneCurve } from "./curve";

describe("ribbon", () => {
  it("generates every preset quickly", () => {
    for (const p of RIBBON_PRESETS) {
      const t = performance.now();
      const dots = generateRibbon(p.settings);
      expect(dots.length).toBeGreaterThan(1000);
      expect(performance.now() - t).toBeLessThan(500);
    }
  });
  it("a marker higher than its neighbors is exactly the peak", () => {
    const f = monotoneCurve([0, 0.5, 1], [0.8, 0.2, 0.7]);
    let min = 1;
    for (let i = 0; i <= 1000; i++) min = Math.min(min, f(i / 1000));
    expect(min).toBeCloseTo(0.2, 6);
    expect(f(0.5)).toBeCloseTo(0.2, 6);
  });
  it("twist 90 collapses the ribbon to a line", () => {
    const s = {
      ...DEFAULT_RIBBON,
      perspective: 0,
      curl: 0,
      ripple: 0,
      markers: [
        { id: "a", x: 0, y: 0.5, width: 0.5, twist: 90 },
        { id: "b", x: 1, y: 0.5, width: 0.5, twist: 90 },
      ],
    };
    const ys = generateRibbon(s).map((d) => d.y);
    expect(Math.max(...ys) - Math.min(...ys)).toBeLessThan(1);
  });
  it("sanitizes junk into valid settings", () => {
    const s = sanitizeRibbon({ columns: 1e9, ink: "red", markers: [{ x: 2, y: -1 }] });
    expect(s.columns).toBe(500);
    expect(s.ink).toBe(DEFAULT_RIBBON.ink);
    expect(s.markers).toEqual(DEFAULT_RIBBON.markers);
  });
  it("exports a valid-looking SVG", () => {
    const svg = ribbonToSvg(DEFAULT_RIBBON, generateRibbon(DEFAULT_RIBBON));
    expect(svg.startsWith("<svg")).toBe(true);
    expect(svg).toContain("<circle");
    expect(svg.trim().endsWith("</svg>")).toBe(true);
  });
  it("never lets a dot outgrow its room: dots stay separate below 100% fill", () => {
    const s = {
      ...DEFAULT_RIBBON,
      perspective: 0,
      ripple: 0,
      curl: 0,
      edgeSoftness: 0,
      dotSize: 40,
      fill: 0.8,
      columns: 100,
      rows: 10,
      markers: [
        { id: "a", x: 0, y: 0.5, width: 0.4, twist: 0 },
        { id: "b", x: 1, y: 0.5, width: 0.4, twist: 0 },
      ],
    };
    const dots = generateRibbon(s);
    const along = (s.width * 1.08) / s.columns;
    for (const d of dots) expect(d.size).toBeLessThanOrEqual(0.8 * along + 1e-6);
  });
  it("spaces dots evenly along a steep path", () => {
    const s = {
      ...DEFAULT_RIBBON,
      perspective: 0,
      ripple: 0,
      curl: 0,
      rows: 1,
      columns: 60,
      markers: [
        { id: "a", x: 0, y: 0.9, width: 0.2, twist: 0 },
        { id: "b", x: 0.5, y: 0.1, width: 0.2, twist: 0 },
        { id: "c", x: 1, y: 0.9, width: 0.2, twist: 0 },
      ],
    };
    const dots = generateRibbon(s).sort((p, q) => p.x - q.x);
    const gaps = dots.slice(1).map((d, i) => Math.hypot(d.x - dots[i]!.x, d.y - dots[i]!.y));
    expect(Math.max(...gaps) / Math.min(...gaps)).toBeLessThan(1.1);
  });
  it("paints far to near", () => {
    const dots = generateRibbon(DEFAULT_RIBBON);
    for (let i = 1; i < dots.length; i++) {
      expect(dots[i]!.depth).toBeLessThanOrEqual(dots[i - 1]!.depth + 1 / 16);
    }
  });
  it("gap fill closes the fan where a fast twist spreads columns apart", () => {
    const s = {
      ...DEFAULT_RIBBON,
      ripple: 0,
      columns: 120,
      rows: 30,
      markers: [
        { id: "a", x: 0, y: 0.5, width: 0.8, twist: 15 },
        { id: "b", x: 0.1, y: 0.5, width: 0.8, twist: 176 },
        { id: "c", x: 1, y: 0.5, width: 0.8, twist: 170 },
      ],
    };
    const off = generateRibbon({ ...s, gapFill: 0 });
    const on = generateRibbon({ ...s, gapFill: 1 });
    expect(on.length).toBeGreaterThan(off.length);
    // Added dots fill gaps, so they're small: average size goes down, never up.
    const avg = (d: typeof on) => d.reduce((a, x) => a + x.size, 0) / d.length;
    expect(avg(on)).toBeLessThanOrEqual(avg(off));
  });
  it("finds sharp twists and smoothing makes them gentle", () => {
    const a = { id: "a", x: 0, y: 0.5, width: 0.3, twist: 15 };
    const b = { id: "b", x: 0.095, y: 0.5, width: 0.3, twist: 176 };
    const c = { id: "c", x: 0.6, y: 0.5, width: 0.3, twist: 150 };
    expect(sharpTwists([c, b, a]).map((p) => p.a.id + p.b.id)).toEqual(["ab"]);
    const next = smoothTwist(a, b);
    expect(sharpTwists([{ ...a, twist: next.a }, { ...b, twist: next.b }, c])).toEqual([]);
    expect((next.a + next.b) / 2).toBeCloseTo((15 + 176) / 2);
  });
  it("untwist removes the half-turn and leaves the rest of the ribbon exactly as it was", () => {
    const s = {
      ...DEFAULT_RIBBON,
      gapFill: 0,
      markers: [
        { id: "a", x: 0, y: 0.4, width: 0.3, twist: 15 },
        { id: "b", x: 0.1, y: 0.4, width: 0.48, twist: 176 },
        { id: "c", x: 0.3, y: 0.45, width: 0.35, twist: 122 },
        { id: "d", x: 0.5, y: 0.6, width: 0.6, twist: 31 },
        { id: "e", x: 1, y: 0.45, width: 0.75, twist: -55 },
      ],
    };
    const markers = untwist(s.markers, "a", "b")!;
    expect(markers.find((m) => m.id === "b")!.twist).toBe(-4);
    expect(sharpTwists(markers).some((p) => p.a.id === "a")).toBe(false);
    // Everything right of marker b is the same set of dots.
    const key = (d: { x: number; y: number; size: number }) =>
      `${d.x.toFixed(2)},${d.y.toFixed(2)},${d.size.toFixed(2)}`;
    const right = (dots: ReturnType<typeof generateRibbon>) =>
      dots
        .filter((d) => d.x > 0.12 * s.width)
        .map(key)
        .sort();
    expect(right(generateRibbon({ ...s, markers }))).toEqual(right(generateRibbon(s)));
  });
});
