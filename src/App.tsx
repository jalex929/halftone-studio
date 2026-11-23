import { useCallback, useEffect, useRef, useState } from "react";
import {
  DEFAULT_RIBBON,
  MAX_MARKERS,
  RIBBON_LIMITS as L,
  RIBBON_PRESETS,
  generateRibbon,
  newMarkerId,
  ribbonPath,
  sanitizeRibbon,
  sortedMarkers,
  type Marker,
  type RibbonSettings,
} from "./engine/ribbon";
import { addPngText } from "./engine/embed";
import { GLRibbon } from "./engine/glRender";
import { drawRibbon, ribbonToSvg } from "./engine/ribbonRender";
import { SHAPES, type Shape } from "./engine/shapes";
import { Slider, deg, pct, px } from "./ui/Slider";
import { SavedDesigns } from "./ui/SavedDesigns";
import { Stage } from "./ui/Stage";
import { Tour, tourSeen } from "./ui/Tour";

const DRAFT_KEY = "halftone-studio:ribbon";

const SIZES = [
  { label: "Hero 16:9", width: 2000, height: 1125 },
  { label: "Banner 16:3", width: 2000, height: 375 },
  { label: "Square", width: 1500, height: 1500 },
  { label: "Portrait 4:5", width: 1200, height: 1500 },
];

function loadDraft(): RibbonSettings {
  try {
    const raw = localStorage.getItem(DRAFT_KEY);
    if (raw) return sanitizeRibbon(JSON.parse(raw));
  } catch {
    /* private window or blocked storage: start fresh */
  }
  return DEFAULT_RIBBON;
}

function download(name: string, blob: Blob) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

const SCHEMES = [
  { label: "Night", ink: "#ffffff", inkFar: "#ffffff", background: "#000000" },
  { label: "Navy", ink: "#5f7fa3", inkFar: "#3b5573", background: "#0e2238" },
  { label: "Paper", ink: "#1b1b3a", inkFar: "#5a5a78", background: "#f6f1e7" },
  { label: "Riso", ink: "#ff4f8b", inkFar: "#2a4bd7", background: "#fff7ea" },
  { label: "Ember", ink: "#ffd23f", inkFar: "#ff3c78", background: "#10142b" },
];

const TABS = [
  { id: "shape", label: "Shape" },
  { id: "dots", label: "Dots" },
  { id: "depth", label: "Depth" },
  { id: "color", label: "Color" },
  { id: "file", label: "File" },
] as const;
type Tab = (typeof TABS)[number]["id"];

