export interface AudioSettings {
  muted: boolean;
  masterVolume: number;
  sfxVolume: number;
  ambienceVolume: number;
}

const STORAGE_KEY = 'islehold_audio_settings';

function loadAudioSettings(): AudioSettings {
  const defaults: AudioSettings = {
    muted: false,
    masterVolume: 0.85,
    sfxVolume: 0.85,
    ambienceVolume: 0.4,
  };
  if (typeof window === 'undefined') return defaults;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaults;
    const parsed = JSON.parse(raw);
    return {
      muted: Boolean(parsed.muted),
      masterVolume:
        typeof parsed.masterVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.masterVolume))
          : defaults.masterVolume,
      sfxVolume:
        typeof parsed.sfxVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.sfxVolume))
          : defaults.sfxVolume,
      ambienceVolume:
        typeof parsed.ambienceVolume === 'number'
          ? Math.max(0, Math.min(1, parsed.ambienceVolume))
          : defaults.ambienceVolume,
    };
  } catch {
    return defaults;
  }
}

function saveAudioSettings(settings: AudioSettings) {
  if (typeof window === 'undefined') return;
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    // ignore storage errors
  }
}

class TabletopAudio {
  private ctx: AudioContext | null = null;
  private sfxMasterGain: GainNode | null = null;
  private ambienceGain: GainNode | null = null;
  private ambienceStarted = false;
  private noiseBuffer: AudioBuffer | null = null;
  private settings: AudioSettings = loadAudioSettings();

  public get muted(): boolean {
    return this.settings.muted;
  }
  public set muted(val: boolean) {
    this.settings.muted = val;
    saveAudioSettings(this.settings);
    this.syncGains();
  }

  public get masterVolume(): number {
    return this.settings.masterVolume;
  }
  public set masterVolume(val: number) {
    this.settings.masterVolume = Math.max(0, Math.min(1, val));
    saveAudioSettings(this.settings);
    this.syncGains();
  }

  public get sfxVolume(): number {
    return this.settings.sfxVolume;
  }
  public set sfxVolume(val: number) {
    this.settings.sfxVolume = Math.max(0, Math.min(1, val));
    saveAudioSettings(this.settings);
    this.syncGains();
  }

  public get ambienceVolume(): number {
    return this.settings.ambienceVolume;
  }
  public set ambienceVolume(val: number) {
    this.settings.ambienceVolume = Math.max(0, Math.min(1, val));
    saveAudioSettings(this.settings);
    this.syncGains();
  }

  public getSettings(): AudioSettings {
    return { ...this.settings };
  }

  private getEffectiveSfxGain(): number {
    if (this.settings.muted) return 0;
    return this.settings.masterVolume * this.settings.sfxVolume;
  }

  private getEffectiveAmbienceGain(): number {
    if (this.settings.muted) return 0;
    return this.settings.masterVolume * this.settings.ambienceVolume * 0.14;
  }

  private syncGains() {
    if (!this.ctx) return;
    const now = this.ctx.currentTime;
    if (this.sfxMasterGain) {
      this.sfxMasterGain.gain.setTargetAtTime(this.getEffectiveSfxGain(), now, 0.04);
    }
    if (this.ambienceGain) {
      this.ambienceGain.gain.setTargetAtTime(
        this.getEffectiveAmbienceGain(),
        now,
        0.15,
      );
    }
  }

  private ensureContext(): AudioContext | null {
    if (typeof window === 'undefined') return null;
    if (!this.ctx) {
      const AC =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext?: typeof AudioContext })
          .webkitAudioContext;
      if (!AC) return null;
      this.ctx = new AC();
      this.sfxMasterGain = this.ctx.createGain();
      this.sfxMasterGain.gain.value = this.getEffectiveSfxGain();
      this.sfxMasterGain.connect(this.ctx.destination);

      this.ambienceGain = this.ctx.createGain();
      this.ambienceGain.gain.value = this.getEffectiveAmbienceGain();
      this.ambienceGain.connect(this.ctx.destination);

