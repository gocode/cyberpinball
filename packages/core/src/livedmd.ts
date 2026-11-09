// DMD du menu vivant : pendant la navigation, Cyber Pinball dessine lui-même l'afficheur à
// points, en 128 × 32 comme les vrais DMD, et y fait tourner ce qu'une machine montre en
// attente : le titre de la table choisie, ses records (highscores.ts, rien d'inventé),
// « PRESS START », l'horloge, « CREDITS ». Les points ne laissent jamais la place au média DMD
// de la table : il se voit autour d'eux (cadre du FullDMD), ou seul en DMD « classique ».
// Depuis le 09/11/2026 (dmdscenes.ts) : le détail de la wheel à l'arrivée sur une table, une
// transition propre à chaque page d'arrivée, et une scène de jeu un cycle sur deux.
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
import type { WheelDetail } from './dmdscenes';

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

/** Pages de l'alternance ; « wheel » : le détail de la wheel à l'arrivée sur une table, « interlude » : une scène de jeu (dmdscenes.ts). */
export type DmdPageId = 'title' | 'records' | 'press-start' | 'clock' | 'credits' | 'brand' | 'wheel' | 'interlude';

export interface DmdPage {
  id: DmdPageId;
  /** Durée de la page, en ms. */
  hold: number;
  /** Image à `elapsed` ms du début de la page. */
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
  /** Heure de l'horloge ; maintenant par défaut (les essais la fixent). */
  now?: () => Date;
  /** Wheel de la table en points (dmdscenes.ts, wheelDetail) : son détail joue une fois à l'arrivée. */
  wheel?: WheelDetail;
}

/**
 * Durées de l'alternance, en ms : environ 22 s pour une table à 4 records. Valeurs du directeur
 * artistique (26/10/2026) : l'invitation à jouer suit le titre, le cycle reste court pour un menu
 * qu'on parcourt. Plus de page du média depuis le 09/11/2026 : les points ne disparaissent plus.
 */
