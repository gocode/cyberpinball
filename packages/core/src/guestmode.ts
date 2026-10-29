// Mode invité (Menu système > Borne > Mode invité) : une soirée, des enfants. On choisit une
// table, on ouvre sa fiche, on joue, on lit le prospectus, les règles et les commandes ; rien
// d'autre ne se modifie, ne se supprime ni ne se dérègle.
//
// Chaque porte d'entrée de l'interface (touche, bouton, clic, fichiers glissés, fermeture d'une
// fenêtre, action d'un écran) porte un nom de GUEST_DOORS. En mode invité, seules les portes
// ouvertes laissent passer ; une action d'écran sans porte est fermée. Une action nouvelle reste
// donc interdite à l'invité tant qu'on ne l'a pas déclarée ici, et guestmode.test.ts fige la
// liste des portes ouvertes et relève, dans app/src, toute source d'entrées qui n'y passerait pas.
//
// Déverrouillage : les deux flippers et les deux MagnaSave tenus ensemble 3 s, depuis le menu
// (jamais pendant une partie : VPX a alors les boutons). Chaque main tient son flipper et la
// MagnaSave d'à côté, le geste même de la MagnaSave : faisable seul, sans lâcher la borne ;
// quatre boutons tenus à la fois n'arrivent jamais par hasard dans un menu qui se pilote un
// bouton à la fois. Le réglage est gardé dans <données>\mode-invite.json.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BUTTONS, buttonKeys, keyLabel } from './buttons';
import { t } from './i18n';
import type { ButtonId, CabinetButtons } from './model';

/** Portes d'entrée de l'interface, ouvertes (true) ou non à l'invité : choisir, lire, jouer ; tout le reste est fermé. */
export const GUEST_DOORS = {
  // Menu des tables (app/src/frontend.ts, handleKey et clics)
  'menu.choose': true, // Choisir une table : flippers, flèches, roue, clic
  'menu.sheet': true, // Ouvrir la fiche de la table : Start, clic
  'menu.commands': true, // Aide-mémoire des commandes : bouton Aide, H, F1
  'menu.system': false, // Menu système : Exit, Tab, roue dentée
  'menu.vpx-settings': false, // Réglages de VPX : bouton Réglages, R
  'shortcut.desktop': false, // Bureau Windows : Ctrl+Maj+D
  'shortcut.quit': false, // Quitter Cyber Pinball : Ctrl+Q
  'window.close': false, // Fermer une fenêtre de Cyber Pinball : Alt+F4
  'files.drop': false, // Fichiers glissés sur la fenêtre : ajout d’une table, d’un média
  'game.force-stop': true, // Arrêter une partie bloquée : Ctrl+Maj+K, pendant la partie
  // Messages du menu (frontend.ts, Message.action) : Start fait leur action ; Exit les ferme toujours, sans rien faire d'autre.
  'message.other-frontend': true, // Jouer quand même, un autre menu de borne ouvert
  'message.power': true, // Extinction, veille ou redémarrage en cours (une action programmée peut arriver en mode invité) : l'écran noir reste, Start et Exit n'y font rien
  'message.wizard': false, // Relancer l’assistant des écrans
  'message.install-vpx': false, // Installer VPX
  'message.add-table': false, // Ajouter une table
  'message.manual-edits': false, // Garder ou remettre les valeurs de VPinballX.ini changées à la main
  'message.buttons': false, // Refaire l’étape « Boutons »
  'message.interface': false, // Refaire l’étape « Boutons de l’interface »
  'message.journey': false, // Ce qu’il manque pour jouer, après une partie échouée
  'message.orientation': false, // Rendre à Windows l’orientation du bureau qu’une version précédente avait changée
  // Fiche d'une table (app/src/library.ts, buildSheet)
  'sheet.play': true, // Jouer
  'sheet.read': true, // Prospectus et règles, page par page
  'sheet.back': true, // Retour au menu
  'sheet.missing': false, // Ce qu’il manque pour jouer (téléchargements)
  'sheet.further': false, // Pour aller plus loin (téléchargements)
  'sheet.edit': false, // Modifier les informations
  'sheet.medias': false, // Médias du jeu
  'sheet.parts': false, // Parties du jeu (ajouter, remplacer, retirer)
  'sheet.files': false, // Fichiers de la table
  'sheet.pup': false, // Options du PuP-Pack
  'sheet.display': false, // Régler l’affichage en partie
  'sheet.record': false, // Jouer et enregistrer (vidéo de présentation de la table sur la roue)
  'sheet.table-settings': false, // Réglages de cette table
  'sheet.doctor': false, // Diagnostiquer et réparer
  'sheet.remove': false, // Supprimer la table
} as const satisfies Record<string, boolean>;

