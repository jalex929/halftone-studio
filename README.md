# Halftone Studio

Make halftone dot art in the browser without learning Illustrator's halftone workflow. Drag
markers on the canvas to shape a 3D ribbon of dots: where it rises and dips, how wide it is,
and how far it twists. Then export real vector SVG or PNG. Free, no sign-up, and everything
stays in your browser.

## Controls

- **Markers:** drag to move, double-click the canvas to add one, Delete to remove. Each one sets
  height, width and twist (0° faces you, ±90° is edge-on).
- **Dots:** size, max fill (the biggest a dot can get next to its neighbors, so it stays a dot),
  how many dots along and across, shape.
- **Depth:** perspective, depth fade, curl (the scalloped arcs), soft edges, ripple.
- **Save and reopen:** named saves in the browser, or a settings file. Exported SVG and PNG files
  carry their settings too, so Open accepts them and the design comes back editable.
- **How it works:** a live tour that highlights each control and animates your own ribbon, then
  puts your design back.
- **Color, artboard, export:** near and far dot color, background or transparent, size presets,
  SVG / PNG / PNG 2x. Undo and redo with Ctrl+Z and Ctrl+Y.

## Run it

```bash
npm install
npm run dev     # http://localhost:5173
npm run check   # typecheck, lint, format check, unit tests, build
```

## What's tested

Unit tests cover the ribbon engine: every preset generates quickly, a raised marker is exactly
the peak (no overshoot), edge-on twist collapses to a line, dots never outgrow their room below
100% fill, dots stay evenly spaced along steep paths, junk input is sanitized, SVG output is
well-formed, settings round-trip through SVG metadata and PNG text chunks. The UI itself is checked by hand so far; there are no browser tests yet.

## License

MIT
