import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { sortedMarkers, type Marker, type RibbonSettings } from "../engine/ribbon";

/**
 * Live guided tour: spotlights the real control and animates the real ribbon to show what it
 * does, then puts the person's design back exactly as it was. No recordings to go stale.
 */

export type TourTab = "shape" | "dots" | "depth" | "color" | "file";

interface Step {
  title: string;
  text: string;
  /** CSS selector of the element to spotlight. */
  target: string;
  tab?: TourTab;
  selectMiddle?: boolean;
  /** Settings at time t (seconds), starting from the design as it was. */
  demo?: (base: RibbonSettings, t: number, mid: Marker) => RibbonSettings;
}

const wave = (t: number, period = 3.2) => Math.sin((2 * Math.PI * t) / period);

const withMarker = (s: RibbonSettings, id: string, patch: Partial<Marker>): RibbonSettings => ({
  ...s,
  markers: s.markers.map((m) => (m.id === id ? { ...m, ...patch } : m)),
});

const clamp = (v: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, v));

const STEPS: Step[] = [
  {
    title: "Drag markers to shape it",
    text: "The ribbon passes through every marker. Drag one up for a peak, down for a dip. Double-click the canvas to add a marker, Delete removes the selected one.",
    target: ".stage",
    selectMiddle: true,
    demo: (b, t, m) => withMarker(b, m.id, { y: clamp(m.y - 0.22 * wave(t), 0.05, 0.95) }),
  },
  {
    title: "Width and twist, right beside it",
    text: "The selected marker gets a card with its own controls. Twist turns the ribbon: 0° faces you, near 90° it goes edge-on into a fine line of dots.",
    target: ".marker-card",
    selectMiddle: true,
    demo: (b, t, m) =>
      withMarker(b, m.id, {
        twist: clamp(m.twist + 70 * wave(t, 4), -180, 180),
        width: clamp(m.width * (1 + 0.5 * wave(t, 2.7)), 0.02, 1.5),
      }),
  },
  {
    title: "Dots stay dots",
    text: "Dot size sets how big they want to be; Max fill caps each dot by the room it actually has, so squeezed areas stay crisp separate dots instead of merging into lines.",
    target: ".panel",
    tab: "dots",
    demo: (b, t) => ({ ...b, dotSize: clamp(b.dotSize * (1 + 0.6 * wave(t)), 0.5, 40) }),
  },
  {
    title: "Add depth",
    text: "Perspective makes near dots bigger and far dots smaller. Depth fade and soft edges finish the look.",
    target: ".panel",
    tab: "depth",
    demo: (b, t) => ({ ...b, perspective: 0.5 + 0.45 * wave(t, 4) }),
  },
  {
    title: "Save, export, reopen",
    text: "Download SVG (real vector dots) or PNG. Both files remember your settings: open one here again any time to keep editing.",
    target: ".panel",
    tab: "file",
  },
];

const SEEN_KEY = "halftone-studio:tutorial-seen";

export function tourSeen(): boolean {
  try {
    return localStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return true;
  }
}

function markSeen() {
  try {
    localStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* storage unavailable: the tour shows again next visit, which is harmless */
  }
}

interface Props {
  base: RibbonSettings;
  apply: (s: RibbonSettings) => void;
  setTab: (t: TourTab) => void;
  select: (id: string | null) => void;
  onDone: () => void;
}

export function Tour({ base, apply, setTab, select, onDone }: Props) {
  const [i, setI] = useState(0);
  const [rect, setRect] = useState<DOMRect | null>(null);
  const baseRef = useRef(base);
  const step = STEPS[i] ?? STEPS[0]!;
  const last = i === STEPS.length - 1;
  const reduceMotion =
    typeof window !== "undefined" &&
    window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;
  const middle = (() => {
    const ms = sortedMarkers(baseRef.current.markers);
    return ms[Math.floor((ms.length - 1) / 2)] ?? ms[0]!;
  })();

  // Set up the step: tab, selection, and the demo animation on the real ribbon.
  useEffect(() => {
    const b = baseRef.current;
    apply(b);
    if (step.tab) setTab(step.tab);
    else setTab("shape");
    select(step.selectMiddle ? middle.id : null);
    if (!step.demo || reduceMotion) return;
    let raf = 0;
    const start = performance.now();
    const tick = (now: number) => {
      apply(step.demo!(b, (now - start) / 1000, middle));
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [i]);

  // Keep the spotlight on the target as layout moves.
  useLayoutEffect(() => {
    let raf = 0;
    const measure = () => {
      const el = document.querySelector(step.target);
      const r = el?.getBoundingClientRect() ?? null;
      setRect((prev) =>
        prev &&
        r &&
        prev.x === r.x &&
        prev.y === r.y &&
        prev.width === r.width &&
        prev.height === r.height
          ? prev
          : r,
      );
      raf = requestAnimationFrame(measure);
    };
    measure();
    return () => cancelAnimationFrame(raf);
  }, [step.target]);

  const finish = () => {
    markSeen();
    apply(baseRef.current);
    select(null);
    setTab("shape");
    onDone();
  };

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") finish();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

  const pad = 8;
  const hole = rect
    ? {
        left: rect.left - pad,
        top: rect.top - pad,
        width: rect.width + pad * 2,
        height: rect.height + pad * 2,
      }
    : null;

  // Card goes left of panel targets, below or above stage targets.
  const cardStyle: React.CSSProperties = {};
  if (hole) {
    const vw = window.innerWidth;
    const vh = window.innerHeight;
    if (hole.left > vw * 0.55 && vw > 860) {
      cardStyle.left = Math.max(16, hole.left - 380);
      cardStyle.top = Math.min(vh - 260, Math.max(16, hole.top + 40));
    } else if (hole.top + hole.height + 230 < vh) {
      cardStyle.left = Math.max(16, Math.min(hole.left, vw - 380));
      cardStyle.top = hole.top + hole.height + 12;
    } else {
      cardStyle.left = Math.max(16, Math.min(hole.left, vw - 380));
      cardStyle.top = Math.max(16, hole.top - 230);
    }
  }

  return (
    <div className="tour" role="dialog" aria-modal="true" aria-labelledby="tour-title">
      {hole && (
        <div
          className="tour-hole"
          style={{ left: hole.left, top: hole.top, width: hole.width, height: hole.height }}
          aria-hidden="true"
        />
      )}
      <div className="tour-card" style={cardStyle}>
        <p className="tour-count">
          {i + 1} / {STEPS.length}
        </p>
        <h2 id="tour-title">{step.title}</h2>
        <p>{step.text}</p>
        {reduceMotion && step.demo && (
          <p className="tour-note">Animation is off because your device asks for reduced motion.</p>
        )}
        <div className="tour-actions">
          <button type="button" onClick={finish}>
            Skip
          </button>
          <span className="spacer" />
          <button type="button" onClick={() => setI(i - 1)} disabled={i === 0}>
            Back
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => (last ? finish() : setI(i + 1))}
            autoFocus
          >
            {last ? "Start making" : "Next"}
          </button>
        </div>
      </div>
    </div>
  );
}
