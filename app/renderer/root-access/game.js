// Root Access, jeu caché de Cyber Pinball : boucle, commandes et rendu (Canvas 2D).
// Le moteur (engine.js) fait toute la simulation ; ce fichier ne fait que lire les commandes et dessiner.
// Dans Cyber Pinball (root-access.ts), les boutons et le lanceur de la borne arrivent du processus
// principal par window.borne ; ouverte seule dans un navigateur, la page lit le clavier et la manette.
(function () {
  'use strict';

  const E = window.Engine;
  const LEVELS = window.LEVELS;
  const W = E.W, H = E.H;
  const INFO = 62;             // bandeau étage, score, temps
  const DMD = 46;              // bandeau des messages, façon DMD : jamais sur le plateau
  const HUD = INFO + DMD;
  const VW = W, VH = H + HUD;

  // Couleurs de Cyber Pinball (app/renderer/theme.css).
  const C = {
    void: '#030807', surface: '#07110f', raised: '#0c1a17',
    teal: '#36c9b4', tealDark: '#1c8f80', tealDeep: '#143d35',
    signal: '#8be23a', meta: '#5fb4cf', warning: '#f2b33d', danger: '#ff6b6b',
    ink: '#e6f0ec', muted: '#9bada7', faint: '#62776f',
  };
  const MSG_COLORS = { signal: C.signal, warning: C.warning, danger: C.danger, meta: C.meta };
  const FONT = '"Segoe UI", system-ui, sans-serif';
  const MONO = 'Consolas, "Cascadia Mono", monospace';

  const params = new URLSearchParams(location.search);
  const ROT = ((parseInt(params.get('rot') || '0', 10) % 360) + 360) % 360;
  // Dans Cyber Pinball : les commandes de la borne (root-access-preload.ts), seules lues.
  const borne = window.borne && typeof window.borne.on === 'function' ? window.borne : null;

  // ---------- Musique de fond ----------

  // Une boucle (musique.mp3) très en retrait : elle comble le silence sans se mêler aux bruitages (master 0,22
  // de fx.js) ni lasser. Entrée en fondu, arrêtée avec la fenêtre. Dans Cyber Pinball, `musique=0` la coupe
  // (essais hors écran : aucun son) ; seule, la page la lance au premier geste (politique de lecture du navigateur).
  const MUSIC_VOLUME = 0.1;
  const MUSIC_FADE_MS = 2500;
  const musique = new Audio('musique.mp3');
  musique.loop = true;
  musique.volume = 0;
  function lancerMusique() {
    if (params.get('musique') === '0') return;
    musique.play().then(() => {
      const t0 = performance.now();
      const monter = () => {
        const k = Math.min(1, (performance.now() - t0) / MUSIC_FADE_MS);
        musique.volume = MUSIC_VOLUME * k;
        if (k < 1) setTimeout(monter, 50);
      };
      monter();
    }).catch(() => {
      // Lecture refusée (pas de geste) : elle repart au premier appui.
      const reprendre = () => { window.removeEventListener('keydown', reprendre); window.removeEventListener('pointerdown', reprendre); lancerMusique(); };
      window.addEventListener('keydown', reprendre);
      window.addEventListener('pointerdown', reprendre);
    });
  }

  const canvas = document.getElementById('jeu');
  // Canevas à faible latence : l'image va droit à l'écran sans attendre la composition de la page,
  // une image de moins (16 ms à 60 Hz) entre l'appui sur un flip et son mouvement. Opaque : le jeu
  // peint tout le fond à chaque image. getContextAttributes() dit si Chromium l'a accordé (mesure).
  const mainCtx = canvas.getContext('2d', { desynchronized: true, alpha: false });
  let ctx = mainCtx;           // remplacé un instant par le calque de la victoire (fondu du plateau)
  let layer = null, layerCtx = null;
  let dpr = 1, cw = 0, ch = 0, lw = 0, lh = 0, scale = 1, ox = 0, oy = 0;
  let caches = [];
  let px = 1;                  // pixels réels par unité logique, plafonné (borne 4K)
  const previews = LEVELS.map((l) => E.buildFloor(l));
  const FX = window.RootFX.create(E, C);
  const DA = window.RootDA.create(E, C, FONT, MONO);
  setTimeout(() => FX.prechauffer(), 200);

  // ---------- État de l'écran ----------

  let g = E.createGame(LEVELS);
  let screen = 'titre';        // titre | jeu
  let paused = false;
  let frozen = false;          // scènes figées des captures d'essai
  let autoplay = false;        // robot de la mesure de charge
  let trail = [];
  let prevInput = { left: false, right: false, plunger: false };

  function start(viaLanceur) {
    g = E.createGame(LEVELS);
    screen = 'jeu';
    paused = false;
    trail = [];
    // Lancée par le lanceur, la partie commence déjà la charge (le titre dit « maintiens le lanceur ») ;
    // lancée par un flip, il faut une nouvelle pression.
    g.prev.plunger = !viaLanceur;
  }

  // ---------- Taille et repère ----------

  function resize() {
    cw = window.innerWidth; ch = window.innerHeight;
    const turned = ROT === 90 || ROT === 270;
    lw = turned ? ch : cw;
    lh = turned ? cw : ch;
    scale = Math.min(lw / VW, lh / VH);
    // Résolution interne plafonnée à 2 pixels par unité (1200 × 2216 pour le jeu) : sur un écran 4K,
    // le navigateur agrandit l'image au lieu de tout dessiner en 4K.
    const real = window.devicePixelRatio || 1;
    dpr = Math.min(real, 2 / scale);
    px = scale * dpr;
    canvas.width = Math.round(cw * dpr);
    canvas.height = Math.round(ch * dpr);
    ox = (lw - VW * scale) / 2;
    oy = (lh - VH * scale) / 2;
    caches = [];
    layer = null; layerCtx = null;
  }

  // Calque de la taille du canevas, pour fondre le plateau d'un bloc à la victoire.
  function victoryLayer() {
    if (!layer || layer.width !== canvas.width || layer.height !== canvas.height) {
      layer = document.createElement('canvas');
      layer.width = canvas.width; layer.height = canvas.height;
      layerCtx = layer.getContext('2d');
    }
    return layerCtx;
  }

  function baseTransform() {
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (ROT) {
      ctx.translate(cw / 2, ch / 2);
      ctx.rotate((ROT * Math.PI) / 180);
      ctx.translate(-lw / 2, -lh / 2);
    }
    ctx.translate(ox, oy);
    ctx.scale(scale, scale);
  }

  // ---------- Dessins de base ----------

  function seg(c, s) { c.beginPath(); c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); }

  function lcg(seed) { let s = seed >>> 0; return () => ((s = (s * 1664525 + 1013904223) >>> 0) / 4294967296); }

  // Fond et décor fixes d'un étage, dessinés une fois dans un canevas caché.
  function cache(k) {
    if (caches[k]) return caches[k];
    const c = document.createElement('canvas');
    const px = scale * dpr;
    c.width = Math.max(1, Math.round(W * px));
    c.height = Math.max(1, Math.round(H * px));
    const x = c.getContext('2d');
    x.scale(px, px);
    drawStatic(x, LEVELS[k], k);
    caches[k] = c;
    return c;
  }

  // Fond transparent : la ville de Vertige et les racines (fx.js) se voient derrière.
  function drawStatic(c, level, k) {
    // Pistes de circuit imprimé : l'Arbre.
    const rnd = lcg(k * 7919 + 13);
    c.lineCap = 'round'; c.lineJoin = 'round';
    let centre = 0;
    for (let i = 0; i < 46; i++) {
      let x = 30 + rnd() * (W - 60), y = rnd() * H;
      // Une piste sur deux en moins au centre, là où se lisent les mécanismes.
      if (x > 140 && x < 460 && centre++ % 2 === 1) continue;
      c.beginPath(); c.moveTo(x, y);
      for (let j = 0; j < 3; j++) {
        const len = 30 + rnd() * 90;
        const dir = Math.floor(rnd() * 4);
        if (dir === 0) y -= len; else if (dir === 1) { x += len * 0.7; y -= len * 0.7; } else if (dir === 2) { x -= len * 0.7; y -= len * 0.7; } else x += (rnd() < 0.5 ? -1 : 1) * len;
        c.lineTo(x, y);
      }
      c.strokeStyle = 'rgba(54, 201, 180, 0.07)'; c.lineWidth = 2; c.stroke();
      c.fillStyle = 'rgba(54, 201, 180, 0.14)';
      c.beginPath(); c.arc(x, y, 3, 0, Math.PI * 2); c.fill();
    }

    // Le vide sous les flips de base.
    const grd = c.createLinearGradient(0, 900, 0, 968);
    grd.addColorStop(0, 'rgba(255, 107, 107, 0)');
    grd.addColorStop(1, 'rgba(255, 107, 107, 0.16)');
    c.fillStyle = grd;
    c.fillRect(190, 900, 220, 68);

    // Conduit d'arrivée (pas au premier étage) : la bille montée de l'étage d'en dessous le suit
    // jusqu'au berceau.
    if (k > 0) {
      const pts = E.CONDUIT;
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
      for (const p of pts.slice(1)) c.lineTo(p[0], p[1]);
      c.strokeStyle = C.tealDeep; c.lineWidth = 30; c.stroke();
      c.strokeStyle = '#000'; c.lineWidth = 24; c.stroke();
      c.setLineDash([2, 10]); c.strokeStyle = 'rgba(139, 226, 58, 0.35)'; c.lineWidth = 2; c.stroke(); c.setLineDash([]);
      const end = pts[pts.length - 1];
      c.fillStyle = 'rgba(139, 226, 58, 0.25)';
      c.beginPath(); c.arc(end[0], end[1], 14, 0, Math.PI * 2); c.fill();
    }

    // Sortie.
    if (level.exit) {
      const r = level.exit;
      c.fillStyle = 'rgba(139, 226, 58, 0.07)';
      c.fillRect(r.x1, 0, r.x2 - r.x1, r.y2 + 20);
    }

    // Matière commune (da.js) : racine latérale, coques des lance-pierres, murs gainés, serrure.
    DA.racineLaterale(c);
    DA.lancePierres(c, level.slings);
    DA.murs(c, level.walls);
    DA.serrureFixe(c, level);

    // Étiquettes.
    c.font = '600 12px ' + FONT;
    c.textAlign = 'center';
    c.fillStyle = C.faint;
    for (const l of level.labels || []) c.fillText(l.text, l.x, l.y);
  }

  // ---------- Objets mobiles ----------

  function exitOpen(f) {
    return (f.gates || []).every((gt) => gt.open) && (f.bridges || []).every((b) => b.down);
  }

  function drawDynamic(f, live, t) {
    if (live) for (const a of f.aspirations || []) {
      if (!a.actif) continue;
      const x0 = a.vers[0], y0 = Math.min(a.zone.y2 - 40, 420), y1 = 70;
      const phase = (t * 1.4) % 1;
      for (let i = 0; i < 6; i++) {
        const u = (i + phase) / 6;
        const y = y0 + (y1 - y0) * u;
        ctx.globalAlpha = 0.12 + 0.3 * Math.sin(Math.PI * u);
        ctx.strokeStyle = C.signal; ctx.lineWidth = 3;
        ctx.beginPath(); ctx.moveTo(x0 - 14, y + 8); ctx.lineTo(x0, y - 4); ctx.lineTo(x0 + 14, y + 8); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }
    // Ponts : deux états pré-rendus (tablier ou fosse « RETOUR », qui ne tue pas : jamais rouge).
    for (const br of f.bridges) {
      DA.pont(ctx, br);
      const r = br.rect;
      if (br.down && br.total) timerBar(r.x1, r.y2 + 10, r.x2 - r.x1, br.timer / br.total, br.timer, t);
    }

    // Portes (une porte fermée bloque sans tuer : bleue) ; la porte à serrure a ses mâchoires.
    for (const gt of f.gates) {
      const s = gt.seg;
      if (gt.serrure) DA.serrure(ctx, f, gt, t); else DA.porte(ctx, gt);
      if (gt.open && gt.total) timerBar(s[0], s[1] + 12, s[2] - s[0], gt.timer / gt.total, gt.timer, t);
    }

    // Sortie accessible : chevrons.
    if (f.exit && exitOpen(f)) {
      const r = f.exit, cx = (r.x1 + r.x2) / 2;
      ctx.strokeStyle = C.signal; ctx.lineWidth = 3; ctx.lineCap = 'round';
      for (let i = 0; i < 3; i++) {
        const y = 52 - i * 16;
        ctx.globalAlpha = 0.25 + 0.75 * Math.max(0, Math.sin(t * 6 - i * 0.9));
        ctx.beginPath(); ctx.moveTo(cx - 14, y + 8); ctx.lineTo(cx, y); ctx.lineTo(cx + 14, y + 8); ctx.stroke();
      }
      ctx.globalAlpha = 1;
    }

    // Cibles et interrupteurs, bumpers, faces des lance-pierres, bascules sous tension, flips.
    for (const tg of f.targets) DA.cible(ctx, tg);
    for (const b of f.bumpers) DA.bumper(ctx, b);
    for (const s of f.slings) DA.faceLancePierre(ctx, s);
    for (const s of f.seesaws) DA.bascule(ctx, f, s, t);
    for (const fl of f.flippers) DA.flip(ctx, fl);
  }

  // Compte à rebours sous un mécanisme : des segments qui s'éteignent un à un, ambre sur les
  // 3 dernières secondes (le dernier allumé palpite).
  function timerBar(x, y, w, frac, left, t) {
    const n = 12, gap = 3, sw = (w - gap * (n - 1)) / n;
    const lit = Math.ceil(Math.max(0, frac) * n);
    const warn = left < 3;
    for (let i = 0; i < n; i++) {
      if (i < lit) {
        ctx.fillStyle = warn ? C.warning : C.signal;
        ctx.globalAlpha = i === lit - 1 ? 0.55 + 0.45 * Math.sin(t * (warn ? 16 : 6)) : 1;
      } else { ctx.fillStyle = 'rgba(230, 240, 236, 0.1)'; ctx.globalAlpha = 1; }
      ctx.fillRect(x + i * (sw + gap), y, sw, 6);
    }
    ctx.globalAlpha = 1;
    ctx.font = '700 17px ' + MONO; ctx.textAlign = 'center';
    ctx.fillStyle = warn ? C.warning : C.signal;
    ctx.fillText(Math.ceil(Math.max(0, left)) + ' s', x + w / 2, y + 24);
  }

  function drawBall(x, y, alpha, radius) {
    const r = radius || E.BALL_R;
    ctx.globalAlpha = alpha * 0.3;
    ctx.fillStyle = C.signal;
    ctx.beginPath(); ctx.arc(x, y, r + 6, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = alpha;
    const grd = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, 1, x, y, r);
    grd.addColorStop(0, '#ffffff');
    grd.addColorStop(0.45, '#cfe3dc');
    grd.addColorStop(1, '#5d7570');
    ctx.fillStyle = grd;
    ctx.beginPath(); ctx.arc(x, y, r, 0, Math.PI * 2); ctx.fill();
    ctx.globalAlpha = 1;
  }

  // ---------- Textes ----------

  function wrap(text, maxWidth) {
    const words = text.split(' ');
    const lines = [];
    let line = '';
    for (const w of words) {
      const test = line ? line + ' ' + w : w;
      if (ctx.measureText(test).width > maxWidth && line) { lines.push(line); line = w; } else line = test;
    }
    if (line) lines.push(line);
    return lines;
  }

  function fmtTime(s) {
    const m = Math.floor(s / 60);
    const r = s - m * 60;
    return m + ':' + (r < 10 ? '0' : '') + r.toFixed(1);
  }

  function drawHud(t) {
    ctx.fillStyle = C.surface;
    ctx.fillRect(0, 0, W, INFO);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, INFO, W, DMD);
    ctx.fillStyle = C.tealDeep;
    ctx.fillRect(0, INFO - 1, W, 1);
    ctx.fillRect(0, HUD - 2, W, 2);
    const shown = Math.min(g.floor + (g.status === 'won' ? 1 : 1), LEVELS.length);
    ctx.textAlign = 'left';
    ctx.font = '700 22px ' + FONT; ctx.fillStyle = C.signal;
    ctx.fillText('ÉTAGE ' + shown + '/' + LEVELS.length, 16, 30);
    ctx.font = '600 13px ' + FONT; ctx.fillStyle = C.muted;
    ctx.fillText((LEVELS[g.floor].biome || 'RACINES') + ' · ' + (LEVELS[g.floor].nom || '').toUpperCase(), 16, 51);
    ctx.textAlign = 'right';
    // Aimant : la charge du Tronc, à gauche du chrono.
    if (LEVELS[g.floor].biome === 'TRONC') {
      ctx.font = '700 13px ' + MONO;
      ctx.fillStyle = g.aimant > 0 ? C.meta : C.muted;
      ctx.fillText(g.aimant > 0 ? 'AIMANT ×' + g.aimant : 'AIMANT VIDE', W - 86, 51);
    }
    ctx.font = '700 22px ' + MONO; ctx.fillStyle = C.ink;
    ctx.fillText(String(g.score).padStart(6, '0'), W - 16, 30);
    ctx.font = '600 13px ' + MONO; ctx.fillStyle = C.muted;
    ctx.fillText(fmtTime(g.t * E.DT), W - 16, 51);
  }

  // Messages dans le bandeau DMD : vert (Lyse, bonne nouvelle), ambre (attention), rouge (danger).
  function drawMessage(t) {
    ctx.textAlign = 'center';
    if (!(g.msg.t > 0) || !g.msg.text) {
      const o = objectif();
      if (!o) return;
      ctx.font = '700 22px ' + MONO; ctx.fillStyle = o.color;
      ctx.fillText(o.text, W / 2, INFO + DMD / 2 + 8);
      // Repères qui battent de part et d'autre : l'animation porte sur eux, jamais sur la lisibilité du texte.
      const half = ctx.measureText(o.text).width / 2 + 16, k = 3 * Math.sin(t * 5);
      ctx.fillRect(W / 2 - half - 8 - k, INFO + DMD / 2 - 4, 6, 6);
      ctx.fillRect(W / 2 + half + 2 + k, INFO + DMD / 2 - 4, 6, 6);
      return;
    }
    const color = MSG_COLORS[g.msg.color] || C.signal;
    let size = 17;
    ctx.font = '700 ' + size + 'px ' + MONO;
    let lines = wrap(g.msg.text, W - 32);
    if (lines.length > 1) { size = 15; ctx.font = '700 ' + size + 'px ' + MONO; lines = wrap(g.msg.text, W - 32); }
    if (lines.length > 2) { size = 13; ctx.font = '700 ' + size + 'px ' + MONO; lines = wrap(g.msg.text, W - 24).slice(0, 2); }
    const lh = size + 3;
    const y0 = INFO + DMD / 2 - ((lines.length - 1) * lh) / 2 + size * 0.36;
    ctx.globalAlpha = Math.min(1, g.msg.t / 0.4);
    ctx.fillStyle = color;
    lines.forEach((l, i) => ctx.fillText(l, W / 2, y0 + i * lh));
    ctx.globalAlpha = 1;
  }

  // Ce qu'il faut faire maintenant, lu dans l'état de l'étage (jamais dans un message).
  function objectif() {
    const f = g.f, lv = LEVELS[g.floor];
    if (g.status === 'cradle') return { text: 'MAINTIENS LE LANCEUR', color: C.signal };
    if (g.status !== 'play' || !lv.objectif) return null;
    const ouverts = [...f.gates, ...f.bridges].filter((o) => o.open || o.down);
    if (ouverts.length && exitOpen(f)) {
      const left = Math.min(...ouverts.map((o) => (o.total ? o.timer : Infinity)));
      const chrono = isFinite(left) ? ' · ' + Math.ceil(left) + ' s' : '';
      return { text: lv.objectif.ouvert + chrono, color: isFinite(left) && left < 3 ? C.warning : C.signal };
    }
    // Étage à deux conditions (Tronc) : la première qui manque, avec le compte de sa serrure, et le temps
    // qui reste à celle déjà ouverte s'il y en a un.
    if (lv.objectif.conditions) {
      const k = lv.objectif.conditions.find((o) => !E.ouvert(f, o.id));
      if (k) {
        const gt = f.gates.find((o) => o.id === k.id && o.serrure);
        const n = gt ? ' · ' + gt.serrure.cibles.filter((id) => f.targets.some((x) => x.id === id && x.down)).length + '/' + gt.serrure.cibles.length : '';
        const left = Math.min(...ouverts.map((o) => (o.total ? o.timer : Infinity)));
        const chrono = isFinite(left) ? ' · ' + Math.ceil(left) + ' s' : '';
        return { text: k.texte + n + chrono, color: isFinite(left) && left < 3 ? C.warning : C.signal };
      }
    }
    const drops = f.targets.filter((x) => x.kind === 'drop');
    const n = drops.length ? ' · ' + drops.filter((x) => x.down).length + '/' + drops.length : '';
    return { text: lv.objectif.ferme + n, color: C.signal };
  }

  function overlay(title, color, lines, hint, t) {
    ctx.fillStyle = 'rgba(3, 8, 7, 0.88)';
    ctx.fillRect(0, 0, VW, VH);
    ctx.textAlign = 'center';
    let y = VH * 0.3;
    if (title.small) {
      ctx.font = '700 20px ' + FONT; ctx.fillStyle = C.muted;
      ctx.fillText(title.small, VW / 2, y - 62);
    }
    ctx.font = '800 52px ' + FONT; ctx.fillStyle = color;
    ctx.globalAlpha = 0.2; ctx.fillText(title.text, VW / 2 + 2, y + 3); ctx.globalAlpha = 1;
    ctx.fillText(title.text, VW / 2, y);
    y += 60;
    for (const l of lines) {
      if (l === '') { y += 14; continue; }
      const style = typeof l === 'string' ? { text: l } : l;
      ctx.font = (style.font || '500 18px ') + (style.mono ? MONO : FONT);
      ctx.fillStyle = style.color || C.ink;
      for (const w of wrap(style.text, VW - 80)) { ctx.fillText(w, VW / 2, y); y += style.lh || 28; }
    }
    if (hint) DA.consigne(ctx, hint, VW / 2, VH - 90, t, 18);
  }

  const COMMANDES = [
    { text: 'COMMANDES', color: C.ink, font: '700 17px ' },
    { text: 'Flips : Maj gauche et Maj droite (ou ← →, Z et M, manette LB et RB)', color: C.muted, font: '500 15px ', lh: 24 },
    { text: 'Lanceur : Entrée ou Espace (manette A) : maintiens pour charger, relâche pour tirer', color: C.muted, font: '500 15px ', lh: 24 },
    { text: 'Aimant (Tronc) : Ctrl gauche ou droit, ou X (manette B ou X) : tient la bille 1 s sur un flip, un coup de flip la relâche', color: C.muted, font: '500 15px ', lh: 24 },
    { text: 'S : son · F11 : plein écran · Échap : quitter', color: C.muted, font: '500 15px ', lh: 24 },
  ];

  // ---------- Image ----------

  function render(t) {
    ctx = mainCtx;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    baseTransform();
    FX.observe(g, false);

    // Titre : pas de voile. La ville éteinte, la grande racine et la sonde à son pied.
    if (screen === 'titre') {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, 0, VW, VH); ctx.clip();
      ctx.fillStyle = C.void; ctx.fillRect(0, 0, VW, VH);
      ctx.translate(0, HUD);
      FX.drawBackground(ctx, g);
      ctx.restore();
      DA.titre(ctx, t, VW, VH, borne ? 'borne' : padPresent ? 'manette' : 'clavier', FX.drawBall);
      return;
    }

    // Fond (la ville) toujours sur le canevas principal.
    ctx.save();
    ctx.beginPath(); ctx.rect(0, HUD, W, H); ctx.clip();
    ctx.translate(0, HUD);
    ctx.fillStyle = C.void;
    ctx.fillRect(0, 0, W, H);
    FX.drawBackground(ctx, g);
    ctx.restore();

    // Plateau. À la victoire, il s'efface d'un bloc en 0,8 s (calque intermédiaire) : Vertige reste visible.
    const won = g.status === 'won';
    const fade = won ? Math.max(0, 1 - g.statusT / 0.8) : 1;
    if (fade > 0) {
      if (fade < 1) {
        ctx = victoryLayer();
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.clearRect(0, 0, layer.width, layer.height);
        baseTransform();
      }
      ctx.save();
      ctx.beginPath(); ctx.rect(0, HUD, W, H); ctx.clip();
      ctx.translate(0, HUD);
      drawPlateau(t);
      ctx.restore();
      if (fade < 1) {
        ctx = mainCtx;
        ctx.setTransform(1, 0, 0, 1, 0, 0);
        ctx.globalAlpha = fade;
        ctx.drawImage(layer, 0, 0);
        ctx.globalAlpha = 1;
        baseTransform();
      }
    }
    if (won) {
      ctx.save();
      ctx.beginPath(); ctx.rect(0, HUD, W, H); ctx.clip();
      ctx.translate(0, HUD);
      DA.brancheVictoire(ctx, g);
      ctx.restore();
    }

    drawHud(t);
    drawMessage(t);

    if (g.status === 'dead') {
      overlay({ text: 'SIGNAL PERDU' }, C.danger, [
        { text: 'Étage atteint : ' + (g.floor + 1) + '/' + LEVELS.length + ' · score ' + g.score, color: C.ink },
        { text: 'Temps : ' + fmtTime(g.t * E.DT), color: C.muted },
        '',
        { text: 'LYSE : JE T\'EN ENVOIE UNE AUTRE.', color: C.signal, mono: true, font: '700 17px ' },
      ], g.statusT > 1 ? (borne ? 'UN FLIP POUR RECOMMENCER' : 'UN FLIP OU ENTRÉE POUR RECOMMENCER') : '', t);
    } else if (won) {
      const tronc = LEVELS[g.floor].biome === 'TRONC';
      DA.victoire(ctx, g, t, VW, VH, {
        petit: tronc ? 'TRONC RALLUMÉ' : 'RACINES RALLUMÉES',
        titre: tronc ? 'ACCÈS À LA CIME' : 'ACCÈS AU TRONC',
        bilan: 'Temps ' + fmtTime(g.t * E.DT) + ' · score ' + g.score,
        lyse: tronc ? ['LYSE : LE TRONC EST RALLUMÉ.', 'PROCHAIN ARRÊT : LA CIME.']
          : ['LYSE : TU VOIS LA VILLE ? LE PREMIER', 'QUARTIER S\'EST RALLUMÉ.'],
      }, g.statusT > 2 ? (borne ? 'UN FLIP POUR REJOUER' : 'UN FLIP OU ENTRÉE POUR REJOUER') : '');
    } else if (paused) {
      overlay({ text: 'PAUSE' }, C.meta, [{ text: 'P pour reprendre', color: C.muted }, '', ...COMMANDES], '', t);
    }
  }

  // Le plateau dans son repère (0 à H), sur le contexte courant.
  function drawPlateau(t) {
    const [sx, sy] = FX.shakeOffset();
    ctx.translate(sx, sy);
    const cam = g.camera;
    const k0 = Math.floor(cam + 1e-9);
    for (const k of [k0, k0 + 1]) {
      if (k < 0 || k >= LEVELS.length) continue;
      const off = (cam - k) * H;
      if (off >= H || off <= -H) continue;
      ctx.drawImage(cache(k), 0, off, W, H);
      ctx.save();
      ctx.translate(0, off);
      if (k === g.floor) FX.drawFlips(ctx, g);
      drawDynamic(k === g.floor ? g.f : previews[k], k === g.floor, t);
      if (g.status === 'transit' && k === g.floor) drawClosingGrid(g.f, Math.min(1, g.statusT / E.TRANSIT));
      ctx.restore();
    }
    DA.montee(ctx, g);
    FX.drawSignals(ctx, g);
    FX.drawImpacts(ctx, g);
    FX.drawAscent(ctx, g);

    // Bille.
    let bx, by, alpha = 1, radius = E.BALL_R;
    if (g.status === 'transit' && g.transit) {
      const p = E.transitBall(g);
      bx = p.x; by = p.y + cam * H;
    } else {
      bx = g.ball.x; by = g.ball.y + (cam - g.floor) * H;
      if (g.status === 'cradle' && (g.charging || g.tire)) by += g.charge * 14;   // le piston tire la bille en arrière
      if (g.status === 'falling') { const u = Math.min(1, g.statusT / E.FALL); alpha = 1 - u; radius = E.BALL_R * (1 - 0.7 * u); }
    }
    if (g.status !== 'dead' && g.status !== 'descente') {
      for (let i = 0; i < trail.length; i++) {
        const p = trail[i];
        ctx.globalAlpha = (i / trail.length) * 0.25 * alpha;
        ctx.fillStyle = C.signal;
        ctx.beginPath(); ctx.arc(p.x, p.y + cam * H, E.BALL_R * (0.4 + 0.5 * (i / trail.length)), 0, Math.PI * 2); ctx.fill();
      }
      ctx.globalAlpha = 1;
      FX.drawBall(ctx, bx, by, alpha, radius);
    }

    if (g.status === 'cradle' || (g.status === 'play' && g.statusT < 0.15)) drawPlunger(g.f.cradle, t);
    DA.sauve(ctx, g, E.saveDuration(g));
    DA.aimant(ctx, g, t);
  }

  // Lanceur : fourreau sombre à lèvres bleues, 8 segments verts qui montent vers la bille pendant la charge,
  // piston sous la bille. Pleine charge : dernier segment fixe et contour qui bat (jamais de rouge).
  function drawPlunger(c, t) {
    const SEG = 8, sh = 9;
    const droite = c.x > W / 2;           // jauge et consigne du côté du plateau, jamais contre le mur
    const gx = c.x + (droite ? -30 : 30), bot = c.y + 32, top = bot - SEG * sh;
    const ch = g.status === 'cradle' && (g.charging || g.tire) ? g.charge : 0;
    const full = ch >= 1;
    ctx.fillStyle = '#04100d';
    ctx.fillRect(gx - 7, top - 4, 14, SEG * sh + 8);
    ctx.strokeStyle = full && Math.sin(t * 14) > 0 ? C.signal : C.meta;
    ctx.lineWidth = 1.5;
    ctx.strokeRect(gx - 7, top - 4, 14, SEG * sh + 8);
    const lit = ch * SEG;
    for (let i = 0; i < SEG; i++) {
      const y = bot - (i + 1) * sh + 1;
      ctx.globalAlpha = lit > i ? 1 : 0.18;
      ctx.fillStyle = lit > i ? C.signal : C.tealDeep;
      ctx.fillRect(gx - 4, y, 8, sh - 2);
    }
    ctx.globalAlpha = 1;
    // Piston sous la bille, qui recule avec la charge ; au tir il revient d'un coup avec une impulsion.
    const py = c.y + E.BALL_R + 2 + ch * 14;
    ctx.fillStyle = C.meta;
    ctx.fillRect(c.x - 9, py, 18, 4);
    ctx.fillRect(c.x - 2, py + 4, 4, 10);
    if (g.status === 'play') {
      const u = g.statusT / 0.15;
      ctx.globalAlpha = 1 - u; ctx.strokeStyle = C.signal; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.arc(c.x, c.y, E.BALL_R + 6 + u * 26, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
      return;
    }
    const pulse = (t * 1.6) % 1;
    if (!g.charging && !g.tire) {
      ctx.strokeStyle = C.signal; ctx.lineWidth = 2; ctx.globalAlpha = 1 - pulse;
      ctx.beginPath(); ctx.arc(c.x, c.y, E.BALL_R + 4 + pulse * 22, 0, Math.PI * 2); ctx.stroke();
      ctx.globalAlpha = 1;
    }
    if (screen === 'jeu') {
      ctx.font = '700 15px ' + FONT; ctx.textAlign = droite ? 'right' : 'left'; ctx.fillStyle = C.signal;
      ctx.fillText(g.charging || g.tire ? 'RELÂCHE POUR LANCER' : g.analogique ? 'TIRE LE LANCEUR' : 'MAINTIENS LE LANCEUR', droite ? W - 26 : 26, top - 14);
    }
  }

  // La sortie se referme derrière la bille : on ne redescend jamais.
  function drawClosingGrid(f, u) {
    if (!f.exit) return;
    const r = f.exit;
    const y = r.y2 + 6;
    const half = (r.x2 - r.x1) / 2;
    const cx = (r.x1 + r.x2) / 2;
    const reach = half * Math.min(1, u * 1.6);
    ctx.strokeStyle = C.teal; ctx.lineWidth = 3;
    seg(ctx, [r.x1, y, r.x1 + reach, y]); ctx.stroke();
    seg(ctx, [r.x2, y, r.x2 - reach, y]); ctx.stroke();
    for (let x = r.x1 + 8; x < r.x2; x += 12) {
      if (Math.abs(x - cx) < half - reach) continue;
      ctx.beginPath(); ctx.moveTo(x, y - 7); ctx.lineTo(x, y + 7); ctx.stroke();
    }
  }

  // ---------- Commandes ----------

  const keys = new Set();
  // Ctrl n'est plus un flip : comme dans VPX, c'est le bouton magnétique (MagnaSave), ici l'aimant du Tronc.
  const LEFT = ['ShiftLeft', 'ArrowLeft', 'KeyZ', 'KeyA'];
  const RIGHT = ['ShiftRight', 'ArrowRight', 'KeyM', 'KeyL'];
  const PLUNGER = ['Enter', 'NumpadEnter', 'Space', 'ArrowDown'];
  const AIMANT = ['ControlLeft', 'ControlRight', 'KeyX'];

  window.addEventListener('keydown', (e) => {
    if (e.code === 'F11') { e.preventDefault(); toggleFullscreen(); return; }
    if (e.code === 'Escape') {
      e.preventDefault();
      if (document.fullscreenElement) document.exitFullscreen(); else window.close();
      return;
    }
    if (e.repeat) return;
    keys.add(e.code);
    if (LEFT.includes(e.code) || RIGHT.includes(e.code) || PLUNGER.includes(e.code) || AIMANT.includes(e.code)) e.preventDefault();
    if (e.code === 'KeyP' && screen === 'jeu') paused = !paused;
    if (e.code === 'KeyS') FX.basculerSon();
  });
  window.addEventListener('keyup', (e) => keys.delete(e.code));
  window.addEventListener('blur', () => keys.clear());

  function toggleFullscreen() {
    if (document.fullscreenElement) document.exitFullscreen();
    else document.documentElement.requestFullscreen().catch(() => {});
  }

  function readPad() {
    const out = { left: false, right: false, plunger: false, aimant: false };
    const pads = navigator.getGamepads ? navigator.getGamepads() : [];
    padPresent = false;
    for (const p of pads) {
      if (!p) continue;
      padPresent = true;
      const b = (i) => p.buttons[i] && p.buttons[i].pressed;
      if (b(4) || b(6) || b(14)) out.left = true;
      if (b(5) || b(7) || b(15)) out.right = true;
      if (b(0) || b(13)) out.plunger = true;
      if (b(1) || b(2)) out.aimant = true;
    }
    return out;
  }

  let padPresent = false;      // le titre nomme le bouton de la manette si une manette est branchée

  let bot = { left: { delay: -1, held: 0 }, right: { delay: -1, held: 0 } };
  function robotInput(dt) {
    const b = g.ball;
    const inp = { left: false, right: false, plunger: false };
    for (const side of ['left', 'right']) {
      const s = bot[side];
      const zone = side === 'left' ? b.x < 300 : b.x >= 300;
      if (s.held > 0) { s.held -= dt; inp[side] = true; continue; }
      if (g.status === 'play' && zone && b.y > 780 && b.vy > -50 && s.delay < 0) s.delay = Math.random() * 0.25;
      if (s.delay >= 0) { s.delay -= dt; if (s.delay < 0) { s.held = 0.25; inp[side] = true; } }
    }
    // Au berceau : le robot tire le lanceur 0,6 à 1 s puis relâche.
    if (g.status === 'cradle') { if (bot.tir == null) bot.tir = 0.6 + Math.random() * 0.4; bot.tir -= dt; inp.plunger = bot.tir > 0; } else bot.tir = null;
    if (g.status === 'dead' || g.status === 'won') start();
    return inp;
  }

  // Dans Cyber Pinball, le processus principal lit les boutons de la borne tels qu'ils sont réglés
  // (clavier par Windows, joystick par SDL) et le lanceur analogique s'il y en a un : la page ne lit
  // alors ni ses touches (les événements de la page perdent un relâchement quand les deux Maj sont
  // tenues) ni la manette (ses boutons ne disent rien de leur rôle sur la borne). Ailleurs, repli.
  let natifs = null;
  if (borne) borne.on((s) => { natifs = s; });
  else if (window.flips && window.flips.on) window.flips.on((s) => { natifs = s; });

  function readInput(dt) {
    if (autoplay) return robotInput(dt);
    if (borne) {
      const s = natifs || {};
      const input = { left: !!s.left, right: !!s.right, plunger: !!s.plunger, aimant: !!s.aimant };
      if (typeof s.tirette === 'number') input.tirette = s.tirette;
      return input;
    }
    const pad = readPad();
    const kb = natifs || {
      left: LEFT.some((k) => keys.has(k)),
      right: RIGHT.some((k) => keys.has(k)),
    };
    return {
      left: pad.left || kb.left, right: pad.right || kb.right,
      plunger: pad.plunger || PLUNGER.some((k) => keys.has(k)),
      aimant: pad.aimant || !!(natifs && natifs.aimant) || AIMANT.some((k) => keys.has(k)),
    };
  }

  // ---------- Où en est le jeu : le DMD et le fronton de la borne le montrent ----------

  // Dans Cyber Pinball (root-access.ts), l'écran, l'étage et le score partent au processus principal, qui
  // les pose sur le DMD et le fronton à la place des médias de la table. Rien ne part s'ils n'ont pas changé.
  let publie = '';
  function publier() {
    if (!borne || typeof borne.statut !== 'function') return;
    const ecran = screen === 'titre' ? 'titre' : g.status === 'dead' ? 'dead' : g.status === 'won' ? 'won' : 'jeu';
    const etage = Math.min(LEVELS.length - 1, Math.max(0, g.floor));
    const statut = { screen: ecran, floor: etage + 1, floors: LEVELS.length, name: ecran === 'titre' ? '' : LEVELS[etage].nom, score: ecran === 'titre' ? 0 : g.score };
    const cle = JSON.stringify(statut);
    if (cle === publie) return;
    publie = cle;
    borne.statut(statut);
  }

  // ---------- Boucle ----------

  let last = performance.now();
  let acc = 0;
  let frames = 0;
  let stepMs = 0;
  let renderMs = 0;
  let observeMs = 0;

  function frame(now) {
    let d = (now - last) / 1000;
    last = now;
    if (d > 0.1) d = 0.1;
    const input = readInput(d);
    const edge = (input.left && !prevInput.left) || (input.right && !prevInput.right) || (input.plunger && !prevInput.plunger);
    if (!frozen) {
      // Victoire : on laisse 2 s au réveil de la ville avant d'accepter de rejouer.
      const fini = (g.status === 'dead' && g.statusT > 1) || (g.status === 'won' && g.statusT > 2);
      if (screen === 'titre' && edge) start(input.plunger && !prevInput.plunger);
      else if (screen === 'jeu' && fini && edge) start();
      else if (screen === 'jeu' && !paused) {
        const t0 = performance.now();
        acc += d;
        while (acc >= E.DT) {
          E.step(g, input);
          const o0 = performance.now();
          FX.observe(g, true);
          observeMs += performance.now() - o0;
          acc -= E.DT;
        }
        stepMs += performance.now() - t0;
      }
      if (g.status === 'play' || g.status === 'transit') {
        const p = g.status === 'transit' ? E.transitBall(g) : { x: g.ball.x, y: g.ball.y - g.floor * H };
        trail.push(p);
        if (trail.length > 10) trail.shift();
      } else if (g.status === 'cradle') trail = [];
    }
    prevInput = input;
    publier();
    const r0 = performance.now();
    render(now / 1000);
    renderMs += performance.now() - r0;
    frames++;
    requestAnimationFrame(frame);
  }

  window.addEventListener('resize', resize);
  resize();
  requestAnimationFrame(frame);
  lancerMusique();

  // ---------- Accroches d'essai (captures hors écran, mesure de charge) ----------

  window.__proto = {
    scene(name) {
      frozen = true; paused = false; autoplay = false; trail = [];
      g = E.createGame(LEVELS);
      screen = 'jeu';
      const at = (x, y, vx, vy) => { E.release(g); g.statusT = 1; Object.assign(g.ball, { x, y, vx: vx || 0, vy: vy || 0 }); };
      switch (name) {
        case 'titre': screen = 'titre'; break;
        case 'berceau': g.statusT = 0.6; g.msg.t = 0; g.charging = true; g.charge = 0.62; break;
        case 'etage1':
          at(330, 560, 300, -900);
          g.f.targets[0].down = true;
          g.score = 1240; g.t = Math.round(14.2 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          trail = [{ x: 300, y: 640 }, { x: 310, y: 610 }, { x: 320, y: 585 }];
          break;
        case 'etage2':
          E.enterFloor(g, 1); at(300, 300, 0, -1200);
          Object.assign(g.f.bridges[0], { down: true, timer: 7, total: 12 });
          g.score = 3480; g.t = Math.round(41 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          for (const a of g.f.aspirations || []) a.actif = true;
          break;
        case 'etage2-vide':
          E.enterFloor(g, 1); at(300, 200, 0, 0);
          g.status = 'falling'; g.statusT = 0.3;
          g.score = 3480; g.t = Math.round(52 / E.DT);
          g.msg = { text: 'TOMBÉE DANS LE VIDE : RETOUR AU LANCEUR', color: 'meta', t: 2 };
          break;
        case 'etage3': {
          E.enterFloor(g, 2); at(85, 330, 0, -1300);
          const s = g.f.seesaws[0]; s.state = 1; s.a = s.a1; s.timer = 5;
          Object.assign(g.f.gates[0], { open: true, timer: 2.4, total: 8 });
          g.score = 6120; g.t = Math.round(83 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          for (const a of g.f.aspirations || []) a.actif = true;
          break;
        }
        case 'montee':
          for (const tg of g.f.targets) tg.down = true;
          g.f.gates[0].open = true;
          g.status = 'transit';
          g.transit = { from: 0, ex: 300, ey: 30, cx: LEVELS[1].cradle.x, cy: LEVELS[1].cradle.y };
          g.statusT = E.TRANSIT * 0.5; g.camera = 0.5;
          g.score = 2900; g.t = Math.round(27 / E.DT);
          g.msg = { text: 'PORTE OUVERTE : MONTE !', color: 'signal', t: 2 };
          break;
        case 'perdu':
          E.enterFloor(g, 1); g.status = 'dead'; g.statusT = 2; g.score = 3810; g.t = Math.round(64 / E.DT); g.msg.t = 0;
          break;
        case 'sommet':
          E.enterFloor(g, LEVELS.length - 1); g.status = 'won'; g.statusT = 2.5; g.score = 21470; g.t = Math.round(312 / E.DT); g.msg.t = 0;
          break;
        case 'victoire-fondu':
          E.enterFloor(g, LEVELS.length - 1); g.status = 'won'; g.statusT = 0.45; g.score = 21470; g.t = Math.round(312 / E.DT); g.msg.t = 0;
          g.ball.x = 85; g.ball.y = 20;
          break;
        case 'etage1-chaine':
          at(310, 420, 120, -500);
          g.f.targets[0].down = true; g.f.targets[1].down = true;
          g.score = 1540; g.t = Math.round(11 / E.DT); g.saveT = 0;
          g.msg = { text: 'CHAÎNE : +300', color: 'signal', t: 1.4 };
          trail = [{ x: 280, y: 470 }, { x: 290, y: 455 }, { x: 300, y: 438 }];
          break;
        case 'etage2-tenu':
          E.enterFloor(g, 1); at(540, 470, -500, -300);
          Object.assign(g.f.bridges[0], { down: true, timer: 4, total: 12 });
          g.f.targets[0].flash = 0.2;
          g.score = 3720; g.t = Math.round(47 / E.DT); g.saveT = 0;
          g.msg = { text: 'PONT TENU : 4 S AU MOINS', color: 'signal', t: 1.5 };
          break;
        case 'etage3-catapulte': {
          E.enterFloor(g, 2); at(452, 214, 155, -580);
          const s = g.f.seesaws[0]; s.state = 1; s.a = s.a1 * 0.7; s.timer = 7.8; s.flash = 0.2;
          Object.assign(g.f.gates[0], { open: true, timer: 7.8, total: 8 });
          g.score = 5980; g.t = Math.round(79 / E.DT); g.saveT = 0;
          g.msg = { text: 'PORTE LEVÉE : VISE LE COULOIR GAUCHE !', color: 'signal', t: 1.5 };
          trail = [{ x: 440, y: 262 }, { x: 444, y: 246 }, { x: 448, y: 230 }];
          break;
        }
        case 'tronc4': {
          E.enterFloor(g, 3); at(340, 420, -200, -700);
          g.f.targets[0].down = true;
          g.score = 11840; g.t = Math.round(168 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          break;
        }
        case 'tronc4-aimant': {
          E.enterFloor(g, 3); at(0, 0);
          g.aimant = 0;
          const [x, y] = E.pointAimant(g.f, false);
          g.prise = { x0: x, y0: y, x, y, gauche: false, t: 0.55 };
          g.ball.x = x; g.ball.y = y;
          g.score = 12260; g.t = Math.round(181 / E.DT); g.saveT = 0;
          g.msg = { text: 'AIMANT : BILLE RETENUE', color: 'meta', t: 1 };
          break;
        }
        case 'tronc4-berceau':
          E.enterFloor(g, 3); g.statusT = 0.6; g.msg.t = 0; g.charging = true; g.charge = 0.4;
          g.score = 11200; g.t = Math.round(160 / E.DT);
          break;
        case 'tronc5':
          E.enterFloor(g, 4); at(300, 300, 0, -1100);
          g.f.targets[0].down = true; g.f.targets[1].down = true; g.f.targets[2].down = true;
          g.f.gates[0].open = true;
          Object.assign(g.f.bridges[0], { down: true, timer: 6, total: 12 });
          g.aimant = 0;
          g.score = 15930; g.t = Math.round(236 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          for (const a of g.f.aspirations || []) a.actif = true;
          break;
        case 'tronc5-attente':
          E.enterFloor(g, 4); at(420, 640, -200, -700);
          g.f.targets[0].down = true;
          Object.assign(g.f.bridges[0], { down: true, timer: 9, total: 12 });
          g.aimant = 1;
          g.score = 15100; g.t = Math.round(228 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          break;
        case 'tronc6': {
          E.enterFloor(g, 5); at(85, 330, 0, -1300);
          const s = g.f.seesaws[0]; s.state = 1; s.a = s.a1; s.timer = 5;
          Object.assign(g.f.gates[0], { open: true, timer: 3.6, total: 8 });
          Object.assign(g.f.bridges[0], { down: true, timer: 5.2, total: 12 });
          g.aimant = 0;
          g.score = 19820; g.t = Math.round(291 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          for (const a of g.f.aspirations || []) a.actif = true;
          break;
        }
        case 'tronc6-vide':
          E.enterFloor(g, 5); at(470, 620, -150, -600);
          g.aimant = 0;
          g.score = 18700; g.t = Math.round(280 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          break;
        case 'etage1-serrure':
          at(420, 640, -200, -700);
          g.f.targets[0].down = true; g.f.targets[2].down = true;
          g.score = 1980; g.t = Math.round(22 / E.DT); g.saveT = 1.6;
          g.msg.t = 0;
          break;
        case 'etage3-repos':
          E.enterFloor(g, 2); at(470, 620, -150, -600);
          g.score = 5400; g.t = Math.round(74 / E.DT); g.saveT = 0;
          g.msg.t = 0;
          break;
        default: break;
      }
    },
    son(actif) { if (FX.son !== actif) FX.basculerSon(); return FX.son; },
    mesure(ms) {
      frozen = false; autoplay = true; start();
      frames = 0; stepMs = 0; renderMs = 0; observeMs = 0; FX.sonStats();
      return new Promise((resolve) => setTimeout(() => {
        resolve({ images: frames, imagesParSeconde: +(frames / (ms / 1000)).toFixed(1), simulationMsParSeconde: +(stepMs / (ms / 1000)).toFixed(2), effetsEtSonsMsParSeconde: +(observeMs / (ms / 1000)).toFixed(2), renduMsParImage: +(renderMs / Math.max(1, frames)).toFixed(3), canevasBasseLatence: !!(mainCtx.getContextAttributes && mainCtx.getContextAttributes().desynchronized), etage: g.floor + 1, sons: FX.sonStats() });
        autoplay = false;
      }, ms));
    },
  };
})();
