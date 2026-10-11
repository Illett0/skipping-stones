"use client";

import { Database, HardDrive, Trophy, X } from "lucide-react";
import { useEffect, useState } from "react";
import { WEATHER_LABEL } from "@/game/conditions";
import type { ScoreRecord, StageDef } from "@/game/types";
import { RANKING_SIZE } from "@/game/verify";
import { fetchTopScores, isOnline } from "@/lib/scores";

/** ステージ選択画面から開く、そのステージのランキング */
export default function RankingDialog({ stage, onClose }: { stage: StageDef; onClose: () => void }) {
  const [board, setBoard] = useState<ScoreRecord[] | null>(null);
  const online = isOnline();

  useEffect(() => {
    let alive = true;
    fetchTopScores(stage.id).then((r) => alive && setBoard(r));
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => {
      alive = false;
      window.removeEventListener("keydown", onKey);
    };
  }, [stage.id, onClose]);

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="ranking-title" onClick={onClose}>
      <div className="dialog" onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12 }}>
          <Trophy size={20} color="var(--md-primary)" />
          <h2 id="ranking-title" className="title-l" style={{ margin: 0 }}>
            {stage.name} ランキング
          </h2>
          <button className="icon-btn" style={{ marginLeft: "auto" }} onClick={onClose} aria-label="閉じる" autoFocus>
            <X size={22} />
          </button>
        </div>
        <div className="body-s muted" style={{ display: "flex", alignItems: "center", gap: 4, marginBottom: 8 }}>
          {online ? <Database size={14} /> : <HardDrive size={14} />}
          {online ? "オンライン" : "この端末"}・上位{RANKING_SIZE}件
        </div>
        {board === null ? (
          <p className="body-m muted">読み込み中…</p>
        ) : board.length === 0 ? (
          <p className="body-m muted">まだ記録がありません。最初の記録を残しましょう</p>
        ) : (
          <ol className="list">
            {board.map((r, i) => (
              <li key={r.id ?? i}>
                <span className={`rank ${i < 3 ? `rank--${i + 1}` : ""}`}>{i + 1}</span>
                <span className="list__main body-l">{r.player_name}</span>
                <span className="body-s muted">
                  {r.distance.toFixed(0)}m・{WEATHER_LABEL[r.weather]}
                </span>
                <span className="list__score title-m">{r.bounces}回</span>
              </li>
            ))}
          </ol>
        )}
      </div>
    </div>
  );
}
