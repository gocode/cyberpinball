// Root Access (26/11/2026) : le jeu de flipper caché de Cyber Pinball (app/renderer/root-access). Rien ne
// l'annonce : il s'ouvre depuis la roue par une combinaison de flips, et se joue avec les boutons et le
// lanceur de la borne, tels qu'ils sont réglés (Configuration > Boutons, lanceur analogique).

import { buttonKeys } from './buttons';
import type { CabinetButtons, PlungerSensor } from './model';
import { plungerPosition, type AxisReading } from './plunger';

export type FlipperSide = 'left' | 'right';

/**
 * Une fois à gauche, une fois à droite, deux fois à gauche, deux fois à droite, trois fois à gauche,
 * trois fois à droite. La roue tourne pendant la combinaison : le jeu
 * s'ouvre par-dessus, et la table choisie n'a pas d'importance.
 */
export const ROOT_ACCESS_SEQUENCE: readonly FlipperSide[] = ['left', 'right', 'left', 'left', 'right', 'right', 'left', 'left', 'left', 'right', 'right', 'right'];

/** Plus que ça entre deux appuis : la combinaison repart de zéro. */
export const COMBO_GAP_MS = 1500;

export interface FlipperComboHost {
  /** Codes des flippers (touches et boutons de joystick). */
  left(): readonly string[];
  right(): readonly string[];
  /** Faux : la combinaison ne compte pas (hors de la roue, partie lancée…). */
  allowed(): boolean;
  trigger(): void;
  now?: () => number;
  sequence?: readonly FlipperSide[];
  gapMs?: number;
}

/**
 * Combinaison de flips : les derniers appuis, dans l'ordre. Un autre bouton, une pause de plus de
 * COMBO_GAP_MS ou un moment où elle ne compte pas la remettent à zéro. L'appelant ne donne que les
 * appuis (pas les répétitions du clavier).
 */
export class FlipperCombo {
  private presses: { side: FlipperSide; at: number }[] = [];
  constructor(private readonly host: FlipperComboHost) {}

  press(code: string): void {
    const side: FlipperSide | undefined = this.host.left().includes(code) ? 'left' : this.host.right().includes(code) ? 'right' : undefined;
    if (!side || !this.host.allowed()) {
      this.presses = [];
      return;
    }
    const at = (this.host.now ?? Date.now)();
    const sequence = this.host.sequence ?? ROOT_ACCESS_SEQUENCE;
    const last = this.presses.at(-1);
    if (last && at - last.at > (this.host.gapMs ?? COMBO_GAP_MS)) this.presses = [];
    this.presses.push({ side, at });
    if (this.presses.length > sequence.length) this.presses.splice(0, this.presses.length - sequence.length);
    if (this.presses.length === sequence.length && this.presses.every((p, i) => p.side === sequence[i])) {
      this.presses = [];
      this.host.trigger();
    }
  }

  reset(): void {
    this.presses = [];
  }
}

/** Ce que le jeu reçoit à chaque lecture : engine.js, step(g, input). */
export interface MiniGameInput {
  left: boolean;
  right: boolean;
  plunger: boolean;
  /** MagnaSave, l'un ou l'autre : l'aimant du Tronc. */
  aimant: boolean;
  /** Lanceur analogique : de 0 au repos à 1 tiré à fond ; absent sans capteur réglé ou lu. */
  tirette?: number;
}

export type MiniGameButton = 'leftFlipper' | 'rightFlipper' | 'plunger' | 'leftMagna' | 'rightMagna' | 'exit';
export const MINI_GAME_BUTTONS: readonly MiniGameButton[] = ['leftFlipper', 'rightFlipper', 'plunger', 'leftMagna', 'rightMagna', 'exit'];

/** Touche ou bouton de joystick de chaque bouton du jeu, d'après les boutons relevés de la borne. */
export function miniGameKeys(buttons: CabinetButtons | undefined): Partial<Record<MiniGameButton, string>> {
  const keys = buttonKeys(buttons);
  const out: Partial<Record<MiniGameButton, string>> = {};
  for (const b of MINI_GAME_BUTTONS) if (keys[b]) out[b] = keys[b];
  return out;
}

/** Les boutons tenus et la tirette, en commandes du jeu. */
export function miniGameInput(held: ReadonlySet<MiniGameButton>, tirette?: number): MiniGameInput {
  const input: MiniGameInput = {
    left: held.has('leftFlipper'),
    right: held.has('rightFlipper'),
    plunger: held.has('plunger'),
    aimant: held.has('leftMagna') || held.has('rightMagna'),
  };
  if (tirette !== undefined && Number.isFinite(tirette)) input.tirette = Math.max(0, Math.min(1, tirette));
  return input;
}

/**
 * Recul du lanceur analogique, de 0 (au repos ou poussé) à 1 (tiré à fond), avec la zone morte et le
 * sens réglés ; undefined sans capteur, ou si son joystick n'est pas lu.
 */
export function plungerPull(axes: readonly AxisReading[], sensor: PlungerSensor | undefined): number | undefined {
  if (!sensor) return undefined;
  const raw = axes.find((a) => a.device === sensor.device)?.values[sensor.axis];
  if (raw === undefined || !Number.isFinite(raw)) return undefined;
  return Math.max(0, plungerPosition(raw, sensor));
}

/**
 * Même lecture : rien à renvoyer au jeu. Sans seuil sur la tirette : un retour au repos qui ne
 * différerait que d'un millième de la dernière valeur envoyée serait le lâcher que le jeu attend.
 */
export function sameMiniGameInput(a: MiniGameInput | undefined, b: MiniGameInput): boolean {
  return Boolean(a) && a!.left === b.left && a!.right === b.right && a!.plunger === b.plunger && a!.aimant === b.aimant && a!.tirette === b.tirette;
}
