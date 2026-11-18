// audio.js — every sound in Solmar Bay is synthesised with WebAudio.
// No audio files are shipped: oscillators and filtered noise make the engine
// hum, the police siren, gunshots, pickups and the little mission jingles.
export class SoundBank {
  constructor() {
    this.ctx = null;
    this.master = null;
    this.muted = false;
    this.musicTimer = null;
    this.musicStep = 0;
    this.engineOsc = null;
    this.engineGain = null;
    this.sirenOsc = null;
    this.sirenGain = null;
  }

  ensure() {
    if (this.ctx) {
      if (this.ctx.state === 'suspended') this.ctx.resume();
      return true;
    }
    try {
      const AC = window.AudioContext || window.webkitAudioContext;
      if (!AC) return false;
      this.ctx = new AC();
      this.master = this.ctx.createGain();
      this.master.gain.value = 0.5;
      this.master.connect(this.ctx.destination);
    } catch {
      return false;
    }
    return true;
  }

  setMuted(m) {
    this.muted = m;
    if (this.master) this.master.gain.value = m ? 0 : 0.5;
  }

  _noiseBuffer(seconds) {
    const len = Math.floor(this.ctx.sampleRate * seconds);
    const buf = this.ctx.createBuffer(1, len, this.ctx.sampleRate);
    const data = buf.getChannelData(0);
    for (let i = 0; i < len; i++) data[i] = Math.random() * 2 - 1;
    return buf;
  }

