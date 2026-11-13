// Manettes du casque : une seule règle partout, au menu de Cyber Pinball dans le casque comme en
// partie dans VPX (essai du 10 novembre 2026 : un bouton qui valide ici et revient en arrière là,
// c'est « très perturbant »), réglable bouton par bouton pour chaque casque et chaque configuration.
//
// Chaque fonction (flippers, valider, retour, menu du casque, crédit, quitter, MagnaSave, lancer la
// bille, lanceur, déplacer la sélection) est tenue par un bouton ou un axe des manettes, jamais deux
// fonctions sur le même. Au menu, les flippers sont aussi précédent et suivant (comme sur la borne),
// tout joystick ou pavé déplace la sélection, le crédit passe à la collection suivante ; en partie,
// VPX reçoit les mêmes boutons (liaisons OpenXR de VPX 10.8.1, XRInputHandler.h).
//
// Chaque profil d'interaction OpenXR (Touch du Quest, Index, Vive, Windows Mixed Reality) a son réglage
// par défaut (defaultControllerSetting) ; celui des Touch est la règle d'origine : gâchettes = flippers,
// A = valider, B = retour, ≡ gauche = menu du casque, X = crédit, B tenu 1,5 s = quitter, Y = lancer la bille,
// poignées = MagnaSave, joystick gauche = déplacer, joystick droit = lanceur. Les clics des deux joysticks, enfoncés
// ensemble 3 s, calent la borne, au menu comme en partie (CALIBRATION_COMBO) : ils ne font rien d'autre. Le compagnon
// (packages/casque-vr) lit tous les éléments du catalogue (CONTROLLER_ELEMENTS) et envoie
// « bouton <élément> 1|0 », ou « bouton <axe>-haut|bas|gauche|droite 1|0 » ; l'assistant des manettes
// (app/src/frontend.ts) les prend un par un.

import { formatMapping, mappingKey, parseMapping, VPX_INPUT_DEFAULTS } from './buttons';
import { t } from './i18n';
import { IniDocument } from './ini';
import type { RemoteButton } from './remote';
import type { VpxSetting } from './vpx';

/** Ce que fait le menu de Cyber Pinball d'un bouton des manettes : le bouton de la borne qu'il tient, ou le menu du casque. */
export type HeadsetMenuAction = RemoteButton | 'headset-menu';

/** Profils d'interaction OpenXR pris en charge (le compagnon dit « profil <nom> »). */
export type HeadsetProfile = 'touch' | 'index' | 'vive' | 'wmr';

export const HEADSET_PROFILES: Readonly<Record<HeadsetProfile, { path: string; label: string }>> = {
  touch: { path: '/interaction_profiles/oculus/touch_controller', label: 'Meta Quest (Touch)' },
  index: { path: '/interaction_profiles/valve/index_controller', label: 'Valve Index' },
  vive: { path: '/interaction_profiles/htc/vive_controller', label: 'HTC Vive' },
  wmr: { path: '/interaction_profiles/microsoft/motion_controller', label: 'Windows Mixed Reality' },
};

export function isHeadsetProfile(name: string): name is HeadsetProfile {
  return Object.hasOwn(HEADSET_PROFILES, name);
}

/** Boutons des manettes (« bouton <élément> 1|0 »). */
export type ControllerButton =
  | 'gachette-gauche'
  | 'gachette-droite'
  | 'poignee-gauche'
  | 'poignee-droite'
  | 'a'
  | 'b'
  | 'x'
  | 'y'
  | 'menu-gauche'
  | 'menu-droit'
  | 'clic-joystick-gauche'
  | 'clic-joystick-droit'
  | 'clic-pave-gauche'
  | 'clic-pave-droit';
/** Axes des manettes (« bouton <axe>-haut|bas|gauche|droite 1|0 »). */
export type ControllerAxis = 'joystick-gauche' | 'joystick-droit' | 'pave-gauche' | 'pave-droit';
export type ControllerElement = ControllerButton | ControllerAxis;
export type AxisDirection = 'haut' | 'bas' | 'gauche' | 'droite';

interface ElementDef {
  /** Le bouton tel que le joueur le voit (sur ses manettes). */
  readonly label: string;
  /** Chemin OpenXR, sous /user/hand/<main> : celui des boutons ; « <chemin>/x », « <chemin>/y » pour les axes. */
  readonly path: string;
  /** Rang de l'élément dans VPX (XRInputHandler.h) ; pour un axe, ses rangs x et y. */
  readonly vpx: number | readonly [number, number];
  readonly profiles: readonly HeadsetProfile[];
  readonly axis?: true;
}

