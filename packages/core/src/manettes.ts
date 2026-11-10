// Manettes du casque (Touch du Quest) : une seule règle partout, au menu de Cyber Pinball dans le
// casque comme en partie dans VPX. Essai du 10 novembre 2026 : un bouton qui valide ici et revient en
// arrière là (B : retour au menu, crédit dans VPX), c'est « très perturbant ».
//
//   A = valider, toujours ; B = retour / annuler, toujours ;
//   joysticks (les deux) = déplacer la sélection, répétée tant qu'on le tient ;
//   gâchettes = flippers en partie, précédent / suivant au menu (comme les flippers de la borne) ;
//   poignées = MagnaSave, en partie seulement ;
//   X = collection suivante au menu (sur la roue ; ailleurs, comme MagnaSave, la liste et ses actions),
//   crédit en partie ;
//   ≡ de la manette gauche = le menu du casque (au menu de Cyber Pinball : caler, recentrer ; en
//   partie : le menu de VPX).
//
// headsetControls() est la référence, figée par un test : le compagnon (packages/casque-vr) envoie
// les noms de HEADSET_BUTTONS, la légende du menu du casque en est tirée, et l'INI de chaque partie
// dans le casque reçoit vpxHeadsetInput (liaisons OpenXR de VPX 10.8.1, XRInputHandler.h).

import { formatMapping, mappingKey, parseMapping, VPX_INPUT_DEFAULTS } from './buttons';
import { t } from './i18n';
import { IniDocument } from './ini';
import type { RemoteButton } from './remote';
import type { VpxSetting } from './vpx';

/** Ce que fait le menu de Cyber Pinball d'un bouton des manettes : le bouton de la borne qu'il tient, ou le menu du casque. */
export type HeadsetMenuAction = RemoteButton | 'headset-menu';

/**
 * Boutons des manettes (compagnon : « bouton <nom> 1|0 ») et ce qu'ils font au menu. Les directions
 * des joysticks (haut, bas, gauche, droite) viennent des deux joysticks à la fois. X : la collection
 * suivante sur la roue (MagnaSave droit de la borne). Les poignées n'y sont pas : MagnaSave en partie seulement.
 */
export const HEADSET_BUTTONS = {
  'batteur-gauche': 'previous',
  'batteur-droit': 'next',
  start: 'confirm',
  exit: 'exit',
  menu: 'headset-menu',
  collection: 'zone',
  haut: 'previous',
  gauche: 'previous',
  bas: 'next',
  droite: 'next',
} as const satisfies Record<string, HeadsetMenuAction>;

export type HeadsetButton = keyof typeof HEADSET_BUTTONS;

export function isHeadsetButton(name: string): name is HeadsetButton {
  return Object.hasOwn(HEADSET_BUTTONS, name);
}

/** Un bouton des manettes : ce qu'il fait au menu de Cyber Pinball (et au calage), et en partie dans VPX. */
export interface HeadsetControl {
  id: 'a' | 'b' | 'joysticks' | 'gachettes' | 'menu' | 'poignees' | 'x' | 'y' | 'clic-droit' | 'clic-gauche';
  /** Le bouton, tel que le joueur le voit. */
  label: string;
  /** Au menu de Cyber Pinball dans le casque ; undefined : rien. */
  menu?: string;
  /** En partie, dans VPX ; undefined : rien. */
  game?: string;
}

