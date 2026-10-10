import { fbm2, smoothstep } from "./rng";
import { distanceFromWater, riverCenterZ } from "./stages";
import type { StageDef } from "./types";

/** 地形の高さ（水面 = 0）。描画と物理の両方で使う */
export function terrainHeight(stage: StageDef, x: number, z: number): number {
  const d = distanceFromWater(stage, x, z);
  const far = z < riverCenterZ(stage, x);
  const detail = fbm2(x * 0.35, z * 0.35, 3, 7) * 0.06;

  if (d < 0) {
    // 川底
    const depth = 0.15 + Math.min(2.6, -d * 0.11);
    return -depth * smoothstep(0, 5, -d) - 0.04 + detail * 0.5 + fbm2(x * 0.05, z * 0.05, 3, 3) * 0.25;
  }

  const beachW = stage.beachWidth * (far ? 0.55 : 1) * (1 + 0.35 * fbm2(x * 0.015, far ? 3 : 9, 3, 11));
  let y = Math.min(d, beachW) * 0.034 + detail;

  const bankStart = beachW;
  // 土手の縁を不規則に（入り江や張り出し）
  const dB = d + fbm2(x * 0.03, z * 0.03, 3, 77) * stage.bankSteepness * 0.6;
  const bankT = smoothstep(bankStart, bankStart + stage.bankSteepness, dB);
  y += bankT * stage.bankHeight * (1 + 0.35 * fbm2(x * 0.02, z * 0.02, 4, 21));
  // 土手の凹凸
  y += bankT * fbm2(x * 0.12, z * 0.12, 3, 5) * 0.6;
  // 斜面・崖の表面の起伏（谷筋や岩の出っ張り）
  const face = bankT * (1 - bankT) * 4;
  y += face * fbm2(x * 0.09, z * 0.09, 4, 13) * stage.bankHeight * 0.22;

  const hillT = smoothstep(bankStart + stage.bankSteepness * 0.6, bankStart + stage.bankSteepness + 160, d);
  y += hillT * stage.hillAmp * (0.55 + 0.45 * fbm2(x * 0.006, z * 0.006, 5, 31));

  const mtT = smoothstep(180, 900, d);
  if (mtT > 0) {
    const ridge = 1 - Math.abs(fbm2(x * 0.0018, z * 0.0018, 6, 41));
    y += mtT * stage.mountainAmp * (0.35 + 0.65 * ridge * ridge);
  }
  return y;
}
