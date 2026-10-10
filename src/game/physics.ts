import { clamp, createRng, gaussian, smoothstep } from "./rng";
import { currentAt, distanceFromWater, nearEdgeZ, riverCenterZ } from "./stages";
import { stoneQuality } from "./stones";
import { terrainHeight } from "./terrain";
import type { BounceEvent, EndReason, StageDef, ThrowInput, ThrowResult, TrajectorySample } from "./types";

export const MAX_GAUGE_PER_ROUND = 1000;
export const GAUGE_ROUNDS = 3;
export const MAX_POWER = MAX_GAUGE_PER_ROUND * GAUGE_ROUNDS;
/** 地面との角度の上限 [度] と、投げる向きの左右の上限 [度]（UI とサーバーの検証で共通） */
export const THROW_LIMITS = { elevationMax: 45, yaw: 50 };

const G = 9.81;
const AIR_DENSITY = 1.2;
const DT = 1 / 240;
const SAMPLE_EVERY = 4; // 60Hz で記録
const DEG = Math.PI / 180;

/** 投げる人の立ち位置（川岸の水際から少し陸側） */
export function throwerPosition(stage: StageDef, x: number) {
  const z = nearEdgeZ(stage, x) + 0.7;
  const ground = terrainHeight(stage, x, z);
  return { x, z, ground };
}

/** 投げ出す点（サイドスローなので腰の高さ） */
export function releasePoint(stage: StageDef, x: number) {
  const p = throwerPosition(stage, x);
  return { x: p.x, y: p.ground + 1.05, z: p.z - 0.3 };
}

/** 投げる向き（水平単位ベクトル）。yaw 0 で対岸（-z）へ、+ で下流（+x）側 */
export function throwDirection(yawDeg: number) {
  const yaw = yawDeg * DEG;
  return { x: Math.sin(yaw), z: -Math.cos(yaw) };
}

/** 初速 [m/s]。ゲージ量と石の重さで決まる */
export function releaseSpeed(power: number, massG: number) {
  const p = clamp(power / MAX_POWER, 0, 1);
  const massFactor = clamp(Math.pow(110 / massG, 0.15), 0.78, 1.1);
  return (6 + 24 * Math.pow(p, 0.9)) * massFactor;
}

