// Entrée dans le Juke-box depuis la roue (piste A « Le disque prend la scène », choisie par le
// mainteneur le 10/11/2026) : au Start sur
// le médaillon, le disque s'allume sur le plateau, recule comme une bille tirée par le lanceur, file
// vers le haut et sort ; une tache de lumière traverse le DMD et y fait place au visualiseur ; le
// disque entre par le bas du fronton et s'y pose dans une onde. La liste des playlists est là dès le
// premier instant (elle apparaît en fondu), et le premier bouton arrête tout : chaque écran passe à
// son état final, qui est son état normal.
//
// Comme le lancement en cinéma (cinema.ts), un seul temps pour les trois écrans : chaque fenêtre le
// déduit de l'heure du Start (Date.now() - startedAt). Le processus principal ne programme rien.

import { DMD_HEIGHT, DMD_WIDTH, blankDots, type DmdColors, type DmdDots } from './livedmd';

/**
 * Rythme de l'entrée, en millisecondes depuis le Start. jukebox.css (« Entrée depuis la roue ») et le
 * DMD (jukeboxEntranceDots) s'y tiennent ; jukebox-entrance.test.ts vérifie que la feuille de style
 * dit les mêmes temps.
 */
export const JUKEBOX_ENTRANCE = {
  /** Le disque s'allume sur le plateau (160 ms). */
  ignite: 0,
  /** Il recule d'un cran, comme une bille tirée par le lanceur. */
  arm: 200,
  /** Il file vers le haut et sort du plateau (jusqu'à `departed`). */
  launch: 320,
  /** La tache de lumière part sur le DMD, de gauche à droite. */
  dmdPass: 450,
  /** Fin du passage : le visualiseur a remplacé « JUKE-BOX ». */
  dmdPassEnd: 900,
  /** La liste des playlists commence à paraître sur le plateau. */
  listIn: 500,
  /** Le disque a quitté le plateau ; il entre par le bas du fronton. */
  departed: 700,
  /** Il touche sa place sur le fronton (léger dépassement) ; l'onde part. */
  impact: 1000,
  /** La liste est entièrement là. */
  listReady: 1100,
  /** Le disque est posé à sa taille. */
  settled: 1200,
  /** Fin : plus rien de l'entrée. */
  end: 1400,
} as const;


/** Une image du DMD et, s'il y a lieu, la couleur de chaque point (sinon la couleur réglée). */
export interface ColoredDmdFrame {
  dots: DmdDots;
  rgb?: DmdColors;
}

/** Demi-largeur de la tache de lumière, en points. */
const PASS_HALF = 5;
/** Couleur de la tache : la sarcelle claire du logo (jamais un blanc plein). */
const PASS_COLOR = [150, 236, 226] as const;

/**
 * DMD pendant l'entrée : « JUKE-BOX » et ses chiffres (`from`) jusqu'au passage, puis une tache de
 * lumière qui traverse l'afficheur de gauche à droite ; derrière elle, le visualiseur (`to`). Pas de
 * fondu croisé : à chaque colonne, l'un ou l'autre, jamais les deux textes mêlés. `color` : la couleur
 * réglée du DMD, pour les points d'une image qui n'a pas la sienne.
 */
export function jukeboxEntranceFrame(from: ColoredDmdFrame, to: ColoredDmdFrame, elapsed: number, color: readonly [number, number, number]): ColoredDmdFrame {
  const { dmdPass, dmdPassEnd } = JUKEBOX_ENTRANCE;
  if (elapsed < dmdPass) return from;
  if (elapsed >= dmdPassEnd) return to;
  const k = (elapsed - dmdPass) / (dmdPassEnd - dmdPass);
  // Douce au départ et à l'arrivée ; elle entre et sort entièrement de l'afficheur.
  const ease = k * k * (3 - 2 * k);
  const center = -PASS_HALF + ease * (DMD_WIDTH + 2 * PASS_HALF);
  const dots = blankDots();
  const rgb = new Uint8Array(DMD_WIDTH * DMD_HEIGHT * 3);
  for (let y = 0; y < DMD_HEIGHT; y++) {
    for (let x = 0; x < DMD_WIDTH; x++) {
      const i = y * DMD_WIDTH + x;
      const src = x < center ? to : from;
      let level = src.dots[i]!;
      let c: readonly number[] = src.rgb ? [src.rgb[i * 3]!, src.rgb[i * 3 + 1]!, src.rgb[i * 3 + 2]!] : color;
      const d = Math.abs(x + 0.5 - center);
      if (d < PASS_HALF) {
        // La tache : plus claire en son milieu, un peu plus haute au centre de l'afficheur.
        const glow = Math.round((1 - d / PASS_HALF) * (10 - Math.abs(y - DMD_HEIGHT / 2) / 4));
        if (glow > level) {
          level = glow;
          c = PASS_COLOR;
        }
      }
      dots[i] = level;
      rgb[i * 3] = c[0]!;
      rgb[i * 3 + 1] = c[1]!;
      rgb[i * 3 + 2] = c[2]!;
    }
  }
  return { dots, rgb };
}
