import * as THREE from "three";
import { mergeVertices } from "three/examples/jsm/utils/BufferGeometryUtils.js";
import { createRng } from "@/game/rng";
import type { StoneSpec } from "@/game/types";

/** 画面上で見やすいよう、石は実寸の何倍で描くか */
export const STONE_VISUAL_SCALE = 1.8;

interface Harmonic {
  kx: number;
  ky: number;
  kz: number;
  phase: number;
  amp: number;
}

function harmonics(seed: number, count: number, freq: number): Harmonic[] {
  const rng = createRng(seed);
  return Array.from({ length: count }, () => ({
    kx: (rng() - 0.5) * 2 * freq,
    ky: (rng() - 0.5) * 2 * freq,
    kz: (rng() - 0.5) * 2 * freq,
    phase: rng() * Math.PI * 2,
    amp: 0.5 + rng() * 0.5,
  }));
}

const evalH = (hs: Harmonic[], x: number, y: number, z: number) => {
  let s = 0;
  let norm = 0;
  for (const h of hs) {
    s += h.amp * Math.sin(h.kx * x + h.ky * y + h.kz * z + h.phase);
    norm += h.amp;
  }
  return s / norm;
};

/**
 * 石の形状。単位球を楕円体に伸ばし、いびつさに応じて凸凹を付け、
 * 平らさに応じて底面を潰す。原点は底面の中心付近。
 */
export function buildStoneGeometry(spec: StoneSpec, detail = 3): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo);

  const coarse = harmonics(spec.seed, 5, 2.2);
  const fine = harmonics(spec.seed + 1, 6, 7);
  const L = (spec.length / 100 / 2) * STONE_VISUAL_SCALE;
  const W = (spec.width / 100 / 2) * STONE_VISUAL_SCALE;
  const T = (spec.thickness / 100 / 2) * STONE_VISUAL_SCALE;
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(pos.count * 3);
  const base = new THREE.Color().setRGB(spec.color[0], spec.color[1], spec.color[2], THREE.SRGBColorSpace);
  const rng = createRng(spec.seed + 7);
  const speckleSeed = rng() * 100;

  let minY = Infinity;
  const v = new THREE.Vector3();
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r =
      1 + spec.irregularity * 0.32 * evalH(coarse, v.x, v.y, v.z) + (0.04 + spec.irregularity * 0.05) * evalH(fine, v.x, v.y, v.z);
    let x = v.x * r * L;
    let y = v.y * r * T;
    const z = v.z * r * W;
    // 底面の平らさ：下半分を潰す
    if (y < 0) y *= 1 - spec.flatness * 0.88;
    // 上面は少し盛り上がる
    else y *= 1 + (1 - Math.abs(v.y)) * 0.05;
    // 角ばり：いびつな石は片側が尖る
    x *= 1 + spec.irregularity * 0.12 * Math.sign(v.x) * v.z;
    pos.setXYZ(i, x, y, z);
    minY = Math.min(minY, y);

    const sp = Math.sin(v.x * 23 + speckleSeed) * Math.sin(v.y * 19 + speckleSeed * 2) * Math.sin(v.z * 29);
    const shade = 0.88 + 0.16 * evalH(fine, v.x * 2, v.y * 2, v.z * 2) + (sp > 0.6 ? 0.18 : sp < -0.7 ? -0.15 : 0);
    colors[i * 3] = base.r * shade;
    colors[i * 3 + 1] = base.g * shade;
    colors[i * 3 + 2] = base.b * shade;
  }
  for (let i = 0; i < pos.count; i++) pos.setY(i, pos.getY(i) - minY);
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

export const stoneMaterial = () =>
  new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 0.78, metalness: 0.0 });

/** 装飾用の小石・岩のジオメトリ（単位サイズ） */
export function buildRockGeometry(seed: number, flat = 0.4, detail = 1): THREE.BufferGeometry {
  let geo: THREE.BufferGeometry = new THREE.IcosahedronGeometry(1, detail);
  geo.deleteAttribute("normal");
  geo.deleteAttribute("uv");
  geo = mergeVertices(geo);
  const hs = harmonics(seed, 6, 2.5);
  const pos = geo.getAttribute("position") as THREE.BufferAttribute;
  const v = new THREE.Vector3();
  const rng = createRng(seed);
  const sx = 0.8 + rng() * 0.5;
  const sz = 0.7 + rng() * 0.4;
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i);
    const r = 1 + 0.28 * evalH(hs, v.x, v.y, v.z);
    let y = v.y * r * (1 - flat * 0.5);
    if (y < -0.1) y = -0.1 - (y + 0.1) * 0.3;
    pos.setXYZ(i, v.x * r * sx, y, v.z * r * sz);
  }
  geo.computeVertexNormals();
  return geo;
}
