// Réalité virtuelle : jouer une table dans un casque (Meta Quest par Link ou Virtual Desktop,
// SteamVR…). VPX 10.8.1 pour Windows contient OpenXR ; Cyber Pinball ne fait que l'allumer, partie
// par partie, sans jamais toucher au VPinballX.ini de la borne (où [PlayerVR] AskToTurnOn reste à 2,
// VPX_PLAY_SETTINGS).
//
// Ce que fait VPX 10.8.1 (Player::Player, player.cpp) :
// - [PlayerVR] AskToTurnOn = 1 (« Autodetect ») : si le runtime OpenXR répond et que le casque est
//   prêt, la partie se joue dans le casque ; sinon elle se joue sur les écrans, sans question. C'est
//   la seule valeur que Cyber Pinball écrit : une borne ne reste jamais bloquée sur « Connection to VR
//   headset failed / Retry connection ? » (valeur 0) ;
// - en VR, la fenêtre de jeu « Visual Pinball Player » n'existe pas : VPX ouvre « Visual Pinball VR
//   Preview » sur le bureau (ce qu'un œil voit). Les fenêtres annexes (fronton, DMD, topper) s'ouvrent
//   comme d'habitude sur leurs écrans (Player::Player, RenderOutput::SetMode) : vérifié dans le journal
//   de VPX le 9 novembre 2026, partie dans un Quest 2 par Link ;
// - [PlayerVR] AddBackglass = 1 pose dans la scène un panneau au-dessus du plateau qui montre ce que
//   dessinerait la fenêtre du fronton (plugins B2S, PUP). Faux par défaut. Une table qui a sa propre
//   pièce VR a déjà le sien (VPX convertit même l'ancien « backglassimage » en panneau de ce type) :
//   le panneau n'est allumé que pour les autres (tableHasVrRoom) ;
// - à la sortie, VPX enregistre l'orientation et la position de la table (TableX, TableY, TableZ)
//   dans le fichier passé par -Ini (VRDevice::SaveVRSettings) ;
// - la fenêtre « Visual Pinball VR Preview » (RenderDevice.cpp, Window.cpp) va sur l'écran de
//   [PlayerVR] PreviewDisplay, sinon sur l'écran principal, en fenêtre carrée centrée (PreviewFullScreen
//   = 0, taille 16384 ramenée à l'écran). vrPreviewSettings la met à la place de la fenêtre de jeu,
//   sur l'écran du plateau, seul écran que VPX laisse libre en VR ;
// - fermer cette fenêtre arrête la partie comme Échap (SDL_EVENT_WINDOW_CLOSE_REQUESTED : CS_STOP_PLAY,
//   player.cpp) : -Play sort alors de VPX, après SaveVRSettings ;
// - le menu en partie de VPX (InGameUI, F12 ou [Input] Mapping.InGameUI) est dessiné dans le casque,
//   après l'image des deux yeux (Renderer.cpp, « LiveUI » après ApplyStereo), pas dans l'aperçu.
//
// Le VPinballX.ini d'une partie en VR est donc une copie de celui de la borne (ou du double d'une
// partie entre amis), à laquelle s'ajoutent les réglages de la VR gardés de la partie précédente
// (section [PlayerVR] entière, et [Player] VRPreview), puis ceux que Cyber Pinball impose (planVrIni).

import * as path from 'node:path';
import { codeOfScancode, keyboardKeys, mappingKey } from './buttons';
import { t } from './i18n';
import { IniDocument } from './ini';
import { applyVpxSettings, type VpxChange, type VpxSetting } from './vpx';

/** Réglage du joueur : « Désactivée » ou « Dans le casque quand il est prêt ». */
export type VrMode = 'off' | 'auto';

/** Titre de la fenêtre que VPX 10.8.1 ouvre sur le bureau à la place de celle du jeu, en VR (Window.cpp). */
export const VR_PREVIEW_TITLE = 'Visual Pinball VR Preview';

/** Section des réglages de la VR dans VPinballX.ini. */
export const VR_SECTION = 'PlayerVR';

/** Valeur de [PlayerVR] AskToTurnOn d'une partie en VR : 1, « Autodetect » (jamais 0, qui pose une question). */
export const VR_AUTODETECT = '1';

/** Réglages de la VR d'une autre section, gardés d'une partie à l'autre avec [PlayerVR]. */
const VR_CARRIED_KEYS: readonly { section: string; key: string }[] = [{ section: 'Player', key: 'VRPreview' }];

/** Clés de [PlayerVR] que Cyber Pinball impose à chaque partie, jamais reprises de la précédente. */
const VR_FORCED_KEYS = new Set(['asktoturnon', 'addbackglass', 'previewdisplay', 'previewfullscreen']);