/** La table des correspondances, dans l'ordre de la légende. */
export function headsetControls(): HeadsetControl[] {
  return [
    { id: 'a', label: 'A', menu: t('Valider'), game: t('Start ; valider dans le menu de VPX') },
    { id: 'b', label: 'B', menu: t('Retour, annuler'), game: t('Menu de VPX ; retour dans ce menu') },
    { id: 'joysticks', label: t('Joysticks'), menu: t('Déplacer la sélection'), game: t('Déplacer la sélection du menu de VPX ; le gauche secoue la table, le droit tiré vers soi arme le lanceur') },
    { id: 'gachettes', label: t('Gâchettes'), menu: t('Précédent, suivant (comme les flippers de la borne)'), game: t('Flippers') },
    { id: 'menu', label: t('≡ (manette gauche)'), menu: t('Menu du casque : caler, recentrer la borne'), game: t('Menu de VPX') },
    { id: 'poignees', label: t('Poignées'), game: t('MagnaSave') },
    { id: 'x', label: 'X', menu: t('Collection suivante (roue)'), game: t('Crédit') },
    { id: 'y', label: 'Y', game: t('Quitter la partie') },
    { id: 'clic-droit', label: t('Clic du joystick droit'), game: t('Lancer la bille') },
    { id: 'clic-gauche', label: t('Clic du joystick gauche'), game: t('Rien : la table ne bouge jamais d’elle-même') },
  ];
}

/**
 * Éléments des manettes dans VPX 10.8.1 (XRInputHandler.h : leur rang dans la liste des chemins
 * OpenXR qu'il écoute ; l'INI les écrit « OpenXR;<rang> »).
 */
export const VPX_OPENXR = {
  leftMenu: 2,
  leftSqueeze: 4,
  rightSqueeze: 5,
  x: 8,
  y: 9,
  a: 10,
  b: 11,
  leftStickClick: 12,
  rightStickClick: 13,
  leftTrigger: 16,
  rightTrigger: 17,
  leftStickX: 20,
  leftStickY: 21,
  rightStickX: 22,
  rightStickY: 23,
} as const;

/** Une entrée « OpenXR;<rang>[;o|x;<seuil>] » comme VPX l'écrit (InputAction::GetMappingString). */
function xr(element: number, threshold?: number): string {
  return threshold === undefined ? `OpenXR;${element}` : `OpenXR;${element};${threshold < 0 ? 'x' : 'o'};${threshold.toFixed(6)}`;
}

const E = VPX_OPENXR;
/**
 * Joystick incliné qui déplace la sélection du menu de VPX : 0,6, comme au menu de Cyber Pinball
 * (VPX met 0,9 : il fallait pousser le joystick à fond, essai du 10 novembre 2026).
 */
const UI_STICK = 0.6;

/**
 * Liaisons OpenXR de chaque action de VPX en partie, selon headsetControls(). Dans le menu de VPX,
 * UIRight « augmente ou valide » et InGameUI « revient en arrière » (InputManager.cpp) : A et B y
 * gardent donc leur sens. Le clic du joystick gauche n'aligne plus la table sur les manettes
 * (VRControllerCalibration, liaison par défaut de VPX) : elle ne bouge que sur demande.
 */
export const VPX_HEADSET_MAPPINGS: Readonly<Record<string, readonly string[]>> = {
  LeftFlipper: [xr(E.leftTrigger, 0.3)],
  RightFlipper: [xr(E.rightTrigger, 0.3)],
  LeftStagedFlipper: [xr(E.leftTrigger, 0.6)],
  RightStagedFlipper: [xr(E.rightTrigger, 0.6)],
  LeftMagna: [xr(E.leftSqueeze)],
  RightMagna: [xr(E.rightSqueeze)],
  Start: [xr(E.a)],
  UIRight: [xr(E.rightStickX, UI_STICK), xr(E.leftStickX, UI_STICK), xr(E.a)],
  UILeft: [xr(E.rightStickX, -UI_STICK), xr(E.leftStickX, -UI_STICK)],
  UIUp: [xr(E.leftStickY, UI_STICK), xr(E.rightStickY, UI_STICK)],
  UIDown: [xr(E.leftStickY, -UI_STICK), xr(E.rightStickY, -UI_STICK)],
  InGameUI: [xr(E.b), xr(E.leftMenu)],
  Credit1: [xr(E.x)],
  ExitGame: [xr(E.y)],
  LaunchBall: [xr(E.rightStickClick)],
  VRControllerCalibration: [],
};