export function simulateThrow(input: ThrowInput): ThrowResult {
  const { stone, conditions: cond, stage } = input;
  const rng = createRng(input.seed);
  const q = stoneQuality(stone);
  const Q = q.total;
  const m = stone.mass / 1000;

  const start = releasePoint(stage, input.originX);
  const dir = throwDirection(input.yawDeg);
  const v0 = releaseSpeed(input.power, stone.mass);
  const el = input.elevationDeg * DEG;

  let px = start.x;
  let py = start.y;
  let pz = start.z;
  let vx = dir.x * Math.cos(el) * v0;
  let vy = Math.sin(el) * v0;
  let vz = dir.z * Math.cos(el) * v0;

  // 平たく飛ぶので前面投影面積は 長さ×厚み 程度
  const area = (stone.length / 100) * (stone.thickness / 100) + 0.0002;
  const kDrag = (0.5 * AIR_DENSITY * 0.7 * area) / m;
  const windX = Math.cos(cond.windDir) * cond.windSpeed;
  const windZ = Math.sin(cond.windDir) * cond.windSpeed;

  // 重い石は高い速度と浅い角度が必要、良い石ほど深い角度でも跳ねる
  const heavyPenalty = Math.max(0, (stone.mass - 220) / 40);
  const critAngle = 10 + 26 * Q - heavyPenalty;
  const minSpeed = 3.4 + 3 * (1 - Q) + Math.max(0, (stone.mass - 160) / 90) + Math.max(0, (45 - stone.mass) / 25);

  const samples: TrajectorySample[] = [{ t: 0, x: px, y: py, z: pz }];
  const bounces: BounceEvent[] = [];
  let t = 0;
  let step = 0;
  let endReason: EndReason = "sank";
  let ended = false;

  while (t < 40 && !ended) {
    const rx = vx - windX;
    const rz = vz - windZ;
    const rSpeed = Math.hypot(rx, vy, rz);
    vx += -kDrag * rSpeed * rx * DT;
    vy += (-kDrag * rSpeed * vy - G) * DT;
    vz += -kDrag * rSpeed * rz * DT;
    px += vx * DT;
    py += vy * DT;
    pz += vz * DT;
    t += DT;
    step++;

    const dWater = distanceFromWater(stage, px, pz);
    if (dWater > 0) {
      // 陸の上
      const ground = terrainHeight(stage, px, pz);
      if (py <= ground) {
        py = ground;
        endReason = pz < riverCenterZ(stage, px) ? "far-bank" : bounces.length === 0 ? "too-slow" : "sank";
        ended = true;
      }
    } else if (py <= 0 && vy < 0) {
      const cur = currentAt(stage, cond, px, pz);
      // 水に対する相対速度で判定
      const hx = vx - cur;
      const hz = vz;
      const hs = Math.hypot(hx, hz);
      const turbulence = cond.waveAmp * 0.55 + cur * 0.45;
      // 波や流れの乱れは実質的な入水角を深くする
      const impact = Math.max(0.5, Math.atan2(-vy, hs) / DEG + Math.abs(gaussian(rng)) * turbulence * 0.7);

      if (impact > critAngle) {
        endReason = bounces.length === 0 ? "too-steep" : "sank";
        py = 0;
        ended = true;
      } else if (hs < minSpeed) {
        endReason = bounces.length === 0 ? "too-slow" : "sank";
        py = 0;
        ended = true;
      } else {
        let retention =
          0.62 + 0.32 * Q - 0.004 * Math.max(0, impact - 15) - 0.018 * cur - 0.008 * cond.waveAmp * Math.abs(gaussian(rng));
        // 理想に近い石だけが到達できる領域（全条件が最高なら 100 回前後）
        retention += 0.062 * smoothstep(0.8, 1, Q);
        retention = clamp(retention, 0.4, 0.99);
        const newHs = hs * retention;
        // いびつな石・波立つ水面ほど進路がぶれる
        const veer = gaussian(rng) * ((1 - Q) * 4 + cond.waveAmp * 0.3) * DEG;
        const c = Math.cos(veer);
        const s = Math.sin(veer);
        const nx = (hx * c - hz * s) / hs;
        const nz = (hx * s + hz * c) / hs;
        vx = nx * newHs + cur;
        vz = nz * newHs;
        const outAngle = clamp(impact * (0.42 + 0.18 * Q), 1.8 - 0.8 * smoothstep(0.8, 1, Q), 6.5) * (1 + gaussian(rng) * 0.08);
        vy = newHs * Math.tan(outAngle * DEG);
        py = 0;
        bounces.push({ t, x: px, z: pz, speed: newHs, index: bounces.length + 1 });
        samples.push({ t, x: px, y: 0, z: pz });
      }
    }

    if (step % SAMPLE_EVERY === 0 || ended) samples.push({ t, x: px, y: py, z: pz });
  }

  const endT = t;
  const distance = Math.hypot(px - start.x, pz - start.z);

  // 沈んでいく様子
  if (endReason !== "far-bank") {
    const hx = vx * 0.15;
    const hz = vz * 0.15;
    for (let i = 1; i <= 60; i++) {
      const dt = i / 60;
      const k = 1 - Math.exp(-dt * 3);
      samples.push({ t: endT + dt * 1.4, x: px + hx * k, y: -0.9 * k, z: pz + hz * k });
    }
  }

  return { samples, bounces, endT, endReason, distance, releaseSpeed: v0 };
}

/** 投げる前の予測軌道（最初の着水まで、風は無視） */
export function previewArc(stage: StageDef, originX: number, elevationDeg: number, yawDeg: number, speed = 18) {
  const start = releasePoint(stage, originX);
  const dir = throwDirection(yawDeg);
  const el = elevationDeg * DEG;
  const pts: { x: number; y: number; z: number }[] = [];
  let x = start.x;
  let y = start.y;
  let z = start.z;
  const vx = dir.x * Math.cos(el) * speed;
  let vy = Math.sin(el) * speed;
  const vz = dir.z * Math.cos(el) * speed;
  const dt = 1 / 60;
  for (let i = 0; i < 400 && y > 0; i++) {
    pts.push({ x, y, z });
    x += vx * dt;
    vy -= G * dt;
    y += vy * dt;
    z += vz * dt;
  }
  pts.push({ x, y: 0, z });
  return pts;
}
