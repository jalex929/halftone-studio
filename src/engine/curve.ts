/**
 * Smooth curve through points (sorted by x) that never overshoots: a marker set higher than its
 * neighbors is exactly the peak, which is what you expect when you drag one.
 * (Monotone cubic interpolation, Fritsch-Carlson.) Outside the first/last x it holds flat.
 */
export function monotoneCurve(xs: number[], ys: number[]): (x: number) => number {
  const n = xs.length;
  if (n === 0) return () => 0;
  if (n === 1) {
    const only = ys[0] ?? 0;
    return () => only;
  }
  const at = (a: number[], i: number) => a[i] ?? 0;
  const d: number[] = [];
  for (let i = 0; i < n - 1; i++) {
    const dx = at(xs, i + 1) - at(xs, i) || 1e-9;
    d.push((at(ys, i + 1) - at(ys, i)) / dx);
  }
  const m: number[] = new Array(n).fill(0);
  for (let i = 1; i < n - 1; i++) {
    const a = at(d, i - 1);
    const b = at(d, i);
    m[i] = a * b <= 0 ? 0 : (2 * a * b) / (a + b);
  }
  // Ends stay flat so the ribbon leaves the artboard calmly.
  return (x: number) => {
    if (x <= at(xs, 0)) return at(ys, 0);
    if (x >= at(xs, n - 1)) return at(ys, n - 1);
    let i = 0;
    while (i < n - 2 && x > at(xs, i + 1)) i++;
    const x0 = at(xs, i);
    const h = at(xs, i + 1) - x0 || 1e-9;
    const t = (x - x0) / h;
    const t2 = t * t;
    const t3 = t2 * t;
    return (
      (2 * t3 - 3 * t2 + 1) * at(ys, i) +
      (t3 - 2 * t2 + t) * h * at(m, i) +
      (-2 * t3 + 3 * t2) * at(ys, i + 1) +
      (t3 - t2) * h * at(m, i + 1)
    );
  };
}
