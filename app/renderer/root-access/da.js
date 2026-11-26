// Root Access : direction artistique du plateau.
// Une seule matière pour tout ce qui touche la bille : coque sombre, arête fonctionnelle colorée,
// encoche lumineuse. Mécanismes sculptés (serrure, pont, bascule à câble), racine latérale qui relie
// les étages, titre et victoire. Lit l'état du moteur sans jamais le modifier ; tout ce qui ne bouge pas
// est dessiné une fois (sprites, caches d'étage).
(function (racine) {
  'use strict';

  const TAU = Math.PI * 2;
  const SPR = 2;   // pixels par unité des sprites : la résolution interne du jeu est plafonnée à 2
  const clamp01 = (v) => (v < 0 ? 0 : v > 1 ? 1 : v);
  const ease = (u) => u * u * (3 - 2 * u);

  function create(E, C, FONT, MONO) {
    const W = E.W, H = E.H;
    const LUEUR = '#c8fff3';     // encoches des pièces teal
    const LUEUR_BLEUE = '#bfe9f7';

    function seg(c, s) { c.beginPath(); c.moveTo(s[0], s[1]); c.lineTo(s[2], s[3]); }

    // ---------- Sprites ----------

    const sprites = new Map();
    function sprite(key, w, h, ox, oy, draw) {
      let s = sprites.get(key);
      if (!s) {
        const cv = document.createElement('canvas');
        cv.width = Math.max(1, Math.ceil(w * SPR)); cv.height = Math.max(1, Math.ceil(h * SPR));
        const x = cv.getContext('2d');
        x.scale(SPR, SPR); x.translate(ox, oy);
        draw(x);
        s = { cv, w, h, ox, oy };
        sprites.set(key, s);
      }
      return s;
    }
    function put(c, s, x, y) { c.drawImage(s.cv, x - s.ox, y - s.oy, s.w, s.h); }

    // Étiquette sur une plaque sombre locale : jamais de voile sur tout l'écran.
    function label(c, text, x, y, color, size, weight, font) {
      c.font = (weight || 700) + ' ' + size + 'px ' + (font || MONO);
      c.textAlign = 'center'; c.textBaseline = 'middle';
      const w = c.measureText(text).width + 20;
      c.fillStyle = 'rgba(3, 8, 7, 0.9)';
      c.fillRect(x - w / 2, y - size / 2 - 6, w, size + 12);
      c.fillStyle = color;
      c.fillText(text, x, y + 1);
      c.textBaseline = 'alphabetic';
      return w;
    }

    // Changement d'état d'un objet (porte, bascule) : progression 0 → 1 depuis le dernier changement.
    // Le premier regard le trouve déjà dans son état (scènes figées, étages en aperçu).
    const changes = new WeakMap();
    function depuis(o, st, t, dur) {
      let e = changes.get(o);
      if (!e) { e = { st, t: t - dur }; changes.set(o, e); }
      if (e.st !== st) { e.st = st; e.t = t; }
      return clamp01((t - e.t) / dur);
    }

    // ---------- Décor fixe (cache d'étage) ----------

    // Murs : faisceaux gainés. Ombre portée sombre (pas un halo), deux arêtes teal, coque au centre,
    // une encoche lumineuse au milieu des longs segments. La ligne de collision reste au centre exact.
    function murs(c, walls) {
      if (!walls || !walls.length) return;
      const p = new Path2D();
      for (const s of walls) { p.moveTo(s[0], s[1]); p.lineTo(s[2], s[3]); }
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = 'rgba(0, 0, 0, 0.55)'; c.lineWidth = 12; c.stroke(p);
      c.strokeStyle = C.teal; c.lineWidth = 5; c.stroke(p);
      c.strokeStyle = C.raised; c.lineWidth = 2.2; c.stroke(p);
      c.strokeStyle = LUEUR; c.lineWidth = 2;
      c.beginPath();
      for (const s of walls) {
        const dx = s[2] - s[0], dy = s[3] - s[1], l = Math.hypot(dx, dy);
        if (l < 140) continue;
        const ux = dx / l, uy = dy / l, mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
        c.moveTo(mx - ux * 9, my - uy * 9); c.lineTo(mx + ux * 9, my + uy * 9);
      }
      c.stroke();
      c.restore();
    }

    function lancePierres(c, slings) {
      c.save();
      for (const s of slings || []) {
        const q = s.seg;
        c.beginPath(); c.moveTo(q[0], q[1]); c.lineTo(q[2], q[3]); c.lineTo(q[0], 780); c.closePath();
        c.fillStyle = C.raised; c.fill();
        c.strokeStyle = C.tealDeep; c.lineWidth = 1.5; c.stroke();
      }
      c.restore();
    }

    // Racine latérale : la même à chaque étage (période H/2), elle se raccorde d'un étage à l'autre
    // pendant la montée. Au bord droit, hors du plateau.
    const rx = (y) => 597 + 4 * Math.sin((y / H) * TAU * 2);
    function racineLaterale(c) {
      const p = new Path2D();
      p.moveTo(rx(-30), -30);
      for (let y = -10; y <= H + 30; y += 20) p.lineTo(rx(y), y);
      c.save();
      c.lineCap = 'round'; c.lineJoin = 'round';
      c.strokeStyle = C.tealDeep; c.lineWidth = 22; c.stroke(p);
      c.strokeStyle = '#06100d'; c.lineWidth = 17; c.stroke(p);
      c.strokeStyle = 'rgba(54, 201, 180, 0.3)'; c.lineWidth = 1.5; c.stroke(p);
      for (let y = 125; y < H; y += 250) {
        c.fillStyle = C.tealDark; c.beginPath(); c.arc(rx(y) - 2, y, 4, 0, TAU); c.fill();
        c.fillStyle = LUEUR; c.beginPath(); c.arc(rx(y) - 2, y, 1.6, 0, TAU); c.fill();
      }
      c.restore();
    }

    // Serrure : deux logements de mâchoires accrochés aux murs en pente, une barre au sommet du
    // couloir de sortie. Les logements des cibles et les mâchoires sont dessinés à part (ils bougent).
    function serrureFixe(c, level) {
      for (const gt of level.gates || []) {
        if (!gt.serrure) continue;
        const [x1, gy, x2] = [gt.seg[0], gt.seg[1], gt.seg[2]];
        c.save();
        c.lineJoin = 'round';
        for (const d of [-1, 1]) {
          const ex = d < 0 ? x1 : x2;
          c.beginPath();
          c.moveTo(ex, gy - 2); c.lineTo(ex, gy - 46); c.lineTo(ex + d * 45, gy - 46);
          c.lineTo(ex + d * 80, gy + 17); c.lineTo(ex + d * 72, gy + 34);
          c.closePath();
          c.fillStyle = C.raised; c.fill();
          c.strokeStyle = C.tealDeep; c.lineWidth = 1.5; c.stroke();
        }
        c.fillStyle = C.raised; c.fillRect(x1 + 10, 0, x2 - x1 - 20, 5);
        c.strokeStyle = C.tealDeep; c.lineWidth = 1; c.strokeRect(x1 + 10, 0, x2 - x1 - 20, 5);
        c.restore();
      }
    }

    // ---------- Pièces mobiles ----------

    function flip(c, fl) {
      const pad = 4;
      const s = sprite('flip' + fl.len + '/' + fl.r1 + '/' + fl.r2, fl.len + fl.r1 + fl.r2 + pad * 2, fl.r1 * 2 + pad * 2, fl.r1 + pad, fl.r1 + pad, (x) => {
        x.beginPath();
        x.moveTo(0, fl.r1); x.lineTo(fl.len, fl.r2);
        x.arc(fl.len, 0, fl.r2, Math.PI / 2, -Math.PI / 2, true);
        x.lineTo(0, -fl.r1);
        x.arc(0, 0, fl.r1, -Math.PI / 2, Math.PI / 2, true);
        x.closePath();
        x.fillStyle = C.raised; x.fill();
        x.strokeStyle = C.signal; x.lineWidth = 2.4; x.stroke();
        x.lineCap = 'round';
        x.strokeStyle = C.signal; x.lineWidth = 3.5;
        x.beginPath(); x.moveTo(15, 0); x.lineTo(fl.len - 9, 0); x.stroke();
        x.strokeStyle = '#eaffd6'; x.lineWidth = 1.1;
        x.beginPath(); x.moveTo(17, 0); x.lineTo(fl.len - 11, 0); x.stroke();
        x.fillStyle = C.void; x.beginPath(); x.arc(0, 0, 4.5, 0, TAU); x.fill();
        x.strokeStyle = C.muted; x.lineWidth = 1.5; x.stroke();
      });
      c.save(); c.translate(fl.x, fl.y); c.rotate(fl.a);
      c.drawImage(s.cv, -s.ox, -s.oy, s.w, s.h);
      c.restore();
    }

    function bumper(c, b) {
      const on = b.flash > 0, r = b.r, m = 4;
      const s = sprite('bumper' + r + (on ? '!' : ''), 2 * (r + m), 2 * (r + m), r + m, r + m, (x) => {
        x.beginPath(); x.arc(0, 0, r, 0, TAU); x.fillStyle = on ? '#123844' : C.raised; x.fill();
        x.strokeStyle = on ? '#dff6ff' : C.meta; x.lineWidth = 3;
        x.beginPath(); x.arc(0, 0, r - 1.5, 0, TAU); x.stroke();
        x.strokeStyle = on ? C.meta : C.tealDeep; x.lineWidth = 2;
        x.beginPath(); x.arc(0, 0, r * 0.5, 0, TAU); x.stroke();
        x.fillStyle = on ? '#ffffff' : C.meta;
        x.beginPath(); x.arc(0, 0, r * 0.18, 0, TAU); x.fill();
        x.strokeStyle = 'rgba(223, 246, 255, 0.55)'; x.lineWidth = 1.2;
        x.beginPath(); x.arc(0, 0, r - 5, 3.7, 4.9); x.stroke();
      });
      put(c, s, b.x, b.y);
    }

    function faceLancePierre(c, s) {
      c.lineCap = 'round';
      c.strokeStyle = s.flash > 0 ? '#ffffff' : C.teal; c.lineWidth = 4; seg(c, s.seg); c.stroke();
      const q = s.seg, mx = (q[0] + q[2]) / 2, my = (q[1] + q[3]) / 2;
      const l = Math.hypot(q[2] - q[0], q[3] - q[1]), ux = (q[2] - q[0]) / l, uy = (q[3] - q[1]) / l;
      c.strokeStyle = LUEUR; c.lineWidth = 1.5;
      c.beginPath(); c.moveTo(mx - ux * 12, my - uy * 12); c.lineTo(mx + ux * 12, my + uy * 12); c.stroke();
    }

    function bande(c, s, color, wide) {
      c.lineCap = 'round';
      c.strokeStyle = 'rgba(0, 0, 0, 0.5)'; c.lineWidth = wide + 6; seg(c, s); c.stroke();
      c.strokeStyle = color; c.lineWidth = wide; c.stroke();
      c.strokeStyle = C.raised; c.lineWidth = wide * 0.42; c.stroke();
    }

    function cible(c, tg) {
      const s = tg.seg;
      if (tg.down) {
        c.setLineDash([3, 6]); c.strokeStyle = C.faint; c.lineWidth = 2;
        seg(c, s); c.stroke(); c.setLineDash([]);
        return;
      }
      const color = tg.flash > 0 ? '#ffffff' : tg.kind === 'drop' ? C.signal : C.meta;
      bande(c, s, color, 8);
      const l = Math.hypot(s[2] - s[0], s[3] - s[1]), ux = (s[2] - s[0]) / l, uy = (s[3] - s[1]) / l;
      const mx = (s[0] + s[2]) / 2, my = (s[1] + s[3]) / 2;
      c.strokeStyle = '#ffffff'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(mx - ux * 6, my - uy * 6); c.lineTo(mx + ux * 6, my + uy * 6); c.stroke();
    }

    function porte(c, gt) {
      const s = gt.seg;
      if (gt.open) {
        c.setLineDash([4, 8]); c.strokeStyle = C.signal; c.globalAlpha = 0.5; c.lineWidth = 2;
        seg(c, s); c.stroke();
        c.setLineDash([]); c.globalAlpha = 1;
        return;
      }
      bande(c, s, C.meta, 8);
      const l = Math.hypot(s[2] - s[0], s[3] - s[1]), ux = (s[2] - s[0]) / l, uy = (s[3] - s[1]) / l;
      const n = Math.max(2, Math.round(l / 26));
      c.strokeStyle = LUEUR_BLEUE; c.lineWidth = 2;
      c.beginPath();
      for (let i = 1; i < n; i++) {
        const x = s[0] + ux * (l * i) / n, y = s[1] + uy * (l * i) / n;
        c.moveTo(x - uy * 2.5, y + ux * 2.5); c.lineTo(x + uy * 2.5, y - ux * 2.5);
      }
      c.stroke();
    }

    // Serrure vivante : chaque cible tombée alimente son logement ; la dernière écarte les mâchoires.
    function machoire(d) {
      return sprite('machoire' + d, 58, 46, d < 0 ? 52 : 6, 42, (x) => {
        const zig = [];
        for (let i = 0; i <= 6; i++) zig.push([i % 2 ? 4 : -4, -38 + (i * 38) / 6]);
        x.beginPath();
        x.moveTo(d * 48, -38);
        for (const p of zig) x.lineTo(p[0], p[1]);
        x.lineTo(d * 48, 0);
        x.closePath();
        x.fillStyle = C.raised; x.fill();
        x.strokeStyle = C.meta; x.lineWidth = 1.6; x.lineJoin = 'round'; x.stroke();
        x.strokeStyle = C.meta; x.lineWidth = 3;
        x.beginPath(); x.moveTo(d * 46, -1.5); x.lineTo(d * 3, -1.5); x.stroke();
        x.strokeStyle = LUEUR_BLEUE; x.lineWidth = 2;
        x.beginPath(); x.moveTo(d * 26, -27); x.lineTo(d * 26, -13); x.stroke();
      });
    }
    function serrure(c, f, gt, t) {
      const [x1, gy, x2] = [gt.seg[0], gt.seg[1], gt.seg[2]];
      const cx = (x1 + x2) / 2, half = (x2 - x1) / 2;
      const sv = gt.serrure;
      // Logements et conduits vers les mâchoires.
      c.lineCap = 'round'; c.lineJoin = 'round';
      sv.cibles.forEach((id, i) => {
        const tg = f.targets.find((o) => o.id === id);
        const lit = !!(tg && tg.down);
        const [lx, ly] = sv.logements[i];
        c.strokeStyle = lit ? C.signal : C.tealDeep; c.lineWidth = 2.5;
        c.beginPath(); c.moveTo(lx, ly);
        if (lx < x1) { c.lineTo(x1 - 22, gy - 27); c.lineTo(x1 - 2, gy - 27); }
        else if (lx > x2) { c.lineTo(x2 + 22, gy - 27); c.lineTo(x2 + 2, gy - 27); }
        else c.lineTo(lx, gy - 38);
        c.stroke();
        c.fillStyle = C.void; c.beginPath(); c.arc(lx, ly, 7, 0, TAU); c.fill();
        c.strokeStyle = lit ? C.signal : C.tealDark; c.lineWidth = 2; c.stroke();
        if (lit) {
          c.fillStyle = C.signal; c.beginPath(); c.arc(lx, ly, 4, 0, TAU); c.fill();
          c.globalAlpha = 0.3; c.beginPath(); c.arc(lx, ly, 11, 0, TAU); c.fill(); c.globalAlpha = 1;
        }
      });
      const u = depuis(gt, !!gt.open, t, 0.3);
      const open = ease(gt.open ? u : 1 - u);
      const dx = half * open;
      put(c, machoire(-1), cx - dx, gy - 1);
      put(c, machoire(1), cx + dx, gy - 1);
      if (gt.open) {
        c.setLineDash([4, 8]); c.strokeStyle = C.signal; c.globalAlpha = 0.5; c.lineWidth = 2;
        seg(c, gt.seg); c.stroke();
        c.setLineDash([]); c.globalAlpha = 1;
      }
    }

    // Pont : deux états fixes pré-rendus (tablier praticable ou fosse « RETOUR »), culées aux deux rives.
    function dessinPont(p, w, h, down) {
      const cul = 8;
      if (down) {
        p.fillStyle = '#0a1d22'; p.fillRect(0, 0, w, h);
        p.fillStyle = C.tealDeep;
        const side = w / 2 - 34 - cul - 6;
        for (let y = 10; y < h - 4; y += 12) { p.fillRect(cul + 6, y, side, 2); p.fillRect(w / 2 + 34, y, side, 2); }
        p.fillStyle = C.meta; p.fillRect(cul, 0, w - 2 * cul, 2.5); p.fillRect(cul, h - 2.5, w - 2 * cul, 2.5);
        p.strokeStyle = C.signal; p.lineWidth = 4; p.lineCap = 'round'; p.lineJoin = 'round';
        p.beginPath(); p.moveTo(w / 2 - 16, h / 2 + 9); p.lineTo(w / 2, h / 2 - 7); p.lineTo(w / 2 + 16, h / 2 + 9); p.stroke();
      } else {
        const grd = p.createLinearGradient(0, 0, 0, h);
        grd.addColorStop(0, '#04100f'); grd.addColorStop(0.5, '#000000'); grd.addColorStop(1, '#04100f');
        p.fillStyle = grd; p.fillRect(0, 0, w, h);
        p.fillStyle = C.tealDeep;
        for (const [x0, d] of [[cul, 1], [w - cul, -1]]) {
          p.beginPath(); p.moveTo(x0, 3); p.lineTo(x0 + d * 14, 11); p.lineTo(x0 + d * 14, h - 11); p.lineTo(x0, h - 3); p.closePath(); p.fill();
        }
        p.font = '700 18px ' + MONO; p.textAlign = 'center'; p.textBaseline = 'middle'; p.fillStyle = C.meta;
        p.fillText('RETOUR', w / 2 + 12, h / 2 + 1);
        // Pictogramme de retour : flèche en crochet vers le bas (la bille revient au lanceur).
        const ax = w / 2 - 50, ay = h / 2 - 2;
        p.strokeStyle = C.meta; p.lineWidth = 2.5; p.lineCap = 'round'; p.lineJoin = 'round';
        p.beginPath(); p.moveTo(ax + 8, ay - 9); p.lineTo(ax - 4, ay - 9); p.arc(ax - 4, ay, 9, -Math.PI / 2, Math.PI / 2, true); p.lineTo(ax + 6, ay + 9); p.stroke();
        p.beginPath(); p.moveTo(ax + 1, ay + 4); p.lineTo(ax + 7, ay + 9); p.lineTo(ax + 1, ay + 14); p.stroke();
      }
      for (const x0 of [0, w - cul]) {
        p.fillStyle = '#0e2a33'; p.fillRect(x0, 0, cul, h);
        p.fillStyle = C.meta; p.fillRect(x0 === 0 ? cul - 2.5 : x0, 0, 2.5, h);
        p.fillStyle = LUEUR_BLEUE; p.fillRect(x0 + cul / 2 - 1, h / 2 - 7, 2, 14);
      }
    }
    function pont(c, br) {
      const r = br.rect, w = r.x2 - r.x1, h = r.y2 - r.y1;
      const s = sprite('pont' + [w, h, br.down ? 1 : 0].join('/'), w, h, 0, 0, (p) => dessinPont(p, w, h, br.down));
      put(c, s, r.x1, r.y1);
    }

    // Bascule sous tension : surface nervurée sur la moitié à toucher, câble tiré par l'autre bout,
    // deux poulies et un contrepoids qui descend quand la porte se lève.
    function bascule(c, f, s, t) {
      const plus = s.a0 < 0 ? 1 : -1;            // côté levé au repos : celui qu'il faut toucher
      const on = s.flash > 0;
      const L = s.half;
      const sp = sprite('poutre' + L + '/' + plus + (on ? '!' : ''), 2 * L + 20, 22, L + 10, 11, (x) => {
        x.beginPath();
        x.moveTo(-L, -7); x.lineTo(L, -7); x.arc(L, 0, 7, -Math.PI / 2, Math.PI / 2); x.lineTo(-L, 7); x.arc(-L, 0, 7, Math.PI / 2, Math.PI * 1.5);
        x.closePath();
        x.fillStyle = C.raised; x.fill();
        x.strokeStyle = on ? '#ffffff' : C.meta; x.lineWidth = 2.2; x.stroke();
        x.strokeStyle = C.tealDark; x.lineWidth = 2;
        x.beginPath();
        for (let d = 16; d < L - 4; d += 9) { x.moveTo(plus * d, -4); x.lineTo(plus * d, 4); }
        x.stroke();
        x.strokeStyle = C.signal; x.lineWidth = 2.4; x.lineCap = 'round';
        x.beginPath(); x.moveTo(plus * 14, -7); x.lineTo(plus * L, -7); x.stroke();
        x.fillStyle = C.void; x.beginPath(); x.arc(-plus * (L - 4), 0, 3.5, 0, TAU); x.fill();
        x.strokeStyle = C.muted; x.lineWidth = 1.5; x.stroke();
      });

      const u = clamp01((s.a - s.a0) / (s.a1 - s.a0));
      if (s.cable) {
        const ex = s.x - plus * Math.cos(s.a) * (L - 4), ey = s.y - plus * Math.sin(s.a) * (L - 4);
        const [p1, p2] = s.cable.poulies;
        const cw = [s.cable.contrepoids[0], s.cable.contrepoids[1] + 30 * u];
        const tendu = s.state === 1;
        const pts = [[ex, ey], p1, p2, [cw[0], cw[1] - 8]];
        c.lineCap = 'round'; c.lineJoin = 'round';
        if (!tendu) { c.setLineDash([6, 6]); c.strokeStyle = C.tealDark; c.lineWidth = 1.5; }
        else { c.strokeStyle = C.signal; c.lineWidth = 2; }
        c.beginPath(); c.moveTo(pts[0][0], pts[0][1]); for (const p of pts.slice(1)) c.lineTo(p[0], p[1]); c.stroke();
        c.setLineDash([]);
        // Tension qui parcourt le câble jusqu'à la porte, juste après la bascule.
        const k = depuis(s, tendu, t, 0.4);
        if (tendu && k < 1) {
          let tot = 0; const lens = [];
          for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); tot += l; }
          let d = k * tot, i = 1;
          while (i < pts.length - 1 && d > lens[i - 1]) { d -= lens[i - 1]; i++; }
          const q = Math.min(1, d / (lens[i - 1] || 1));
          const px = pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * q, py = pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * q;
          c.fillStyle = '#ffffff'; c.fillRect(px - 4, py - 4, 8, 8);
          c.globalAlpha = 0.3; c.fillStyle = C.signal; c.fillRect(px - 9, py - 9, 18, 18); c.globalAlpha = 1;
        }
        for (const p of [p1, p2]) {
          c.fillStyle = C.raised; c.beginPath(); c.arc(p[0], p[1], 7, 0, TAU); c.fill();
          c.strokeStyle = tendu ? C.signal : C.meta; c.lineWidth = 1.8; c.stroke();
          const a = u * Math.PI * 1.5;
          c.strokeStyle = C.tealDark; c.lineWidth = 1.5; c.beginPath();
          for (let j = 0; j < 2; j++) { const b = a + (j * Math.PI) / 2; c.moveTo(p[0] - Math.cos(b) * 5, p[1] - Math.sin(b) * 5); c.lineTo(p[0] + Math.cos(b) * 5, p[1] + Math.sin(b) * 5); }
          c.stroke();
        }
        // Contrepoids, et levier vers la porte.
        c.fillStyle = C.raised; c.fillRect(cw[0] - 8, cw[1] - 8, 16, 20);
        c.strokeStyle = tendu ? C.signal : C.meta; c.lineWidth = 1.6; c.strokeRect(cw[0] - 8, cw[1] - 8, 16, 20);
        c.fillStyle = tendu ? C.signal : LUEUR_BLEUE; c.fillRect(cw[0] - 1, cw[1] - 3, 2, 10);
        const gate = f.gates.find((o) => o.id === s.link);
        if (gate) {
          const gx = Math.max(gate.seg[0], gate.seg[2]), gy = gate.seg[1];
          c.strokeStyle = tendu ? C.signal : C.tealDark; c.lineWidth = 2;
          c.beginPath(); c.moveTo(cw[0] - 8, cw[1] + 8); c.lineTo(gx + 6, gy - 22 * u); c.stroke();
        }
      }

      c.save(); c.translate(s.x, s.y); c.rotate(s.a); c.drawImage(sp.cv, -sp.ox, -sp.oy, sp.w, sp.h); c.restore();
      c.fillStyle = C.surface; c.beginPath(); c.arc(s.x, s.y, 9, 0, TAU); c.fill();
      c.strokeStyle = C.meta; c.lineWidth = 2; c.stroke();
      c.fillStyle = C.meta; c.beginPath(); c.arc(s.x, s.y, 2.5, 0, TAU); c.fill();
      // Bout levé : la cible (chevrons qui descendent dessus).
      if (s.state === 0) {
        const px = s.x + plus * Math.cos(s.a) * L * 0.75, py = s.y + plus * Math.sin(s.a) * L * 0.75;
        const k = (t * 1.6) % 1;
        c.strokeStyle = C.signal; c.lineWidth = 2.5;
        for (let i = 0; i < 2; i++) {
          const y = py - 44 + i * 12 + k * 6;
          c.globalAlpha = 1 - 0.35 * i;
          c.beginPath(); c.moveTo(px - 10, y); c.lineTo(px, y + 10); c.lineTo(px + 10, y); c.stroke();
        }
        // Bout bas, si on peut le frapper par en dessous : chevrons qui montent vers lui.
        if (s.parDessous) {
          const bx = s.x - plus * Math.cos(s.a) * L * 0.75, by = s.y - plus * Math.sin(s.a) * L * 0.75;
          for (let i = 0; i < 2; i++) {
            const y = by + 44 - i * 12 - k * 6;
            c.globalAlpha = 1 - 0.35 * i;
            c.beginPath(); c.moveTo(bx - 10, y); c.lineTo(bx, y - 10); c.lineTo(bx + 10, y); c.stroke();
          }
        }
        c.globalAlpha = 1;
      }
    }

    // Sauve-bille : voyant stable près des flips, avec sa durée ; l'état inactif reste lisible.
    function sauve(c, g, dureeBerceau) {
      if (g.status !== 'play' && g.status !== 'cradle') return;
      const s = g.status === 'cradle' ? dureeBerceau : g.saveT;
      const on = s > 0;
      const color = on ? C.signal : C.muted;
      // Au berceau, la durée exacte réglée pour l'étage (1,5 s au Tronc) ; en jeu, le compte à rebours.
      const txt = g.status === 'cradle' && s % 1 ? s.toFixed(1).replace('.', ',') : String(Math.ceil(s));
      label(c, on ? 'SAUVE · ' + txt + ' s' : 'SANS SAUVE', W / 2, 975, color, 17);
      c.fillStyle = color;
      c.fillRect(186, 958, 5, 16); c.fillRect(409, 958, 5, 16);
    }

    // Aimant (Tronc) : tant qu'il reste une charge, deux plots discrets au tiers des grands flips (là où
    // l'aimant posera la bille) ; pendant la prise, anneaux qui battent autour de la bille et arc qui se
    // vide en 1 s.
    function aimant(c, g, t) {
      if (g.status !== 'play' && g.status !== 'cradle') return;
      c.save();
      c.lineCap = 'round';
      if (g.aimant > 0 && !g.prise) {
        for (const gauche of [true, false]) {
          const [x, y] = E.pointAimant(g.f, gauche);
          c.globalAlpha = 0.28 + 0.12 * Math.sin(t * 3);
          c.strokeStyle = C.meta; c.lineWidth = 2;
          c.beginPath(); c.arc(x, y, E.BALL_R + 3, 0, TAU); c.stroke();
          c.globalAlpha = 0.5;
          c.fillStyle = C.meta;
          c.beginPath(); c.arc(x, y, 2.5, 0, TAU); c.fill();
        }
      }
      if (g.prise) {
        const b = g.ball, p = g.prise;
        const reste = clamp01(1 - p.t / E.AIMANT_DUREE);
        for (let i = 0; i < 2; i++) {
          const u = (t * 2.2 + i * 0.5) % 1;
          c.globalAlpha = 0.5 * (1 - u);
          c.strokeStyle = LUEUR_BLEUE; c.lineWidth = 2;
          c.beginPath(); c.arc(b.x, b.y, E.BALL_R + 4 + u * 16, 0, TAU); c.stroke();
        }
        c.globalAlpha = 1;
        c.strokeStyle = C.meta; c.lineWidth = 3.5;
        c.beginPath(); c.arc(b.x, b.y, E.BALL_R + 7, -Math.PI / 2, -Math.PI / 2 + TAU * reste); c.stroke();
      }
      c.restore();
    }

    // Montée : une impulsion de sève remonte la racine latérale.
    function montee(c, g) {
      if (g.status !== 'transit') return;
      const u = Math.min(1, g.statusT / E.TRANSIT);
      const y0 = H + 80 - u * (H + 260);
      c.save();
      c.lineCap = 'round';
      c.beginPath();
      for (let y = y0; y <= y0 + 140; y += 14) {
        const x = rx(y - g.camera * H) - 2;
        if (y === y0) c.moveTo(x, y); else c.lineTo(x, y);
      }
      c.strokeStyle = C.signal; c.globalAlpha = 0.25; c.lineWidth = 12; c.stroke();
      c.globalAlpha = 1; c.lineWidth = 3; c.stroke();
      c.restore();
    }

    // ---------- Titre ----------

    const RACINE_TITRE = (VH) => [[250, VH + 40], [390, VH * 0.72], [150, VH * 0.45], [330, VH * 0.18], [400, VH * 0.08], [300, 0], [360, -40]];
    function bez(p, s) {
      const a = 1 - s;
      return [a * a * a * p[0][0] + 3 * a * a * s * p[1][0] + 3 * a * s * s * p[2][0] + s * s * s * p[3][0],
        a * a * a * p[0][1] + 3 * a * a * s * p[1][1] + 3 * a * s * s * p[2][1] + s * s * s * p[3][1]];
    }
    function titre(c, t, VW, VH, appareil, drawBall) {
      const P = RACINE_TITRE(VH);
      const path = new Path2D();
      path.moveTo(P[0][0], P[0][1]);
      path.bezierCurveTo(P[1][0], P[1][1], P[2][0], P[2][1], P[3][0], P[3][1]);
      path.bezierCurveTo(P[4][0], P[4][1], P[5][0], P[5][1], P[6][0], P[6][1]);
      const branche = new Path2D();
      branche.moveTo(225, VH * 0.6); branche.bezierCurveTo(140, VH * 0.56, 90, VH * 0.62, -20, VH * 0.5);
      branche.moveTo(330, VH * 0.24); branche.bezierCurveTo(430, VH * 0.27, 520, VH * 0.2, VW + 20, VH * 0.26);

      // Ombres locales derrière le logo et la consigne ; la ville reste visible au centre.
      let grd = c.createLinearGradient(0, 0, 0, 380);
      grd.addColorStop(0, 'rgba(3, 8, 7, 0.95)'); grd.addColorStop(1, 'rgba(3, 8, 7, 0)');
      c.fillStyle = grd; c.fillRect(0, 0, VW, 380);

      c.save();
      c.lineCap = 'round';
      for (const [p, w] of [[branche, 18], [path, 54]]) {
        c.strokeStyle = 'rgba(0, 0, 0, 0.5)'; c.lineWidth = w + 12; c.stroke(p);
        c.strokeStyle = C.tealDeep; c.lineWidth = w; c.stroke(p);
        c.strokeStyle = '#07120f'; c.lineWidth = w - 6; c.stroke(p);
        c.strokeStyle = 'rgba(54, 201, 180, 0.3)'; c.lineWidth = 1.5; c.stroke(p);
      }
      // Sève qui monte depuis la sonde.
      c.setLineDash([26, 190]);
      c.lineDashOffset = -((t * 170) % 216);
      c.strokeStyle = C.signal; c.globalAlpha = 0.22; c.lineWidth = 14; c.stroke(path);
      c.globalAlpha = 1; c.lineWidth = 3.5; c.stroke(path);
      c.setLineDash([]); c.lineDashOffset = 0;
      c.restore();

      // La sonde au pied de la racine.
      const [bx, by] = bez(P, 0.25);
      const k = (t * 1.2) % 1;
      c.strokeStyle = C.signal; c.lineWidth = 2; c.globalAlpha = 1 - k;
      c.beginPath(); c.arc(bx, by, 16 + k * 30, 0, TAU); c.stroke();
      c.globalAlpha = 1;
      drawBall(c, bx, by, 1, 14);

      c.textAlign = 'center';
      c.font = '700 19px ' + FONT; c.fillStyle = C.muted;
      c.fillText('CYBER PINBALL', VW / 2, 140);
      c.font = '800 66px ' + FONT;
      c.fillStyle = '#0d2a12'; c.fillText('ROOT ACCESS', VW / 2 + 3, 214);
      c.fillStyle = C.signal; c.fillText('ROOT ACCESS', VW / 2, 211);
      c.font = '600 30px ' + FONT; c.fillStyle = C.ink;
      c.fillText('Rallume Vertige.', VW / 2, 268);

      grd = c.createLinearGradient(0, VH - 170, 0, VH);
      grd.addColorStop(0, 'rgba(3, 8, 7, 0)'); grd.addColorStop(0.45, 'rgba(3, 8, 7, 0.9)'); grd.addColorStop(1, 'rgba(3, 8, 7, 0.95)');
      c.fillStyle = grd; c.fillRect(0, VH - 170, VW, 170);
      // Dans Cyber Pinball (appareil « borne ») : les boutons de la borne, Exit ramène à la roue.
      const borne = appareil === 'borne';
      consigne(c, borne ? 'UN FLIP POUR JOUER' : 'MAINTIENS LE LANCEUR', VW / 2, VH - 78, t, 26);
      c.textAlign = 'center';
      c.font = '600 15px ' + FONT; c.fillStyle = C.muted;
      c.fillText(borne ? 'OU LE LANCEUR' : appareil === 'manette' ? 'BOUTON A' : 'ENTRÉE OU ESPACE', VW / 2, VH - 42);
      c.font = '600 13px ' + FONT; c.fillStyle = C.faint;
      c.fillText(borne ? 'EXIT : RETOUR À LA ROUE' : 'P : COMMANDES', VW / 2, VH - 16);
    }

    // Consigne d'action : texte toujours opaque, ce sont ses repères qui battent.
    function consigne(c, text, x, y, t, size) {
      const w = label(c, text, x, y, C.signal, size || 22);
      const k = 4 * Math.sin(t * 5);
      c.fillStyle = C.signal;
      c.fillRect(x - w / 2 - 14 - k, y - 3, 7, 7);
      c.fillRect(x + w / 2 + 7 + k, y - 3, 7, 7);
    }

    // ---------- Victoire ----------

    // Dans le repère du plateau : une branche de sève poursuit sa route au-dessus du cadre.
    function brancheVictoire(c, g) {
      if (g.status !== 'won') return;
      const u = ease(clamp01((g.statusT - 0.15) / 1.4));
      if (!u) return;
      const p = new Path2D();
      p.moveTo(300, H + 10); p.bezierCurveTo(170, H * 0.7, 460, H * 0.36, 330, -30);
      const L = 1250;
      c.save();
      c.lineCap = 'round';
      c.setLineDash([L * u, L + 10]);
      c.strokeStyle = 'rgba(139, 226, 58, 0.18)'; c.lineWidth = 14; c.stroke(p);
      c.strokeStyle = C.signal; c.lineWidth = 3; c.stroke(p);
      c.restore();
    }

    // Dans le repère de l'écran : bilan dans un panneau sombre local, après le réveil de la ville.
    function victoire(c, g, t, VW, VH, lignes, rejouer) {
      if (g.status !== 'won') return;
      const a = clamp01((g.statusT - 1.0) / 0.4);
      if (!a) return;
      const y = VH * 0.3;
      c.save();
      c.globalAlpha = a;
      c.fillStyle = 'rgba(3, 8, 7, 0.9)'; c.fillRect(36, y - 74, VW - 72, 214);
      c.strokeStyle = C.tealDeep; c.lineWidth = 1; c.strokeRect(36.5, y - 73.5, VW - 73, 213);
      c.textAlign = 'center';
      c.font = '700 18px ' + FONT; c.fillStyle = C.muted; c.fillText(lignes.petit, VW / 2, y - 40);
      c.font = '800 44px ' + FONT; c.fillStyle = C.signal; c.fillText(lignes.titre, VW / 2, y + 10);
      c.font = '700 19px ' + MONO; c.fillStyle = C.ink; c.fillText(lignes.bilan, VW / 2, y + 50);
      c.font = '700 15px ' + MONO; c.fillStyle = C.signal;
      lignes.lyse.forEach((l, i) => c.fillText(l, VW / 2, y + 88 + i * 21));
      c.restore();
      if (rejouer) consigne(c, rejouer, VW / 2, VH - 90, t, 20);
    }

    return {
      murs, lancePierres, racineLaterale, serrureFixe,
      flip, bumper, faceLancePierre, cible, porte, serrure, pont, bascule,
      sauve, aimant, montee, titre, consigne, label, brancheVictoire, victoire,
    };
  }

  racine.RootDA = { create };
})(window);
