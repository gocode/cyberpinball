// Le DMD de la table montre-t-il son écran de score ? (essai réel du 31/10/2026 : les scores des
// amis posés sur le DMD « par moment c'est gênant pendant le jeu » ; ils ne doivent s'y poser que
// quand il affiche des scores, jamais pendant une animation, un mode, une vidéo, ni la saisie des
// initiales ou la fin de la partie.)
//
// Les images viennent de l'inspector de VPX (app/src/dmd-watch.ts : /ws/display, une image par
// changement), les signaux de la partie du relevé (livestate.ts). Mesuré hors écran sur les ROM de
// la borne par la libpinmame (tmp\banc-dmd, 31/10/2026) :
// - l'écran de score revient sans cesse : Terminator 2 (WPC) le montre ~1 s, fait glisser son score
//   (~0,5 s d'images toutes différentes), puis le remontre, tant que rien n'arrive ; Star Trek (SAM)
//   montre en jeu une scène animée (l'Enterprise, les étoiles) avec le score en coin, qui ne change
//   que de quelques pour cent d'une image à l'autre à ses moments calmes ;
// - une animation (BONUS, mode, vidéo) enchaîne des images qui ne reviennent pas, et un texte de
//   mode reste une seule fois, une ou deux secondes, avant de rendre la main à l'écran de score ;
// - la fin de partie (game_over, avant les initiales) et l'attente ont aussi des images qui
//   reviennent : c'est la partie en cours, dite par le relevé, qui les écarte.
// D'où la règle : en partie, le score immobile depuis 3 s, et sur les 4 dernières secondes une image
// dominante (à quelques points près) au moins 45 % du temps, qui revient (deux plages au moins) ou
// reste sans interruption plus longtemps qu'un texte de mode (3,5 s : un écran de score fixe). Un mode
// qui boucle sur deux images pendant toute sa durée passerait : c'est le score immobile (aucun coup
// depuis 3 s) qui le rend rare, et les scores ne restent jamais plus de quelques secondes.

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
  /** Fenêtre observée. */
  windowMs: 4000,
  /** Part du temps de l'image dominante. */
  share: 0.45,
  /** Plages distinctes de l'image dominante dans la fenêtre… */
  runs: 2,
  /** …ou une seule, affichée sans interruption plus longtemps qu'un texte de mode (un écran de score fixe). */
  steadyMs: 3500,
  /** Score immobile depuis… */
  stillMs: 3000,
  /**
   * Deux images sont la même à ce nombre de points près, en part de leur encre (les points allumés,
   * ou les éteints sur une image presque toute allumée), 4 au moins : le fond animé de Star Trek
   * change de 2 à 5 % d'une image à l'autre, une animation de bien plus.
   */
  tolerance: 0.08,
  /** Une image autre que la dominante, restée plus longtemps, n'est plus une transition : un BONUS, un mode. */
  strangerMs: 200,
} as const;

interface Sample {
  at: number;
  bits: Uint32Array;
  lit: number;
  /** Points de l'image. */
  dots: number;
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

function near(a: Sample, b: Sample): boolean {
  if (a.bits.length !== b.bits.length) return false;
  let diff = 0;
  for (let i = 0; i < a.bits.length; i++) diff += popcount((a.bits[i]! ^ b.bits[i]!) >>> 0);
  const ink = Math.min(Math.max(a.lit, b.lit), a.dots - Math.min(a.lit, b.lit));
  return diff <= Math.max(4, DMD_SCORE_RULE.tolerance * ink);
}

/** Ce que la règle a vu, pour le journal et les essais. */
export interface DmdScoreVerdict {
  scoreScreen: boolean;
  /** Pourquoi non, sinon « écran de score ». */
  why: string;
  /** Part du temps de l'image dominante. */
  share: number;
  runs: number;
}

/** Suit le DMD d'une table pendant la partie : `frame` à chaque image, `game` à chaque relevé, `verdict` quand il faut décider. */
export class DmdScoreWatch {
  private samples: Sample[] = [];
  private signals: DmdGameSignals = { inGame: false };
  private scoreAt = 0;

