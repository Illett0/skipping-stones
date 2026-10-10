import * as THREE from "three";
import { Sky } from "three/examples/jsm/objects/Sky.js";
import { Water } from "three/examples/jsm/objects/Water.js";
import { previewArc, releasePoint, throwDirection, throwerPosition } from "@/game/physics";
import { distanceFromWater, nearEdgeZ, riverCenterZ } from "@/game/stages";
import { STONE_FIELD } from "@/game/stones";
import { terrainHeight } from "@/game/terrain";
import type { Conditions, StageDef, StoneSpec, ThrowResult } from "@/game/types";
import { FlowParticles, RainSystem, SplashSystem } from "./effects";
import { buildStoneGeometry, STONE_VISUAL_SCALE, stoneMaterial } from "./stoneMesh";
import { buildTerrain } from "./terrainMesh";
import { createGrassTexture, createGroundDetail, createRippleTexture, createSoftDot, createWaterNormals } from "./textures";
import { buildGrass, buildRocks, buildTrees, type SwayUniforms } from "./vegetation";

export type SceneMode = "overview" | "select" | "position" | "aim" | "power" | "flight" | "result";

export interface SceneCallbacks {
  onHoverStone?: (id: string | null) => void;
  onPickStone?: (id: string) => void;
  onBounce?: (count: number) => void;
  onFlightEnd?: () => void;
}

interface Atmosphere {
  turbidity: number;
  rayleigh: number;
  mie: number;
  mieG: number;
  cloudCoverage: number;
  cloudDensity: number;
  sunIntensity: number;
  sunColor: THREE.Color;
  hemiSky: THREE.Color;
  hemiGround: THREE.Color;
  hemiIntensity: number;
  fogColor: THREE.Color;
  fogDensity: number;
  exposure: number;
  envIntensity: number;
}

const UP = new THREE.Vector3(0, 1, 0);

