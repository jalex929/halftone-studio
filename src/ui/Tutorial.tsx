import { useEffect, useRef, useState } from "react";

/** GIFs live in public/tutorial and are recorded from the real app by scripts/record-tutorial.mjs. */
const STEPS = [
  {
    gif: "tutorial/1-markers.gif",
    title: "Drag markers to shape it",
    text: "Each marker is a point the ribbon passes through. Drag one up for a peak, down for a dip. Double-click the canvas to add a marker.",
  },
  {
    gif: "tutorial/2-twist.gif",
    title: "Twist and widen",
    text: "Pick a marker, then use Width and Twist in the Shape tab. Twist near 90° turns the ribbon edge-on into a fine line of dots.",
  },
  {
    gif: "tutorial/3-dots.gif",
    title: "Tune the dots",
    text: "The Dots and Depth tabs set dot size, how many dots, perspective and curl. Max fill keeps every dot a separate dot.",
  },
  {
    gif: "tutorial/4-file.gif",
    title: "Save, export, reopen",
    text: "In the File tab, download SVG or PNG. Those files remember your settings: open one again to keep editing.",
  },
];

const SEEN_KEY = "halftone-studio:tutorial-seen";

export function tutorialSeen(): boolean {
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
    /* storage unavailable: it will show again next visit, which is harmless */
  }
}

export function Tutorial({ onClose }: { onClose: () => void }) {
  const [i, setI] = useState(0);
  const dialog = useRef<HTMLDialogElement>(null);
  const step = STEPS[i] ?? STEPS[0]!;
  const last = i === STEPS.length - 1;

  useEffect(() => {
    const d = dialog.current;
    if (d && !d.open) d.showModal?.();
  }, []);

  const close = () => {
    markSeen();
    onClose();
  };

  return (
    <dialog
      ref={dialog}
      className="tutorial"
      aria-labelledby="tutorial-title"
      onCancel={(e) => {
        e.preventDefault();
        close();
      }}
    >
      <div className="tutorial-media">
        <picture key={step.gif}>
          {/* Reduced motion: a still frame instead of the animation. */}
          <source
            media="(prefers-reduced-motion: reduce)"
            srcSet={step.gif.replace(/\.gif$/, ".png")}
          />
          <img
            src={step.gif}
            alt={`Animation: ${step.title.toLowerCase()}`}
            width={640}
            height={360}
          />
        </picture>
      </div>
      <div className="tutorial-body">
        <p className="tutorial-count">
          Step {i + 1} of {STEPS.length}
        </p>
        <h2 id="tutorial-title">{step.title}</h2>
        <p>{step.text}</p>
        <div className="tutorial-actions">
          <button type="button" onClick={close}>
            Skip
          </button>
          <span className="spacer" />
          <button type="button" onClick={() => setI(i - 1)} disabled={i === 0}>
            Back
          </button>
          <button
            type="button"
            className="primary"
            onClick={() => (last ? close() : setI(i + 1))}
            autoFocus
          >
            {last ? "Start making" : "Next"}
          </button>
        </div>
      </div>
    </dialog>
  );
}
