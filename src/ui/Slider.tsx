import { useEffect, useId, useState } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Shown in the number box: value <-> display. Defaults to the raw value. */
  display?: { to: (v: number) => number; from: (n: number) => number; unit: string };
  hint?: string;
  onChange: (v: number) => void;
}

/** One console row: label (with optional info dot), slider track, editable number box. */
export function Slider({ label, value, min, max, step = 1, display, hint, onChange }: Props) {
  const id = useId();
  const [showHint, setShowHint] = useState(false);
  const to = display?.to ?? ((v: number) => v);
  const from = display?.from ?? ((n: number) => n);
  const shown = Math.round(to(value) * 10) / 10;
  const [text, setText] = useState(String(shown));
  useEffect(() => setText(String(shown)), [shown]);
  const fillPct = ((value - min) / (max - min || 1)) * 100;

  const commitText = () => {
    const n = Number(text);
    if (text.trim() === "" || !Number.isFinite(n)) {
      setText(String(shown));
      return;
    }
    onChange(Math.min(max, Math.max(min, from(n))));
  };

  return (
    <div className="ctl">
      <div className="ctl-label">
        <label htmlFor={id}>{label}</label>
        {hint && (
          <button
            type="button"
            className="info"
            aria-label={`About ${label}`}
            aria-expanded={showHint}
            onClick={() => setShowHint(!showHint)}
          >
            i
          </button>
        )}
      </div>
      <input
        id={id}
        className="range"
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        style={{ "--fill": `${fillPct}%` } as React.CSSProperties}
        aria-valuetext={`${shown}${display?.unit ?? ""}`}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <label className="ctl-num">
        <input
          aria-label={`${label} value`}
          inputMode="decimal"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onBlur={commitText}
          onKeyDown={(e) => {
            if (e.key === "Enter") commitText();
            if (e.key === "ArrowUp" || e.key === "ArrowDown") {
              e.preventDefault();
              const dir = e.key === "ArrowUp" ? 1 : -1;
              const next = value + dir * step * (e.shiftKey ? 10 : 1);
              onChange(Math.min(max, Math.max(min, next)));
            }
          }}
        />
        {display?.unit && <span aria-hidden="true">{display.unit}</span>}
      </label>
      {hint && showHint && <p className="ctl-hint">{hint}</p>}
    </div>
  );
}

export const pct = { to: (v: number) => v * 100, from: (n: number) => n / 100, unit: "%" };
export const deg = { to: (v: number) => v, from: (n: number) => n, unit: "°" };
export const px = { to: (v: number) => v, from: (n: number) => n, unit: "px" };
