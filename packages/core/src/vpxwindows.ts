// Fenêtres que VPX peut ouvrir pendant une partie lancée en -Play, et ce que le
// lanceur en fait. Titres et classes relevés dans le code source de VPX 10.8.1
// (src/renderer/Window.cpp, src/ui/win/vpinball_eng.rc, WinEditor.cpp, codeview.cpp)
// et vérifiés sur le PC de développement (docs/tests-manuels.md).
//
// En -Play, VPX 10.8.1 n'ouvre que ses fenêtres de jeu (classe SDL_app) : il ne
// crée pas son éditeur, donc ni audit de la table, ni éditeur de script, ni
// fenêtre de progression. La reconnaissance des fenêtres de l'éditeur sert de
// filet pour une autre version de VPX qui en ouvrirait une malgré tout.

import { VPX_PLAY_SETTINGS } from './vpx';

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
  VPinball: 'éditeur de tables',
  CVFrame: 'éditeur de script',
};

/** Boîtes de l'éditeur reconnues à leur titre (vpinball_eng.rc) : sans question, la partie peut continuer. */
const EDITOR_DIALOGS: Record<string, string> = {
  'Preparing Table': 'progression du chargement',
  'Debugger and Interactive Editor': 'débogueur',
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

  const editor = EDITOR_CLASSES[className];
  if (editor) return { kind: 'editor', action: 'hide', notice: `Fenêtre de l'${editor} de VPX masquée (« ${title} »).` };

  if (className !== DIALOG_CLASS) {
    return { kind: 'unknown', notice: `Fenêtre inattendue de VPX laissée à l'écran : « ${title || 'sans titre'} » (classe ${className || 'inconnue'}).` };
  }

  const texts = (w.texts ?? []).map((t) => t.trim()).filter((t) => t && !BUTTON_TEXT.test(t));
  const body = texts.join(' ');
  const dialog = EDITOR_DIALOGS[title];
  if (dialog) return { kind: 'editor', action: 'hide', notice: `Fenêtre de ${dialog} de l'éditeur de VPX masquée (« ${title} »).` };
  // Audit de la table (InfoDialog de WinEditor : titre « Dialog », texte « Table audit: » ou
  // « This table contains error(s)… ») : une simple information, fermée par son bouton OK.
  if (/^Table audit:|This table contains error\(s\)/.test(body)) {
    const errors = (body.match(/\. Error:/g) ?? []).length;
    return {
      kind: 'editor',
      action: 'close',
      notice: `Fenêtre « Table audit » de VPX fermée${errors ? ` (${errors} erreur${errors > 1 ? 's' : ''} signalée${errors > 1 ? 's' : ''} par VPX)` : ''}.`,
    };
  }

  const text = [title, ...texts].join(' : ');
  const activeX = /attempting to create an object of type '([^']+)'/.exec(body);
  if (activeX) {
    return {
      kind: 'dialog',
      message: `VPX demande s'il peut créer l'objet ActiveX « ${activeX[1]} » dont la table a besoin : son réglage [Player] SecurityLevel n'est pas à 0. Remettez ${setting('SecurityLevel')} dans VPinballX.ini (au démarrage, Cyber Pinball propose de reprendre sa valeur).`,
    };
  }
  if (/Connection to VR headset failed|VR mode activated but OpenXR/i.test(text)) {
    return {
      kind: 'dialog',
      message: `VPX cherche un casque de réalité virtuelle : la VR est forcée ([PlayerVR] AskToTurnOn = 0). Remettez ${setting('AskToTurnOn')} dans VPinballX.ini, et dans le .ini de la table s'il la surcharge.`,
    };
  }
  return { kind: 'dialog', message: text };
}