  _blip(freq, dur, type, vol, slideTo) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const osc = this.ctx.createOscillator();
    const g = this.ctx.createGain();
    osc.type = type || 'square';
    osc.frequency.setValueAtTime(freq, t);
    if (slideTo) osc.frequency.exponentialRampToValueAtTime(Math.max(20, slideTo), t + dur);
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    osc.connect(g);
    g.connect(this.master);
    osc.start(t);
    osc.stop(t + dur + 0.02);
  }

  _noise(dur, vol, filterFreq, type) {
    if (!this.ctx || this.muted) return;
    const t = this.ctx.currentTime;
    const src = this.ctx.createBufferSource();
    src.buffer = this._noiseBuffer(dur);
    const filter = this.ctx.createBiquadFilter();
    filter.type = type || 'lowpass';
    filter.frequency.value = filterFreq || 1200;
    const g = this.ctx.createGain();
    g.gain.setValueAtTime(vol, t);
    g.gain.exponentialRampToValueAtTime(0.001, t + dur);
    src.connect(filter);
    filter.connect(g);
    g.connect(this.master);
    src.start(t);
    src.stop(t + dur);
  }

  shoot() {
    this._noise(0.14, 0.5, 2600, 'bandpass');
    this._blip(160, 0.09, 'square', 0.25, 60);
  }

  punch() {
    this._noise(0.08, 0.35, 500);
  }

  pickup() {
    this._blip(660, 0.09, 'sine', 0.3);
    setTimeout(() => this._blip(990, 0.14, 'sine', 0.3), 70);
  }

  cash() {
    this._blip(880, 0.08, 'triangle', 0.3);
    setTimeout(() => this._blip(1174, 0.08, 'triangle', 0.3), 80);
    setTimeout(() => this._blip(1568, 0.16, 'triangle', 0.3), 160);
  }

  crash() {
    this._noise(0.35, 0.5, 700);
    this._blip(90, 0.25, 'sawtooth', 0.3, 40);
  }

  explosion() {
    this._noise(0.8, 0.8, 400);
    this._blip(60, 0.7, 'sine', 0.5, 28);
  }

  horn() {
    this._blip(370, 0.18, 'sawtooth', 0.18);
    this._blip(466, 0.18, 'sawtooth', 0.12);
  }

  missionStart() {
    const notes = [523, 659, 784, 1046];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.16, 'triangle', 0.32), i * 110));
  }

  missionDone() {
    const notes = [523, 659, 784, 1046, 1318];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.18, 'triangle', 0.32), i * 100));
  }

  missionFail() {
    const notes = [392, 330, 262, 196];
    notes.forEach((f, i) => setTimeout(() => this._blip(f, 0.22, 'sawtooth', 0.2), i * 130));
  }

  busted() {
    this._blip(220, 0.4, 'sawtooth', 0.3, 110);
    setTimeout(() => this._blip(165, 0.5, 'sawtooth', 0.3, 82), 300);
  }

  // A looping two-tone police siren that follows the wanted level.
  setSiren(on) {
    if (!this.ctx) return;
    if (on && !this.sirenOsc) {
      const t = this.ctx.currentTime;
      this.sirenOsc = this.ctx.createOscillator();
      this.sirenOsc.type = 'triangle';
      this.sirenOsc.frequency.value = 700;
      this.sirenGain = this.ctx.createGain();
      this.sirenGain.gain.value = 0.0;
      this.sirenGain.gain.linearRampToValueAtTime(0.05, t + 0.5);
      const lfo = this.ctx.createOscillator();
      lfo.frequency.value = 0.55;
      const lfoGain = this.ctx.createGain();
      lfoGain.gain.value = 240;
      lfo.connect(lfoGain);
      lfoGain.connect(this.sirenOsc.frequency);
      this.sirenOsc.connect(this.sirenGain);
      this.sirenGain.connect(this.master);
      this.sirenOsc.start(t);
      lfo.start(t);
      this._sirenLfo = lfo;
    } else if (!on && this.sirenOsc) {
      const osc = this.sirenOsc;
      const lfo = this._sirenLfo;
      const g = this.sirenGain;
      const t = this.ctx.currentTime;
      g.gain.linearRampToValueAtTime(0.0, t + 0.4);
      setTimeout(() => { try { osc.stop(); lfo.stop(); } catch { /* already stopped */ } }, 500);
      this.sirenOsc = null;
      this.sirenGain = null;
      this._sirenLfo = null;
    }
  }

  // Engine hum while driving: pitch follows speed.
  setEngine(running, speedNorm) {
    if (!this.ctx) return;
    if (running && !this.engineOsc) {
      const t = this.ctx.currentTime;
      this.engineOsc = this.ctx.createOscillator();
      this.engineOsc.type = 'sawtooth';
      this.engineOsc.frequency.value = 70;
      const filter = this.ctx.createBiquadFilter();
      filter.type = 'lowpass';
      filter.frequency.value = 420;
      this.engineGain = this.ctx.createGain();
      this.engineGain.gain.value = 0.0;
      this.engineGain.gain.linearRampToValueAtTime(0.07, t + 0.3);
      this.engineOsc.connect(filter);
      filter.connect(this.engineGain);
      this.engineGain.connect(this.master);
      this.engineOsc.start(t);
      this._engineFilter = filter;
    } else if (!running && this.engineOsc) {
      const osc = this.engineOsc;
      const g = this.engineGain;
      const t = this.ctx.currentTime;
      g.gain.linearRampToValueAtTime(0.0, t + 0.25);
      setTimeout(() => { try { osc.stop(); } catch { /* already stopped */ } }, 350);
      this.engineOsc = null;
      this.engineGain = null;
    }
    if (this.engineOsc) {
      this.engineOsc.frequency.value = 55 + speedNorm * 130;
      if (this._engineFilter) this._engineFilter.frequency.value = 380 + speedNorm * 900;
    }
  }

  // A lazy bassline + hats loop for the menu and the streets. Cheap and cheerful.
  startMusic() {
    if (!this.ctx || this.musicTimer) return;
    const bass = [55, 55, 65.4, 49, 55, 55, 82.4, 73.4];
    this.musicTimer = setInterval(() => {
      if (this.muted || !this.ctx) return;
      const f = bass[this.musicStep % bass.length];
      this._blip(f, 0.42, 'triangle', 0.22);
      if (this.musicStep % 2 === 0) this._noise(0.03, 0.06, 6000, 'highpass');
      this.musicStep++;
    }, 300);
  }

  stopMusic() {
    if (this.musicTimer) {
      clearInterval(this.musicTimer);
      this.musicTimer = null;
    }
  }
}
