// Future Pinball aussi (20/11/2026) : il ne lit que le clavier, les touches de ses préférences
// (packages/core/src/futurepinball-keys.ts).
//
// Boutons de joystick de la borne rendus aux jeux de Zen (Pinball FX, Pinball FX3) comme des
// touches du clavier, pendant la partie : ces jeux ne lisent pas un joystick DirectInput (Pinscape,
// encodeur en mode manette), seulement le clavier et les manettes XInput. Correspondance et raisons
// dans packages/core/src/pinballfx-cabinet.ts.
//
// Borne au clavier dans Pinball FX3 : la touche d'un flipper arrive seule au jeu, sans la flèche de
// ses menus. Elle est lue par sondage (GetAsyncKeyState, KEYBOARD_POLL_MS), sans crochet clavier :
// rien ne s'intercale entre la touche et le jeu, le flipper ne prend aucun retard, et les flèches
// envoyées ne sont pas des touches lues (pas de boucle).
//
// Les touches ne partent que quand le jeu a le premier plan : un bouton appuyé pendant que le
// front-end est devant va au front-end (joystick-input.ts), jamais en double.
//
// Mode borne de Pinball FX (20/11/2026) : le jeu ouvre plusieurs fenêtres (table, fronton, DMD), du
// même processus. Sur un PinCab, 37 appuis envoyés au jeu au premier plan n'ont rien fait : le clavier
// allait à une fenêtre secondaire, que la table n'écoute pas. Avant chaque appui, et toutes les
// FOCUS_CHECK_MS, la plus grande fenêtre du jeu (la table, sur le playfield) reprend le premier plan
// quand une autre fenêtre du jeu l'a ; le journal nomme la première fenêtre ainsi corrigée.

import {
  BamMenuRouter,
  windowsVk,
  ZenKeyPresser,
  zenJoystickKeys,
  zenKeyboardEchoes,
  ZenMenuState,
  zenMenuButtons,
  zenMenuJoystickKeys,
  zenMenuKeyboardEchoes,
  type BamMenuButtons,
  type ButtonsSource,
  type ZenGameKey,
} from '@cyberpinball/core';
import { bringToFront, foregroundWindow, keysDown, listWindows, setKeyDown, type WindowInfo } from '@cyberpinball/win-displays';

/** Contrôle de la fenêtre qui a le clavier pendant une partie de Zen : rapide, sans charge. */
export const FOCUS_CHECK_MS = 500;

/** Fenêtre de la table parmi celles du jeu : la plus grande visible (le playfield, 4K sur une borne). */
export function tableWindow<W extends Pick<WindowInfo, 'visible' | 'minimized' | 'rect'>>(windows: readonly W[]): W | undefined {
  const area = (w: W) => Math.max(0, w.rect.width) * Math.max(0, w.rect.height);
  return windows.filter((w) => w.visible && !w.minimized && area(w) > 0).sort((a, b) => area(b) - area(a))[0];
}

/** Durée de la frappe qui ouvre ou ferme le menu de BAM : BAM sonde les touches à chaque image. */
const BAM_MENU_TAP_MS = 80;

/** Sondage des touches de flipper d'une borne au clavier : assez vif pour un menu, sans charge. */
export const KEYBOARD_POLL_MS = 15;

export interface ZenKeysSystem {
  /** Processus au premier plan. */
  foregroundPid(): number | undefined;
  /** Enfonce ou relâche une touche (code de touche virtuelle de Windows). */
  key(vk: number, down: boolean): void;
  /** Écoute les boutons du joystick ; rend de quoi arrêter. */
  watch(listener: (code: string, down: boolean) => void): () => void;
  /** Touches du clavier enfoncées parmi `vks`. Absent : les touches du clavier ne sont pas lues. */
  keysDown?(vks: readonly number[]): number[];
  /** Appelle `tick` toutes les `ms` ; rend de quoi arrêter. */
  every?(ms: number, tick: () => void): () => void;
  /**
   * Le jeu `pid` a le premier plan par une autre fenêtre que celle de sa table : la table le reprend.
   * Rend la fenêtre qui l'avait (pour le journal), undefined si rien n'était à corriger.
   */
  focusTable?(pid: number): string | undefined;
}

