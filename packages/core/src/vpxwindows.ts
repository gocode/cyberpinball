// Fenêtres que VPX peut ouvrir pendant une partie lancée en -Play, et ce que le
// lanceur en fait. Titres et classes relevés dans le code source de VPX 10.8.1
// (src/renderer/Window.cpp, src/ui/win/vpinball_eng.rc, WinEditor.cpp, codeview.cpp)
// et vérifiés sur le PC de développement (docs/tests-manuels.md).
//
// En -Play, VPX 10.8.1 n'ouvre que ses fenêtres de jeu (classe SDL_app) : il ne
// crée pas son éditeur, donc ni audit de la table, ni éditeur de script, ni
// fenêtre de progression. La reconnaissance des fenêtres de l'éditeur sert de
// filet pour une autre version de VPX qui en ouvrirait une malgré tout.

import { t, tn } from './i18n';
import { ROLES, type ObservedDisplay, type Rect, type RoleId } from './model';
import { VPX_PLAY_SETTINGS, vpxDisplayName, type VpxDisplayIdFormat } from './vpx';

/** Fenêtres de jeu de VPX (Window.cpp). */
export const VPX_GAME_TITLES = [
  'Visual Pinball Player',
  'Visual Pinball Backglass',
  'Visual Pinball Score View',
  'Visual Pinball Topper',
  'Visual Pinball VR Preview',
] as const;

/** Classe des boîtes de dialogue Windows (MessageBox, CDialog). */
export const DIALOG_CLASS = '#32770';

export interface ObservedVpxWindow {
  title: string;
  className: string;
  /** Textes des contrôles (message d'une boîte de dialogue), lus seulement pour une boîte. */
  texts?: string[];
}

export type VpxWindowVerdict =
  /** Fenêtre de jeu : rien à faire. */
  | { kind: 'game' }
  /** Fenêtre de l'éditeur ou d'audit : masquée (hide) ou fermée (close), la partie continue. */
  | { kind: 'editor'; action: 'hide' | 'close'; notice: string }
  /** Boîte bloquante (question, erreur) : la partie est arrêtée avec ce message. */
  | { kind: 'dialog'; message: string }
  /** Autre fenêtre : laissée telle quelle, signalée. */
  | { kind: 'unknown'; notice: string };

/** Fenêtres de l'éditeur reconnues à leur classe : les fermer quitterait VPX ou poserait une question. */
const EDITOR_CLASSES: Record<string, string> = {
  get VPinball() {
    return t('éditeur de tables');
  },
  get CVFrame() {
    return t('éditeur de script');
  },
};

/** Boîtes de l'éditeur reconnues à leur titre (vpinball_eng.rc) : sans question, la partie peut continuer. */
const EDITOR_DIALOGS: Record<string, string> = {
  get 'Preparing Table'() {
    return t('progression du chargement');
  },
  get 'Debugger and Interactive Editor'() {
    return t('débogueur');
  },
};

/** Boutons d'une boîte de dialogue, à ne pas mêler au message. */
const BUTTON_TEXT = /^&?(ok|oui|non|yes|no|annuler|cancel|réessayer|retry|ignorer|ignore|abandonner|abort|fermer|close)$/i;

function setting(key: string): string {
  const s = VPX_PLAY_SETTINGS.find((p) => p.key === key)!;
  return `[${s.section}] ${s.key} = ${s.value}`;
}

/**
 * Ce que le lanceur fait d'une fenêtre visible du processus de VPX. Pure : la lecture
 * des fenêtres et les actions sont dans launcher.ts.
 */
export function classifyVpxWindow(w: ObservedVpxWindow): VpxWindowVerdict {
  const className = w.className.trim();
  const title = w.title.trim();
  if ((VPX_GAME_TITLES as readonly string[]).includes(title) && className !== DIALOG_CLASS) return { kind: 'game' };

  const editor = Object.hasOwn(EDITOR_CLASSES, className) ? EDITOR_CLASSES[className] : undefined;
  if (editor) return { kind: 'editor', action: 'hide', notice: t("Fenêtre de l'{editor} de VPX masquée (« {title} »).", { editor, title }) };

  if (className !== DIALOG_CLASS) {
    return {
      kind: 'unknown',
      notice: t("Fenêtre inattendue de VPX laissée à l'écran : « {title} » (classe {className}).", { title: title || t('sans titre'), className: className || t('inconnue') }),
    };
  }

  const texts = (w.texts ?? []).map((s) => s.trim()).filter((s) => s && !BUTTON_TEXT.test(s));
  const body = texts.join(' ');
  const dialog = Object.hasOwn(EDITOR_DIALOGS, title) ? EDITOR_DIALOGS[title] : undefined;
  if (dialog) return { kind: 'editor', action: 'hide', notice: t("Fenêtre de {dialog} de l'éditeur de VPX masquée (« {title} »).", { dialog, title }) };
  // Audit de la table (InfoDialog de WinEditor : titre « Dialog », texte « Table audit: » ou
  // « This table contains error(s)… ») : une simple information, fermée par son bouton OK.
  if (/^Table audit:|This table contains error\(s\)/.test(body)) {
    const errors = (body.match(/\. Error:/g) ?? []).length;
    return {
      kind: 'editor',
      action: 'close',
      notice: errors
        ? tn(errors, 'Fenêtre « Table audit » de VPX fermée ({n} erreur signalée par VPX).', 'Fenêtre « Table audit » de VPX fermée ({n} erreurs signalées par VPX).')
        : t('Fenêtre « Table audit » de VPX fermée.'),
    };
  }

  const text = [title, ...texts].join(' : ');
  const activeX = /attempting to create an object of type '([^']+)'/.exec(body);
  if (activeX) {
    return {
      kind: 'dialog',
      message: t(
        "VPX demande s'il peut créer l'objet ActiveX « {object} » dont la table a besoin : son réglage [Player] SecurityLevel n'est pas à 0. Remettez {setting} dans VPinballX.ini (au démarrage, Cyber Pinball propose de reprendre sa valeur).",
        { object: activeX[1]!, setting: setting('SecurityLevel') },
      ),
    };
  }
  if (/Connection to VR headset failed|VR mode activated but OpenXR/i.test(text)) {
    return {
      kind: 'dialog',
      message: t(
        "VPX cherche un casque de réalité virtuelle : la VR est forcée ([PlayerVR] AskToTurnOn = 0). Remettez {setting} dans VPinballX.ini, et dans le .ini de la table s'il la surcharge.",
        { setting: setting('AskToTurnOn') },
      ),
    };
  }
  return { kind: 'dialog', message: text };
}

