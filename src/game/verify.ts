import { driftConditions, rollConditions } from "./conditions";
import { MAX_GAUGE_PER_ROUND, GAUGE_ROUNDS, simulateThrow, THROW_LIMITS } from "./physics";
import { deriveSeed } from "./rng";
import { MOVE_RANGE } from "./stages";
import { ADD_SERIAL_BASE, stoneFromSerial } from "./stones";
import type { Conditions, StageDef, Weather } from "./types";

/** ランキングに表示・記録できる順位（この順位以内に入った記録だけ保存する） */
export const RANKING_SIZE = 5;

/** ランキングの集計開始時刻。これより前の記録は表示も順位の比較もしない（記録自体は消さない） */
export const RANKING_SINCE = "2026-10-11T03:25:00Z";

/** 今の上位（跳ねた回数 → 飛距離の順に並んだもの）に入れるか。最下位と同じ記録では入れない */
export function entersTopRanking(top: { bounces: number; distance: number }[], bounces: number, distance: number): boolean {
  if (top.length < RANKING_SIZE) return true;
  const last = top[RANKING_SIZE - 1];
  const round = (d: number) => Math.round(d * 10) / 10;
  return bounces > last.bounces || (bounces === last.bounces && round(distance) > round(last.distance));
}

/**
 * 1 回のプレイ（ステージに入ってから出るまで）の乱数の種。
 * オンライン時はサーバーが発行・署名し、河原の石・天候・投擲の揺らぎをすべてここから決める。
 */
export interface PlaySeeds {
  fieldSeed: number;
  condSeed: number;
}

/** 記録のためにサーバーへ送る「どう投げたか」。跳ねた回数は送らない */
export interface ThrowSubmission {
  stoneSerial: number;
  throwIndex: number;
  originX: number;
  elevationDeg: number;
  yawDeg: number;
  gauge: number[];
}

/** throwIndex 回目の投擲時の天候（1 投ごとに決まった種で風が変わる） */
export function conditionsAt(stage: StageDef, condSeed: number, throwIndex: number): Conditions {
  let c = rollConditions(stage, condSeed);
  for (let j = 0; j < throwIndex; j++) c = driftConditions(stage, c, deriveSeed(condSeed, j));
  return c;
}

export const driftSeed = (condSeed: number, throwIndex: number) => deriveSeed(condSeed, throwIndex);
export const throwSeed = (condSeed: number, throwIndex: number) => deriveSeed(condSeed, 500_000 + throwIndex);

const isInt = (v: unknown, min: number, max: number): v is number => Number.isInteger(v) && (v as number) >= min && (v as number) <= max;
const isNum = (v: unknown, min: number, max: number): v is number =>
  typeof v === "number" && Number.isFinite(v) && v >= min && v <= max;

/** 送られてきた投擲が、ゲーム内で実際に可能な範囲か */
export function validateSubmission(stage: StageDef, s: ThrowSubmission): string | null {
  const serialOk =
    isInt(s.stoneSerial, 0, stage.initialStones - 1) || isInt(s.stoneSerial, ADD_SERIAL_BASE, ADD_SERIAL_BASE + 10_000_000);
  if (!serialOk) return "石が不正です";
  if (!isInt(s.throwIndex, 0, 100_000)) return "投擲番号が不正です";
  if (!isNum(s.originX, -MOVE_RANGE, MOVE_RANGE)) return "立ち位置が不正です";
  if (!isNum(s.elevationDeg, 0, THROW_LIMITS.elevationMax)) return "角度が不正です";
  if (!isNum(s.yawDeg, -THROW_LIMITS.yaw, THROW_LIMITS.yaw)) return "向きが不正です";
  if (!Array.isArray(s.gauge) || s.gauge.length !== GAUGE_ROUNDS || !s.gauge.every((g) => isInt(g, 0, MAX_GAUGE_PER_ROUND)))
    return "ゲージが不正です";
  return null;
}

/** 種と投げ方から投擲をやり直して、跳ねた回数を求める（ブラウザとサーバーで同じ計算） */
export function replayThrow(stage: StageDef, seeds: PlaySeeds, s: ThrowSubmission): { bounces: number; distance: number; weather: Weather } {
  const conditions = conditionsAt(stage, seeds.condSeed, s.throwIndex);
  const result = simulateThrow({
    stone: stoneFromSerial(seeds.fieldSeed, s.stoneSerial),
    conditions,
    stage,
    originX: s.originX,
    elevationDeg: s.elevationDeg,
    yawDeg: s.yawDeg,
    power: s.gauge.reduce((a, b) => a + b, 0),
    seed: throwSeed(seeds.condSeed, s.throwIndex),
  });
  return { bounces: result.bounces.length, distance: result.distance, weather: conditions.weather };
}