  frame(frame: DmdFrame, at: number): void {
    const { bits, lit } = dmdBits(frame);
    const sample = { at, bits, lit, dots: frame.width * frame.height };
    const last = this.samples.at(-1);
    // Une image identique à la précédente ne change rien (l'inspector n'envoie que les changements).
    if (last && last.lit === lit && last.bits.every((v, i) => v === bits[i])) return;
    this.samples.push(sample);
    this.prune(at);
  }

  game(signals: DmdGameSignals, at: number): void {
    if (signals.score !== this.signals.score || signals.inGame !== this.signals.inGame) this.scoreAt = at;
    this.signals = signals;
  }

  private prune(at: number): void {
    // On garde la dernière image d'avant la fenêtre : c'est elle qui s'affichait à son début.
    const from = at - DMD_SCORE_RULE.windowMs;
    let drop = 0;
    while (drop + 1 < this.samples.length && this.samples[drop + 1]!.at <= from) drop++;
    if (drop) this.samples.splice(0, drop);
  }

  verdict(at: number): DmdScoreVerdict {
    this.prune(at);
    const no = (why: string, share = 0, runs = 0): DmdScoreVerdict => ({ scoreScreen: false, why, share, runs });
    if (!this.signals.inGame) return no('pas de partie en cours'); // i18n-ignore : raison pour le journal et les essais
    if (at - this.scoreAt < DMD_SCORE_RULE.stillMs) return no('score qui bouge'); // i18n-ignore : raison pour le journal et les essais
    const from = at - DMD_SCORE_RULE.windowMs;
    if (!this.samples.length || this.samples[0]!.at > from + DMD_SCORE_RULE.windowMs * 0.1) return no('pas assez d’images du DMD'); // i18n-ignore : raison pour le journal et les essais
    // Chaque image, et le temps qu'elle est restée affichée dans la fenêtre.
    const shown = this.samples.map((s, i) => ({ s, ms: Math.max(0, (this.samples[i + 1]?.at ?? at) - Math.max(s.at, from)) }));
    let best = { share: 0, runs: 0, steady: 0, sample: shown[0]!.s };
    for (const candidate of shown) {
      let ms = 0;
      let runs = 0;
      let runStart: number | undefined;
      let steady = 0;
      shown.forEach((x, i) => {
        if (near(candidate.s, x.s)) {
          ms += x.ms;
          if (runStart === undefined) {
            runs++;
            runStart = x.s.at;
          }
          // Durée d'une plage sans interruption, depuis sa vraie première image (avant la fenêtre comprise).
          steady = Math.max(steady, (this.samples[i + 1]?.at ?? at) - runStart);
        } else if (x.ms > 0) runStart = undefined;
      });
      const share = ms / DMD_SCORE_RULE.windowMs;
      if (share > best.share) best = { share, runs, steady, sample: candidate.s };
    }
    if (best.share < DMD_SCORE_RULE.share) return no('animation', best.share, best.runs); // i18n-ignore : raison pour le journal et les essais
    if (best.runs < DMD_SCORE_RULE.runs && best.steady < DMD_SCORE_RULE.steadyMs) return no('image montrée une seule fois', best.share, best.runs); // i18n-ignore : raison pour le journal et les essais
    // L'image du moment : la dominante, ou une transition brève (le score de T2 qui glisse) ; sinon le DMD montre autre chose.
    // Un fond qui dérive (les étoiles de Star Trek) s'éloigne peu à peu de la dominante : l'image du moment
    // en est aussi quand elle ressemble à la précédente, qui en était.
    const now = this.samples.at(-1)!;
    const before = this.samples.at(-2);
    const same = near(now, best.sample) || (before !== undefined && near(before, best.sample) && near(before, now));
    if (!same && at - now.at > DMD_SCORE_RULE.strangerMs) return no('autre image', best.share, best.runs); // i18n-ignore : raison pour le journal et les essais
    return { scoreScreen: true, why: 'écran de score', share: best.share, runs: best.runs }; // i18n-ignore : raison pour le journal et les essais
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
