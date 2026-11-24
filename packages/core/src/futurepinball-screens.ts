// Future Pinball sur une vraie borne : les écrans de ses préférences (24/11/2026, essai sur un PinCab).
//
// Le jeu garde, dans HKCU\Software\Future Pinball\GamePlayer, le NOM GDI de l'écran de son playfield
// (PlayfieldMonitorID, « \\.\DISPLAY2 ») et de son fronton (BackboxMonitorID), avec leur résolution
// (Width/Height, SecondMonitorWidth/Height). Windows renumérote ces noms quand un écran se rebranche,
// qu'un pilote se met à jour ou qu'une résolution change : sur un PinCab, « \\.\DISPLAY2 » était devenu
// l'écran du DMD (1920 x 1080) alors que le playfield (3840 x 2160) était « \\.\DISPLAY1 ». Le jeu ouvrait
// alors son playfield 4K sur l'écran du DMD, changeait de mode d'affichage, Windows réarrangeait tous les
// écrans (le fronton « de travers puis remis ») et le playfield réel restait sous la fenêtre de fond de
// Cyber Pinball : une image fixe pendant que le DMD annonce la partie.
//
// Cyber Pinball connaît les rôles de la borne (empreinte EDID, stable) et le nom GDI du moment de chaque
// écran. Avant chaque partie il écrit donc ces deux identifiants dans les préférences du jeu, comme il règle
// le mode borne de Pinball FX (pinballfx-cabinet.ts). Il ne touche ni à FullScreen, ni à SecondMonitorEnable,
// ni à RotateDegrees, ni aux touches : le reste reste le choix du joueur. Les résolutions ne sont corrigées
// que si elles ne sont ni celles de l'écran ni celles de l'écran couché (un playfield tourné par Windows).

/** Clés d'identifiants et de résolutions dans les préférences du jeu. */
export const FUTURE_PINBALL_SCREEN_VALUES = {
  playfieldId: 'PlayfieldMonitorID',
  playfieldWidth: 'Width',
  playfieldHeight: 'Height',
  backboxId: 'BackboxMonitorID',
  backboxWidth: 'SecondMonitorWidth',
  backboxHeight: 'SecondMonitorHeight',
  backboxEnabled: 'SecondMonitorEnable',
} as const;

/** Écran d'un rôle de la borne tel que Windows le numérote maintenant. */
export interface FuturePinballScreen {
  /** Nom GDI du moment, « \\.\DISPLAY1 ». */
  gdiName: string;
  /** Taille en pixels physiques. */
  width: number;
  height: number;
}

export interface FuturePinballScreenRoles {
  playfield?: FuturePinballScreen;
  backglass?: FuturePinballScreen;
}

/** Une préférence à corriger : valeur actuelle (undefined si absente) et valeur voulue. */
export interface FuturePinballScreenChange {
  name: string;
  from: string | number | undefined;
  to: string | number;
}

type Reader = (name: string) => unknown;

const sameText = (a: unknown, b: string) => typeof a === 'string' && a.trim().toLowerCase() === b.toLowerCase();

/** Taille voulue pour une préférence de résolution : la valeur du joueur si elle convient (écran droit ou couché). */
function sizeChange(read: Reader, widthName: string, heightName: string, screen: FuturePinballScreen): FuturePinballScreenChange[] {
  const width = read(widthName);
  const height = read(heightName);
  const straight = width === screen.width && height === screen.height;
  const turned = width === screen.height && height === screen.width;
  if (straight || turned) return [];
  return [
    { name: widthName, from: typeof width === 'number' ? width : undefined, to: screen.width },
    { name: heightName, from: typeof height === 'number' ? height : undefined, to: screen.height },
  ];
}

/**
 * Préférences de Future Pinball à corriger pour que son playfield et son fronton aillent sur les écrans de
 * ces rôles. `read` lit une valeur des préférences du jeu (undefined si absente). Liste vide : déjà juste, ou
 * jeu jamais lancé (aucune de ses préférences d'écran n'existe : on ne les invente pas).
 */
export function futurePinballScreenChanges(roles: FuturePinballScreenRoles, read: Reader): FuturePinballScreenChange[] {
  const k = FUTURE_PINBALL_SCREEN_VALUES;
  if (read(k.playfieldId) === undefined && read(k.backboxId) === undefined && read(k.playfieldWidth) === undefined) return [];
  const out: FuturePinballScreenChange[] = [];
  const same = (a: FuturePinballScreen | undefined, b: FuturePinballScreen | undefined) => a && b && a.gdiName.toLowerCase() === b.gdiName.toLowerCase();
  if (roles.playfield) {
    const id = read(k.playfieldId);
    if (!sameText(id, roles.playfield.gdiName)) out.push({ name: k.playfieldId, from: typeof id === 'string' ? id : undefined, to: roles.playfield.gdiName });
    out.push(...sizeChange(read, k.playfieldWidth, k.playfieldHeight, roles.playfield));
  }
  // Fronton : seulement si le joueur l'a activé dans le jeu, et jamais sur l'écran du playfield.
  if (roles.backglass && !same(roles.backglass, roles.playfield) && read(k.backboxEnabled) === 1) {
    const id = read(k.backboxId);
    if (!sameText(id, roles.backglass.gdiName)) out.push({ name: k.backboxId, from: typeof id === 'string' ? id : undefined, to: roles.backglass.gdiName });
    out.push(...sizeChange(read, k.backboxWidth, k.backboxHeight, roles.backglass));
  }
  return out;
}
