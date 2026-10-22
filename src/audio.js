// Plucked-string synthesis (Karplus–Strong), generated locally with no samples.
export class GuitarAudio {
  constructor() { this.context = null; this.volume = 0.7; this.voices = new Set(); this.buffers = new Map(); }
  async unlock() {
    if (!this.context || this.context.state === 'closed') {
      this.context = new (window.AudioContext || window.webkitAudioContext)({ latencyHint: 'interactive' });
      const ctx = this.context;
      this.master = ctx.createGain(); this.master.gain.value = this.volume * 0.6;
      this.compressor = ctx.createDynamicsCompressor();
      this.compressor.threshold.value = -14; this.compressor.ratio.value = 5;
      this.master.connect(this.compressor).connect(ctx.destination);
    }
    await this.context.resume();
  }
  setVolume(value) {
    this.volume = value;
    this.master?.gain.setTargetAtTime(value * 0.6, this.context.currentTime, 0.02);
  }
  makeString(midi) {
    const ctx = this.context;
    const key = `${ctx.sampleRate}:${midi}`;
    if (this.buffers.has(key)) return this.buffers.get(key);
    const frequency = 440 * 2 ** ((midi - 69) / 12);
    // Averaging adjacent ring samples advances the delay by half a sample.
    const period = ctx.sampleRate / frequency + 0.5;
    const size = Math.floor(period), fraction = period - size;
    const ring = new Float32Array(size);
    for (let i = 0; i < size; i++) ring[i] = Math.random() * 2 - 1;
    const buffer = ctx.createBuffer(1, ctx.sampleRate * 3.2, ctx.sampleRate);
    const channel = buffer.getChannelData(0);
    let cursor = 0, last = 0;
    for (let i = 0; i < channel.length; i++) {
      const current = ring[cursor];
      const next = ring[(cursor + 1) % size];
      // Fractional delay preserves tuning between integer sample periods.
      const average = (current + next) * 0.498;
      const filtered = average * (1 - fraction) + last * fraction;
      ring[cursor] = filtered; last = average;
      channel[i] = current * Math.min(1, i / 80) * Math.exp(-i / (ctx.sampleRate * 2.2));
      cursor = (cursor + 1) % size;
    }
    this.buffers.set(key, buffer);
    return buffer;
  }
  warmup(chords) { for (const note of new Set(chords.flatMap(c => c.midi))) this.makeString(note); }
  strum(chord, direction = 'down', strength = 0.7) {
    if (!this.context || this.context.state !== 'running' || !chord) return false;
    if (this.voices.size > 42) this.mute();
    const notes = direction === 'down' ? chord.midi : [...chord.midi].reverse();
    const now = this.context.currentTime + 0.005;
    notes.forEach((note, index) => {
      const source = this.context.createBufferSource(), gain = this.context.createGain();
      source.buffer = this.makeString(note);
      gain.gain.value = 0.28 * strength;
      source.connect(gain).connect(this.master);
      const voice = { source, gain }; this.voices.add(voice);
      source.onended = () => { this.voices.delete(voice); source.disconnect(); gain.disconnect(); };
      source.start(now + index * (direction === 'down' ? 0.012 : 0.009));
    });
    return true;
  }
  mute() {
    if (!this.context) return;
    const now = this.context.currentTime;
    for (const { source, gain } of this.voices) {
      gain.gain.setTargetAtTime(0, now, 0.018);
      try { source.stop(now + 0.1); } catch { /* Already finished. */ }
    }
  }
}
