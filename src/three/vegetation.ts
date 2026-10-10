import * as THREE from "three";
import { mergeGeometries } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng, range, type Rng } from "@/game/rng";
import { distanceFromWater, MOVE_RANGE, nearEdgeZ, riverCenterZ, riverHalfWidthAt } from "@/game/stages";
import { STONE_FIELD } from "@/game/stones";
import { terrainHeight } from "@/game/terrain";
import type { StageDef } from "@/game/types";
import { buildRockGeometry } from "./stoneMesh";
import { srgb } from "./terrainMesh";

export interface SwayUniforms {
  time: { value: number };
  wind: { value: number };
}

function paint(geo: THREE.BufferGeometry, color: THREE.Color, jitter: number, rng: Rng) {
  const g = geo.index ? geo.toNonIndexed() : geo;
  g.deleteAttribute("uv");
  const count = g.getAttribute("position").count;
  const colors = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 3) {
    const s = 1 + (rng() - 0.5) * jitter;
    for (let k = 0; k < 3 && i + k < count; k++) {
      colors[(i + k) * 3] = color.r * s;
      colors[(i + k) * 3 + 1] = color.g * s;
      colors[(i + k) * 3 + 2] = color.b * s;
    }
  }
  g.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  return g;
}

function jitterVerts(geo: THREE.BufferGeometry, amount: number, rng: Rng) {
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  // 同じ座標の頂点は同じだけ動かして穴を空けない
  const cache = new Map<string, [number, number, number]>();
  for (let i = 0; i < pos.count; i++) {
    const key = `${pos.getX(i).toFixed(4)},${pos.getY(i).toFixed(4)},${pos.getZ(i).toFixed(4)}`;
    let off = cache.get(key);
    if (!off) {
      off = [(rng() - 0.5) * amount, (rng() - 0.5) * amount * 0.6, (rng() - 0.5) * amount];
      cache.set(key, off);
    }
    pos.setXYZ(i, pos.getX(i) + off[0], pos.getY(i) + off[1], pos.getZ(i) + off[2]);
  }
}

/** 高さ 1 の針葉樹 */
function coniferGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.018, 0.034, 0.32, 6);
  trunk.translate(0, 0.16, 0);
  parts.push(paint(trunk, new THREE.Color(0.16, 0.1, 0.06), 0.2, rng));
  // 枝の段を細かく重ねて、なめらかな陰影にする（ローポリ感を抑える）
  const layers = 8;
  for (let k = 0; k < layers; k++) {
    const r = 0.27 * (1 - k * 0.11) * range(rng, 0.9, 1.1);
    const h = 0.26 - k * 0.012;
    const cone = new THREE.ConeGeometry(r, h, 12, 1, true);
    cone.translate(0, 0.18 + k * 0.1 + h / 2, 0);
    jitterVerts(cone, 0.035, rng);
    const tone = new THREE.Color(0.05, 0.13 + rng() * 0.03, 0.06);
    parts.push(paint(cone, tone, 0.15, rng));
  }
  return mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p));
}

/** 高さ 1 の広葉樹 */
function broadleafGeometry(seed: number): THREE.BufferGeometry {
  const rng = createRng(seed);
  const parts: THREE.BufferGeometry[] = [];
  const trunk = new THREE.CylinderGeometry(0.03, 0.055, 0.55, 6);
  trunk.translate(0, 0.275, 0);
  parts.push(paint(trunk, new THREE.Color(0.18, 0.13, 0.08), 0.2, rng));
  const blobs = 5 + Math.floor(rng() * 3);
  for (let k = 0; k < blobs; k++) {
    const r = range(rng, 0.16, 0.27);
    const blob = new THREE.IcosahedronGeometry(r, 1);
    jitterVerts(blob, r * 0.35, rng);
    const a = rng() * Math.PI * 2;
    const rad = k === 0 ? 0 : range(rng, 0.1, 0.24);
    blob.translate(Math.cos(a) * rad, range(rng, 0.55, 0.82), Math.sin(a) * rad);
    const tone = new THREE.Color(0.09 + rng() * 0.04, 0.2 + rng() * 0.06, 0.06);
    parts.push(paint(blob, tone, 0.15, rng));
  }
  return mergeGeometries(parts.map((p) => p.index ? p.toNonIndexed() : p));
}

