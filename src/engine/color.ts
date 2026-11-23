const HEX = /^#[0-9a-f]{6}$/i;

export function isHex(v: unknown): v is string {
  return typeof v === "string" && HEX.test(v);
}

function parse(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

const toHex = (r: number, g: number, b: number) =>
  "#" + [r, g, b].map((v) => Math.round(v).toString(16).padStart(2, "0")).join("");

/** Mix two colors; `t` snaps to `steps` levels so SVG output can group dots by color. */
export function mix(a: string, b: string, t: number, steps = 24): string {
  const q = Math.round(Math.max(0, Math.min(1, t)) * steps) / steps;
  const [r1, g1, b1] = parse(a);
  const [r2, g2, b2] = parse(b);
  return toHex(r1 + (r2 - r1) * q, g1 + (g2 - g1) * q, b1 + (b2 - b1) * q);
}
