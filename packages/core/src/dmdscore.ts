// Le DMD de la table montre-t-il son écran de score ? (essai réel du 31/10/2026 : les scores des
// amis posés sur le DMD « par moment c'est gênant pendant le jeu » ; ils ne doivent s'y poser que
// quand il affiche des scores, jamais pendant une animation, un mode, une vidéo, ni la saisie des
// initiales ou la fin de la partie.)
//
// Les images viennent de l'inspector de VPX (app/src/dmd-watch.ts : /ws/display, une image par
// changement), les signaux de la partie du relevé (livestate.ts). Mesuré hors écran sur les ROM de
// la borne par la libpinmame (tmp\banc-dmd, 31/10 et 04/11/2026) :
// - l'écran de score revient sans cesse : Terminator 2 (WPC) le montre ~1 s, fait glisser son score
//   (~0,5 s d'images toutes différentes), puis le remontre ; Star Trek (SAM) montre en jeu une scène
//   animée (l'Enterprise, les étoiles) avec le score en coin, qui ne change que de quelques pour cent
//   d'une image à l'autre à ses moments calmes ;
// - bille en jeu, l'écran de score change à chaque coup : ses chiffres, de 15 à 40 % de ses points
//   d'un écran stable au suivant (T2, un coup toutes les 0,4 à 2,5 s) ; une animation, un BONUS, un
//   texte de mode en changent de 50 à 160 % ;
// - la fin de partie (game_over, avant les initiales) et l'attente ont aussi des images calmes :
//   c'est la partie en cours, dite par le relevé, qui les écarte.
// La première règle (31/10) voulait en plus le score immobile depuis 3 s : en jeu actif, cela
// n'arrive presque jamais (essai du 04/11/2026 sur le PinCab : « Scores sur le DMD » activé, aucun
// passage de toute la partie ; au banc, T2 joué : 0 passage en 170 s, « score qui bouge » 81 % du
// temps). D'où la règle d'aujourd'hui :
// - un « écran » : des images stables (400 ms au moins, à 8 % près l'une de l'autre), reliées par des
//   transitions d'une seconde au plus (le glissement de T2) et qui ne changent pas de plus de 45 % de
//   leurs points d'un écran stable au suivant (les chiffres du score) ;
// - c'est l'écran de score quand le score a bougé pendant qu'il était là (il le montre), ou quand il
//   ressemble (à 45 % près) à un écran de score reconnu dans les deux dernières minutes (celui qui
//   revient après une animation, ses chiffres changés) ; sans score lu (table sans relevé du score),
//   quand il reste 3,5 s ;
// - un texte de mode, un choix à faire (bille retenue, score figé), le BONUS ne sont rien de tout
//   cela : jamais vus pendant que le score bouge, ni semblables à l'écran de score ;
// - il faut encore qu'il soit calme depuis 1,5 s : un instant reconnu à tort (Star Trek : une seconde
//   d'une animation presque immobile) ne suffit pas.

/** Une image du DMD : `width` × `height` nuances (0 : éteint), ligne par ligne. */
export interface DmdFrame {
  width: number;
  height: number;
  dots: Uint8Array;
}

/** Ce que le relevé dit de la partie (livestate.ts). */
export interface DmdGameSignals {
  /** Une partie en cours (pas l'attente, pas la fin de partie ni la saisie des initiales). */
  inGame: boolean;
  /** Score du joueur en cours. */
  score?: number;
}

export const DMD_SCORE_RULE = {
  /**
   * Deux images sont la même à ce nombre de points près, en part de leur encre (les points allumés,
   * ou les éteints sur une image presque toute allumée), 4 au moins : le fond animé de Star Trek
   * change de 2 à 5 % d'une image à l'autre, une animation de bien plus.
   */
  tolerance: 0.08,
  /** Un changement d'image, pour aller avec le score : plus de cette part de l'encre. */
  change: 0.015,
  /**
   * Une image (à `tolerance` près) restée au moins ce temps est stable ; plus brève, c'est une
   * transition : le score de T2 s'arrête parfois 0,2 s au milieu de son glissement (banc), ses écrans
   * de score restent 0,9 s et plus.
   */
  stableMs: 400,
  /** Transition la plus longue entre deux images stables d'un même écran (le score de T2 qui glisse : ~0,6 s). */
  gapMs: 1000,
  /** D'un écran stable au suivant, un même écran ne change pas de plus (les chiffres du score : 15 à 40 % au banc). */
  layout: 0.45,
  /** Part des blocs de 8 × 8 points d'encre communs à un écran de score reconnu (mise en page) pour lui ressembler. */
  blocks: 0.7,
  /** Un changement de score et un changement d'image vont ensemble à ce temps près (le relevé a jusqu'à une seconde de retard). */
  scoreLagMs: 1200,
  /** Un écran de score reconnu sert de modèle ce temps. */
  lookMs: 120_000,
  /** Au repos : le score immobile depuis… */
  stillMs: 3000,
  /** …et un écran resté ce temps (un écran de score fixe, pas un texte de mode d'une ou deux secondes). */
  steadyMs: 3500,
  /** L'écran de score, calme depuis… */
  calmMs: 1500,
} as const;