function swayMaterial(base: THREE.MeshStandardMaterial, sway: SwayUniforms, strength: number) {
  base.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = sway.time;
    shader.uniforms.uWind = sway.wind;
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nuniform float uTime;\nuniform float uWind;")
      .replace(
        "#include <begin_vertex>",
        `#include <begin_vertex>
        #ifdef USE_INSTANCING
          float seedPhase = instanceMatrix[3].x * 0.37 + instanceMatrix[3].z * 0.21;
        #else
          float seedPhase = 0.0;
        #endif
        float bend = pow(max(position.y, 0.0), 2.0) * ${strength.toFixed(3)} * (0.25 + uWind * 0.09);
        transformed.x += sin(uTime * (1.1 + uWind * 0.08) + seedPhase) * bend;
        transformed.z += cos(uTime * 0.9 + seedPhase * 1.3) * bend * 0.6;`,
      );
  };
  return base;
}

function placeTrees(stage: StageDef, rng: Rng, count: number) {
  const out: { x: number; y: number; z: number; s: number; rot: number }[] = [];
  let guard = 0;
  while (out.length < count && guard++ < count * 12) {
    const side = rng() < 0.45 ? 1 : -1;
    const x = range(rng, -1300, 1300);
    const minD = stage.beachWidth * (side > 0 ? 1 : 0.55) + 4;
    const d = minD + -Math.log(1 - rng() * 0.995) * 140;
    if (d > 1100) continue;
    const z = riverCenterZ(stage, x) + side * (riverHalfWidthAt(stage, x) + d);
    // 投げる場所の真後ろは視界を確保
    if (side > 0 && Math.abs(x) < 25 && d < stage.beachWidth + 10) continue;
    const y = terrainHeight(stage, x, z);
    const slope = Math.abs(terrainHeight(stage, x + 2, z) - y) / 2 + Math.abs(terrainHeight(stage, x, z + 2) - y) / 2;
    if (slope > 1.1 || y > stage.mountainAmp * 0.8) continue;
    // まばらな群生
    const cluster = Math.sin(x * 0.021) * Math.cos(z * 0.017) + Math.sin(x * 0.007 + z * 0.005);
    if (cluster < -0.6 && rng() < 0.7) continue;
    out.push({ x, y: y - 0.2, z, s: range(rng, 0.65, 1.35), rot: rng() * Math.PI * 2 });
  }
  return out;
}

/** 区画ごとに分けた InstancedMesh を作る（画面外・影の範囲外を描かないため） */
class ChunkedInstances {
  private buckets = new Map<string, { m: THREE.Matrix4; c: THREE.Color }[]>();
  constructor(
    private geo: THREE.BufferGeometry,
    private mat: THREE.Material,
    private chunk: number,
  ) {}

  add(m: THREE.Matrix4, c: THREE.Color) {
    const e = m.elements;
    const key = `${Math.floor(e[12] / this.chunk)},${Math.floor(e[14] / this.chunk)}`;
    let b = this.buckets.get(key);
    if (!b) this.buckets.set(key, (b = []));
    b.push({ m: m.clone(), c: c.clone() });
  }

  build(group: THREE.Group, opts: { castShadow: boolean; receiveShadow: boolean; detail?: boolean }) {
    for (const items of this.buckets.values()) {
      const mesh = new THREE.InstancedMesh(this.geo, this.mat, items.length);
      items.forEach((it, i) => {
        mesh.setMatrixAt(i, it.m);
        mesh.setColorAt(i, it.c);
      });
      mesh.computeBoundingSphere();
      mesh.castShadow = opts.castShadow;
      mesh.receiveShadow = opts.receiveShadow;
      // 細かい物は水面の反射に描かない
      if (opts.detail) mesh.userData.skipReflection = true;
      group.add(mesh);
    }
  }
}

