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
    <div className="field">
      <div className="field-row">
        <label htmlFor={id}>{label}</label>
        <output htmlFor={id}>{text}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        aria-valuetext={text}
        onChange={(e) => onChange(Number(e.target.value))}
      />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export const pct = (v: number) => `${Math.round(v * 100)}%`;
export const deg = (v: number) => `${Math.round(v)}°`;