export function App() {
  const [tab, setTab] = useState<Tab>("shape");
  const [tourBase, setTourBase] = useState<RibbonSettings | null>(null);
  const touring = tourBase !== null;
  const [s, setS] = useState<RibbonSettings>(loadDraft);
  const [selectedId, setSelectedId] = useState<string | null>(s.markers[1]?.id ?? null);
  const [showGuides, setShowGuides] = useState(true);
  const [dotCount, setDotCount] = useState(0);
  const [status, setStatus] = useState("");
  useEffect(() => {
    if (!tourSeen()) setTourBase(s);
    // Only on first load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  const past = useRef<RibbonSettings[]>([]);
  const future = useRef<RibbonSettings[]>([]);
  // The settings as of the last undo step, so a whole drag becomes one step.
  const committed = useRef(s);

  const commit = useCallback(() => {
    setS((cur) => {
      if (cur !== committed.current) {
        past.current = [...past.current.slice(-79), committed.current];
        future.current = [];
        committed.current = cur;
      }
      return cur;
    });
  }, []);

  /** Change settings; `live` skips the undo step (used mid-drag). */
  const update = useCallback(
    (patch: Partial<RibbonSettings>, live = false) => {
      setS((cur) => ({ ...cur, ...patch }));
      if (!live) queueMicrotask(commit);
    },
    [commit],
  );

  // Save the draft once edits pause, not on every drag frame.
  useEffect(() => {
    if (touring) return;
    const timer = setTimeout(() => {
      try {
        localStorage.setItem(DRAFT_KEY, JSON.stringify(s));
      } catch {
        /* storage unavailable: the draft just won't survive a reload */
      }
    }, 400);
    return () => clearTimeout(timer);
  }, [s, touring]);

  const undo = useCallback(() => {
    const prev = past.current.pop();
    if (!prev) return;
    future.current.push(committed.current);
    committed.current = prev;
    setS(prev);
  }, []);
  const redo = useCallback(() => {
    const next = future.current.pop();
    if (!next) return;
    past.current.push(committed.current);
    committed.current = next;
    setS(next);
  }, []);

  const selected = s.markers.find((m) => m.id === selectedId) ?? null;
  const order = sortedMarkers(s.markers);

  const setMarker = (id: string, patch: Partial<Marker>, live = false) =>
    update({ markers: s.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)) }, live);

  const addMarker = (x: number, y?: number) => {
    if (s.markers.length >= MAX_MARKERS) {
      setStatus(`Up to ${MAX_MARKERS} markers.`);
      return;
    }
    const path = ribbonPath(s.markers);
    const m: Marker = {
      id: newMarkerId(),
      x,
      y: y ?? path.y(x),
      width: path.width(x),
      twist: path.twist(x),
    };
    update({ markers: sortedMarkers([...s.markers, m]) });
    setSelectedId(m.id);
  };

  /** New marker in the middle of the widest gap. */
  const addInGap = () => {
    const xs = [0, ...order.map((m) => m.x), 1];
    let best = 0;
    let at = 0.5;
    for (let i = 0; i < xs.length - 1; i++) {
      const gap = (xs[i + 1] ?? 0) - (xs[i] ?? 0);
      if (gap > best) {
        best = gap;
        at = (xs[i] ?? 0) + gap / 2;
      }
    }
    addMarker(at);
  };

  const removeSelected = () => {
    if (!selected || s.markers.length <= 2) return;
    const i = order.findIndex((m) => m.id === selected.id);
    update({ markers: s.markers.filter((m) => m.id !== selected.id) });
    setSelectedId(order[i + 1]?.id ?? order[i - 1]?.id ?? null);
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement;
      if (target.closest("input, select, textarea")) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.key.toLowerCase() === "z") {
        e.preventDefault();
        if (e.shiftKey) redo();
        else undo();
      } else if (mod && e.key.toLowerCase() === "y") {
        e.preventDefault();
        redo();
      } else if ((e.key === "Delete" || e.key === "Backspace") && selectedId) {
        e.preventDefault();
        removeSelected();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const exportSvg = () => {
    const svg = ribbonToSvg(s, generateRibbon(s));
    download("halftone-ribbon.svg", new Blob([svg], { type: "image/svg+xml" }));
    setStatus("SVG downloaded.");
  };

  const exportPng = (scale: number) => {
    const w = Math.round(s.width * scale);
    const h = Math.round(s.height * scale);
    const dots = generateRibbon(s);
    // GPU first (fast at any density); a fresh 2D canvas if WebGL is missing or the size is
    // beyond what this GPU can render in one pass.
    let canvas = document.createElement("canvas");
    canvas.width = w;
    canvas.height = h;
    const gl = GLRibbon.create(canvas, true);
    if (gl && Math.max(w, h) <= gl.maxSize()) {
      gl.draw(s, dots, scale);
    } else {
      canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      drawRibbon(ctx, s, dots, scale);
    }
    canvas.toBlob(async (blob) => {
      if (!blob) return;
      // Settings ride along inside the PNG so it can be reopened and edited.
      const bytes = addPngText(new Uint8Array(await blob.arrayBuffer()), JSON.stringify(s));
      download(
        `halftone-ribbon${scale > 1 ? `@${scale}x` : ""}.png`,
        new Blob([bytes], { type: "image/png" }),
      );
      setStatus("PNG downloaded.");
    }, "image/png");
  };

  const applyPreset = (p: RibbonSettings) => {
    update({ ...p, markers: p.markers.map((m) => ({ ...m, id: newMarkerId() })) });
    setSelectedId(null);
  };

  const selIndex = selected ? order.findIndex((m) => m.id === selected.id) + 1 : 0;

  return (
    <div className="app">
      <header className="top">
        <div className="brand">
          <svg viewBox="0 0 28 28" aria-hidden="true" className="logo">
            {[0, 1, 2, 3].map((r) =>
              [0, 1, 2, 3].map((c) => (
                <circle
                  key={`${r}${c}`}
                  cx={4 + c * 6.7}
                  cy={4 + r * 6.7}
                  r={0.8 + (c + r) * 0.45}
                />
              )),
            )}
          </svg>
          <h1>Halftone Studio</h1>
        </div>
        <p className="tagline">
          Drag markers to shape the ribbon. Double-click or double-tap the canvas to add one.
        </p>
        <div className="top-actions">
          <button type="button" onClick={() => setTourBase(s)}>
            How it works
          </button>
          <button
            type="button"
            onClick={undo}
            disabled={past.current.length === 0}
            title="Undo (Ctrl+Z)"
          >
            Undo
          </button>
          <button
            type="button"
            onClick={redo}
            disabled={future.current.length === 0}
            title="Redo (Ctrl+Y)"
          >
            Redo
          </button>
          <label className="check">
            <input
              type="checkbox"
              checked={showGuides}
              onChange={(e) => setShowGuides(e.target.checked)}
            />
            Show markers
          </label>
        </div>
      </header>

      <main className="workspace">
        <section className="canvas-area" aria-label="Artboard">
          <Stage
            settings={s}
            selectedId={selectedId}
            showGuides={showGuides}
            onSelect={setSelectedId}
            onMoveMarker={(id, x, y) => setMarker(id, { x, y }, true)}
            onCommit={commit}
            onAddMarker={(x, y) => addMarker(x, y)}
            onDotCount={setDotCount}
            onEditMarker={(id, patch) => setMarker(id, patch)}
            onRemoveMarker={removeSelected}
            canRemove={s.markers.length > 2}
          />
          <p className="meta">
            {s.width} × {s.height}px · {dotCount.toLocaleString()} dots · {s.markers.length} markers
            <span role="status" className="status">
              {status}
            </span>
          </p>
        </section>

        <aside className="panel" aria-label="Controls">
          <div className="tabs" role="tablist" aria-label="Control groups">
            {TABS.map((x) => (
              <button
                key={x.id}
                type="button"
                role="tab"
                id={`tab-${x.id}`}
                aria-selected={tab === x.id}
                aria-controls="panel-body"
                className="tab"
                onClick={() => setTab(x.id)}
              >
                {x.label}
              </button>
            ))}
          </div>
          <div
            className="panel-body"
            id="panel-body"
            role="tabpanel"
            aria-labelledby={`tab-${tab}`}
          >
            {tab === "shape" && (
              <>
                <section className="group">
                  <div className="group-head">
                    <h2>{selected ? `Marker ${selIndex}` : "Markers"}</h2>
                    <div className="row-buttons">
                      <button
                        type="button"
                        onClick={addInGap}
                        disabled={s.markers.length >= MAX_MARKERS}
                      >
                        Add
                      </button>
                      <button
                        type="button"
                        onClick={removeSelected}
                        disabled={!selected || s.markers.length <= 2}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                  <div className="chips" role="group" aria-label="Pick a marker">
                    {order.map((m, i) => (
                      <button
                        key={m.id}
                        type="button"
                        className="marker-chip"
                        aria-pressed={m.id === selectedId}
                        onClick={() => setSelectedId(m.id)}
                      >
                        {i + 1}
                      </button>
                    ))}
                  </div>
                  {selected ? (
                    <>
                      <Slider
                        label="Height"
                        value={1 - selected.y}
                        min={0}
                        max={1}
                        step={0.005}
                        display={pct}
                        onChange={(v) => setMarker(selected.id, { y: 1 - v })}
                      />
                      <Slider
                        label="Position"
                        value={selected.x}
                        min={0}
                        max={1}
                        step={0.005}
                        display={pct}
                        onChange={(v) => setMarker(selected.id, { x: v })}
                      />
                      <Slider
                        label="Width"
                        value={selected.width}
                        min={L.markerWidth[0]}
                        max={L.markerWidth[1]}
                        step={0.01}
                        display={pct}
                        hint="How wide the ribbon is at this marker."
                        onChange={(v) => setMarker(selected.id, { width: v })}
                      />
                      <Slider
                        label="Twist"
                        value={selected.twist}
                        min={L.twist[0]}
                        max={L.twist[1]}
                        display={deg}
                        hint="0° faces you. ±90° turns it edge-on into a bright line."
                        onChange={(v) => setMarker(selected.id, { twist: v })}
                      />
                    </>
                  ) : (
                    <p className="hint">
                      Pick a marker on the canvas to set its height, width and twist.
                    </p>
                  )}
                </section>
              </>
            )}
            {tab === "shape" && (
              <section className="group">
                <h2>Ribbon</h2>
                <Slider
                  label="Curl"
                  value={s.curl}
                  min={L.curl[0]}
                  max={L.curl[1]}
                  step={0.01}
                  display={pct}
                  hint="Bends the ribbon across, for the scalloped arcs."
                  onChange={(v) => update({ curl: v })}
                />
                <Slider
                  label="Ripple"
                  value={s.ripple}
                  min={0}
                  max={1}
                  step={0.01}
                  display={pct}
                  onChange={(v) => update({ ripple: v })}
                />
                <Slider
                  label="Ripple count"
                  value={s.rippleCount}
                  min={L.rippleCount[0]}
                  max={L.rippleCount[1]}
                  step={0.5}
                  onChange={(v) => update({ rippleCount: v })}
                />
              </section>
            )}
            {tab === "shape" && (
              <section className="group">
                <h2>Start from</h2>
                <div className="chips">
                  {RIBBON_PRESETS.map((p) => (
                    <button key={p.id} type="button" onClick={() => applyPreset(p.settings)}>
                      {p.label}
                    </button>
                  ))}
                </div>
              </section>
            )}
            {tab === "dots" && (
              <>
                <section className="group">
                  <h2>Dots</h2>
                  <Slider
                    label="Dot size"
                    value={s.dotSize}
                    min={L.dotSize[0]}
                    max={20}
                    step={0.1}
                    display={px}
                    onChange={(v) => update({ dotSize: v })}
                  />
                  <Slider
                    label="Max fill"
                    value={s.fill}
                    min={L.fill[0]}
                    max={L.fill[1]}
                    step={0.01}
                    display={pct}
                    hint="Biggest a dot can get next to its neighbors. Under 100% every dot stays separate."
                    onChange={(v) => update({ fill: v })}
                  />
                  <Slider
                    label="Gap fill"
                    value={s.gapFill}
                    min={0}
                    max={1}
                    step={0.01}
                    display={pct}
                    hint="Fills fast twists with small dots so the ribbon reads as one sheet instead of spiky strips."
                    onChange={(v) => update({ gapFill: v })}
                  />
                  <Slider
                    label="Along"
                    value={s.columns}
                    min={L.columns[0]}
                    max={L.columns[1]}
                    hint="Dots along the ribbon."
                    onChange={(v) => update({ columns: v })}
                  />
                  <Slider
                    label="Across"
                    value={s.rows}
                    min={L.rows[0]}
                    max={L.rows[1]}
                    hint="Dots across the ribbon."
                    onChange={(v) => update({ rows: v })}
                  />
                  <div className="field">
                    <span className="field-label" id="shape-label">
                      Shape
                    </span>
                    <div className="chips" role="group" aria-labelledby="shape-label">
                      {SHAPES.filter((x) => x.id !== "line").map((x) => (
                        <button
                          key={x.id}
                          type="button"
                          aria-pressed={s.shape === x.id}
                          onClick={() => update({ shape: x.id as Shape })}
                        >
                          {x.label}
                        </button>
                      ))}
                    </div>
                  </div>
                </section>
              </>
            )}
            {tab === "depth" && (
              <>
                <section className="group">
                  <h2>Depth</h2>
                  <Slider
                    label="Perspective"
                    value={s.perspective}
                    min={0}
                    max={1}
                    step={0.01}
                    display={pct}
                    hint="Near dots grow, far dots shrink."
                    onChange={(v) => update({ perspective: v })}
                  />
                  <Slider
                    label="Depth fade"
                    value={s.depthFade}
                    min={0}
                    max={1}
                    step={0.01}
                    display={pct}
                    onChange={(v) => update({ depthFade: v })}
                  />
                  <Slider
                    label="Soft edges"
                    value={s.edgeSoftness}
                    min={0}
                    max={1}
                    step={0.01}
                    display={pct}
                    onChange={(v) => update({ edgeSoftness: v })}
                  />
                </section>
              </>
            )}
            {tab === "color" && (
              <>
                <section className="group">
                  <h2>Color</h2>
                  <div className="chips" role="group" aria-label="Color schemes">
                    {SCHEMES.map((c) => (
                      <button
                        key={c.label}
                        type="button"
                        className="scheme"
                        aria-pressed={
                          s.ink === c.ink && s.inkFar === c.inkFar && s.background === c.background
                        }
                        onClick={() =>
                          update({
                            ink: c.ink,
                            inkFar: c.inkFar,
                            background: c.background,
                            transparent: false,
                          })
                        }
                      >
                        <span
                          className="swatch"
                          aria-hidden="true"
                          style={{ background: c.background, color: c.ink, borderColor: c.inkFar }}
                        >
                          ●
                        </span>
                        {c.label}
                      </button>
                    ))}
                  </div>
                  <div className="colors">
                    <ColorInput
                      label="Near dots"
                      value={s.ink}
                      onChange={(v) => update({ ink: v })}
                    />
                    <ColorInput
                      label="Far dots"
                      value={s.inkFar}
                      onChange={(v) => update({ inkFar: v })}
                    />
                    <ColorInput
                      label="Background"
                      value={s.background}
                      onChange={(v) => update({ background: v })}
                    />
                  </div>
                  <label className="check">
                    <input
                      type="checkbox"
                      checked={s.transparent}
                      onChange={(e) => update({ transparent: e.target.checked })}
                    />
                    Transparent background
                  </label>
                </section>
              </>
            )}
            {tab === "file" && (
              <>
                <section className="group">
                  <h2>Artboard</h2>
                  <div className="chips" role="group" aria-label="Artboard size">
                    {SIZES.map((z) => (
                      <button
                        key={z.label}
                        type="button"
                        aria-pressed={s.width === z.width && s.height === z.height}
                        onClick={() => update({ width: z.width, height: z.height })}
                      >
                        {z.label}
                      </button>
                    ))}
                  </div>
                  <div className="size-inputs">
                    <NumberInput
                      label="Width"
                      value={s.width}
                      range={L.width}
                      onChange={(v) => update({ width: v })}
                    />
                    <NumberInput
                      label="Height"
                      value={s.height}
                      range={L.height}
                      onChange={(v) => update({ height: v })}
                    />
                  </div>
                </section>

                <SavedDesigns
                  settings={s}
                  onOpen={(next) => {
                    update(next);
                    setSelectedId(null);
                  }}
                  onStatus={setStatus}
                  download={download}
                />

                <section className="group">
                  <h2>Export</h2>
                  <div className="row-buttons">
                    <button type="button" className="primary" onClick={exportSvg}>
                      Download SVG
                    </button>
                    <button type="button" onClick={() => exportPng(1)}>
                      PNG
                    </button>
                    <button type="button" onClick={() => exportPng(2)}>
                      PNG 2×
                    </button>
                  </div>
                  <p className="hint">
                    SVG is real vector dots you can edit in Figma or Illustrator. Everything stays
                    in your browser.
                  </p>
                </section>
              </>
            )}
          </div>
        </aside>
      </main>
      {tourBase && (
        <Tour
          base={tourBase}
          apply={setS}
          setTab={setTab}
          select={setSelectedId}
          onDone={() => setTourBase(null)}
        />
      )}
    </div>
  );
}

function ColorInput({
  label,
  value,
  onChange,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <label className="color">
      <input type="color" value={value} onChange={(e) => onChange(e.target.value)} />
      <span>
        {label}
        <code>{value}</code>
      </span>
    </label>
  );
}

function NumberInput({
  label,
  value,
  range,
  onChange,
}: {
  label: string;
  value: number;
  range: readonly [number, number];
  onChange: (v: number) => void;
}) {
  const [text, setText] = useState(String(value));
  useEffect(() => setText(String(value)), [value]);
  const apply = () => {
    const n = Math.round(Number(text));
    if (Number.isFinite(n) && n > 0) onChange(Math.min(range[1], Math.max(range[0], n)));
    else setText(String(value));
  };
  return (
    <label className="num">
      <span>{label}</span>
      <input
        inputMode="numeric"
        value={text}
        onChange={(e) => setText(e.target.value)}
        onBlur={apply}
        onKeyDown={(e) => e.key === "Enter" && apply()}
      />
    </label>
  );
}