interface Sample {
  at: number;
  bits: Uint32Array;
  lit: number;
  /** Points de l'image. */
  dots: number;
  /** Mise en page grossière : les blocs de 8 × 8 points qui ont de l'encre (BLOCK_INK au moins). */
  blocks: Uint8Array;
}

/** Côté d'un bloc de la mise en page, et points allumés qui le font compter. */
const BLOCK = 8;
const BLOCK_INK = 3;

/** Les blocs de 8 × 8 points d'une image qui ont de l'encre. */
function dmdBlocks(bits: Uint32Array, width: number, height: number): Uint8Array {
  const bw = Math.ceil(width / BLOCK);
  const count = new Uint16Array(bw * Math.ceil(height / BLOCK));
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const i = y * width + x;
      if (bits[i >>> 5]! & (1 << (i & 31))) count[Math.floor(y / BLOCK) * bw + Math.floor(x / BLOCK)]!++;
    }
  return Uint8Array.from(count, (c) => (c >= BLOCK_INK ? 1 : 0));
}

/** Points allumés d'une image : au-dessus de 30 % de son point le plus clair (un DMD à nuances garde ses ombres hors du compte). */
export function dmdBits(frame: DmdFrame): { bits: Uint32Array; lit: number } {
  const n = frame.width * frame.height;
  let peak = 0;
  for (let i = 0; i < n; i++) if (frame.dots[i]! > peak) peak = frame.dots[i]!;
  const on = Math.max(1, Math.round(peak * 0.3));
  const bits = new Uint32Array(Math.ceil(n / 32));
  let lit = 0;
  for (let i = 0; i < n; i++) {
    if (frame.dots[i]! >= on && peak > 0) {
      bits[i >>> 5]! |= 1 << (i & 31);
      lit++;
    }
  }
  return { bits, lit };
}

function popcount(v: number): number {
  v -= (v >>> 1) & 0x55555555;
  v = (v & 0x33333333) + ((v >>> 2) & 0x33333333);
  return (((v + (v >>> 4)) & 0x0f0f0f0f) * 0x01010101) >>> 24;
}

/** Points qui diffèrent entre deux images, et leur encre (points allumés, ou éteints sur une image presque toute allumée). */
function difference(a: Sample, b: Sample): { diff: number; ink: number } {
  if (a.bits.length !== b.bits.length) return { diff: Infinity, ink: 1 };
  let diff = 0;
  for (let i = 0; i < a.bits.length; i++) diff += popcount((a.bits[i]! ^ b.bits[i]!) >>> 0);
  return { diff, ink: Math.max(1, Math.min(Math.max(a.lit, b.lit), a.dots - Math.min(a.lit, b.lit))) };
}

function near(a: Sample, b: Sample): boolean {
  const { diff, ink } = difference(a, b);
  return diff <= Math.max(4, DMD_SCORE_RULE.tolerance * ink);
}

/** Même mise en page : les chiffres du score ont pu changer, pas tout l'écran. */
function alike(a: Sample, b: Sample): boolean {
  const { diff, ink } = difference(a, b);
  return diff <= Math.max(4, DMD_SCORE_RULE.layout * ink);
}

/**
 * Même mise en page qu'un écran de score reconnu : ses blocs d'encre presque les mêmes (le score a
 * pu gagner ou perdre des chiffres : de 9 090 à 154 140, T2 en change bien plus de 45 % de ses points).
 */
