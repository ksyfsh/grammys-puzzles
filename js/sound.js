/* =====================================================================
   sound.js — the snap "click" and the celebration chime.

   The sounds are made by the iPad itself using Web Audio (like a tiny
   synthesizer), so there are no sound files to download and they work
   offline.

   iPads only allow web pages to play sound after the person has touched
   the screen. So the first time she touches anything, we quietly
   "unlock" the sound.
   ===================================================================== */

const Sound = (() => {
  let ctx = null;      // the audio engine (created on first touch)
  let master = null;   // overall volume knob
  let enabled = Store.getPref('sound', true);  // Sound is ON by default

  // Overall loudness. 1.0 is full. Change this number to make every sound
  // louder or softer.
  const VOLUME = 0.9;

  function unlock() {
    try {
      // Newer iPads: ask to be treated like a video's sound, so the snap is
      // still heard when the iPad is set to silent. (Ignored on older iPads.)
      if (navigator.audioSession && navigator.audioSession.type !== 'playback') {
        try { navigator.audioSession.type = 'playback'; } catch (e) { /* ignore */ }
      }
      if (!ctx) {
        const AudioCtx = window.AudioContext || window.webkitAudioContext;
        if (!AudioCtx) return;
        ctx = new AudioCtx();
        const compressor = ctx.createDynamicsCompressor(); // keeps sounds from getting harsh
        master = ctx.createGain();
        master.gain.value = VOLUME;
        master.connect(compressor);
        compressor.connect(ctx.destination);
        // Play one silent moment — this is what "unlocks" sound on iPad.
        const silent = ctx.createBufferSource();
        silent.buffer = ctx.createBuffer(1, 1, 22050);
        silent.connect(ctx.destination);
        silent.start(0);
      }
      if (ctx.state !== 'running') ctx.resume();
    } catch (e) { /* sound just won't play; nothing else breaks */ }
  }
  // Try to unlock on every kind of first touch.
  ['pointerdown', 'touchend', 'click'].forEach((type) =>
    document.addEventListener(type, unlock, { capture: true, passive: true }));

  /**
   * One soft bell-like note.
   *   shimmer: how much bright "ring" to add on top (0 = pure and mellow).
   *   attack:  how quickly it starts (longer = gentler).
   */
  function bell(freq, start, length, volume, shimmer = 0.08, attack = 0.01) {
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.value = freq;
    gain.gain.setValueAtTime(0.0001, start);
    gain.gain.exponentialRampToValueAtTime(volume, start + attack);
    gain.gain.exponentialRampToValueAtTime(0.0001, start + length);
    osc.connect(gain); gain.connect(master);
    osc.start(start); osc.stop(start + length + 0.05);

    // A quieter higher "shimmer" makes it sound like a chime, not a beep.
    if (!shimmer) return;
    const osc2 = ctx.createOscillator();
    const gain2 = ctx.createGain();
    osc2.type = 'sine';
    osc2.frequency.value = freq * 2.76;
    gain2.gain.setValueAtTime(0.0001, start);
    gain2.gain.exponentialRampToValueAtTime(volume * shimmer, start + attack);
    gain2.gain.exponentialRampToValueAtTime(0.0001, start + length * 0.45);
    osc2.connect(gain2); gain2.connect(master);
    osc2.start(start); osc2.stop(start + length);
  }

  /** A short, soft wooden "tock", like a piece pressing into place. */
  function tock(start, volume) {
    const length = 0.05;
    const buffer = ctx.createBuffer(1, Math.ceil(ctx.sampleRate * length), ctx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / data.length, 4);
    }
    const src = ctx.createBufferSource();
    src.buffer = buffer;
    const filter = ctx.createBiquadFilter();
    filter.type = 'lowpass';        // keeps only the low, warm part of the click
    filter.frequency.value = 900;
    filter.Q.value = 0.7;
    const gain = ctx.createGain();
    gain.gain.value = volume;
    src.connect(filter); filter.connect(gain); gain.connect(master);
    src.start(start);
  }

  function ready() {
    if (!enabled || !ctx) return false;
    if (ctx.state !== 'running') ctx.resume();
    return true;
  }

  /** Played when a piece clicks into its correct spot. */
  function snap() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.01;
    tock(t, 0.8);
    // A low, mellow note (G) that eases in and fades gently — no sharp "ding".
    bell(392, t + 0.005, 0.5, 0.16, 0, 0.02);
    bell(784, t + 0.005, 0.3, 0.04, 0, 0.02);
  }

  /** Played when the whole puzzle is finished: a happy rising tune. */
  function celebrate() {
    if (!ready()) return;
    const t = ctx.currentTime + 0.05;
    const notes = [523.25, 659.25, 783.99, 1046.5]; // C, E, G, high C
    notes.forEach((f, i) => bell(f, t + i * 0.17, 0.7, 0.22, 0.06, 0.02));
    const chordAt = t + notes.length * 0.17 + 0.1;
    [523.25, 659.25, 783.99, 1046.5].forEach((f) => bell(f, chordAt, 2.0, 0.12, 0.05, 0.03));
  }

  function isOn() { return enabled; }
  function setOn(on) {
    enabled = !!on;
    Store.setPref('sound', enabled);
    if (enabled) { unlock(); snap(); } // a little sample so she hears it's on
  }

  return { snap, celebrate, isOn, setOn };
})();