export type GuestDoor = keyof typeof GUEST_DOORS;

/** Portes ouvertes à l'invité. */
export function openGuestDoors(): GuestDoor[] {
  return (Object.keys(GUEST_DOORS) as GuestDoor[]).filter((door) => GUEST_DOORS[door]);
}

/** Durée de la combinaison de déverrouillage. */
export const GUEST_UNLOCK_MS = 3000;
/** Durée de l'indice « Verrouillé » après une porte fermée. */
export const GUEST_HINT_MS = 3000;
/** Durée du constat « Mode invité désactivé », à la place du cadenas, après le déverrouillage. */
export const GUEST_UNLOCKED_MS = 4000;

/** Boutons de la combinaison de déverrouillage, main gauche puis main droite. */
export const GUEST_UNLOCK_BUTTONS: readonly ButtonId[] = ['leftFlipper', 'leftMagna', 'rightFlipper', 'rightMagna'];

export interface UnlockSlot {
  button: ButtonId;
  /** Touches qui tiennent ce bouton : celle de la borne, et celle d'un clavier si aucun autre bouton ne l'a prise. */
  codes: string[];
}

/**
 * Les quatre boutons de la combinaison, avec les touches de cette borne. Un bouton sans touche
 * (MagnaSave passée à l'étape « Boutons ») est tenu par sa touche par défaut d'un clavier (Ctrl
 * gauche, Ctrl droit) ; la touche par défaut sert aussi, en plus de celle de la borne, tant
 * qu'aucun autre bouton ne l'a prise : un clavier branché déverrouille toujours.
 */
export function guestUnlockSlots(buttons: CabinetButtons | undefined): UnlockSlot[] {
  const keys = buttonKeys(buttons);
  const taken = (code: string, id: ButtonId) => Object.entries(keys).some(([other, c]) => other !== id && c === code);
  return GUEST_UNLOCK_BUTTONS.map((id) => {
    const fallback = BUTTONS.find((b) => b.id === id)!.default;
    const own = keys[id];
    return { button: id, codes: [...new Set([...(own ? [own] : []), ...(taken(fallback, id) ? [] : [fallback])])] };
  });
}

/** La combinaison en clair, main par main, avec les boutons de cette borne : « Flipper gauche + MagnaSave gauche ». */
export function guestUnlockHands(buttons: CabinetButtons | undefined): { left: string; right: string } {
  const keys = buttonKeys(buttons);
  // MagnaSave sans touche relevée : celle d'un clavier, nommée.
  const magna = (id: ButtonId, label: string) => (keys[id] ? label : t('{button} ({key} d’un clavier)', { button: label, key: keyLabel(BUTTONS.find((b) => b.id === id)!.default) }));
  return {
    left: t('Flipper gauche + {magna}', { magna: magna('leftMagna', t('MagnaSave gauche')) }),
    right: t('Flipper droit + {magna}', { magna: magna('rightMagna', t('MagnaSave droit')) }),
  };
}

const settingsFile = (dataDir: string) => path.join(dataDir, 'mode-invite.json');

/** Mode invité enregistré ; un fichier absent ou illisible : désactivé. */
export function loadGuestMode(dataDir: string): boolean {
  try {
    return JSON.parse(fs.readFileSync(settingsFile(dataDir), 'utf8').replace(/^﻿/, '')).active === true;
  } catch {
    return false;
  }
}

export function saveGuestMode(dataDir: string, active: boolean): void {
  const file = settingsFile(dataDir);
  fs.mkdirSync(dataDir, { recursive: true });
  const tmp = `${file}.tmp-${process.pid}`;
  fs.writeFileSync(tmp, JSON.stringify({ active }, null, 2) + '\n', 'utf8');
  fs.renameSync(tmp, file);
}

/**
 * Ce que le playfield montre du mode invité, dans le coin de la roue dentée : le cadenas, l'indice,
 * l'anneau du déverrouillage ; inactif, le constat « Mode invité désactivé » juste après le déverrouillage.
 */
export interface GuestView {
  active: boolean;
  hint?: string;
  unlocking?: { since: number; ms: number };
}

export interface GuestModeOptions {
  dataDir: string;
  /** Boutons de la borne en vigueur : la combinaison suit leurs touches. */
  buttons(): CabinetButtons | undefined;
  /** L'affichage a changé (indice, anneau, verrou) : à redessiner. */
  onChange(): void;
  /** Combinaison tenue jusqu'au bout : le mode invité vient de s'arrêter. */
  onUnlock(): void;
  now?(): number;
}