function sameLayout(a: Sample, b: Sample): boolean {
  if (a.blocks.length !== b.blocks.length) return false;
  let both = 0;
  let either = 0;
  for (let i = 0; i < a.blocks.length; i++) {
    both += a.blocks[i]! & b.blocks[i]!;
    either += a.blocks[i]! | b.blocks[i]!;
  }
  // Une image presque toute allumée (une scène, une vidéo) a de l'encre partout : ses blocs ne disent rien.
  if (either > 0.8 * a.blocks.length) return false;
  // Et à peu près autant d'encre (un texte plein n'est pas un score).
  if (Math.abs(a.lit - b.lit) > 0.5 * Math.max(a.lit, b.lit)) return false;
  return either > 0 && both / either >= DMD_SCORE_RULE.blocks;
}

/** Ce que la règle a vu, pour le journal et les essais. */
export interface DmdScoreVerdict {
  scoreScreen: boolean;
  /** Pourquoi non, sinon « écran de score ». */
  why: string;
  /** Depuis combien de temps l'écran du moment est là (ms). */
  screenMs: number;
  /** Images stables de l'écran du moment. */
  runs: number;
}

/** Une image, à `tolerance` près, et depuis quand. */
interface Plateau {
  start: number;
  first: Sample;
  last: Sample;
  stable: boolean;
}

/** Un écran : des images stables reliées par des transitions brèves, à `layout` près. */
interface Screen {
  start: number;
  /** Fin de sa dernière image stable (ou maintenant, si elle est à l'écran). */
  end: number;
  /** Sa dernière image stable. */
  look: Sample;
  runs: number;
  /** Son image a changé avec le score : c'est l'écran de score. */
  scored: boolean;
}

/** Suit le DMD d'une table pendant la partie : `frame` à chaque image, `game` à chaque relevé, `verdict` quand il faut décider. */
export class DmdScoreWatch {
  private plateau?: Plateau;
  private screen?: Screen;
  private firstAt?: number;
  /** Écrans de score reconnus en jeu : leur dernière image, et quand. */
  private looks: { look: Sample; at: number }[] = [];
  private signals: DmdGameSignals = { inGame: false };
  private scoreKnown = false;
  /** Dernier changement du score (ou de la partie), et les changements récents. */
  private scoreAt = 0;
  private movedAt = -Infinity;
  /** Le dernier changement d'image dans l'écran stable, sans changer sa mise en page (DMD_SCORE_RULE.change). */
  private changedAt = -Infinity;

  frame(frame: DmdFrame, at: number): void {
    const { bits, lit } = dmdBits(frame);
    const sample: Sample = { at, bits, lit, dots: frame.width * frame.height, blocks: dmdBlocks(bits, frame.width, frame.height) };
    this.firstAt ??= at;
    const p = this.plateau;
    this.settle(at);
    // Un changement : plus de 1,5 % de l'encre (quelques points qui clignotent sur un texte fixe n'en sont pas ;
    // les étoiles de Star Trek, de 2 à 5 %, ou les chiffres d'un score, si).
    // Seulement dans l'écran déjà stable, sans en changer la mise en page (pas son apparition ni son départ).
    const change = p ? difference(p.last, sample) : undefined;
    const s = this.screen;
    if (p?.stable && s && at - s.start >= DMD_SCORE_RULE.stableMs && change && change.diff > Math.max(4, DMD_SCORE_RULE.change * change.ink) && change.diff <= DMD_SCORE_RULE.layout * change.ink) {
      // L'image change pendant que l'écran est là, et le score vient de bouger : il montre le score.
      if (at - this.movedAt <= DMD_SCORE_RULE.scoreLagMs) this.recognize(s, at);
      this.changedAt = at;
    }
    // Une image identique (ou presque) à la précédente : la même, qui dure (l'inspector n'envoie que les changements).
    if (p && near(p.last, sample)) {
      p.last = sample;
      return;
    }
    // L'image d'avant s'en va : son écran s'arrête là.
    if (p?.stable && this.screen) this.screen.end = at;
    this.plateau = { start: at, first: sample, last: sample, stable: false };
  }

  game(signals: DmdGameSignals, at: number): void {
    if (signals.score !== undefined) this.scoreKnown = true;
    const changed = signals.score !== this.signals.score || signals.inGame !== this.signals.inGame;
    const moved = signals.inGame && this.signals.inGame && signals.score !== this.signals.score;
    this.signals = signals;
    if (changed) this.scoreAt = at;
    if (!moved) return;
    this.settle(at);
    this.movedAt = at;
    // Le score bouge, et l'image de l'écran vient de changer (le relevé a du retard), après son apparition :
    // c'est l'écran de score. Un texte qui paraît sur le coup (et ne change plus) n'en est pas un.
    const s = this.screen;
    if (s && this.plateau?.stable && this.changedAt > s.start && at - this.changedAt <= DMD_SCORE_RULE.scoreLagMs) this.recognize(s, at);
  }

