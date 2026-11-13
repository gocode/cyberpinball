// Sorties du son du Juke-box (packages/core/src/jukebox-audio.ts, jukeboxRoutes) : un élément
// <audio> ou <video> joué sur une ou plusieurs sorties de Windows, chacune avec ses filtres
// (profil, basses, médiums, aigus), son gain et son retard. Électron n'envoie un élément que sur
// une sortie (setSinkId) : le son passe ici par un graphe Web Audio, une branche par sortie, et
// chaque branche finit dans un <audio> hors du document posé sur sa sortie.
//
// Chargé dans les fenêtres du menu (frontend.html), et rejoué tel quel dans la page du lecteur
// YouTube (jukebox-player.ts) : rien ici ne dépend du menu.
//
//   CyberAudioRoutes.attach(élément, routes)  // { update(routes), analyser, close() }
//   CyberAudioRoutes.test(route)              // extrait d'essai : basses, médiums, aigus, puis tout
//   CyberAudioRoutes.status()                 // branches en cours, pour les essais sans opérateur

(() => {
  'use strict';
  if (window.CyberAudioRoutes) return;

  // Chromium ajoute « (vid:pid) » au nom Windows des périphériques USB (comme menu-audio.js).
  const USB_IDS = / \([0-9a-f]{4}:[0-9a-f]{4}\)$/i;

  /** Identifiant Chromium d'une sortie, d'après son nom Windows ; '' : sortie par défaut. */
  async function sinkIdFor(name) {
    if (!name || !navigator.mediaDevices?.enumerateDevices) return '';
    try {
      const devices = await navigator.mediaDevices.enumerateDevices();
      const hit = devices.find((d) => d.kind === 'audiooutput' && d.deviceId !== 'default' && d.deviceId !== 'communications' && (d.label === name || d.label.replace(USB_IDS, '') === name));
      return hit ? hit.deviceId : '';
    } catch {
      return '';
    }
  }

  const live = new Set();

  /** Une branche : filtres, retard, gain, puis la sortie. */
  function branch(ctx, input, route) {
    const nodes = [];
    let node = input;
    for (const f of route.filters || []) {
      const biquad = ctx.createBiquadFilter();
      biquad.type = f.type;
      biquad.frequency.value = f.frequency;
      if (typeof f.Q === 'number') biquad.Q.value = f.Q;
      if (typeof f.gain === 'number') biquad.gain.value = f.gain;
      node.connect(biquad);
      nodes.push(biquad);
      node = biquad;
    }
    if (route.delay > 0) {
      const delay = ctx.createDelay(1);
      delay.delayTime.value = Math.min(1, route.delay);
      node.connect(delay);
      nodes.push(delay);
      node = delay;
    }
    const gain = ctx.createGain();
    gain.gain.value = Math.max(0, Math.min(1, route.gain));
    node.connect(gain);
    nodes.push(gain);
    const dest = ctx.createMediaStreamDestination();
    gain.connect(dest);
    nodes.push(dest);
    const out = new Audio();
    out.srcObject = dest.stream;
    const b = { route, nodes, out, sink: undefined, closed: false };
    sinkIdFor(route.output).then((id) => {
      if (b.closed) return;
      b.sink = id;
      const go = () => !b.closed && out.play().catch(() => {});
      if (id && typeof out.setSinkId === 'function') out.setSinkId(id).then(go, go);
      else go();
    });
    return b;
  }

  function closeBranch(b) {
    b.closed = true;
    for (const n of b.nodes) {
      try {
        n.disconnect();
      } catch {
        // Déjà débranché.
      }
    }
    b.out.pause();
    b.out.srcObject = null;
  }

  /**
   * Branche un élément sur ses sorties. Un élément passé une fois dans le graphe y reste
   * (createMediaElementSource ne se défait pas) : un nouveau plan ne refait que les branches.
   */
  function attach(media, routes) {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const source = ctx.createMediaElementSource(media);
    const analyser = ctx.createAnalyser();
    source.connect(analyser);
    const h = { media, ctx, source, analyser, branches: [], key: '' };
    function update(next) {
      const key = JSON.stringify(next || []);
      if (key === h.key) return;
      h.key = key;
      for (const b of h.branches) closeBranch(b);
      h.branches = (next || []).map((r) => branch(ctx, source, r));
    }
    update(routes);
    const handle = {
      analyser,
      update,
      close() {
        for (const b of h.branches) closeBranch(b);
        h.branches = [];
        live.delete(h);
        ctx.close().catch(() => {});
      },
    };
    h.handle = handle;
    live.add(h);
    // Chromium suspend parfois un contexte créé sans geste : il repart avec l'élément.
    media.addEventListener('play', () => ctx.state === 'suspended' && ctx.resume().catch(() => {}));
    if (ctx.state === 'suspended') ctx.resume().catch(() => {});
    return handle;
  }

  // ---------------------------------------------------------------------------
  // Extrait d'essai d'une sortie : basses, médiums, aigus, puis tout ensemble.

  let testing;
  function test(route) {
    if (testing) testing.stop();
    const ctx = new AudioContext({ latencyHint: 'playback' });
    const bus = ctx.createGain();
    bus.gain.value = 0.5;
    const b = branch(ctx, bus, route);
    const t0 = ctx.currentTime + 0.15;
    const env = (at, length, peak) => {
      const g = ctx.createGain();
      g.gain.setValueAtTime(0, at);
      g.gain.linearRampToValueAtTime(peak, at + 0.02);
      g.gain.setValueAtTime(peak, at + length - 0.08);
      g.gain.linearRampToValueAtTime(0, at + length);
      g.connect(bus);
      return g;
    };
    const tone = (type, freq, at, length, peak) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.connect(env(at, length, peak));
      o.start(at);
      o.stop(at + length);
    };
    const noise = (() => {
      const buf = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
      const d = buf.getChannelData(0);
      for (let i = 0; i < d.length; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    })();
    const tick = (at) => {
      const s = ctx.createBufferSource();
      s.buffer = noise;
      const hp = ctx.createBiquadFilter();
      hp.type = 'highpass';
      hp.frequency.value = 6000;
      s.connect(hp);
      hp.connect(env(at, 0.09, 0.6));
      s.start(at);
      s.stop(at + 0.1);
    };
    const part = (at) => {
      // Basses : deux pulsations à 55 Hz ; médiums : un accord ; aigus : des cymbales.
      return {
        bass: () => [0, 0.5].forEach((d) => tone('sine', 55, at + d, 0.4, 0.9)),
        mid: () => [440, 554, 659].forEach((f) => tone('triangle', f, at, 1, 0.25)),
        high: () => [0, 0.25, 0.5, 0.75].forEach((d) => tick(at + d)),
      };
    };
    part(t0).bass();
    part(t0 + 1.2).mid();
    part(t0 + 2.4).high();
    const all = part(t0 + 3.6);
    all.bass();
    all.mid();
    all.high();
    const stop = () => {
      clearTimeout(timer);
      closeBranch(b);
      ctx.close().catch(() => {});
      if (testing?.stop === stop) testing = undefined;
    };
    const timer = setTimeout(stop, 5200);
    testing = { stop, route };
    return true;
  }

  window.CyberAudioRoutes = {
    attach,
    test,
    sinkIdFor,
    status: () => ({
      elements: live.size,
      branches: [...live].flatMap((h) => h.branches.map((b) => ({ sortie: b.route.output, gain: b.route.gain, filtres: (b.route.filters || []).length, retard: b.route.delay, trouvee: b.sink === undefined ? null : Boolean(b.sink) }))),
      essai: testing ? testing.route.output : null,
    }),
  };
})();
