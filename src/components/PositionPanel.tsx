"use client";

import { ChevronLeft, ChevronRight, Footprints } from "lucide-react";
import { MOVE_RANGE } from "@/game/stages";
import { Slider, SheetHeader } from "./ui";
import { currentLabel } from "./TopBar";

interface Props {
  x: number;
  yaw: number;
  localCurrent: number;
  onMove: (x: number) => void;
  onYaw: (yaw: number) => void;
  onBack: () => void;
  onConfirm: () => void;
}

export const YAW_LIMIT = 50;

export default function PositionPanel({ x, yaw, localCurrent, onMove, onYaw, onBack, onConfirm }: Props) {
  const yawText = Math.abs(yaw) < 1 ? "正面（対岸へ）" : yaw > 0 ? `下流側へ ${yaw}°` : `上流側へ ${-yaw}°`;
  return (
    <section className="sheet surface" aria-label="投げる場所">
      <SheetHeader icon={<Footprints size={22} />} title="投げる場所を決める" step="2 / 4">
        川岸を歩いて、流れや向きを見ながら立ち位置を決めます
      </SheetHeader>

      <div className="field">
        <div className="field__head">
          <span className="label-l">立ち位置</span>
          <span className="body-m muted">
            {x === 0 ? "石を拾った場所" : x > 0 ? `下流へ ${x}m` : `上流へ ${-x}m`}・流れ {currentLabel(localCurrent)}
          </span>
        </div>
        <div className="slider-row">
          <button className="icon-btn icon-btn--tonal" onClick={() => onMove(Math.max(-MOVE_RANGE, x - 2))} aria-label="上流へ移動">
            <ChevronLeft size={22} />
          </button>
          <Slider value={x} min={-MOVE_RANGE} max={MOVE_RANGE} onChange={onMove} label="立ち位置" valueText={`${x}m`} />
          <button className="icon-btn icon-btn--tonal" onClick={() => onMove(Math.min(MOVE_RANGE, x + 2))} aria-label="下流へ移動">
            <ChevronRight size={22} />
          </button>
        </div>
        <div className="scale-labels body-s">
          <span>上流</span>
          <span>
            <kbd>←</kbd> <kbd>→</kbd> で移動
          </span>
          <span>下流</span>
        </div>
      </div>

      <div className="field">
        <div className="field__head">
          <span className="label-l">投げる向き</span>
          <span className="body-m muted">{yawText}</span>
        </div>
        <Slider value={yaw} min={-YAW_LIMIT} max={YAW_LIMIT} onChange={onYaw} label="投げる向き" valueText={yawText} />
        <div className="scale-labels body-s">
          <span>上流側</span>
          <span>
            <kbd>A</kbd> <kbd>D</kbd> で向きを変更
          </span>
          <span>下流側</span>
        </div>
      </div>

      <div className="sheet__actions">
        <button className="btn btn--text grow" onClick={onBack}>
          石を選び直す
        </button>
        <button className="btn btn--filled" onClick={onConfirm}>
          ここから投げる
        </button>
      </div>
    </section>
  );
}
