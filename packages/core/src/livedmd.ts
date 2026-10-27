// DMD du menu vivant : pendant la navigation, Cyber Pinball dessine lui-même l'afficheur à
// points, en 128 × 32 comme les vrais DMD, et y fait tourner ce qu'une machine montre en
// attente : le titre de la table choisie, ses records (highscores.ts, rien d'inventé),
// « PRESS START », l'horloge, « CREDITS », puis le média DMD de la table s'il en a un.
//
// Tout se calcule ici, sans navigateur : une image est une grille de 128 × 32 nuances de 0
// (point éteint) à 15 (plein éclat). Le processus principal (app/src/live-dmd.ts) fait tourner
// le programme et envoie chaque image changée à la fenêtre du DMD, qui la dessine en points
// (app/renderer/fallback.js, CyberFallback.dotMatrix). La même image pourrait partir vers un
// DMD matériel : voir le manuel, « DMD du menu », pour ce qui manque.
//
// Les mots de l'afficheur restent ceux des flippers (PRESS START, CREDITS, HIGH SCORE) : ils
// font partie du décor, comme sur les machines vendues en France.

import { DMD_FONT_BRAND, DMD_FONT_HUGE, DMD_FONT_LARGE, DMD_FONT_SMALL, dmdText, textWidth, type DmdFont } from './dmdfont';
import { centeredDmdBand } from './dmdscreen';
import { frameWindow, type FrameRecord, type FrameRect } from './fulldmdframe';
import { dmdScore, type TableRecords } from './highscores';
import { CINEMA_TIMELINE } from './cinema';

export const DMD_WIDTH = 128;
export const DMD_HEIGHT = 32;

/**
 * Nuances (0 : point éteint, 15 : plein éclat ; 16 comme les DMD de Stern, les WPC en avaient
 * 4), d'après la revue du directeur artistique du 26/10/2026 : l'information la plus forte, ce
 * qui l'accompagne un ton en dessous, les petits textes assez clairs pour se lire à un mètre.
 */
export const DMD_LEVEL = {
  /** Bille du chargement, accent ponctuel. */
  accent: 15,
  /** Titres, scores, PRESS START. */
  main: 14,
  /** Horloge et crédits : présents sans prendre le pas sur la table. */
  quiet: 11,
  /** Fabricant et année, libellé des records : environ 66 % de la couleur, lisibles sans prendre le pas (seconde revue du 27/10/2026). */
  secondary: 11,
  /** Rail du chargement (5 : visible sans concurrencer la bille, seconde revue). */
  rail: 5,
  /**
   * Marque : PINBALL au plein éclat, CYBER un ton dessous mais au-dessus du secondaire, son trait
   * d'un point étant léger ; sur un afficheur d'une couleur, la lumière porte la hiérarchie que
   * l'interface donne par la couleur (CYBER clair, PINBALL vert signal ; revue du 27/10/2026).
   */
  brandCyber: 11,
  brandPinball: 15,
};

/** Une image de l'afficheur : DMD_WIDTH × DMD_HEIGHT nuances, ligne par ligne. */
export type DmdDots = Uint8Array;

export function blankDots(): DmdDots {
  return new Uint8Array(DMD_WIDTH * DMD_HEIGHT);
}

/** Écrit un texte (déjà passé par dmdText) en (x, y), à la nuance `level`. */
export function drawText(dots: DmdDots, font: DmdFont, text: string, x: number, y: number, level = DMD_LEVEL.main): void {
  let cx = Math.round(x);
  for (const c of text) {
    const g = font.glyphs.get(c) ?? font.glyphs.get('?')!;
    for (let gy = 0; gy < g.h; gy++) {
      const ty = y + gy;
      if (ty < 0 || ty >= DMD_HEIGHT) continue;
      for (let gx = 0; gx < g.w; gx++) {
        const tx = cx + gx;
        if (tx < 0 || tx >= DMD_WIDTH || !g.px[gy * g.w + gx]) continue;
        const i = ty * DMD_WIDTH + tx;
        dots[i] = Math.max(dots[i]!, level);
      }
    }
    cx += g.w + font.spacing;
  }
}