  private recognize(s: Screen, at: number): void {
    s.scored = true;
    this.remember(s.look, at);
  }

  private remember(look: Sample, at: number): void {
    this.looks = [...this.looks.filter((l) => at - l.at <= DMD_SCORE_RULE.lookMs && !near(l.look, look)), { look, at }].slice(-6);
  }

  /** Il ressemble à un écran de score reconnu en jeu. */
  private known(look: Sample, at: number): boolean {
    return this.looks.some((l) => at - l.at <= DMD_SCORE_RULE.lookMs && (alike(l.look, look) || sameLayout(l.look, look)));
  }

  /** L'image du moment devient stable : elle rejoint l'écran d'avant, ou en commence un. */
  private settle(now: number): void {
    const p = this.plateau;
    if (!p) return;
    if (!p.stable && now - p.start >= DMD_SCORE_RULE.stableMs) {
      p.stable = true;
      const s = this.screen;
      if (s && p.start - s.end <= DMD_SCORE_RULE.gapMs && alike(s.look, p.first)) {
        s.runs++;
      } else {
        this.screen = { start: p.start, end: now, look: p.first, runs: 1, scored: this.known(p.first, now) };
      }
    }
    if (p.stable && this.screen) {
      this.screen.end = now;
      this.screen.look = p.last;
      if (this.screen.scored) this.remember(p.last, now);
    }
  }

  verdict(at: number): DmdScoreVerdict {
    this.settle(at);
    const s = this.screen;
    const no = (why: string): DmdScoreVerdict => ({ scoreScreen: false, why, screenMs: s ? at - s.start : 0, runs: s?.runs ?? 0 });
    if (!this.signals.inGame) return no('pas de partie en cours'); // i18n-ignore : raison pour le journal et les essais
    if (this.firstAt === undefined || at - this.firstAt < 1000 || !this.plateau) return no('pas assez d’images du DMD'); // i18n-ignore : raison pour le journal et les essais
    // L'image du moment : stable et de l'écran, ou une transition brève depuis sa dernière image stable.
    if (!s || (!this.plateau.stable && at - s.end > DMD_SCORE_RULE.gapMs)) return no('animation'); // i18n-ignore : raison pour le journal et les essais
    const lasted = at - s.start;
    // Au repos (le score immobile) : un écran qui revient, ou reste, comme l'écran de score de T2 entre deux
    // coups ; une fois l'écran de score vu en jeu, il doit lui ressembler (un choix à faire, un texte, non).
    const still = !this.scoreKnown || at - this.scoreAt >= DMD_SCORE_RULE.stillMs;
    const rest = still && ((s.runs >= 2 && lasted >= DMD_SCORE_RULE.stillMs) || lasted >= DMD_SCORE_RULE.steadyMs) && (!this.looks.length || this.known(s.look, at));
    if (!s.scored && !rest) return no('autre écran (animation, texte, choix à faire)'); // i18n-ignore : raison pour le journal et les essais
    if (lasted < DMD_SCORE_RULE.calmMs) return no('écran de score à peine revenu'); // i18n-ignore : raison pour le journal et les essais
    return { scoreScreen: true, why: 'écran de score', screenMs: lasted, runs: s.runs }; // i18n-ignore : raison pour le journal et les essais
  }
}

/**
 * Le DMD d'une table sans PinMAME (FlexDMD, dessiné par son script) : l'inspector ne lit jamais son
 * image (inspectorDisplayReadable, arrêt de VPX du 04/11/2026 sur The Goonies). Sans image, le rythme
 * de la partie d'après le relevé seul, sur des conditions sûres : une partie en cours (jamais l'attente,
 * la fin de partie ni la saisie des initiales) depuis 5 s, et la bille en jeu, le score bougé depuis
 * moins de 8 s (bille retenue, choix à faire, plus rien). Une animation ne se voit pas : elle peut être
 * couverte le temps d'un passage.
 */
export const DMD_SIGNAL_RULE = { startedMs: 5000, movedMs: 8000 } as const;

