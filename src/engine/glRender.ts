import type { RibbonDot, RibbonSettings } from "./ribbon";
import type { Shape } from "./shapes";

/**
 * GPU renderer for the preview (and PNG export when the size fits): every dot is one instanced
 * quad, and its shape is cut per pixel from the same geometry the SVG export uses, with a
 * one-pixel anti-aliased edge. Tens of thousands of dots draw in a few milliseconds.
 */

const VERT = `#version 300 es
in vec2 a_corner;
in vec3 a_dot;     // x, y, size (artboard px)
in vec4 a_color;   // straight rgba
uniform vec2 u_artboard;
uniform float u_scale;  // artboard px -> canvas px
out vec2 v_local;       // position in "unit dot" space: the shape spans about -0.5..0.5
out vec4 v_color;
out float v_pxPerUnit;
const float EXTENT = 0.7; // half-size of the quad in unit space; fits every shape plus AA
void main() {
  float size = a_dot.z;
  // Pad by ~1 canvas pixel so the anti-aliased edge never gets clipped.
  float pad = 1.0 / max(size * u_scale, 0.0001);
  vec2 local = a_corner * (EXTENT + pad);
  vec2 p = a_dot.xy + local * size;
  vec2 clip = (p / u_artboard) * 2.0 - 1.0;
  gl_Position = vec4(clip.x, -clip.y, 0.0, 1.0);
  v_local = local;
  v_color = a_color;
  v_pxPerUnit = size * u_scale;
}`;

const FRAG = `#version 300 es
precision highp float;
in vec2 v_local;
in vec4 v_color;
in float v_pxPerUnit;
uniform int u_mode;          // 0 circle, 1 convex polygon, 2 cross
uniform vec3 u_edges[6];     // polygon edges: normal.xy, offset
uniform int u_edgeCount;
out vec4 outColor;
float sdBox(vec2 p, vec2 b) {
  vec2 d = abs(p) - b;
  return length(max(d, 0.0)) + min(max(d.x, d.y), 0.0);
}
void main() {
  vec2 p = v_local;
  float d;
  if (u_mode == 0) {
    d = length(p) - 0.5;
  } else if (u_mode == 2) {
    d = min(sdBox(p, vec2(0.5, 0.17)), sdBox(p, vec2(0.17, 0.5)));
  } else {
    d = -1e9;
    for (int i = 0; i < 6; i++) {
      if (i >= u_edgeCount) break;
      d = max(d, dot(p, u_edges[i].xy) - u_edges[i].z);
    }
  }
  float alpha = clamp(0.5 - d * v_pxPerUnit, 0.0, 1.0) * v_color.a;
  if (alpha <= 0.0) discard;
  outColor = vec4(v_color.rgb * alpha, alpha); // premultiplied
}`;

/** Edge planes of a convex polygon (same unit outlines as shapes.ts), as [nx, ny, offset]. */
function edgesFor(points: [number, number][]): number[] {
  const out: number[] = [];
  for (let i = 0; i < points.length; i++) {
    const [x1, y1] = points[i]!;
    const [x2, y2] = points[(i + 1) % points.length]!;
    // Outward normal for a clockwise (screen-space, y down) outline.
    let nx = y2 - y1;
    let ny = -(x2 - x1);
    const len = Math.hypot(nx, ny) || 1;
    nx /= len;
    ny /= len;
    let off = nx * x1 + ny * y1;
    if (off < 0) {
      nx = -nx;
      ny = -ny;
      off = -off;
    }
    out.push(nx, ny, off);
  }
  return out;
}

const hexPoints = Array.from({ length: 6 }, (_, k) => {
  const a = (Math.PI / 3) * k + Math.PI / 6;
  return [0.55 * Math.cos(a), 0.55 * Math.sin(a)] as [number, number];
});

const POLYGONS: Partial<Record<Shape, number[]>> = {
  square: edgesFor([
    [-0.5, -0.5],
    [0.5, -0.5],
    [0.5, 0.5],
    [-0.5, 0.5],
  ]),
  diamond: edgesFor([
    [0, -0.62],
    [0.62, 0],
    [0, 0.62],
    [-0.62, 0],
  ]),
  triangle: edgesFor([
    [0, -0.58],
    [0.58, 0.42],
    [-0.58, 0.42],
  ]),
  hexagon: edgesFor(hexPoints),
};