const ALL: readonly HeadsetProfile[] = ['touch', 'index', 'vive', 'wmr'];

/**
 * Catalogue des éléments des manettes : ceux que VPX écoute aussi (XRInputHandler.h), et les profils
 * qui les ont (spécification OpenXR, profils d'interaction). Le compagnon lie chacun pour chaque profil.
 */
export const CONTROLLER_ELEMENTS: Readonly<Record<ControllerElement, ElementDef>> = {
  'gachette-gauche': { get label() { return t('Gâchette gauche'); }, path: 'left/input/trigger/value', vpx: 16, profiles: ALL },
  'gachette-droite': { get label() { return t('Gâchette droite'); }, path: 'right/input/trigger/value', vpx: 17, profiles: ALL },
  'poignee-gauche': { get label() { return t('Poignée gauche'); }, path: 'left/input/squeeze', vpx: 4, profiles: ALL },
  'poignee-droite': { get label() { return t('Poignée droite'); }, path: 'right/input/squeeze', vpx: 5, profiles: ALL },
  a: { label: 'A', path: 'right/input/a/click', vpx: 10, profiles: ['touch', 'index'] },
  b: { label: 'B', path: 'right/input/b/click', vpx: 11, profiles: ['touch', 'index'] },
  x: { label: 'X', path: 'left/input/x/click', vpx: 8, profiles: ['touch'] },
  y: { label: 'Y', path: 'left/input/y/click', vpx: 9, profiles: ['touch'] },
  'menu-gauche': { get label() { return t('≡ (manette gauche)'); }, path: 'left/input/menu/click', vpx: 2, profiles: ['touch', 'vive', 'wmr'] },
  'menu-droit': { get label() { return t('≡ (manette droite)'); }, path: 'right/input/menu/click', vpx: 3, profiles: ['vive', 'wmr'] },
  'clic-joystick-gauche': { get label() { return t('Clic du joystick gauche'); }, path: 'left/input/thumbstick/click', vpx: 12, profiles: ['touch', 'index', 'wmr'] },
  'clic-joystick-droit': { get label() { return t('Clic du joystick droit'); }, path: 'right/input/thumbstick/click', vpx: 13, profiles: ['touch', 'index', 'wmr'] },
  'clic-pave-gauche': { get label() { return t('Clic du pavé gauche'); }, path: 'left/input/trackpad/click', vpx: 14, profiles: ['vive', 'wmr'] },
  'clic-pave-droit': { get label() { return t('Clic du pavé droit'); }, path: 'right/input/trackpad/click', vpx: 15, profiles: ['vive', 'wmr'] },
  'joystick-gauche': { get label() { return t('Joystick gauche'); }, path: 'left/input/thumbstick', vpx: [20, 21], profiles: ['touch', 'index', 'wmr'], axis: true },
  'joystick-droit': { get label() { return t('Joystick droit'); }, path: 'right/input/thumbstick', vpx: [22, 23], profiles: ['touch', 'index', 'wmr'], axis: true },
  'pave-gauche': { get label() { return t('Pavé gauche'); }, path: 'left/input/trackpad', vpx: [24, 25], profiles: ['index', 'vive', 'wmr'], axis: true },
  'pave-droit': { get label() { return t('Pavé droit'); }, path: 'right/input/trackpad', vpx: [26, 27], profiles: ['index', 'vive', 'wmr'], axis: true },
};

export function isControllerElement(name: string): name is ControllerElement {
  return Object.hasOwn(CONTROLLER_ELEMENTS, name);
}

/** Un événement du compagnon : un bouton, ou la direction d'un axe. */
export function parseControllerEvent(name: string): { element: ControllerElement; direction?: AxisDirection } | undefined {
  if (isControllerElement(name) && !CONTROLLER_ELEMENTS[name].axis) return { element: name };
  const m = /^(.+)-(haut|bas|gauche|droite)$/.exec(name);
  if (m && isControllerElement(m[1]!) && CONTROLLER_ELEMENTS[m[1]!].axis) return { element: m[1]!, direction: m[2] as AxisDirection };
  return undefined;
}

/** Fonctions des manettes, dans l'ordre de l'assistant. */
export type HeadsetFunction =
  | 'flipper-gauche'
  | 'flipper-droit'
  | 'valider'
  | 'retour'
  | 'menu'
  | 'credit'
  | 'quitter'
  | 'magnasave-gauche'
  | 'magnasave-droit'
  | 'lancer'
  | 'lanceur'
  | 'deplacer';

