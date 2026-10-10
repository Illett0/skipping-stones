import type { Conditions, StageDef, StageId } from "./types";

export const STAGES: StageDef[] = [
  {
    id: "mountain-stream",
    name: "山あいの清流",
    subtitle: "朝・針葉樹の谷",
    description: "流れは穏やかで水面も静か。初めての一投におすすめの川です。",
    riverHalfWidth: 30,
    meanderAmp: 6,
    meanderFreq: 0.006,
    baseCurrent: 0.7,
    currentVariation: 0.55,
    baseWind: 2.0,
    rainChance: 0.2,
    cloudChance: 0.3,
    maxStones: 20000,
    initialStones: 12500,
    addBatch: 100,
    sunElevation: 24,
    sunAzimuth: 120,
    beachWidth: 14,
    bankHeight: 4,
    bankSteepness: 14,
    hillAmp: 45,
    mountainAmp: 380,
    treeKind: "conifer",
    treeCount: 2600,
    palette: {
      grass: [0.22, 0.33, 0.12],
      dryGrass: [0.42, 0.42, 0.22],
      gravel: [0.6, 0.57, 0.52],
      rock: [0.42, 0.41, 0.39],
      riverbed: [0.24, 0.23, 0.17],
      forest: [0.1, 0.18, 0.09],
    },
    waterColor: 0x1b3d36,
    fogColor: [0.72, 0.8, 0.86],
  },
  {
    id: "great-river",
    name: "夕暮れの大河",
    subtitle: "夕方・広い河川敷",
    description: "川幅が広く、遠くまで投げられる。ただし風を受けやすい開けた地形。",
    riverHalfWidth: 85,
    meanderAmp: 18,
    meanderFreq: 0.003,
    baseCurrent: 1.1,
    currentVariation: 0.4,
    baseWind: 4.0,
    rainChance: 0.25,
    cloudChance: 0.35,
    maxStones: 20000,
    initialStones: 12500,
    addBatch: 100,
    sunElevation: 4,
    sunAzimuth: 250,
    beachWidth: 22,
    bankHeight: 3,
    bankSteepness: 26,
    hillAmp: 18,
    mountainAmp: 220,
    treeKind: "broadleaf",
    treeCount: 3000,
    palette: {
      grass: [0.24, 0.33, 0.12],
      dryGrass: [0.44, 0.43, 0.22],
      gravel: [0.6, 0.56, 0.5],
      rock: [0.46, 0.43, 0.4],
      riverbed: [0.26, 0.24, 0.18],
      forest: [0.1, 0.17, 0.07],
    },
    waterColor: 0x23382f,
    fogColor: [0.92, 0.72, 0.55],
  },
  {
    id: "misty-gorge",
    name: "霧の渓谷",
    subtitle: "雨が多い・岩壁の急流",
    description: "切り立った岩壁に囲まれた急流。雨が降りやすく、流れも風も強い上級者向け。",
    riverHalfWidth: 24,
    meanderAmp: 8,
    meanderFreq: 0.009,
    baseCurrent: 1.9,
    currentVariation: 0.5,
    baseWind: 3.5,
    rainChance: 0.55,
    cloudChance: 0.35,
    maxStones: 20000,
    initialStones: 12500,
    addBatch: 100,
    sunElevation: 34,
    sunAzimuth: 55,
    beachWidth: 10,
    bankHeight: 22,
    bankSteepness: 9,
    hillAmp: 70,
    mountainAmp: 520,
    treeKind: "mixed",
    treeCount: 2200,
    palette: {
      grass: [0.18, 0.28, 0.12],
      dryGrass: [0.34, 0.36, 0.2],
      gravel: [0.5, 0.5, 0.48],
      rock: [0.36, 0.36, 0.35],
      riverbed: [0.2, 0.21, 0.17],
      forest: [0.08, 0.15, 0.08],
    },
    waterColor: 0x1d3a37,
    fogColor: [0.7, 0.74, 0.76],
  },
];

export const getStage = (id: StageId): StageDef => STAGES.find((s) => s.id === id) ?? STAGES[0];

/** 川の中心線の z 座標 */
export const riverCenterZ = (stage: StageDef, x: number) => stage.meanderAmp * Math.sin(x * stage.meanderFreq);

/** 川幅の半分 */
export const riverHalfWidthAt = (stage: StageDef, x: number) =>
  stage.riverHalfWidth * (1 + 0.1 * Math.sin(x * 0.011 + 1.3));

/** 手前岸（+z 側）の水際の z 座標 */
export const nearEdgeZ = (stage: StageDef, x: number) => riverCenterZ(stage, x) + riverHalfWidthAt(stage, x);
export const farEdgeZ = (stage: StageDef, x: number) => riverCenterZ(stage, x) - riverHalfWidthAt(stage, x);

/** 水際からの符号付き距離（負 = 川の中） */
export const distanceFromWater = (stage: StageDef, x: number, z: number) =>
  Math.abs(z - riverCenterZ(stage, x)) - riverHalfWidthAt(stage, x);

/** その地点の川の流速 [m/s]（+x 方向） */
export function currentAt(stage: StageDef, cond: Conditions, x: number, z: number): number {
  const along = 1 + stage.currentVariation * Math.sin(x * 0.07 + cond.currentPhase);
  const hw = riverHalfWidthAt(stage, x);
  // 岸に近いほど遅く、中央ほど速い
  const across = Math.max(0, 1 - Math.pow(Math.abs(z - riverCenterZ(stage, x)) / hw, 2));
  return Math.max(0, cond.currentBase * along * (0.35 + 0.65 * across));
}

/** 移動できる範囲（川岸に沿った x） */
export const MOVE_RANGE = 40;
