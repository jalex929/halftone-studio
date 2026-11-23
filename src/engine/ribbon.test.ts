import { DEFAULT_RIBBON, RIBBON_PRESETS, generateRibbon, sanitizeRibbon } from "./ribbon";
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
});