export class GameScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera: THREE.PerspectiveCamera;
  private clock = new THREE.Timer();
  private raf = 0;
  private resizeObserver: ResizeObserver;

  private sky: Sky;
  private envSky: Sky;
  private envScene = new THREE.Scene();
  private pmrem: THREE.PMREMGenerator;
  private envTarget: THREE.WebGLRenderTarget | null = null;
  private sun = new THREE.DirectionalLight(0xffffff, 2);
  private hemi = new THREE.HemisphereLight(0xbfd6ff, 0x4a4030, 0.6);
  private sunDir = new THREE.Vector3(0, 1, 0);
  private water: Water;
  private flowOffset = new THREE.Vector2();
  private reflectionSkip: THREE.Object3D[] = [];

  private world = new THREE.Group();
  private stoneGroup = new THREE.Group();
  // 何千個もの石を描くため、石は「形の種類 × 区画」ごとの InstancedMesh にまとめる
  private stoneMeshes = new Map<string, { mesh: THREE.InstancedMesh; index: number; spec: StoneSpec }>();
  private stoneVariants: THREE.BufferGeometry[] = [];
  private ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  private stoneMat = stoneMaterial();
  private selectRing: THREE.Mesh;
  private hoverRing: THREE.Mesh;
  private thrower = new THREE.Group();
  private arcLine: THREE.Line;
  private heldStone: THREE.Mesh | null = null;
  private flightStone: THREE.Mesh | null = null;

  private textures: {
    water: THREE.Texture;
    ground: THREE.Texture;
    grass: THREE.Texture;
    dot: THREE.Texture;
    ripple: THREE.Texture;
  };
  private splash: SplashSystem;
  private rain = new RainSystem();
  private flow: FlowParticles | null = null;
  private sway: SwayUniforms = { time: { value: 0 }, wind: { value: 2 } };

  private stage: StageDef | null = null;
  private cond: Conditions | null = null;
  private mode: SceneMode = "overview";
  private stones: StoneSpec[] = [];
  private selectedId: string | null = null;
  private hoveredId: string | null = null;
  private throwX = 0;
  private yaw = 0;
  private elevation = 10;

  private camPos = new THREE.Vector3(0, 30, 120);
  private camLook = new THREE.Vector3();
  private desiredPos = new THREE.Vector3();
  private desiredLook = new THREE.Vector3();
  private pointer = new THREE.Vector2(9, 9);
  private raycaster = new THREE.Raycaster();
  private overviewAngle = 0;

  private flight: {
    result: ThrowResult;
    t: number;
    sampleIdx: number;
    bounceIdx: number;
    ended: boolean;
    endTimer: number;
    pos: THREE.Vector3;
    dir: THREE.Vector3;
    spin: number;
  } | null = null;

  constructor(
    private container: HTMLElement,
    private callbacks: SceneCallbacks = {},
  ) {
    this.renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: "high-performance" });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 0.6;
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.domElement.style.display = "block";
    this.renderer.domElement.style.touchAction = "none";
    container.appendChild(this.renderer.domElement);

    this.camera = new THREE.PerspectiveCamera(50, 1, 0.05, 12000);
    this.pmrem = new THREE.PMREMGenerator(this.renderer);

    this.textures = {
      water: createWaterNormals(),
      ground: createGroundDetail(),
      grass: createGrassTexture(),
      dot: createSoftDot(),
      ripple: createRippleTexture(),
    };

    this.sky = new Sky();
    this.sky.scale.setScalar(10000);
    this.scene.add(this.sky);
    this.envSky = new Sky();
    this.envSky.scale.setScalar(10000);
    this.envScene.add(this.envSky);

    this.sun.castShadow = true;
    this.sun.shadow.mapSize.set(2048, 2048);
    const sc = this.sun.shadow.camera;
    sc.left = -30;
    sc.right = 30;
    sc.top = 30;
    sc.bottom = -30;
    sc.near = 1;
    sc.far = 400;
    this.sun.shadow.bias = -0.0004;
    this.sun.shadow.normalBias = 0.02;
    this.scene.add(this.sun, this.sun.target, this.hemi);

    this.water = new Water(new THREE.PlaneGeometry(6000, 6000), {
      textureWidth: 512,
      textureHeight: 512,
      waterNormals: this.textures.water,
      sunDirection: this.sunDir.clone(),
      sunColor: 0xffffff,
      waterColor: 0x1b3d36,
      distortionScale: 2.5,
      fog: true,
      // わずかに透けて浅瀬の川底が見える
      alpha: 0.86,
    });
    (this.water.material as THREE.ShaderMaterial).transparent = true;
    this.water.rotation.x = -Math.PI / 2;
    this.water.position.y = 0;
    const wm = this.water.material as THREE.ShaderMaterial;
    wm.uniforms.flowOffset = { value: this.flowOffset };
    wm.uniforms.size.value = 2.2;
    wm.fragmentShader = wm.fragmentShader
      .replace("uniform float size;", "uniform float size;\nuniform vec2 flowOffset;")
      .replace("getNoise( worldPosition.xz * size )", "getNoise( ( worldPosition.xz - flowOffset ) * size )")
      // 近距離で反射が歪みすぎないように
      .replace("( 0.001 + 1.0 / distance )", "( 0.001 + 1.0 / ( distance + 12.0 ) )");
    // 反射用の描画では細かい物（小石・草・水面の粒子）を省いて軽くする
    const baseBeforeRender = this.water.onBeforeRender.bind(this.water);
    this.water.onBeforeRender = (...args: Parameters<THREE.Object3D["onBeforeRender"]>) => {
      const extra = [this.flow?.mesh, this.splash.group, this.rain.lines, this.stoneGroup];
      const hidden: THREE.Object3D[] = [];
      for (const o of [...this.reflectionSkip, ...extra]) {
        if (o && o.visible) {
          o.visible = false;
          hidden.push(o);
        }
      }
      baseBeforeRender(...args);
      for (const o of hidden) o.visible = true;
    };
    this.scene.add(this.water);

    this.scene.add(this.world, this.stoneGroup);

    const ringGeo = this.ringGeo;
    this.selectRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffd27a, transparent: true, opacity: 0.9, depthWrite: false }),
    );
    this.selectRing.visible = false;
    this.selectRing.renderOrder = 3;
    this.hoverRing = new THREE.Mesh(
      ringGeo,
      new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55, depthWrite: false }),
    );
    this.hoverRing.visible = false;
    this.hoverRing.renderOrder = 3;
    this.scene.add(this.selectRing, this.hoverRing);

    this.buildThrowerMarker();
    this.arcLine = new THREE.Line(
      new THREE.BufferGeometry(),
      new THREE.LineDashedMaterial({ color: 0xffffff, dashSize: 0.35, gapSize: 0.22, transparent: true, opacity: 0.9, depthTest: false }),
    );
    this.arcLine.renderOrder = 5;
    this.arcLine.visible = false;
    this.scene.add(this.arcLine);

    this.splash = new SplashSystem(this.textures.ripple, this.textures.dot);
    this.scene.add(this.splash.group, this.rain.lines);

    const el = this.renderer.domElement;
    el.addEventListener("pointermove", this.onPointerMove);
    el.addEventListener("pointerleave", this.onPointerLeave);
    el.addEventListener("click", this.onClick);

    if (process.env.NODE_ENV !== "production") (window as unknown as { __game: GameScene }).__game = this;

    this.resizeObserver = new ResizeObserver(() => this.resize());
    this.resizeObserver.observe(container);
    this.resize();
    this.loop();
  }

  // ---------- 公開 API ----------

  setStage(stage: StageDef, cond: Conditions) {
    this.stage = stage;
    this.disposeGroup(this.world);
    this.world.clear();

    this.world.add(buildTerrain(stage, this.textures.ground));
    this.world.add(buildRocks(stage));
    this.world.add(buildTrees(stage, this.sway));
    this.world.add(buildGrass(stage, this.textures.grass, this.sway));
    this.reflectionSkip = [];
    this.world.traverse((o) => {
      if (o.userData.skipReflection) this.reflectionSkip.push(o);
    });

    if (this.flow) {
      this.scene.remove(this.flow.mesh);
      this.flow.mesh.geometry.dispose();
    }
    this.flow = new FlowParticles(stage, cond, this.textures.dot);
    this.scene.add(this.flow.mesh);

    (this.water.material as THREE.ShaderMaterial).uniforms.waterColor.value.setHex(stage.waterColor);
    this.throwX = 0;
    this.overviewAngle = 0;
    this.setConditions(cond);
    this.snapCamera();
  }

  setConditions(cond: Conditions) {
    if (!this.stage) return;
    this.cond = cond;
    this.flow?.setConditions(cond);
    this.applyAtmosphere(this.stage, cond);
  }

  setStones(stones: StoneSpec[]) {
    if (!this.stage) return;
    // 形の種類（底面の平らさ 4 段階 × いびつさ 3 段階）は単位サイズで 1 回だけ作る
    if (this.stoneVariants.length === 0) {
      for (let fi = 0; fi < 4; fi++) {
        for (let ii = 0; ii < 3; ii++) {
          const unit = 200 / STONE_VISUAL_SCALE;
          this.stoneVariants.push(
            buildStoneGeometry({ id: "", seed: 101 + fi * 7 + ii, length: unit, width: unit, thickness: unit, flatness: fi / 3, irregularity: ii / 2, mass: 0, color: [1, 1, 1], x: 0, z: 0, rotY: 0 }, 2),
          );
        }
      }
    }
    for (const m of [...this.stoneGroup.children]) {
      this.stoneGroup.remove(m);
      (m as THREE.InstancedMesh).dispose();
    }
    this.stoneMeshes.clear();
    const buckets = new Map<string, StoneSpec[]>();
    for (const s of stones) {
      const key = `${Math.round(s.flatness * 3) * 3 + Math.round(s.irregularity * 2)},${Math.floor(s.x / 8)}`;
      let b = buckets.get(key);
      if (!b) buckets.set(key, (b = []));
      b.push(s);
    }
    const color = new THREE.Color();
    for (const [key, list] of buckets) {
      const mesh = new THREE.InstancedMesh(this.stoneVariants[Number(key.split(",")[0])], this.stoneMat, list.length);
      list.forEach((s, i) => {
        mesh.setMatrixAt(i, this.stoneMatrix(s));
        mesh.setColorAt(i, color.setRGB(s.color[0], s.color[1], s.color[2], THREE.SRGBColorSpace));
        this.stoneMeshes.set(s.id, { mesh, index: i, spec: s });
      });
      mesh.userData.ids = list.map((s) => s.id);
      mesh.computeBoundingSphere();
      mesh.receiveShadow = true;
      this.stoneGroup.add(mesh);
    }
    this.stones = stones;
    this.updateRings();
  }

  private stoneMatrix(s: StoneSpec, hidden = false) {
    const k = STONE_VISUAL_SCALE / 200;
    return new THREE.Matrix4().compose(
      new THREE.Vector3(s.x, terrainHeight(this.stage!, s.x, s.z) - 0.006, s.z),
      new THREE.Quaternion().setFromAxisAngle(UP, s.rotY),
      hidden ? new THREE.Vector3(0, 0, 0) : new THREE.Vector3(s.length * k, s.thickness * k, s.width * k),
    );
  }

  setSelectedStone(id: string | null) {
    this.selectedId = id;
    this.updateRings();
  }

  setMode(mode: SceneMode) {
    const prev = this.mode;
    this.mode = mode;
    const throwing = mode === "position" || mode === "aim" || mode === "power";
    this.thrower.visible = throwing;
    this.arcLine.visible = mode === "aim" || mode === "power";
    (this.arcLine.material as THREE.LineDashedMaterial).opacity = mode === "aim" ? 0.95 : 0.35;
    if (mode !== "select") {
      this.hoveredId = null;
      this.callbacks.onHoverStone?.(null);
    }
    // 手に持っている石
    const selected = this.selectedId ? this.stoneMeshes.get(this.selectedId) : undefined;
    if (selected) {
      // 拾った石は河原から消す
      selected.mesh.setMatrixAt(selected.index, this.stoneMatrix(selected.spec, throwing || mode === "flight" || mode === "result"));
      selected.mesh.instanceMatrix.needsUpdate = true;
    }
    if (this.heldStone) {
      this.scene.remove(this.heldStone);
      this.heldStone.geometry.dispose();
      this.heldStone = null;
    }
    if (throwing && selected) {
      this.heldStone = new THREE.Mesh(buildStoneGeometry(selected.spec), this.stoneMat);
      this.heldStone.castShadow = true;
      this.scene.add(this.heldStone);
    }
    if (mode !== "flight" && mode !== "result" && this.flightStone) {
      this.scene.remove(this.flightStone);
      this.flightStone.geometry.dispose();
      this.flightStone = null;
      this.flight = null;
    }
    this.updateRings();
    this.updateThrower();
    // タイトルや投擲結果から河原へ戻るときは一瞬で切り替える
    if ((prev === "overview" || prev === "result" || prev === "flight") && mode !== prev) this.snapCamera();
  }

  setThrow(x: number, yawDeg: number, elevationDeg: number) {
    this.throwX = x;
    this.yaw = yawDeg;
    this.elevation = elevationDeg;
    this.updateThrower();
  }

  startFlight(result: ThrowResult) {
    const selected = this.selectedId ? this.stoneMeshes.get(this.selectedId) : undefined;
    if (!selected) return;
    if (this.heldStone) {
      this.scene.remove(this.heldStone);
      this.heldStone.geometry.dispose();
      this.heldStone = null;
    }
    this.flightStone = new THREE.Mesh(buildStoneGeometry(selected.spec), this.stoneMat);
    this.flightStone.castShadow = true;
    this.scene.add(this.flightStone);
    const s0 = result.samples[0];
    const dir = throwDirection(this.yaw);
    this.flight = {
      result,
      t: 0,
      sampleIdx: 0,
      bounceIdx: 0,
      ended: false,
      endTimer: 0,
      pos: new THREE.Vector3(s0.x, s0.y, s0.z),
      dir: new THREE.Vector3(dir.x, 0, dir.z),
      spin: 0,
    };
    this.mode = "flight";
    this.thrower.visible = false;
    this.arcLine.visible = false;
  }

  dispose() {
    cancelAnimationFrame(this.raf);
    this.resizeObserver.disconnect();
    const el = this.renderer.domElement;
    el.removeEventListener("pointermove", this.onPointerMove);
    el.removeEventListener("pointerleave", this.onPointerLeave);
    el.removeEventListener("click", this.onClick);
    this.disposeGroup(this.scene);
    this.envTarget?.dispose();
    this.pmrem.dispose();
    this.renderer.dispose();
    el.remove();
  }

  // ---------- 内部処理 ----------

  private disposeGroup(obj: THREE.Object3D) {
    obj.traverse((o) => {
      const mesh = o as THREE.Mesh;
      if (mesh.geometry) mesh.geometry.dispose();
      const mat = mesh.material as THREE.Material | THREE.Material[] | undefined;
      if (Array.isArray(mat)) mat.forEach((m) => m.dispose());
      else if (mat && mat !== this.stoneMat) mat.dispose();
    });
  }

  private atmosphereFor(stage: StageDef, cond: Conditions): Atmosphere {
    const fog = new THREE.Color().setRGB(...stage.fogColor, THREE.SRGBColorSpace);
    const sunset = stage.sunElevation < 10;
    const base: Atmosphere = {
      turbidity: sunset ? 7 : 3,
      rayleigh: sunset ? 2.6 : 1.4,
      mie: 0.005,
      mieG: sunset ? 0.86 : 0.8,
      cloudCoverage: 0.28,
      cloudDensity: 0.45,
      sunIntensity: sunset ? 2.2 : 3.0,
      sunColor: sunset ? new THREE.Color(1.0, 0.68, 0.42) : new THREE.Color(1.0, 0.96, 0.9),
      hemiSky: sunset ? new THREE.Color(0.85, 0.7, 0.75) : new THREE.Color(0.75, 0.85, 1.0),
      hemiGround: new THREE.Color(0.35, 0.3, 0.22),
      hemiIntensity: 0.55,
      fogColor: fog,
      fogDensity: stage.id === "misty-gorge" ? 0.0022 : 0.0009,
      exposure: sunset ? 0.55 : 0.5,
      envIntensity: 0.55,
    };
    if (cond.weather === "cloudy") {
      return {
        ...base,
        turbidity: 8,
        rayleigh: 1.0,
        cloudCoverage: 0.66,
        cloudDensity: 0.7,
        sunIntensity: base.sunIntensity * 0.45,
        hemiIntensity: 0.8,
        fogColor: fog.clone().lerp(new THREE.Color(0.55, 0.58, 0.6), 0.5),
        fogDensity: base.fogDensity * 1.5,
        exposure: base.exposure * 1.1,
      };
    }
    if (cond.weather === "rainy") {
      return {
        ...base,
        turbidity: 14,
        rayleigh: 0.5,
        mie: 0.02,
        cloudCoverage: 0.97,
        cloudDensity: 1.0,
        sunIntensity: 0.7,
        sunColor: new THREE.Color(0.85, 0.88, 0.92),
        hemiSky: new THREE.Color(0.62, 0.66, 0.7),
        hemiGround: new THREE.Color(0.22, 0.22, 0.2),
        hemiIntensity: 1.5,
        fogColor: new THREE.Color().setRGB(0.42, 0.45, 0.47, THREE.SRGBColorSpace),
        fogDensity: stage.id === "misty-gorge" ? 0.011 : 0.0075,
        exposure: 0.62,
        envIntensity: 0.8,
      };
    }
    return base;
  }

  private applyAtmosphere(stage: StageDef, cond: Conditions) {
    const a = this.atmosphereFor(stage, cond);
    const elev = cond.weather === "rainy" ? Math.max(stage.sunElevation, 20) : stage.sunElevation;
    this.sunDir.setFromSphericalCoords(1, THREE.MathUtils.degToRad(90 - elev), THREE.MathUtils.degToRad(stage.sunAzimuth));

    for (const sky of [this.sky, this.envSky]) {
      const u = sky.material.uniforms;
      u.turbidity.value = a.turbidity;
      u.rayleigh.value = a.rayleigh;
      u.mieCoefficient.value = a.mie;
      u.mieDirectionalG.value = a.mieG;
      u.sunPosition.value.copy(this.sunDir);
      u.cloudCoverage.value = a.cloudCoverage;
      u.cloudDensity.value = a.cloudDensity;
      u.cloudSpeed.value = 0.00001 + cond.windSpeed * 0.000006;
      u.showSunDisc.value = cond.weather === "rainy" ? 0 : 1;
    }

    this.sun.color.copy(a.sunColor);
    this.sun.intensity = a.sunIntensity;
    this.hemi.color.copy(a.hemiSky);
    this.hemi.groundColor.copy(a.hemiGround);
    this.hemi.intensity = a.hemiIntensity;
    this.scene.fog = new THREE.FogExp2(a.fogColor, a.fogDensity);
    this.renderer.toneMappingExposure = a.exposure;

    const wu = (this.water.material as THREE.ShaderMaterial).uniforms;
    wu.sunDirection.value.copy(this.sunDir);
    wu.sunColor.value.copy(a.sunColor).multiplyScalar(cond.weather === "rainy" ? 0.25 : 1);
    wu.distortionScale.value = 0.9 + cond.windSpeed * 0.18 + (cond.weather === "rainy" ? 1.2 : 0);
    wu.size.value = 7 + cond.waveAmp * 1.2;

    const rainy = cond.weather === "rainy";
    this.rain.intensity = rainy ? 1 : 0;
    this.sway.wind.value = cond.windSpeed;

    // 雨の日は一面の曇り空（物理スカイは隠して灰色の空にする）
    const overcast = a.fogColor.clone().multiplyScalar(1.25);
    this.sky.visible = !rainy;
    this.envSky.visible = !rainy;
    this.scene.background = rainy ? overcast : null;
    this.envScene.background = rainy ? overcast : null;

    // 雨に濡れた地面・石は暗く、少し艶が出る
    this.world.traverse((o) => {
      const mat = (o as THREE.Mesh).material as THREE.MeshStandardMaterial | undefined;
      if (!mat || !("roughness" in mat)) return;
      if (mat.userData.baseRoughness === undefined) mat.userData.baseRoughness = mat.roughness;
      mat.color.setScalar(rainy ? 0.72 : 1);
      mat.roughness = rainy ? Math.min(mat.userData.baseRoughness as number, 0.62) : (mat.userData.baseRoughness as number);
    });
    this.stoneMat.color.setScalar(rainy ? 0.7 : 1);
    this.stoneMat.roughness = rainy ? 0.45 : 0.78;

    // 空から環境光を作る
    this.envTarget?.dispose();
    this.envTarget = this.pmrem.fromScene(this.envScene, 0, 0.1, 20000);
    this.scene.environment = this.envTarget.texture;
    this.scene.environmentIntensity = a.envIntensity;
  }

  private buildThrowerMarker() {
    const ring = new THREE.Mesh(
      new THREE.RingGeometry(0.42, 0.52, 48).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.85, depthWrite: false }),
    );
    ring.renderOrder = 3;
    const shape = new THREE.Shape();
    shape.moveTo(-0.22, 0);
    shape.lineTo(0, 0.45);
    shape.lineTo(0.22, 0);
    shape.lineTo(0, 0.12);
    shape.closePath();
    const arrowGeo = new THREE.ShapeGeometry(shape).rotateX(-Math.PI / 2);
    const arrow = new THREE.Mesh(
      arrowGeo,
      new THREE.MeshBasicMaterial({ color: 0x9ad0ff, transparent: true, opacity: 0.85, depthWrite: false, side: THREE.DoubleSide }),
    );
    arrow.position.z = -0.65;
    arrow.renderOrder = 3;
    arrow.name = "arrow";
    const arrowPivot = new THREE.Group();
    arrowPivot.name = "arrowPivot";
    arrowPivot.add(arrow);
    this.thrower.add(ring, arrowPivot);
    this.thrower.visible = false;
    this.scene.add(this.thrower);
  }

  private updateThrower() {
    if (!this.stage) return;
    const p = throwerPosition(this.stage, this.throwX);
    this.thrower.position.set(p.x, p.ground + 0.02, p.z);
    const pivot = this.thrower.getObjectByName("arrowPivot");
    if (pivot) pivot.rotation.y = -THREE.MathUtils.degToRad(this.yaw);

    const pts = previewArc(this.stage, this.throwX, this.elevation, this.yaw).map((q) => new THREE.Vector3(q.x, q.y, q.z));
    this.arcLine.geometry.dispose();
    this.arcLine.geometry = new THREE.BufferGeometry().setFromPoints(pts);
    this.arcLine.computeLineDistances();

    if (this.heldStone) {
      const r = releasePoint(this.stage, this.throwX);
      const dir = throwDirection(this.yaw);
      this.heldStone.position.set(r.x, r.y - 0.02, r.z);
      this.heldStone.rotation.set(-THREE.MathUtils.degToRad(this.elevation) * 0.5, Math.atan2(-dir.x, -dir.z) + Math.PI / 2, 0);
    }
  }

  private updateRings() {
    const sel = this.selectedId ? this.stoneMeshes.get(this.selectedId) : undefined;
    const showSelect = !!sel && this.mode === "select";
    this.selectRing.visible = showSelect;
    if (sel && this.stage) {
      const s = sel.spec;
      this.selectRing.position.set(s.x, terrainHeight(this.stage, s.x, s.z) + 0.012, s.z);
      this.selectRing.scale.setScalar(Math.max(s.length, s.width) * 0.0125 + 0.04);
    }
    const hov = this.hoveredId && this.hoveredId !== this.selectedId ? this.stoneMeshes.get(this.hoveredId) : undefined;
    this.hoverRing.visible = !!hov && this.mode === "select";
    if (hov && this.stage) {
      const s = hov.spec;
      this.hoverRing.position.set(s.x, terrainHeight(this.stage, s.x, s.z) + 0.01, s.z);
      this.hoverRing.scale.setScalar(Math.max(s.length, s.width) * 0.0125 + 0.04);
    }
  }

  private onPointerMove = (e: PointerEvent) => {
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    if (this.mode !== "select") return;
    const id = this.pickStone();
    if (id !== this.hoveredId) {
      this.hoveredId = id;
      this.renderer.domElement.style.cursor = id ? "pointer" : "default";
      this.callbacks.onHoverStone?.(id);
      this.updateRings();
    }
  };

  private onPointerLeave = () => {
    this.pointer.set(0, 0);
  };

  private onClick = (e: MouseEvent) => {
    if (this.mode !== "select") return;
    const rect = this.renderer.domElement.getBoundingClientRect();
    this.pointer.set(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
    const id = this.pickStone();
    if (id) this.callbacks.onPickStone?.(id);
  };

  private pickStone(): string | null {
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.stoneGroup.children, false)[0];
    if (!hit || hit.instanceId === undefined) return null;
    return (hit.object.userData.ids as string[])[hit.instanceId] ?? null;
  }

  private resize() {
    const w = this.container.clientWidth || 1;
    const h = this.container.clientHeight || 1;
    this.renderer.setSize(w, h, false);
    this.renderer.domElement.style.width = "100%";
    this.renderer.domElement.style.height = "100%";
    this.camera.aspect = w / h;
    // 縦長画面では少し広角に
    this.camera.fov = w / h < 1 ? 62 : 50;
    this.camera.updateProjectionMatrix();
  }

  private computeCameraGoal(dt: number) {
    const stage = this.stage;
    if (!stage) return;
    const narrow = this.camera.aspect < 1;

    switch (this.mode) {
      case "overview": {
        this.overviewAngle += dt * 0.04;
        const cz = riverCenterZ(stage, 0);
        const target = new THREE.Vector3(Math.sin(this.overviewAngle) * 30, 0, cz);
        this.desiredLook.copy(target);
        this.desiredPos.set(target.x - 60 + Math.sin(this.overviewAngle * 0.8) * 25, 6 + stage.bankHeight * 0.3, cz + stage.riverHalfWidth * (0.55 + 0.25 * Math.sin(this.overviewAngle * 0.6)));
        this.desiredPos.y = Math.max(this.desiredPos.y, terrainHeight(stage, this.desiredPos.x, this.desiredPos.z) + 8);
        break;
      }
      case "select": {
        // 河原を歩いている位置（throwX）の周りを見る
        const bx = this.throwX;
        const fieldZ = nearEdgeZ(stage, bx) + (STONE_FIELD.dMin + STONE_FIELD.dMax) / 2;
        const focus = this.selectedId ? this.stoneMeshes.get(this.selectedId)?.spec : undefined;
        const ground = terrainHeight(stage, bx, fieldZ);
        if (focus && Math.abs(focus.x - bx) < 3) {
          const fy = terrainHeight(stage, focus.x, focus.z);
          this.desiredLook.set(focus.x, fy + 0.05, focus.z - 0.1);
          this.desiredPos.set(focus.x, fy + 1.15, focus.z + (narrow ? 1.6 : 1.25));
        } else {
          this.desiredLook.set(bx, ground, fieldZ + (narrow ? 1.2 : 0.6));
          this.desiredPos.set(bx, ground + (narrow ? 7.2 : 3.2), fieldZ + (narrow ? 7.0 : 3.0));
        }
        break;
      }
      case "position":
      case "power": {
        const r = releasePoint(stage, this.throwX);
        const d = throwDirection(this.yaw);
        const dir = new THREE.Vector3(d.x, 0, d.z);
        const right = new THREE.Vector3().crossVectors(dir, UP);
        this.desiredPos.set(r.x, r.y + 0.75, r.z).addScaledVector(dir, -3.4).addScaledVector(right, 0.7);
        this.desiredLook.set(r.x, 0, r.z).addScaledVector(dir, 22);
        this.desiredLook.y = 0;
        break;
      }
      case "aim": {
        const r = releasePoint(stage, this.throwX);
        const d = throwDirection(this.yaw);
        const dir = new THREE.Vector3(d.x, 0, d.z);
        const right = new THREE.Vector3().crossVectors(dir, UP);
        this.desiredPos.set(r.x, r.y + 0.9, r.z).addScaledVector(right, narrow ? 9 : 6.5).addScaledVector(dir, -1.5);
        this.desiredLook.set(r.x, r.y * 0.6, r.z).addScaledVector(dir, 4.5);
        break;
      }
      case "flight":
      case "result": {
        const f = this.flight;
        if (!f) break;
        const right = new THREE.Vector3().crossVectors(f.dir, UP);
        const sinking = f.ended;
        this.desiredPos
          .copy(f.pos)
          .addScaledVector(f.dir, sinking ? -6.5 : -4.6)
          .addScaledVector(right, sinking ? 2.4 : 1.1);
        this.desiredPos.y = Math.max(f.pos.y, 0) + (sinking ? 3.2 : 1.6);
        this.desiredLook.copy(f.pos).addScaledVector(f.dir, sinking ? 0.5 : 3.5);
        this.desiredLook.y = Math.max(0, this.desiredLook.y);
        if (this.mode === "result") {
          this.overviewAngle += dt * 0.15;
          this.desiredPos.addScaledVector(right, Math.sin(this.overviewAngle) * 1.5);
        }
        break;
      }
    }
  }

  private snapCamera() {
    this.computeCameraGoal(0);
    this.camPos.copy(this.desiredPos);
    this.camLook.copy(this.desiredLook);
  }

  private updateFlight(dt: number) {
    const f = this.flight;
    if (!f) return;
    f.t += dt;
    const s = f.result.samples;
    while (f.sampleIdx < s.length - 2 && s[f.sampleIdx + 1].t <= f.t) f.sampleIdx++;
    const a = s[f.sampleIdx];
    const b = s[Math.min(f.sampleIdx + 1, s.length - 1)];
    const k = b.t > a.t ? THREE.MathUtils.clamp((f.t - a.t) / (b.t - a.t), 0, 1) : 1;
    const prev = f.pos.clone();
    f.pos.set(a.x + (b.x - a.x) * k, a.y + (b.y - a.y) * k, a.z + (b.z - a.z) * k);
    const move = f.pos.clone().sub(prev);
    move.y = 0;
    if (move.lengthSq() > 1e-6 && !f.ended) f.dir.lerp(move.normalize(), 1 - Math.exp(-dt * 6)).normalize();

    while (f.bounceIdx < f.result.bounces.length && f.result.bounces[f.bounceIdx].t <= f.t) {
      const bn = f.result.bounces[f.bounceIdx];
      const strength = THREE.MathUtils.clamp(bn.speed / 25, 0.15, 1);
      this.splash.splash(bn.x, bn.z, strength * 0.8, f.dir.x * strength, f.dir.z * strength);
      f.bounceIdx++;
      this.callbacks.onBounce?.(f.bounceIdx);
    }

    if (!f.ended && f.t >= f.result.endT) {
      f.ended = true;
      if (f.result.endReason !== "far-bank") this.splash.splash(f.pos.x, f.pos.z, 1.0);
    }
    if (f.ended) {
      f.endTimer += dt;
      if (f.endTimer > 1.8 && this.mode === "flight") {
        this.mode = "result";
        this.callbacks.onFlightEnd?.();
      }
    }

    if (this.flightStone) {
      this.flightStone.position.copy(f.pos);
      f.spin += dt * (f.ended ? 2 : 28);
      const heading = Math.atan2(-f.dir.x, -f.dir.z);
      this.flightStone.rotation.set(0, 0, 0);
      this.flightStone.rotateY(heading);
      this.flightStone.rotateX(f.ended ? 0.6 : 0.18);
      this.flightStone.rotateY(f.spin);
      this.flightStone.visible = f.pos.y > -0.8;
    }
  }

  private loop = () => {
    this.raf = requestAnimationFrame(this.loop);
    this.clock.update();
    const rawDt = this.clock.getDelta();
    const dt = Math.min(rawDt, 0.1);
    const time = this.clock.getElapsed();
    this.sway.time.value = time;


    // 投擲の再生はフレーム落ちしても実時間で進める
    if (this.mode === "flight" || this.mode === "result") this.updateFlight(Math.min(rawDt, 0.25));
    this.computeCameraGoal(dt);
    const follow = this.mode === "flight" ? 5 : this.mode === "overview" ? 1.2 : 3;
    this.camPos.lerp(this.desiredPos, 1 - Math.exp(-dt * follow));
    this.camLook.lerp(this.desiredLook, 1 - Math.exp(-dt * follow * 1.4));
    if (this.stage) {
      const ground = terrainHeight(this.stage, this.camPos.x, this.camPos.z);
      if (this.camPos.y < ground + 0.25) this.camPos.y = ground + 0.25;
      if (distanceFromWater(this.stage, this.camPos.x, this.camPos.z) < 0 && this.camPos.y < 0.3) this.camPos.y = 0.3;
    }
    this.camera.position.copy(this.camPos);
    this.camera.lookAt(this.camLook);

    // 影はカメラの注視点の周りだけ
    const focus = this.camLook;
    this.sun.position.copy(focus).addScaledVector(this.sunDir, 150);
    this.sun.target.position.copy(focus);

    const wm = this.water.material as THREE.ShaderMaterial;
    const cond = this.cond;
    wm.uniforms.time.value += dt * (0.35 + (cond?.windSpeed ?? 2) * 0.06);
    if (cond) this.flowOffset.x += cond.currentBase * dt * 0.9;
    (this.sky.material.uniforms.time as { value: number }).value = time;

    this.splash.update(dt);
    if (this.flow) this.flow.update(dt, this.camLook, time);
    if (cond && this.stage) {
      const stage = this.stage;
      this.rain.update(dt, this.camera.position, Math.cos(cond.windDir) * cond.windSpeed, Math.sin(cond.windDir) * cond.windSpeed, (x, z) => {
        if (Math.random() < 0.25 && distanceFromWater(stage, x, z) < 0) this.splash.ripple(x, z, 0.35, 0.6, 0.3, false);
      });
    }

    const pulse = 0.65 + 0.3 * Math.sin(time * 4);
    (this.selectRing.material as THREE.MeshBasicMaterial).opacity = pulse;

    this.renderer.render(this.scene, this.camera);
  };
}
