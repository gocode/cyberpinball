// Étapes de l'assistant de la borne, enchaînées (assistant complet) ou refaites
// seules depuis le menu système, et sortie sans enregistrer, commune à toutes.
//
// Chaque étape seule ne décide que de ses champs du modèle (le reste est gardé tel
// qu'enregistré) et n'écrit que ses clés de VPinballX.ini (SyncOptions.only), y
// compris celles changées à la main ; les autres restent telles quelles.
//
// Sortie sans enregistrer : bouton « Quitter sans enregistrer » à la souris, Ctrl+Q,
// Échap maintenue 2 s, Exit maintenu 2 s ; pendant le relevé des boutons, où l'on ne
// sait pas encore quelle touche est Exit, n'importe quelle touche maintenue 3 s. Le
// relevé se fait au relâchement : une touche maintenue n'est jamais relevée.

import { VPX_AUDIO_OWNED_KEYS } from './audio';
import { BUTTONS, buttonKeys, isInputKey, keyLabel } from './buttons';
import { EDGE_LABELS } from './layout';
import { ROLES, type Cabinet, type RoleId } from './model';
import { VPX_LAYOUT_KEYS } from './vpx';

/** Étapes de l'assistant (états de wizard.ts) ; « done » : enregistré, résultat affiché. */
export const WIZARD_PHASES = ['buttons', 'buttonsSummary', 'assign', 'orient', 'flip', 'size', 'arrange', 'sound', 'channels', 'summary', 'done'] as const;
export type WizardPhase = (typeof WIZARD_PHASES)[number];

/** Relevé des boutons : tant qu'il dure, les touches de la borne ne sont pas sûres. */
export const CAPTURE_PHASES: readonly WizardPhase[] = ['buttons', 'buttonsSummary'];

export type WizardStepId = 'boutons' | 'ecrans' | 'playfield' | 'disposition' | 'son';

/** Champs du modèle de borne qu'une étape peut décider. */
export type CabinetField = 'buttons' | 'screens' | 'roles' | 'zones' | 'playfield' | 'audio';

export interface WizardStep {
  id: WizardStepId;
  /** Option de la ligne de commande, après --assistant. */
  flag: string;
  /** Entrée du sous-menu « Configuration de la borne ». */
  label: string;
  detail: string;
  /** Titre de l'écran final. */
  saved: string;
  /** Étapes parcourues, dans l'ordre ; « done » n'en fait pas partie. */
  phases: readonly WizardPhase[];
  /** Champs du modèle décidés par l'étape ; les autres sont gardés tels qu'enregistrés. */
  fields: readonly CabinetField[];
  /** Clés de VPinballX.ini (« Section.Clé ») que l'étape écrit, et reprend en main si elles ont été changées à la main. */
  owns: (id: string) => boolean;
}

/**
 * Fenêtres de VPX et cadrage : ce que décident les écrans, leurs zones et la forme du
 * playfield (CabinetAutofitMode : valeur proposée avec la vue borne).
 */
export function isLayoutKey(id: string): boolean {
  return /^(Player\.Playfield|Backglass\.|ScoreView\.|Topper\.)/i.test(id) || [...VPX_LAYOUT_KEYS, 'CabinetAutofitMode'].some((k) => id.toLowerCase() === `player.${k}`.toLowerCase());
}

/** Sorties audio et mixage du plateau ([Player] SoundDevice, SoundDeviceBG, Sound3D). */
export function isAudioKey(id: string): boolean {
  return VPX_AUDIO_OWNED_KEYS.some((k) => id.toLowerCase() === `player.${k}`.toLowerCase());
}

