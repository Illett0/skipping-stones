import { clamp, createRng, deriveSeed, randomSeed, range, smoothstep, type Rng } from "./rng";
import { MOVE_RANGE, nearEdgeZ } from "./stages";
import type { StageDef, StoneQuality, StoneSpec } from "./types";

/** 石を並べる河原の範囲（上流〜下流の移動範囲全体、手前岸の水際からの距離） */
/** grid: 最初に敷き詰めるときの間隔、spacing: 追加するときに他の石から離す距離 */
export const STONE_FIELD = { xMin: -MOVE_RANGE, xMax: MOVE_RANGE, dMin: 1.2, dMax: 3.6, spacing: 0.06, grid: 0.12 };

const STONE_COLORS: [number, number, number][] = [
  [0.52, 0.52, 0.5],
  [0.44, 0.43, 0.41],
  [0.6, 0.57, 0.52],
  [0.38, 0.39, 0.4],
  [0.55, 0.5, 0.44],
  [0.47, 0.49, 0.5],
  [0.33, 0.32, 0.31],
  [0.63, 0.61, 0.58],
];

let idCounter = 0;

/** 追加ボタンで増えた石の通し番号はここから始める（最初の石と重ならないように） */
export const ADD_SERIAL_BASE = 1_000_000;

export function generateStone(rng: Rng, x: number, z: number, serial = 0): StoneSpec {
  // 4個に1個くらいは「水切り向き」の平たい石が混ざる
  const skipper = rng() < 0.25;
  const length = skipper ? range(rng, 5, 9.5) : 4.5 + Math.pow(rng(), 1.4) * 8;
  const aspect = skipper ? range(rng, 0.6, 1.0) : range(rng, 0.45, 1.0);
  const width = length * aspect;
  const thicknessRatio = skipper ? range(rng, 0.1, 0.22) : 0.1 + Math.pow(rng(), 1.5) * 0.5;
  const thickness = Math.max(0.6, length * thicknessRatio);
  const flatness = skipper ? range(rng, 0.55, 1) : Math.pow(rng(), 0.85);
  const irregularity = skipper ? range(rng, 0, 0.4) : Math.pow(rng(), 1.15);
  const density = range(rng, 2.5, 2.8);
  const fill = 0.92 + 0.22 * flatness - 0.12 * irregularity;
  const volume = (Math.PI / 6) * length * width * thickness * fill;
  const mass = Math.round(volume * density);
  const base = STONE_COLORS[Math.floor(rng() * STONE_COLORS.length)];
  const tint = range(rng, -0.05, 0.05);
  const color: [number, number, number] = [
    clamp(base[0] + tint + range(rng, -0.02, 0.02), 0, 1),
    clamp(base[1] + tint, 0, 1),
    clamp(base[2] + tint + range(rng, -0.02, 0.02), 0, 1),
  ];
  idCounter += 1;
  return {
    id: `stone-${Date.now().toString(36)}-${idCounter}`,
    serial,
    seed: Math.floor(rng() * 1e9),
    length,
    width,
    thickness,
    flatness,
    irregularity,
    mass,
    color,
    x,
    z,
    rotY: rng() * Math.PI * 2,
  };
}

/** 河原の種と通し番号から石を作る。位置以外の性質は (fieldSeed, serial) だけで決まる */
export function stoneFromSerial(fieldSeed: number, serial: number, x = 0, z = 0): StoneSpec {
  return generateStone(createRng(deriveSeed(fieldSeed, serial)), x, z, serial);
}

/** 河原の空いている場所を探す */
function findFreeSpot(stage: StageDef, rng: Rng, existing: StoneSpec[], nearX?: number): { x: number; z: number } | null {
  // nearX を渡すとその周り（±8m）に置く。石が多いので近くの石だけと重なりを調べる
  const xMin = nearX === undefined ? STONE_FIELD.xMin : Math.max(STONE_FIELD.xMin, nearX - 8);
  const xMax = nearX === undefined ? STONE_FIELD.xMax : Math.min(STONE_FIELD.xMax, nearX + 8);
  if (nearX !== undefined) existing = existing.filter((s) => s.x > xMin - 1 && s.x < xMax + 1);
  for (let attempt = 0; attempt < 200; attempt++) {
    const x = range(rng, xMin, xMax);
    const d = range(rng, STONE_FIELD.dMin, STONE_FIELD.dMax);
    const z = nearEdgeZ(stage, x) + d;
    const ok = existing.every((s) => Math.hypot(s.x - x, s.z - z) > STONE_FIELD.spacing);
    if (ok) return { x, z };
  }
  return null;
}

