"use client";

import type { ReactNode } from "react";

interface SliderProps {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (v: number) => void;
  label: string;
  valueText?: string;
}

export function Slider({ value, min, max, step = 1, onChange, label, valueText }: SliderProps) {
  const pct = ((value - min) / (max - min)) * 100;
  return (
    <input
      className="slider"
      type="range"
      min={min}
      max={max}
      step={step}
      value={value}
      aria-label={label}
      aria-valuetext={valueText}
      onChange={(e) => onChange(Number(e.target.value))}
      style={{ ["--pct" as string]: `${pct}%` }}
    />
  );
}

export function Meter({ value, label }: { value: number; label: string }) {
  return (
    <div className="meter" role="meter" aria-label={label} aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(value * 100)}>
      <span style={{ width: `${Math.max(4, value * 100)}%` }} />
    </div>
  );
}

export function SheetHeader({ icon, title, step, children }: { icon: ReactNode; title: string; step?: string; children?: ReactNode }) {
  return (
    <div className="sheet__header">
      <div className="sheet__icon" aria-hidden>
        {icon}
      </div>
      <div>
        <div className="title-l">{title}</div>
        {children && <div className="body-m muted">{children}</div>}
      </div>
      {step && <div className="sheet__step label-m">{step}</div>}
    </div>
  );
}
