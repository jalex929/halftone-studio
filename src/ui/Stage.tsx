import { useEffect, useMemo, useRef, useState } from "react";
import { generateRibbon, ribbonPath, type Marker, type RibbonSettings } from "../engine/ribbon";
import { GLRibbon } from "../engine/glRender";
import { drawRibbon } from "../engine/ribbonRender";
import { RIBBON_LIMITS as L } from "../engine/ribbon";
import { Slider, deg, pct } from "./Slider";

interface Props {
  settings: RibbonSettings;
  selectedId: string | null;
  showGuides: boolean;
  onSelect: (id: string | null) => void;
  /** Live update while dragging (no history entry). */
  onMoveMarker: (id: string, x: number, y: number) => void;
  /** Drag finished: worth an undo step. */
  onCommit: () => void;
  onAddMarker: (x: number, y: number) => void;
  onDotCount?: (n: number) => void;
  /** Edit the selected marker from the card beside it. */
  onEditMarker: (id: string, patch: Partial<Marker>) => void;
  onRemoveMarker: () => void;
  canRemove: boolean;
}

const clamp01 = (v: number) => Math.max(0, Math.min(1, v));

export function Stage({
  settings: s,
  selectedId,
  showGuides,
  onSelect,
  onMoveMarker,
  onCommit,
  onAddMarker,
  onDotCount,
  onEditMarker,
  onRemoveMarker,
  canRemove,
}: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [displayW, setDisplayW] = useState(800);
  const drag = useRef<{ id: string; pointer: number } | null>(null);

  // Track the on-screen width so the preview renders sharp but not at full export size.
  useEffect(() => {
    const el = wrapRef.current;
    if (!el) return;
    const ro = new ResizeObserver(([entry]) => {
      if (entry) setDisplayW(Math.max(100, entry.contentRect.width));
    });
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const dots = useMemo(() => generateRibbon(s), [s]);

  useEffect(() => {
    onDotCount?.(dots.length);
  }, [dots, onDotCount]);

  // GPU renderer when available; plain 2D canvas otherwise. Decided once per canvas.
  const renderer = useRef<{ gl: GLRibbon | null; tried: boolean }>({ gl: null, tried: false });

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    const scale = Math.min(1, (displayW * dpr) / s.width);
    const w = Math.round(s.width * scale);
    const h = Math.round(s.height * scale);
    if (canvas.width !== w) canvas.width = w;
    if (canvas.height !== h) canvas.height = h;
    const r = renderer.current;
    if (!r.tried) {
      r.tried = true;
      r.gl = GLRibbon.create(canvas);
    }
    if (r.gl) r.gl.draw(s, dots, scale);
    else {
      const ctx = canvas.getContext("2d");
      if (ctx) drawRibbon(ctx, s, dots, scale);
    }
  }, [dots, s, displayW]);

  // Pointer moves can arrive faster than the screen refreshes: apply at most one per frame.
  const pending = useRef<{ id: string; x: number; y: number } | null>(null);
  const frame = useRef(0);
  const queueMove = (id: string, x: number, y: number) => {
    pending.current = { id, x, y };
    if (frame.current) return;
    frame.current = requestAnimationFrame(() => {
      frame.current = 0;
      const p = pending.current;
      pending.current = null;
      if (p) onMoveMarker(p.id, p.x, p.y);
    });
  };
  useEffect(() => () => cancelAnimationFrame(frame.current), []);

  const toArtboard = (clientX: number, clientY: number) => {
    const rect = svgRef.current?.getBoundingClientRect();
    if (!rect) return { x: 0, y: 0 };
    return {
      x: clamp01((clientX - rect.left) / rect.width),
      y: clamp01((clientY - rect.top) / rect.height),
    };
  };

  // Handle radius in artboard units, so it stays ~9px on screen at any zoom.
  const unit = s.width / displayW;
  const handleR = 9 * unit;

  const guide = useMemo(() => {
    const path = ribbonPath(s.markers);
    const pts: string[] = [];
    for (let i = 0; i <= 120; i++) {
      const u = i / 120;
      pts.push(`${u * s.width},${path.y(u) * s.height}`);
    }
    return pts.join(" ");
  }, [s.markers, s.width, s.height]);

  const keyMove = (m: Marker, e: React.KeyboardEvent) => {
    const step = e.shiftKey ? 0.05 : 0.01;
    const moves: Record<string, [number, number]> = {
      ArrowLeft: [-step, 0],
      ArrowRight: [step, 0],
      ArrowUp: [0, -step],
      ArrowDown: [0, step],
    };
    const mv = moves[e.key];
    if (!mv) return;
    e.preventDefault();
    onMoveMarker(m.id, clamp01(m.x + mv[0]), clamp01(m.y + mv[1]));
  };

  return (
    <div
      className={`stage${s.transparent ? " is-transparent" : ""}`}
      ref={wrapRef}
      style={{ aspectRatio: `${s.width} / ${s.height}` }}
    >
      <canvas
        ref={canvasRef}
        role="img"
        aria-label={`Halftone ribbon preview, ${dots.length.toLocaleString()} dots, ${s.markers.length} markers`}
      />
      {showGuides && (
        <svg
          ref={svgRef}
          className="overlay"
          viewBox={`0 0 ${s.width} ${s.height}`}
          preserveAspectRatio="none"
          onDoubleClick={(e) => {
            const p = toArtboard(e.clientX, e.clientY);
            onAddMarker(p.x, p.y);
          }}
          onPointerDown={(e) => {
            if (e.target === e.currentTarget) onSelect(null);
          }}
          onPointerMove={(e) => {
            const d = drag.current;
            if (!d || d.pointer !== e.pointerId) return;
            const p = toArtboard(e.clientX, e.clientY);
            queueMove(d.id, p.x, p.y);
          }}
          onPointerUp={(e) => {
            if (drag.current?.pointer === e.pointerId) {
              drag.current = null;
              onCommit();
            }
          }}
          onPointerCancel={() => {
            drag.current = null;
          }}
        >
          <polyline
            points={guide}
            fill="none"
            className="guide-line"
            strokeWidth={1.5 * unit}
            strokeDasharray={`${6 * unit} ${6 * unit}`}
          />
          {s.markers.map((m, i) => {
            const selected = m.id === selectedId;
            const cx = m.x * s.width;
            const cy = m.y * s.height;
            return (
              <g
                key={m.id}
                className={`marker${selected ? " is-selected" : ""}`}
                role="button"
                tabIndex={0}
                aria-pressed={selected}
                aria-label={`Marker ${i + 1}: ${Math.round(m.x * 100)}% across, ${Math.round((1 - m.y) * 100)}% high, twist ${Math.round(m.twist)} degrees. Arrow keys move it.`}
                onFocus={() => onSelect(m.id)}
                onKeyDown={(e) => keyMove(m, e)}
                onKeyUp={(e) => e.key.startsWith("Arrow") && onCommit()}
                onPointerDown={(e) => {
                  e.stopPropagation();
                  (e.currentTarget.ownerSVGElement ?? e.currentTarget).setPointerCapture?.(
                    e.pointerId,
                  );
                  drag.current = { id: m.id, pointer: e.pointerId };
                  onSelect(m.id);
                }}
              >
                {/* Width bar: shows how wide the ribbon is set here. */}
                <line
                  x1={cx}
                  x2={cx}
                  y1={cy - (m.width * s.height) / 2}
                  y2={cy + (m.width * s.height) / 2}
                  className="marker-width"
                  strokeWidth={2 * unit}
                />
                <circle cx={cx} cy={cy} r={handleR * 2.2} className="marker-hit" />
                <circle cx={cx} cy={cy} r={handleR} className="marker-dot" strokeWidth={3 * unit} />
                <text
                  x={cx + handleR * 1.5}
                  y={cy - handleR * 1.5}
                  fontSize={13 * unit}
                  className="marker-label"
                >
                  {i + 1}
                </text>
              </g>
            );
          })}
        </svg>
      )}
      {showGuides &&
        (() => {
          const m = s.markers.find((x) => x.id === selectedId);
          if (!m) return null;
          const n = [...s.markers].sort((a, b) => a.x - b.x).findIndex((x) => x.id === m.id) + 1;
          // Sit beside the marker, flipping to the other side near the right or bottom edge.
          const style: React.CSSProperties = {
            [m.x > 0.62 ? "right" : "left"]: `calc(${(m.x > 0.62 ? 1 - m.x : m.x) * 100}% + 22px)`,
            [m.y > 0.55 ? "bottom" : "top"]:
              `max(8px, calc(${(m.y > 0.55 ? 1 - m.y : m.y) * 100}% - 40px))`,
          };
          return (
            <div
              className="marker-card"
              style={style}
              role="group"
              aria-label={`Marker ${n} settings`}
              onPointerDown={(e) => e.stopPropagation()}
              onDoubleClick={(e) => e.stopPropagation()}
            >
              <div className="marker-card-head">
                <span>Marker {n}</span>
                <button
                  type="button"
                  onClick={onRemoveMarker}
                  disabled={!canRemove}
                  aria-label={`Delete marker ${n}`}
                >
                  Delete
                </button>
              </div>
              <Slider
                label="Width"
                value={m.width}
                min={L.markerWidth[0]}
                max={L.markerWidth[1]}
                step={0.01}
                display={pct}
                onChange={(v) => onEditMarker(m.id, { width: v })}
              />
              <Slider
                label="Twist"
                value={m.twist}
                min={L.twist[0]}
                max={L.twist[1]}
                display={deg}
                onChange={(v) => onEditMarker(m.id, { twist: v })}
              />
            </div>
          );
        })()}
    </div>
  );
}