/**
 * État du mode invité : actif ou non (gardé d'un démarrage à l'autre), portes, indice
 * « Verrouillé », et combinaison de déverrouillage (touches tenues, minuterie).
 */
export class GuestMode {
  private on: boolean;
  private hintUntil = 0;
  private hintTimer: NodeJS.Timeout | undefined;
  private unlockedUntil = 0;
  /** Touches de la combinaison tenues en ce moment. */
  private held = new Set<string>();
  private unlockSince: number | undefined;
  private unlockTimer: NodeJS.Timeout | undefined;

  constructor(private readonly options: GuestModeOptions) {
    this.on = loadGuestMode(options.dataDir);
  }

  get active(): boolean {
    return this.on;
  }

  private now(): number {
    return this.options.now?.() ?? Date.now();
  }

  /** Active ou arrête le mode invité, et le garde pour le démarrage suivant. */
  set(active: boolean): void {
    this.on = active;
    if (active) this.unlockedUntil = 0;
    this.releaseAll();
    this.hintUntil = 0;
    try {
      saveGuestMode(this.options.dataDir, active);
    } catch (error) {
      console.log(`Mode invité : réglage non enregistré (${(error as Error).message}).`);
    }
    this.options.onChange();
  }

  /** La porte laisse passer : hors mode invité toujours, en mode invité seulement si elle est ouverte. */
  allows(door: GuestDoor | undefined): boolean {
    return !this.on || (door !== undefined && GUEST_DOORS[door]);
  }

  /**
   * Quelqu'un passe par cette porte : vrai s'il peut entrer. Sinon, l'indice « Verrouillé »
   * paraît quelques secondes près du cadenas, et rien d'autre ne se passe. Sans nom de porte
   * (une action ou un écran qui n'en déclare pas) : fermée.
   */
  knock(door: GuestDoor | undefined): boolean {
    if (this.allows(door)) return true;
    console.log(`Mode invité : porte fermée (${door ?? 'sans nom'}).`);
    this.hintUntil = this.now() + GUEST_HINT_MS;
    clearTimeout(this.hintTimer);
    this.hintTimer = setTimeout(() => this.options.onChange(), GUEST_HINT_MS + 50);
    this.options.onChange();
    return false;
  }

  /**
   * Touche appuyée ou relâchée, en mode invité : suit la combinaison de déverrouillage.
   * `listening` : faux pendant une partie ou son chargement (rien n'est alors compté). Vrai
   * quand l'appui ne doit rien faire d'autre : un bouton de la combinaison appuyé alors qu'un
   * autre est déjà tenu (les flippers ne font pas défiler le menu pendant qu'on déverrouille).
   */
  input(code: string, down: boolean, listening: boolean): boolean {
    if (!this.on) return false;
    if (!listening) {
      this.releaseAll();
      return false;
    }
    const slots = guestUnlockSlots(this.options.buttons());
    if (!slots.some((s) => s.codes.includes(code))) return false;
    if (!down) {
      this.held.delete(code);
      this.stopUnlock();
      return false;
    }
    const others = [...this.held].some((c) => c !== code);
    this.held.add(code);
    if (!this.unlockSince && slots.every((s) => s.codes.some((c) => this.held.has(c)))) this.startUnlock();
    return others;
  }

  /** Oublie les touches tenues (fenêtre quittée, partie lancée). */
  releaseAll(): void {
    this.held.clear();
    this.stopUnlock();
  }

  view(): GuestView | undefined {
    if (!this.on) return this.unlockedUntil > this.now() ? { active: false } : undefined;
    return {
      active: true,
      ...(this.hintUntil > this.now() && { hint: t('Verrouillé · mode invité') }),
      ...(this.unlockSince !== undefined && { unlocking: { since: this.unlockSince, ms: GUEST_UNLOCK_MS } }),
    };
  }

  dispose(): void {
    clearTimeout(this.hintTimer);
    clearTimeout(this.unlockTimer);
  }

  private startUnlock(): void {
    this.unlockSince = this.now();
    this.hintUntil = 0;
    this.unlockTimer = setTimeout(() => {
      this.unlockSince = undefined;
      this.held.clear();
      this.unlockedUntil = this.now() + GUEST_UNLOCKED_MS;
      clearTimeout(this.hintTimer);
      this.hintTimer = setTimeout(() => this.options.onChange(), GUEST_UNLOCKED_MS + 50);
      this.set(false);
      this.options.onUnlock();
    }, GUEST_UNLOCK_MS);
    this.options.onChange();
  }

  private stopUnlock(): void {
    if (this.unlockSince === undefined) return;
    clearTimeout(this.unlockTimer);
    this.unlockSince = undefined;
    this.options.onChange();
  }
}
