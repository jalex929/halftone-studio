/* global localStorage */
// Records the onboarding GIFs from the real app.
// Usage: start the app (npm run dev -- --port 5191), then:
//   node scripts/record-tutorial.mjs [http://localhost:5191/]
// Writes public/tutorial/<step>.gif plus a still <step>.png for reduced-motion viewers.
import { chromium } from "@playwright/test";
import gifenc from "gifenc";
import { PNG } from "pngjs";
import { mkdirSync, writeFileSync } from "node:fs";

const { GIFEncoder, quantize, applyPalette } = gifenc;
const URL = process.argv[2] ?? "http://localhost:5191/";
const OUT = "public/tutorial";
const VIEW = { width: 1280, height: 720 };
const GIF_W = 640;
const GIF_H = 360;
const FRAME_MS = 70;

mkdirSync(OUT, { recursive: true });

/** Box-filter downscale of RGBA pixels. */
function downscale(src, sw, sh, dw, dh) {
  const out = new Uint8Array(dw * dh * 4);
  const fx = sw / dw;
  const fy = sh / dh;
  for (let y = 0; y < dh; y++) {
    const y0 = Math.floor(y * fy);
    const y1 = Math.max(y0 + 1, Math.floor((y + 1) * fy));
    for (let x = 0; x < dw; x++) {
      const x0 = Math.floor(x * fx);
      const x1 = Math.max(x0 + 1, Math.floor((x + 1) * fx));
      let r = 0,
        g = 0,
        b = 0,
        n = 0;
      for (let yy = y0; yy < y1; yy++) {
        for (let xx = x0; xx < x1; xx++) {
          const k = (yy * sw + xx) * 4;
          r += src[k];
          g += src[k + 1];
          b += src[k + 2];
          n++;
        }
      }
      const o = (y * dw + x) * 4;
      out[o] = r / n;
      out[o + 1] = g / n;
      out[o + 2] = b / n;
      out[o + 3] = 255;
    }
  }
  return out;
}

class Recorder {
  constructor(page, name) {
    this.page = page;
    this.name = name;
    this.frames = [];
  }
  async frame(hold = 1) {
    const png = PNG.sync.read(await this.page.screenshot());
    const small = downscale(png.data, png.width, png.height, GIF_W, GIF_H);
    for (let i = 0; i < hold; i++) this.frames.push(small);
  }
  save() {
    const gif = GIFEncoder();
    for (const f of this.frames) {
      const palette = quantize(f, 48);
      gif.writeFrame(applyPalette(f, palette), GIF_W, GIF_H, { palette, delay: FRAME_MS });
    }
    gif.finish();
    writeFileSync(`${OUT}/${this.name}.gif`, gif.bytes());
    // Still image: the frame two thirds in, which shows the step's result.
    const still = this.frames[Math.floor(this.frames.length * 0.66)];
    const png = new PNG({ width: GIF_W, height: GIF_H });
    png.data = Buffer.from(still);
    writeFileSync(`${OUT}/${this.name}.png`, PNG.sync.write(png));
    console.log(`${this.name}: ${this.frames.length} frames`);
  }
}

// A visible pointer, since headless screenshots don't draw the real one.
const CURSOR = `
  const c = document.createElement('div');
  c.id = 'rec-cursor';
  c.style.cssText = 'position:fixed;z-index:99999;pointer-events:none;width:22px;height:22px;' +
    'border-radius:50%;border:3px solid #fff;background:rgba(255,90,54,.55);' +
    'box-shadow:0 0 0 2px rgba(0,0,0,.5);transform:translate(-50%,-50%);left:-40px;top:-40px;transition:transform .08s';
  addEventListener('DOMContentLoaded', () => document.body.appendChild(c));
  addEventListener('pointermove', e => { c.style.left = e.clientX + 'px'; c.style.top = e.clientY + 'px'; }, true);
  addEventListener('pointerdown', () => c.style.transform = 'translate(-50%,-50%) scale(.75)', true);
  addEventListener('pointerup', () => c.style.transform = 'translate(-50%,-50%)', true);
`;

async function moveSmooth(page, rec, from, to, steps) {
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const e = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
    await page.mouse.move(from.x + (to.x - from.x) * e, from.y + (to.y - from.y) * e);
    await rec.frame();
  }
}