/** Texte centré horizontalement à la ligne y. */
export function drawCentered(dots: DmdDots, font: DmdFont, text: string, y: number, level = DMD_LEVEL.main): void {
  drawText(dots, font, text, Math.floor((DMD_WIDTH - textWidth(font, text)) / 2), y, level);
}

/** Marge de chaque côté d'un texte fixe, en points. */
export const DMD_MARGIN = 3;
/** Largeur utile d'un texte fixe : un titre plus large défile. */
export const DMD_USABLE = DMD_WIDTH - 2 * DMD_MARGIN;

// ---------------------------------------------------------------------------
// Pages

export type DmdPageId = 'title' | 'records' | 'press-start' | 'clock' | 'credits' | 'media' | 'brand';

export interface DmdPage {
  id: DmdPageId;
  /** Durée de la page, en ms. */
  hold: number;
  /** Page du média DMD de la table : la fenêtre montre le média, pas les points. */
  media?: boolean;
  /** Image à `elapsed` ms du début de la page (non appelée pour la page du média). */
  dots(elapsed: number): DmdDots;
  /** La page bouge (défilement, clignotement, horloge) : l'image est à recalculer en continu. */
  animated?: boolean;
}

/** Ce que le DMD montre de la table choisie. */
export interface LiveDmdInput {
  title?: string;
  manufacturer?: string;
  year?: number;
  /** Records de la table (readTableRecords) ; absents : pas de page des records. */
  records?: TableRecords;
  /** La table a un média DMD (image ou vidéo) : il passe dans l'alternance. */
  hasMedia?: boolean;
  /** Heure de l'horloge ; maintenant par défaut (les essais la fixent). */
  now?: () => Date;
}

/**
 * Durées de l'alternance, en ms : environ 28 s pour une table à 4 records et un média DMD.
 * Valeurs du directeur artistique (26/10/2026) : l'invitation à jouer suit le titre, le cycle
 * reste court pour un menu qu'on parcourt.
 */
export const LIVE_DMD_TIMING = {
  title: 4800,
  pressStart: 2400,
  record: 2400,
  media: 5000,
  clock: 3000,
  credits: 1800,
  brand: 4000,
  /** Poussée vers le haut entre deux pages de points (32 lignes, à vitesse constante). */
  transition: 160,
  /** Vitesse d'un titre trop long qui défile, en points par seconde. */
  scroll: 24,
  /** Arrêt d'un titre qui défile, au début et à la fin. */
  scrollPause: 1000,
  /** Clignotement de PRESS START : allumé, puis éteint (deux fois par passage). */
  blinkOn: 800,
  blinkOff: 400,
  /** Battement des deux-points de l'horloge : allumés la première moitié de chaque seconde. */
  colonOn: 500,
};

/** Records montrés au plus (les premières places du tableau) ; jamais de page vide pour compléter. */
export const LIVE_DMD_RECORDS = 4;

function still(id: DmdPageId, hold: number, paint: (dots: DmdDots) => void): DmdPage {
  const dots = blankDots();
  paint(dots);
  return { id, hold, dots: () => dots };
}

