export type StageId = "mountain-stream" | "great-river" | "misty-gorge";

export type Weather = "sunny" | "cloudy" | "rainy";

export type TreeKind = "conifer" | "broadleaf" | "mixed";

export interface StageDef {
  id: StageId;
  name: string;
  subtitle: string;
  description: string;
  /** 川幅の半分 [m] */
  riverHalfWidth: number;
  meanderAmp: number;
  meanderFreq: number;
  /** 基本の流速 [m/s] */
  baseCurrent: number;
  /** 場所による流速の変化量（0〜1） */
  currentVariation: number;
  /** 基本の風速 [m/s] */
  baseWind: number;
  rainChance: number;
  cloudChance: number;
  maxStones: number;
  initialStones: number;
  /** 追加ボタン1回で追加される石の数 */
  addBatch: number;
  sunElevation: number;
  sunAzimuth: number;
  beachWidth: number;
  bankHeight: number;
  bankSteepness: number;
  hillAmp: number;
  mountainAmp: number;
  treeKind: TreeKind;
  treeCount: number;
  palette: {
    grass: [number, number, number];
    dryGrass: [number, number, number];
    gravel: [number, number, number];
    rock: [number, number, number];
    riverbed: [number, number, number];
    forest: [number, number, number];
  };
  waterColor: number;
  fogColor: [number, number, number];
}

export interface Conditions {
  weather: Weather;
  /** 風速 [m/s] */
  windSpeed: number;
  /** 風が吹いていく向き（xz平面、+x=0rad、+z=π/2） */
  windDir: number;
  /** 川の基本流速 [m/s]（+x 方向へ流れる） */
  currentBase: number;
  currentPhase: number;
  /** 水面の波立ち（着水角のばらつき、度） */
  waveAmp: number;
}

export interface StoneSpec {
  id: string;
  /** 河原の種と組み合わせると石の性質を再現できる番号（サーバーでの記録の検証に使う） */
  serial: number;
  seed: number;
  /** 長径 [cm] */
  length: number;
  /** 短径 [cm] */
  width: number;
  /** 厚み [cm] */
  thickness: number;
  /** 底面の平らさ 0〜1 */
  flatness: number;
  /** 形のいびつさ 0〜1（0 で滑らかな円・楕円） */
  irregularity: number;
  /** 重さ [g] */
  mass: number;
  color: [number, number, number];
  /** 河原上の配置 */
  x: number;
  z: number;
  rotY: number;
}

export interface StoneQuality {
  flat: number;
  thin: number;
  round: number;
  weight: number;
  total: number;
}

export interface ThrowInput {
  stone: StoneSpec;
  conditions: Conditions;
  stage: StageDef;
  /** 投げる位置（川岸に沿った x 座標） */
  originX: number;
  /** 地面との角度 [度] */
  elevationDeg: number;
  /** 水平方向の向き [度]（0 = 対岸へ真っすぐ、+ = 下流側） */
  yawDeg: number;
  /** ゲージ合計（0〜3000） */
  power: number;
  /** 投擲の乱数の種（当たり外れ・炎・ブレ・水面の乱れ）。オンラインではサーバーだけが知る鍵から投げた瞬間に決まる */
  seed: number;
}

export interface TrajectorySample {
  t: number;
  x: number;
  y: number;
  z: number;
}

export interface BounceEvent {
  t: number;
  x: number;
  z: number;
  speed: number;
  index: number;
}

export type EndReason = "sank" | "too-steep" | "too-slow" | "far-bank";

export interface ThrowResult {
  samples: TrajectorySample[];
  bounces: BounceEvent[];
  endT: number;
  endReason: EndReason;
  distance: number;
  releaseSpeed: number;
  /** 炎の石（まれに出る。跳ねる回数が予定の 2 倍になる） */
  fire: boolean;
}

export interface ScoreRecord {
  id?: string;
  player_name: string;
  stage_id: StageId;
  bounces: number;
  distance: number;
  weather: Weather;
  created_at?: string;
}
