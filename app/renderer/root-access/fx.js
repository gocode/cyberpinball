// Root Access, prototype : effets et sons. Ils lisent l'état du moteur sans jamais le modifier :
// la simulation reste déterministe. Pistes de la direction artistique :
// l'Arbre est une infrastructure vivante, la bille sa sève ; chaque étage gagné rallume un quartier
// de Vertige, visible au fond, en parallaxe.
(function (racine) {
  'use strict';

  const TAU = Math.PI * 2;

  function create(E, C) {
    const W = E.W, H = E.H;
    const pool = Array.from({ length: 40 }, () => ({ end: -1 }));
    let cursor = 0, owner = null, lastEvent = null, now = 0;
    let flashes = new WeakMap(), flipUp = new WeakMap(), flipWasUp = new WeakMap();
    let opened = new WeakMap();
    const litAt = [Infinity, Infinity, Infinity];
    let shakeEnd = -1, shakeAmp = 0;

    // ---------- Sons (WebAudio, synthétisés, aucun fichier) ----------

    let ac = null, master = null, noise = null, voices = 0, muet = false, reprise = null, derniereReprise = -Infinity;
    function audio() {
      if (muet) return null;
      if (!ac) {
        try {
          ac = new AudioContext();
          master = ac.createGain(); master.gain.value = 0.22; master.connect(ac.destination);
          noise = ac.createBuffer(1, ac.sampleRate * 0.5, ac.sampleRate);
          const d = noise.getChannelData(0);
          let s = 12345;
          for (let i = 0; i < d.length; i++) { s = (s * 1664525 + 1013904223) >>> 0; d[i] = s / 2147483648 - 1; }
        } catch { muet = true; return null; }
      }
      // Contexte encore bloqué (pas de geste, politique de lecture) : une seule demande de reprise à la fois,
      // au plus une par seconde, et aucun son fabriqué en attendant (sinon des voix s'empilent pour rien).
      if (ac.state !== 'running') {
        const t = performance.now();
        if (!reprise && t - derniereReprise > 1000) {
          derniereReprise = t;
          reprise = ac.resume().catch(() => {}).finally(() => { reprise = null; });
        }
        return null;
      }
      return ac;
    }
    function tone(f0, f1, dur, type, gain, delay) {
      const a = audio(); if (!a || voices >= 10) return;
      const t = a.currentTime + (delay || 0);
      const o = a.createOscillator(), g = a.createGain();
      o.type = type || 'sine';
      o.frequency.setValueAtTime(f0, t);
      o.frequency.exponentialRampToValueAtTime(Math.max(20, f1), t + dur);
      g.gain.setValueAtTime(0.0001, t);
      g.gain.exponentialRampToValueAtTime(gain || 0.5, t + 0.006);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      o.connect(g); g.connect(master);
      voices++;
      o.onended = () => { voices--; o.disconnect(); g.disconnect(); };
      o.start(t); o.stop(t + dur + 0.02);
    }
    function hiss(dur, freq, gain, q) {
      const a = audio(); if (!a || voices >= 10) return;
      const t = a.currentTime;
      const s = a.createBufferSource(), f = a.createBiquadFilter(), g = a.createGain();
      s.buffer = noise;
      f.type = 'bandpass'; f.frequency.value = freq; f.Q.value = q || 1.2;
      g.gain.setValueAtTime(gain, t);
      g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      s.connect(f); f.connect(g); g.connect(master);
      voices++;
      s.onended = () => { voices--; s.disconnect(); f.disconnect(); g.disconnect(); };
      s.start(t); s.stop(t + dur + 0.02);
    }
    const SFX = {
      flip: () => { hiss(0.035, 1800, 0.35, 0.8); tone(140, 90, 0.04, 'square', 0.12); },
      bumper: () => { tone(260, 110, 0.14, 'triangle', 0.6); hiss(0.05, 3000, 0.15); },
      sling: () => { tone(420, 220, 0.06, 'square', 0.18); },
      cible: () => { tone(880, 1320, 0.09, 'sine', 0.45); tone(1760, 1760, 0.05, 'sine', 0.12, 0.03); },
      touche: () => { tone(660, 660, 0.06, 'sine', 0.4); tone(990, 990, 0.08, 'sine', 0.35, 0.06); },
      bascule: () => { tone(120, 60, 0.3, 'triangle', 0.7); hiss(0.12, 500, 0.25, 0.7); },
      ouvert: () => { [523, 659, 784, 1047].forEach((f, i) => tone(f, f, 0.12, 'triangle', 0.35, i * 0.07)); },
      ferme: () => { tone(494, 494, 0.1, 'triangle', 0.35); tone(370, 370, 0.16, 'triangle', 0.35, 0.1); },
      sortie: () => { [392, 587, 880].forEach((f, i) => tone(f, f * 1.01, 0.18, 'triangle', 0.4, i * 0.09)); tone(200, 1600, 0.9, 'sine', 0.18, 0.1); },
      lance: (c) => { hiss(0.08, 900 + 1400 * c, 0.5, 0.6); tone(90 + 120 * c, 60, 0.12, 'square', 0.18); },
      chute: () => { tone(500, 50, 0.7, 'sine', 0.4); },
      sauve: () => { tone(523, 523, 0.08, 'sine', 0.35); tone(784, 784, 0.14, 'sine', 0.35, 0.08); },
      perdue: () => { tone(220, 30, 1.1, 'sawtooth', 0.25); hiss(0.6, 300, 0.4, 0.5); },
      chaine: () => { [1047, 1319, 1568].forEach((f, i) => tone(f, f, 0.07, 'sine', 0.3, i * 0.05)); },
      catapulte: () => { tone(180, 520, 0.16, 'triangle', 0.45); hiss(0.1, 1400, 0.2, 0.8); },
      aimant: () => { tone(110, 110, 0.5, 'sawtooth', 0.12); tone(220, 233, 0.5, 'sine', 0.25); },
    };

    // Relevé du coût de chaque son (appels et millisecondes), lu par la mesure de charge.
    const sonStats = {};
    for (const k of Object.keys(SFX)) {
      const f0 = SFX[k];
      SFX[k] = (...args) => { const t = performance.now(); f0(...args); const s = sonStats[k] || (sonStats[k] = { n: 0, ms: 0 }); s.n++; s.ms += performance.now() - t; };
    }

    // ---------- Suivi de l'état (après chaque pas du moteur) ----------

    function center(o) {
      if (o.seg) return [(o.seg[0] + o.seg[2]) / 2, (o.seg[1] + o.seg[3]) / 2];
      if (o.rect) return [(o.rect.x1 + o.rect.x2) / 2, (o.rect.y1 + o.rect.y2) / 2];
      return [o.x, o.y];
    }
    function add(kind, floor, x, y, color, tx, ty, life) {
      const p = pool[cursor++ % pool.length];
      Object.assign(p, { kind, floor, x, y, tx: tx == null ? x : tx, ty: ty == null ? y : ty, color, start: now, end: now + (life || (kind === 0 ? 0.24 : 0.42)) });
    }
    function shake(amp, dur) { shakeAmp = amp; shakeEnd = now + dur; }

    function observe(g, live) {
      now = g.t * E.DT;
      if (owner !== g) {
        owner = g; lastEvent = g.events[g.events.length - 1] || null;
        flashes = new WeakMap(); flipUp = new WeakMap(); flipWasUp = new WeakMap(); opened = new WeakMap();
        for (const p of pool) p.end = -1;
        litAt.fill(Infinity);
        shakeEnd = -1;
      }
      const f = g.f;
      const son = live && g.status !== 'dead';

      for (const list of [f.bumpers, f.slings]) {
        for (const o of list) {
          const old = flashes.get(o) || 0;
          if (o.flash > old + 1e-6) {
            const [x, y] = center(o);
            add(0, g.floor, x, y, C.meta);
            if (son) (list === f.bumpers ? SFX.bumper : SFX.sling)();
          }
          flashes.set(o, o.flash);
        }
      }

      for (const fl of f.flippers) {
        const up = fl.w * (fl.up - fl.rest) > 0.01;
        if (up) flipUp.set(fl, now);
        if (up && !flipWasUp.get(fl) && son) SFX.flip();
        flipWasUp.set(fl, up);
      }

      for (const o of [...f.gates, ...f.bridges]) {
        const st = !!(o.open || o.down);
        const was = opened.get(o);
        if (was !== undefined && st && !was) {
          const [x, y] = center(o);
          add(0, g.floor, x, y, C.signal, null, null, 0.45);
          shake(3, 0.12);
          if (son) SFX.ouvert();
        }
        opened.set(o, st);
      }

      let first = lastEvent ? g.events.indexOf(lastEvent) + 1 : 0;
      for (let i = first; i < g.events.length; i++) {
        const e = g.events[i];
        lastEvent = e;
        if (e.type === 'sortie') { if (e.floor < litAt.length) litAt[e.floor] = now; shake(4, 0.18); if (son) SFX.sortie(); continue; }
        if (!son) continue;
        if (e.type === 'lance') SFX.lance(e.charge || 0);
        else if (e.type === 'chute') SFX.chute();
        else if (e.type === 'sauve-bille') SFX.sauve();
        else if (e.type === 'perdue') SFX.perdue();
        else if (e.type === 'porte-fermee' || e.type === 'pont-releve') SFX.ferme();
        else if (e.type === 'catapulte') SFX.catapulte();
        else if (e.type === 'aimant') SFX.aimant();
        else if (e.type === 'chaine') {
          SFX.chaine();
          const t = f.targets.find((o) => o.id === e.id);
          if (t) { const [x, y] = center(t); add(0, e.floor, x, y - 18, C.signal, null, null, 0.5); }
        }
        if (e.floor !== g.floor || !['cible', 'touche', 'bascule'].includes(e.type)) continue;
        const list = e.type === 'bascule' ? f.seesaws : f.targets;
        const source = list.find((o) => o.id === e.id);
        if (!source) continue;
        const [x, y] = center(source);
        add(0, e.floor, x, y, e.type === 'cible' ? C.signal : C.meta);
        SFX[e.type]();
        if (e.type === 'bascule') shake(3, 0.12);
        for (const rule of f.rules) {
          const q = rule.quand;
          const related = (e.type === 'cible' && q.cibles && q.cibles.includes(e.id)) || (e.type === 'touche' && q.touche === e.id) || (e.type === 'bascule' && q.bascule === e.id);
          if (!related) continue;
          for (const action of rule.alors) {
            const id = action.ouvrir || action.abaisser || action.tenir;
            const dest = id ? f.gates.find((o) => o.id === id) || f.bridges.find((o) => o.id === id) : null;
            if (!dest) continue;
            const [tx, ty] = center(dest);
            add(1, e.floor, x, y, C.signal, tx, ty, 0.5);
          }
        }
      }

      // Scènes figées des captures : les étages déjà franchis sont rallumés.
      const done = g.floor + (g.status === 'transit' || g.status === 'won' ? 1 : 0);
      for (let i = 0; i < Math.min(3, done); i++) if (!Number.isFinite(litAt[i])) litAt[i] = now - 1;
    }

    // ---------- Ville de Vertige (fond, parallaxe) ----------

    function layer(w, h) { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; }
    function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }
    const CITY_H = 1400;
    const far = layer(W, CITY_H), near = layer(W, CITY_H);
    const districts = [];
    (function buildCity() {
      const rnd = lcg(2026);
      const fc = far.getContext('2d');
      fc.fillStyle = '#06110e';
      for (let x = 0; x < W; x += 8 + rnd() * 14) {
        const w = 10 + rnd() * 22, top = 500 + rnd() * 600;
        fc.fillRect(x, top, w, CITY_H - top);
        if (rnd() < 0.3) fc.fillRect(x + w / 2 - 1, top - 30 - rnd() * 40, 2, 70);
      }
      const nc = near.getContext('2d');
      for (let k = 0; k < 3; k++) {
        const dx = 20 + k * 190, dy = 760 - k * 170;
        const mask = layer(170, CITY_H - dy);
        const m = mask.getContext('2d');
        for (let j = 0; j < 8; j++) {
          const x = j * 21 + rnd() * 4, w = 14 + rnd() * 6, top = 20 + rnd() * 220;
          nc.fillStyle = '#0a1a16';
          nc.fillRect(dx + x, dy + top, w, CITY_H - dy - top);
          nc.fillStyle = '#123129';
          nc.fillRect(dx + x, dy + top, w, 2);
          for (let y = top + 10; y < CITY_H - dy - 10; y += 11) {
            for (let c = 3; c < w - 3; c += 5) {
              if (rnd() < 0.45) { m.fillStyle = rnd() < 0.85 ? C.signal : C.teal; m.fillRect(x + c, y, 2, 3); }
            }
          }
        }
        districts.push({ mask, x: dx, y: dy });
      }
    })();

    // Racines lointaines : grosses courbes sombres, à mi-distance.
    const roots = layer(W, H * 2);
    (function buildRoots() {
      const c = roots.getContext('2d');
      const rnd = lcg(77);
      c.lineCap = 'round';
      for (let i = 0; i < 7; i++) {
        const x0 = rnd() * W, w = 18 + rnd() * 34;
        c.strokeStyle = '#08130f'; c.lineWidth = w;
        c.beginPath(); c.moveTo(x0, H * 2 + 40);
        c.bezierCurveTo(x0 + (rnd() - 0.5) * 500, H * 1.4, x0 + (rnd() - 0.5) * 500, H * 0.7, x0 + (rnd() - 0.5) * 300, -40);
        c.stroke();
        c.strokeStyle = 'rgba(54, 201, 180, 0.05)'; c.lineWidth = 2; c.stroke();
      }
    })();

    function drawBackground(c, g) {
      const y = -360 + g.camera * H * 0.08;
      c.drawImage(far, 0, y + 60);
      c.drawImage(near, 0, y);
      for (let k = 0; k < districts.length; k++) {
        const u = Math.max(0, Math.min(1, (now - litAt[k]) / 0.9));
        if (!u) continue;
        const d = districts[k], mh = d.mask.height, h = Math.max(1, Math.floor(mh * u));
        c.globalAlpha = 0.55;
        c.drawImage(d.mask, 0, mh - h, d.mask.width, h, d.x, d.y + y + mh - h, d.mask.width, h);
        c.globalAlpha = 1;
      }
      const ry = -H + ((g.camera * H * 0.25) % H);
      c.drawImage(roots, 0, ry);
    }

    // ---------- Effets du plateau ----------

    function drawImpacts(c, g) {
      c.lineWidth = 2;
      for (const p of pool) {
        if (p.kind !== 0 || p.end <= now) continue;
        const u = (now - p.start) / (p.end - p.start);
        const y = p.y + (g.camera - p.floor) * H;
        c.strokeStyle = p.color;
        c.globalAlpha = (1 - u) * 0.85;
        c.beginPath();
        c.arc(p.x, y, 6 + 30 * u, 0.3, TAU - 0.3);
        for (let i = 0; i < 8; i++) {
          const a = (i * TAU) / 8 + p.x * 0.01;
          const r = 12 + 40 * u, len = 9 * (1 - u);
          c.moveTo(p.x + Math.cos(a) * r, y + Math.sin(a) * r);
          c.lineTo(p.x + Math.cos(a) * (r + len), y + Math.sin(a) * (r + len));
        }
        c.stroke();
      }
      c.globalAlpha = 1;
    }

    function drawSignals(c, g) {
      for (const p of pool) {
        if (p.kind !== 1 || p.end <= now) continue;
        const u = (now - p.start) / (p.end - p.start);
        const off = (g.camera - p.floor) * H;
        c.lineWidth = 2;
        c.strokeStyle = C.meta;
        c.globalAlpha = 0.35 * (1 - u);
        c.beginPath(); c.moveTo(p.x, p.y + off); c.lineTo(p.x, p.ty + off); c.lineTo(p.tx, p.ty + off); c.stroke();
        const a = Math.abs(p.ty - p.y), b = Math.abs(p.tx - p.x);
        const d = Math.min(1, u * 1.25) * (a + b);
        const x = d <= a ? p.x : p.x + Math.sign(p.tx - p.x) * (d - a);
        const y = d <= a ? p.y + Math.sign(p.ty - p.y) * d : p.ty;
        c.globalAlpha = 1;
        c.fillStyle = u > 0.75 ? C.signal : '#ffffff';
        c.fillRect(x - 4, y + off - 4, 8, 8);
        c.globalAlpha = 0.25; c.fillRect(x - 9, y + off - 9, 18, 18);
      }
      c.globalAlpha = 1;
    }

    function drawFlips(c, g) {
      c.strokeStyle = C.signal;
      for (const fl of g.f.flippers) {
        const age = now - (flipUp.has(fl) ? flipUp.get(fl) : -100);
        if (age >= 0.09) continue;
        c.globalAlpha = 0.45 * (1 - age / 0.09);
        c.lineWidth = 3;
        c.beginPath();
        c.arc(fl.x, fl.y, fl.len * 0.85, Math.min(fl.rest, fl.a), Math.max(fl.rest, fl.a));
        c.stroke();
        c.lineWidth = 2;
        c.beginPath(); c.arc(fl.x, fl.y, fl.r1 + 6, 0, TAU); c.stroke();
      }
      c.globalAlpha = 1;
    }

    function drawAscent(c, g) {
      if (g.status !== 'transit') return;
      const u = Math.min(1, g.statusT / E.TRANSIT);
      const k = Math.sin(Math.PI * u);
      c.strokeStyle = C.meta;
      c.lineWidth = 2;
      c.globalAlpha = k * 0.5;
      c.beginPath();
      // Huit traits seulement : la sève qui remonte la racine latérale (da.js) porte la montée.
      for (let j = 0; j < 8; j++) {
        const i = j * 2 + (j % 2);
        const x = i % 2 ? W - 6 - (i % 4) * 7 : 6 + (i % 4) * 7;
        const y = ((i * 137 + u * 2200) % (H + 200)) - 100;
        c.moveTo(x, y); c.lineTo(x, y + 30 + 90 * k);
      }
      c.stroke();
      c.globalAlpha = 1;
    }

    function shakeOffset() {
      if (now >= shakeEnd) return [0, 0];
      const k = (shakeEnd - now) / 0.18;
      return [Math.sin(now * 190) * shakeAmp * k, Math.cos(now * 230) * shakeAmp * k];
    }

    // ---------- Bille (dessinée une fois) ----------

    const R = E.BALL_R, SPR = 4, half = (R + 9) * SPR;
    const ball = layer(half * 2, half * 2);
    (function buildBall() {
      const c = ball.getContext('2d');
      c.scale(SPR, SPR);
      const o = half / SPR;
      let g = c.createRadialGradient(o, o, R * 0.6, o, o, R + 9);
      g.addColorStop(0, 'rgba(139, 226, 58, 0.45)'); g.addColorStop(1, 'rgba(139, 226, 58, 0)');
      c.fillStyle = g; c.beginPath(); c.arc(o, o, R + 9, 0, TAU); c.fill();
      g = c.createRadialGradient(o - R * 0.35, o - R * 0.4, 1, o, o, R);
      g.addColorStop(0, '#ffffff'); g.addColorStop(0.35, '#d7e8e2'); g.addColorStop(0.8, '#55706a'); g.addColorStop(1, '#22302d');
      c.fillStyle = g; c.beginPath(); c.arc(o, o, R, 0, TAU); c.fill();
      c.strokeStyle = 'rgba(139, 226, 58, 0.9)'; c.lineWidth = 1.2;
      c.beginPath(); c.arc(o, o, R - 0.6, 0.4, 2.2); c.stroke();
      c.fillStyle = 'rgba(214, 255, 170, 0.9)';
      c.beginPath(); c.arc(o + R * 0.18, o + R * 0.22, R * 0.22, 0, TAU); c.fill();
    })();
    function drawBall(c, x, y, alpha, radius) {
      const s = (radius || R) / R;
      c.globalAlpha = alpha;
      c.drawImage(ball, x - (half / SPR) * s, y - (half / SPR) * s, (half * 2 / SPR) * s, (half * 2 / SPR) * s);
      c.globalAlpha = 1;
    }

    return {
      observe, drawBackground, drawImpacts, drawSignals, drawFlips, drawAscent, drawBall, shakeOffset,
      basculerSon() { muet = !muet; if (muet && ac) ac.suspend().catch(() => {}); return !muet; },
      get son() { return !muet; },
      // Ouvrir la sortie audio prend plusieurs centaines de millisecondes : à faire sur l'écran titre,
      // jamais au premier flip (la partie gèlerait).
      prechauffer() { audio(); },
      sonStats() { const o = {}; for (const k in sonStats) { o[k] = { n: sonStats[k].n, ms: +sonStats[k].ms.toFixed(2) }; delete sonStats[k]; } o.etat = ac ? ac.state : 'aucun'; return o; },
    };
  }

  racine.RootFX = { create };
})(window);