export const LIVE_DMD_TIMING = {
  title: 4800,
  pressStart: 2400,
  record: 2400,
  clock: 3000,
  credits: 1800,
  brand: 4000,
  /** Poussée vers le haut entre deux pages de points (32 lignes, à vitesse constante). */
  transition: 160,
  /** Glissement latéral d'une table à l'autre, sur la roue. */
  slide: 240,
  /** Volet lumineux, vers les records ; dissolution, vers l'horloge et les crédits. */
  wipe: 320,
  dissolve: 320,
  /** Allumage du détail de la wheel, point par point, par-dessus le titre. */
  light: 400,
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

/**
 * L'alternance d'une table : titre, PRESS START, records, horloge, crédits ; sans records, leur
 * page est sautée. Sans table : la marque, PRESS START, l'horloge. Jamais de page du média DMD :
 * les points restent affichés (le média se voit autour, ou seul en DMD « classique »).
 */
export function liveDmdPages(input: LiveDmdInput | undefined): DmdPage[] {
  if (!input?.title) return [brandPage(), pressStartPage(), clockPage(input?.now)];
  return [
    titlePage(input),
    pressStartPage(),
    ...recordPages(input.records),
    clockPage(input.now),
    creditsPage(input.records?.credits),
  ];
}

// ---------------------------------------------------------------------------
// Programme : les pages à la suite, en boucle, avec leurs transitions

/** Ce que montre le DMD à un instant. */
export interface LiveDmdShot {
  page: DmdPageId;
  /** Index de la page dans le programme. */
  index: number;
  dots: DmdDots;
  /** L'image change d'elle-même (défilement, transition, clignotement) : la recalculer à la trame suivante. */
  moving: boolean;
}

/** Hachage entier figé d'un point (jamais de fract(sin), qui varie selon la machine) : [0, 1). */
export function dotHash(x: number, y: number, seed = 0): number {
  let h = Math.imul(x + 374761393, 668265263) ^ Math.imul(y + 2246822519, 3266489917) ^ Math.imul(seed + 1, 2654435761);
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
}

/** Courbe douce, de 0 à 1. */
export function easeDots(k: number): number {
  const c = Math.min(1, Math.max(0, k));
  return c * c * (3 - 2 * c);
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
 * Les transitions du DMD (revue du directeur artistique du 09/11/2026), chacune liée à ce
 * qu'elle annonce, jamais tirée au hasard : la poussée pour l'alternance courante, le glissement
 * d'une table à l'autre, le volet vers les records, la dissolution vers l'horloge et les crédits,
 * l'allumage vers le détail de la wheel. k va de 0 (l'ancienne image) à 1 (la nouvelle).
 */
export const DMD_TRANSITIONS = {
  push: transitionDots,
  /** L'ancienne part à gauche (dir 1) ou à droite (dir −1), la nouvelle la suit, en douceur. */
  slide(from: DmdDots, to: DmdDots, k: number, dir: 1 | -1 = 1): DmdDots {
    const out = blankDots();
    const shift = Math.round(easeDots(k) * DMD_WIDTH);
    for (let y = 0; y < DMD_HEIGHT; y++) {
      for (let x = 0; x < DMD_WIDTH; x++) {
        const sx = dir === 1 ? x + shift : x - shift;
        out[y * DMD_WIDTH + x] = sx >= 0 && sx < DMD_WIDTH ? from[y * DMD_WIDTH + sx]! : to[y * DMD_WIDTH + (dir === 1 ? sx - DMD_WIDTH : sx + DMD_WIDTH)]!;
      }
    }
    return out;
  },
  /** Un front lumineux de gauche à droite : 2 colonnes au plein éclat, 2 à 7 derrière ; la nouvelle image derrière lui. */
  wipe(from: DmdDots, to: DmdDots, k: number): DmdDots {
    const out = blankDots();
    const edge = k * (DMD_WIDTH + 6);
    for (let y = 0; y < DMD_HEIGHT; y++) {
      for (let x = 0; x < DMD_WIDTH; x++) {
        const i = y * DMD_WIDTH + x;
        const gap = edge - x;
        out[i] = gap > 0 ? to[i]! : from[i]!;
        if (gap > -1 && gap < 3) out[i] = Math.max(out[i]!, gap < 1 ? 15 : 7);
      }
    }
    return out;
  },
  /** Chaque point passe à la nouvelle image à son heure, tirée d'un hachage figé. */
  dissolve(from: DmdDots, to: DmdDots, k: number): DmdDots {
    const out = blankDots();
    for (let i = 0; i < out.length; i++) out[i] = dotHash(i % DMD_WIDTH, Math.floor(i / DMD_WIDTH), 3) < k ? to[i]! : from[i]!;
    return out;
  },
  /** Allumage : chaque point passe à la nouvelle image à son heure, allumé d'abord au plein éclat (120 ms sur 400). */
  light(from: DmdDots, to: DmdDots, k: number): DmdDots {
    const out = blankDots();
    for (let i = 0; i < out.length; i++) {
      const on = dotHash(i % DMD_WIDTH, Math.floor(i / DMD_WIDTH), 7) * 0.7;
      out[i] = k < on ? from[i]! : to[i] && k < on + 0.3 ? 15 : to[i]!;
    }
    return out;
  },
} satisfies Record<string, (from: DmdDots, to: DmdDots, k: number) => DmdDots>;

export type DmdTransitionName = keyof typeof DMD_TRANSITIONS;

/** Durée de chaque transition, en ms (des multiples de 40 : une image du DMD). */
export const DMD_TRANSITION_MS: Record<DmdTransitionName, number> = {
  push: LIVE_DMD_TIMING.transition,
  slide: LIVE_DMD_TIMING.slide,
  wipe: LIVE_DMD_TIMING.wipe,
  dissolve: LIVE_DMD_TIMING.dissolve,
  light: LIVE_DMD_TIMING.light,
};

/**
 * Transition d'une page à la suivante, selon la page d'arrivée : le volet vers les records, la
 * dissolution vers l'horloge et les crédits, l'allumage vers la wheel, la poussée ailleurs.
 * Aucune entre deux records, qui se remplacent directement.
 */
export function transitionTo(from: DmdPageId, to: DmdPageId): DmdTransitionName | undefined {
  if (from === 'records' && to === 'records') return undefined;
  if (to === 'records') return 'wipe';
  if (to === 'clock' || to === 'credits') return 'dissolve';
  if (to === 'wheel') return 'light';
  return 'push';
}

/** Une page du programme, à sa place. */
interface Slot {
  page: DmdPage;
  start: number;
  /** Index dans `pages`, −1 pour l'ouverture. */
  index: number;
  /** Durée montrée (la première page de l'ouverture est coupée à `after`). */
  hold: number;
  /** Transition vers la page suivante (aucune : elle la remplace directement). */
  transition?: DmdTransitionName;
  next: DmdPage;
}

/** Ouverture d'un programme : une page jouée une fois, au bout de `after` ms sur la première. */
export interface LiveDmdIntro {
  page: DmdPage;
  after: number;
}

/**
 * Programme en boucle : chaque page pendant sa durée, puis la transition qu'appelle la suivante
 * (transitionTo). Avec une ouverture (le détail de la wheel), la première page est montrée
 * `after` ms, l'ouverture s'allume par-dessus, puis la boucle part du début.
 */
export class LiveDmdProgram {
  private readonly loop: Slot[] = [];
  private readonly opening: Slot[] = [];
  /** Durée de l'ouverture, en ms (0 : aucune). */
  readonly openingLength: number;
  /** Durée de la boucle, en ms. */
  readonly cycle: number;

  constructor(
    readonly pages: DmdPage[],
    intro?: LiveDmdIntro,
  ) {
    let t = 0;
    for (const [i, page] of pages.entries()) {
      const next = pages[(i + 1) % pages.length]!;
      const transition = pages.length > 1 ? transitionTo(page.id, next.id) : undefined;
      this.loop.push({ page, start: t, index: i, hold: page.hold, transition, next });
      t += page.hold + (transition ? DMD_TRANSITION_MS[transition] : 0);
    }
    this.cycle = t;
    let o = 0;
    if (intro && pages.length) {
      const first = pages[0]!;
      const into = transitionTo(first.id, intro.page.id)!;
      this.opening.push({ page: first, start: 0, index: 0, hold: intro.after, transition: into, next: intro.page });
      o = intro.after + DMD_TRANSITION_MS[into];
      const back = transitionTo(intro.page.id, first.id)!;
      this.opening.push({ page: intro.page, start: o, index: -1, hold: intro.page.hold, transition: back, next: first });
      o += intro.page.hold + DMD_TRANSITION_MS[back];
    }
    this.openingLength = o;
  }

  at(elapsed: number): LiveDmdShot {
    if (!this.pages.length) return { page: 'brand', index: 0, dots: blankDots(), moving: false };
    let slots = this.opening;
    let t = Math.max(0, elapsed);
    if (t >= this.openingLength) {
      slots = this.loop;
      t = (t - this.openingLength) % this.cycle;
    }
    let i = slots.length - 1;
    while (i > 0 && slots[i]!.start > t) i--;
    const slot = slots[i]!;
    const local = t - slot.start;
    if (local < slot.hold || !slot.transition) return { page: slot.page.id, index: slot.index, dots: slot.page.dots(local), moving: Boolean(slot.page.animated) };
    const k = (local - slot.hold) / DMD_TRANSITION_MS[slot.transition];
    return { page: slot.page.id, index: slot.index, dots: DMD_TRANSITIONS[slot.transition](slot.page.dots(slot.hold), slot.next.dots(0), k), moving: true };
  }

  /** Début de la page `index` dans la boucle (après l'ouverture), en ms. */
  startOf(index: number): number {
    return this.loop[index]?.start ?? 0;
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

/** Rayon du disque lumineux du passage, en points (9 de diamètre). */
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
