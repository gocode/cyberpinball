// Niveaux et badges, côté plateau (décidés le 17/11/2026, maquette « Niveaux et badges ») :
// - CyberLevels.badgeSvg(icon, rarity, still) : le badge dessiné ; still, sans le reflet qui passe
//   (un badge pas encore reçu, dans Mes badges). Communs : Liseré néon rond (anneau
//   chromé, tube néon, émail profond, pictogramme néon, 4 rivets lumineux) ; rares, épiques et
//   légendaires : Liseré néon en hexagone arrondi (rivets 6 coins, coins et milieux, étoiles) ;
// - CyberLevels.playerCard(p), badgesPill(b) : la carte du joueur et ses badges, au coin d'état ;
// - CyberLevels.moment(view) : le moment au retour d'une partie, dans le calque #level-moment
//   (placé et tourné comme le plateau). Voile, fond de la famille du badge (Horizon, Onde de choc,
//   Montée, Nuée, Révélation), Rayons quand le niveau monte, rayons dorés sous un légendaire ;
//   le badge, le faisceau qui en suit le bord, le texte, les XP, la barre ; la musique (sons de
//   l'interface : badge, badge-rare, level-up, au volume du réglage).
//
// Rien ici ne décide : le processus principal envoie la vue (frontend.ts, levelMomentView) et
// reçoit { type: 'level-seen' } quand le moment est fini ou fermé.