/** Titre de la table : en grand s'il tient avec ses marges, sinon il défile en grand ; fabricant et année dessous. */
export function titlePage(input: LiveDmdInput): DmdPage {
  const title = dmdText(input.title ?? '');
  let sub = dmdText([input.manufacturer, input.year].filter(Boolean).join(' '));
  while (sub && textWidth(DMD_FONT_SMALL, sub) > DMD_USABLE) sub = sub.slice(0, -1).trimEnd();
  const width = textWidth(DMD_FONT_LARGE, title);
  // Avec le fabricant : le titre sur les lignes 4 à 17, le fabricant sur 23 à 29 ; seul, le titre centré.
  const titleY = sub ? 4 : 9;
  const paintSub = (dots: DmdDots) => sub && drawCentered(dots, DMD_FONT_SMALL, sub, 23, DMD_LEVEL.secondary);
  if (width <= DMD_USABLE) return still('title', LIVE_DMD_TIMING.title, (dots) => (drawCentered(dots, DMD_FONT_LARGE, title, titleY), paintSub(dots)));
  // Trop long : il part calé à la marge gauche, lisible tout de suite, glisse jusqu'à montrer sa fin, s'y arrête.
  // La durée suit la distance : le titre n'est jamais coupé pour tenir dans celle d'un titre fixe.
  const pause = LIVE_DMD_TIMING.scrollPause;
  const travel = width - DMD_USABLE;
  const glide = Math.round((travel / LIVE_DMD_TIMING.scroll) * 1000);
  return {
    id: 'title',
    hold: Math.max(LIVE_DMD_TIMING.title, 2 * pause + glide),
    animated: true,
    dots(elapsed) {
      const dots = blankDots();
      const k = Math.min(1, Math.max(0, (elapsed - pause) / glide));
      drawText(dots, DMD_FONT_LARGE, title, DMD_MARGIN - Math.round(k * travel), titleY);
      // Les marges masquent le texte qui glisse : les lettres ne sont pas coupées au bord même de l'afficheur.
      for (let y = 0; y < DMD_HEIGHT; y++) {
        dots.fill(0, y * DMD_WIDTH, y * DMD_WIDTH + DMD_MARGIN);
        dots.fill(0, (y + 1) * DMD_WIDTH - DMD_MARGIN, (y + 1) * DMD_WIDTH);
      }
      paintSub(dots);
      return dots;
    },
  };
}

/** Score tel que l'afficheur l'écrit : chiffres groupés par trois, séparés d'un point bas étroit. */
export function scoreText(score: number): string {
  return dmdScore(score).replace(/,/g, '․');
}

/** Une page par record : la place et les initiales en petit, le score en grand. */
export function recordPages(records: TableRecords | undefined): DmdPage[] {
  return (records?.scores ?? []).slice(0, LIVE_DMD_RECORDS).map((s) =>
    still('records', LIVE_DMD_TIMING.record, (dots) => {
      const head = s.initials ? `HIGH SCORE #${s.rank}  ${dmdText(s.initials)}` : `HIGH SCORE #${s.rank}`;
      drawCentered(dots, DMD_FONT_SMALL, head, 2, DMD_LEVEL.secondary);
      const score = scoreText(s.score);
      if (textWidth(DMD_FONT_LARGE, score) <= DMD_USABLE) drawCentered(dots, DMD_FONT_LARGE, score, 14);
      else drawCentered(dots, DMD_FONT_SMALL, score, 18);
    }),
  );
}

/** PRESS START en grand, qui clignote deux fois. */
export function pressStartPage(): DmdPage {
  const on = blankDots();
  drawCentered(on, DMD_FONT_LARGE, 'PRESS START', 9);
  const off = blankDots();
  const period = LIVE_DMD_TIMING.blinkOn + LIVE_DMD_TIMING.blinkOff;
  return { id: 'press-start', hold: LIVE_DMD_TIMING.pressStart, animated: true, dots: (elapsed) => (elapsed % period < LIVE_DMD_TIMING.blinkOn ? on : off) };
}

