"use client";

import { Triangle } from "lucide-react";
import { Slider, SheetHeader } from "./ui";

interface Props {
  elevation: number;
  onChange: (v: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}

export const ELEVATION_MAX = 45;

function Dial({ deg }: { deg: number }) {
  const cx = 20;
  const cy = 92;
  const r = 100;
  const rad = (deg * Math.PI) / 180;
  const ex = cx + Math.cos(rad) * r;
  const ey = cy - Math.sin(rad) * r;
  const maxRad = (ELEVATION_MAX * Math.PI) / 180;
  const arcR = 54;
  const arc = (a: number) => `${cx + Math.cos(a) * arcR} ${cy - Math.sin(a) * arcR}`;
  return (
    <svg className="dial" viewBox="0 0 168 108" role="img" aria-label={`地面との角度 ${deg}度`}>
      <path d={`M ${cx} ${cy} L ${arc(maxRad)} A ${arcR} ${arcR} 0 0 0 ${arc(0)} Z`} fill="var(--md-secondary-container)" opacity="0.7" />
      <path d={`M ${cx} ${cy} L ${arc(rad)} A ${arcR} ${arcR} 0 0 0 ${arc(0)} Z`} fill="var(--md-primary)" opacity="0.35" />
      <line x1="4" y1={cy} x2="164" y2={cy} stroke="var(--md-outline)" strokeWidth="2" />
      <path d={`M 4 ${cy + 8} Q 44 ${cy + 3} 84 ${cy + 8} T 164 ${cy + 8}`} stroke="var(--md-tertiary)" strokeWidth="2" fill="none" opacity="0.7" />
      <line x1={cx} y1={cy} x2={ex} y2={ey} stroke="var(--md-primary)" strokeWidth="4" strokeLinecap="round" />
      <circle cx={cx} cy={cy} r="6" fill="var(--md-primary)" />
      <text x="150" y="30" textAnchor="end" fill="var(--md-on-surface)" fontSize="28" fontWeight="500">
        {deg}°
      </text>
    </svg>
  );
}

export default function AimPanel({ elevation, onChange, onBack, onConfirm }: Props) {
  const hint =
    elevation <= 4
      ? "とても低い。水面すれすれを狙う投げ方"
      : elevation <= 14
        ? "低めの角度。浅く入水しやすい"
        : elevation <= 24
          ? "やや高め。良い石でないと沈みやすい"
          : "高すぎる。急角度で入水し沈みやすい";
  return (
    <section className="sheet surface" aria-label="投げる角度">
      <SheetHeader icon={<Triangle size={20} />} title="地面との角度を決める" step="3 / 4">
        浅い角度で水面に入るほど、石はよく跳ねます
      </SheetHeader>
      <div className="aim-layout">
        <Dial deg={elevation} />
        <div className="field" style={{ width: "100%" }}>
          <div className="field__head">
            <span className="label-l">投げ出す角度</span>
            <span className="body-m muted">{hint}</span>
          </div>
          <Slider value={elevation} min={0} max={ELEVATION_MAX} onChange={onChange} label="地面との角度" valueText={`${elevation}度`} />
          <div className="scale-labels body-s">
            <span>0°</span>
            <span>
              <kbd>↑</kbd> <kbd>↓</kbd> で調整
            </span>
            <span>{ELEVATION_MAX}°</span>
          </div>
        </div>
      </div>
      <div className="sheet__actions">
        <button className="btn btn--text grow" onClick={onBack}>
          場所を変える
        </button>
        <button className="btn btn--filled" onClick={onConfirm}>
          この角度で構える
        </button>
      </div>
    </section>
  );
}
