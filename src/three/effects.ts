import * as THREE from "three";
import { createRng } from "@/game/rng";
import { currentAt, distanceFromWater, riverCenterZ, riverHalfWidthAt } from "@/game/stages";
import type { Conditions, StageDef } from "@/game/types";

interface Ripple {
  mesh: THREE.Mesh;
  age: number;
  life: number;
  maxScale: number;
  active: boolean;
}

/** 着水時の波紋と水しぶき */
export class SplashSystem {
  readonly group = new THREE.Group();
  private ripples: Ripple[] = [];
  private dropPositions: Float32Array;
  private dropVelocities: Float32Array;
  private dropLife: Float32Array;
  private drops: THREE.Points;
  private dropCursor = 0;
  private readonly maxDrops = 1500;

  constructor(rippleTex: THREE.Texture, dotTex: THREE.Texture) {
    const rippleGeo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    for (let i = 0; i < 60; i++) {
      const mat = new THREE.MeshBasicMaterial({
        map: rippleTex,
        transparent: true,
        depthWrite: false,
        opacity: 0,
        color: 0xe8f2f5,
      });
      const mesh = new THREE.Mesh(rippleGeo, mat);
      mesh.visible = false;
      mesh.renderOrder = 2;
      this.group.add(mesh);
      this.ripples.push({ mesh, age: 0, life: 1, maxScale: 1, active: false });
    }

    this.dropPositions = new Float32Array(this.maxDrops * 3).fill(-999);
    this.dropVelocities = new Float32Array(this.maxDrops * 3);
    this.dropLife = new Float32Array(this.maxDrops);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.dropPositions, 3));
    this.drops = new THREE.Points(
      geo,
      new THREE.PointsMaterial({
        size: 0.13,
        map: dotTex,
        transparent: true,
        depthWrite: false,
        color: 0xf2f8fa,
        opacity: 0.9,
      }),
    );
    this.drops.frustumCulled = false;
    this.group.add(this.drops);
  }

  ripple(x: number, z: number, size: number, life: number, opacity = 0.85, force = true) {
    const free = this.ripples.find((p) => !p.active);
    if (!free && !force) return;
    const r = free ?? this.ripples.reduce((a, b) => (a.age / a.life > b.age / b.life ? a : b));
    r.active = true;
    r.age = 0;
    r.life = life;
    r.maxScale = size;
    r.mesh.position.set(x, 0.015, z);
    r.mesh.visible = true;
    (r.mesh.material as THREE.MeshBasicMaterial).opacity = opacity;
    r.mesh.userData.baseOpacity = opacity;
  }

  splash(x: number, z: number, strength: number, dirX = 0, dirZ = 0) {
    this.ripple(x, z, 1.6 + strength * 2.4, 1.8 + strength * 0.8);
    this.ripple(x, z, 0.8 + strength * 1.2, 1.1, 0.7);
    this.ripple(x, z, 0.4 + strength * 0.5, 0.7, 0.9);
    const n = Math.floor(30 + strength * 70);
    for (let i = 0; i < n; i++) {
      const k = this.dropCursor;
      this.dropCursor = (this.dropCursor + 1) % this.maxDrops;
      const a = Math.random() * Math.PI * 2;
      const sp = (0.5 + Math.random() * 1.6) * (0.6 + strength);
      this.dropPositions[k * 3] = x;
      this.dropPositions[k * 3 + 1] = 0.02;
      this.dropPositions[k * 3 + 2] = z;
      this.dropVelocities[k * 3] = Math.cos(a) * sp * 0.6 + dirX * 1.2;
      this.dropVelocities[k * 3 + 1] = 1.2 + Math.random() * 2.6 * (0.5 + strength);
      this.dropVelocities[k * 3 + 2] = Math.sin(a) * sp * 0.6 + dirZ * 1.2;
      this.dropLife[k] = 1;
    }
  }

  update(dt: number) {
    for (const r of this.ripples) {
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / r.life;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const s = 0.1 + r.maxScale * (1 - Math.pow(1 - t, 2.2));
      r.mesh.scale.setScalar(s);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = (r.mesh.userData.baseOpacity as number) * (1 - t) * (1 - t);
    }
    let dirty = false;
    for (let k = 0; k < this.maxDrops; k++) {
      if (this.dropLife[k] <= 0) continue;
      dirty = true;
      this.dropVelocities[k * 3 + 1] -= 9.8 * dt;
      this.dropPositions[k * 3] += this.dropVelocities[k * 3] * dt;
      this.dropPositions[k * 3 + 1] += this.dropVelocities[k * 3 + 1] * dt;
      this.dropPositions[k * 3 + 2] += this.dropVelocities[k * 3 + 2] * dt;
      if (this.dropPositions[k * 3 + 1] < 0) {
        this.dropLife[k] = 0;
        this.dropPositions[k * 3 + 1] = -999;
      }
    }
    if (dirty) this.drops.geometry.getAttribute("position").needsUpdate = true;
  }
}

/** 雨（カメラの周りに降らせる） */
export class RainSystem {
  readonly lines: THREE.LineSegments;
  private positions: Float32Array;
  private speeds: Float32Array;
  private readonly count = 9000;
  private readonly box = { x: 46, y: 26, z: 46 };
  intensity = 0;

