// Tiny synthesized sound kit — no external audio files required.
import { BLOCK } from './blocks.js';

export class GameAudio {
  constructor() {
    this.ctx = null;
    this.noise = null;
    this.enabled = true;
    this.stepSide = 0;
  }

  async unlock() {
    if (!this.ctx) {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return;
      this.ctx = new AC();
      const len = this.ctx.sampleRate;
      const buffer = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
      const data = buffer.getChannelData(0);
      for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
      this.noise = buffer;
    }
    if (this.ctx.state === 'suspended') await this.ctx.resume();
  }

  setEnabled(enabled) {
    this.enabled = enabled;
  }

  noiseBurst({ duration = 0.13, frequency = 900, q = 1.2, gain = 0.16, type = 'bandpass' }) {
    if (!this.enabled || !this.ctx || !this.noise) return;
    const now = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this.noise;
    src.playbackRate.value = 0.85 + Math.random() * 0.3;
    const filter = this.ctx.createBiquadFilter();
    filter.type = type;
    filter.frequency.value = frequency;
    filter.Q.value = q;
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.012);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    src.connect(filter).connect(amp).connect(this.ctx.destination);
    src.start(now);
    src.stop(now + duration + 0.02);
  }

  tone({ frequency = 440, duration = 0.12, gain = 0.08, type = 'triangle', slide = 0 }) {
    if (!this.enabled || !this.ctx) return;
    const now = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(frequency, now);
    if (slide) osc.frequency.exponentialRampToValueAtTime(Math.max(30, frequency + slide), now + duration);
    const amp = this.ctx.createGain();
    amp.gain.setValueAtTime(0.0001, now);
    amp.gain.exponentialRampToValueAtTime(gain, now + 0.01);
    amp.gain.exponentialRampToValueAtTime(0.0001, now + duration);
    osc.connect(amp).connect(this.ctx.destination);
    osc.start(now);
    osc.stop(now + duration + 0.02);
  }

  mine(blockId) {
    switch (blockId) {
      case BLOCK.LOG:
      case BLOCK.PLANKS:
        this.noiseBurst({ duration: 0.16, frequency: 420, q: 0.8, gain: 0.18 });
        this.tone({ frequency: 150, duration: 0.08, gain: 0.05, type: 'sine', slide: -40 });
        break;
      case BLOCK.SAND:
      case BLOCK.DIRT:
      case BLOCK.GRASS:
        this.noiseBurst({ duration: 0.12, frequency: 620, q: 0.7, gain: 0.14, type: 'lowpass' });
        break;
      case BLOCK.LEAVES:
        this.noiseBurst({ duration: 0.17, frequency: 2100, q: 0.5, gain: 0.09, type: 'highpass' });
        break;
      case BLOCK.GLASS:
        this.noiseBurst({ duration: 0.18, frequency: 2800, q: 1.4, gain: 0.1, type: 'bandpass' });
        this.tone({ frequency: 1420, duration: 0.13, gain: 0.04, type: 'sine', slide: -500 });
        break;
      default:
        this.noiseBurst({ duration: 0.14, frequency: 900, q: 1.2, gain: 0.16 });
        this.tone({ frequency: 110, duration: 0.07, gain: 0.04, type: 'sine', slide: -30 });
    }
  }

  place(blockId) {
    this.noiseBurst({ duration: 0.08, frequency: 750, q: 1.4, gain: 0.09, type: 'lowpass' });
    this.tone({ frequency: blockId === BLOCK.GLASS ? 700 : 170, duration: 0.08, gain: 0.05, type: 'triangle', slide: -40 });
  }

  jump() {
    this.tone({ frequency: 210, duration: 0.11, gain: 0.035, type: 'sine', slide: 60 });
  }

  land() {
    this.noiseBurst({ duration: 0.07, frequency: 300, q: 0.8, gain: 0.08, type: 'lowpass' });
  }

  step(blockId) {
    this.stepSide = 1 - this.stepSide;
    const f = blockId === BLOCK.SAND ? 520 : blockId === BLOCK.PLANKS ? 330 : blockId === BLOCK.SNOW ? 900 : 260;
    this.noiseBurst({ duration: 0.055, frequency: f + this.stepSide * 30, q: 0.8, gain: 0.035, type: 'lowpass' });
  }

  click() {
    this.tone({ frequency: 640, duration: 0.04, gain: 0.03, type: 'square', slide: 80 });
  }

  goal() {
    const notes = [523, 659, 784, 1047];
    notes.forEach((f, i) => {
      window.setTimeout(() => this.tone({ frequency: f, duration: 0.22, gain: 0.055, type: 'triangle' }), i * 95);
    });
  }

  splash() {
    this.noiseBurst({ duration: 0.32, frequency: 900, q: 0.5, gain: 0.13, type: 'lowpass' });
  }
}