interface FunctionDef {
  readonly id: HeadsetFunction;
  readonly label: string;
  /** Ce qu'elle fait au menu de Cyber Pinball, et en partie dans VPX. */
  readonly menu?: string;
  readonly game: string;
  /** Tenue par un axe (joystick ou pavé) plutôt qu'un bouton. */
  readonly axis?: true;
  /** Facultative : l'assistant permet de la passer. */
  readonly optional?: true;
}

export function headsetFunctions(): FunctionDef[] {
  return [
    { id: 'flipper-gauche', label: t('Flipper gauche'), menu: t('Précédent'), game: t('Flipper gauche') },
    { id: 'flipper-droit', label: t('Flipper droit'), menu: t('Suivant'), game: t('Flipper droit') },
    { id: 'valider', label: t('Valider, Start'), menu: t('Valider'), game: t('Start ; valider dans le menu de VPX') },
    // Obligatoire, la seule sortie d'une partie dans le casque (essai du 10 novembre 2026) : appui court, la pause
    // (Reprendre / Quitter) ; appui tenu 1,5 s, la partie quitte (plugin « CyberPinball », pause.h).
    { id: 'retour', label: t('Retour, Pause'), menu: t('Retour, annuler'), game: t('Pause : appui court, Reprendre ou Quitter ; tenu 1,5 s, quitter') },
    { id: 'menu', label: t('Menu du casque'), menu: t('Menu du casque : caler, recentrer la borne, manettes'), game: t('Menu de VPX ; retour dans ce menu') },
    { id: 'credit', label: t('Crédit'), menu: t('Collection suivante (roue)'), game: t('Crédit'), optional: true },
    // Facultatif : la sortie passe par Pause (un seul bouton à retenir, pas de sortie sur un appui malheureux).
    { id: 'quitter', label: t('Quitter la partie'), game: t('Quitter la partie'), optional: true },
    { id: 'magnasave-gauche', label: t('MagnaSave gauche'), game: t('MagnaSave gauche'), optional: true },
    { id: 'magnasave-droit', label: t('MagnaSave droit'), game: t('MagnaSave droit'), optional: true },
    { id: 'lancer', label: t('Lancer la bille'), game: t('Lancer la bille'), optional: true },
    { id: 'lanceur', label: t('Lanceur'), menu: t('Déplacer la sélection'), game: t('Lanceur : tirer vers soi, lâcher'), axis: true, optional: true },
    { id: 'deplacer', label: t('Déplacer la sélection'), menu: t('Déplacer la sélection'), game: t('Déplacer la sélection du menu de VPX ; secouer la table'), axis: true },
  ];
}

/** Réglage des manettes d'un casque, pour une configuration de Cyber Pinball. */
export interface ControllerSetting {
  profile: HeadsetProfile;
  functions: Partial<Record<HeadsetFunction, ControllerElement>>;
}

const DEFAULTS: Readonly<Record<HeadsetProfile, Partial<Record<HeadsetFunction, ControllerElement>>>> = {
  touch: {
    'flipper-gauche': 'gachette-gauche',
    'flipper-droit': 'gachette-droite',
    valider: 'a',
    retour: 'b',
    menu: 'menu-gauche',
    credit: 'x',
    'magnasave-gauche': 'poignee-gauche',
    'magnasave-droit': 'poignee-droite',
    // Y, libre : le clic du joystick droit sert au calage (CALIBRATION_COMBO, 12 novembre 2026).
    lancer: 'y',
    lanceur: 'joystick-droit',
    deplacer: 'joystick-gauche',
  },
  index: {
    'flipper-gauche': 'gachette-gauche',
    'flipper-droit': 'gachette-droite',
    valider: 'a',
    retour: 'b',
    menu: 'clic-joystick-gauche',
    'magnasave-gauche': 'poignee-gauche',
    'magnasave-droit': 'poignee-droite',
    lancer: 'clic-joystick-droit',
    lanceur: 'joystick-droit',
    deplacer: 'joystick-gauche',
  },
  vive: {
    'flipper-gauche': 'gachette-gauche',
    'flipper-droit': 'gachette-droite',
    valider: 'clic-pave-droit',
    retour: 'menu-droit',
    menu: 'menu-gauche',
    credit: 'clic-pave-gauche',
    'magnasave-gauche': 'poignee-gauche',
    'magnasave-droit': 'poignee-droite',
    lanceur: 'pave-droit',
    deplacer: 'pave-gauche',
  },
  wmr: {
    'flipper-gauche': 'gachette-gauche',
    'flipper-droit': 'gachette-droite',
    valider: 'clic-pave-droit',
    retour: 'menu-droit',
    menu: 'menu-gauche',
    credit: 'clic-pave-gauche',
    'magnasave-gauche': 'poignee-gauche',
    'magnasave-droit': 'poignee-droite',
    // Pas de bouton libre pour lancer la bille : le clic du joystick droit sert au calage.
    lanceur: 'joystick-droit',
    deplacer: 'joystick-gauche',
  },
};