/** [PlayerVR] PreviewFullScreen : 1, « Borderless Fullscreen » (0 : fenêtre ; BGFX n'a pas le plein écran exclusif). */
export const VR_PREVIEW_FULLSCREEN = '1';
/** [PlayerVR] PreviewFullScreen : 0, « Windowed ». */
export const VR_PREVIEW_WINDOWED = '0';

/** Runtime OpenXR actif (registre HKLM\SOFTWARE\Khronos\OpenXR\1, valeur ActiveRuntime), tel que lu par l'application. */
export interface OpenXrProbe {
  /** Chemin du manifeste du runtime actif ; undefined : aucun runtime déclaré. */
  manifest?: string;
  /** Contenu du manifeste ; undefined : fichier introuvable ou illisible. */
  text?: string;
}

export type VrReadiness = { ready: true; runtime: string } | { ready: false; reason: string };

/** Runtimes connus, reconnus au nom de leur manifeste. */
const KNOWN_RUNTIMES: readonly [RegExp, string][] = [
  [/oculus_openxr/i, 'Meta Quest Link'],
  [/steamxr/i, 'SteamVR'],
  [/virtualdesktop/i, 'Virtual Desktop'],
  [/mixedrealityruntime/i, 'Windows Mixed Reality'],
  [/pico/i, 'PICO Connect'],
  [/varjo/i, 'Varjo'],
];

/** Nom lisible du runtime : connu d'après le manifeste, sinon son champ runtime.name, sinon le nom du fichier. */
export function openXrRuntimeName(manifest: string, text?: string): string {
  const file = path.win32.basename(manifest);
  const known = KNOWN_RUNTIMES.find(([re]) => re.test(file))?.[1];
  if (known) return known;
  try {
    const name = (JSON.parse(text ?? '') as { runtime?: { name?: unknown } }).runtime?.name;
    if (typeof name === 'string' && name.trim()) return name.trim();
  } catch {
    // Manifeste illisible : son nom de fichier.
  }
  return file.replace(/\.json$/i, '');
}

/**
 * Le casque peut-il servir ? Seulement ce qui se lit sans le réveiller : un runtime OpenXR déclaré
 * et son manifeste présent. Que le casque soit branché, VPX le saura au lancement (Autodetect).
 */
export function vrReadiness(probe: OpenXrProbe): VrReadiness {
  if (!probe.manifest?.trim()) {
    return { ready: false, reason: t('Aucun logiciel de casque installé (runtime OpenXR) : Meta Quest Link, SteamVR ou Virtual Desktop') };
  }
  if (probe.text === undefined) {
    return { ready: false, reason: t('Le runtime OpenXR déclaré est introuvable ({file}) : réinstallez le logiciel du casque', { file: path.win32.basename(probe.manifest) }) };
  }
  return { ready: true, runtime: openXrRuntimeName(probe.manifest, probe.text) };
}

/**
 * La table a-t-elle sa propre pièce VR (meuble, salle, fronton) ? D'après son script, seul indice
 * lisible sans VPX : le mode de rendu VR testé (RenderingMode = 2, VPX 10.8), une option de pièce
 * (VRRoom, VR_Room) ou plusieurs objets VR_… Script illisible (protégé) : non.
 */
