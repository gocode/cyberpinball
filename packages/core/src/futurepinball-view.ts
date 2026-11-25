// Future Pinball : ce que la partie va afficher, dit au journal avant qu'elle ne parte (25/11/2026, borne :
// « la table n'est pas ajustée à la taille du playfield »). Le cadrage dépend de cinq choses que le jeu garde
// ailleurs que dans son interface : sa résolution et son mode (Width, Height, FullScreen), la rotation de la
// table (RotateDegrees, 0 à 3 quarts de tour), le mode arcade (ArcadeMode) avec sa caméra (ArcadeCameraX/Y/Z)
// et, par table, la vue de BAM (futurepinball-diagnostics.ts). Sans ce relevé, un mauvais cadrage ne se
// distingue pas d'un autre : on ne sait ni ce que le jeu a reçu ni ce que la borne attendait.
//
// Rien n'est corrigé ici. Cyber Pinball ne connaît pas le cadrage voulu d'une table (la caméra de BAM est un
// réglage de joueur, en binaire) et la rotation du jeu se compose avec celle que la session donne à l'écran
// (sessionorientation.ts) : écrire RotateDegrees d'après le bord des flippers serait deviner. Le journal rapporte
// les faits, et dit quand deux d'entre eux ne peuvent pas aller ensemble.

import type { FlipperEdge, Rotation } from './model';
import { edgeRotation } from './model';

/** Clé du registre où le jeu garde ses préférences d'affichage (HKCU). */
export const FUTURE_PINBALL_GAMEPLAYER_KEY = 'Software\\Future Pinball\\GamePlayer';

/** Noms des préférences d'affichage relevées. */
export const FUTURE_PINBALL_VIEW_VALUES = ['Width', 'Height', 'FullScreen', 'AspectRatio', 'ArcadeMode', 'RotateDegrees', 'DefaultCamera', 'CameraFollowsTheBall', 'ArcadeCameraX', 'ArcadeCameraY', 'ArcadeCameraZ'] as const;

export type FuturePinballViewValues = Partial<Record<(typeof FUTURE_PINBALL_VIEW_VALUES)[number], unknown>>;

export interface FuturePinballViewFacts {
  /** Préférences du jeu (undefined : absente du registre). */
  prefs: FuturePinballViewValues;
  /** Écran du playfield tel que la session le voit, taille en pixels physiques. */
  screen?: { width: number; height: number; rotation: Rotation };
  /** Bord de l'image de Windows où se tient le joueur, d'après l'assistant. */
  flipperEdge?: FlipperEdge;
}

const EDGE_NAME: Record<FlipperEdge, string> = { bottom: 'bas', left: 'gauche', top: 'haut', right: 'droit' }; // i18n-ignore : journal

const num = (v: unknown): number | undefined => (typeof v === 'number' && Number.isFinite(v) ? v : undefined);

/** Un quart de tour du jeu en degrés (RotateDegrees 0 à 3), ou undefined si la valeur n'en est pas un. */
export function futurePinballTurnDegrees(value: unknown): number | undefined {
  const n = num(value);
  return n !== undefined && Number.isInteger(n) && n >= 0 && n <= 3 ? n * 90 : undefined;
}

/** Proportions que le jeu appelle « AspectRatio » : 169 = 16:9, 43 = 4:3, 1610 = 16:10. */
function aspectName(code: number): string {
  const text = String(code);
  return text.length === 2 ? `${text[0]}:${text[1]}` : text.length === 3 || text.length === 4 ? `${text.slice(0, 2)}:${text.slice(2)}` : text;
}

/**
 * Lignes du journal sur la vue que Future Pinball va rendre : taille et mode, rotation de la table, mode
 * arcade et caméra, puis ce qui ne peut pas aller ensemble (jamais une correction).
 */
export function futurePinballViewFacts(facts: FuturePinballViewFacts): string[] {
  const { prefs, screen } = facts;
  const lines: string[] = [];
  const width = num(prefs.Width);
  const height = num(prefs.Height);
  if (width === undefined || height === undefined) {
    lines.push('Cadrage : le jeu n’a encore aucune préférence d’affichage (jamais lancé) ; il prendra ses valeurs par défaut.'); // i18n-ignore : journal
    return lines;
  }
  const full = num(prefs.FullScreen);
  const mode = full === 1 ? 'plein écran' : full === 0 ? 'en fenêtre' : 'mode inconnu'; // i18n-ignore : journal
  const ratio = num(prefs.AspectRatio);
  lines.push(`Cadrage : le jeu rend en ${width} x ${height}, ${mode}${ratio !== undefined ? `, proportions ${aspectName(ratio)}` : ''}.`); // i18n-ignore : journal
  const turn = futurePinballTurnDegrees(prefs.RotateDegrees);
  const arcade = num(prefs.ArcadeMode);
  const cam = [prefs.ArcadeCameraX, prefs.ArcadeCameraY, prefs.ArcadeCameraZ].map(num);
  lines.push(
    `Cadrage : table tournée de ${turn === undefined ? 'valeur illisible' : `${turn}°`}, mode arcade ${arcade === 1 ? 'oui' : arcade === 0 ? 'non' : 'inconnu'}` + // i18n-ignore : journal
      `${cam.every((c) => c !== undefined) ? `, caméra arcade ${cam.join(' / ')}` : ''}` + // i18n-ignore : journal
      `${num(prefs.CameraFollowsTheBall) === 1 ? ', la caméra suit la bille' : ''}.`, // i18n-ignore : journal
  );
  if (screen) {
    const edge = facts.flipperEdge;
    const wanted = edge ? edgeRotation(edge) : undefined;
    lines.push(
      `Cadrage : écran du playfield ${screen.width} x ${screen.height} (rotation de la session ${screen.rotation}°)` + // i18n-ignore : journal
        `${edge ? `, joueur côté ${EDGE_NAME[edge]} de l’image de Windows, soit ${wanted}° pour la remettre droite` : ''}.`, // i18n-ignore : journal
    );
    const straight = width === screen.width && height === screen.height;
    const turned = width === screen.height && height === screen.width;
    if (!straight && !turned) lines.push(`Cadrage : le jeu rend en ${width} x ${height} sur un écran de ${screen.width} x ${screen.height} : la table ne remplit pas l’écran.`); // i18n-ignore : journal
    else if (turned && !straight) lines.push(`Cadrage : la résolution du jeu est celle de l’écran couché (${width} x ${height}) alors que la session le donne en ${screen.width} x ${screen.height}.`); // i18n-ignore : journal
    if (full === 0) lines.push('Cadrage : le jeu est en fenêtre ; Cyber Pinball la pose sur l’écran du playfield mais ne l’agrandit pas.'); // i18n-ignore : journal
    if (arcade === 0) lines.push('Cadrage : le mode arcade du jeu est coupé ; la caméra n’est alors pas celle d’une borne (table vue en perspective, pas à plat).'); // i18n-ignore : journal
    // Une table portrait sur un écran paysage doit être tournée d'un quart de tour (par le jeu ou par Windows) ;
    // sinon elle tient dans une bande étroite au milieu de l'écran.
    const landscapeScreen = screen.width > screen.height;
    if (turn !== undefined && landscapeScreen && turn % 180 === 0 && straight) lines.push('Cadrage : la table (en hauteur) n’est pas tournée alors que l’écran est en largeur : elle risque d’occuper une bande étroite au milieu.'); // i18n-ignore : journal
  }
  return lines;
}
