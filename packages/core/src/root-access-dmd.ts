// Root Access (26/11/2026) : l'affichage propre au jeu sur le DMD et le fronton, à la place des médias de la
// table que la roue montrait (PuP-Pack, vidéos). Le jeu dit où il en est (RootAccessStatus) ; le DMD en fait
// une animation lue à 25 images par seconde (rien à relancer quand le score change), le fronton une carte
// (app/renderer/root-access-ecran.js). Sans Electron : testé tel quel.

import { DMD_FONT_LARGE, DMD_FONT_SMALL, textWidth } from './dmdfont';
import { DMD_LEVEL, DMD_USABLE, blankDots, drawCentered, scoreText, type DmdAnimation, type DmdDots } from './livedmd';

/** Où en est le jeu : son écran, l'étage et le score. */
export interface RootAccessStatus {
  /** titre : avant la partie ; jeu : en cours ; dead : perdue ; won : gagnée. */
  screen: 'titre' | 'jeu' | 'dead' | 'won';
  /** Étage joué (à partir de 1) et nombre d'étages. */
  floor: number;
  floors: number;
  /** Nom de l'étage, tel que le jeu l'écrit. */
  name: string;
  score: number;
}

export const ROOT_ACCESS_SCREENS: readonly RootAccessStatus['screen'][] = ['titre', 'jeu', 'dead', 'won'];

/** Le message de la page du jeu, vérifié (elle ne renvoie que des nombres et un nom court) ; undefined : refusé. */
export function parseRootAccessStatus(raw: unknown): RootAccessStatus | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as Record<string, unknown>;
  const screen = ROOT_ACCESS_SCREENS.find((s) => s === r.screen);
  const int = (v: unknown, min: number, max: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.trunc(v))) : undefined);
  const floors = int(r.floors, 1, 99);
  const floor = int(r.floor, 1, 99);
  const score = int(r.score, 0, 999_999_999);
  if (!screen || floors === undefined || floor === undefined || score === undefined) return undefined;
  const name = typeof r.name === 'string' ? r.name.slice(0, 40) : '';
  return { screen, floor: Math.min(floor, floors), floors, name, score };
}

/** Deux états qui changent ce que le fronton montre (le score, lui, ne le change pas : il vit sur le DMD). */
export function sameRootAccessCard(a: RootAccessStatus | undefined, b: RootAccessStatus | undefined): boolean {
  return a === b || (!!a && !!b && a.screen === b.screen && a.floor === b.floor && a.floors === b.floors && a.name === b.name);
}

/** Cadence du clignotement de la consigne du titre, en ms. */
const BLINK_MS = 600;

/** Un texte en grand s'il tient, sinon en petit, centré à la ligne qui lui convient. */
function fit(dots: DmdDots, text: string, yLarge: number, ySmall: number, level: number = DMD_LEVEL.main): void {
  if (textWidth(DMD_FONT_LARGE, text) <= DMD_USABLE) drawCentered(dots, DMD_FONT_LARGE, text, yLarge, level);
  else drawCentered(dots, DMD_FONT_SMALL, text, ySmall, level);
}

/** L'image du DMD pour cet état du jeu. */
export function rootAccessDots(status: RootAccessStatus | undefined, elapsed = 0): DmdDots {
  const dots = blankDots();
  const screen = status?.screen ?? 'titre';
  if (screen === 'titre') {
    fit(dots, 'ROOT ACCESS', 3, 7);
    if (Math.floor(elapsed / BLINK_MS) % 2 === 0) drawCentered(dots, DMD_FONT_SMALL, 'PRESS START', 22, DMD_LEVEL.secondary);
    return dots;
  }
  const score = scoreText(status!.score);
  if (screen === 'jeu') {
    drawCentered(dots, DMD_FONT_SMALL, `FLOOR ${status!.floor}/${status!.floors}`, 2, DMD_LEVEL.secondary);
    fit(dots, score, 14, 18);
    return dots;
  }
  fit(dots, screen === 'won' ? 'ACCESS GRANTED' : 'GAME OVER', 3, 7);
  drawCentered(dots, DMD_FONT_SMALL, `SCORE ${score}`, 22, DMD_LEVEL.secondary);
  return dots;
}

/** L'animation du DMD, en boucle ; `status` est relu à chaque image (le score change sans rien relancer). */
export function rootAccessAnimation(status: () => RootAccessStatus | undefined): DmdAnimation {
  return { dots: (elapsed) => rootAccessDots(status(), elapsed) };
}
