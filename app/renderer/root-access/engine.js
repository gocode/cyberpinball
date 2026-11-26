// Root Access, prototype : moteur (physique, mécanismes, règles des étages).
// Pur et déterministe : aucun accès au DOM ni à l'horloge. Même suite d'appuis = même partie.
// Chargé par la page (window.Engine) et par les tests Node (require).
(function (racine) {
  'use strict';

  const W = 600;
  const H = 1000;
  const DT = 1 / 240;          // pas fixe de la simulation
  const G = 1500;              // gravité (unités/s²)
  const BALL_R = 11;
  const MAX_SPEED = 3200;
  const WALL_REST = 0.45;
  const FLIP_REST = 0.3;
  const FLIP_UP_SPEED = 32;    // rad/s
  const FLIP_DOWN_SPEED = 18;
  const BUMPER_KICK = 650;
  const SLING_KICK = 420;
  const BALL_SAVE = 3;         // s de sauve-bille à chaque départ
  const CRADLE_AUTO = 10;      // s avant que le lanceur tire tout seul (borne laissée sans joueur)
  const CHARGE_TIME = 1;       // s pour charger le lanceur à fond
  const LAUNCH_MIN = 250;      // vitesse de tir à vide (la bille retombe vers le flip gauche)
  const LAUNCH_MAX = 1650;     // vitesse à pleine charge (jusqu'en haut de l'étage)
  // Lanceur analogique (plunger à capteur, axe de manette) : input.tirette, de 0 au repos à 1 tiré à fond.
  // Comme VPX (PlungerSensor::GetHitVelocity) et watchShot du cœur de Cyber Pinball : le tir part quand la
  // tirette retombe au repos, avec la force du point le plus reculé des 100 dernières ms ; un retour lent
  // (la main qui raccompagne la tige) ne tire pas.
  const TIRETTE_FENETRE = 0.1;  // s de positions gardées pour trouver le recul du lâcher
  const TIRETTE_MIN = 0.2;      // recul en dessous duquel un retour au repos n'est pas un tir
  const TIRETTE_REPOS = 0.05;   // position sous laquelle la tirette est au repos
  const TRANSIT = 1.1;         // s de montée entre deux étages
  const FALL = 0.8;            // s de chute dans un vide
  const TIP_IMPACT = 150;      // vitesse d'impact qui fait basculer une bascule
  const AIMANT_DUREE = 1;      // s pendant lesquelles l'aimant retient la bille sur un flip
  const AIMANT_PRISE = 0.15;   // s pour amener la bille au-dessus du flip
  const AIMANT_Y = 600;        // l'aimant n'attrape qu'une bille dans le bas de l'étage
  // Secousse : une bille presque immobile hors des flips pendant SECOUSSE_T secondes est coincée (poche
  // oubliée par un étage, mécanisme qui l'enferme). Le moteur la décoince comme un joueur qui secoue la
  // caisse. Les étages ne doivent pas en avoir besoin : test.js cherche leurs poches sans ce filet.
  const SECOUSSE_T = 2;
  const SECOUSSE_RAYON = 8;
  // Réarmement des lance-pierres : un second coup moins de 0,5 s après le précédent rebondit sans
  // impulsion. Sans lui, la bille faisait un ping-pong sans fin entre les deux, hors de portée des flips.
  const SLING_RECHARGE = 0.5;

  const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

  // ---------- Géométrie ----------

  const CP = { x: 0, y: 0, t: 0 };
  function closest(px, py, ax, ay, bx, by) {
    const dx = bx - ax, dy = by - ay;
    const l2 = dx * dx + dy * dy;
    let t = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0;
    t = clamp(t, 0, 1);
    CP.x = ax + dx * t; CP.y = ay + dy * t; CP.t = t;
    return CP;
  }

  // Normale du dernier contact (de la surface vers la bille).
  const LAST = { nx: 0, ny: 0 };

  // Repousse la bille hors du point (cx, cy) à la distance rad et la fait rebondir sur une surface
  // qui se déplace à (svx, svy). Renvoie la vitesse d'impact (> 0), 0 si contact sans choc, -1 sinon.
  function contact(b, cx, cy, rad, svx, svy, rest, kick) {
    const dx = b.x - cx, dy = b.y - cy;
    const d2 = dx * dx + dy * dy;
    if (d2 >= rad * rad) return -1;
    const d = Math.sqrt(d2);
    const nx = d > 1e-6 ? dx / d : 0;
    const ny = d > 1e-6 ? dy / d : -1;
    LAST.nx = nx; LAST.ny = ny;
    b.x = cx + nx * rad; b.y = cy + ny * rad;
    const rvx = b.vx - svx, rvy = b.vy - svy;
    const vn = rvx * nx + rvy * ny;
    if (vn >= 0) return 0;
    const tx = -ny, ty = nx;
    const vt = rvx * tx + rvy * ty;
    const impact = -vn;
    let nvn = impact < 40 ? 0 : impact * rest;   // pas de rebond minuscule : la bille se pose
    if (kick && impact > 60) nvn += kick;
    const nvt = impact > 200 ? vt * 0.97 : vt;
    b.vx = svx + nx * nvn + tx * nvt;
    b.vy = svy + ny * nvn + ty * nvt;
    return impact;
  }

  function hitSegment(b, s, thick, rest, kick) {
    const q = closest(b.x, b.y, s[0], s[1], s[2], s[3]);
    return contact(b, q.x, q.y, BALL_R + thick, 0, 0, rest, kick);
  }

  // Flip ou bascule : segment tournant autour d'un pivot. from/to en longueur le long de l'axe.
  function hitRotor(b, o, from, to, r1, r2, rest) {
    const c = Math.cos(o.a), s = Math.sin(o.a);
    const q = closest(b.x, b.y, o.x + c * from, o.y + s * from, o.x + c * to, o.y + s * to);
    const t = q.t;
    const rr = r1 + (r2 - r1) * t;
    const svx = -o.w * (q.y - o.y);
    const svy = o.w * (q.x - o.x);
    const impact = contact(b, q.x, q.y, BALL_R + rr, svx, svy, rest, 0);
    CP.t = t;
    return impact;
  }

  // ---------- Étages ----------

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  function buildFloor(level) {
    const f = clone(level);
    for (const k of ['walls', 'slings', 'targets', 'bumpers', 'flippers', 'gates', 'bridges', 'seesaws', 'rules', 'aspirations']) {
      if (!f[k]) f[k] = [];
    }
    for (const fl of f.flippers) { fl.a = fl.rest; fl.w = 0; }
    for (const s of f.seesaws) { s.a = s.a0; s.w = 0; s.state = 0; s.timer = 0; s.flash = 0; }
    for (const t of f.targets) { t.down = false; t.flash = 0; }
    for (const g of f.gates) { g.open = !!g.open; g.timer = 0; }
    for (const br of f.bridges) { br.down = false; br.timer = 0; }
    for (const bu of f.bumpers) bu.flash = 0;
    for (const s of f.slings) s.flash = 0;
    // Bonus de chaîne : deux cibles différentes coup sur coup, payé une seule fois par chaîne.
    if (f.chaine) Object.assign(f.chaine, { n: 0, last: -Infinity, paye: false });
    f.departs = 0;
    return f;
  }

  function findById(list, id) {
    for (const o of list) if (o.id === id) return o;
    return null;
  }

  function say(g, text, color, seconds) {
    g.msg = { text, color: color || 'signal', t: seconds || 2.5 };
  }

  function emit(g, ev) {
    ev.t = g.t;
    ev.floor = g.floor;
    g.events.push(ev);
    if (g.events.length > 200) g.events.shift();
    // Toutes les conditions sont lues avant la première action : une règle ne réveille pas sa voisine
    // (l'interrupteur qui baisse le pont ne le « tient » pas aussitôt).
    const ok = g.f.rules.filter((r) => ruleMatches(g.f, r.quand, ev));
    for (const r of ok) runActions(g, r.alors);
  }

  // quand : { cibles | touche | bascule }, avec en option siOuvert / siFerme (id d'une porte ou d'un pont).
  function ruleMatches(f, q, ev) {
    let ok = false;
    if (q.cibles) {
      ok = ev.type === 'cible' && q.cibles.indexOf(ev.id) >= 0 &&
        q.cibles.every((id) => { const t = findById(f.targets, id); return t && t.down; });
    } else if (q.touche) ok = ev.type === 'touche' && ev.id === q.touche;
    else if (q.bascule) ok = ev.type === 'bascule' && ev.id === q.bascule;
    if (!ok) return false;
    if (q.siOuvert && !ouvert(f, q.siOuvert)) return false;
    if (q.siFerme && ouvert(f, q.siFerme)) return false;
    return true;
  }

  function runActions(g, actions) {
    const f = g.f;
    for (const a of actions) {
      if (a.ouvrir) {
        const gate = findById(f.gates, a.ouvrir);
        if (gate) { gate.open = true; gate.timer = a.duree || 0; gate.total = a.duree || 0; }
      } else if (a.abaisser) {
        const br = findById(f.bridges, a.abaisser);
        if (br) { br.down = true; br.timer = a.duree || 0; br.total = a.duree || 0; }
      } else if (a.tenir) {
        // Refrappe : le passage déjà ouvert garde au moins « duree » secondes, sans revenir au plein.
        const o = findById(f.bridges, a.tenir) || findById(f.gates, a.tenir);
        if (o && (o.down || o.open) && o.timer > 0) o.timer = Math.max(o.timer, a.duree || 0);
      } else if (a.message) {
        say(g, a.message, a.couleur, a.secondes);
      } else if (a.points) {
        g.score += a.points;
      }
    }
  }

  // ---------- Partie ----------

  function createGame(levels, options) {
    const g = {
      levels,
      options: options || {},
      floor: 0,
      status: 'cradle',
      statusT: 0,
      t: 0,
      floorT: 0,
      score: 0,
      camera: 0,
      saveT: 0,
      charge: 0,
      charging: false,
      tire: false,               // lanceur analogique tiré (au-delà du repos), au berceau
      tirette: [],               // positions récentes du lanceur analogique au berceau
      analogique: false,         // un lanceur analogique a donné une position pendant la partie
      ball: { x: 0, y: 0, vx: 0, vy: 0 },
      msg: { text: '', color: 'signal', t: 0 },
      events: [],
      prev: { left: false, right: false },
      aimant: 0,                 // charges d'aimant (données à l'entrée du Tronc, une pour tout le biome)
      prise: null,               // bille tenue par l'aimant : { x0, y0, x, y, t }
      slingT: -1e9,              // pas du dernier coup de lance-pierre (réarmement)
      immobile: null,            // { x, y, t } : depuis quand la bille ne bouge plus (secousse)
      secousses: 0,              // secousses depuis le dernier passage sur un flip
      transit: null,
      f: null,
    };
    enterFloor(g, 0);
    return g;
  }

  function enterFloor(g, k) {
    g.floor = k;
    g.camera = k;
    g.f = buildFloor(g.levels[k]);
    g.floorT = 0;
    // Un étage qui donne l'aimant fixe les charges ; les suivants gardent ce qui reste.
    if (g.f.aimant != null) g.aimant = g.f.aimant;
    toCradle(g);
    if (g.f.intro) say(g, g.f.intro, 'signal', 4);
  }

  function toCradle(g) {
    const c = g.f.cradle;
    g.status = 'cradle';
    g.statusT = 0;
    g.charge = 0; g.charging = false;
    g.tire = false; g.tirette = [];
    g.prise = null;
    g.ball.x = c.x; g.ball.y = c.y; g.ball.vx = 0; g.ball.vy = 0;
    g.immobile = null;
    g.secousses = 0;
  }

  // Bille posée sur un flip (tenue par le joueur, ou qui en roule) : jamais coincée.
  function surUnFlip(f, b) {
    for (const fl of f.flippers) {
      const c = Math.cos(fl.a), s = Math.sin(fl.a);
      const q = closest(b.x, b.y, fl.x, fl.y, fl.x + c * fl.len, fl.y + s * fl.len);
      if (Math.hypot(b.x - q.x, b.y - q.y) < BALL_R + fl.r1 + 4) return true;
    }
    return false;
  }

  function surveillerBlocage(g) {
    const b = g.ball;
    if (g.options.sansSecousse) return;
    if (surUnFlip(g.f, b)) { g.immobile = null; g.secousses = 0; return; }
    const im = g.immobile;
    if (!im || Math.hypot(b.x - im.x, b.y - im.y) > SECOUSSE_RAYON) { g.immobile = { x: b.x, y: b.y, t: 0 }; return; }
    im.t += DT;
    if (im.t < SECOUSSE_T) return;
    g.immobile = null;
    g.secousses++;
    emit(g, { type: 'secousse', x: b.x, y: b.y, n: g.secousses });
    if (g.secousses >= 2) {
      // Recoincée sans être repassée par un flip : la poche la reprend. Retour au lanceur, sans perte.
      say(g, 'BILLE COINCÉE : RETOUR AU LANCEUR', 'meta', 2.5);
      toCradle(g);
      return;
    }
    // Vers le haut et vers le milieu de l'étage : la bille quitte son creux et retombe en jeu.
    b.vx = b.x < W / 2 ? 260 : -260;
    b.vy = -420;
    say(g, 'SECOUSSE : BILLE DÉCOINCÉE', 'meta', 1.6);
  }

  // Durée du sauve-bille que donnera le prochain départ (affichée au berceau). Réglée par étage :
  // sauveBille = secondes, ou { duree, arrivee: true } pour ne protéger que le premier départ de l'étage
  // (pas le retour au lanceur après une chute dans un vide ou un sauvetage).
  function saveDuration(g) {
    if (g.options.sansSauveBille) return 0;
    const sb = g.f.sauveBille;
    if (sb == null) return BALL_SAVE;
    if (typeof sb === 'number') return sb;
    if (sb.arrivee && g.f.departs > 0) return 0;
    return sb.duree;
  }

  function release(g) {
    g.status = 'play';
    g.statusT = 0;
    g.charge = 0; g.charging = false;
    g.tire = false; g.tirette = [];
    g.saveT = saveDuration(g);
    g.f.departs++;
  }

  // Point où l'aimant tient la bille : posée sur le grand flip de son côté, au tiers de sa longueur, en
  // suivant son angle. Mesuré (scratchpad aimant2.cjs) : de là, un coup de flip baissé l'envoie au haut
  // de l'étage, même 0,16 s après la fin de la prise ; flip levé, elle roule jusqu'au creux (bille bercée).
  const AIMANT_U = 0.3;
  function flipAimant(f, gauche) {
    return f.flippers.find((o) => o.side === (gauche ? 'left' : 'right') && o.len > 80);
  }
  function pointAimant(f, gauche) {
    const fl = flipAimant(f, gauche);
    const a = fl.a != null ? fl.a : fl.rest, ca = Math.cos(a), sa = Math.sin(a);
    const r = fl.r1 + (fl.r2 - fl.r1) * AIMANT_U + BALL_R + 0.5;
    let nx = -sa, ny = ca;
    if (ny > 0) { nx = -nx; ny = -ny; }
    return [fl.x + ca * fl.len * AIMANT_U + nx * r, fl.y + sa * fl.len * AIMANT_U + ny * r];
  }

  // Bouton de l'aimant : une charge attrape une bille du bas de l'étage et la tient au-dessus du flip.
  // Sans charge, ou bille trop haute, rien n'est dépensé.
  function aimanter(g) {
    if (g.status !== 'play' || g.prise || !(g.aimant > 0)) return;
    const b = g.ball;
    if (b.y < AIMANT_Y) { say(g, 'AIMANT : BILLE TROP HAUTE', 'warning', 1.2); return; }
    const gauche = b.x < W / 2;
    g.aimant--;
    g.prise = { x0: b.x, y0: b.y, gauche, t: 0 };
    b.vx = 0; b.vy = 0;
    emit(g, { type: 'aimant', side: gauche ? 'left' : 'right' });
    say(g, 'AIMANT : BILLE RETENUE', 'meta', 1.2);
  }

  // Tant que l'aimant tient : la bille glisse vers le point de prise (qui suit le flip), sans vitesse.
  // Un coup du flip de ce côté la lâche aussitôt, pour que le flip la frappe ; sinon elle part après 1 s.
  function tenirBille(g, input) {
    const p = g.prise, b = g.ball;
    const appui = p.gauche ? input.left : input.right;
    const avant = p.gauche ? g.prev.left : g.prev.right;
    if (appui && !avant && p.t > 0) { lacher(g, 'flip'); return false; }
    moveRotors(g.f, input, DT);
    p.t += DT;
    const [x, y] = pointAimant(g.f, p.gauche);
    p.x = x; p.y = y;
    const u = clamp(p.t / AIMANT_PRISE, 0, 1), e = u * u * (3 - 2 * u);
    b.x = p.x0 + (x - p.x0) * e;
    b.y = p.y0 + (y - p.y0) * e;
    b.vx = 0; b.vy = 0;
    if (p.t >= AIMANT_DUREE) lacher(g, 'temps');
    return true;
  }

  function lacher(g, par) {
    g.prise = null;
    emit(g, { type: 'aimant-lache', par });
  }

  // Tir du lanceur : vers le haut, un peu vers le centre. Faible, la bille retombe sur le flip de son côté ;
  // à fond, elle monte jusqu'en haut de l'étage.
  function launch(g, charge) {
    const c = clamp(charge, 0, 1);
    const v = LAUNCH_MIN + (LAUNCH_MAX - LAUNCH_MIN) * c;
    release(g);
    // Un peu vers le centre, quel que soit le côté du berceau.
    g.ball.vx = v * 0.12 * (g.f.cradle.x > W / 2 ? -1 : 1);
    g.ball.vy = -v;
    emit(g, { type: 'lance', charge: c });
  }

  // Lanceur analogique au berceau : suit la tirette (la tige et la bille reculent avec elle) et rend la
  // force du tir quand elle retombe au repos après un recul suffisant ; sinon null. Sans position
  // (input.tirette absent : clavier, bouton), rien ne change.
  function tirette(g, input) {
    const brut = input.tirette;
    if (typeof brut !== 'number' || !Number.isFinite(brut)) return null;
    g.analogique = true;
    const pos = clamp(brut, 0, 1);     // poussée vers l'avant : comme au repos
    g.tirette.push(pos);
    const n = Math.max(1, Math.round(TIRETTE_FENETRE / DT));
    if (g.tirette.length > n) g.tirette.splice(0, g.tirette.length - n);
    g.tire = pos > TIRETTE_REPOS;
    if (!g.charging) g.charge = pos;
    if (pos > TIRETTE_REPOS) return null;
    const recul = Math.max(...g.tirette);
    if (recul < TIRETTE_MIN) return null;
    return Math.min(1, recul);
  }

  function moveRotors(f, input, h) {
    for (const fl of f.flippers) {
      const pressed = fl.side === 'left' ? input.left : input.right;
      const target = pressed ? fl.up : fl.rest;
      const speed = pressed ? FLIP_UP_SPEED : FLIP_DOWN_SPEED;
      const old = fl.a;
      const d = target - fl.a;
      const stepMax = speed * h;
      fl.a = Math.abs(d) <= stepMax ? target : fl.a + Math.sign(d) * stepMax;
      fl.w = (fl.a - old) / h;
    }
    for (const s of f.seesaws) {
      const target = s.state === 1 ? s.a1 : s.a0;
      const speed = s.state === 1 ? 7 : 1.5;
      const old = s.a;
      const d = target - s.a;
      const stepMax = speed * h;
      s.a = Math.abs(d) <= stepMax ? target : s.a + Math.sign(d) * stepMax;
      s.w = (s.a - old) / h;
    }
  }

  function collide(g, b) {
    const f = g.f;
    for (const w of f.walls) hitSegment(b, w, 2, WALL_REST, 0);
    const arme = g.t - g.slingT >= Math.round(SLING_RECHARGE / DT);
    for (const s of f.slings) {
      if (hitSegment(b, s.seg, 2, WALL_REST, arme ? SLING_KICK : 0) > 60) {
        s.flash = 0.12; g.score += 5;
        if (arme) g.slingT = g.t;
      }
    }
    for (const gate of f.gates) if (!gate.open) hitSegment(b, gate.seg, 3, WALL_REST, 0);
    for (const t of f.targets) {
      if (t.down) continue;
      const imp = hitSegment(b, t.seg, 3, WALL_REST, 0);
      if (imp > 80) {
        t.flash = 0.25;
        if (t.kind === 'drop') {
          t.down = true;
          g.score += 100;
          // La chaîne passe avant la cible : si celle-ci ouvre la porte, son message reste affiché.
          const ch = f.chaine;
          if (ch) {
            if (ch.n > 0 && g.t - ch.last <= Math.round(ch.delai / DT)) ch.n++;
            else { ch.n = 1; ch.paye = false; }
            ch.last = g.t;
            if (ch.n >= 2 && !ch.paye) {
              ch.paye = true;
              g.score += ch.points;
              emit(g, { type: 'chaine', id: t.id, points: ch.points });
              say(g, 'CHAÎNE : +' + ch.points, 'signal', 1.6);
            }
          }
          emit(g, { type: 'cible', id: t.id });
        } else {
          g.score += 250;
          emit(g, { type: 'touche', id: t.id });
        }
      }
    }
    for (const bu of f.bumpers) {
      if (contact(b, bu.x, bu.y, BALL_R + bu.r, 0, 0, 0.4, BUMPER_KICK) > 60) { bu.flash = 0.12; g.score += 10; }
    }
    for (const fl of f.flippers) hitRotor(b, fl, 0, fl.len, fl.r1, fl.r2, FLIP_REST);
    for (const s of f.seesaws) {
      const imp = hitRotor(b, s, -s.half, s.half, 7, 7, 0.25);
      if (imp > TIP_IMPACT && s.state === 0) {
        // Deux gestes la font basculer : retomber sur la moitié levée (par-dessus), ou, si l'étage le
        // permet (parDessous), frapper la moitié basse par en dessous, ce qui la soulève. En position 0,
        // l'extrémité levée est la « + » (angle négatif). Seul le premier geste catapulte.
        const raisedPlus = s.a0 < 0;
        const surLeve = LAST.ny < -0.5 && ((raisedPlus && CP.t > 0.5) || (!raisedPlus && CP.t < 0.5));
        const sousBas = s.parDessous && LAST.ny > 0.5 && ((raisedPlus && CP.t < 0.5) || (!raisedPlus && CP.t > 0.5));
        if (surLeve || sousBas) {
          s.state = 1;
          s.timer = s.hold;
          s.flash = 0.3;
          emit(g, { type: 'bascule', id: s.id, dessous: !surLeve });
          // Catapulte : une impulsion par bascule, la bille étant encore posée dessus, vitesse fixe
          // (donc plafonnée). Elle renvoie la bille sur le flip droit, d'où part le tir croisé.
          if (s.catapulte && surLeve) {
            const a = s.catapulte.angle * Math.PI / 180;
            b.vx = Math.cos(a) * s.catapulte.vitesse;
            b.vy = Math.sin(a) * s.catapulte.vitesse;
            emit(g, { type: 'catapulte', id: s.id });
          }
        }
      }
    }
  }

  function tickTimers(g, dt) {
    const f = g.f;
    if (g.saveT > 0) g.saveT = Math.max(0, g.saveT - dt);
    for (const gate of f.gates) {
      if (gate.open && gate.timer > 0) {
        gate.timer -= dt;
        if (gate.timer <= 0) { gate.timer = 0; gate.open = false; emit(g, { type: 'porte-fermee', id: gate.id }); say(g, 'PORTE REFERMÉE', 'warning', 2); }
      }
    }
    for (const br of f.bridges) {
      if (br.down && br.timer > 0) {
        br.timer -= dt;
        if (br.timer <= 0) { br.timer = 0; br.down = false; emit(g, { type: 'pont-releve', id: br.id }); say(g, 'PONT RELEVÉ', 'warning', 2); }
      }
    }
    for (const s of f.seesaws) {
      if (s.flash > 0) s.flash -= dt;
      if (s.state === 1) {
        s.timer -= dt;
        if (s.timer <= 0) { s.timer = 0; s.state = 0; emit(g, { type: 'bascule-retour', id: s.id }); }
      }
    }
    for (const t of f.targets) if (t.flash > 0) t.flash -= dt;
    for (const bu of f.bumpers) if (bu.flash > 0) bu.flash -= dt;
    for (const s of f.slings) if (s.flash > 0) s.flash -= dt;
  }

  function inRect(b, r) { return b.x >= r.x1 && b.x <= r.x2 && b.y >= r.y1 && b.y <= r.y2; }

  // Aspiration de la sortie : quand son passage est ouvert (porte ouverte, pont baissé), une bille qui
  // MONTE dans la zone est tirée vers un point. Sa force règle la difficulté de l'étage : sans elle, il
  // faudrait frapper presque au pivot du flip pour monter droit dans l'entrée.
  function ouvert(f, id) {
    if (Array.isArray(id)) return id.every((i) => ouvert(f, i));
    const gt = findById(f.gates, id);
    if (gt) return gt.open;
    const br = findById(f.bridges, id);
    return br ? br.down : true;
  }
  function aspirationsActives(f) {
    if (!f.aspirations || !f.aspirations.length) return null;
    let out = null;
    for (const a of f.aspirations) {
      const on = !a.si || ouvert(f, a.si);
      a.actif = on;
      if (on) (out || (out = [])).push(a);
    }
    return out;
  }
  function aspirer(b, list, h) {
    if (b.vy >= 0) return;
    for (const a of list) {
      if (!inRect(b, a.zone)) continue;
      const dx = a.vers[0] - b.x, dy = a.vers[1] - b.y;
      const d = Math.hypot(dx, dy) || 1;
      b.vx += (dx / d) * a.force * h;
      b.vy += (dy / d) * a.force * h;
      // Le travers est amorti : la bille s'aligne sur l'axe au lieu d'osciller.
      const ux = dx / d, uy = dy / d;
      const vt = b.vx * -uy + b.vy * ux;
      const k = Math.min(1, (a.amorti || 0) * h);
      b.vx -= -uy * vt * k; b.vy -= ux * vt * k;
      return;
    }
  }

  function physics(g, input) {
    const f = g.f, b = g.ball;
    tickTimers(g, DT);
    if (g.status !== 'play') return;   // une règle (ou un minuteur) peut avoir changé l'état
    if (g.prise && tenirBille(g, input)) return;

    const speed = Math.hypot(b.vx, b.vy);
    let tip = 0;
    for (const fl of f.flippers) tip = Math.max(tip, FLIP_UP_SPEED * fl.len);
    const n = clamp(Math.ceil(Math.max(speed, tip) * DT / 4), 2, 24);
    const h = DT / n;
    const asp = aspirationsActives(f);
    for (let i = 0; i < n; i++) {
      moveRotors(f, input, h);
      b.vy += G * h;
      if (asp) aspirer(b, asp, h);
      b.x += b.vx * h;
      b.y += b.vy * h;
      collide(g, b);
      const sp = Math.hypot(b.vx, b.vy);
      if (sp > MAX_SPEED) { b.vx *= MAX_SPEED / sp; b.vy *= MAX_SPEED / sp; }
      if (g.status !== 'play') return;
    }

    surveillerBlocage(g);
    if (g.status !== 'play') return;
    if (f.exit && inRect(b, f.exit)) { startTransit(g); return; }
    for (const br of f.bridges) {
      if (!br.down && inRect(b, br.rect)) {
        g.status = 'falling'; g.statusT = 0;
        emit(g, { type: 'chute', id: br.id });
        say(g, 'TOMBÉE DANS LE VIDE : RETOUR AU LANCEUR', 'meta', 2.5);
        return;
      }
    }
    // Sous les flips, rien ne retient la bille : sortir par le bas ou par un côté du bas, c'est la perdre.
    if (b.y > H + 40 || (b.y > 900 && (b.x < -20 || b.x > W + 20))) {
      if (g.saveT > 0) {
        emit(g, { type: 'sauve-bille' });
        say(g, 'SAUVE-BILLE', 'signal', 2);
        toCradle(g);
      } else {
        g.status = 'dead'; g.statusT = 0;
        emit(g, { type: 'perdue' });
      }
      return;
    }
    if (b.x < -40 || b.x > W + 40 || b.y < -200) {
      // Sortie par un trou du décor : un défaut d'étage. Noté pour les tests, la bille repart du berceau.
      emit(g, { type: 'fuite', x: b.x, y: b.y });
      toCradle(g);
    }
  }

  function startTransit(g) {
    const b = g.ball;
    const next = g.floor + 1;
    const bonus = Math.max(0, Math.round((30 - g.floorT) * 50));
    g.score += 1000 + bonus;
    emit(g, { type: 'sortie', bonus });
    if (next >= g.levels.length) {
      g.status = 'won'; g.statusT = 0;
      return;
    }
    g.status = 'transit';
    g.statusT = 0;
    const c = g.levels[next].cradle;
    g.transit = { from: g.floor, ex: b.x, ey: b.y, cx: c.x, cy: c.y };
  }

  // Conduit d'arrivée d'un étage, en coordonnées locales : il part du bas, au centre (sous la sortie de
  // l'étage d'en dessous), longe le bas sous les flips, remonte derrière le couloir du lanceur (à droite)
  // et débouche au berceau. Le rendu le dessine ; la bille le suit pendant la montée.
  const CONDUIT = [[300, 1000], [300, 985], [W - 62, 985], [W - 38, 961], [W - 38, 772]];

  // Position de la bille en montée, en coordonnées globales (y d'un étage k : y local - k × H).
  function transitBall(g) {
    const tr = g.transit;
    const u = clamp(g.statusT / TRANSIT, 0, 1);
    const e = u * u * (3 - 2 * u);
    const top = (tr.from + 1) * H;
    const pts = [[tr.ex, tr.ey - tr.from * H]];
    for (const [x, y] of CONDUIT) pts.push([x, y - top]);
    pts.push([tr.cx, tr.cy - top]);
    pts[1][0] = tr.ex;
    let total = 0;
    const lens = [];
    for (let i = 1; i < pts.length; i++) { const l = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1]); lens.push(l); total += l; }
    let d = e * total;
    for (let i = 1; i < pts.length; i++) {
      const l = lens[i - 1];
      if (d <= l || i === pts.length - 1) {
        const k = l > 0 ? clamp(d / l, 0, 1) : 1;
        return { x: pts[i - 1][0] + (pts[i][0] - pts[i - 1][0]) * k, y: pts[i - 1][1] + (pts[i][1] - pts[i - 1][1]) * k };
      }
      d -= l;
    }
    return { x: tr.cx, y: tr.cy - top };
  }

  function step(g, input) {
    input = input || { left: false, right: false };
    g.t++;
    if (g.msg.t > 0) g.msg.t -= DT;
    switch (g.status) {
      case 'cradle':
        g.statusT += DT;
        g.floorT += DT;
        moveRotors(g.f, input, DT);
        tickTimers(g, DT);
        // Lanceur : tenu, il se charge (une seconde pour le plein) ; relâché, il tire. Un appui commencé
        // avant l'arrivée au berceau ne compte pas : il faut un nouvel appui.
        if (input.plunger && !g.prev.plunger) g.charging = true;
        if (g.charging && input.plunger) g.charge = Math.min(1, g.charge + DT / CHARGE_TIME);
        // Un bouton de lancement et un lanceur analogique peuvent coexister sur une borne : les deux tirent.
        const tir = tirette(g, input);
        if (g.charging && !input.plunger) launch(g, g.charge);
        else if (tir != null) launch(g, tir);
        else if (g.statusT >= CRADLE_AUTO && !g.charging && !g.tire) launch(g, 0.55);
        break;
      case 'play':
        g.statusT += DT;
        g.floorT += DT;
        if (input.aimant && !g.prev.aimant) aimanter(g);
        physics(g, input);
        break;
      case 'falling':
        g.statusT += DT;
        g.floorT += DT;
        moveRotors(g.f, input, DT);
        tickTimers(g, DT);
        if (g.statusT >= FALL) toCradle(g);
        break;
      case 'transit': {
        g.statusT += DT;
        const u = clamp(g.statusT / TRANSIT, 0, 1);
        g.camera = g.floor + u * u * (3 - 2 * u);
        if (g.statusT >= TRANSIT) { g.transit = null; enterFloor(g, g.floor + 1); }
        break;
      }
      default:
        g.statusT += DT;
    }
    g.prev.left = input.left;
    g.prev.right = input.right;
    g.prev.plunger = !!input.plunger;
    g.prev.aimant = !!input.aimant;
  }

  // Empreinte de l'état, pour vérifier le déterminisme.
  function hash(g) {
    const b = g.ball;
    return [g.floor, g.status, g.score, b.x.toFixed(6), b.y.toFixed(6), b.vx.toFixed(6), b.vy.toFixed(6)].join('|');
  }

  const Engine = {
    W, H, DT, BALL_R, TRANSIT, FALL, BALL_SAVE, CONDUIT, AIMANT_DUREE, AIMANT_Y, TIRETTE_MIN, TIRETTE_REPOS,
    createGame, enterFloor, step, release, saveDuration, toCradle, transitBall, hash, buildFloor, emit,
    ouvert, pointAimant,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Engine;
  else racine.Engine = Engine;
})(typeof window !== 'undefined' ? window : globalThis);