/** « 18:42 » : l'heure en très grand mais un ton en dessous, les deux-points qui battent la seconde. */
export function clockPage(now: () => Date = () => new Date()): DmdPage {
  return {
    id: 'clock',
    hold: LIVE_DMD_TIMING.clock,
    animated: true,
    dots() {
      const d = now();
      const hh = String(d.getHours()).padStart(2, '0');
      const mm = String(d.getMinutes()).padStart(2, '0');
      const dots = blankDots();
      const text = `${hh}:${mm}`;
      const x = Math.floor((DMD_WIDTH - textWidth(DMD_FONT_HUGE, text)) / 2);
      drawText(dots, DMD_FONT_HUGE, text, x, 2, DMD_LEVEL.quiet);
      // Deux-points éteints la seconde moitié de chaque seconde : on efface la colonne du signe.
      if (d.getMilliseconds() >= LIVE_DMD_TIMING.colonOn) {
        const left = x + textWidth(DMD_FONT_HUGE, hh) + DMD_FONT_HUGE.spacing;
        const colon = DMD_FONT_HUGE.glyphs.get(':')!.w;
        for (let y = 0; y < DMD_HEIGHT; y++) dots.fill(0, y * DMD_WIDTH + left, y * DMD_WIDTH + left + colon);
      }
      return dots;
    },
  };
}

/** CREDITS et le nombre de crédits : ceux que la table a enregistrés, sinon 0 (le menu n'a pas de monnayeur). */
export function creditsPage(credits = 0): DmdPage {
  return still('credits', LIVE_DMD_TIMING.credits, (dots) => drawCentered(dots, DMD_FONT_LARGE, `CREDITS ${credits}`, 9, DMD_LEVEL.quiet));
}

/** Sans table : la marque empilée dans sa police (dmdfont.ts), 3 lignes libres en haut et en bas, 4 entre les mots. */
export function brandPage(): DmdPage {
  return still('brand', LIVE_DMD_TIMING.brand, (dots) => {
    drawCentered(dots, DMD_FONT_BRAND, 'CYBER', 3, DMD_LEVEL.brandCyber);
    drawCentered(dots, DMD_FONT_BRAND, 'PINBALL', 18, DMD_LEVEL.brandPinball);
  });
}

export function mediaPage(): DmdPage {
  const dots = blankDots();
  return { id: 'media', hold: LIVE_DMD_TIMING.media, media: true, dots: () => dots };
}

/**
 * L'alternance d'une table : titre, PRESS START, records, média DMD, horloge, crédits ; une
 * page absente (pas de records, pas de média) est sautée. Sans table : la marque, PRESS START,
 * l'horloge.
 */
export function liveDmdPages(input: LiveDmdInput | undefined): DmdPage[] {
  if (!input?.title) return [brandPage(), pressStartPage(), clockPage(input?.now)];
  return [
    titlePage(input),
    pressStartPage(),
    ...recordPages(input.records),
    ...(input.hasMedia ? [mediaPage()] : []),
    clockPage(input.now),
    creditsPage(input.records?.credits),
  ];
}

// ---------------------------------------------------------------------------
// Programme : les pages à la suite, en boucle, avec leurs transitions

/** Ce que montre le DMD à un instant : des points, ou le média de la table. */
export interface LiveDmdShot {
  page: DmdPageId;
  /** Index de la page dans le programme. */
  index: number;
  media: boolean;
  /** Points à montrer (absents pour le média). */
  dots?: DmdDots;
  /** L'image change d'elle-même (défilement, transition, clignotement) : la recalculer à la trame suivante. */
  moving: boolean;
}

/** Transition entre deux images : l'ancienne monte et la nouvelle la pousse, ligne à ligne (k de 0 à 1). */
export function transitionDots(from: DmdDots, to: DmdDots, k: number): DmdDots {
  const out = blankDots();
  const shift = Math.min(DMD_HEIGHT, Math.max(0, Math.floor(k * DMD_HEIGHT)));
  for (let y = 0; y < DMD_HEIGHT; y++) {
    const src = y + shift;
    out.set(src < DMD_HEIGHT ? from.subarray(src * DMD_WIDTH, (src + 1) * DMD_WIDTH) : to.subarray((src - DMD_HEIGHT) * DMD_WIDTH, (src - DMD_HEIGHT + 1) * DMD_WIDTH), y * DMD_WIDTH);
  }
  return out;
}