export const WIZARD_STEPS: readonly WizardStep[] = [
  {
    id: 'boutons',
    flag: '--boutons',
    label: 'Boutons de la borne',
    detail: 'Appuyer sur chaque bouton : flippers, Start, Exit, crédit…',
    saved: 'Boutons enregistrés',
    phases: ['buttons', 'buttonsSummary'],
    fields: ['buttons'],
    owns: isInputKey,
  },
  {
    id: 'ecrans',
    flag: '--ecrans',
    label: 'Écrans et rôles',
    detail: 'Quel écran affiche le playfield, le backglass, le DMD, le topper',
    saved: 'Écrans enregistrés',
    // Le bord des flippers et la diagonale ne sont redemandés que si le playfield change d'écran.
    phases: ['assign', 'arrange', 'orient', 'flip', 'size', 'summary'],
    fields: ['screens', 'roles', 'zones'],
    owns: isLayoutKey,
  },
  {
    id: 'playfield',
    flag: '--playfield',
    label: 'Orientation et taille du playfield',
    detail: 'Bord des flippers, retournement de l’écran, diagonale',
    saved: 'Playfield enregistré',
    phases: ['orient', 'flip', 'size', 'summary'],
    fields: ['screens', 'playfield'],
    owns: isLayoutKey,
  },
  {
    id: 'disposition',
    flag: '--disposition',
    label: 'Disposition des écrans',
    detail: 'Place et taille du playfield, du backglass, du DMD et du topper sur chaque écran',
    saved: 'Disposition enregistrée',
    phases: ['arrange'],
    fields: ['screens', 'roles', 'zones'],
    owns: isLayoutKey,
  },
  {
    id: 'son',
    flag: '--son',
    label: 'Son de la borne',
    detail: 'Sortie audio du fronton et du plateau, test des haut-parleurs',
    saved: 'Son enregistré',
    phases: ['sound', 'channels', 'summary'],
    fields: ['audio'],
    owns: isAudioKey,
  },
];

/** Étapes de l'assistant complet, dans l'ordre. */
export const FULL_WIZARD_PHASES: readonly WizardPhase[] = WIZARD_PHASES.filter((p) => p !== 'done');

/** Options de la ligne de commande propres à l'assistant (retirées pour revenir au menu). */
export const WIZARD_FLAGS: readonly string[] = ['--assistant', '--nouvelle-configuration', ...WIZARD_STEPS.map((s) => s.flag)];

/** Étape seule demandée sur la ligne de commande ; la première si plusieurs. */
export function wizardStepOf(argv: readonly string[]): WizardStep | undefined {
  return WIZARD_STEPS.find((s) => argv.includes(s.flag));
}

export function wizardStepInfo(id: WizardStepId): WizardStep {
  return WIZARD_STEPS.find((s) => s.id === id)!;
}

/**
 * Modèle enregistré après une étape seule : seuls ses champs viennent de `built` ;
 * les écrans s'ajoutent à ceux connus (un écran débranché reste dans le modèle).
 * Les clés que l'étape reprend en main sortent de vpxManual.
 */
export function stepCabinet(previous: Cabinet, built: Cabinet, step: Pick<WizardStep, 'fields' | 'owns'>, extra: readonly CabinetField[] = []): Cabinet {
  const next: Cabinet = { ...previous, vpx: built.vpx, updatedAt: built.updatedAt };
  for (const field of new Set([...step.fields, ...extra])) {
    if (field === 'screens') {
      const fresh = new Map(built.screens.map((s) => [s.fingerprint, s]));
      const known = new Set(previous.screens.map((s) => s.fingerprint));
      next.screens = [...previous.screens.map((s) => fresh.get(s.fingerprint) ?? s), ...built.screens.filter((s) => !known.has(s.fingerprint))];
    } else if (built[field] === undefined) delete next[field];
    else (next as unknown as Record<string, unknown>)[field] = built[field];
  }
  const vpxManual = previous.vpxManual?.filter((id) => !step.owns(id));
  if (vpxManual?.length) next.vpxManual = vpxManual;
  else delete next.vpxManual;
  return next;
}

// ---------------------------------------------------------------------------
// Quitter sans enregistrer

