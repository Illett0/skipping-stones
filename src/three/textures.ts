import * as THREE from "three";
import { createRng, valueNoise2 } from "@/game/rng";

/** タイル可能な周期ノイズ（周期 period のグリッド） */
function periodicNoise(x: number, y: number, period: number, seed: number) {
  const xi = Math.floor(x);
  const yi = Math.floor(y);
  const fx = x - xi;
  const fy = y - yi;
  const h = (a: number, b: number) => {
    const ax = ((a % period) + period) % period;
    const by = ((b % period) + period) % period;
    return (valueNoise2(ax + 0.5, by + 0.5, seed) + 1) / 2;
  };
  const u = fx * fx * (3 - 2 * fx);
  const v = fy * fy * (3 - 2 * fy);
  const a = h(xi, yi);
  const b = h(xi + 1, yi);
  const c = h(xi, yi + 1);
  const d = h(xi + 1, yi + 1);
  return (a + (b - a) * u) * (1 - v) + (c + (d - c) * u) * v;
}

function periodicFbm(x: number, y: number, basePeriod: number, octaves: number, seed: number) {
  let sum = 0;
  let amp = 0.5;
  let norm = 0;
  let p = basePeriod;
  let f = 1;
  for (let i = 0; i < octaves; i++) {
    sum += amp * periodicNoise(x * f, y * f, p, seed + i * 13);
    norm += amp;
    amp *= 0.5;
    f *= 2;
    p *= 2;
  }
  return sum / norm;
}

/** 水面用の法線マップ（タイル可能） */
export function createWaterNormals(size = 256): THREE.DataTexture {
  const heights = new Float32Array(size * size);
  const rng = createRng(77);
  // 方向の異なる正弦波 + ノイズで細かいさざ波
  const waves = Array.from({ length: 10 }, () => ({
    kx: Math.round((rng() - 0.5) * 16),
    ky: Math.round((rng() - 0.5) * 16),
    phase: rng() * Math.PI * 2,
    amp: 0.3 + rng() * 0.7,
  }));
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const u = x / size;
      const v = y / size;
      let h = 0;
      for (const w of waves) h += w.amp * Math.sin(2 * Math.PI * (w.kx * u + w.ky * v) + w.phase) / (1 + Math.hypot(w.kx, w.ky) * 0.15);
      h += periodicFbm(u * 8, v * 8, 8, 4, 5) * 2.2;
      heights[y * size + x] = h;
    }
  }
  const data = new Uint8Array(size * size * 4);
  const strength = 2.4;
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const l = heights[y * size + ((x - 1 + size) % size)];
      const r = heights[y * size + ((x + 1) % size)];
      const d = heights[((y - 1 + size) % size) * size + x];
      const t = heights[((y + 1) % size) * size + x];
      const nx = (l - r) * strength;
      const ny = (d - t) * strength;
      const nz = 1;
      const len = Math.hypot(nx, ny, nz);
      const i = (y * size + x) * 4;
      data[i] = ((nx / len) * 0.5 + 0.5) * 255;
      data[i + 1] = ((ny / len) * 0.5 + 0.5) * 255;
      data[i + 2] = ((nz / len) * 0.5 + 0.5) * 255;
      data[i + 3] = 255;
    }
  }
  const tex = new THREE.DataTexture(data, size, size, THREE.RGBAFormat);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.magFilter = THREE.LinearFilter;
  tex.minFilter = THREE.LinearMipmapLinearFilter;
  tex.generateMipmaps = true;
  tex.needsUpdate = true;
  return tex;
}