  constructor() {
    this.positions = new Float32Array(this.count * 6);
    this.speeds = new Float32Array(this.count);
    const rng = createRng(5);
    for (let i = 0; i < this.count; i++) {
      const x = (rng() - 0.5) * this.box.x;
      const y = rng() * this.box.y;
      const z = (rng() - 0.5) * this.box.z;
      this.positions.set([x, y, z, x, y - 0.4, z], i * 6);
      this.speeds[i] = 8 + rng() * 4;
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute("position", new THREE.BufferAttribute(this.positions, 3));
    this.lines = new THREE.LineSegments(
      geo,
      new THREE.LineBasicMaterial({ color: 0xc4d0d8, transparent: true, opacity: 0.38, depthWrite: false }),
    );
    this.lines.frustumCulled = false;
    this.lines.visible = false;
  }

  update(dt: number, center: THREE.Vector3, windX: number, windZ: number, onSplash?: (x: number, z: number) => void) {
    this.lines.visible = this.intensity > 0;
    if (!this.lines.visible) return;
    const hx = this.box.x / 2;
    const hz = this.box.z / 2;
    const slant = 0.045;
    for (let i = 0; i < this.count; i++) {
      const o = i * 6;
      const sp = this.speeds[i];
      let x = this.positions[o] + windX * dt * 0.7;
      let y = this.positions[o + 1] - sp * dt;
      let z = this.positions[o + 2] + windZ * dt * 0.7;
      if (y < center.y - 4 || y < -0.1) {
        if (onSplash && y < 0.2 && i % 7 === 0) onSplash(x, z);
        y = center.y + this.box.y * (0.6 + Math.random() * 0.4);
        x = center.x + (Math.random() - 0.5) * this.box.x;
        z = center.z + (Math.random() - 0.5) * this.box.z;
      }
      // カメラから離れすぎたら回り込ませる
      if (x < center.x - hx) x += this.box.x;
      if (x > center.x + hx) x -= this.box.x;
      if (z < center.z - hz) z += this.box.z;
      if (z > center.z + hz) z -= this.box.z;
      this.positions[o] = x;
      this.positions[o + 1] = y;
      this.positions[o + 2] = z;
      this.positions[o + 3] = x - windX * slant;
      this.positions[o + 4] = y + 0.45;
      this.positions[o + 5] = z - windZ * slant;
    }
    this.lines.geometry.getAttribute("position").needsUpdate = true;
  }
}

/** 川の流れを見せる泡・木の葉 */
export class FlowParticles {
  readonly mesh: THREE.InstancedMesh;
  private px: Float32Array;
  private pz: Float32Array;
  private rot: Float32Array;
  private kind: Uint8Array;
  private readonly count = 1400;
  private readonly radius = 70;
  private dummy = new THREE.Object3D();

  constructor(private stage: StageDef, private cond: Conditions, dotTex: THREE.Texture) {
    const geo = new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2);
    const mat = new THREE.MeshBasicMaterial({
      map: dotTex,
      transparent: true,
      depthWrite: false,
      opacity: 0.55,
    });
    this.mesh = new THREE.InstancedMesh(geo, mat, this.count);
    this.mesh.frustumCulled = false;
    this.mesh.renderOrder = 1;
    this.px = new Float32Array(this.count);
    this.pz = new Float32Array(this.count);
    this.rot = new Float32Array(this.count);
    this.kind = new Uint8Array(this.count);
    const col = new THREE.Color();
    for (let i = 0; i < this.count; i++) {
      this.respawn(i, 0, 0, true);
      this.kind[i] = Math.random() < 0.12 ? 1 : 0;
      if (this.kind[i] === 1) col.setRGB(0.5 + Math.random() * 0.3, 0.38 + Math.random() * 0.2, 0.12);
      else col.setRGB(0.92, 0.95, 0.96);
      this.mesh.setColorAt(i, col);
    }
  }

  setConditions(cond: Conditions) {
    this.cond = cond;
  }

  private respawn(i: number, cx: number, cz: number, anywhere: boolean) {
    for (let a = 0; a < 10; a++) {
      const x = anywhere ? cx + (Math.random() - 0.5) * this.radius * 2 : cx - this.radius + Math.random() * 6;
      const hw = riverHalfWidthAt(this.stage, x);
      const z = riverCenterZ(this.stage, x) + (Math.random() * 2 - 1) * hw * 0.97;
      if (Math.abs(z - cz) > this.radius * 1.5) continue;
      this.px[i] = x;
      this.pz[i] = z;
      this.rot[i] = Math.random() * Math.PI;
      return;
    }
    this.px[i] = cx;
    this.pz[i] = riverCenterZ(this.stage, cx);
  }

  update(dt: number, center: THREE.Vector3, time: number) {
    for (let i = 0; i < this.count; i++) {
      const c = currentAt(this.stage, this.cond, this.px[i], this.pz[i]);
      this.px[i] += c * dt;
      this.pz[i] += Math.sin(time * 0.7 + i) * 0.05 * dt;
      if (this.px[i] > center.x + this.radius || this.px[i] < center.x - this.radius * 1.2 || Math.abs(this.pz[i] - center.z) > this.radius * 1.6 || distanceFromWater(this.stage, this.px[i], this.pz[i]) > -0.2) {
        this.respawn(i, center.x, center.z, this.px[i] < center.x - this.radius * 1.2 || Math.abs(this.pz[i] - center.z) > this.radius * 1.6);
      }
      const leaf = this.kind[i] === 1;
      // 速い流れほど泡が流れ方向に伸びる
      const stretch = leaf ? 1 : 1 + c * 1.4;
      const size = leaf ? 0.09 : 0.12 + (i % 5) * 0.05;
      this.dummy.position.set(this.px[i], 0.02, this.pz[i]);
      this.dummy.rotation.set(0, leaf ? this.rot[i] + time * 0.3 : 0, 0);
      this.dummy.scale.set(size * stretch, 1, size);
      this.dummy.updateMatrix();
      this.mesh.setMatrixAt(i, this.dummy.matrix);
    }
    this.mesh.instanceMatrix.needsUpdate = true;
  }
}
