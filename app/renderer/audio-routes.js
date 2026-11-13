// Sorties du son du Juke-box (packages/core/src/jukebox-audio.ts, jukeboxRoutes) : un élément
// <audio> ou <video> joué sur une ou plusieurs sorties de Windows, chacune avec ses filtres
// (profil, basses, médiums, aigus), son gain et son retard.
//
// Une horloge par sortie (13/11/2026, après essai sur le PinCab). Chaque carte son a sa propre
// horloge. La première version passait le son d'un seul graphe Web Audio aux autres sorties par un
// flux (MediaStreamDestination lu par un <audio>) : Chromium recale ce flux sans cesse sur l'horloge
// de la carte qui le joue, et le morceau semblait ralentir puis accélérer. Désormais, chaque sortie
// a son propre AudioContext posé sur elle (setSinkId) : c'est sa carte qui le cadence, rien n'est
// recalé. Le morceau y est lu par son propre élément (le premier, l'élément du lecteur, mène ; les
// autres le suivent : lecture, pause, position), alignés en douceur sur le premier, par une vitesse
// corrigée d'un millième au plus, sans changer la hauteur (inaudible), ou d'un saut au-delà de 300 ms.
//
// Page du lecteur YouTube (une seule vidéo, aucune copie possible) : les autres sorties reçoivent le
// son de la vidéo par captureStream, chacune dans son propre AudioContext posé sur sa carte (mode
// « flux »). Rien ici ne dépend du menu : le fichier est rejoué tel quel dans cette page.
//
//   CyberAudioRoutes.attach(élément, routes, { flux })  // { update(routes), analyser, close() }
//   CyberAudioRoutes.test(route)              // extrait d'essai : basses, médiums, aigus, puis tout
//   CyberAudioRoutes.status()                 // sorties en cours, pour les essais et le journal

