import { clamp, createRng, gaussian, randomSeed, range } from "./rng";
import type { Conditions, StageDef, Weather } from "./types";

function waveAmpFor(weather: Weather, windSpeed: number) {
  return 0.5 + windSpeed * 0.32 + (weather === "rainy" ? 1.8 : weather === "cloudy" ? 0.3 : 0);
}

/** ステージに入るたびの天候・風・流れ。雨の日は風も流れも強くなりやすい */
export function rollConditions(stage: StageDef, seed = randomSeed()): Conditions {
  const rng = createRng(seed);
  const r = rng();
  const weather: Weather = r < stage.rainChance ? "rainy" : r < stage.rainChance + stage.cloudChance ? "cloudy" : "sunny";

  const windFactor = weather === "rainy" ? range(rng, 1.4, 2.8) : weather === "cloudy" ? range(rng, 0.6, 1.6) : range(rng, 0.2, 1.2);
  const windSpeed = clamp(stage.baseWind * windFactor, 0, 14);
  const currentFactor = weather === "rainy" ? range(rng, 1.5, 2.3) : weather === "cloudy" ? range(rng, 0.9, 1.3) : range(rng, 0.8, 1.15);

  return {
    weather,
    windSpeed,
    windDir: rng() * Math.PI * 2,
    currentBase: stage.baseCurrent * currentFactor,
    currentPhase: rng() * Math.PI * 2,
    waveAmp: waveAmpFor(weather, windSpeed),
  };
}

/** 一投ごとに風が少し変わる（突風・風向きの揺らぎ） */
export function driftConditions(stage: StageDef, c: Conditions, seed = randomSeed()): Conditions {
  const rng = createRng(seed);
  const gust = c.weather === "rainy" ? 1.6 : 0.8;
  const windSpeed = clamp(c.windSpeed + gaussian(rng) * gust, 0, Math.max(14, stage.baseWind * 3));
  return {
    ...c,
    windSpeed,
    windDir: c.windDir + gaussian(rng) * 0.25,
    waveAmp: waveAmpFor(c.weather, windSpeed),
  };
}

export const WEATHER_LABEL: Record<Weather, string> = {
  sunny: "晴れ",
  cloudy: "くもり",
  rainy: "雨",
};

/** 投げる向きに対する風の種類 */
export function describeWindRelative(windDir: number, throwDir: number): string {
  const rel = windDir - throwDir;
  const along = Math.cos(rel);
  // 正 = 左から右へ吹く
  const cross = Math.sin(rel);
  const side = cross > 0 ? "左から" : "右から";
  if (along > 0.87) return "追い風";
  if (along < -0.87) return "向かい風";
  if (Math.abs(cross) > 0.87) return `横風（${side}）`;
  return along > 0 ? `斜め追い風（${side}）` : `斜め向かい風（${side}）`;
}