/**
 * Caler la borne d'un geste, à tout moment (demande du 12 novembre 2026) : les deux boutons enfoncés ensemble,
 * tenus CALIBRATION_HOLD_S, au menu comme en partie (la partie se met en pause, on recale, on reprend). Deux
 * boutons qu'aucune fonction ne tient, ni au menu ni dans VPX, ni le bouton Meta : les clics des deux joysticks.
 * Les profils sans deux boutons libres (Index : le clic gauche ouvre le menu du casque ; Vive : tout est pris)
 * n'ont pas de combinaison : « Caler la borne » du menu du casque, ou du menu de la pause en partie.
 */
export const CALIBRATION_COMBO: Readonly<Partial<Record<HeadsetProfile, readonly [ControllerButton, ControllerButton]>>> = {
  touch: ['clic-joystick-gauche', 'clic-joystick-droit'],
  wmr: ['clic-joystick-gauche', 'clic-joystick-droit'],
};

/** Durée d'appui de la combinaison du calage (secondes) : 3 s, plus long que Quitter (demande du joueur, 12 novembre 2026) ; la même dans le plugin (pause.h, CALAGE_HOLD_S). */
export const CALIBRATION_HOLD_S = 3;

/** La combinaison du calage d'un profil, ou undefined. */
export function calibrationCombo(profile: HeadsetProfile | undefined): readonly [ControllerButton, ControllerButton] | undefined {
  return profile ? CALIBRATION_COMBO[profile] : undefined;
}

/** Ce que fait un appui ou un relâché dans la combinaison du calage. */
export type ComboEvent = 'clic' | 'debut' | 'lachee' | undefined;

/**
 * La combinaison du calage au menu, sans horloge à elle (13 novembre 2026 : au PinCab, l'assistant des manettes
 * ouvert d'office recevait les boutons avant elle, et le geste ne faisait rien). Elle ne dépend d'aucun réglage
 * des manettes, seulement du profil. `press` dit chaque changement ; `due` dit, une fois, que les deux boutons
 * sont tenus ensemble depuis CALIBRATION_HOLD_S.
 */
export class CalibrationComboHold {
  private readonly down = new Set<string>();
  private since: number | undefined;
  private fired = false;

  constructor(private readonly combo: readonly string[], private readonly holdMs = CALIBRATION_HOLD_S * 1000) {}

  /** Un bouton des manettes : `clic` (un des deux), `debut` (les deux tenus), `lachee` (lâchée avant l'heure). */
  press(name: string, isDown: boolean, now: number): ComboEvent {
    if (!this.combo.includes(name)) return undefined;
    const wasHeld = this.since !== undefined;
    if (isDown) this.down.add(name);
    else this.down.delete(name);
    const held = this.combo.every((b) => this.down.has(b));
    if (held && !wasHeld) {
      this.since = now;
      this.fired = false;
      return 'debut';
    }
    if (!held && wasHeld) {
      const early = !this.fired;
      this.since = undefined;
      return early ? 'lachee' : 'clic';
    }
    return 'clic';
  }

  /** Les deux tenus assez longtemps : vrai une seule fois par appui. */
  due(now: number): boolean {
    if (this.since === undefined || this.fired || now - this.since < this.holdMs) return false;
    this.fired = true;
    return true;
  }

  /** Tenue en cours, depuis cet instant (pour la jauge). */
  heldSince(): number | undefined {
    return this.fired ? undefined : this.since;
  }

  /** Tout relâché (casque retiré, compagnon parti). */
  reset(): void {
    this.down.clear();
    this.since = undefined;
    this.fired = false;
  }
}

/**
 * Les deux gâchettes tenues ensemble au menu, seules, pendant ce temps (secondes) : le geste du calage confondu
 * avec elles (essai du 13 novembre 2026 : le joueur tenait les gâchettes, pas les sticks) ; une aide le dit.
 */