(() => {
  'use strict';
  if (window.CyberAudioRoutes) return;

  // Chromium ajoute « (vid:pid) » au nom Windows des périphériques USB (comme menu-audio.js).
  const USB_IDS = / \([0-9a-f]{4}:[0-9a-f]{4}\)$/i;
  /** Suivi des copies : relevé, zone morte, correction de vitesse maximale, saut. */
  const SYNC_MS = 200;
  const DEAD_ZONE = 0.02;
  const MAX_RATE = 0.001;
  const JUMP = 0.3;

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

  /** Chaîne d'une sortie : filtres, retard, gain, jusqu'à la carte du contexte. */
  function chain(ctx, input, route) {
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
    gain.connect(ctx.destination);
    nodes.push(gain);
    return nodes;
  }

  const unplug = (nodes) => {
    for (const n of nodes) {
      try {
        n.disconnect();
      } catch {
        // Déjà débranché.
      }
    }
  };

  /**
   * Un contexte posé sur la carte de sa sortie : suspendu tant qu'elle n'est pas trouvée (rien ne
   * part sur la sortie par défaut de Windows), puis repris.
   */
  function outputContext(out) {
    const ctx = new AudioContext({ latencyHint: 'playback' });
    ctx.suspend().catch(() => {});
    out.ctx = ctx;
    place(out);
    return ctx;
  }

  function place(out) {
    const want = out.route.output;
    out.sink = undefined;
    sinkIdFor(want).then(async (id) => {
      if (out.closed || out.route.output !== want) return;
      out.sink = id;
      if (id && typeof out.ctx.setSinkId === 'function') await out.ctx.setSinkId(id).catch(() => {});
      if (!out.closed) out.ctx.resume().catch(() => {});
    });
  }

  /** Avance du son d'un contexte sur l'élément : ce qu'il met à arriver à la carte. */
  const latency = (ctx) => (ctx.baseLatency || 0) + (ctx.outputLatency || 0);

  /**
   * Branche un élément sur ses sorties. L'élément mène sur la première ; chaque autre sortie a sa
   * copie (mode normal) ou reçoit son flux (mode « flux », page YouTube). Un élément passé une fois
   * dans Web Audio y reste (createMediaElementSource ne se défait pas) : un nouveau plan refait les
   * chaînes et les copies, jamais l'élément.
   */
  function attach(media, routes, options = {}) {
    const stream = Boolean(options.flux);
    const lead = { route: routes[0], el: media, nodes: [], closed: false };
    const ctx = outputContext(lead);
    lead.source = ctx.createMediaElementSource(media);
    const analyser = ctx.createAnalyser();
    lead.source.connect(analyser);
    lead.meter = analyser;
    lead.nodes = chain(ctx, lead.source, lead.route);
    const h = { media, lead, others: [], key: JSON.stringify(routes), stream, captured: undefined };

    function follower(route) {
      const out = { route, nodes: [], closed: false, follower: true };
      const c = outputContext(out);
      if (stream) {
        // Le flux n'a de piste son qu'une fois la vidéo chargée : la sortie se branche alors (plug).
        out.pending = true;
        plug(out);
        return out;
      } else {
        const el = new Audio();
        if (media.crossOrigin) el.crossOrigin = media.crossOrigin;
        el.preload = 'auto';
        el.preservesPitch = false;
        el.volume = media.volume;
        el.src = media.currentSrc || media.src;
        out.el = el;
        out.source = c.createMediaElementSource(el);
      }
      out.nodes = chain(c, out.source, route);
      // Niveau reçu par cette sortie, avant ses réglages (essais et journal) : la preuve que le son y arrive.
      out.meter = c.createAnalyser();
      out.source.connect(out.meter);
      return out;
    }

    /** Mode flux : branche la sortie dès que la vidéo a sa piste son. */
    function plug(out) {
      if (!out.pending || out.closed) return;
      try {
        if (!h.captured) h.captured = media.captureStream();
      } catch {
        return;
      }
      if (!h.captured.getAudioTracks().length) return;
      out.pending = false;
      out.source = out.ctx.createMediaStreamSource(h.captured);
      out.nodes = chain(out.ctx, out.source, out.route);
      out.meter = out.ctx.createAnalyser();
      out.source.connect(out.meter);
    }

    function closeOut(out) {
      out.closed = true;
      unplug(out.nodes);
      if (out.el && out.el !== media) {
        out.el.pause();
        out.el.removeAttribute('src');
        out.el.load();
      }
      if (out !== lead) out.ctx.close().catch(() => {});
    }

    function update(next) {
      const plan = next && next.length ? next : routes;
      const key = JSON.stringify(plan);
      if (key === h.key) return;
      h.key = key;
      // La première sortie : sa chaîne refaite, sa carte changée si besoin, l'élément continue.
      unplug(lead.nodes);
      const moved = lead.route.output !== plan[0].output;
      lead.route = plan[0];
      lead.nodes = chain(lead.ctx, lead.source, lead.route);
      lead.source.connect(analyser);
      if (moved) {
        lead.ctx.suspend().catch(() => {});
        place(lead);
      }
      for (const o of h.others) closeOut(o);
      h.others = plan.slice(1).map(follower);
      sync();
    }

    /** Les copies suivent l'élément : lecture, pause, position, à l'horloge de leur carte près. */
    function sync() {
      for (const o of h.others) plug(o);
      for (const o of h.others) {
        const el = o.el;
        if (!el) continue;
        if (el.volume !== media.volume) el.volume = media.volume;
        if (media.paused || media.ended) {
          if (!el.paused) el.pause();
          continue;
        }
        // Même instant entendu : ce que chaque contexte met à arriver à sa carte est compensé.
        const target = media.currentTime - latency(lead.ctx) + latency(o.ctx);
        if (el.readyState < 2) {
          if (el.readyState >= 1 && Math.abs(el.currentTime - target) > JUMP) el.currentTime = Math.max(0, target);
          continue;
        }
        const ahead = target - el.currentTime;
        if (el.paused) {
          el.currentTime = Math.max(0, target);
          el.playbackRate = 1;
          el.play().catch(() => {});
        } else if (Math.abs(ahead) > JUMP) {
          el.currentTime = Math.max(0, target);
          el.playbackRate = 1;
        } else if (Math.abs(ahead) > DEAD_ZONE) {
          el.playbackRate = 1 + Math.max(-MAX_RATE, Math.min(MAX_RATE, ahead * 0.05));
        } else if (el.playbackRate !== 1) el.playbackRate = 1;
        o.gap = ahead;
      }
    }

    const onChange = () => sync();
    for (const type of ['play', 'pause', 'seeked', 'ended', 'volumechange']) media.addEventListener(type, onChange);
    // Chromium suspend parfois un contexte créé sans geste : il repart avec l'élément.
    const wake = () => {
      for (const o of [lead, ...h.others]) if (o.sink !== undefined && o.ctx.state === 'suspended') o.ctx.resume().catch(() => {});
    };
    media.addEventListener('play', wake);
    const timer = setInterval(sync, SYNC_MS);
    h.others = routes.slice(1).map(follower);

    const handle = {
      analyser,
      update,
      close() {
        clearInterval(timer);
        for (const type of ['play', 'pause', 'seeked', 'ended', 'volumechange']) media.removeEventListener(type, onChange);
        media.removeEventListener('play', wake);
        for (const o of h.others) closeOut(o);
        h.others = [];
        closeOut(lead);
        live.delete(h);
        lead.ctx.close().catch(() => {});
      },
    };
    h.handle = handle;
    live.add(h);
    return handle;
  }

  // ---------------------------------------------------------------------------
  // Extrait d'essai d'une sortie : basses, médiums, aigus, puis tout ensemble, synthétisés dans un
  // contexte posé sur sa carte.

  let testing;
  function test(route) {
    if (testing) testing.stop();
    const out = { route, nodes: [], closed: false };
    const ctx = outputContext(out);
    const bus = ctx.createGain();
    bus.gain.value = 0.5;
    out.nodes = chain(ctx, bus, route);
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
    const part = (at) => ({
      // Basses : deux pulsations à 55 Hz ; médiums : un accord ; aigus : des cymbales.
      bass: () => [0, 0.5].forEach((d) => tone('sine', 55, at + d, 0.4, 0.9)),
      mid: () => [440, 554, 659].forEach((f) => tone('triangle', f, at, 1, 0.25)),
      high: () => [0, 0.25, 0.5, 0.75].forEach((d) => tick(at + d)),
    });
    part(t0).bass();
    part(t0 + 1.2).mid();
    part(t0 + 2.4).high();
    const all = part(t0 + 3.6);
    all.bass();
    all.mid();
    all.high();
    const stop = () => {
      clearTimeout(timer);
      out.closed = true;
      unplug(out.nodes);
      ctx.close().catch(() => {});
      if (testing?.stop === stop) testing = undefined;
    };
    const timer = setTimeout(stop, 5400);
    testing = { stop, route };
    return true;
  }

  /** Niveau le plus fort du spectre (0 à 255) : le son arrive-t-il ? */
  function level(meter) {
    if (!meter) return null;
    const bins = new Uint8Array(meter.frequencyBinCount);
    meter.getByteFrequencyData(bins);
    return bins.reduce((a, b) => Math.max(a, b), 0);
  }

  window.CyberAudioRoutes = {
    attach,
    test,
    sinkIdFor,
    status: () => ({
      elements: live.size,
      branches: [...live].flatMap((h) =>
        [h.lead, ...h.others].map((o) => ({
          sortie: o.route.output,
          gain: o.route.gain,
          filtres: (o.route.filters || []).length,
          retard: o.route.delay,
          trouvee: o.sink === undefined ? null : Boolean(o.sink),
          copie: Boolean(o.follower),
          flux: Boolean(o.follower && h.stream),
          ecartMs: typeof o.gap === 'number' ? Math.round(o.gap * 1000) : null,
          vitesse: o.el ? o.el.playbackRate : 1,
          lecture: o.el ? !o.el.paused : null,
          position: o.el ? o.el.currentTime : null,
          niveau: level(o.meter),
        })),
      ),
      essai: testing ? testing.route.output : null,
    }),
  };
})();
