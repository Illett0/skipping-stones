"use client";

import { Check, Database, HardDrive, Info, Map as MapIcon, RotateCcw, Save, Sparkles, Trophy, WavesHorizontal } from "lucide-react";
import { useEffect, useState } from "react";
import { WEATHER_LABEL } from "@/game/conditions";
import type { EndReason, ScoreRecord, StageDef, Weather } from "@/game/types";
import { entersTopRanking, RANKING_SIZE, type ThrowSubmission } from "@/game/verify";
import { fetchTopScores, isOnline, loadPlayerName, saveScore, storePlayerName } from "@/lib/scores";

interface Props {
  stage: StageDef;
  bounces: number;
  distance: number;
  endReason: EndReason;
  weather: Weather;
  isNewBest: boolean;
  sessionBest: number;
  onRetry: () => void;
  onChangeStage: () => void;
  /** オンライン記録用（サーバーが投擲をやり直して検証する） */
  token: string | null;
  submission: ThrowSubmission;
}

const REASON: Record<EndReason, string> = {
  sank: "勢いが落ちて、石は川に沈みました",
  "too-steep": "入水の角度が急すぎて、すぐに沈んでしまいました",
  "too-slow": "勢いが足りず、水面で跳ねきれませんでした",
  "far-bank": "対岸まで届きました！",
};

export default function ResultDialog({ stage, bounces, distance, endReason, weather, isNewBest, sessionBest, onRetry, onChangeStage, token, submission }: Props) {
  const [name, setName] = useState("");
  const [saved, setSaved] = useState(false);
  const [saving, setSaving] = useState(false);
  const [board, setBoard] = useState<ScoreRecord[] | null>(null);
  const [savedId, setSavedId] = useState<string | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const online = isOnline();
  // ランキングの上位に入るときだけ記録できる
  const qualifies = board !== null && entersTopRanking(board, bounces, distance);

  useEffect(() => {
    setName(loadPlayerName());
    let alive = true;
    fetchTopScores(stage.id).then((r) => alive && setBoard(r));
    return () => {
      alive = false;
    };
  }, [stage.id]);

  const submit = async () => {
    const trimmed = name.trim().slice(0, 20);
    if (!trimmed || saving) return;
    setSaving(true);
    setSaveError(null);
    storePlayerName(trimmed);
    try {
      await saveScore({ player_name: trimmed, stage_id: stage.id, bounces, distance, weather }, token, submission);
    } catch (e) {
      setSaveError(e instanceof Error ? e.message : "記録に失敗しました");
      setSaving(false);
      return;
    }
    const top = await fetchTopScores(stage.id);
    setBoard(top);
    const mine = top.find((r) => r.player_name === trimmed && r.bounces === bounces && Math.abs(r.distance - distance) < 0.2);
    setSavedId(mine?.id ?? null);
    setSaved(true);
    setSaving(false);
  };

  return (
    <div className="scrim" role="dialog" aria-modal="true" aria-labelledby="result-title">
      <div className="dialog">
        <div className="dialog__hero">
          <div className="dialog__hero-icon">{endReason === "far-bank" ? <Sparkles size={28} /> : <WavesHorizontal size={28} />}</div>
          <div id="result-title" className="label-l muted">
            跳ねた回数
          </div>
          <div className="big-number">{bounces}</div>
          {isNewBest && bounces > 0 && (
            <span className="badge-new label-l">
              <Trophy size={16} /> 自己ベスト更新
            </span>
          )}
          <p className="body-m muted" style={{ margin: "8px 0 0" }}>
            {REASON[endReason]}
          </p>
        </div>

        <div className="result-stats">
          <div className="result-stat">
            <span className="body-s muted">飛距離</span>
            <span className="title-m">{distance.toFixed(1)} m</span>
          </div>
          <div className="result-stat">
            <span className="body-s muted">天気</span>
            <span className="title-m">{WEATHER_LABEL[weather]}</span>
          </div>
          <div className="result-stat">
            <span className="body-s muted">今回のベスト</span>
            <span className="title-m">{sessionBest} 回</span>
          </div>
        </div>

        {!saved && qualifies ? (
          <form
            onSubmit={(e) => {
              e.preventDefault();
              submit();
            }}
            style={{ display: "flex", gap: 8, alignItems: "center" }}
          >
            <label className="text-field" style={{ flex: 1 }}>
              <span className="sr-only">名前</span>
              <input value={name} maxLength={20} placeholder="名前を入力して記録" onChange={(e) => setName(e.target.value)} />
            </label>
            <button className="btn btn--tonal" type="submit" disabled={!name.trim() || saving}>
              <Save size={18} />
              {saving ? "保存中" : "記録する"}
            </button>
          </form>
        ) : null}
        {!saved && board !== null && !qualifies ? (
          <div className="empty-hint body-m muted">
            <Info size={20} />
            {RANKING_SIZE}位以内に入らなかったため、今回は記録できません
          </div>
        ) : null}
        {!saved && saveError ? (
          <p className="body-m" role="alert" style={{ color: "var(--md-error)", margin: "8px 0 0" }}>
            {saveError}
          </p>
        ) : null}
        {!saved ? null : (
          <div className="empty-hint body-m">
            <Check size={20} color="var(--md-primary)" />
            記録しました
          </div>
        )}

        <hr className="divider" />
        <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
          <Trophy size={18} color="var(--md-primary)" />
          <span className="title-m">{stage.name} ランキング</span>
          <span className="body-s muted" style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 4 }}>
            {online ? <Database size={14} /> : <HardDrive size={14} />}
            {online ? "オンライン" : "この端末"}
          </span>
        </div>
        {board === null ? (
          <p className="body-m muted">読み込み中…</p>
        ) : board.length === 0 ? (
          <p className="body-m muted">まだ記録がありません。最初の記録を残しましょう</p>
        ) : (
          <ol className="list">
            {board.map((r, i) => (
              <li key={r.id ?? i} className={r.id && r.id === savedId ? "me" : ""}>
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

        <div className="sheet__actions">
          <button className="btn btn--text grow" onClick={onChangeStage}>
            <MapIcon size={18} />
            ステージを変える
          </button>
          <button className="btn btn--filled" onClick={onRetry} autoFocus>
            <RotateCcw size={18} />
            もう一度投げる
          </button>
        </div>
      </div>
    </div>
  );
}