export class DmdSignalWatch {
  private signals: DmdGameSignals = { inGame: false };
  private since?: number;
  private movedAt?: number;

  game(signals: DmdGameSignals, at: number): void {
    if (signals.inGame && !this.signals.inGame) this.since = at;
    if (!signals.inGame) this.since = undefined;
    if (signals.inGame && this.signals.inGame && signals.score !== this.signals.score) this.movedAt = at;
    this.signals = signals;
  }

  verdict(at: number): DmdScoreVerdict {
    const no = (why: string): DmdScoreVerdict => ({ scoreScreen: false, why, screenMs: 0, runs: 0 });
    if (!this.signals.inGame || this.since === undefined) return no('pas de partie en cours'); // i18n-ignore : raison pour le journal et les essais
    if (at - this.since < DMD_SIGNAL_RULE.startedMs) return no('partie à peine commencée (DMD sans image)'); // i18n-ignore : raison pour le journal et les essais
    if (this.movedAt === undefined || at - this.movedAt > DMD_SIGNAL_RULE.movedMs) return no('score figé : bille retenue ou choix à faire (DMD sans image)'); // i18n-ignore : raison pour le journal et les essais
    return { scoreScreen: true, why: 'bille en jeu (DMD sans image)', screenMs: at - this.movedAt, runs: 0 }; // i18n-ignore : raison pour le journal et les essais
  }
}

/** Un afficheur de l'inspector de VPX (/api/tree) : `mapping` ouvre son flux (/ws/display?id=). */
export interface InspectorDisplay {
  mapping: string;
  name: string;
  width: number;
  height: number;
  /** Le module qui le dessine (PinMAME, FlexDMD…). */
  controller: string;
}

/**
 * Un afficheur que l'inspector peut lire sans risque pendant la partie : celui de PinMAME, dont
 * l'image est déjà calculée par l'émulation (bloc d'état partagé). Jamais un afficheur dessiné à
 * la demande : FlexDMD (et UltraDMD, qui passe par lui) rend toute sa scène à chaque image demandée
 * (FlexDMDPlugin.cpp, GetRenderFrame → FlexDMD::Render → Stage Update et Draw), et le serveur de
 * l'inspector la demande depuis son propre fil toutes les 10 ms (WebServer.cpp, PushDisplayWsFrames),
 * pendant que le script de la table modifie la même scène sur le sien, sans verrou
 * (LockRenderThread n'est qu'un compteur). Essai réel du 04/11/2026 sur The Goonies : la scène
 * abîmée (« Actor Ball not found in children of »), l'erreur du script ligne 9781, puis VPX fermé
 * sur une corruption du tas (0xC0000374). Commit af26b2d93 de VPX 10.8.1.
 */
export function inspectorDisplayReadable(controller: string): boolean {
  return /^pinmame$/i.test(controller.trim());
}

/**
 * Le DMD parmi les afficheurs de l'inspector : le plus grand d'au moins 64 points de large (un
 * afficheur à segments n'en est pas un), comme displays.html de l'inspector les lit dans l'arbre.
 * Seulement parmi ceux qui se lisent sans risque (inspectorDisplayReadable) ; `refused` reçoit les
 * autres, pour le journal.
 */
export function chooseDmdDisplay(tree: unknown, refused?: InspectorDisplay[]): InspectorDisplay | undefined {
  const found: InspectorDisplay[] = [];
  const list = (v: unknown): Record<string, unknown>[] => (Array.isArray(v) ? v.filter((x): x is Record<string, unknown> => !!x && typeof x === 'object') : []);
  for (const controller of list(tree)) {
    for (const category of list(controller.children)) {
      if (category.type !== 'category') continue;
      for (const item of list(category.children)) {
        if (item.type !== 'display' || item.mapping === undefined) continue;
        const name = String(item.name ?? '');
        const size = /(\d+)x(\d+)/.exec(name);
        const width = size ? Number(size[1]) : 0;
        const height = size ? Number(size[2]) : 0;
        if (width < 64 || height < 16) continue;
        const display = { mapping: String(item.mapping), name, width, height, controller: String(controller.name ?? '') };
        if (inspectorDisplayReadable(display.controller)) found.push(display);
        else refused?.push(display);
      }
    }
  }
  return found.sort((a, b) => b.width * b.height - a.width * a.height)[0];
}