/** Durées de maintien qui ouvrent « Quitter sans enregistrer ? ». */
export const QUIT_HOLD_MS = {
  /** Échap d'un clavier, ou le bouton Exit de la borne une fois relevé. */
  exit: 2000,
  /** Pendant le relevé : n'importe quelle touche, puisqu'aucune n'est encore sûre. */
  capture: 3000,
} as const;

/** Sans réponse à « Quitter sans enregistrer ? », l'assistant reprend là où il en était. */
export const QUIT_DIALOG_TIMEOUT_MS = 20_000;

/**
 * Durée de maintien de cette touche qui ouvre la question, ou undefined : la touche
 * maintenue garde son effet (flippers qui accélèrent un réglage, par exemple).
 */
export function quitHoldMs(phase: WizardPhase, code: string, exitKeys: readonly string[]): number | undefined {
  if (phase === 'done') return undefined;
  if (code === 'Escape' || exitKeys.includes(code)) return QUIT_HOLD_MS.exit;
  if (CAPTURE_PHASES.includes(phase)) return QUIT_HOLD_MS.capture;
  return undefined;
}

/** Ctrl+Q : la question, sur toutes les étapes ; Ctrl+Q de nouveau : oui. */
export function isQuitShortcut(input: { code: string; control?: boolean }): boolean {
  return Boolean(input.control) && input.code === 'KeyQ';
}

/** Où mène « Quitter sans enregistrer » : le menu, ou la fermeture quand aucune borne n'est configurée. */
export function quitDestination(hasModel: boolean): { action: 'menu' | 'close'; text: string } {
  return hasModel
    ? { action: 'menu', text: 'Retour au menu des tables, configuration enregistrée inchangée.' }
    : { action: 'close', text: 'Aucune borne n’est encore configurée : Cyber Pinball se ferme, l’assistant reprendra au prochain démarrage.' };
}

const roleLabel = (role: RoleId) => ROLES.find((r) => r.id === role)!.label;

/**
 * Ce qui serait perdu en quittant : différences entre le modèle enregistré et ce que
 * l'assistant a déjà répondu, en clair. Vide : rien n'a changé.
 */
export function cabinetChanges(before: Cabinet | undefined, after: Partial<Cabinet>): string[] {
  const lines: string[] = [];
  const same = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);
  if (after.buttons) {
    // Sans relevé enregistré, les touches en vigueur sont celles des encodeurs.
    const was = buttonKeys(before?.buttons);
    const now = after.buttons;
    const changed = BUTTONS.filter((b) => was[b.id] !== now[b.id]);
    if (changed.length) lines.push(`Boutons : ${changed.map((b) => `${b.label} ${now[b.id] ? `sur ${keyLabel(now[b.id])}` : 'sans touche'}`).join(', ')}`);
  }
  if (after.roles) {
    const screenLabel = (fp: string | undefined) =>
      fp === undefined ? 'aucun écran' : ([...(after.screens ?? []), ...(before?.screens ?? [])].find((s) => s.fingerprint === fp)?.label ?? 'un autre écran');
    for (const { id } of ROLES) {
      if (before?.roles[id] === after.roles[id] && same(before?.zones?.[id], after.zones?.[id])) continue;
      const where = screenLabel(after.roles[id]);
      lines.push(before?.roles[id] === after.roles[id] ? `${roleLabel(id)} : nouvelle place sur ${where}` : `${roleLabel(id)} : ${where}`);
    }
  }
  if (after.playfield) {
    if (before?.playfield?.flipperEdge !== after.playfield.flipperEdge) lines.push(`Flippers ${EDGE_LABELS[after.playfield.flipperEdge]} de l’image`);
    if (!same(before?.playfield?.manualSizeCm, after.playfield.manualSizeCm)) lines.push('Diagonale du playfield');
  }
  if (after.audio && !same(before?.audio, after.audio)) lines.push('Son : sorties du fronton et du plateau, mixage');
  return lines;
}
