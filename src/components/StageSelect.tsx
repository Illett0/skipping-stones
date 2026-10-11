"use client";

import { ChevronRight, CloudRain, Database, Disc, HardDrive, MoveHorizontal, Trophy, WavesHorizontal } from "lucide-react";
import { useCallback, useState } from "react";
import { STAGES } from "@/game/stages";
import type { StageDef, StageId } from "@/game/types";
import { isOnline } from "@/lib/scores";
import RankingDialog from "./RankingDialog";

interface Props {
  best: Partial<Record<StageId, number>>;
  onSelect: (id: StageId) => void;
}

const ART: Record<StageId, { sky: [string, string]; far: string; near: string; water: string; sun: string }> = {
  "mountain-stream": { sky: ["#9cc7e6", "#e3eef3"], far: "#6f8f8f", near: "#2f4a35", water: "#5f8d93", sun: "#fff6d8" },
  "great-river": { sky: ["#f0a36c", "#f6d3a2"], far: "#9c6f6a", near: "#4a4a2f", water: "#c98e6c", sun: "#ffe0a8" },
  "misty-gorge": { sky: ["#8c979d", "#c7cdcf"], far: "#6c7472", near: "#3b4542", water: "#5e7372", sun: "#e8ecee" },
};

function StageArt({ stage }: { stage: StageDef }) {
  const a = ART[stage.id];
  const gid = `sky-${stage.id}`;
  const gorge = stage.id === "misty-gorge";
  return (
    <div className="stage-card__art" aria-hidden>
      <svg viewBox="0 0 320 96" preserveAspectRatio="xMidYMid slice">
        <defs>
          <linearGradient id={gid} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0" stopColor={a.sky[0]} />
            <stop offset="1" stopColor={a.sky[1]} />
          </linearGradient>
        </defs>
        <rect width="320" height="96" fill={`url(#${gid})`} />
        <circle cx={stage.id === "great-river" ? 70 : 250} cy={stage.id === "great-river" ? 58 : 26} r="12" fill={a.sun} opacity={gorge ? 0.35 : 0.9} />
        <path
          d={gorge ? "M0 70 L0 6 L50 20 L80 62 L240 62 L270 14 L320 4 L320 70 Z" : "M0 66 L40 38 L80 52 L130 24 L180 48 L230 30 L280 46 L320 34 L320 70 Z"}
          fill={a.far}
          opacity="0.85"
        />
        <path d="M0 72 L60 60 L120 66 L200 58 L260 66 L320 60 L320 80 L0 80 Z" fill={a.near} />
        <path d="M0 76 C80 70 240 70 320 76 L320 96 L0 96 Z" fill={a.water} />
        <path d="M30 84 Q60 80 90 84 M150 88 Q190 84 230 88 M250 82 Q280 79 305 82" stroke="#fff" strokeOpacity="0.5" strokeWidth="1.5" fill="none" />
        {gorge &&
          Array.from({ length: 26 }, (_, i) => (
            <line key={i} x1={i * 13} y1={0} x2={i * 13 - 6} y2={96} stroke="#fff" strokeOpacity="0.18" strokeWidth="1" />
          ))}
      </svg>
    </div>
  );
}

const STEPS = ["河原で石を選ぶ", "投げる場所と向きを決める", "地面との角度を決める", "ゲージを3回止めて力を溜める", "跳ねた回数を競う"];

export default function StageSelect({ best, onSelect }: Props) {
  const online = isOnline();
  const [rankingStage, setRankingStage] = useState<StageDef | null>(null);
  const closeRanking = useCallback(() => setRankingStage(null), []);
  return (
    <div className="title-screen">
      <div className="brand">
        <div className="brand__mark">
          <WavesHorizontal size={34} />
        </div>
        <h1 className="display-m" style={{ margin: 0 }}>
          水切り
        </h1>
        <p className="body-l" style={{ margin: 0, opacity: 0.9 }}>
          石を選び、川面を何回跳ねさせられるか
        </p>
      </div>

      <div className="stage-grid" role="list">
        {STAGES.map((s) => (
          <div key={s.id} role="listitem" className="stage-card-wrap">
          <button className="stage-card" onClick={() => onSelect(s.id)} aria-label={`${s.name}で遊ぶ`}>
            <StageArt stage={s} />
            <div>
              <div className="title-l">{s.name}</div>
              <div className="body-m muted">{s.subtitle}</div>
            </div>
            <p className="body-m" style={{ margin: 0 }}>
              {s.description}
            </p>
            <div className="stage-card__tags">
              <span className="tag">
                <MoveHorizontal size={14} />
                川幅 約{Math.round(s.riverHalfWidth * 2)}m
              </span>
              <span className="tag">
                <WavesHorizontal size={14} />
                流れ {s.baseCurrent < 1 ? "穏やか" : s.baseCurrent < 1.5 ? "ふつう" : "速い"}
              </span>
              <span className="tag">
                <CloudRain size={14} />
                雨 {Math.round(s.rainChance * 100)}%
              </span>
              <span className="tag">
                <Disc size={14} />
                石 最大{s.maxStones}個
              </span>
            </div>
            <div className="stage-card__cta">
              <span className="best-line body-m">
                <Trophy size={16} />
                {best[s.id] !== undefined ? `ベスト ${best[s.id]} 回` : "記録なし"}
              </span>
              <span className="label-l" style={{ display: "inline-flex", alignItems: "center", gap: 2 }}>
                この川へ <ChevronRight size={18} />
              </span>
            </div>
          </button>
          {/* カードのボタンの中にボタンは置けないので、カードの右上に重ねる */}
          <button className="btn btn--tonal stage-card__ranking" onClick={() => setRankingStage(s)} aria-label={`${s.name}のランキングを見る`}>
            <Trophy size={16} />
            ランキング
          </button>
          </div>
        ))}
      </div>
      {rankingStage && <RankingDialog stage={rankingStage} onClose={closeRanking} />}

      <section className="howto surface" aria-label="遊び方">
        {STEPS.map((t, i) => (
          <div key={t} className="howto__step">
            <span className="howto__num">{i + 1}</span>
            <span className="body-m">{t}</span>
          </div>
        ))}
      </section>

      <p className="footer-note body-s">
        {online ? <Database size={14} /> : <HardDrive size={14} />}
        {online ? "ランキングはオンライン（Supabase）に保存されます" : "ランキングはこの端末に保存されます"}
      </p>
    </div>
  );
}