/**
 * Programme en boucle : chaque page pendant sa durée, puis une poussée vers la suivante (sauf
 * entre deux records, qui se remplacent directement, et vers ou depuis le média : la fenêtre
 * passe de l'un à l'autre d'un coup, sans bouger l'habillage FullDMD).
 */
export class LiveDmdProgram {
  private readonly starts: number[] = [];
  readonly cycle: number;

  constructor(readonly pages: DmdPage[]) {
    let t = 0;
    for (const [i, page] of pages.entries()) {
      this.starts.push(t);
      t += page.hold + (this.blends(i) ? LIVE_DMD_TIMING.transition : 0);
    }
    this.cycle = t;
  }

  /** Une poussée suit la page i : deux pages de points (pas deux records, pas le média), et plus d'une page. */
  private blends(i: number): boolean {
    const page = this.pages[i]!;
    const next = this.pages[(i + 1) % this.pages.length]!;
    return this.pages.length > 1 && !page.media && !next.media && !(page.id === 'records' && next.id === 'records');
  }

  at(elapsed: number): LiveDmdShot {
    if (!this.pages.length) return { page: 'brand', index: 0, media: false, dots: blankDots(), moving: false };
    const t = ((elapsed % this.cycle) + this.cycle) % this.cycle;
    let i = this.starts.length - 1;
    while (i > 0 && this.starts[i]! > t) i--;
    const page = this.pages[i]!;
    const local = t - this.starts[i]!;
    if (local < page.hold) {
      if (page.media) return { page: page.id, index: i, media: true, moving: false };
      return { page: page.id, index: i, media: false, dots: page.dots(local), moving: Boolean(page.animated) };
    }
    const next = this.pages[(i + 1) % this.pages.length]!;
    const k = (local - page.hold) / LIVE_DMD_TIMING.transition;
    return { page: page.id, index: i, media: false, dots: transitionDots(page.dots(page.hold), next.dots(0), k), moving: true };
  }

  /** Début de la page `index` dans le cycle, en ms. */
  startOf(index: number): number {
    return this.starts[index] ?? 0;
  }
}

// ---------------------------------------------------------------------------
// Place des points sur l'écran du DMD

/** Retrait des points dans le cadre d'un FullDMD, en part de sa hauteur : un point de l'afficheur (32 lignes, plus une de chaque côté). */
const FRAME_INSET = 1 / 34;

/**
 * Où dessiner les points, en fractions de la zone du DMD (taille `zone`, en pixels ou en
 * proportions). FullDMD dont le média a un cadre (fulldmdframe.ts) : dans ce cadre, là où VPX
 * posera son DMD en partie, le média montré entier et centré comme au menu. Sinon (DMD seul,
 * FullDMD sans média ou sans cadre) : une bande 4:1 sur toute la largeur, centrée.
 */
export function liveDmdArea(record: FrameRecord | undefined, zone: { width: number; height: number } = { width: 16, height: 9 }): FrameRect {
  const frame = record?.frame;
  if (frame && record.width > 0 && record.height > 0) {
    const r = frameWindow({ x: 0, y: 0, width: zone.width, height: zone.height }, record, frame);
    const inset = r.height * FRAME_INSET;
    return { x: (r.x + inset) / zone.width, y: (r.y + inset) / zone.height, width: (r.width - 2 * inset) / zone.width, height: (r.height - 2 * inset) / zone.height };
  }
  const band = centeredDmdBand(zone);
  return { x: band.x, y: band.y, width: band.width, height: band.height };
}

// ---------------------------------------------------------------------------
// Animations à la demande (API : app/src/live-dmd.ts, LiveDmd.play)

export interface DmdAnimation {
  /** Durée en ms ; absente : en boucle jusqu'à ce qu'on l'arrête. */
  duration?: number;
  dots(elapsed: number): DmdDots;
}

export interface DmdAnimationOptions {
  /** Texte de l'animation, à la place du sien (passé par dmdText). */
  label?: string;
}

