// Sons de l'interface (registre et règle : packages/core/src/uisounds.ts) : clic de
// solénoïde, pièce, knocker, coup de bobine, carillon d'invitation. Seule la fenêtre du playfield les joue, sur la sortie du son
// du menu (menu-audio.js lui passe la même sortie, setSink), par-dessus la musique sans
// jamais la toucher. Chaque son est synthétisé ici par WebAudio, à la volée : aucun
// enregistrement, aucun fichier, aucun droit d'un tiers.
//
// Le processus principal décide s'il joue (uiSoundCue : réglage, volume, jamais pendant
// une partie) et l'envoie par le canal « ui-sound ». Repli de ce côté : rien ne sort quand
// l'état dit que la partie est en cours, et tout ce qui sonne encore se tait à ce moment.
// Seule exception, le son du passage de relais (cue.handover : le coup de bobine, quand VPX
// prend la main) : il part au tout début de la partie et y finit de sonner. Et le son d'un
// appel (cue.call : le carillon d'une invitation d'un ami) : il sonne aussi pendant la partie.
//
//   CyberUiSounds.play(id, volume, handover, call)  // volume de 0 à 1 ; rend true si le son part
//   CyberUiSounds.setPhase(phase)   // phase de l'état (frontend.js)
//   CyberUiSounds.setSink(sinkId)   // sortie Chromium du son du menu ; '' : par défaut
//   CyberUiSounds.status()          // ce qui a joué, pour les essais sans opérateur