export const TRIGGERS_HINT_S = 2;
/** La carte d'un geste dans le casque reste ce temps (millisecondes). */
export const GESTURE_CARD_MS = 6000;
/** Les profils de manettes que le schéma (app/renderer/schema-manettes.js) sait dessiner. */
export const CONTROLLER_SCHEMA_PROFILES: readonly HeadsetProfile[] = ['touch'];
/** Les éléments que le schéma sait mettre en vert (des boutons : pas les directions des joysticks). */
export const SCHEMA_ELEMENTS: readonly ControllerElement[] = ['a', 'b', 'x', 'y', 'menu-gauche', 'clic-joystick-gauche', 'clic-joystick-droit', 'gachette-gauche', 'gachette-droite', 'poignee-gauche', 'poignee-droite'];
export const TRIGGERS_HINT_COMBO: readonly ControllerButton[] = ['gachette-gauche', 'gachette-droite'];

/** La combinaison telle que le joueur la lit (« les deux joysticks enfoncés ensemble, 3 s »), ou undefined. */
export function calibrationComboLabel(profile: HeadsetProfile | undefined): string | undefined {
  return calibrationCombo(profile) ? t('enfoncez les deux sticks (sous les pouces) jusqu’au clic, 3 s') : undefined;
}

/** Le réglage par défaut d'un profil : celui des Touch est la règle d'origine (A valide, B revient…). */
export function defaultControllerSetting(profile: HeadsetProfile): ControllerSetting {
  return { profile, functions: { ...DEFAULTS[profile] } };
}

/** Fichier du réglage des manettes d'un casque pour une configuration (dans <données>\vr). */
export function controllerSettingFileName(configurationId: string | undefined, profile: HeadsetProfile): string {
  const safe = configurationId?.replace(/[^\w-]/g, '_');
  return safe ? `manettes-${safe}-${profile}.json` : `manettes-${profile}.json`;
}

/** Ce qui ne va pas dans un réglage : fonction obligatoire sans bouton, élément absent du profil, bouton pris deux fois. */
export function controllerProblem(setting: ControllerSetting): string | undefined {
  const used = new Map<ControllerElement, HeadsetFunction>();
  for (const f of headsetFunctions()) {
    const el = setting.functions[f.id];
    if (!el) {
      if (!f.optional) return t('{fonction} : aucun bouton', { fonction: f.label });
      continue;
    }
    const def = CONTROLLER_ELEMENTS[el];
    if (!def || !def.profiles.includes(setting.profile)) return t('{fonction} : {bouton} n’existe pas sur ces manettes', { fonction: f.label, bouton: def?.label ?? el });
    if (Boolean(def.axis) !== Boolean(f.axis)) return t('{fonction} : il faut {quoi}', { fonction: f.label, quoi: f.axis ? t('un joystick ou un pavé') : t('un bouton') });
    const other = used.get(el);
    if (other) return t('{bouton} sert déjà à {fonction}', { bouton: def.label, fonction: headsetFunctions().find((x) => x.id === other)!.label });
    if (calibrationCombo(setting.profile)?.includes(el as ControllerButton)) return t('{bouton} sert à caler la borne (les deux sticks enfoncés ensemble)', { bouton: def.label });
    used.set(el, f.id);
  }
  return undefined;
}

/**
 * Valider et retour croisés par rapport au défaut du profil (sur des Touch : B valide et A revient, met en
 * pause en partie) : un réglage complet, mais à l'envers de l'habitude, souvent fait sans le vouloir (essai
 * du 10 novembre 2026 : valider=b, retour=a). Cyber Pinball le dit et propose le réglage par défaut.
 */
export function controllerOddity(setting: ControllerSetting): string | undefined {
  const usual = DEFAULTS[setting.profile];
  const { valider, retour } = setting.functions;
  if (!usual.valider || !usual.retour || (valider !== usual.retour && retour !== usual.valider)) return undefined;
  const label = (el: ControllerElement | undefined) => (el ? CONTROLLER_ELEMENTS[el].label : '—');
  return t('Vos manettes sont réglées à l’envers de l’habitude : {valider} valide et {retour} revient (et met en pause en partie). D’habitude, {usualValider} valide et {usualRetour} revient.', {
    valider: label(valider),
    retour: label(retour),
    usualValider: label(usual.valider),
    usualRetour: label(usual.retour),
  });
}

/** Le joueur a vu la remarque de controllerOddity et gardé son réglage tel quel : on ne le lui redemande plus. */
export function controllerOddityKept(text: string | undefined): boolean {
  try {
    return Boolean(text && (JSON.parse(text) as { keptAsIs?: unknown }).keptAsIs === true);
  } catch {
    return false;
  }
}

