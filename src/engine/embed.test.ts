import {
  addPngText,
  readPngText,
  readSettingsFromFile,
  readSvgSettings,
  svgMetadata,
} from "./embed";
import { DEFAULT_RIBBON, generateRibbon } from "./ribbon";
import { ribbonToSvg } from "./ribbonRender";

// Smallest valid PNG: 1x1 transparent pixel.
const TINY_PNG = Uint8Array.from(
  atob(
    "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==",
  ),
  (c) => c.charCodeAt(0),
);

describe("settings embedded in exports", () => {
  const json = JSON.stringify(DEFAULT_RIBBON);

  it("round-trips through SVG metadata, including characters XML cares about", () => {
    const tricky = JSON.stringify({ note: "a < b & c > d" });
    expect(readSvgSettings(`<svg>${svgMetadata(tricky)}</svg>`)).toBe(tricky);
  });

  it("an exported SVG reopens with its settings", () => {
    const svg = ribbonToSvg(DEFAULT_RIBBON, generateRibbon(DEFAULT_RIBBON));
    const back = readSettingsFromFile("x.svg", new TextEncoder().encode(svg));
    expect(JSON.parse(back ?? "{}")).toEqual(DEFAULT_RIBBON);
  });

  it("round-trips through a PNG tEXt chunk and keeps the PNG valid", () => {
    const out = addPngText(TINY_PNG, json);
    expect(out.length).toBeGreaterThan(TINY_PNG.length);
    expect(readPngText(out)).toBe(json);
    expect(readSettingsFromFile("x.png", out)).toBe(json);
    // Still ends with the IEND chunk.
    expect(new TextDecoder("latin1").decode(out.subarray(out.length - 8, out.length - 4))).toBe(
      "IEND",
    );
  });

  it("returns null for a PNG without settings", () => {
    expect(readPngText(TINY_PNG)).toBeNull();
  });
});
