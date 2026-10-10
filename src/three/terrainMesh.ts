import * as THREE from "three";
import { fbm2, smoothstep } from "@/game/rng";
import { distanceFromWater, riverCenterZ } from "@/game/stages";
import { terrainHeight } from "@/game/terrain";
import type { StageDef } from "@/game/types";

const EXTENT = 2600;
const SEGMENTS = 320;

/** 中心付近ほど細かくなる座標マッピング */
function mapAxis(u: number) {
  const a = 110;
  const b = EXTENT - a;
  const s = Math.sign(u);
  const au = Math.abs(u);
  return s * (a * au + b * au * au * au);
}

/** 川を横切る方向：川と両岸の範囲は均等に細かく、その外側は急に粗くする */
function mapAcross(u: number, inner: number) {
  const s = Math.sign(u);
  const au = Math.abs(u);
  if (au <= 0.5) return s * inner * (au / 0.5);
  return s * (inner + (EXTENT - inner) * Math.pow((au - 0.5) / 0.5, 2.2));
}

export const srgb = (c: [number, number, number]) => new THREE.Color().setRGB(c[0], c[1], c[2], THREE.SRGBColorSpace);

export function buildTerrain(stage: StageDef, detail: THREE.Texture): THREE.Mesh {
  const n = SEGMENTS + 1;
  const z0 = riverCenterZ(stage, 0);
  const inner = stage.riverHalfWidth + stage.beachWidth + stage.bankSteepness + 45;
  const positions = new Float32Array(n * n * 3);
  const colors = new Float32Array(n * n * 3);
  const gravel = new Float32Array(n * n);
  const uvs = new Float32Array(n * n * 2);

  const pal = {
    grass: srgb(stage.palette.grass),
    dry: srgb(stage.palette.dryGrass),
    gravel: srgb(stage.palette.gravel),
    rock: srgb(stage.palette.rock),
    bed: srgb(stage.palette.riverbed),
    forest: srgb(stage.palette.forest),
  };
  const c = new THREE.Color();
  const tmp = new THREE.Color();

  for (let j = 0; j < n; j++) {
    const z = z0 + mapAcross((j / SEGMENTS) * 2 - 1, inner);
    for (let i = 0; i < n; i++) {
      const x = mapAxis((i / SEGMENTS) * 2 - 1);
      const y = terrainHeight(stage, x, z);
      const k = j * n + i;
      positions[k * 3] = x;
      positions[k * 3 + 1] = y;
      positions[k * 3 + 2] = z;
      uvs[k * 2] = x / 1.6;
      uvs[k * 2 + 1] = z / 1.6;

      const d = distanceFromWater(stage, x, z);
      const e = 0.8;
      const slope = Math.hypot(terrainHeight(stage, x + e, z) - y, terrainHeight(stage, x, z + e) - y) / e;
      const nBig = fbm2(x * 0.01, z * 0.01, 4, 101) * 0.5 + 0.5;
      const nSmall = fbm2(x * 0.15, z * 0.15, 3, 55) * 0.5 + 0.5;

      gravel[k] = d < 0 ? 0.6 : 0;
      if (d < 0) {
        c.copy(pal.bed).lerp(pal.gravel, 0.35 * (1 - smoothstep(0, 4, -d)));
        c.multiplyScalar(0.55 + 0.25 * nSmall);
      } else {
        const beachEnd = stage.beachWidth * 0.9;
        // 砂利 → 草
        c.copy(pal.gravel).multiplyScalar(0.85 + 0.3 * nSmall);
        const grassT = smoothstep(beachEnd - 2, beachEnd + 5, d + (nBig - 0.5) * 8);
        tmp.copy(pal.grass).lerp(pal.dry, smoothstep(0.45, 0.75, nBig));
        c.lerp(tmp, grassT);
        gravel[k] = 1 - grassT;
        // 森の林床（遠景）
        const forestT = smoothstep(beachEnd + stage.bankSteepness, beachEnd + stage.bankSteepness + 40, d) * (0.6 + 0.4 * nBig);
        c.lerp(pal.forest, forestT * 0.85);
        // 遠くの山腹は森、近くの急斜面・崖だけ岩肌にする
        const rockT = smoothstep(0.65, 1.3, slope) * (1 - smoothstep(60, 200, d) * 0.85);
        // 岩肌の地層の縞
        const nRock = fbm2(x * 0.6, y * 0.9 + z * 0.6, 3, 91) * 0.5 + 0.5;
        tmp.copy(pal.rock).multiplyScalar((0.6 + 0.55 * nRock) * (0.78 + 0.32 * Math.sin(y * 1.9 + nBig * 6)));
        c.lerp(tmp, rockT);
        // 高山は岩
        c.lerp(pal.rock, smoothstep(stage.mountainAmp * 0.55, stage.mountainAmp * 0.9, y) * 0.8);
        // 水際は濡れて暗い
        c.multiplyScalar(1 - 0.38 * (1 - smoothstep(0, 1.4, d)));
      }
      colors[k * 3] = c.r;
      colors[k * 3 + 1] = c.g;
      colors[k * 3 + 2] = c.b;
    }
  }

  const indices: number[] = [];
  for (let j = 0; j < SEGMENTS; j++) {
    for (let i = 0; i < SEGMENTS; i++) {
      const a = j * n + i;
      const b = a + 1;
      const cc = a + n;
      const dd = cc + 1;
      indices.push(a, cc, b, b, cc, dd);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  geo.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geo.setAttribute("gravel", new THREE.BufferAttribute(gravel, 1));
  geo.setAttribute("uv", new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();

  const mat = new THREE.MeshStandardMaterial({
    vertexColors: true,
    map: detail,
    roughness: 0.96,
    metalness: 0,
  });
  // 砂利の模様は河原だけに強く出す
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace("#include <common>", "#include <common>\nattribute float gravel;\nvarying float vGravel;")
      .replace("#include <begin_vertex>", "#include <begin_vertex>\nvGravel = gravel;");
    shader.fragmentShader = shader.fragmentShader
      .replace("#include <common>", "#include <common>\nvarying float vGravel;")
      .replace(
        "#include <map_fragment>",
        `vec4 detailA = texture2D( map, vMapUv );
        vec4 detailB = texture2D( map, vMapUv * 0.23 + 0.37 );
        vec3 soil = vec3( 0.82 + ( detailB.r - 0.85 ) * 0.6 );
        diffuseColor.rgb *= mix( soil, detailA.rgb, vGravel );`,
      );
  };
  const mesh = new THREE.Mesh(geo, mat);
  mesh.receiveShadow = true;
  mesh.name = "terrain";
  return mesh;
}