const realSystem: ZenKeysSystem = {
  foregroundPid: () => foregroundWindow()?.pid,
  focusTable: (pid) => {
    const front = foregroundWindow();
    if (!front || front.pid !== pid) return undefined;
    const table = tableWindow(listWindows((w) => w.pid === pid));
    if (!table || table.handle === front.handle) return undefined;
    bringToFront(table);
    const r = front.rect;
    return `« ${front.title} » (${front.className}, ${r.width} × ${r.height} en ${r.x}, ${r.y}) au lieu de « ${table.title} » (${table.rect.width} × ${table.rect.height})`; // i18n-ignore : journal
  },
  key: (vk, down) => void setKeyDown(vk, down),
  // Chargé à l'usage : les essais du pont, sans Electron, passent leur propre système.
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  watch: (listener) => (require('./joystick-input') as typeof import('./joystick-input')).watchJoystickButtons(listener),
  keysDown: (vks) => keysDown(vks),
  every: (ms, tick) => {
    const timer = setInterval(tick, ms);
    return () => clearInterval(timer);
  },
};

/**
 * Rend au jeu `gamePid()` les boutons de joystick de la borne sous forme des touches des encodeurs
 * pour leur rôle en jeu, jusqu'à l'arrêt (la fonction rendue), qui relâche aussi les touches encore
 * tenues. `game` : le jeu de Zen lancé, pour ses touches propres (Pinball FX3 : flèches gauche et
 * droite aux flippers, envoyées aussi pour des flippers au clavier). Rien à faire sur une borne dont
 * aucun bouton n'est à rejouer. À l'arrêt, le journal compte les appuis envoyés au jeu et ceux
 * gardés (jeu pas au premier plan).
 */