/** Lanceur au joystick droit (tiré vers soi) et secousses au joystick gauche : les capteurs par défaut de VPX. */
const PLUNGER_SENSOR = `OpenXR;${E.rightStickY};P;0.000000;-1.000000;1.000000`;
const NUDGE_X = `OpenXR;${E.leftStickX};P;0.000000;1.000000;1.000000`;
const NUDGE_Y = `OpenXR;${E.leftStickY};P;0.000000;1.000000;1.000000`;

const INPUT = 'Input';
const SENSOR_KEY = /^Mapping\.(Plunger|Nudge)\d+\./i;
const isXr = (part: string) => /^OpenXR;/i.test(part.trim());

/**
 * Section [Input] de l'INI d'une partie dans le casque : les liaisons des manettes de VPX remplacées
 * par celles de VPX_HEADSET_MAPPINGS (touches du clavier et autres périphériques gardés), la
 * disposition automatique de VPX coupée pour elles (Device.OpenXR.NoAutoLayout : sans quoi VPX remet
 * ses liaisons dès qu'il en manque une, InputManager::SetDeviceDefaultMapping), et le lanceur et les
 * secousses aux joysticks s'ils n'y sont pas déjà. Seules les valeurs qui changent sont rendues.
 */
export function vpxHeadsetInput(text: string): VpxSetting[] {
  const doc = IniDocument.parse(text);
  const settings: VpxSetting[] = [];
  const put = (key: string, value: string) => {
    if ((doc.get(INPUT, key) ?? '').trim() !== value) settings.push({ section: INPUT, key, value });
  };
  put('Device.OpenXR.NoAutoLayout', '1');
  const inIni = doc
    .entries()
    .filter((e) => e.section.toLowerCase() === INPUT.toLowerCase() && /^Mapping\./i.test(e.key) && !SENSOR_KEY.test(e.key))
    .map((e) => e.key.slice('Mapping.'.length));
  for (const action of new Set([...Object.keys(VPX_HEADSET_MAPPINGS), ...inIni])) {
    const raw = doc.get(INPUT, mappingKey(action))?.trim();
    const current = raw || (VPX_INPUT_DEFAULTS[action] !== undefined ? `Key;${VPX_INPUT_DEFAULTS[action]}` : '');
    const kept = parseMapping(current).filter((alt) => !alt.some(isXr));
    const value = formatMapping([...kept, ...(VPX_HEADSET_MAPPINGS[action] ?? []).map((m) => [m])]);
    // Valeur vide : VPX prendrait sa liaison par défaut, celle du clavier (aucune pour VRControllerCalibration).
    if (value !== (raw ?? '') && !(value === current && !raw)) settings.push({ section: INPUT, key: mappingKey(action), value });
  }
  const count = (key: string) => Math.max(0, Math.floor(Number(doc.get(INPUT, key)) || 0));
  const plungers = count('PlungerSensorCount');
  if (!Array.from({ length: plungers }, (_, i) => doc.get(INPUT, `Mapping.Plunger${i}.Position`) ?? '').some(isXr)) {
    settings.push({ section: INPUT, key: `Mapping.Plunger${plungers}.Position`, value: PLUNGER_SENSOR }, { section: INPUT, key: 'PlungerSensorCount', value: String(plungers + 1) });
  }
  const nudges = count('NudgeSensorCount');
  if (!Array.from({ length: nudges }, (_, i) => `${doc.get(INPUT, `Mapping.Nudge${i}.X`) ?? ''}${doc.get(INPUT, `Mapping.Nudge${i}.Y`) ?? ''}`).some((v) => /OpenXR;/i.test(v))) {
    settings.push(
      { section: INPUT, key: `Mapping.Nudge${nudges}.Type`, value: '0' },
      { section: INPUT, key: `Mapping.Nudge${nudges}.Strength`, value: '1.0' },
      { section: INPUT, key: `Mapping.Nudge${nudges}.X`, value: NUDGE_X },
      { section: INPUT, key: `Mapping.Nudge${nudges}.Y`, value: NUDGE_Y },
      { section: INPUT, key: 'NudgeSensorCount', value: String(nudges + 1) },
    );
  }
  return settings;
}