export function buildTrees(stage: StageDef, sway: SwayUniforms, seed = 1): THREE.Group {
  const rng = createRng(seed);
  const group = new THREE.Group();
  group.name = "trees";
  const kinds: { geo: THREE.BufferGeometry; height: number; share: number }[] = [];
  if (stage.treeKind === "conifer" || stage.treeKind === "mixed") {
    kinds.push({ geo: coniferGeometry(11), height: 17, share: stage.treeKind === "mixed" ? 0.35 : 0.55 });
    kinds.push({ geo: coniferGeometry(29), height: 14, share: stage.treeKind === "mixed" ? 0.25 : 0.45 });
  }
  if (stage.treeKind === "broadleaf" || stage.treeKind === "mixed") {
    kinds.push({ geo: broadleafGeometry(5), height: 12, share: stage.treeKind === "mixed" ? 0.2 : 0.5 });
    kinds.push({ geo: broadleafGeometry(17), height: 10, share: stage.treeKind === "mixed" ? 0.2 : 0.5 });
  }
  const spots = placeTrees(stage, rng, stage.treeCount);
  const mat = swayMaterial(new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.92 }), sway, 0.035);
  let cursor = 0;
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  kinds.forEach((kind, idx) => {
    const n = idx === kinds.length - 1 ? spots.length - cursor : Math.floor(spots.length * kind.share);
    const chunks = new ChunkedInstances(kind.geo, mat, 120);
    for (let i = 0; i < n; i++) {
      const t = spots[cursor + i];
      const h = kind.height * t.s;
      q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), t.rot);
      m.compose(new THREE.Vector3(t.x, t.y, t.z), q, new THREE.Vector3(h * range(rng, 0.85, 1.15), h, h * range(rng, 0.85, 1.15)));
      col.setRGB(range(rng, 0.8, 1.15), range(rng, 0.85, 1.15), range(rng, 0.75, 1.05));
      chunks.add(m, col);
    }
    cursor += n;
    chunks.build(group, { castShadow: true, receiveShadow: true });
  });
  return group;
}

/** 草むら・葦（投げる場所の周辺） */
export function buildGrass(stage: StageDef, texture: THREE.Texture, sway: SwayUniforms, seed = 3): THREE.Group {
  const rng = createRng(seed);
  const plane = new THREE.PlaneGeometry(1, 1);
  plane.translate(0, 0.5, 0);
  const p2 = plane.clone().rotateY(Math.PI / 2);
  const p3 = plane.clone().rotateY(Math.PI / 4);
  const geo = mergeGeometries([plane, p2, p3]);
  // 法線を上向きにして柔らかい陰影に
  const nrm = geo.getAttribute("normal") as THREE.BufferAttribute;
  for (let i = 0; i < nrm.count; i++) nrm.setXYZ(i, 0, 1, 0);

  const mat = swayMaterial(
    new THREE.MeshStandardMaterial({ map: texture, alphaTest: 0.45, side: THREE.DoubleSide, roughness: 0.95 }),
    sway,
    0.12,
  );
  const count = 7000;
  const chunks = new ChunkedInstances(geo, mat, 30);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const col = new THREE.Color();
  const dryTint = new THREE.Color(1.25, 1.05, 0.55);
  let n = 0;
  let guard = 0;
  while (n < count && guard++ < count * 6) {
    const x = range(rng, -90, 90);
    const reed = rng() < 0.18;
    let d: number;
    if (reed) d = range(rng, -0.4, 2.5);
    else d = stage.beachWidth * range(rng, 0.65, 1.0) + Math.pow(rng(), 1.6) * (stage.bankSteepness + 25);
    if (reed && Math.abs(x) < 14) continue;
    const z = nearEdgeZ(stage, x) + d;
    // 石を選ぶ場所の周りは空ける
    if (x > STONE_FIELD.xMin - 1.5 && x < STONE_FIELD.xMax + 1.5 && d < STONE_FIELD.dMax + 4) continue;
    const y = terrainHeight(stage, x, z);
    const h = reed ? range(rng, 1.1, 2.0) : range(rng, 0.25, 0.75);
    const w = reed ? h * 0.35 : h * range(rng, 0.8, 1.4);
    q.setFromAxisAngle(new THREE.Vector3(0, 1, 0), rng() * Math.PI);
    m.compose(new THREE.Vector3(x, y - 0.03, z), q, new THREE.Vector3(w, h, w));
    col.setRGB(1, 1, 1).lerp(dryTint, reed ? 0.4 + rng() * 0.5 : rng() * rng() * 0.8).multiplyScalar(range(rng, 0.7, 1.05));
    chunks.add(m, col);
    n++;
  }
  const group = new THREE.Group();
  chunks.build(group, { castShadow: false, receiveShadow: true, detail: true });
  return group;
}

