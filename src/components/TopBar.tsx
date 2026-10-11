"use client";

import { ArrowLeft, ArrowUp, CircleQuestionMark, Cloud, CloudRain, Disc, Sun, Volume2, VolumeX, WavesHorizontal, Wind } from "lucide-react";
import { WEATHER_LABEL, describeWindRelative } from "@/game/conditions";
import type { Conditions, StageDef } from "@/game/types";

interface Props {
  stage: StageDef;
  conditions: Conditions;
  /** 投げる向き（xz 平面の角度、rad） */
  throwAngle: number;
  localCurrent: number;
  stoneCount: number;
  onBack: () => void;
  onHelp: () => void;
  muted: boolean;
  onToggleMute: () => void;
}

const WeatherIcon = ({ w }: { w: Conditions["weather"] }) =>
  w === "rainy" ? <CloudRain size={20} /> : w === "cloudy" ? <Cloud size={20} /> : <Sun size={20} />;

export function currentLabel(v: number) {
  if (v < 0.6) return "穏やか";
  if (v < 1.4) return "ふつう";
  if (v < 2.6) return "速い";
  return "激流";
}

export default function TopBar({ stage, conditions, throwAngle, localCurrent, stoneCount, onBack, onHelp, muted, onToggleMute }: Props) {
  const windRot = ((conditions.windDir - throwAngle) * 180) / Math.PI;
  const currentRot = ((0 - throwAngle) * 180) / Math.PI;
  const windText = describeWindRelative(conditions.windDir, throwAngle);
  return (
    <header className="top-bar">
      <div className="top-bar__title surface">
        <button className="icon-btn" onClick={onBack} aria-label="ステージ選択に戻る">
          <ArrowLeft size={22} />
        </button>
        <div>
          <div className="title-m">{stage.name}</div>
          <div className="body-s muted">{stage.subtitle}</div>
        </div>
      </div>
      <div className="top-bar__spacer" />
      <div className="chips" role="status" aria-live="polite">
        <span className={`chip surface ${conditions.weather === "rainy" ? "chip--rain" : ""}`} title="天気">
          <WeatherIcon w={conditions.weather} />
          <span className="label-l">{WEATHER_LABEL[conditions.weather]}</span>
        </span>
        <span className="chip surface" title={`風：${windText}`}>
          <Wind size={18} />
          <ArrowUp size={18} style={{ transform: `rotate(${windRot}deg)`, transition: "transform 400ms" }} aria-hidden />
          <span className="chip__value">{conditions.windSpeed.toFixed(1)} m/s</span>
          <span className="body-s muted">{windText}</span>
        </span>
        <span className="chip surface" title="この地点の川の流れ">
          <WavesHorizontal size={18} />
          <ArrowUp size={18} style={{ transform: `rotate(${currentRot}deg)`, transition: "transform 400ms" }} aria-hidden />
          <span className="chip__value">{localCurrent.toFixed(1)} m/s</span>
          <span className="body-s muted">{currentLabel(localCurrent)}</span>
        </span>
        <span className="chip surface" title="河原に残っている石">
          <Disc size={18} />
          <span className="chip__value">
            {stoneCount}/{stage.maxStones}
          </span>
        </span>
        <button className="icon-btn surface" onClick={onToggleMute} aria-label={muted ? "音を出す" : "音を消す"} aria-pressed={muted}>
          {muted ? <VolumeX size={20} /> : <Volume2 size={20} />}
        </button>
        <button className="icon-btn surface" onClick={onHelp} aria-label="遊び方">
          <CircleQuestionMark size={20} />
        </button>
      </div>
    </header>
  );
}
