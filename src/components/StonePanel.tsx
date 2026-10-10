"use client";

import { ChevronLeft, ChevronRight, Footprints, Hand, MousePointerClick, Plus, ZoomOut } from "lucide-react";
import { describeBottom, describeShape, describeThickness, describeWeight, stoneQuality } from "@/game/stones";
import type { StageDef, StoneSpec } from "@/game/types";
import { Meter, SheetHeader } from "./ui";

interface Props {
  stage: StageDef;
  stones: StoneSpec[];
  shown: StoneSpec | null;
  selected: StoneSpec | null;
  x: number;
  /** 歩く向き（-1 上流 / 0 止まる / 1 下流） */
  onWalk: (dir: number) => void;
  canAdd: boolean;
  onAdd: () => void;
  onConfirm: () => void;
  /** 選択を解除して引きの視点に戻る */
  onZoomOut: () => void;
}

/** 押している間だけ歩くボタン */
const hold = (onWalk: (dir: number) => void, dir: number) => ({
  onPointerDown: () => onWalk(dir),
  onPointerUp: () => onWalk(0),
  onPointerLeave: () => onWalk(0),
  onPointerCancel: () => onWalk(0),
});

export default function StonePanel({ stage, stones, shown, selected, x, onWalk, canAdd, onAdd, onConfirm, onZoomOut }: Props) {
  const q = shown ? stoneQuality(shown) : null;
  const remainingRoom = stage.maxStones - stones.length;
  return (
    <section className="sheet surface" aria-label="石を選ぶ">
      <SheetHeader icon={<Hand size={22} />} title="石を選ぶ" step="1 / 4">
        平たく、薄く、丸みがあって、ほどよい重さの石がよく跳ねます
      </SheetHeader>

      <div className="slider-row" style={{ marginBottom: 8 }}>
        <button className="icon-btn icon-btn--tonal" {...hold(onWalk, -1)} aria-label="上流へ歩く（長押し）">
          <ChevronLeft size={22} />
        </button>
        <span className="body-m" style={{ flex: 1, display: "inline-flex", justifyContent: "center", alignItems: "center", gap: 6 }}>
          <Footprints size={16} />
          {Math.round(x) === 0 ? "スタート地点" : x > 0 ? `下流へ ${Math.round(x)}m` : `上流へ ${-Math.round(x)}m`}
        </span>
        <button className="icon-btn icon-btn--tonal" {...hold(onWalk, 1)} aria-label="下流へ歩く（長押し）">
          <ChevronRight size={22} />
        </button>
      </div>
      <div className="scale-labels body-s" style={{ marginBottom: 8, justifyContent: "center" }}>
        <span>
          <kbd>←</kbd> <kbd>→</kbd>（<kbd>A</kbd> <kbd>D</kbd>）を押している間歩く・<kbd>Shift</kbd> で走る
        </span>
      </div>

      {shown && q ? (
        <div className="stone-info" aria-live="polite">
          <div className="stat">
            <div className="stat__row">
              <span className="body-m muted">薄さ</span>
              <span className="stat__value body-m">
                {describeThickness(shown)}・{shown.thickness.toFixed(1)}cm
              </span>
            </div>
            <Meter value={q.thin} label="薄さ" />
          </div>
          <div className="stat">
            <div className="stat__row">
              <span className="body-m muted">底面</span>
              <span className="stat__value body-m">{describeBottom(shown)}</span>
            </div>
            <Meter value={q.flat} label="底面の平らさ" />
          </div>
          <div className="stat">
            <div className="stat__row">
              <span className="body-m muted">形</span>
              <span className="stat__value body-m">
                {describeShape(shown)}・{shown.length.toFixed(1)}×{shown.width.toFixed(1)}cm
              </span>
            </div>
            <Meter value={q.round} label="丸み" />
          </div>
          <div className="stat">
            <div className="stat__row">
              <span className="body-m muted">重さ</span>
              <span className="stat__value body-m">
                {describeWeight(shown)}・{shown.mass}g
              </span>
            </div>
            <Meter value={q.weight} label="重さのちょうど良さ" />
          </div>
        </div>
      ) : (
        <div className="empty-hint body-m muted">
          <MousePointerClick size={20} />
          {stones.length > 0 ? "河原の石をクリック（タップ）して手に取ってみましょう" : "河原に石がありません。石を追加してください"}
        </div>
      )}

      <div className="sheet__actions">
        <div className="grow stock body-s muted">
          <button className="btn btn--tonal" onClick={onAdd} disabled={!canAdd} aria-describedby="add-hint">
            <Plus size={18} />
            石を追加（{stage.addBatch}個）
          </button>
          <span id="add-hint">
            {canAdd ? `残り ${stones.length} 個` : remainingRoom > 0 ? `あと${remainingRoom}個で上限` : "上限に達しています"}
          </span>
        </div>
        {selected && (
          <button className="btn btn--outlined" onClick={onZoomOut}>
            <ZoomOut size={18} />
            ズームアウト
          </button>
        )}
        <button className="btn btn--filled" onClick={onConfirm} disabled={!selected}>
          この石で投げる
        </button>
      </div>
    </section>
  );
}
