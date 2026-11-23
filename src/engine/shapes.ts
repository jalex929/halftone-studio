export type Shape = "circle" | "square" | "diamond" | "line" | "triangle" | "hexagon" | "cross";

export const SHAPES: { id: Shape; label: string }[] = [
  { id: "circle", label: "Circle" },
  { id: "square", label: "Square" },
  { id: "diamond", label: "Diamond" },
  { id: "line", label: "Line" },
  { id: "triangle", label: "Triangle" },
  { id: "hexagon", label: "Hexagon" },
  { id: "cross", label: "Cross" },
];

/** Unit outline of a shape, roughly fitting a box from -0.5 to 0.5. Circles are drawn natively. */
function unitPoints(shape: Exclude<Shape, "circle" | "line">): [number, number][] {
  switch (shape) {
    case "square":
      return [
        [-0.5, -0.5],
        [0.5, -0.5],
        [0.5, 0.5],
        [-0.5, 0.5],
      ];
    case "diamond":
      return [
        [0, -0.62],
        [0.62, 0],
        [0, 0.62],
        [-0.62, 0],
      ];
    case "triangle":
      return [
        [0, -0.58],
        [0.58, 0.42],
        [-0.58, 0.42],
      ];
    case "hexagon":
      return Array.from({ length: 6 }, (_, k) => {
        const a = (Math.PI / 3) * k + Math.PI / 6;
        return [0.55 * Math.cos(a), 0.55 * Math.sin(a)] as [number, number];
      });
    case "cross": {
      const a = 0.5;
      const b = 0.17;
      return [
        [-b, -a],
        [b, -a],
        [b, -b],
        [a, -b],
        [a, b],
        [b, b],
        [b, a],
        [-b, a],
        [-b, b],
        [-a, b],
        [-a, -b],
        [-b, -b],
      ];
    }
  }
}

/**
 * Corner points for a dot (every shape except circles), in artboard pixels.
 * `length` is only used by lines: how far each segment runs along the grid.
 */
export function shapePolygon(
  shape: Exclude<Shape, "circle">,
  cx: number,
  cy: number,
  size: number,
  rotationDeg: number,
  length = size,
): [number, number][] {
  const pts: [number, number][] =
    shape === "line"
      ? [
          [-length / 2, -size / 2],
          [length / 2, -size / 2],
          [length / 2, size / 2],
          [-length / 2, size / 2],
        ]
      : unitPoints(shape).map(([x, y]) => [x * size, y * size]);
  const r = (rotationDeg * Math.PI) / 180;
  const c = Math.cos(r);
  const s = Math.sin(r);
  return pts.map(([x, y]) => [cx + x * c - y * s, cy + x * s + y * c]);
}
