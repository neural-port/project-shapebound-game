/**
 * ShapeBound — Procedural Audio Engine
 *
 * 100% offline, client-side procedural sound generation using the Web Audio API.
 * Zero external assets, zero MP3/WAV downloads, zero dependencies.
 * Complies with strict Content Security Policies.
 */

(function (global) {
  'use strict';

  const MUTE_KEY = 'shapebound_audio_muted_v1';
  let audioCtx = null;
  let isMuted = false;

  // Restore mute setting
  try {
    isMuted = localStorage.getItem(MUTE_KEY) === 'true';
  } catch (e) {
    isMuted = false;
  }

  function getContext() {
    if (typeof window === 'undefined') return null;
    if (!audioCtx) {
      const AudioContextClass = window.AudioContext || window.webkitAudioContext;
      if (AudioContextClass) {
        audioCtx = new AudioContextClass();
      }
    }
    if (audioCtx && audioCtx.state === 'suspended') {
      audioCtx.resume().catch(function () {});
    }
    return audioCtx;
  }

  // Ensure AudioContext unlocks on initial user interaction
  function initUnlock() {
    if (typeof window === 'undefined') return;
    const unlock = function () {
      const ctx = getContext();
      if (ctx && ctx.state === 'running') {
        window.removeEventListener('pointerdown', unlock);
        window.removeEventListener('keydown', unlock);
      }
    };
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock, { passive: true });
  }
  initUnlock();

  function setMuted(val) {
    isMuted = !!val;
    try {
      localStorage.setItem(MUTE_KEY, isMuted ? 'true' : 'false');
    } catch (e) {}
  }

  function toggleMute() {
    setMuted(!isMuted);
    return isMuted;
  }

  function getMuted() {
    return isMuted;
  }

  /**
   * Tactile Puck Placement
   * Deep wooden/ceramic 'thud' + crisp click, pitched musically by board coordinates.
   */
  function playPlace(player, row, col) {
    if (isMuted) return;
    const ctx = getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    // Harmonic pentatonic pitch mapping per cell
    const pentatonic = [196.00, 220.00, 246.94, 293.66, 329.63, 392.00, 440.00, 493.88];
    const r = Math.max(0, Math.min(7, row || 0));
    const c = Math.max(0, Math.min(7, col || 0));
    const baseFreq = pentatonic[(r + c) % pentatonic.length] * (player === 2 ? 1.12 : 1.0);

    // Layer 1: Body resonance (thud)
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = player === 1 ? 'triangle' : 'sine';
    osc.frequency.setValueAtTime(baseFreq, now);
    osc.frequency.exponentialRampToValueAtTime(baseFreq * 0.45, now + 0.08);

    gain.gain.setValueAtTime(0.35, now);
    gain.gain.exponentialRampToValueAtTime(0.001, now + 0.12);

    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.12);

    // Layer 2: Tactile click transient
    const clickOsc = ctx.createOscillator();
    const clickGain = ctx.createGain();
    clickOsc.type = 'square';
    clickOsc.frequency.setValueAtTime(880, now);
    clickOsc.frequency.exponentialRampToValueAtTime(120, now + 0.025);

    clickGain.gain.setValueAtTime(0.2, now);
    clickGain.gain.exponentialRampToValueAtTime(0.0001, now + 0.03);

    clickOsc.connect(clickGain);
    clickGain.connect(ctx.destination);
    clickOsc.start(now);
    clickOsc.stop(now + 0.03);
  }

  /**
   * Piece Expiration Dissolve
   * Soft descending lowpass sweep simulating energy dissolution.
   */
  function playExpire() {
    if (isMuted) return;
    const ctx = getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const filter = ctx.createBiquadFilter();
    const gain = ctx.createGain();

    osc.type = 'sawtooth';
    osc.frequency.setValueAtTime(260, now);
    osc.frequency.exponentialRampToValueAtTime(65, now + 0.28);

    filter.type = 'lowpass';
    filter.frequency.setValueAtTime(800, now);
    filter.frequency.exponentialRampToValueAtTime(100, now + 0.28);

    gain.gain.setValueAtTime(0.18, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.28);

    osc.connect(filter);
    filter.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.28);
  }

  /**
   * Victory Fanfare
   * Resonant 5-tone chord arpeggio for game-winning hexomino completion.
   */
  function playWin() {
    if (isMuted) return;
    const ctx = getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const notes = [523.25, 659.25, 783.99, 987.77, 1046.50]; // C5, E5, G5, B5, C6
    notes.forEach(function (freq, i) {
      const noteTime = now + i * 0.11;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();

      osc.type = i === notes.length - 1 ? 'triangle' : 'sine';
      osc.frequency.setValueAtTime(freq, noteTime);

      gain.gain.setValueAtTime(0.24, noteTime);
      gain.gain.exponentialRampToValueAtTime(0.0001, noteTime + 0.45);

      osc.connect(gain);
      gain.connect(ctx.destination);

      osc.start(noteTime);
      osc.stop(noteTime + 0.45);
    });
  }

  /**
   * Undo Sound
   * Soft rewind tone.
   */
  function playUndo() {
    if (isMuted) return;
    const ctx = getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'sine';
    osc.frequency.setValueAtTime(440, now);
    osc.frequency.exponentialRampToValueAtTime(220, now + 0.15);

    gain.gain.setValueAtTime(0.22, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.15);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.15);
  }

  /**
   * Subtle Button Click
   */
  function playClick() {
    if (isMuted) return;
    const ctx = getContext();
    if (!ctx) return;

    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = 'triangle';
    osc.frequency.setValueAtTime(600, now);
    osc.frequency.exponentialRampToValueAtTime(200, now + 0.03);

    gain.gain.setValueAtTime(0.12, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.035);

    osc.connect(gain);
    gain.connect(ctx.destination);

    osc.start(now);
    osc.stop(now + 0.035);
  }

  /**
   * Threat Alert Sound
   * Harmonic two-tone chime when a 5/6 hexomino threat arises.
   */
  function playThreat() {
    if (isMuted) return;
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;

    [587.33, 880.00].forEach(function (freq, i) {
      const t = now + i * 0.08;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(freq, t);
      gain.gain.setValueAtTime(0.18, t);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.22);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.22);
    });
  }

  /**
   * Chess Clock Low-Time Tick
   */
  function playTick() {
    if (isMuted) return;
    const ctx = getContext();
    if (!ctx) return;
    const now = ctx.currentTime;
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'triangle';
    osc.frequency.setValueAtTime(1000, now);
    osc.frequency.exponentialRampToValueAtTime(300, now + 0.02);
    gain.gain.setValueAtTime(0.14, now);
    gain.gain.exponentialRampToValueAtTime(0.0001, now + 0.025);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start(now);
    osc.stop(now + 0.025);
  }

  const AudioEngine = {
    playPlace: playPlace,
    playExpire: playExpire,
    playWin: playWin,
    playUndo: playUndo,
    playClick: playClick,
    playThreat: playThreat,
    playTick: playTick,
    toggleMute: toggleMute,
    setMuted: setMuted,
    isMuted: getMuted
  };

  global.AudioEngine = AudioEngine;
})(typeof window !== 'undefined' ? window : globalThis);