/** Sets a range slider by its label, the way a user dragging it would, recording each step. */
async function slide(page, rec, label, from, to, steps) {
  const input = page.getByLabel(label, { exact: true });
  const box = await input.boundingBox();
  const min = Number(await input.getAttribute("min"));
  const max = Number(await input.getAttribute("max"));
  const xFor = (v) => box.x + ((v - min) / (max - min)) * box.width;
  const y = box.y + box.height / 2;
  await page.mouse.move(xFor(from), y);
  await page.mouse.down();
  await moveSmooth(page, rec, { x: xFor(from), y }, { x: xFor(to), y }, steps);
  await page.mouse.up();
}

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: VIEW, acceptDownloads: true });
await context.addInitScript(() => {
  localStorage.setItem("halftone-studio:tutorial-seen", "1");
  localStorage.removeItem("halftone-studio:ribbon");
});
await context.addInitScript(CURSOR);
const page = await context.newPage();
await page.goto(URL);
await page.waitForSelector(".marker");
await page.getByRole("button", { name: "Hero twist" }).click();
await page.mouse.move(640, 600);

// 1. Drag a marker up and down, then double-click to add one.
{
  const rec = new Recorder(page, "1-markers");
  await rec.frame(8);
  const box = await page.locator(".marker .marker-dot").nth(1).boundingBox();
  const start = { x: box.x + box.width / 2, y: box.y + box.height / 2 };
  await moveSmooth(page, rec, { x: 640, y: 600 }, start, 8);
  await page.mouse.down();
  const up = { x: start.x, y: start.y - 170 };
  const down = { x: start.x + 20, y: start.y + 110 };
  await moveSmooth(page, rec, start, up, 16);
  await rec.frame(5);
  await moveSmooth(page, rec, up, down, 18);
  await rec.frame(5);
  await page.mouse.up();
  const addAt = { x: start.x - 160, y: start.y - 60 };
  await moveSmooth(page, rec, down, addAt, 10);
  await page.mouse.dblclick(addAt.x, addAt.y);
  await rec.frame(14);
  rec.save();
}

// 2. Width and twist on the selected marker.
{
  await page.getByRole("button", { name: "Hero twist" }).click();
  const rec = new Recorder(page, "2-twist");
  await page
    .getByRole("group", { name: "Pick a marker" })
    .getByRole("button", { name: "2" })
    .click();
  await rec.frame(8);
  await slide(page, rec, "Twist", 80, -10, 20);
  await rec.frame(5);
  await slide(page, rec, "Width", 0.24, 0.7, 16);
  await rec.frame(5);
  await slide(page, rec, "Twist", -10, 88, 18);
  await rec.frame(12);
  rec.save();
}

// 3. Dots and depth.
{
  await page.getByRole("button", { name: "Hero twist" }).click();
  const rec = new Recorder(page, "3-dots");
  await page.getByRole("tab", { name: "Dots" }).click();
  await rec.frame(8);
  await slide(page, rec, "Dot size", 5, 11, 16);
  await rec.frame(4);
  await slide(page, rec, "Along", 190, 320, 14);
  await rec.frame(4);
  await page.getByRole("tab", { name: "Depth" }).click();
  await rec.frame(6);
  await slide(page, rec, "Curl", 0.5, -0.8, 18);
  await rec.frame(4);
  await slide(page, rec, "Perspective", 0.55, 0.95, 14);
  await rec.frame(12);
  rec.save();
}

// 4. Export, then reopen the exported file.
{
  const rec = new Recorder(page, "4-file");
  await page.getByRole("tab", { name: "File" }).click();
  await rec.frame(8);
  const svgBtn = page.getByRole("button", { name: "Download SVG" });
  const b = await svgBtn.boundingBox();
  await moveSmooth(
    page,
    rec,
    { x: 900, y: 600 },
    { x: b.x + b.width / 2, y: b.y + b.height / 2 },
    10,
  );
  const [dl] = await Promise.all([page.waitForEvent("download"), svgBtn.click()]);
  const path = `${OUT}/.tmp-export.svg`;
  await dl.saveAs(path);
  await rec.frame(10);
  // Change something, then reopen the export to show the design comes back.
  await page.getByRole("button", { name: "Single peak" }).click();
  await rec.frame(10);
  const open = page.getByRole("button", { name: "Open file" });
  const ob = await open.boundingBox();
  await moveSmooth(
    page,
    rec,
    { x: 640, y: 650 },
    { x: ob.x + ob.width / 2, y: ob.y + ob.height / 2 },
    10,
  );
  await page.locator('input[type="file"]').setInputFiles(path);
  await rec.frame(18);
  rec.save();
  const { rmSync } = await import("node:fs");
  rmSync(path);
}

await browser.close();