      // Build reusable 3-second soft pink-filtered noise buffer
      const length = this.ctx.sampleRate * 3;
      const buf = this.ctx.createBuffer(1, length, this.ctx.sampleRate);
      const data = buf.getChannelData(0);
      let b0 = 0;
      let b1 = 0;
      let b2 = 0;
      for (let i = 0; i < length; i++) {
        const white = Math.random() * 2 - 1;
        b0 = 0.997 * b0 + white * 0.029;
        b1 = 0.985 * b1 + white * 0.032;
        b2 = 0.95 * b2 + white * 0.048;
        data[i] = (b0 + b1 + b2 + white * 0.03) * 0.5;
      }
      this.noiseBuffer = buf;
    }
    if (this.ctx.state === 'suspended') {
      this.ctx.resume().catch(() => {});
    }
    this.ensureAmbience();
    return this.ctx;
  }

  public unlockAndStartAmbience() {
    this.ensureContext();
  }

  private ensureAmbience() {
    if (this.ambienceStarted || !this.ctx || !this.ambienceGain || !this.noiseBuffer) {
      return;
    }
    this.ambienceStarted = true;

    const src = this.ctx.createBufferSource();
    src.buffer = this.noiseBuffer;
    src.loop = true;

    const lowpass = this.ctx.createBiquadFilter();
    lowpass.type = 'lowpass';
    lowpass.frequency.value = 340;
    lowpass.Q.value = 0.6;

    // Gentle wave-swell modulation (0.11 Hz -> ~9 sec ocean swell)
    const lfo = this.ctx.createOscillator();
    const lfoGain = this.ctx.createGain();
    lfo.type = 'sine';
    lfo.frequency.value = 0.11;
    lfoGain.gain.value = 180;
    lfo.connect(lfoGain).connect(lowpass.frequency);

    src.connect(lowpass).connect(this.ambienceGain);
    src.start();
    lfo.start();
  }

  public playUiClick() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(540, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.03);
    gain.gain.setValueAtTime(0.08, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.035);
    osc.connect(gain).connect(this.sfxMasterGain);
    osc.start(now);
    osc.stop(now + 0.04);
  }

  public playWoodPlace(pitch = 1) {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;

    // Warm carved timber body knock
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(205 * pitch, now);
    osc.frequency.exponentialRampToValueAtTime(72 * pitch, now + 0.095);
    gain.gain.setValueAtTime(0.24, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);
    osc.connect(gain).connect(this.sfxMasterGain);
    osc.start(now);
    osc.stop(now + 0.13);

    // Subtle crisp snap transient
    const click = ctx.createOscillator();
    const clickGain = ctx.createGain();
    click.type = 'sine';
    click.frequency.setValueAtTime(640 * pitch, now);
    click.frequency.exponentialRampToValueAtTime(240 * pitch, now + 0.025);
    clickGain.gain.setValueAtTime(0.09, now);
    clickGain.gain.exponentialRampToValueAtTime(0.001, now + 0.03);
    click.connect(clickGain).connect(this.sfxMasterGain);
    click.start(now);
    click.stop(now + 0.035);
  }

  public playCityUpgrade() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;

    // Stone foundation thud
    const bass = ctx.createOscillator();
    const bassGain = ctx.createGain();
    bass.type = 'sine';
    bass.frequency.setValueAtTime(125, now);
    bass.frequency.exponentialRampToValueAtTime(48, now + 0.18);
    bassGain.gain.setValueAtTime(0.25, now);
    bassGain.gain.exponentialRampToValueAtTime(0.001, now + 0.2);
    bass.connect(bassGain).connect(this.sfxMasterGain);
    bass.start(now);
    bass.stop(now + 0.21);

    // Citadel brass chime arpeggio
    const notes = [261.63, 329.63, 392.0, 523.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.06;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.32);
      osc.connect(gain).connect(this.sfxMasterGain!);
      osc.start(t);
      osc.stop(t + 0.34);
    });
  }

  public playDiceRoll() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;

    // Tactile ivory dice clacks bouncing inside felt/wood tray
    for (let i = 0; i < 7; i++) {
      const t = now + i * 0.072 + Math.random() * 0.025;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = i % 2 === 0 ? 'triangle' : 'square';
      osc.frequency.setValueAtTime(260 + Math.random() * 210, t);
      osc.frequency.exponentialRampToValueAtTime(95, t + 0.036);
      gain.gain.setValueAtTime(0.085 * (1 - i * 0.1), t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.045);
      osc.connect(gain).connect(this.sfxMasterGain);
      osc.start(t);
      osc.stop(t + 0.05);
    }
  }

  public playResourceCollect() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;
    const notes = [523.25, 659.25];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.065;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.08, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.18);
      osc.connect(gain).connect(this.sfxMasterGain!);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  }

  public playCardDraw() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;

    if (this.noiseBuffer) {
      const noise = ctx.createBufferSource();
      noise.buffer = this.noiseBuffer;
      const filter = ctx.createBiquadFilter();
      filter.type = 'bandpass';
      filter.frequency.setValueAtTime(1900, now);
      filter.Q.value = 1.4;
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.18, now);
      gain.gain.exponentialRampToValueAtTime(0.001, now + 0.14);
      noise.connect(filter).connect(gain).connect(this.sfxMasterGain);
      noise.start(now);
      noise.stop(now + 0.16);
    }

    const chime = ctx.createOscillator();
    const cGain = ctx.createGain();
    chime.type = 'sine';
    chime.frequency.setValueAtTime(784, now + 0.04);
    cGain.gain.setValueAtTime(0.07, now + 0.04);
    cGain.gain.exponentialRampToValueAtTime(0.001, now + 0.22);
    chime.connect(cGain).connect(this.sfxMasterGain);
    chime.start(now + 0.04);
    chime.stop(now + 0.24);
  }

  public playTradeCoin() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;
    [987.77, 1318.51].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      const t = now + i * 0.075;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.1, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.22);
      osc.connect(gain).connect(this.sfxMasterGain!);
      osc.start(t);
      osc.stop(t + 0.25);
    });
  }

  public playTurnBell() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, now);
    osc.frequency.exponentialRampToValueAtTime(880, now + 0.14);
    gain.gain.setValueAtTime(0.1, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.32);
    osc.connect(gain).connect(this.sfxMasterGain);
    osc.start(now);
    osc.stop(now + 0.35);
  }

  public playRobberThud() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(115, now);
    osc.frequency.exponentialRampToValueAtTime(42, now + 0.24);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.26);
    osc.connect(gain).connect(this.sfxMasterGain);
    osc.start(now);
    osc.stop(now + 0.27);
  }

  public playTileFlip() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(310, now);
    osc.frequency.exponentialRampToValueAtTime(140, now + 0.075);
    gain.gain.setValueAtTime(0.16, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.09);
    osc.connect(gain).connect(this.sfxMasterGain);
    osc.start(now);
    osc.stop(now + 0.1);
  }

  public playTileShuffle() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;
    for (let i = 0; i < 6; i++) {
      const t = now + i * 0.05;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      osc.frequency.setValueAtTime(220 + i * 32, t);
      osc.frequency.exponentialRampToValueAtTime(110, t + 0.045);
      gain.gain.setValueAtTime(0.095, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.055);
      osc.connect(gain).connect(this.sfxMasterGain);
      osc.start(t);
      osc.stop(t + 0.06);
    }
  }

  public playVictoryFanfare() {
    if (this.getEffectiveSfxGain() <= 0.001) return;
    const ctx = this.ensureContext();
    if (!ctx || !this.sfxMasterGain) return;
    const now = ctx.currentTime;
    const notes = [392, 523.25, 659.25, 783.99, 1046.5];
    notes.forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'triangle';
      const t = now + i * 0.11;
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.15, t);
      gain.gain.exponentialRampToValueAtTime(0.001, t + 0.48);
      osc.connect(gain).connect(this.sfxMasterGain!);
      osc.start(t);
      osc.stop(t + 0.5);
    });
  }
}

export const tabletopAudio = new TabletopAudio();