// ---------------------------------------------------------------------------
// Recalage des fenêtres annexes
//
// VPX 10.8.1 ne reconnaît un écran que par son nom SDL (Window::GetDisplayConfig) et prend le
// premier qui le porte : deux rôles sur deux écrans du même modèle ont leurs fenêtres sur le
// même écran (poste à deux PL2294H : Backglass et Score View superposés, « Window #1 » et
// « Window #2 » du journal « on display PL2294H »). En fenêtré, WndX et WndY sont relatifs à cet
// écran et doivent y tenir : aucun réglage de VPinballX.ini ne l'en sort. Pendant la partie,
// Cyber Pinball ramène donc ces fenêtres sur l'écran de leur rôle (frontend.ts, watchOccupied).

/** Fenêtres annexes de VPX (Window.cpp), et le rôle dont chacune occupe l'écran. Le playfield n'en est pas : sa fenêtre, celle du rendu, n'est jamais déplacée. */
export const VPX_ANCILLARY_WINDOWS = {
  'Visual Pinball Backglass': 'backglass',
  'Visual Pinball Score View': 'dmd',
  'Visual Pinball Topper': 'topper',
} as const satisfies Record<string, RoleId>;

/**
 * Rôles que VPX peut ouvrir sur un autre écran que le leur : avec une version qui repère les
 * écrans par leur seul nom (`format` « name »), ceux dont un autre écran branché porte le même
 * nom (vpxDisplayName). L'autre écran est celui d'un autre rôle (homonymousRoles, santé de la
 * borne) ou un écran inutilisé du même modèle : VPX peut prendre l'un comme l'autre.
 */
export function confusableRoles(assignments: Partial<Record<RoleId, ObservedDisplay>>, observed: readonly ObservedDisplay[], format: VpxDisplayIdFormat | undefined): RoleId[] {
  if (format !== 'name') return [];
  const roles: RoleId[] = [];
  for (const { id: role } of ROLES) {
    const display = assignments[role];
    if (!display) continue;
    const name = vpxDisplayName(display);
    if (observed.some((d) => d.gdiName !== display.gdiName && vpxDisplayName(d) === name)) roles.push(role);
  }
  return roles;
}

/** Fenêtre de VPX lue dans la pile de Windows (GetWindowRect : pixels physiques du bureau). */
export interface PlacedVpxWindow {
  title: string;
  rect: Rect;
  minimized?: boolean;
}

export interface VpxWindowMove<W extends PlacedVpxWindow> {
  window: W;
  role: RoleId;
  /** Nouvelle place, à la même taille. */
  to: Rect;
}

const centerOf = (r: Rect) => ({ x: r.x + r.width / 2, y: r.y + r.height / 2 });
const holds = (r: Rect, p: { x: number; y: number }) => p.x >= r.x && p.x < r.x + r.width && p.y >= r.y && p.y < r.y + r.height;
const clamp = (v: number, min: number, max: number) => Math.max(min, Math.min(max, v));

/**
 * Fenêtres annexes de VPX à ramener sur l'écran de leur rôle : celles d'un rôle confondu
 * (confusableRoles) dont le centre n'est pas sur son écran (`screens`, bornes de l'écran de
 * chaque rôle). Chacune garde sa taille et sa place dans l'écran où VPX l'a ouverte (WndX, WndY
 * de VPinballX.ini sont relatifs à l'écran), sans en déborder. Une fenêtre déjà sur son écran
 * n'est jamais touchée : ce que le joueur y règle dans le menu de VPX reste. `displays` : les
 * écrans branchés, pour retrouver celui où VPX l'a ouverte.
 */
export function vpxWindowMoves<W extends PlacedVpxWindow>(
  windows: readonly W[],
  screens: Partial<Record<RoleId, Rect>>,
  confused: readonly RoleId[],
  displays: readonly Rect[],
): VpxWindowMove<W>[] {
  const moves: VpxWindowMove<W>[] = [];
  for (const window of windows) {
    const role = Object.hasOwn(VPX_ANCILLARY_WINDOWS, window.title) ? VPX_ANCILLARY_WINDOWS[window.title as keyof typeof VPX_ANCILLARY_WINDOWS] : undefined;
    const target = role && confused.includes(role) ? screens[role] : undefined;
    if (!role || !target || window.minimized || window.rect.width <= 0 || window.rect.height <= 0) continue;
    const center = centerOf(window.rect);
    if (holds(target, center)) continue;
    const from = displays.find((d) => holds(d, center));
    const offset = from ? { x: window.rect.x - from.x, y: window.rect.y - from.y } : { x: 0, y: 0 };
    const { width, height } = window.rect;
    const to = {
      x: target.x + clamp(offset.x, 0, Math.max(0, target.width - width)),
      y: target.y + clamp(offset.y, 0, Math.max(0, target.height - height)),
      width,
      height,
    };
    moves.push({ window, role, to });
  }
  return moves;
}