/** 河原の小石と岩 */
export function buildRocks(stage: StageDef, seed = 9): THREE.Group {
  const rng = createRng(seed);
  const group = new THREE.Group();
  const mat = new THREE.MeshStandardMaterial({ roughness: 0.88, color: 0xffffff });
  const gravel = srgb(stage.palette.gravel);
  const rock = srgb(stage.palette.rock);
  const m = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const e = new THREE.Euler();
  const col = new THREE.Color();

  // 小石
  for (let v = 0; v < 3; v++) {
    const chunks = new ChunkedInstances(buildRockGeometry(100 + v, 0.55, 1), mat, 16);
    for (let n = 0; n < 2400; n++) {
      const zone = rng();
      const x = zone < 0.4 ? range(rng, -6, 6) : zone < 0.75 ? range(rng, -24, 24) : range(rng, -70, 70);
      const d = zone < 0.4 ? range(rng, -0.3, 6.5) : range(rng, -0.8, stage.beachWidth * 0.95);
      const z = nearEdgeZ(stage, x) + d;
      const inField =
        x > STONE_FIELD.xMin - 0.3 && x < STONE_FIELD.xMax + 0.3 && d > STONE_FIELD.dMin - 0.4 && d < STONE_FIELD.dMax + 0.4;
      const s = inField ? range(rng, 0.012, 0.03) : range(rng, 0.015, 0.075) * (rng() < 0.06 && d > 1 ? 2 : 1);
      const y = terrainHeight(stage, x, z);
      e.set((rng() - 0.5) * 0.4, rng() * Math.PI * 2, (rng() - 0.5) * 0.4);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y - s * 0.15, z), q, new THREE.Vector3(s, s, s));
      col.copy(rng() < 0.5 ? gravel : rock).multiplyScalar(range(rng, 0.7, 1.25) * (d < 0.8 ? 0.75 : 1));
      chunks.add(m, col);
    }
    chunks.build(group, { castShadow: false, receiveShadow: true, detail: true });
  }

  // 岩・巨石
  const big = stage.id === "misty-gorge" ? 420 : 160;
  for (let v = 0; v < 3; v++) {
    const chunks = new ChunkedInstances(buildRockGeometry(200 + v, 0.15, 2), mat, 120);
    const count = Math.ceil(big / 3);
    let n = 0;
    let guard = 0;
    while (n < count && guard++ < count * 20) {
      const x = range(rng, -500, 500);
      const side = rng() < 0.55 ? 1 : -1;
      const inWater = rng() < (stage.id === "misty-gorge" ? 0.25 : 0.1);
      let z: number;
      if (inWater) {
        if (Math.abs(x) < 90) continue;
        z = riverCenterZ(stage, x) + side * riverHalfWidthAt(stage, x) * range(rng, 0.5, 0.98);
      } else {
        const d = range(rng, 0, stage.beachWidth + stage.bankSteepness + 30);
        if (side > 0 && Math.abs(x) < MOVE_RANGE + 3 && d < stage.beachWidth + 6) continue;
        z = riverCenterZ(stage, x) + side * (riverHalfWidthAt(stage, x) + d);
      }
      const dW = distanceFromWater(stage, x, z);
      const gy = terrainHeight(stage, x, z);
      const steep = Math.abs(terrainHeight(stage, x, z + 1.5) - gy) / 1.5;
      // 崖の途中に岩が貼り付かないように
      if (steep > 0.7) continue;
      const s = (stage.id === "misty-gorge" ? range(rng, 0.4, 3.5) : range(rng, 0.3, 1.6)) * (dW > stage.beachWidth ? 1.4 : 1);
      const y = terrainHeight(stage, x, z);
      e.set((rng() - 0.5) * 0.5, rng() * Math.PI * 2, (rng() - 0.5) * 0.5);
      q.setFromEuler(e);
      m.compose(new THREE.Vector3(x, y - s * 0.25, z), q, new THREE.Vector3(s, s * range(rng, 0.6, 1.0), s));
      col.copy(rock).multiplyScalar(range(rng, 0.75, 1.2));
      chunks.add(m, col);
      n++;
    }
    chunks.build(group, { castShadow: true, receiveShadow: true });
  }
  return group;
}