export function bridgeZenKeys(
  source: ButtonsSource,
  gamePid: () => number | undefined,
  system: ZenKeysSystem = realSystem,
  game?: ZenGameKey,
  /** Autre jeu qui ne lit que le clavier (Future Pinball, 20/11/2026) : son nom et ses touches par bouton de joystick. */
  other?: { name: string; keys: Map<string, string[]>; /** Menu de BAM réglé aux boutons (futurepinball-bam-menu.ts) : ses boutons de joystick et sa touche d'ouverture. */ bam?: { buttons: BamMenuButtons; vk: number } },
): () => void {
  const keys = other ? other.keys : zenJoystickKeys(source, game);
  const echoes = !other && system.keysDown && system.every ? zenKeyboardEchoes(source, game) : new Map<string, string[]>();
  const label = other ? other.name : 'Jeu de Zen'; // i18n-ignore : journal
  // Pinball FX Midnight : menu pause parcouru par haut et bas (flippers), tant que le menu est ouvert (pinballfx-menu.ts).
  const menuKeys = !other ? zenMenuJoystickKeys(source, game) : new Map<string, string[]>();
  const menuEchoes = !other && system.keysDown && system.every ? zenMenuKeyboardEchoes(source, game) : new Map<string, string[]>();
  const menuButtons = !other ? zenMenuButtons(source, game) : { toggle: new Set<string>(), confirm: new Set<string>() };
  const menuState = menuKeys.size || menuEchoes.size ? new ZenMenuState(menuButtons.toggle, menuButtons.confirm) : undefined;
  if (keys.size === 0 && echoes.size === 0 && !menuState) return () => undefined;
  const presser = new ZenKeyPresser(new Map([...keys, ...echoes]), new Map([...menuKeys, ...menuEchoes]));
  const menu = other?.bam
    ? new BamMenuRouter(
        other.bam.buttons,
        other.bam.vk,
        (vk, down) => system.key(vk, down),
        (vk) => {
          system.key(vk, true);
          setTimeout(() => system.key(vk, false), BAM_MENU_TAP_MS);
        },
      )
    : undefined;
  let sent = 0;
  let held = 0;
  let refocused = 0;
  const send = (key: string, down: boolean) => {
    const vk = windowsVk(key);
    if (vk !== undefined) system.key(vk, down);
  };
  /** Jeu de Zen : la table reprend le clavier si une autre de ses fenêtres l'a pris (mode borne). */
  const keepTableFocused = () => {
    const pid = gamePid();
    if (other || pid === undefined || !system.focusTable) return;
    const was = system.focusTable(pid);
    if (!was) return;
    if (refocused++ === 0) console.log(`${label} : le clavier allait à une autre fenêtre du jeu, ${was} ; la table reprend le premier plan.`); // i18n-ignore : journal
  };
  /** Appui (`down`) ou relâchement du bouton `code` : un appui ne part que vers le jeu ; un relâchement suit toujours l'appui qu'il termine. */
  const button = (code: string, down: boolean) => {
    if (down) {
      const pid = gamePid();
      if (pid === undefined || system.foregroundPid() !== pid) {
        held++;
        return;
      }
      keepTableFocused();
      sent++;
    }
    if (menu?.available && menu.button(code, down)) return;
    if (down && menuState?.press(code)) {
      presser.menuOpen = menuState.open;
      console.log(`${label} : menu du jeu ${menuState.open ? 'ouvert, flippers = haut et bas' : 'fermé, flippers = Maj'}.`); // i18n-ignore : journal
    }
    for (const k of presser.press(code, down)) send(k.key, k.down);
  };
  const stopWatch = keys.size
    ? system.watch((code, down) => {
        if (keys.has(code)) button(code, down);
      })
    : () => undefined;
  // Touches de flipper au clavier : appuis et relâchements vus d'un sondage à l'autre.
  // Midnight : aussi les touches du clavier qui ouvrent, ferment ou valident le menu du jeu (Échap, Entrée).
  const polledCodes = new Set([...echoes.keys(), ...menuEchoes.keys(), ...[...(menuState ? [...menuButtons.toggle, ...menuButtons.confirm] : [])].filter((c) => !c.startsWith('SDLJoy_'))]);
  const polled = [...polledCodes].filter((code) => windowsVk(code) !== undefined).map((code) => ({ code, vk: windowsVk(code)! }));
  const pressed = new Set<string>();
  const stopPoll = polled.length
    ? system.every!(KEYBOARD_POLL_MS, () => {
        const down = new Set(system.keysDown!(polled.map((p) => p.vk)));
        for (const { code, vk } of polled) {
          const now = down.has(vk);
          if (now === pressed.has(code)) continue;
          if (now) pressed.add(code);
          else pressed.delete(code);
          button(code, now);
        }
      })
    : () => undefined;
  const stopFocus = !other && system.focusTable && system.every ? system.every(FOCUS_CHECK_MS, keepTableFocused) : () => undefined;
  if (keys.size) console.log(`${label} : ${keys.size} bouton(s) du joystick rendus au jeu comme des touches du clavier.`); // i18n-ignore : journal
  if (menu?.available) console.log(`${label} : les deux MagnaSave ensemble ouvrent le menu de BAM (touche ${other!.bam!.vk}).`); // i18n-ignore : journal
  if (echoes.size) console.log(`${label} : ${echoes.size} flipper(s) au clavier (${[...echoes.keys()].join(', ')}) doublés des flèches des menus.`); // i18n-ignore : journal
  if (menuState) console.log(`${label} : menu du jeu suivi aux boutons Exit/Pause et Start (flippers = haut et bas tant qu'il est ouvert).`); // i18n-ignore : journal
  return () => {
    stopWatch();
    stopPoll();
    stopFocus();
    menu?.release();
    for (const key of presser.releaseAll()) send(key, false);
    console.log(`${label} : ${sent} appui(s) de bouton envoyé(s) au jeu, ${held} gardé(s) (jeu pas au premier plan)${refocused ? `, table remise au premier plan ${refocused} fois` : ''}.`); // i18n-ignore : journal
  };
}
