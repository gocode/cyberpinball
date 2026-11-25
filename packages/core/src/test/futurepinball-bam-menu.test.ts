// Menu de BAM aux boutons de la borne (packages/core/src/futurepinball-bam-menu.ts, app/src/zen-keys.ts).
// Les touches viennent d'un essai réel sur la borne le 25/11/2026 (BAM v1.5-412) : la touche Menu ouvre et
// ferme, flèches et Entrée naviguent. Invariant : une touche enfoncée pour BAM est toujours relâchée, et le
// jeu ne reçoit jamais les boutons que le menu a pris.
import assert from 'node:assert/strict';
import * as path from 'node:path';
import { test } from 'node:test';
import { BAM_MENU_DEFAULT_VK, BAM_MENU_KEYS, bamMenuButtons, bamMenuHelp, bamMenuVk, BamMenuRouter, futurePinballJoystickKeys, setLanguage, type CabinetButtons } from '../index';
import { REPO_ROOT } from './i18n-scan';

const JOY = (n: number) => `SDLJoy_03000000091200006ae8000000000000_1;${n}`;
// Borne relevée le 19/11/2026 (Pinscape) : boutons de joystick partout.
const PINSCAPE = {
  buttons: { leftFlipper: JOY(5), rightFlipper: JOY(4), start: JOY(12), exit: JOY(8), credit: JOY(1), plunger: JOY(9), rightMagna: JOY(6), leftMagna: JOY(7), pause: JOY(13), coinDoor: JOY(10), volumeUp: JOY(11) },
  navigation: { previous: JOY(5), next: JOY(4), confirm: JOY(6), back: JOY(7) },
} as unknown as { buttons: CabinetButtons; navigation: Record<string, string> };

const MENU_VK = 192;

test('bam.cfg : la touche du menu, un code ou une lettre ; 9999, absente ou illisible : celle du manuel', () => {
  assert.equal(bamMenuVk('Menu = 192\nMenu2 = "Q"\nCam = "C"\n'), 192, 'celui de la borne d’essai');
  assert.equal(bamMenuVk('Menu2 = "Q"\nMenu = "m"'), 'M'.charCodeAt(0), 'lettre, en majuscule');
  assert.equal(bamMenuVk('  Menu   =   120  ; commentaire'), 120);
  assert.equal(bamMenuVk('Menu = 9999'), BAM_MENU_DEFAULT_VK);
  assert.equal(bamMenuVk('Menu2 = "Q"'), BAM_MENU_DEFAULT_VK, 'Menu2 n’est pas Menu');
  assert.equal(bamMenuVk('Menu = n’importe quoi'), BAM_MENU_DEFAULT_VK);
  assert.equal(bamMenuVk(undefined), BAM_MENU_DEFAULT_VK);
});

test('boutons du menu : ceux de joystick seulement', () => {
  const buttons = bamMenuButtons(PINSCAPE);
  assert.deepEqual(buttons, { leftFlipper: JOY(5), rightFlipper: JOY(4), start: JOY(12), exit: JOY(8), rightMagna: JOY(6), leftMagna: JOY(7) });
  const keyboard = bamMenuButtons({ buttons: { ...PINSCAPE.buttons, leftMagna: 'KeyA', rightMagna: 'KeyL' } } as never);
  assert.equal(keyboard.leftMagna, undefined, 'MagnaSave au clavier : le clavier de BAM');
});

function trace() {
  const out: string[] = [];
  const router = new BamMenuRouter(bamMenuButtons(PINSCAPE), MENU_VK, (vk, down) => out.push(`${vk}${down ? '↓' : '↑'}`), (vk) => out.push(`tap ${vk}`));
  return { out, router };
}

test('un seul MagnaSave : rien ne s’ouvre, le bouton va au jeu', () => {
  const { out, router } = trace();
  assert.equal(router.button(JOY(7), true), false);
  assert.equal(router.button(JOY(7), false), false);
  assert.equal(router.button(JOY(6), true), false);
  assert.equal(router.button(JOY(6), false), false);
  assert.equal(router.isOpen(), false);
  assert.deepEqual(out, []);
});

test('les deux MagnaSave ensemble ouvrent ; ouvert : flippers, MagnaSave et Start deviennent les touches du menu ; Exit ferme', () => {
  const { out, router } = trace();
  assert.equal(router.button(JOY(7), true), false, 'le premier va encore au jeu');
  assert.equal(router.button(JOY(6), true), true, 'le second ouvre le menu et n’arrive pas au jeu');
  assert.equal(router.isOpen(), true);
  assert.deepEqual(out, [`tap ${MENU_VK}`]);
  assert.equal(router.button(JOY(6), false), true, 'son relâchement est avalé');
  assert.equal(router.button(JOY(7), false), false, 'celui du premier suit son appui, jusqu’au jeu');
  out.length = 0;
  for (const [button, vk] of [[JOY(7), BAM_MENU_KEYS.leftMagna], [JOY(6), BAM_MENU_KEYS.rightMagna], [JOY(5), BAM_MENU_KEYS.leftFlipper], [JOY(4), BAM_MENU_KEYS.rightFlipper], [JOY(12), BAM_MENU_KEYS.start]] as const) {
    assert.equal(router.button(button, true), true);
    assert.equal(router.button(button, false), true);
    assert.deepEqual(out.splice(0), [`${vk}↓`, `${vk}↑`]);
  }
  assert.deepEqual([BAM_MENU_KEYS.leftMagna, BAM_MENU_KEYS.rightMagna, BAM_MENU_KEYS.leftFlipper, BAM_MENU_KEYS.rightFlipper, BAM_MENU_KEYS.start], [0x26, 0x28, 0x25, 0x27, 0x0d], 'haut, bas, gauche, droite, Entrée');
  assert.equal(router.button(JOY(9), true), false, 'le lanceur reste au jeu');
  assert.equal(router.button(JOY(9), false), false);
  assert.equal(router.button(JOY(8), true), true, 'Exit ferme le menu, sans quitter la partie');
  assert.equal(router.isOpen(), false);
  assert.equal(router.button(JOY(8), false), true);
  assert.deepEqual(out, [`tap ${MENU_VK}`]);
  assert.equal(router.button(JOY(8), true), false, 'fermé : Exit va au jeu, qui quitte');
});