/** Rail du chargement : ligne, bouts, et largeur de la bille (4 × 2 points, posée dessus). */
const RAIL = 26;
const RAIL_FROM = 8;
const RAIL_TO = 119;
/** Un passage de la bille d'un bout à l'autre du rail, en ms. */
const RAIL_PASS = 1400;

/** Le mot en grand (petit s'il ne tient pas) et le rail en pointillés, sans la bille. */
function loadingBase(label: string): DmdDots {
  const large = textWidth(DMD_FONT_LARGE, label) <= DMD_USABLE;
  const base = blankDots();
  drawCentered(base, large ? DMD_FONT_LARGE : DMD_FONT_SMALL, large ? label : label.slice(0, 20), large ? 3 : 7);
  // Rail de x = 8 à 119 sur la ligne 26, nettement plus sombre que la bille.
  for (let x = RAIL_FROM; x <= RAIL_TO; x += 2) base[RAIL * DMD_WIDTH + x] = DMD_LEVEL.rail;
  return base;
}

/** La bille posée sur le rail en x0, et sa traînée de 4 points au plus, qui s'éteint derrière elle (dir : sens de la course). */
function drawBall(dots: DmdDots, x0: number, dir: -1 | 0 | 1): void {
  if (dir) {
    for (let trail = 1; trail <= 4; trail++) {
      const x = dir < 0 ? x0 + 3 + trail : x0 - trail;
      if (x >= 0 && x < DMD_WIDTH) dots[(RAIL - 1) * DMD_WIDTH + x] = Math.max(dots[(RAIL - 1) * DMD_WIDTH + x]!, DMD_LEVEL.secondary - 2 * trail);
    }
  }
  for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 4; dx++) if (x0 + dx >= 0) dots[(RAIL - 2 + dy) * DMD_WIDTH + x0 + dx] = DMD_LEVEL.accent;
}

/** La bille en aller-retour adouci sur le rail : elle ralentit aux bouts, comme sur un rail en pente ; à 0 ms, au bout gauche. */
function rollingBall(dots: DmdDots, elapsed: number): void {
  const phase = (elapsed % (2 * RAIL_PASS)) / (2 * RAIL_PASS);
  const k = 0.5 - 0.5 * Math.cos(phase * 2 * Math.PI);
  drawBall(dots, Math.round(RAIL_FROM + k * (RAIL_TO - RAIL_FROM - 3)), phase < 0.5 ? 1 : -1);
}

/** Chargement : le mot en grand, et une bille qui roule d'un bout à l'autre d'un rail en pointillés. */
function loadingAnimation(options: DmdAnimationOptions = {}): DmdAnimation {
  const base = loadingBase(dmdText(options.label ?? 'LOADING'));
  return {
    dots(elapsed) {
      const dots = base.slice();
      rollingBall(dots, elapsed);
      return dots;
    },
  };
}

/** Rayon du disque lumineux du passage, en points (9 de diamètre, revue de Codex du 26/10/2026). */
const PASS_RADIUS = 4.5;
/** Traînée sous le disque, point par point en s'éloignant de lui : 7, 4, 2, puis rien. */
const PASS_TRAIL = [7, 7, 6, 5, 4, 4, 3, 2, 2, 1];

/**
 * Disque lumineux qui traverse l'afficheur de bas en haut (`k` de 0 à 1 : centre de y = 36 à
 * y = −5, en x = 64), sa traînée dessous : le logo du jeu passe du plateau au fronton, à travers
 * le DMD. Cœur 14, couronne 9 puis 4 ; posé par-dessus le titre (le plus clair l'emporte).
 */
