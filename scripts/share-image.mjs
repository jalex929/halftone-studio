// Builds public/og-image.png (1200x630) from docs/share/card.html, with the ribbon rendered by
// the app's own engine so the image always shows real output.
// Usage: start the dev server (npx vite --port 5191), then
//   node scripts/share-image.mjs [http://localhost:5191/]
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const APP = process.argv[2] ?? "http://localhost:5191/";

// The share ribbon: rises from the lower left, twists through the middle, opens up on the right.
// Rendered at 2x (2400x1260) for a sharp downscale.
const RIBBON = {
  width: 2400,
  height: 1260,
  markers: [
    { id: "a", x: 0.2, y: 0.86, width: 0.18, twist: 20 },
    { id: "b", x: 0.42, y: 0.74, width: 0.3, twist: 75 },
    { id: "c", x: 0.6, y: 0.5, width: 0.55, twist: 25 },
    { id: "d", x: 0.8, y: 0.62, width: 0.5, twist: -35 },
    { id: "e", x: 1, y: 0.32, width: 0.85, twist: -70 },
  ],
  columns: 340,
  rows: 56,
  dotSize: 9,
  perspective: 0.7,
  depthFade: 0.3,
  edgeSoftness: 0.9,
  ripple: 0.35,
  rippleCount: 6,
  curl: 0.6,
  fill: 0.9,
  gapFill: 0.7,
  shape: "circle",
  ink: "#ffffff",
  inkFar: "#7d8592",
  background: "#0f1013",
  transparent: true,
};

const browser = await chromium.launch({
  args: ["--use-angle=d3d11", "--enable-gpu", "--ignore-gpu-blocklist"],
});
const app = await browser.newPage();
await app.goto(APP);
const art = await app.evaluate(async (s) => {
  const R = await import("/src/engine/ribbon.ts");
  const G = await import("/src/engine/glRender.ts");
  const settings = R.sanitizeRibbon(s);
  const canvas = Object.assign(document.createElement("canvas"), {
    width: settings.width,
    height: settings.height,
  });
  const gl = G.GLRibbon.create(canvas, true);
  if (!gl) throw new Error("WebGL2 unavailable");
  gl.draw(settings, R.generateRibbon(settings), 1);
  return canvas.toDataURL("image/png");
}, RIBBON);

const card = await browser.newPage({ viewport: { width: 1200, height: 630 } });
await card.goto(pathToFileURL(resolve("docs/share/card.html")).href);
await card.evaluate(async (src) => {
  const img = document.getElementById("art");
  img.src = src;
  await img.decode();
  await document.fonts.ready;
}, art);
await card.screenshot({ path: "public/og-image.png" });
console.log("wrote public/og-image.png");
await browser.close();