(() => {
  'use strict';

  /** Sons du passage de relais (UI_SOUNDS[id].handover, uisounds.ts) : les seuls permis au début de la partie. */
  const HANDOVER = new Set(['coil']);
  /** Sons permis pendant la partie : l'appel (UI_SOUNDS[id].call : une invitation) et ceux des notifications qui s'y montrent aussi (notice). */
  const CALL = new Set(['invite', 'news', 'friend']);
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
    // Coup de bobine (lancement en cinéma, quand VPX prend la main) : un « tchoum » sec et mat,
    // le noyau d'une grosse bobine qui frappe sa butée. Un
    // seul contact de bruit filtré, un corps sourd qui descend de 145 à 95 Hz (et son octave,
    // pour les petits haut-parleurs), une pointe de métal vers 650 Hz bien en dessous ; 125 ms,
    // sans réverbération. Plus sourd que le clic, sans le tintement de la pièce, moins dur que le knocker.
    coil(ac, out, t) {
      hiss(ac, out, t, { freq: 1700, q: 0.5, peak: 0.55, attack: 0.002, decay: 0.01 });
      tone(ac, out, t + 0.002, { from: 145, to: 95, glide: 0.045, peak: 0.8, attack: 0.002, decay: 0.09 });
      tone(ac, out, t + 0.002, { type: 'triangle', from: 290, to: 190, glide: 0.045, peak: 0.16, attack: 0.002, decay: 0.07 });
      hiss(ac, out, t + 0.008, { freq: 650, q: 2, peak: 0.14, attack: 0.002, decay: 0.06 });
      return 0.125;
    },
    // Carillon d'invitation (un ami invite à une partie en direct, même pendant une partie) :
    // trois notes de cloche qui montent, la, do dièse, mi (accord majeur), à 110 ms d'écart. Le
    // seul son musical du registre, loin des chocs mécaniques des tables : il se reconnaît
    // par-dessus la musique de VPX. Chaque note a ses partiels de cloche (octave, 2,76, 5,4) ;
    // la dernière tient un peu plus. 0,6 s, sans réverbération.
    invite(ac, out, t) {
      const notes = [
        [0, 880, 0.3],
        [0.11, 1108.7, 0.3],
        [0.22, 1318.5, 0.36],
      ];
      const partials = [
        [1, 0.32],
        [2, 0.12],
        [2.76, 0.07],
        [5.4, 0.03],
      ];
      for (const [at, freq, decay] of notes) {
        for (const [ratio, peak] of partials) tone(ac, out, t + at, { from: freq * ratio, peak, attack: 0.003, decay: decay / Math.sqrt(ratio) });
        hiss(ac, out, t + at, { filter: 'highpass', freq: 6000, peak: 0.05, decay: 0.008 });
      }
      return 0.6;
    },
    // Signal d'un ami (un ami vient de se connecter, notices.ts) : une seule note douce qui glisse
    // vers le haut, de 520 à 780 Hz en 70 ms, avec un soupçon d'octave ; ni cloche ni choc, pour se
    // distinguer du carillon d'invitation et du tintement de la partie. 0,25 s, sans réverbération.
    friend(ac, out, t) {
      tone(ac, out, t, { from: 520, to: 780, glide: 0.07, peak: 0.22, attack: 0.008, decay: 0.22 });
      tone(ac, out, t + 0.01, { from: 1040, to: 1560, glide: 0.07, peak: 0.04, attack: 0.008, decay: 0.14 });
      return 0.25;
    },
    // Souffle de l'ouverture (11/11/2026), calé sur l'ouverture « Soie » (INTRO_TIMELINE) : un
    // souffle filtré monte avec l'étincelle (le filtre glisse de 400 à 5 200 Hz en 1,25 s), puis, à
    // l'ignition, un accord doux et vitré s'ouvre et tient (la, mi, si, do dièse, chaque note doublée
    // d'un soupçon de désaccord), posé sur un grave qui descend, avec un voile de poussière aigu.
    // Léger : aucun choc, aucune attaque sèche ; 3,1 s, sans réverbération.
    intro(ac, out, t) {
      const src = ac.createBufferSource();
      src.buffer = noiseBuffer(ac);
      src.loop = true;
      const f = ac.createBiquadFilter();
      f.type = 'bandpass';
      f.Q.value = 6;
      f.frequency.setValueAtTime(400, t);
      f.frequency.exponentialRampToValueAtTime(5200, t + 1.25);
      const g = ac.createGain();
      g.gain.setValueAtTime(0.0001, t);
      g.gain.linearRampToValueAtTime(0.16, t + 1.1);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      src.connect(f).connect(g).connect(out);
      src.start(t);
      src.stop(t + 1.55);
      const at = t + 1.25;
      for (const [freq, peak] of [
        [440, 0.1],
        [659.3, 0.08],
        [987.8, 0.06],
        [1318.5, 0.04],
      ]) {
        tone(ac, out, at, { from: freq, peak, attack: 0.06, decay: 1.7 });
        tone(ac, out, at, { from: freq * 1.003, peak: peak * 0.5, attack: 0.09, decay: 1.5 });
      }
      tone(ac, out, at, { from: 110, to: 82.4, glide: 0.4, peak: 0.16, attack: 0.02, decay: 0.9 });
      hiss(ac, out, at, { filter: 'highpass', freq: 7000, peak: 0.05, attack: 0.005, decay: 0.5 });
      return 3.1;
    },
    // Tintement de la partie entre amis (un invité accepte ou décline, la partie est finie,
    // notices.ts) : deux notes de cloche douces qui montent d'une quarte, mi puis la, à 120 ms
    // d'écart, deux fois moins fortes que le carillon d'invitation, sans son attaque de métal :
    // de la même famille, mais une nouvelle, pas un appel. 0,45 s, sans réverbération.
    news(ac, out, t) {
      const notes = [
        [0, 1318.5, 0.22],
        [0.12, 1760, 0.3],
      ];
      const partials = [
        [1, 0.16],
        [2, 0.05],
        [2.76, 0.03],
      ];
      for (const [at, freq, decay] of notes) for (const [ratio, peak] of partials) tone(ac, out, t + at, { from: freq * ratio, peak, attack: 0.004, decay: decay / Math.sqrt(ratio) });
      return 0.45;
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
      // Pendant la partie (coup de bobine fini) : aucun flux ne reste ouvert sur la sortie.
      if (silent) closeContext();
      else idleTimer = setTimeout(closeContext, IDLE_CLOSE_MS);
    }
  }

  function play(id, volume, relay = false, ring = false) {
    const recipe = RECIPES[id];
    const handover = relay && HANDOVER.has(id);
    const call = ring && CALL.has(id);
    if ((silent && !handover && !call) || !recipe || !(volume > 0)) return false;
    const now = Date.now();
    if (now - (lastAt[id] ?? -Infinity) < MIN_GAP_MS) return false;
    lastAt[id] = now;
    const ac = context();
    const out = ac.createGain();
    out.gain.value = Math.min(1, volume);
    out.connect(ac.destination);
    const length = recipe(ac, out, ac.currentTime + 0.01);
    // Un son permis pendant la partie (relais, appel) n'est pas coupé par son début.
    const entry = { out, handover: handover || call };
    entry.timer = setTimeout(() => forget(entry), (length + 0.2) * 1000);
    live.add(entry);
    history.push({ son: id, volume: Math.round(volume * 1000) / 1000 });
    if (history.length > 20) history.shift();
    return true;
  }

  /** Partie en cours : rien ne sort, et ce qui sonne encore se tait, sauf le son du passage de relais ou d'un appel. */
  function setPhase(phase) {
    silent = phase === 'playing';
    if (!silent) return;
    for (const entry of [...live]) if (!entry.handover) forget(entry);
    // Le contexte se ferme avec le dernier son (forget) ; tout de suite s'il ne reste rien.
    if (live.size === 0) closeContext();
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

  window.cyber?.onUiSound?.((cue) => play(cue?.id, cue?.volume, cue?.handover === true, cue?.call === true));
})();
