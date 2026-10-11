/**
 * 環境音と効果音（音声ファイルは使わず Web Audio API で合成する）
 * - 川の流れ：流速が速いほど大きく、高い成分（ザーッという音・せせらぎ）が増える
 * - 風：風速に合わせて大きさと高さが変わり、ときどき突風でうねる
 * - 石が水面で跳ねる音・沈む音
 * ブラウザは操作されるまで音を出せないため、最初のタップ／キー入力で再生を始める。
 */
export class GameAudio {
  private ctx: AudioContext | null = null;
  private master!: GainNode;
  private riverLow!: { filter: BiquadFilterNode; gain: GainNode };
  private riverBabble!: { filter: BiquadFilterNode; gain: GainNode };
  private wind!: { filter: BiquadFilterNode; gain: GainNode };
  private noise!: AudioBuffer;
  private time = 0;
  private gust = 0;
  private muted = false;

  constructor() {
    window.addEventListener("pointerdown", this.unlock);
    window.addEventListener("keydown", this.unlock);
  }

  private unlock = () => {
    if (!this.ctx) this.init();
    if (this.ctx && this.ctx.state !== "running") void this.ctx.resume();
    if (this.ctx?.state === "running") {
      window.removeEventListener("pointerdown", this.unlock);
      window.removeEventListener("keydown", this.unlock);
    }
  };

  private init() {
    const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    this.ctx = ctx;
    this.master = ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 0.8;
    this.master.connect(ctx.destination);

    // 2 秒分のホワイトノイズを使い回す
    this.noise = ctx.createBuffer(1, ctx.sampleRate * 2, ctx.sampleRate);
    const data = this.noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;

    this.riverLow = this.loop("lowpass", 400, 0.7);
    this.riverBabble = this.loop("bandpass", 1200, 1.2);
    this.wind = this.loop("bandpass", 500, 0.8);
  }

  /** ノイズ → フィルター → 音量 のループ音を作る */
  private loop(type: BiquadFilterType, freq: number, q: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    src.loop = true;
    // ループごとに位置をずらして、同じ繰り返しに聞こえないようにする
    src.playbackRate.value = 0.9 + Math.random() * 0.2;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    filter.Q.value = q;
    const gain = ctx.createGain();
    gain.gain.value = 0;
    src.connect(filter).connect(gain).connect(this.master);
    src.start(0, Math.random() * 2);
    return { filter, gain };
  }

  /**
   * 毎フレーム呼ぶ。current: 近くの川の流速 [m/s]、wind: 風速 [m/s]、
   * waterNear: 水辺への近さ 0〜1（離れるほど川の音は小さい）
   */
  update(dt: number, current: number, wind: number, waterNear: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    this.time += dt;
    const t = ctx.currentTime;
    const smooth = 0.4;

    // 川：流れが速いほど低音のうなりが強く、せせらぎの帯域が上がる
    const flow = Math.min(current / 4, 1);
    const babble = 0.6 + 0.4 * Math.sin(this.time * 1.7) * Math.sin(this.time * 0.63 + 1);
    this.riverLow.gain.gain.setTargetAtTime((0.05 + 0.25 * flow) * waterNear, t, smooth);
    this.riverLow.filter.frequency.setTargetAtTime(250 + 650 * flow, t, smooth);
    this.riverBabble.gain.gain.setTargetAtTime((0.03 + 0.12 * flow) * babble * waterNear, t, 0.15);
    this.riverBabble.filter.frequency.setTargetAtTime(900 + 1600 * flow + 300 * babble, t, 0.15);

    // 風：ゆっくり変わる突風で、大きさと高さがうねる
    this.gust += (Math.random() - 0.5) * dt * 2;
    this.gust *= 1 - dt * 0.5;
    const strength = Math.min(wind / 12, 1);
    const swell = Math.max(0, 0.7 + 0.5 * Math.sin(this.time * 0.35) + this.gust);
    this.wind.gain.gain.setTargetAtTime(0.18 * strength * swell, t, 0.6);
    this.wind.filter.frequency.setTargetAtTime(300 + 700 * strength + 200 * swell, t, 0.6);
  }

  /** 石が水面で跳ねた音（strength 0〜1：勢いがあるほど高く大きい） */
  skip(strength: number) {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    const s = Math.max(0.15, Math.min(strength, 1));
    // ピチャッという水しぶき
    this.burst(t, 0.05, "highpass", 1800, 0.25 * s);
    // ポンという短い音程の下がる音
    const osc = ctx.createOscillator();
    osc.type = "sine";
    const f = (650 + 500 * s) * (0.9 + Math.random() * 0.2);
    osc.frequency.setValueAtTime(f, t);
    osc.frequency.exponentialRampToValueAtTime(f * 0.45, t + 0.09);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.22 * s, t + 0.005);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.15);
  }

  /** 石が沈んだ音（ドボン） */
  sink() {
    const ctx = this.ctx;
    if (!ctx || ctx.state !== "running") return;
    const t = ctx.currentTime;
    this.burst(t, 0.35, "lowpass", 1400, 0.35);
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(320, t);
    osc.frequency.exponentialRampToValueAtTime(85, t + 0.28);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(0.4, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
    osc.connect(g).connect(this.master);
    osc.start(t);
    osc.stop(t + 0.4);
  }

  /** 短いノイズのしぶき音 */
  private burst(t: number, length: number, type: BiquadFilterType, freq: number, volume: number) {
    const ctx = this.ctx!;
    const src = ctx.createBufferSource();
    src.buffer = this.noise;
    const filter = ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = freq;
    const g = ctx.createGain();
    g.gain.setValueAtTime(volume, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + length);
    src.connect(filter).connect(g).connect(this.master);
    src.start(t, Math.random() * 1.5);
    src.stop(t + length + 0.02);
  }

  /** 音を消す／戻す（再生前に呼んでも、始まったときに反映される） */
  setMuted(muted: boolean) {
    this.muted = muted;
    if (this.ctx) this.master.gain.setTargetAtTime(muted ? 0 : 0.8, this.ctx.currentTime, 0.05);
  }

  dispose() {
    window.removeEventListener("pointerdown", this.unlock);
    window.removeEventListener("keydown", this.unlock);
    void this.ctx?.close();
    this.ctx = null;
  }
}