test('invariant : toute touche enfoncée pour BAM est relâchée, le jeu ne reçoit jamais un relâchement sans son appui', () => {
  const buttons = [JOY(5), JOY(4), JOY(12), JOY(8), JOY(6), JOY(7), JOY(9)];
  let seed = 7;
  const random = () => ((seed = (seed * 1103515245 + 12345) & 0x7fffffff) / 0x7fffffff);
  for (let run = 0; run < 200; run++) {
    const held = new Map<number, number>();
    const router = new BamMenuRouter(bamMenuButtons(PINSCAPE), MENU_VK, (vk, down) => held.set(vk, (held.get(vk) ?? 0) + (down ? 1 : -1)), () => undefined);
    const pressed = new Set<string>();
    const toGame = new Set<string>();
    for (let step = 0; step < 80; step++) {
      const b = buttons[Math.floor(random() * buttons.length)]!;
      const down = !pressed.has(b);
      if (down) pressed.add(b);
      else pressed.delete(b);
      const taken = router.button(b, down);
      if (down && !taken) toGame.add(b);
      if (!down && !taken) assert.ok(toGame.delete(b), `relâchement de ${b} envoyé au jeu sans appui envoyé`);
      if (!down && taken) assert.equal(toGame.has(b), false, `relâchement de ${b} pris alors que son appui est allé au jeu`);
    }
    for (const b of pressed) router.button(b, false);
    router.release();
    for (const [vk, n] of held) assert.equal(n, 0, `touche ${vk} restée enfoncée (course ${run})`);
  }
});

test('sans deux MagnaSave de joystick : pas de menu', () => {
  const router = new BamMenuRouter(bamMenuButtons({ buttons: { ...PINSCAPE.buttons, leftMagna: 'KeyA' } } as never), MENU_VK, () => undefined, () => undefined);
  assert.equal(router.available, false);
});

interface ZenKeysModule {
  bridgeZenKeys(
    buttons: unknown,
    gamePid: () => number | undefined,
    system: { foregroundPid(): number | undefined; key(vk: number, down: boolean): void; watch(l: (code: string, down: boolean) => void): () => void },
    game?: string,
    other?: { name: string; keys: Map<string, string[]>; bam?: { buttons: ReturnType<typeof bamMenuButtons>; vk: number } },
  ): () => void;
}

test('relais de Future Pinball : les deux MagnaSave ouvrent le menu de BAM, les boutons du menu ne sont pas rendus au jeu', (t) => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const zen = require(path.join(REPO_ROOT, 'app', 'dist', 'zen-keys.js')) as ZenKeysModule;
  t.mock.method(console, 'log', () => undefined);
  t.mock.timers.enable({ apis: ['setTimeout'] });
  let listener: ((code: string, down: boolean) => void) | undefined;
  const order: string[] = [];
  const system = { foregroundPid: () => 42, key: (vk: number, down: boolean) => order.push(`${vk}${down ? '↓' : '↑'}`), watch: (l: (code: string, down: boolean) => void) => ((listener = l), () => undefined) };
  const keys = futurePinballJoystickKeys(PINSCAPE, () => undefined);
  const stop = zen.bridgeZenKeys(PINSCAPE, () => 42, system, undefined, { name: 'Future Pinball', keys, bam: { buttons: bamMenuButtons(PINSCAPE), vk: MENU_VK } });
  listener!(JOY(5), true);
  listener!(JOY(5), false);
  assert.equal(order.length, 2, 'menu fermé : le flipper va au jeu, comme avant');
  order.length = 0;
  listener!(JOY(7), true);
  listener!(JOY(6), true);
  t.mock.timers.tick(80);
  assert.deepEqual(order.slice(1), [`${MENU_VK}↓`, `${MENU_VK}↑`], 'la touche du menu, enfoncée puis relâchée');
  order.length = 0;
  listener!(JOY(5), true);
  listener!(JOY(5), false);
  assert.deepEqual(order, [`${BAM_MENU_KEYS.leftFlipper}↓`, `${BAM_MENU_KEYS.leftFlipper}↑`], 'menu ouvert : le flipper gauche est la flèche gauche, pas sa touche du jeu');
  stop();
});

test('l’aide du menu de BAM existe en français et en anglais', () => {
  assert.match(bamMenuHelp(), /MagnaSave/);
  setLanguage('en');
  try {
    assert.match(bamMenuHelp(), /both MagnaSave buttons together/);
  } finally {
    setLanguage('fr');
  }
});
