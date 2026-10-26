// Sons de l'interface (registre et règle : packages/core/src/uisounds.ts) : clic de
// solénoïde, pièce, knocker. Seule la fenêtre du playfield les joue, sur la sortie du son
// du menu (menu-audio.js lui passe la même sortie, setSink), par-dessus la musique sans
// jamais la toucher. Chaque son est synthétisé ici par WebAudio, à la volée : aucun
// enregistrement, aucun fichier, aucun droit d'un tiers.
//
// Le processus principal décide s'il joue (uiSoundCue : réglage, volume, jamais pendant
// une partie) et l'envoie par le canal « ui-sound ». Repli de ce côté : rien ne sort quand
// l'état dit que la partie est en cours, et tout ce qui sonne encore se tait à ce moment.
//
//   CyberUiSounds.play(id, volume)  // volume de 0 à 1 ; rend true si le son part
//   CyberUiSounds.setPhase(phase)   // phase de l'état (frontend.js)
//   CyberUiSounds.setSink(sinkId)   // sortie Chromium du son du menu ; '' : par défaut
//   CyberUiSounds.status()          // ce qui a joué, pour les essais sans opérateur

(() => {
  'use strict';

  /** Écart minimal entre deux fois le même son, en ms : la roue qui défile vite ne mitraille pas. */
  const MIN_GAP_MS = 45;
  /** Contexte audio fermé après ce temps sans son : aucun flux ouvert sur la sortie pendant le reste du menu. */
  const IDLE_CLOSE_MS = 4000;

  let ctx;
  let noise;
  let sinkId = '';
  let silent = false;
  let idleTimer;
  const live = new Set();
  const lastAt = {};
  const history = [];

  function context() {
    clearTimeout(idleTimer);
    if (!ctx) {
      ctx = new AudioContext({ latencyHint: 'interactive' });
      noise = undefined;
      if (sinkId && ctx.setSinkId) ctx.setSinkId(sinkId).catch(() => {});
    }
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return ctx;
  }

  function closeContext() {
    clearTimeout(idleTimer);
    if (!ctx) return;
    ctx.close().catch(() => {});
    ctx = undefined;
    noise = undefined;
  }

  /** Une seconde de bruit blanc, partagée par les sons du contexte. */
  function noiseBuffer(ac) {
    if (noise) return noise;
    noise = ac.createBuffer(1, ac.sampleRate, ac.sampleRate);
    const data = noise.getChannelData(0);
    for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
    return noise;
  }

  /** Enveloppe percussive : montée brève jusqu'à `peak`, puis décroissance exponentielle. */
  function envelope(ac, t, peak, attack, decay) {
    const g = ac.createGain();
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + attack);
    g.gain.exponentialRampToValueAtTime(0.0001, t + attack + decay);
    return g;
  }

  /** Oscillateur, éventuellement glissant de `from` à `to` pendant `glide` secondes. */
  function tone(ac, out, t, { type = 'sine', from, to = from, glide = 0.05, peak, attack = 0.002, decay }) {
    const osc = ac.createOscillator();
    osc.type = type;
    osc.frequency.setValueAtTime(from, t);
    if (to !== from) osc.frequency.exponentialRampToValueAtTime(to, t + glide);
    osc.connect(envelope(ac, t, peak, attack, decay)).connect(out);
    osc.start(t);
    osc.stop(t + attack + decay + 0.02);
  }

  /** Bruit filtré : le choc, le métal, le bois. */
  function hiss(ac, out, t, { filter = 'bandpass', freq, q = 1, peak, attack = 0.001, decay }) {
    const src = ac.createBufferSource();
    src.buffer = noiseBuffer(ac);
    const f = ac.createBiquadFilter();
    f.type = filter;
    f.frequency.value = freq;
    f.Q.value = q;
    src.connect(f).connect(envelope(ac, t, peak, attack, decay)).connect(out);
    src.start(t, Math.random() * 0.5);
    src.stop(t + attack + decay + 0.02);
  }

  // Recettes : chacune pose ses notes à partir de `t` et rend sa durée en secondes.
  // Un son ajouté au registre de packages/core/src/uisounds.ts a la sienne ici.
  const RECIPES = {
    // Clic de solénoïde : le plongeur claque contre sa butée (choc métallique bref et corps
    // sourd de la bobine), puis revient au repos un peu plus bas.
    solenoid(ac, out, t) {
      hiss(ac, out, t, { freq: 3200, q: 1.2, peak: 0.9, decay: 0.035 });
      tone(ac, out, t, { from: 150, to: 70, glide: 0.05, peak: 0.6, decay: 0.07 });
      tone(ac, out, t, { type: 'triangle', from: 1850, peak: 0.05, decay: 0.06 });
      hiss(ac, out, t + 0.075, { freq: 2400, q: 1.5, peak: 0.3, decay: 0.025 });
      return 0.12;
    },
    // Pièce : elle sonne en frappant la glissière du monnayeur, rebondit de plus en plus vite
    // et de moins en moins fort (modes inharmoniques d'un disque de métal), puis tombe dans
    // la caisse.
    coin(ac, out, t) {
      const bounces = [
        [0, 1],
        [0.12, 0.6],
        [0.2, 0.4],
        [0.25, 0.25],
        [0.285, 0.15],
      ];
      const partials = [
        [2650, 1],
        [4120, 0.6],
        [5870, 0.35],
        [7400, 0.2],
      ];
      for (const [at, level] of bounces) {
        hiss(ac, out, t + at, { filter: 'highpass', freq: 5000, peak: 0.35 * level, decay: 0.012 });
        for (const [freq, amp] of partials) tone(ac, out, t + at, { from: freq, peak: 0.24 * amp * level, attack: 0.001, decay: 0.12 + 0.18 * level });
      }
      tone(ac, out, t + 0.42, { from: 220, to: 120, glide: 0.06, peak: 0.5, decay: 0.09 });
      hiss(ac, out, t + 0.42, { filter: 'lowpass', freq: 900, peak: 0.3, decay: 0.06 });
      return 0.6;
    },
    // Knocker : le marteau frappe la caisse en bois ; le coup sourd résonne dans le meuble.
    knocker(ac, out, t) {
      hiss(ac, out, t, { filter: 'lowpass', freq: 1200, peak: 0.7, decay: 0.06 });
      tone(ac, out, t, { from: 95, to: 55, glide: 0.18, peak: 0.75, attack: 0.003, decay: 0.32 });
      tone(ac, out, t, { type: 'triangle', from: 210, to: 190, glide: 0.1, peak: 0.3, decay: 0.15 });
      hiss(ac, out, t + 0.004, { freq: 650, q: 4, peak: 0.3, decay: 0.12 });
      return 0.4;
    },
  };

  function forget(entry) {
    clearTimeout(entry.timer);
    try {
      entry.out.disconnect();
    } catch {
      // Déjà détaché.
    }
    live.delete(entry);
    if (live.size === 0) {
      clearTimeout(idleTimer);
      idleTimer = setTimeout(closeContext, IDLE_CLOSE_MS);
    }
  }

  function play(id, volume) {
    const recipe = RECIPES[id];
    if (silent || !recipe || !(volume > 0)) return false;
    const now = Date.now();
    if (now - (lastAt[id] ?? -Infinity) < MIN_GAP_MS) return false;
    lastAt[id] = now;
    const ac = context();
    const out = ac.createGain();
    out.gain.value = Math.min(1, volume);
    out.connect(ac.destination);
    const length = recipe(ac, out, ac.currentTime + 0.01);
    const entry = { out };
    entry.timer = setTimeout(() => forget(entry), (length + 0.2) * 1000);
    live.add(entry);
    history.push({ son: id, volume: Math.round(volume * 1000) / 1000 });
    if (history.length > 20) history.shift();
    return true;
  }

  /** Partie en cours : rien ne sort, et ce qui sonne encore se tait. */
  function setPhase(phase) {
    silent = phase === 'playing';
    if (!silent) return;
    for (const entry of [...live]) forget(entry);
    closeContext();
  }

  function setSink(id) {
    sinkId = id || '';
    if (ctx?.setSinkId) ctx.setSinkId(sinkId).catch(() => {});
  }

  window.CyberUiSounds = {
    play,
    setPhase,
    setSink,
    recipes: () => Object.keys(RECIPES),
    status: () => ({ joues: history.slice(), muet: silent, enCours: live.size }),
  };

  window.cyber?.onUiSound?.((cue) => play(cue?.id, cue?.volume));
})();