export function spawnStones(
  stage: StageDef,
  count: number,
  existing: StoneSpec[] = [],
  seed = randomSeed(),
  nearX?: number,
  serialBase = 0,
): StoneSpec[] {
  // 置き場所の乱数と、石そのものの乱数（通し番号ごと）は分けておく
  const rng = createRng(deriveSeed(seed, -1 - serialBase));
  const result: StoneSpec[] = [];
  // 最初は地面が見えなくなるくらい格子状に敷き詰める（少しずらして自然に）
  if (existing.length === 0 && nearX === undefined) {
    const g = STONE_FIELD.grid;
    const cells: [number, number][] = [];
    for (let x = STONE_FIELD.xMin; x < STONE_FIELD.xMax; x += g) for (let d = STONE_FIELD.dMin; d < STONE_FIELD.dMax; d += g) cells.push([x, d]);
    for (let i = cells.length - 1; i > 0; i--) {
      const j = Math.floor(rng() * (i + 1));
      [cells[i], cells[j]] = [cells[j], cells[i]];
    }
    cells.slice(0, count).forEach(([cx, cd], i) => {
      const x = cx + range(rng, -0.3, 0.3) * g;
      result.push(stoneFromSerial(seed, serialBase + i, x, nearEdgeZ(stage, x) + cd + range(rng, -0.3, 0.3) * g));
    });
    return result;
  }
  for (let i = 0; i < count; i++) {
    const spot = findFreeSpot(stage, rng, [...existing, ...result], nearX);
    if (!spot) break;
    result.push(stoneFromSerial(seed, serialBase + i, spot.x, spot.z));
  }
  return result;
}

/** 追加ボタンが使えるか（追加すると上限を超える場合は不可） */
export function canAddStones(stage: StageDef, currentCount: number): boolean {
  return currentCount + stage.addBatch <= stage.maxStones;
}

export function stoneQuality(s: StoneSpec): StoneQuality {
  const ratio = s.thickness / s.length;
  const thin = 1 - smoothstep(0.13, 0.46, ratio);
  const flat = Math.pow(s.flatness, 0.9);
  const aspect = s.width / s.length;
  const elongPenalty = aspect >= 0.55 ? 1 : 0.7 + (aspect - 0.45) * 3;
  const round = clamp((1 - s.irregularity) * elongPenalty, 0, 1);
  const weight = Math.exp(-Math.pow(Math.log(s.mass / 110) / 0.7, 2));
  const total = 0.28 * thin + 0.25 * flat + 0.25 * round + 0.22 * weight;
  return { flat, thin, round, weight, total };
}

export function describeThickness(s: StoneSpec): string {
  const r = s.thickness / s.length;
  if (r < 0.17) return "とても薄い";
  if (r < 0.26) return "薄い";
  if (r < 0.38) return "ふつう";
  return "分厚い";
}

export function describeBottom(s: StoneSpec): string {
  if (s.flatness > 0.75) return "平ら";
  if (s.flatness > 0.45) return "やや平ら";
  if (s.flatness > 0.2) return "少し凸凹";
  return "丸く凸凹";
}

export function describeShape(s: StoneSpec): string {
  const aspect = s.width / s.length;
  if (s.irregularity > 0.6) return "いびつ";
  if (s.irregularity > 0.35) return aspect > 0.8 ? "やや角ばった円形" : "やや角ばった楕円";
  if (aspect > 0.82) return "円形";
  if (aspect > 0.55) return "楕円";
  return "細長い";
}

export function describeWeight(s: StoneSpec): string {
  if (s.mass < 45) return "軽すぎる";
  if (s.mass < 75) return "やや軽い";
  if (s.mass <= 170) return "手になじむ";
  if (s.mass <= 260) return "やや重い";
  return "重すぎる";
}
