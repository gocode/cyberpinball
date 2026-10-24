// Mode hors écran des essais sans opérateur : les fenêtres de Cyber Pinball sont rendues
// en mémoire, sans jamais apparaître sur les écrans du poste ni lui prendre le focus, et
// les écrans de la borne peuvent être simulés par un fichier JSON. Les essais tournent
// ainsi en arrière-plan pendant que le poste sert à autre chose.
//
// CYBERPINBALL_HORS_ECRAN=1 l'impose ; il est automatique dès qu'un essai est sans
// opérateur (pilote automatique, captures, endurance). CYBERPINBALL_A_L_ECRAN=1 force
// l'affichage réel : c'est le seul moyen de lancer ce qui a besoin des vrais écrans
// (une partie de VPX, l'endurance, les captures du bureau entier).

import { t } from './i18n';
import type { EdidInfo, ObservedDisplay, Rect, Rotation } from './model';

/** Variables qui rendent un essai sans opérateur, donc hors écran par défaut. */
const UNATTENDED = ['CYBERPINBALL_AUTOPILOT', 'CYBERPINBALL_CAPTURE', 'CYBERPINBALL_STRESS'];

/** Vrai si les fenêtres doivent être rendues hors écran. */
export function offscreenMode(env: NodeJS.ProcessEnv): boolean {
  if (env.CYBERPINBALL_A_L_ECRAN === '1') return false;
  return env.CYBERPINBALL_HORS_ECRAN === '1' || UNATTENDED.some((name) => Boolean(env[name]));
}

/** Message de refus de ce qui ne peut pas se faire hors écran (il peut arriver à l'écran) ; `what` : déjà traduit. */
export function realScreensRefusal(what: string): string {
  return t('{what} nécessite les écrans du poste : impossible en mode hors écran (essai sans opérateur). Relancer avec CYBERPINBALL_A_L_ECRAN=1.', { what });
}

const ROTATIONS: Rotation[] = [0, 90, 180, 270];

/**
 * Écrans simulés (CYBERPINBALL_DISPLAYS) : même forme que ce que renvoie probeDisplays,
 * EDID compris, triés comme lui (de gauche à droite, puis de haut en bas). Une erreur
 * de forme est refusée avec l'écran et le champ fautifs : un fichier mal recopié ne doit
 * pas donner en silence une borne différente de celle voulue.
 */
export function parseSimulatedDisplays(value: unknown, source: string): ObservedDisplay[] {
  const fail = (where: string, what: string): never => {
    throw new Error(`Écrans simulés (${source}) : ${where} : ${what}.`); // i18n-ignore : fichier d’écrans simulés, pour le développeur
  };
  if (!Array.isArray(value) || value.length === 0) fail('fichier', 'une liste d’écrans non vide est attendue'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
  const displays = (value as unknown[]).map((raw, i) => {
    const where = `écran ${i + 1}`; // i18n-ignore : fichier d’écrans simulés, pour le développeur
    if (!raw || typeof raw !== 'object') fail(where, 'objet attendu'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
    const d = raw as Record<string, unknown>;
    for (const key of ['gdiName', 'friendlyName', 'devicePath']) {
      if (typeof d[key] !== 'string') fail(where, `« ${key} » doit être un texte`); // i18n-ignore : fichier d’écrans simulés, pour le développeur
    }
    // Le nom GDI compte pour VPX (numéro d'écran) : il doit avoir la forme de Windows.
    if (!/^\\\\\.\\DISPLAY\d+$/.test(d.gdiName as string)) fail(where, `« gdiName » doit ressembler à \\\\.\\DISPLAY1 (lu : ${String(d.gdiName)})`); // i18n-ignore : fichier d’écrans simulés, pour le développeur
    const bounds = rect(d.bounds) ?? fail(where, '« bounds » doit donner x, y, width et height (pixels physiques, largeur et hauteur > 0)'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
    if (!ROTATIONS.includes(d.rotation as Rotation)) fail(where, '« rotation » doit valoir 0, 90, 180 ou 270'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
    if (typeof d.primary !== 'boolean') fail(where, '« primary » doit valoir true ou false'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
    if (d.scale !== undefined && !(typeof d.scale === 'number' && d.scale > 0)) fail(where, '« scale » doit être un nombre positif'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
    if (d.edid !== undefined && !isEdid(d.edid)) fail(where, '« edid » doit donner manufacturer, productCode, serialNumber, widthCm et heightCm'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
    return { ...(d as unknown as ObservedDisplay), bounds };
  });
  const primaries = displays.filter((d) => d.primary);
  if (primaries.length !== 1) fail('fichier', `un seul écran principal est attendu (${primaries.length} trouvés)`); // i18n-ignore : fichier d’écrans simulés, pour le développeur
  if (primaries[0]!.bounds.x !== 0 || primaries[0]!.bounds.y !== 0) fail('fichier', 'l’écran principal doit être en 0, 0, comme sous Windows'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
  const names = new Set(displays.map((d) => d.gdiName));
  if (names.size !== displays.length) fail('fichier', 'deux écrans ont le même « gdiName »'); // i18n-ignore : fichier d’écrans simulés, pour le développeur
  return displays.sort((a, b) => a.bounds.x - b.bounds.x || a.bounds.y - b.bounds.y);
}

function rect(value: unknown): Rect | undefined {
  if (!value || typeof value !== 'object') return undefined;
  const r = value as Record<string, unknown>;
  const ints = ['x', 'y', 'width', 'height'].every((k) => Number.isInteger(r[k]));
  if (!ints || (r.width as number) <= 0 || (r.height as number) <= 0) return undefined;
  return { x: r.x as number, y: r.y as number, width: r.width as number, height: r.height as number };
}

function isEdid(value: unknown): value is EdidInfo {
  if (!value || typeof value !== 'object') return false;
  const e = value as Record<string, unknown>;
  return (
    typeof e.manufacturer === 'string' &&
    /^[A-Z]{3}$/.test(e.manufacturer) &&
    ['productCode', 'serialNumber', 'widthCm', 'heightCm'].every((k) => typeof e[k] === 'number')
  );
}