const colorCache = new Map<string, [number, number, number]>();
function rgb(hex: string): [number, number, number] {
  let c = colorCache.get(hex);
  if (!c) {
    // Dragging a color picker makes a new set of colors every frame; don't keep them all.
    if (colorCache.size > 512) colorCache.clear();
    const n = parseInt(hex.slice(1), 16);
    c = [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    colorCache.set(hex, c);
  }
  return c;
}

const FLOATS = 7;

export class GLRibbon {
  private gl: WebGL2RenderingContext;
  private program: WebGLProgram;
  private vao: WebGLVertexArrayObject;
  private instances: WebGLBuffer;
  private data = new Float32Array(0);
  private u: Record<string, WebGLUniformLocation | null>;

  /** Returns null when WebGL2 isn't available, so the caller can fall back to 2D canvas. */
  static create(canvas: HTMLCanvasElement | OffscreenCanvas, preserve = false): GLRibbon | null {
    try {
      const gl = canvas.getContext("webgl2", {
        premultipliedAlpha: true,
        antialias: false,
        preserveDrawingBuffer: preserve,
      }) as WebGL2RenderingContext | null;
      return gl ? new GLRibbon(gl) : null;
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const compile = (type: number, src: string) => {
      const sh = gl.createShader(type)!;
      gl.shaderSource(sh, src);
      gl.compileShader(sh);
      if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(sh) ?? "shader");
      return sh;
    };
    const prog = gl.createProgram()!;
    gl.attachShader(prog, compile(gl.VERTEX_SHADER, VERT));
    gl.attachShader(prog, compile(gl.FRAGMENT_SHADER, FRAG));
    gl.linkProgram(prog);
    if (!gl.getProgramParameter(prog, gl.LINK_STATUS))
      throw new Error(gl.getProgramInfoLog(prog) ?? "link");
    this.program = prog;
    this.u = Object.fromEntries(
      ["u_artboard", "u_scale", "u_mode", "u_edges", "u_edgeCount"].map((n) => [
        n,
        gl.getUniformLocation(prog, n),
      ]),
    );

    this.vao = gl.createVertexArray()!;
    gl.bindVertexArray(this.vao);
    const quad = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, quad);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    const aCorner = gl.getAttribLocation(prog, "a_corner");
    gl.enableVertexAttribArray(aCorner);
    gl.vertexAttribPointer(aCorner, 2, gl.FLOAT, false, 0, 0);

    this.instances = gl.createBuffer()!;
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    const stride = FLOATS * 4;
    const aDot = gl.getAttribLocation(prog, "a_dot");
    gl.enableVertexAttribArray(aDot);
    gl.vertexAttribPointer(aDot, 3, gl.FLOAT, false, stride, 0);
    gl.vertexAttribDivisor(aDot, 1);
    const aColor = gl.getAttribLocation(prog, "a_color");
    gl.enableVertexAttribArray(aColor);
    gl.vertexAttribPointer(aColor, 4, gl.FLOAT, false, stride, 12);
    gl.vertexAttribDivisor(aColor, 1);
    gl.bindVertexArray(null);
  }

  /** Largest canvas side this GPU can render in one go. */
  maxSize(): number {
    const gl = this.gl;
    const dims = gl.getParameter(gl.MAX_VIEWPORT_DIMS) as Int32Array;
    return Math.min(
      gl.getParameter(gl.MAX_RENDERBUFFER_SIZE) as number,
      dims[0] ?? 0,
      dims[1] ?? 0,
    );
  }

  draw(s: RibbonSettings, dots: RibbonDot[], scale: number): void {
    const gl = this.gl;
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    gl.viewport(0, 0, w, h);
    if (s.transparent) gl.clearColor(0, 0, 0, 0);
    else {
      const [r, g, b] = rgb(s.background);
      gl.clearColor(r, g, b, 1);
    }
    gl.clear(gl.COLOR_BUFFER_BIT);

    const n = dots.length;
    if (this.data.length < n * FLOATS) this.data = new Float32Array(Math.ceil(n * 1.25) * FLOATS);
    const d = this.data;
    for (let i = 0; i < n; i++) {
      const dot = dots[i]!;
      const [r, g, b] = rgb(dot.color);
      const o = i * FLOATS;
      d[o] = dot.x;
      d[o + 1] = dot.y;
      d[o + 2] = dot.size;
      d[o + 3] = r;
      d[o + 4] = g;
      d[o + 5] = b;
      d[o + 6] = dot.opacity;
    }

    gl.useProgram(this.program);
    gl.uniform2f(this.u.u_artboard!, s.width, s.height);
    gl.uniform1f(this.u.u_scale!, scale);
    const poly = POLYGONS[s.shape] ?? POLYGONS.square;
    gl.uniform1i(this.u.u_mode!, s.shape === "circle" ? 0 : s.shape === "cross" ? 2 : 1);
    if (poly) {
      const edges = new Float32Array(18);
      edges.set(poly);
      gl.uniform3fv(this.u.u_edges!, edges);
      gl.uniform1i(this.u.u_edgeCount!, poly.length / 3);
    }
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.instances);
    gl.bufferData(gl.ARRAY_BUFFER, d.subarray(0, n * FLOATS), gl.DYNAMIC_DRAW);
    gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, 4, n);
    gl.bindVertexArray(null);
  }
}