function drawPass(dots: DmdDots, k: number): void {
  const cx = DMD_WIDTH / 2;
  const cy = 36 - k * 41;
  for (let y = 0; y < DMD_HEIGHT; y++) {
    for (let x = 0; x < DMD_WIDTH; x++) {
      const dx = x + 0.5 - cx;
      const dy = y + 0.5 - cy;
      const d = Math.hypot(dx, dy) / PASS_RADIUS;
      let level = d <= 0.45 ? 14 : d <= 0.75 ? 9 : d <= 1 ? 4 : 0;
      // Traînée : dans l'axe, sur la largeur du cœur, qui s'éteint en dix points sous le disque.
      const behind = Math.floor(dy - PASS_RADIUS);
      if (behind >= 0 && behind < PASS_TRAIL.length && Math.abs(dx) <= 1.5) level = Math.max(level, PASS_TRAIL[behind]!);
      if (level > 0) dots[y * DMD_WIDTH + x] = Math.max(dots[y * DMD_WIDTH + x]!, level);
    }
  }
}

/** Éclat local à la sortie du disque, en haut de l'afficheur : quelques points, cœur 15 puis 8. */
function drawFlash(dots: DmdDots): void {
  for (let y = 0; y < 3; y++) {
    for (let x = 61; x < 67; x++) {
      const d = Math.hypot(x + 0.5 - DMD_WIDTH / 2, y + 0.5);
      const level = d <= 1.5 ? DMD_LEVEL.accent : d <= 2.6 ? 8 : 0;
      if (level) dots[y * DMD_WIDTH + x] = Math.max(dots[y * DMD_WIDTH + x]!, level);
    }
  }
}

/** Tremblement de la bille au lanceur, un pas toutes les 100 ms, avec des retours au centre. */
const PLUNGER_SHAKE = [0, -1, 0, 1];

/**
 * Lancement en cinéma (cinema.ts, CINEMA_TIMELINE) : le titre et la bille au bout du rail ; à
 * l'armement du logo, elle tremble d'un point, comme sur le lanceur ; quand le logo a quitté le
 * plateau, un disque lumineux traverse l'afficheur de bas en haut, un éclat local à sa sortie ;
 * puis la bille roule depuis le même bout (le chargement). Tourne jusqu'à ce qu'on l'arrête :
 * VPX prend l'afficheur, la séquence s'arrête où elle en est.
 */
function launchAnimation(options: DmdAnimationOptions = {}): DmdAnimation {
  const base = loadingBase(dmdText(options.label ?? 'LOADING'));
  const { arm, dmdPass, dmdPassLength, dmdFlash } = CINEMA_TIMELINE;
  const flash = dmdPass + dmdPassLength;
  const rolling = flash + dmdFlash;
  return {
    dots(elapsed) {
      const dots = base.slice();
      if (elapsed >= rolling) {
        rollingBall(dots, elapsed - rolling);
        return dots;
      }
      const shake = elapsed >= arm && elapsed < flash ? PLUNGER_SHAKE[Math.floor((elapsed - arm) / 100) % PLUNGER_SHAKE.length]! : 0;
      drawBall(dots, RAIL_FROM + shake, 0);
      if (elapsed >= dmdPass && elapsed < flash) drawPass(dots, (elapsed - dmdPass) / dmdPassLength);
      else if (elapsed >= flash) drawFlash(dots);
      return dots;
    },
  };
}

/** Animations qu'on peut jouer sur le DMD du menu, par leur nom. */
export const DMD_ANIMATIONS = {
  chargement: loadingAnimation,
  lancement: launchAnimation,
} satisfies Record<string, (options?: DmdAnimationOptions) => DmdAnimation>;

export type DmdAnimationName = keyof typeof DMD_ANIMATIONS;

export function dmdAnimation(name: DmdAnimationName, options?: DmdAnimationOptions): DmdAnimation {
  return DMD_ANIMATIONS[name](options);
}

/** Les deux images sont les mêmes (rien à renvoyer à la fenêtre). */
export function sameDots(a: DmdDots | undefined, b: DmdDots | undefined): boolean {
  if (!a || !b || a.length !== b.length) return a === b;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