/** Réglage lu d'un fichier : gardé seulement s'il est complet et cohérent ; sinon le défaut du profil. */
export function readControllerSetting(text: string | undefined, profile: HeadsetProfile): ControllerSetting {
  try {
    const raw = text ? (JSON.parse(text) as Partial<ControllerSetting>) : undefined;
    if (raw && raw.profile === profile && raw.functions && typeof raw.functions === 'object') {
      const functions: ControllerSetting['functions'] = {};
      for (const f of headsetFunctions()) {
        const el = (raw.functions as Record<string, unknown>)[f.id];
        if (typeof el === 'string' && isControllerElement(el)) functions[f.id] = el;
      }
      // Réglage d'avant la combinaison du calage : la fonction posée sur un de ses boutons revient à son défaut
      // si ce bouton-là est libre, sinon elle est retirée (lancer la bille ; jamais une fonction obligatoire).
      const combo = calibrationCombo(profile);
      for (const f of headsetFunctions()) {
        const el = functions[f.id];
        if (!el || !combo?.includes(el as ControllerButton)) continue;
        const usual = DEFAULTS[profile][f.id];
        delete functions[f.id];
        if (usual && !Object.values(functions).includes(usual)) functions[f.id] = usual;
      }
      const setting = { profile, functions };
      if (!controllerProblem(setting)) return setting;
    }
  } catch {
    // Fichier illisible : le défaut du profil.
  }
  return defaultControllerSetting(profile);
}

/** La fonction tenue par un élément (sauf un axe : voir menuActionOf). */
function functionOf(setting: ControllerSetting, element: ControllerElement): HeadsetFunction | undefined {
  return headsetFunctions().find((f) => setting.functions[f.id] === element)?.id;
}

/**
 * Ce que fait au menu de Cyber Pinball un événement des manettes (« a », « joystick-gauche-haut »…) :
 * flippers = précédent et suivant, valider, retour, menu du casque, crédit = collection suivante ; tout
 * joystick ou pavé déplace la sélection (haut et gauche : précédent ; bas et droite : suivant).
 */
export function menuActionOf(setting: ControllerSetting, event: string): HeadsetMenuAction | undefined {
  const parsed = parseControllerEvent(event);
  if (!parsed) return undefined;
  if (parsed.direction) return parsed.direction === 'haut' || parsed.direction === 'gauche' ? 'previous' : 'next';
  const fn = functionOf(setting, parsed.element);
  const actions: Partial<Record<HeadsetFunction, HeadsetMenuAction>> = {
    'flipper-gauche': 'previous',
    'flipper-droit': 'next',
    valider: 'confirm',
    retour: 'exit',
    menu: 'headset-menu',
    credit: 'zone',
  };
  return fn ? actions[fn] : undefined;
}

/** Un bouton des manettes : ce qu'il fait au menu de Cyber Pinball (et au calage), et en partie dans VPX. */
export interface HeadsetControl {
  id: HeadsetFunction;
  /** L'élément des manettes (pour le schéma : SCHEMA_ELEMENTS). */
  element: ControllerElement;
  /** Le bouton, tel que le joueur le voit. */
  label: string;
  /** Au menu de Cyber Pinball dans le casque ; undefined : rien. */
  menu?: string;
  /** En partie, dans VPX. */
  game: string;
}

/** La légende des manettes d'un réglage : chaque fonction tenue, son bouton, au menu et en partie. */
export function headsetControls(setting: ControllerSetting = defaultControllerSetting('touch')): HeadsetControl[] {
  return headsetFunctions().flatMap((f) => {
    const el = setting.functions[f.id];
    return el ? [{ id: f.id, element: el, label: CONTROLLER_ELEMENTS[el].label, ...(f.menu && { menu: f.menu }), game: f.game }] : [];
  });
}

/** Rangs des éléments des manettes dans VPX 10.8.1 (XRInputHandler.h ; l'INI les écrit « OpenXR;<rang> »). */
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

/**
 * Touches du clavier que le plugin « CyberPinball » poste à VPX pour caler la borne en partie (pause.h,
 * cyberpinball.cpp) : F13 met en marche puis arrête l'alignement de la table sur les manettes
 * (VRControllerCalibration), F14 et F15 la montent et la descendent d'un centimètre (VRUp, VRDown). Codes SDL.
 */
export const VPX_CALIBRATION_KEYS = { VRControllerCalibration: 104, VRUp: 105, VRDown: 106 } as const;