/** 地面のディテール（砂利の粒と土のムラ）。リニア値で平均 0.87 前後の乗算用 */
export function createGroundDetail(size = 512): THREE.CanvasTexture {
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = size;
  const ctx = canvas.getContext("2d")!;
  const img = ctx.createImageData(size, size);
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const n = periodicFbm((x / size) * 16, (y / size) * 16, 16, 5, 9);
      const v = 222 + (n - 0.5) * 80;
      const i = (y * size + x) * 4;
      img.data[i] = img.data[i + 1] = img.data[i + 2] = v;
      img.data[i + 3] = 255;
    }
  }
  ctx.putImageData(img, 0, 0);
  // 小石の粒（影 → 本体 → ハイライトで立体的に）。タイル境界をまたいでも繋がるよう 9 方向に描く
  const rng = createRng(31);
  const pebble = (x: number, y: number, r: number, ry: number, rot: number, shade: number) => {
    for (const ox of [-size, 0, size]) {
      for (const oy of [-size, 0, size]) {
        const px = x + ox;
        const py = y + oy;
        if (px < -r * 2 || px > size + r * 2 || py < -r * 2 || py > size + r * 2) continue;
        ctx.fillStyle = "rgba(60,56,50,0.3)";
        ctx.beginPath();
        ctx.ellipse(px + r * 0.25, py + r * 0.3, r * 1.08, ry * 1.08, rot, 0, Math.PI * 2);
        ctx.fill();
        const g = ctx.createRadialGradient(px - r * 0.35, py - ry * 0.4, r * 0.1, px, py, r);
        g.addColorStop(0, `rgb(${Math.min(255, shade + 45)},${Math.min(255, shade + 43)},${Math.min(255, shade + 38)})`);
        g.addColorStop(1, `rgb(${shade - 35},${shade - 36},${shade - 38})`);
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.ellipse(px, py, r, ry, rot, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  };
  for (let i = 0; i < 900; i++) {
    const r = 3 + rng() * 7;
    pebble(rng() * size, rng() * size, r, r * (0.55 + rng() * 0.4), rng() * Math.PI, 150 + rng() * 90);
  }
  for (let i = 0; i < 2600; i++) {
    const r = 1 + rng() * 2.4;
    pebble(rng() * size, rng() * size, r, r * (0.6 + rng() * 0.4), rng() * Math.PI, 150 + rng() * 100);
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
  tex.colorSpace = THREE.NoColorSpace;
  tex.anisotropy = 8;
  return tex;
}

/** 草の葉（アルファ付き） */
export function createGrassTexture(): THREE.CanvasTexture {
  const w = 128;
  const h = 256;
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d")!;
  const rng = createRng(12);
  for (let i = 0; i < 26; i++) {
    const x0 = w * (0.15 + rng() * 0.7);
    const lean = (rng() - 0.5) * w * 0.7;
    const top = h * (0.05 + rng() * 0.45);
    const width = 3 + rng() * 5;
    const g = 90 + rng() * 80;
    const grad = ctx.createLinearGradient(0, h, 0, top);
    grad.addColorStop(0, `rgb(${g * 0.35},${g * 0.55},${g * 0.2})`);
    grad.addColorStop(1, `rgb(${g * 0.75},${g},${g * 0.45})`);
    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.moveTo(x0 - width, h);
    ctx.quadraticCurveTo(x0 + lean * 0.3, (h + top) / 2, x0 + lean, top);
    ctx.quadraticCurveTo(x0 + lean * 0.3 + width * 0.5, (h + top) / 2, x0 + width, h);
    ctx.closePath();
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

/** 水しぶき・波紋用の柔らかい円 */
export function createSoftDot(): THREE.CanvasTexture {
  const s = 64;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  const g = ctx.createRadialGradient(s / 2, s / 2, 0, s / 2, s / 2, s / 2);
  g.addColorStop(0, "rgba(255,255,255,1)");
  g.addColorStop(0.4, "rgba(255,255,255,0.6)");
  g.addColorStop(1, "rgba(255,255,255,0)");
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, s, s);
  return new THREE.CanvasTexture(canvas);
}

export function createRippleTexture(): THREE.CanvasTexture {
  const s = 128;
  const canvas = document.createElement("canvas");
  canvas.width = canvas.height = s;
  const ctx = canvas.getContext("2d")!;
  ctx.strokeStyle = "rgba(255,255,255,0.9)";
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 6, 0, Math.PI * 2);
  ctx.stroke();
  ctx.strokeStyle = "rgba(255,255,255,0.35)";
  ctx.lineWidth = 3;
  ctx.beginPath();
  ctx.arc(s / 2, s / 2, s / 2 - 18, 0, Math.PI * 2);
  ctx.stroke();
  return new THREE.CanvasTexture(canvas);
}
