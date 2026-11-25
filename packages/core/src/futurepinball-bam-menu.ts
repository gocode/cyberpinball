// Menu de BAM (la vue de Future Pinball) réglé depuis les boutons de la borne, sans clavier (25/11/2026).
// BAM, qui lance Future Pinball, a son menu « BAM basic menu » (éclairage, échelle, position, caméra) ; il
// enregistre seul la vue de la table à sa fermeture et la relit au lancement suivant. Le joueur d'une borne
// sans clavier n'avait aucun moyen de l'ouvrir.
//
// Établi par un essai réel sur la borne d'essai (BAM v1.5-412, bam.cfg : Menu = 192, Menu2 = "Q") :
//  - la touche Menu (192, `~` sur un clavier américain) ouvre le menu, la même le ferme ;
//  - flèches haut et bas choisissent la ligne, gauche et droite changent la valeur (Maj : plus vite),
//    Entrée entre dans « Options » ; BAM l'écrit lui-même sur l'écran du menu ;
//  - la valeur réglée (Scale 1,015) est encore là après avoir quitté puis relancé la table.
//
// Gestes, ceux du menu de Cyber Pinball pour VPX (in-game-menu.ts) : les deux MagnaSave ensemble ouvrent ;
// ouvert, les flippers changent la valeur (flèches gauche et droite), les MagnaSave choisissent la ligne
// (flèches haut et bas), Start valide (Entrée), Exit ferme le menu (sans quitter la partie).
// Seuls les boutons de joystick passent par ici (le relais de zen-keys.ts) ; une borne au clavier a le
// clavier de BAM.

import { buttonKeys, windowsVk, type ButtonsSource } from './buttons';
import { t } from './i18n';

/** Touche d'ouverture quand bam.cfg n'en donne pas : `~`, celle du manuel de BAM. */
export const BAM_MENU_DEFAULT_VK = 0xc0;

/** Rôles des boutons de la borne qui pilotent le menu ouvert, et la touche que BAM reçoit pour chacun. */
export const BAM_MENU_KEYS = {
  leftFlipper: windowsVk('ArrowLeft')!,
  rightFlipper: windowsVk('ArrowRight')!,
  leftMagna: windowsVk('ArrowUp')!,
  rightMagna: windowsVk('ArrowDown')!,
  start: windowsVk('Enter')!,
} as const;

export type BamMenuRole = keyof typeof BAM_MENU_KEYS | 'exit';

/** Le bouton de joystick de chaque rôle (code tel que le relais le reçoit). */
export type BamMenuButtons = Partial<Record<BamMenuRole, string>>;

/**
 * Touche (code de touche virtuelle de Windows) qui ouvre et ferme le menu de BAM, d'après son bam.cfg
 * (`Menu = 192` : un code, ou `Menu = "Q"` : une lettre). 9999, absente ou illisible : la touche du manuel.
 */
export function bamMenuVk(cfg: string | undefined): number {
  const raw = /^[ \t]*Menu[ \t]*=[ \t]*([^;\r\n]*)/m.exec(cfg ?? '')?.[1]?.trim();
  if (!raw) return BAM_MENU_DEFAULT_VK;
  const number = /^\d+$/.test(raw) ? Number(raw) : NaN;
  if (number >= 1 && number <= 254) return number;
  const char = /^"([A-Za-z0-9])"$/.exec(raw)?.[1];
  return char ? char.toUpperCase().charCodeAt(0) : BAM_MENU_DEFAULT_VK;
}

/** Boutons de joystick (codes SDLJoy_…) de chaque rôle du menu d'après la configuration de la borne ; ceux au clavier n'y sont pas. */
export function bamMenuButtons(source: ButtonsSource): BamMenuButtons {
  const keys = buttonKeys(source?.buttons);
  const out: BamMenuButtons = {};
  for (const role of [...(Object.keys(BAM_MENU_KEYS) as BamMenuRole[]), 'exit' as const]) {
    const code = keys[role];
    if (code?.startsWith('SDLJoy_')) out[role] = code;
  }
  return out;
}

/** Ce que le menu envoie à BAM : une touche à enfoncer ou à relâcher. */
export type BamKeyOutput = (vk: number, down: boolean) => void;

/**
 * Aiguille les boutons de la borne pendant une partie de Future Pinball : tant que le menu est fermé, tout
 * va au jeu comme avant, sauf la seconde des deux MagnaSave, qui ouvre le menu ; ouvert, les boutons du
 * menu deviennent les flèches, Entrée et la touche du menu, et les autres vont toujours au jeu.
 * `button` rend vrai quand le bouton est pris par le menu (le relais ne l'envoie pas au jeu).
 */
export class BamMenuRouter {
  private open = false;
  private readonly magnaDown = new Set<string>();
  private readonly driving = new Map<string, number>();
  private readonly swallowed = new Set<string>();

  constructor(
    private readonly buttons: BamMenuButtons,
    private readonly menuVk: number,
    private readonly out: BamKeyOutput,
    /** Une frappe brève de la touche du menu : enfoncée, puis relâchée un instant après (BAM sonde les touches à chaque image). */
    private readonly tap: (vk: number) => void,
  ) {}

  /** Deux MagnaSave en joystick : sans eux, pas de menu. */
  get available(): boolean {
    return Boolean(this.buttons.leftMagna && this.buttons.rightMagna && this.buttons.leftMagna !== this.buttons.rightMagna);
  }

  isOpen(): boolean {
    return this.open;
  }

  private roleOf(code: string): BamMenuRole | undefined {
    return (Object.entries(this.buttons) as [BamMenuRole, string][]).find(([, c]) => c === code)?.[0];
  }

  button(code: string, down: boolean): boolean {
    const role = this.roleOf(code);
    if (!down) {
      if (role === 'leftMagna' || role === 'rightMagna') this.magnaDown.delete(code);
      const vk = this.driving.get(code);
      if (vk !== undefined) {
        this.driving.delete(code);
        this.out(vk, false);
        return true;
      }
      return this.swallowed.delete(code);
    }
    if (!role || !this.available) return false;
    if (this.open) {
      if (role === 'exit') {
        this.open = false;
        this.tap(this.menuVk);
        this.swallowed.add(code);
        return true;
      }
      const vk = BAM_MENU_KEYS[role];
      this.driving.set(code, vk);
      this.out(vk, true);
      return true;
    }
    if (role === 'leftMagna' || role === 'rightMagna') {
      this.magnaDown.add(code);
      if (this.magnaDown.size === 2) {
        this.open = true;
        this.tap(this.menuVk);
        this.swallowed.add(code);
        return true;
      }
    }
    return false;
  }

  /** Fin de la partie : les touches encore tenues sont relâchées. */
  release(): void {
    for (const vk of this.driving.values()) this.out(vk, false);
    this.driving.clear();
    this.swallowed.clear();
    this.magnaDown.clear();
    this.open = false;
  }
}

/** Les gestes du menu de BAM, en une phrase pour l'aide de l'écran de Future Pinball. */
export function bamMenuHelp(): string {
  return t('En partie, les deux MagnaSave ensemble ouvrent le menu de BAM pour régler la vue : les flippers changent la valeur, les MagnaSave choisissent la ligne, Start valide et Exit le ferme. BAM enregistre lui-même la vue de la table.');
}