/** Une entrée « OpenXR;<rang>[;o|x;<seuil>] » comme VPX l'écrit (InputAction::GetMappingString). */
function xr(element: number, threshold?: number): string {
  return threshold === undefined ? `OpenXR;${element}` : `OpenXR;${element};${threshold < 0 ? 'x' : 'o'};${threshold.toFixed(6)}`;
}

/**
 * Joystick incliné qui déplace la sélection du menu de VPX : 0,6, comme au menu de Cyber Pinball
 * (VPX met 0,9 : il fallait pousser le joystick à fond, essai du 10 novembre 2026).
 */
const UI_STICK = 0.6;

/** Liaison d'un bouton dans VPX : une gâchette se lit sur sa course (0,3 ; 0,6 pour le flipper en deux temps). */
function vpxButton(element: ControllerElement, staged = false): string {
  const v = CONTROLLER_ELEMENTS[element].vpx as number;
  return element === 'gachette-gauche' || element === 'gachette-droite' ? xr(v, staged ? 0.6 : 0.3) : xr(v);
}

/**
 * Liaisons OpenXR de chaque action de VPX en partie, d'après un réglage. Dans le menu de VPX, UIRight
 * « augmente ou valide » et InGameUI « revient en arrière » (InputManager.cpp). Ce menu, dessiné
 * collé aux yeux en VR (vs_imgui.sc), ne s'ouvre que par le bouton du menu du casque : le retour met
 * la partie en pause et la reprend (Pause ; décision du 10 novembre 2026). Le clic du joystick gauche n'aligne jamais la table sur les manettes
 * (VRControllerCalibration, liaison par défaut de VPX) : elle ne bouge que sur demande, par le plugin, au calage
 * (touche F13, VPX_CALIBRATION_KEYS). Les boutons de la combinaison du calage sont liés à Custom1 et Custom2, sans
 * autre rôle : le plugin les reconnaît (numéros 52 et 53 de VPX 10.8.1) et ne les laisse jamais à la table.
 */
export function vpxMappingsFor(setting: ControllerSetting): Record<string, string[]> {
  const f = setting.functions;
  const combo = calibrationCombo(setting.profile);
  const button = (fn: HeadsetFunction, staged = false) => (f[fn] ? [vpxButton(f[fn]!, staged)] : []);
  const axes = (['deplacer', 'lanceur'] as const).flatMap((fn) => (f[fn] ? [CONTROLLER_ELEMENTS[f[fn]!].vpx as readonly [number, number]] : []));
  return {
    LeftFlipper: button('flipper-gauche'),
    RightFlipper: button('flipper-droit'),
    LeftStagedFlipper: button('flipper-gauche', true),
    RightStagedFlipper: button('flipper-droit', true),
    LeftMagna: button('magnasave-gauche'),
    RightMagna: button('magnasave-droit'),
    Start: button('valider'),
    UIRight: [...axes.map(([x]) => xr(x, UI_STICK)), ...button('valider')],
    UILeft: axes.map(([x]) => xr(x, -UI_STICK)),
    UIUp: axes.map(([, y]) => xr(y, UI_STICK)),
    UIDown: axes.map(([, y]) => xr(y, -UI_STICK)),
    InGameUI: button('menu'),
    Pause: button('retour'),
    Credit1: button('credit'),
    ExitGame: button('quitter'),
    LaunchBall: button('lancer'),
    VRControllerCalibration: [`Key;${VPX_CALIBRATION_KEYS.VRControllerCalibration}`],
    VRUp: [`Key;${VPX_CALIBRATION_KEYS.VRUp}`],
    VRDown: [`Key;${VPX_CALIBRATION_KEYS.VRDown}`],
    Custom1: combo ? [xr(CONTROLLER_ELEMENTS[combo[0]].vpx as number)] : [],
    Custom2: combo ? [xr(CONTROLLER_ELEMENTS[combo[1]].vpx as number)] : [],
  };
}

/** Les liaisons de VPX du réglage par défaut des Touch. */
export const VPX_HEADSET_MAPPINGS: Readonly<Record<string, readonly string[]>> = vpxMappingsFor(defaultControllerSetting('touch'));

const INPUT = 'Input';
const SENSOR_KEY = /^Mapping\.(Plunger|Nudge)\d+\./i;
const isXr = (part: string) => /^OpenXR;/i.test(part.trim());

