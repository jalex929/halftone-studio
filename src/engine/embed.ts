/**
 * Design settings travel inside the exported files, so an exported SVG or PNG can be opened
 * again and edited. SVG: a <metadata> element. PNG: a standard tEXt chunk (ignored by viewers).
 */

export const EMBED_KEY = "halftone-studio";

// ---- SVG ----

const escapeXml = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const unescapeXml = (s: string) =>
  s.replace(/&lt;/g, "<").replace(/&gt;/g, ">").replace(/&amp;/g, "&");

export function svgMetadata(settingsJson: string): string {
  return `<metadata id="${EMBED_KEY}">${escapeXml(settingsJson)}</metadata>`;
}

export function readSvgSettings(svg: string): string | null {
  const m = svg.match(new RegExp(`<metadata id="${EMBED_KEY}">([\\s\\S]*?)</metadata>`));
  return m?.[1] ? unescapeXml(m[1]) : null;
}

// ---- PNG ----

const PNG_SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10];

let crcTable: Uint32Array | null = null;
function crc32(bytes: Uint8Array): number {
  if (!crcTable) {
    crcTable = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      crcTable[n] = c >>> 0;
    }
  }
  let c = 0xffffffff;
  for (const b of bytes) c = (crcTable[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const isPng = (b: Uint8Array) => PNG_SIGNATURE.every((v, i) => b[i] === v);

/** Inserts a tEXt chunk right after IHDR. Text is stored as Latin-1, so the JSON is URI-encoded. */
export function addPngText(png: Uint8Array, value: string): Uint8Array {
  if (!isPng(png)) return png;
  const keyword = new TextEncoder().encode(EMBED_KEY);
  const text = new TextEncoder().encode(encodeURIComponent(value));
  const data = new Uint8Array(keyword.length + 1 + text.length);
  data.set(keyword, 0);
  data.set(text, keyword.length + 1);
  const type = new TextEncoder().encode("tEXt");
  const chunk = new Uint8Array(12 + data.length);
  const view = new DataView(chunk.buffer);
  view.setUint32(0, data.length);
  chunk.set(type, 4);
  chunk.set(data, 8);
  const crcInput = new Uint8Array(4 + data.length);
  crcInput.set(type, 0);
  crcInput.set(data, 4);
  view.setUint32(8 + data.length, crc32(crcInput));
  // IHDR is always first: 8 signature + 4 length + 4 type + 13 data + 4 crc = 33 bytes.
  const at = 33;
  const out = new Uint8Array(png.length + chunk.length);
  out.set(png.subarray(0, at), 0);
  out.set(chunk, at);
  out.set(png.subarray(at), at + chunk.length);
  return out;
}

export function readPngText(png: Uint8Array): string | null {
  if (!isPng(png)) return null;
  const view = new DataView(png.buffer, png.byteOffset, png.byteLength);
  let p = 8;
  const dec = new TextDecoder("latin1");
  while (p + 8 <= png.length) {
    const len = view.getUint32(p);
    const type = dec.decode(png.subarray(p + 4, p + 8));
    if (type === "tEXt") {
      const data = png.subarray(p + 8, p + 8 + len);
      const zero = data.indexOf(0);
      if (zero > 0 && dec.decode(data.subarray(0, zero)) === EMBED_KEY) {
        try {
          return decodeURIComponent(dec.decode(data.subarray(zero + 1)));
        } catch {
          return null;
        }
      }
    }
    if (type === "IEND") break;
    p += 12 + len;
  }
  return null;
}

/** Settings JSON from any file this app exports (.svg, .png) or saves (.json). */
export function readSettingsFromFile(name: string, bytes: Uint8Array): string | null {
  if (isPng(bytes)) return readPngText(bytes);
  const text = new TextDecoder().decode(bytes);
  if (/\.svg$/i.test(name) || text.trimStart().startsWith("<")) return readSvgSettings(text);
  return text;
}