export function tableHasVrRoom(script: string | undefined): boolean {
  if (!script) return false;
  const code = script.replace(/'.*$/gm, ''); // sans les commentaires
  if (/\bRenderingMode\s*=\s*2\b/i.test(code)) return true;
  if (/\bVR_?Room\b/i.test(code)) return true;
  const objects = new Set([...code.matchAll(/\bVR_([A-Za-z0-9]\w*)/g)].map((m) => m[1]!.toLowerCase()));
  return objects.size >= 3;
}

export interface VrIniPlan {
  /** Le VPinballX.ini de la partie. */
  text: string;
  /** Ce que Cyber Pinball a écrit par rapport à l'INI de départ (journal). */
  changes: VpxChange[];
  /** Réglages de la VR repris de la partie précédente. */
  carried: number;
}

/**
 * Le VPinballX.ini d'une partie en VR : `base` (celui de la borne, ou du double), les réglages de la
 * VR de `previous` (la partie précédente : orientation et place de la table, aperçu…), puis
 * AskToTurnOn = 1 et AddBackglass selon la table.
 */
export function planVrIni(base: string, previous: string | undefined, opts: { addBackglass: boolean }): VrIniPlan {
  const doc = IniDocument.parse(base);
  const kept: VpxSetting[] = previous ? vrCarriedSettings(previous) : [];
  const forced: VpxSetting[] = [
    { section: VR_SECTION, key: 'AskToTurnOn', value: VR_AUTODETECT },
    { section: VR_SECTION, key: 'AddBackglass', value: opts.addBackglass ? '1' : '0' },
    ...vrPreviewSettings(doc),
  ];
  const changes = applyVpxSettings(doc, [...kept, ...forced]);
  return { text: doc.toString(), changes, carried: kept.length };
}

/**
 * Où VPX met l'aperçu de ce que voit le casque : à la place de la fenêtre de jeu, qui n'existe pas en
 * VR, sur l'écran du plateau ([Player] PlayfieldDisplay) et dans son mode (PlayfieldFullScreen : plein
 * écran ou fenêtre). Les fenêtres du fronton, du DMD et du topper gardent leurs écrans : y mettre
 * l'aperçu les superposerait. Rien d'écrit quand l'INI de la borne choisit déjà l'écran de l'aperçu.
 * Recalculé à chaque partie : un écran rebranché change de nom, une place gardée serait périmée.
 */
export function vrPreviewSettings(base: IniDocument): VpxSetting[] {
  if (base.get(VR_SECTION, 'PreviewDisplay')?.trim()) return [];
  const settings: VpxSetting[] = [];
  const playfield = base.get('Player', 'PlayfieldDisplay')?.trim();
  if (playfield) settings.push({ section: VR_SECTION, key: 'PreviewDisplay', value: playfield });
  const mode = base.get('Player', 'PlayfieldFullScreen')?.trim();
  if (mode) settings.push({ section: VR_SECTION, key: 'PreviewFullScreen', value: mode === '0' ? VR_PREVIEW_WINDOWED : VR_PREVIEW_FULLSCREEN });
  return settings;
}

/**
 * La table a-t-elle une place dans la pièce ? VPX l'écrit en quittant proprement ([PlayerVR]
 * Orientation, TableX, TableY : VRDevice::SaveVRSettings). Sans elle, la table est posée à
 * l'origine de l'espace du casque, souvent autour du joueur, qui ne voit alors que des bouts de
 * plateau (premier essai dans un Quest 2, 9 novembre 2026) : Cyber Pinball recentre pour lui.
 */
export function vrHasSavedPlace(text: string): boolean {
  const doc = IniDocument.parse(text);
  return ['Orientation', 'TableX', 'TableY'].some((key) => {
    const value = doc.get(VR_SECTION, key)?.trim();
    return Boolean(value) && Number.isFinite(Number(value)) && Number(value) !== 0;
  });
}

/** Touche du clavier qui recentre la vue de VPX sur le regard du joueur (action VRCenter, 5 du pavé par défaut). */
export function vrCenterKey(text: string): string | undefined {
  const doc = IniDocument.parse(text);
  return keyboardKeys(doc.get('Input', mappingKey('VRCenter')), 'VRCenter')
    .map(codeOfScancode)
    .find((c): c is string => Boolean(c));
}

/** Réglages de la VR d'un VPinballX.ini, à reprendre dans le suivant (sans ceux que Cyber Pinball impose). */
export function vrCarriedSettings(text: string): VpxSetting[] {
  const doc = IniDocument.parse(text);
  return doc.entries().filter(
    (e) =>
      (e.section.toLowerCase() === VR_SECTION.toLowerCase() && !VR_FORCED_KEYS.has(e.key.toLowerCase())) ||
      VR_CARRIED_KEYS.some((k) => k.section.toLowerCase() === e.section.toLowerCase() && k.key.toLowerCase() === e.key.toLowerCase()),
  );
}

/**
 * Le menu dans le casque (app/src/casque.ts) : montré, en attente du casque (Link pas lancé), ou
 * impossible faute du compagnon natif (application fabriquée sans les outils C++).
 */
export type HeadsetMenuState = 'shown' | 'waiting' | 'missing';

/** Libellé et détail de l'entrée « Réalité virtuelle » du menu système. */
export function vrMenuText(mode: VrMode, readiness: VrReadiness, headset?: HeadsetMenuState): { label: string; detail: string; unavailable: boolean } {
  if (!readiness.ready) return { label: t('Réalité virtuelle : indisponible'), detail: readiness.reason, unavailable: true };
  const menu =
    headset === 'shown'
      ? t('menu de Cyber Pinball dans le casque')
      : headset === 'waiting'
        ? t('menu dans le casque dès qu’il est prêt')
        : headset === 'missing'
          ? t('menu dans le casque indisponible : compagnon absent de cette version')
          : undefined;
  return mode === 'auto'
    ? {
        label: t('Réalité virtuelle : activée'),
        detail: [
          t('{runtime} · les tables se lancent dans le casque quand il est prêt, sinon sur les écrans ; choisir pour désactiver', { runtime: readiness.runtime }),
          ...(menu ? [menu] : []),
        ].join(' · '),
        unavailable: false,
      }
    : {
        label: t('Réalité virtuelle : désactivée'),
        detail: t('{runtime} installé · choisir pour jouer dans le casque quand il est branché', { runtime: readiness.runtime }),
        unavailable: false,
      };
}