/**
 * Section [Input] de l'INI d'une partie dans le casque : les liaisons des manettes de VPX remplacées
 * par celles du réglage (touches du clavier et autres périphériques gardés), la disposition automatique
 * de VPX coupée pour elles (Device.OpenXR.NoAutoLayout : sans quoi VPX remet ses liaisons dès qu'il en
 * manque une, InputManager::SetDeviceDefaultMapping), le lanceur sur l'axe du lanceur (tiré vers soi)
 * et les secousses sur celui qui déplace la sélection. Seules les valeurs qui changent sont rendues.
 */
export function vpxHeadsetInput(text: string, setting: ControllerSetting = defaultControllerSetting('touch')): VpxSetting[] {
  const doc = IniDocument.parse(text);
  const settings: VpxSetting[] = [];
  const put = (key: string, value: string) => {
    if ((doc.get(INPUT, key) ?? '').trim() !== value) settings.push({ section: INPUT, key, value });
  };
  put('Device.OpenXR.NoAutoLayout', '1');
  const mappings = vpxMappingsFor(setting);
  const inIni = doc
    .entries()
    .filter((e) => e.section.toLowerCase() === INPUT.toLowerCase() && /^Mapping\./i.test(e.key) && !SENSOR_KEY.test(e.key))
    .map((e) => e.key.slice('Mapping.'.length));
  for (const action of new Set([...Object.keys(mappings), ...inIni])) {
    const raw = doc.get(INPUT, mappingKey(action))?.trim();
    const current = raw || (VPX_INPUT_DEFAULTS[action] !== undefined ? `Key;${VPX_INPUT_DEFAULTS[action]}` : '');
    const kept = parseMapping(current).filter((alt) => !alt.some(isXr));
    const added = (mappings[action] ?? []).filter((m) => !kept.some((alt) => alt.length === 1 && alt[0] === m));
    const value = formatMapping([...kept, ...added.map((m) => [m])]);
    // Valeur vide : VPX prendrait sa liaison par défaut, celle du clavier (aucune pour VRControllerCalibration).
    if (value !== (raw ?? '') && !(value === current && !raw)) settings.push({ section: INPUT, key: mappingKey(action), value });
  }
  // Capteurs : celui des manettes (OpenXR) mis sur l'axe du réglage, ou ajouté après ceux de la borne.
  const count = (key: string) => Math.max(0, Math.floor(Number(doc.get(INPUT, key)) || 0));
  const plunger = setting.functions.lanceur && (CONTROLLER_ELEMENTS[setting.functions.lanceur].vpx as readonly [number, number]);
  const plungers = count('PlungerSensorCount');
  const plungerAt = Array.from({ length: plungers }, (_, i) => i).find((i) => isXr(doc.get(INPUT, `Mapping.Plunger${i}.Position`) ?? ''));
  if (plunger) {
    const value = `OpenXR;${plunger[1]};P;0.000000;-1.000000;1.000000`;
    if (plungerAt !== undefined) put(`Mapping.Plunger${plungerAt}.Position`, value);
    else settings.push({ section: INPUT, key: `Mapping.Plunger${plungers}.Position`, value }, { section: INPUT, key: 'PlungerSensorCount', value: String(plungers + 1) });
  }
  const nudge = setting.functions.deplacer && (CONTROLLER_ELEMENTS[setting.functions.deplacer].vpx as readonly [number, number]);
  const nudges = count('NudgeSensorCount');
  const nudgeAt = Array.from({ length: nudges }, (_, i) => i).find((i) => isXr(doc.get(INPUT, `Mapping.Nudge${i}.X`) ?? '') || isXr(doc.get(INPUT, `Mapping.Nudge${i}.Y`) ?? ''));
  if (nudge) {
    const x = `OpenXR;${nudge[0]};P;0.000000;1.000000;1.000000`;
    const y = `OpenXR;${nudge[1]};P;0.000000;1.000000;1.000000`;
    if (nudgeAt !== undefined) {
      put(`Mapping.Nudge${nudgeAt}.X`, x);
      put(`Mapping.Nudge${nudgeAt}.Y`, y);
    } else
      settings.push(
        { section: INPUT, key: `Mapping.Nudge${nudges}.Type`, value: '0' },
        { section: INPUT, key: `Mapping.Nudge${nudges}.Strength`, value: '1.0' },
        { section: INPUT, key: `Mapping.Nudge${nudges}.X`, value: x },
        { section: INPUT, key: `Mapping.Nudge${nudges}.Y`, value: y },
        { section: INPUT, key: 'NudgeSensorCount', value: String(nudges + 1) },
      );
  }
  return settings;
}
