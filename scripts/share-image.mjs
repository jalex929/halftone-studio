/* global document */
// Builds public/og-image.png (1200x630) from docs/share/card.html, with the ribbon rendered by
// the app's own engine so the image always shows real output.
// Usage: start the dev server (npx vite --port 5191), then
//   node scripts/share-image.mjs [http://localhost:5191/]
import { chromium } from "@playwright/test";
import { pathToFileURL } from "node:url";
import { resolve } from "node:path";

const APP = process.argv[2] ?? "http://localhost:5191/";

// The share ribbon is Jay's first design (designs/2026-11-22-first-ribbon.json, later tweaks),
// squeezed into the right part of the card so its twisty end sits just past the text.
// Rendered at 2x (2400x1260) for a sharp downscale.
const START = 0.4; // where the ribbon begins, as a share of card width
const SPAN = 1 - START;
const JAY = [
  { x: 0, y: 0.395, width: 0.3, twist: 15 },
  { x: 0.095, y: 0.4, width: 0.48, twist: 176 },
  { x: 0.31, y: 0.455, width: 0.35, twist: 122 },
  { x: 0.475, y: 0.596, width: 0.629, twist: 31.6 },
  { x: 0.735, y: 0.62, width: 0.15, twist: -180 },
  { x: 1, y: 0.45, width: 0.75, twist: -55 },
];
const RIBBON = {
  width: 2400,
  height: 1260,
  markers: JAY.map((m, i) => ({ ...m, id: `m${i}`, x: START + SPAN * m.x })),
  columns: 500,
  rows: 64,
  dotSize: 9,
  perspective: 0.79,
  depthFade: 0.35,
  edgeSoftness: 0.94,
  ripple: 0.47,
  rippleCount: 6.5 / SPAN, // same wave rhythm in the narrower space
  curl: 0.77,
  fill: 0.91,
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