(() => {
  'use strict';

  const TAU = Math.PI * 2;
  const clamp = (v, a = 0, b = 1) => Math.max(a, Math.min(b, v));
  const quiet = () => matchMedia('(prefers-reduced-motion: reduce)').matches;

  // ---------- Couleurs des raretés ----------
  const RAR = {
    common: { a: '#f1f6f4', b: '#9fb1ac', c: '#3b4a46', d: '#121a18', rgb: [205, 218, 214], rich: 1 },
    rare: { a: '#c9f1ff', b: '#4fb0d6', c: '#13506b', d: '#061923', rgb: [95, 180, 207], rich: 1.5 },
    epic: { a: '#e6dcff', b: '#9a78ff', c: '#3e2296', d: '#12082e', rgb: [169, 139, 255], rich: 2 },
    legendary: { a: '#fff4c9', b: '#e9bf52', c: '#7a5512', d: '#251804', rgb: [240, 210, 122], rich: 3 },
  };
  /** Couleur de chaque palier, pour les rayons d'un niveau qui monte (theme.css, .avatar.tier-*). */
  const TIER_RGB = { novice: [127, 149, 143], flippeur: [63, 184, 168], habitue: [95, 180, 207], expert: [139, 226, 58], maitre: [169, 139, 255], sorcier: [240, 210, 122], legende: [255, 224, 138] };

  // ---------- Le badge ----------
  let uid = 0;
  const pts = (list) => list.map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`).join(' ');
  const ring = (n, r, rot) => Array.from({ length: n }, (_, i) => [50 + r * Math.cos(rot + (i * TAU) / n), 50 + r * Math.sin(rot + (i * TAU) / n)]);
  const iconBody = (name) => (typeof CYBER_ICONS !== 'undefined' && Object.hasOwn(CYBER_ICONS, name) ? CYBER_ICONS[name] : CYBER_ICONS.medal);
  const icon = (name, scale, attrs) => `<g transform="translate(${50 - 12 * scale} ${50 - 12 * scale}) scale(${scale})" fill="none" stroke-linecap="round" stroke-linejoin="round" ${attrs}>${iconBody(name)}</g>`;
  const CHROME = (id) => `<radialGradient id="${id}m" cx="35%" cy="25%" r="85%"><stop offset="0" stop-color="#fbffff"/><stop offset=".3" stop-color="#b9c8c4"/><stop offset=".62" stop-color="#3f504c"/><stop offset=".85" stop-color="#9fb2ad"/><stop offset="1" stop-color="#e3ecea"/></radialGradient>`;
  const NEON = (id) => `<filter id="${id}n" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="1.8" result="b"/><feMerge><feMergeNode in="b"/><feMergeNode in="b"/><feMergeNode in="SourceGraphic"/></feMerge></filter>`;
  const GLOSS = (id) => `<linearGradient id="${id}s" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stop-color="#fff" stop-opacity=".45"/><stop offset=".55" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  const ENAMEL = (id, c) => `<radialGradient id="${id}e" cx="50%" cy="35%" r="75%"><stop offset="0" stop-color="${c.b}" stop-opacity=".9"/><stop offset=".55" stop-color="${c.c}"/><stop offset="1" stop-color="${c.d}"/></radialGradient>`;
  const GLINT = (id) => `<linearGradient id="${id}gl" x1="0" x2="1"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset=".5" stop-color="#fff" stop-opacity=".5"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></linearGradient>`;
  const glint = (id, still) => (still || quiet() ? '' : `<g clip-path="url(#${id}c)"><rect x="-80" y="-20" width="24" height="140" fill="url(#${id}gl)" transform="skewX(-22)"><animate attributeName="x" values="-80;150;150" keyTimes="0;.32;1" dur="5s" begin="${(Math.random() * 4).toFixed(2)}s" repeatCount="indefinite"/></rect></g>`);
  const neonIcon = (name, c, id, scale = 1.5) => `<g filter="url(#${id}n)">${icon(name, scale, `stroke="${c.b}" stroke-width="2.1"`)}</g>${icon(name, scale, 'stroke="#fff" stroke-width=".85"')}`;
  const star = (x, y, c) => `<path d="M${x.toFixed(2)} ${(y - 2.3).toFixed(2)}l.72 1.5 1.65.22-1.2 1.15.3 1.63-1.47-.8-1.47.8.3-1.63-1.2-1.15 1.65-.22z" fill="${c.a}" stroke="${c.c}" stroke-width=".3"/>`;
  /** Rivets lumineux : lueur à la couleur de la rareté, cœur clair, point blanc. */
  const rivets = (id, points, r, c) =>
    `<g filter="url(#${id}n)">${points.map(([x, y]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${r}" fill="${c.b}"/>`).join('')}</g>` +
    points.map(([x, y]) => `<circle cx="${x.toFixed(2)}" cy="${y.toFixed(2)}" r="${(r * 0.72).toFixed(2)}" fill="${c.a}"/><circle cx="${(x - r * 0.25).toFixed(2)}" cy="${(y - r * 0.28).toFixed(2)}" r="${(r * 0.28).toFixed(2)}" fill="#fff"/>`).join('');

  /** Hexagone aux coins arrondis (chaque coin pris sur 22 % de ses côtés), en chemin SVG. */
  function roundHex(r, k = 0.22) {
    const v = ring(6, r, -Math.PI / 2);
    const at = (a, b) => [a[0] + (b[0] - a[0]) * k, a[1] + (b[1] - a[1]) * k];
    let d = '';
    for (let i = 0; i < 6; i++) {
      const prev = v[(i + 5) % 6], cur = v[i], next = v[(i + 1) % 6];
      const [x1, y1] = at(cur, prev), [x2, y2] = at(cur, next);
      d += `${i ? 'L' : 'M'}${x1.toFixed(2)} ${y1.toFixed(2)}Q${cur[0].toFixed(2)} ${cur[1].toFixed(2)} ${x2.toFixed(2)} ${y2.toFixed(2)}`;
    }
    return d + 'Z';
  }
  const circlePath = (r) => `M50 ${50 - r}A${r} ${r} 0 1 1 49.99 ${50 - r}Z`;
  /** Contour du faisceau, au ras du bord, depuis le haut, dans le sens des aiguilles d'une montre. */
  const outline = (rarity) => (rarity === 'common' ? circlePath(47.2) : roundHex(49.3));

  function roundBadge(c, name, id, still) {
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>${CHROME(id)}${NEON(id)}${GLOSS(id)}${ENAMEL(id, c)}${GLINT(id)}<clipPath id="${id}c"><circle cx="50" cy="50" r="46"/></clipPath></defs>
      <circle cx="50" cy="50" r="46" fill="url(#${id}m)"/>
      <circle cx="50" cy="50" r="40.5" fill="#030807"/>
      <circle cx="50" cy="50" r="36.6" fill="url(#${id}e)"/>
      <g filter="url(#${id}n)"><circle cx="50" cy="50" r="38.6" fill="none" stroke="${c.b}" stroke-width="1.7"/></g>
      <circle cx="50" cy="50" r="38.6" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width=".5"/>
      <circle cx="50" cy="50" r="29" fill="none" stroke="${c.a}" stroke-opacity=".22" stroke-width=".5" stroke-dasharray="1 2"/>
      ${rivets(id, ring(4, 43.25, -Math.PI / 2 + Math.PI / 4), 2, c)}
      ${neonIcon(name, c, id)}
      <ellipse cx="44" cy="27" rx="27" ry="13" fill="url(#${id}s)"/>
      ${glint(id, still)}</svg>`;
  }

  function hexBadge(c, name, id, rarity, still) {
    const corners = ring(6, 42.6, -Math.PI / 2);
    const mids = ring(6, 38.9, -Math.PI / 2 + Math.PI / 6);
    const studs = rarity === 'legendary' ? `<g filter="url(#${id}n)">${corners.map(([x, y]) => star(x, y, c)).join('')}</g>` : rivets(id, rarity === 'epic' ? [...corners, ...mids] : corners, rarity === 'epic' ? 1.75 : 2, c);
    return `<svg viewBox="0 0 100 100" aria-hidden="true"><defs>${CHROME(id)}${NEON(id)}${GLOSS(id)}${ENAMEL(id, c)}${GLINT(id)}<clipPath id="${id}c"><path d="${roundHex(48)}"/></clipPath><clipPath id="${id}in"><path d="${roundHex(38.4)}"/></clipPath></defs>
      <path d="${roundHex(48)}" fill="url(#${id}m)"/>
      <path d="${roundHex(42.2)}" fill="#030807"/>
      <path d="${roundHex(38.4)}" fill="url(#${id}e)"/>
      <g filter="url(#${id}n)"><path d="${roundHex(40.3)}" fill="none" stroke="${c.b}" stroke-width="1.7"/></g>
      <path d="${roundHex(40.3)}" fill="none" stroke="#fff" stroke-opacity=".85" stroke-width=".5"/>
      <path d="${roundHex(30)}" fill="none" stroke="${c.a}" stroke-opacity=".22" stroke-width=".5" stroke-dasharray="1 2"/>
      ${studs}
      ${neonIcon(name, c, id)}
      <g clip-path="url(#${id}in)"><ellipse cx="44" cy="26" rx="30" ry="15" fill="url(#${id}s)"/></g>
      ${glint(id, still)}</svg>`;
  }

  function badgeSvg(name, rarity, still = false) {
    const c = RAR[rarity] ?? RAR.common;
    const id = `cpb${uid++}`;
    return rarity === 'common' || !RAR[rarity] ? roundBadge(c, name, id, still) : hexBadge(c, name, id, rarity, still);
  }

  // ---------- Coin d'état : la carte du joueur, ses badges ----------

  function el(tag, className, text) {
    const n = document.createElement(tag);
    if (className) n.className = className;
    if (text !== undefined) n.textContent = text;
    return n;
  }

  function playerCard(p) {
    const card = el('button', `player-card${p.guest ? ' player-card-guest' : ''}`);
    card.type = 'button';
    card.title = p.title;
    if (!p.guest) card.dataset.act = JSON.stringify({ type: 'level' });
    card.append(avatarNode(p.avatar, 'player-card-avatar'));
    const who = el('span', 'player-card-who');
    who.append(el('span', 'player-card-name', p.name));
    const line = el('span', 'player-card-level');
    line.append(el('b', '', p.label));
    if (p.progress !== undefined) {
      const bar = el('span', 'player-card-bar');
      const fill = el('i');
      fill.style.setProperty('--p', `${Math.round(p.progress * 1000) / 10}%`);
      bar.append(fill);
      if (p.gain) {
        const part = el('em');
        part.style.setProperty('--p0', `${Math.round(p.gain.from * 1000) / 10}%`);
        part.style.setProperty('--p', `${Math.round(p.progress * 1000) / 10}%`);
        bar.append(part);
      }
      line.append(bar);
    }
    who.append(line);
    card.append(who);
    if (p.gain) card.append(el('span', 'player-card-gain', p.gain.text));
    return card;
  }

  function badgesPill(b) {
    const pill = el('button', 'badges-pill');
    pill.type = 'button';
    pill.title = b.title;
    pill.dataset.act = JSON.stringify({ type: 'badges' });
    const glyph = el('span', 'badges-pill-glyph');
    glyph.append(cyberIcon('medal', 'badges-pill-icon'));
    pill.append(glyph, el('span', 'badges-pill-count', String(b.count)));
    return pill;
  }

  // ---------- Le moment : fonds ----------

  let seed = 7;
  const rnd = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };
  const hash = (n) => {
    let x = Math.imul(n ^ 0x9e3779b9, 0x85ebca6b);
    x ^= x >>> 13;
    x = Math.imul(x, 0xc2b2ae35);
    x ^= x >>> 16;
    return (x >>> 0) / 4294967296;
  };

  /** Le peintre d'un canevas : W, H, S (un centième de la largeur), la couleur et l'intensité du fond en cours. */
  function painter(canvas) {
    const ctx = canvas.getContext('2d');
    const p = { ctx, W: 1, H: 1, S: 1, rgb: RAR.rare.rgb, gain: 1, rich: 1.5 };
    p.size = () => {
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      // offsetWidth : la taille vue du joueur, le calque étant peut-être tourné.
      p.W = Math.max(1, Math.round(canvas.offsetWidth * dpr));
      p.H = Math.max(1, Math.round(canvas.offsetHeight * dpr));
      canvas.width = p.W;
      canvas.height = p.H;
      // L'unité : un centième de la colonne 9:16 du badge (tout l'écran en borne, son milieu au bureau).
      p.S = Math.min(p.W, (p.H * 9) / 16) / 100;
    };
    p.CX = () => p.W * 0.5;
    p.CY = () => p.H * 0.4;
    p.col = (a, w = 0) => `rgba(${Math.round(p.rgb[0] + (255 - p.rgb[0]) * w)},${Math.round(p.rgb[1] + (255 - p.rgb[1]) * w)},${Math.round(p.rgb[2] + (255 - p.rgb[2]) * w)},${clamp(a * p.gain)})`;
    p.seg = (x1, y1, x2, y2, a, w, white = 0) => {
      ctx.strokeStyle = p.col(a, white);
      ctx.lineWidth = w;
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    };
    p.dot = (x, y, r, a, white = 0.6) => {
      ctx.fillStyle = p.col(a, white);
      ctx.beginPath();
      ctx.arc(x, y, r, 0, TAU);
      ctx.fill();
    };
    return p;
  }
  const motes = (n) => Array.from({ length: n }, () => ({ x: rnd() * 100, y: rnd() * 178, vy: 1.5 + rnd() * 3.5, ph: rnd() * TAU, s: 0.25 + rnd() * 0.6 }));
  function drawMotes(p, list, t, from, rise = true) {
    const k = clamp((t - from) / 1.2);
    if (k <= 0) return;
    for (const m of list) {
      const y = rise ? (((m.y - t * m.vy) % 178) + 178) % 178 : m.y;
      p.dot(m.x * p.S, y * p.S, m.s * p.S * 0.45, k * (0.18 + 0.14 * Math.sin(t * 1.1 + m.ph)), 0.7);
    }
  }

  const SETUP = {
    shock: (p) => ({
      sparks: Array.from({ length: Math.round(36 * p.rich) }, () => ({ a: rnd() * TAU, v: 26 + rnd() * 62, len: 3 + rnd() * 7, life: 0.8 + rnd() * 0.9 })),
      inflow: Array.from({ length: 40 }, () => ({ a: rnd() * TAU, r0: 60 + rnd() * 70, d: rnd() * 0.3 })),
      motes: motes(46),
    }),
    rays: () => ({ motes: motes(60) }),
    swarm: (p) => ({
      list: Array.from({ length: Math.round(60 + 26 * p.rich) }, () => {
        const a = rnd() * TAU, sr = 115 + rnd() * 40, ta = rnd() * TAU, tr = 22 + Math.pow(rnd(), 0.75) * 58;
        return { sx: 50 + Math.cos(a) * sr, sy: 71.1 + Math.sin(a) * sr, tx: 50 + Math.cos(ta) * tr, ty: 71.1 + Math.sin(ta) * tr * 1.35, d: rnd() * 0.25, ph: rnd() * TAU, sp: 1 + rnd() * 2.2, s: 0.35 + rnd() * 0.75 };
      }),
    }),
    rise: () => ({
      cols: Array.from({ length: 9 }, (_, i) => ({ x: 50 + (i - 4) * 10.5, h: i === 4 ? 0 : 0.2 + rnd() * 0.22, d: Math.abs(i - 4) * 0.04 + rnd() * 0.05 })),
      sparks: Array.from({ length: 70 }, () => ({ c: Math.floor(rnd() * 9), y: rnd(), v: 0.12 + rnd() * 0.25, s: 0.25 + rnd() * 0.5, dx: (rnd() - 0.5) * 3 })),
      motes: motes(30),
    }),
    glitch: () => ({ motes: motes(24) }),
    horizon: () => ({ stars: Array.from({ length: 80 }, () => ({ x: rnd() * 100, y: rnd() * 98, s: 0.25 + rnd() * 0.7, ph: rnd() * TAU, sp: 0.7 + rnd() * 2 })) }),
  };

  const RENDER = {
    shock(p, t, d) {
      const { ctx, S } = p, cx = p.CX(), cy = p.CY();
      for (const q of d.inflow) {
        const k = clamp((t - 0.15 - q.d) / (0.85 - q.d));
        if (k <= 0 || k >= 1) continue;
        const r1 = q.r0 * (1 - k * k * k), r2 = q.r0 * (1 - Math.pow(Math.max(0, k - 0.14), 3));
        p.seg(cx + Math.cos(q.a) * r2 * S, cy + Math.sin(q.a) * r2 * S, cx + Math.cos(q.a) * r1 * S, cy + Math.sin(q.a) * r1 * S, 0.25 + 0.6 * k, S * 0.4, 0.4);
      }
      for (const b of p.rich >= 3 ? [1, 1.9] : [1]) {
        const waves = Math.round(2 + p.rich);
        for (let i = 0; i < waves; i++) {
          const age = t - b - i * 0.15, dur = 1.3 + 0.25 * p.rich;
          if (age < 0 || age > dur) continue;
          const k = age / dur;
          ctx.strokeStyle = p.col((1 - k) * 0.85, i === 0 ? 0.55 : 0.1);
          ctx.lineWidth = S * (1.8 * (1 - k) + 0.2);
          ctx.beginPath();
          ctx.arc(cx, cy, (14 + 78 * (1 - Math.pow(1 - k, 3))) * S, 0, TAU);
          ctx.stroke();
        }
        const age = t - b;
        if (age > 0)
          for (const s of d.sparks) {
            if (age > s.life) continue;
            const k = age / s.life;
            const r = 13 + s.v * (1 - Math.pow(1 - k, 3));
            const r0 = Math.max(13, r - s.len * (1 - k * 0.7));
            p.seg(cx + Math.cos(s.a) * r0 * S, cy + Math.sin(s.a) * r0 * S, cx + Math.cos(s.a) * r * S, cy + Math.sin(s.a) * r * S, 1 - k, S * 0.45, 0.7 * (1 - k));
          }
      }
      drawMotes(p, d.motes, t, 1.7);
    },
    rays(p, t, d) {
      const { ctx, S } = p, cx = p.CX(), cy = p.CY();
      const beam = clamp((t - 0.15) / 0.6) * (1 - clamp((t - 1.05) / 0.5));
      if (beam > 0) {
        const g = ctx.createLinearGradient(0, 0, 0, cy);
        g.addColorStop(0, p.col(0));
        g.addColorStop(1, p.col(0.55 * beam, 0.5));
        ctx.fillStyle = g;
        const half = S * (2 + 6 * beam);
        ctx.beginPath();
        ctx.moveTo(cx - half * 0.4, 0);
        ctx.lineTo(cx + half * 0.4, 0);
        ctx.lineTo(cx + half, cy);
        ctx.lineTo(cx - half, cy);
        ctx.closePath();
        ctx.fill();
      }
      const k = clamp((t - 0.85) / 0.9);
      if (k > 0) {
        const R = 150 * S;
        for (const layer of [{ n: 16, w: 0.085, a: 0.4, dir: 1 }, { n: 11, w: 0.035, a: 0.3, dir: -1.7 }]) {
          const g = ctx.createRadialGradient(cx, cy, 6 * S, cx, cy, R);
          g.addColorStop(0, p.col(layer.a * k, 0.55));
          g.addColorStop(0.3, p.col(layer.a * k * 0.55));
          g.addColorStop(1, p.col(0));
          ctx.fillStyle = g;
          ctx.beginPath();
          const rot = t * 0.11 * layer.dir;
          for (let i = 0; i < layer.n; i++) {
            const a = rot + (i * TAU) / layer.n;
            ctx.moveTo(cx, cy);
            ctx.arc(cx, cy, R, a - layer.w, a + layer.w);
            ctx.closePath();
          }
          ctx.fill();
        }
        const h = ctx.createRadialGradient(cx, cy, 0, cx, cy, 42 * S);
        h.addColorStop(0, p.col(0.45 * k, 0.4));
        h.addColorStop(1, p.col(0));
        ctx.fillStyle = h;
        ctx.fillRect(cx - 42 * S, cy - 42 * S, 84 * S, 84 * S);
      }
      drawMotes(p, d.motes, t, 1.2);
    },
    swarm(p, t, d) {
      const S = p.S, cx = p.CX() / S, cy = p.CY() / S;
      const easeOut = (k) => 1 - Math.pow(2, -9 * k);
      for (const q of d.list) {
        if (t < 1) {
          const k = clamp((t - 0.15 - q.d) / (0.85 - q.d));
          if (k <= 0) continue;
          const e = k * k * k, e0 = Math.pow(Math.max(0, k - 0.1), 3);
          p.seg((q.sx + (cx - q.sx) * e0) * S, (q.sy + (cy - q.sy) * e0) * S, (q.sx + (cx - q.sx) * e) * S, (q.sy + (cy - q.sy) * e) * S, 0.25 + 0.6 * k, S * q.s * 0.55, 0.5);
        } else {
          const k = clamp((t - 1) / 1.3);
          const e = easeOut(k);
          const turn = (t - 1) * (0.035 + q.sp * 0.012);
          const dx = (q.tx - cx) * e, dy = (q.ty - cy) * e;
          const x = cx + dx * Math.cos(turn) - dy * Math.sin(turn) * 0.74;
          const y = cy + dx * Math.sin(turn) * 1.35 + dy * Math.cos(turn);
          p.dot(x * S, y * S, q.s * S * 0.55, k < 1 ? 0.9 : 0.5 + 0.4 * Math.sin(t * q.sp + q.ph), 0.55);
        }
      }
    },
    rise(p, t, d) {
      const { ctx, S, H } = p, recY = H * 0.56, cy = p.CY();
      const lineK = clamp((t - 0.2) / 0.4);
      const ck = clamp((t - 0.45) / 0.55);
      const ctop = H - (H - cy) * (ck * ck * (3 - 2 * ck));
      const passed = clamp((t - 0.78) / 0.9);
      if (lineK > 0) {
        ctx.save();
        ctx.setLineDash([S * 1.6, S * 1.2]);
        ctx.strokeStyle = p.col(lineK * (0.35 + (passed > 0 && passed < 1 ? 0.6 * (1 - passed) : 0)), 0.5);
        ctx.lineWidth = S * 0.35;
        ctx.beginPath();
        ctx.moveTo(S * 6, recY);
        ctx.lineTo(p.W - S * 6, recY);
        ctx.stroke();
        ctx.restore();
      }
      const column = (x, top, a, w) => {
        const g = ctx.createLinearGradient(0, top, 0, H);
        g.addColorStop(0, p.col(a, 0.55));
        g.addColorStop(0.25, p.col(a * 0.55));
        g.addColorStop(1, p.col(a * 0.08));
        ctx.fillStyle = g;
        ctx.fillRect(x - w / 2, top, w, H - top);
        const cap = ctx.createRadialGradient(x, top, 0, x, top, w * 1.6);
        cap.addColorStop(0, p.col(a, 0.8));
        cap.addColorStop(1, p.col(0));
        ctx.fillStyle = cap;
        ctx.fillRect(x - w * 1.6, top - w * 1.6, w * 3.2, w * 3.2);
      };
      d.cols.forEach((c, i) => {
        if (i === 4) return;
        const k = clamp((t - 0.1 - c.d) / 0.75);
        if (k <= 0) return;
        column(c.x * S, H - (H - recY) * (c.h / 0.42) * 0.95 * (1 - Math.pow(1 - k, 3)), 0.34 * k, S * 3.2);
      });
      if (ck > 0) column(d.cols[4].x * S, ctop, 0.9, S * 3.8);
      if (t > 1)
        for (const s of d.sparks) {
          const c = d.cols[s.c];
          const y = H - ((s.y + (t - 1) * s.v) % 1) * (H - (s.c === 4 ? cy : recY));
          p.dot(c.x * S + s.dx * S * 0.3, y, s.s * S * 0.4, 0.5 * clamp((t - 1) / 0.6), 0.6);
        }
      drawMotes(p, d.motes, t, 1.6);
    },
    glitch(p, t, d) {
      const { ctx, S, W, H } = p;
      const slices = (intensity) => {
        const frameNo = Math.floor(t * 20);
        const n = Math.round(4 + 14 * intensity);
        for (let i = 0; i < n; i++) {
          const r = (k) => hash(frameNo * 131 + i * 17 + k);
          const y = r(1) * H, h = S * (0.4 + r(2) * 3), x = (r(3) - 0.3) * W, w = W * (0.2 + r(4) * 0.7);
          ctx.fillStyle = p.col(intensity * (0.12 + r(5) * 0.35), r(6) * 0.6);
          ctx.fillRect(x, y, w, h);
          if (r(7) > 0.6) {
            ctx.fillStyle = `rgba(255,70,90,${intensity * 0.25})`;
            ctx.fillRect(x + S * 1.2, y, w, h * 0.5);
          }
        }
      };
      const scan = clamp((t - 0.05) / 0.3);
      ctx.fillStyle = p.col(0.05 * scan, 0.4);
      for (let y = 0; y < H; y += S * 0.9) ctx.fillRect(0, y, W, S * 0.22);
      const build = t < 1 ? clamp(t) : Math.max(0, 1 - (t - 1) / 0.25);
      if (build > 0) slices(build);
      const sweep = clamp((t - 0.95) / 0.5);
      if (sweep > 0 && sweep < 1) {
        const y = H * sweep;
        const g = ctx.createLinearGradient(0, y - S * 14, 0, y);
        g.addColorStop(0, p.col(0));
        g.addColorStop(1, p.col(0.5, 0.6));
        ctx.fillStyle = g;
        ctx.fillRect(0, y - S * 14, W, S * 14);
        ctx.fillStyle = p.col(0.8, 0.9);
        ctx.fillRect(0, y, W, S * 0.3);
      }
      if (t > 1.6 && (t - 1.6) % 3.4 < 0.14) slices(0.35);
      drawMotes(p, d.motes, t, 1.6, false);
    },
    horizon(p, t, d) {
      const { ctx, S, W, H } = p;
      const k = clamp((t - 0.1) / 0.7);
      const hy = H * 0.585, cx = p.CX();
      for (const s of d.stars) p.dot(s.x * S, s.y * S * (hy / (98 * S)) * 0.98, s.s * S * 0.4, k * (0.25 + 0.25 * Math.sin(t * s.sp + s.ph)), 0.8);
      const glow = ctx.createRadialGradient(cx, hy, 0, cx, hy, W * 0.7);
      glow.addColorStop(0, p.col(0.35 * k, 0.3));
      glow.addColorStop(1, p.col(0));
      ctx.fillStyle = glow;
      ctx.fillRect(0, hy - W * 0.7, W, W * 1.4);
      const scroll = (t * 0.45) % 1;
      for (let i = 0; i < 16; i++) {
        const z = (i + scroll) / 16;
        const y = hy + (H - hy) * Math.pow(z, 2.1);
        p.seg(0, y, W, y, k * z * 0.5, S * (0.15 + 0.35 * z), 0.1);
      }
      for (let j = -14; j <= 14; j++) p.seg(cx + j * W * 0.008, hy, cx + j * W * 0.13, H, k * 0.26 * (1 - Math.abs(j) / 16), S * 0.25, 0.1);
      const line = ctx.createLinearGradient(0, 0, W, 0);
      line.addColorStop(0, p.col(0));
      line.addColorStop(0.5, p.col(0.95 * k, 0.6));
      line.addColorStop(1, p.col(0));
      ctx.fillStyle = line;
      ctx.fillRect(0, hy - S * 0.25, W, S * 0.5);
      const sweep = clamp((t - 0.95) / 0.55);
      if (sweep > 0 && sweep < 1) {
        const y = hy * (1 - sweep);
        const g = ctx.createLinearGradient(0, y - S * 10, 0, y + S * 2);
        g.addColorStop(0, p.col(0));
        g.addColorStop(0.8, p.col(0.55 * (1 - sweep), 0.7));
        g.addColorStop(1, p.col(0));
        ctx.fillStyle = g;
        ctx.fillRect(0, y - S * 10, W, S * 12);
      }
    },
  };

  // ---------- Le moment ----------

  const layer = () => document.getElementById('level-moment');
  let current; // { key, stop }

  function moment(view) {
    if (!view) {
      if (current) close();
      return;
    }
    if (current?.key === view.key) return;
    if (current) close();
    current = { key: view.key, stop: play(view) };
  }

  function close() {
    current?.stop?.();
    current = undefined;
    const box = layer();
    if (box) box.replaceChildren();
    box?.classList.remove('lm-on');
  }

  function seen() {
    window.cyber?.act?.({ type: 'level-seen' });
  }

  function sound(cue) {
    if (cue && window.CyberUiSounds) window.CyberUiSounds.play(cue.id, cue.volume);
  }

  /** Le moment entier : le départ (une fois), puis chaque badge, puis le niveau s'il monte sans badge. */
  function play(view) {
    const box = layer();
    if (!box) return () => {};
    box.classList.add('lm-on');
    const timers = [];
    let raf = 0;
    let alive = true;
    const later = (ms, fn) => timers.push(setTimeout(() => alive && fn(), quiet() ? Math.min(ms, 30) : ms));
    const steps = [];
    if (view.start) steps.push({ kind: 'start' });
    view.badges.forEach((b, i) => steps.push({ kind: 'badge', badge: b, index: i }));
    if (!view.start && !view.badges.length && view.to.level > view.from.level) steps.push({ kind: 'level' });
    const levelUp = view.to.level > view.from.level;

    const stage = el('div', 'lm-stage');
    stage.addEventListener('click', () => seen());
    const canvas = el('canvas', 'lm-fx');
    // Le fond couvre tout l'écran ; le badge, le texte et la barre tiennent dans une colonne 9:16
    // centrée (tout l'écran du plateau en borne, le milieu de l'écran au bureau).
    const column = el('div', 'lm-column');
    column.append(el('div', 'lm-flash'));
    stage.append(el('div', 'lm-veil'), canvas, column);
    const medal = el('div', 'lm-medal');
    const art = el('div', 'lm-art');
    const svgNs = 'http://www.w3.org/2000/svg';
    const ringSvg = document.createElementNS(svgNs, 'svg');
    ringSvg.setAttribute('viewBox', '0 0 100 100');
    ringSvg.setAttribute('class', 'lm-ring');
    medal.append(art, ringSvg);
    const queue = el('div', 'lm-queue');
    const txt = el('div', 'lm-txt');
    const kick = el('div', 'lm-kick');
    const name = el('div', 'lm-name');
    const detail = el('div', 'lm-detail');
    const rarityLine = el('div', 'lm-rarity');
    const chip = el('span', 'lm-chip');
    const xp = el('span', 'lm-xp');
    rarityLine.append(chip, xp);
    txt.append(kick, name, detail, rarityLine);
    const up = el('div', 'lm-up');
    const lvl = el('div', 'lm-level');
    const lvAvatar = avatarNode(view.avatar, 'lm-avatar');
    const lvBox = el('div', 'lm-level-box');
    const row1 = el('div', 'lm-level-row');
    const lvNum = el('span', 'lm-level-num');
    const lvTier = el('span', 'lm-level-tier');
    row1.append(lvNum, lvTier);
    const bar = el('div', 'lm-bar');
    const fill = el('i');
    bar.append(fill);
    const xpLine = el('div', 'lm-xpline');
    lvBox.append(row1, bar, xpLine);
    lvl.append(lvAvatar, lvBox);
    const cont = el('div', 'lm-continue', view.texts.continue);
    column.append(medal, queue, txt, up, lvl, cont);
    box.replaceChildren(stage);

    const p = painter(canvas);
    let layers = [];
    let t0 = 0;
    const frame = () => {
      const t = (performance.now() - t0) / 1000;
      p.ctx.setTransform(1, 0, 0, 1, 0, 0);
      p.ctx.globalCompositeOperation = 'source-over';
      p.ctx.clearRect(0, 0, p.W, p.H);
      p.ctx.globalCompositeOperation = 'lighter';
      for (const l of layers) {
        if (t < l.start) continue;
        p.rgb = l.rgb;
        p.gain = l.gain ?? 1;
        RENDER[l.bg](p, t - l.start, l.data);
      }
      p.ctx.globalCompositeOperation = 'source-over';
      raf = requestAnimationFrame(frame);
    };
    const startFx = (list, rich) => {
      cancelAnimationFrame(raf);
      p.size();
      seed = 7;
      p.rich = rich;
      layers = list.map((l) => ({ ...l, data: SETUP[l.bg](p) }));
      t0 = performance.now();
      if (quiet()) {
        p.ctx.clearRect(0, 0, p.W, p.H);
        p.ctx.globalCompositeOperation = 'lighter';
        for (const l of layers) {
          p.rgb = l.rgb;
          p.gain = l.gain ?? 1;
          RENDER[l.bg](p, 5 - l.start, l.data);
        }
        return;
      }
      raf = requestAnimationFrame(frame);
    };

    const setLevel = (lv, instant) => {
      lvNum.textContent = `${view.texts.level} ${lv.level}`;
      lvTier.textContent = lv.tierLabel;
      lvl.style.setProperty('--tier', `rgb(${TIER_RGB[lv.tier].join(',')})`);
      fill.classList.toggle('lm-instant', !!instant);
      fill.style.width = `${Math.round(lv.progress * 1000) / 10}%`;
      xpLine.textContent = `${lv.into.toLocaleString()} / ${lv.need.toLocaleString()} XP`;
    };
    const countXp = (to) => {
      const startAt = performance.now();
      const step = (now) => {
        if (!alive) return;
        const k = Math.min(1, (now - startAt) / 800);
        xp.textContent = `+${Math.round(to * (1 - Math.pow(1 - k, 3))).toLocaleString()} XP`;
        if (k < 1) requestAnimationFrame(step);
      };
      requestAnimationFrame(step);
    };
    /** Le faisceau qui suit le bord du badge, et l'étincelle en tête. */
    const trace = (rarity) => {
      const d = outline(rarity);
      ringSvg.innerHTML = `<path class="lm-trace" d="${d}" pathLength="100"><animate attributeName="stroke-dashoffset" values="100;0" dur=".8s" begin="indefinite" fill="freeze" calcMode="spline" keyTimes="0;1" keySplines=".45 0 .55 1"/></path><g class="lm-spark"><circle r="1.8" fill="#fff"/><circle r="4.5" fill="#fff" opacity=".25"/><animateMotion dur=".8s" begin="indefinite" fill="freeze" calcMode="spline" keyPoints="0;1" keyTimes="0;1" keySplines=".45 0 .55 1" path="${d}"/><animateMotion dur="7s" begin="indefinite" repeatCount="indefinite" path="${d}"/></g>`;
      const [draw] = ringSvg.querySelectorAll('animate');
      const [first, orbit] = ringSvg.querySelectorAll('animateMotion');
      later(1450, () => {
        try {
          draw.beginElement();
          first.beginElement();
          setTimeout(() => alive && orbit.beginElement(), 800);
        } catch {
          // SMIL absent : le faisceau reste plein (CSS).
        }
      });
    };

    let stepIndex = 0;
    const next = () => {
      if (!alive) return;
      const step = steps[stepIndex++];
      if (!step) {
        // Tout est vu : le moment se ferme seul après un temps, sauf touche avant.
        later(8000, seen);
        return;
      }
      stage.className = 'lm-stage';
      void stage.offsetWidth;
      const last = stepIndex === steps.length;
      if (step.kind === 'start') {
        stage.classList.add('lm-play', 'lm-start');
        art.innerHTML = '';
        kick.textContent = view.texts.start;
        name.textContent = `${view.texts.level} ${view.to.level}`;
        detail.textContent = view.texts.startDetail;
        chip.textContent = view.to.tierLabel;
        chip.style.setProperty('--rar', `rgb(${TIER_RGB[view.to.tier].join(',')})`);
        xp.textContent = view.badges.length ? view.texts.badgesSoFar : '';
        setLevel(view.to, true);
        startFx([{ bg: 'rays', start: 0, rgb: TIER_RGB[view.to.tier], gain: 0.6 }], 1.5);
        sound(view.sounds.level);
        later(view.badges.length ? 4200 : 5200, next);
        return;
      }
      if (step.kind === 'level') {
        stage.classList.add('lm-play', 'lm-level-only');
        art.innerHTML = '';
        setLevel(view.from, true);
        startFx([{ bg: 'rays', start: 0, rgb: TIER_RGB[view.to.tier], gain: 0.75 }], 1.5);
        later(900, () => {
          setLevel(view.to);
          up.replaceChildren(document.createTextNode(`${view.texts.level} `), el('b', '', String(view.to.level)), el('small', '', view.to.tierLabel));
          up.style.setProperty('--tier', `rgb(${TIER_RGB[view.to.tier].join(',')})`);
          up.classList.add('lm-show');
          sound(view.sounds.level);
        });
        later(4200, next);
        return;
      }
      const b = step.badge;
      const c = RAR[b.rarity] ?? RAR.common;
      stage.classList.add('lm-play');
      stage.classList.toggle('lm-secret', !!b.secret);
      stage.style.setProperty('--rar', c.b);
      art.innerHTML = badgeSvg(b.icon, b.rarity);
      medal.classList.toggle('lm-hex', b.shape === 'hex');
      trace(b.rarity);
      queue.textContent = view.badges.length > 1 ? `${step.index + 1} / ${view.badges.length}` : '';
      kick.textContent = b.secret ? view.texts.secret : view.texts.unlocked;
      name.textContent = b.label;
      detail.textContent = b.detail;
      chip.textContent = b.rarityLabel;
      chip.style.removeProperty('--rar');
      xp.textContent = '+0 XP';
      up.classList.remove('lm-show');
      // La barre part du niveau d'avant ; au dernier badge, elle va au niveau d'après (et le passe s'il monte).
      setLevel(view.from, true);
      const list = [];
      if (b.rarity === 'legendary' && b.backdrop !== 'rays') list.push({ bg: 'rays', start: 0, rgb: c.rgb, gain: 0.5 });
      list.push({ bg: b.backdrop, start: 0, rgb: c.rgb, gain: b.rarity === 'legendary' ? 0.8 : 1 });
      if (last && levelUp && b.rarity !== 'legendary') list.push({ bg: 'rays', start: 3, rgb: TIER_RGB[view.to.tier], gain: 0.75 });
      startFx(list, c.rich);
      sound(b.rarity === 'common' ? view.sounds.badge : view.sounds.rare);
      later(2400, () => countXp(b.xp));
      if (last) {
        if (levelUp) {
          later(3000, () => {
            fill.classList.remove('lm-instant');
            fill.style.width = '100%';
          });
          later(3850, () => {
            setLevel(view.to, true);
            fill.style.width = '0%';
            requestAnimationFrame(() => setLevel(view.to));
            up.replaceChildren(document.createTextNode(`${view.texts.level} `), el('b', '', String(view.to.level)), el('small', '', view.to.tierLabel));
            up.style.setProperty('--tier', `rgb(${TIER_RGB[view.to.tier].join(',')})`);
            up.classList.add('lm-show');
            sound(view.sounds.level);
          });
        } else later(3000, () => setLevel(view.to));
      }
      later(last ? 5200 : 5000, next);
    };
    next();

    return () => {
      alive = false;
      timers.forEach(clearTimeout);
      cancelAnimationFrame(raf);
    };
  }

  window.CyberLevels = { badgeSvg, playerCard, badgesPill, moment, outline };
})();
