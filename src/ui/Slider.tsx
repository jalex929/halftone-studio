import { useId } from "react";

interface Props {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** How the number reads next to the label. */
  format?: (v: number) => string;
  hint?: string;
  onChange: (v: number) => void;
}

export function Slider({ label, value, min, max, step = 1, format, hint, onChange }: Props) {
  const id = useId();
  const text = format ? format(value) : String(Math.round(value * 100) / 100);
  return (
    <div className="field slider" title={hint}>
      <label htmlFor={id}>{label}</label>
      <input
        id={id}
        aria-describedby={hint ? `${id}-hint` : undefined}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={text}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      <output htmlFor={id}>{text}</output>
      {hint && (
        <p className="hint" id={`${id}-hint`}>
          {hint}
        </p>
      )}
    </div>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const deg = (v: number) => `${Math.round(v)}°`;
