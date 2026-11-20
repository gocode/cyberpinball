// Pinball FX sur une borne (packages/core/src/pinballfx-cabinet.ts, app/src/zen-keys.ts) : rotation
// forcée écrite dans ses réglages, boutons de joystick rendus comme des touches du clavier.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  applyPinballFxRotation,
  pinballFxLocalSettingsFiles,
  pinballFxRotationValue,
  pinballFxSettingsWithRotation,
  PINBALLFX3_EXTRA_KEYS,
  windowsVk,
  ZEN_GAME_KEYS,
  ZenKeyPresser,
  zenGameKeys,
  zenJoystickKeys,
  zenKeyboardEchoes,
  type CabinetButtons,
} from '..';
import { REPO_ROOT } from './i18n-scan';

// Extrait du fichier relevé sur une borne le 19/11/2026 (tabulations, fins de ligne CRLF).
const LOCAL_SETTINGS = [
  '{',
  '\t"audio":',
  '\t{',
  '\t\t"masterVolume": 0.90000003576278687,',
  '\t\t"version": 0',
  '\t},',
  '\t"video":',
  '\t{',
  '\t\t"windowMode": "WindowedFullscreen",',
  '\t\t"useForcedDisplayRotation": false,',
  '\t\t"forcedDisplayRotation": "Rot_270",',
  '\t\t"version": 1',
  '\t}',
  '}',
].join('\r\n');

test('rotation forcée : la même que les fenêtres du playfield, rien pour une image droite', () => {
  assert.equal(pinballFxRotationValue(0), undefined);
  assert.equal(pinballFxRotationValue(90), 'Rot_90');
  assert.equal(pinballFxRotationValue(270), 'Rot_270');
});

test('LocalSettings.cfg : rotation activée, le reste du fichier gardé', () => {
  const next = pinballFxSettingsWithRotation(LOCAL_SETTINGS, 270);
  assert.ok(next);
  const doc = JSON.parse(next) as { audio: { masterVolume: number }; video: Record<string, unknown> };
  assert.equal(doc.video['useForcedDisplayRotation'], true);
  assert.equal(doc.video['forcedDisplayRotation'], 'Rot_270');
  assert.equal(doc.video['windowMode'], 'WindowedFullscreen');
  assert.equal(doc.audio.masterVolume, 0.90000003576278687);
  assert.ok(next.includes('\r\n\t"video":'), 'tabulations et CRLF du jeu gardés');
  assert.ok(!/[^\r]\n/.test(next), 'aucune fin de ligne LF seule');
  // Déjà réglé : rien à écrire.
  assert.equal(pinballFxSettingsWithRotation(next, 270), undefined);
  // Autre sens : réécrit.
  assert.match(pinballFxSettingsWithRotation(next, 90) ?? '', /"Rot_90"/);
});

test('LocalSettings.cfg : image droite ou fichier illisible, rien n’est touché', () => {
  assert.equal(pinballFxSettingsWithRotation(LOCAL_SETTINGS, 0), undefined);
  assert.equal(pinballFxSettingsWithRotation('pas du JSON', 270), undefined);
  assert.equal(pinballFxSettingsWithRotation('[1, 2]', 270), undefined);
  // Section vidéo absente : créée.
  const next = pinballFxSettingsWithRotation('{"audio":{}}', 90);
  assert.deepEqual((JSON.parse(next!) as { video: unknown }).video, { useForcedDisplayRotation: true, forcedDisplayRotation: 'Rot_90' });
});

test('applyPinballFxRotation : chaque boutique, jeu jamais ouvert sans effet', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-pfx-'));
  try {
    assert.deepEqual(applyPinballFxRotation(root, 270), [], 'jeu jamais ouvert : pas de fichier, rien à écrire');
    const dir = path.join(root, 'PinballFX', 'Saved', 'PersistentDownloadDir');
    for (const store of ['Steam', 'Epic']) fs.mkdirSync(path.join(dir, store), { recursive: true });
    fs.mkdirSync(path.join(dir, 'NewsArt'), { recursive: true });
    fs.writeFileSync(path.join(dir, 'Steam', 'LocalSettings.cfg'), LOCAL_SETTINGS);
    fs.writeFileSync(path.join(dir, 'Epic', 'LocalSettings.cfg'), LOCAL_SETTINGS);
    assert.equal(pinballFxLocalSettingsFiles(root).length, 2);
    assert.deepEqual(applyPinballFxRotation(root, 0), [], 'image droite : réglage du joueur gardé');
    const changed = applyPinballFxRotation(root, 270);
    assert.deepEqual(changed.map((c) => c.value), ['Rot_270', 'Rot_270']);
    assert.match(fs.readFileSync(path.join(dir, 'Steam', 'LocalSettings.cfg'), 'utf8'), /"useForcedDisplayRotation": true/);
    assert.deepEqual(applyPinballFxRotation(root, 270), [], 'déjà réglé : aucune écriture');
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

const JOY = (n: number) => `SDLJoy_03000000091200006ae8000000000000_1;${n}`;

// Borne relevée le 19/11/2026 : MagnaSave droit pour Valider, gauche pour Retour dans l'interface.
const PINSCAPE = {
  buttons: { leftFlipper: JOY(5), rightFlipper: JOY(4), start: JOY(12), exit: JOY(8), credit: JOY(1), plunger: JOY(9), rightMagna: JOY(6), leftMagna: JOY(7), pause: JOY(13), coinDoor: JOY(10), volumeUp: JOY(11) },
  navigation: { previous: JOY(5), next: JOY(4), confirm: JOY(6), back: JOY(7) },
} as unknown as { buttons: CabinetButtons; navigation: Record<string, string> };

test('boutons de joystick : les commandes de Pinball FX (écran Contrôles > Clavier du jeu)', () => {
  const keys = zenJoystickKeys(PINSCAPE);
  assert.deepEqual(keys.get(JOY(5)), ['ShiftLeft'], 'flipper gauche : Flipper gauche, et la barre du haut des menus');
  assert.deepEqual(keys.get(JOY(4)), ['ShiftRight'], 'flipper droit');
  assert.deepEqual(keys.get(JOY(9)), ['Enter'], 'lanceur : Lance-billes, et valider');
  assert.deepEqual(keys.get(JOY(12)), ['Enter'], 'Start : valider');
  assert.deepEqual(keys.get(JOY(8)), ['Escape'], 'Exit : retour, pause');
  assert.deepEqual(keys.get(JOY(13)), ['Escape'], 'Pause');
  assert.deepEqual(keys.get(JOY(7)), ['ArrowUp'], 'MagnaSave gauche : monter dans les fenêtres du jeu');
  assert.deepEqual(keys.get(JOY(6)), ['ArrowDown'], 'MagnaSave droit : descendre');
  assert.equal(keys.has(JOY(1)), false, 'Crédit : pas de commande dans le jeu');
  assert.equal(keys.has(JOY(10)), false, 'Porte du monnayeur : pas de commande dans le jeu');
  assert.equal(keys.has(JOY(11)), false, 'Volume + : reste à Cyber Pinball');
});

test('Pinball FX3 : les flippers envoient aussi la flèche de leur côté (menus aux flèches, Maj sans effet)', () => {
  const keys = zenJoystickKeys(PINSCAPE, 'pinballfx3');
  assert.deepEqual(keys.get(JOY(5)), ['ShiftLeft', 'ArrowLeft'], 'flipper gauche : Maj en partie, flèche dans les menus');
  assert.deepEqual(keys.get(JOY(4)), ['ShiftRight', 'ArrowRight'], 'flipper droit');
  assert.deepEqual(keys.get(JOY(12)), ['Enter'], 'Start : valider, comme Pinball FX');
  assert.deepEqual(keys.get(JOY(7)), ['ArrowUp'], 'MagnaSave gauche inchangé');
  // Pinball FX et jeu non précisé : pas de flèches aux flippers.
  assert.deepEqual(zenJoystickKeys(PINSCAPE, 'pinballfx').get(JOY(5)), ['ShiftLeft']);
  assert.deepEqual(zenGameKeys().leftFlipper, ['ShiftLeft']);
  for (const key of Object.values(PINBALLFX3_EXTRA_KEYS)) assert.notEqual(windowsVk(key!), undefined, key);
});

// Retour d'un joueur, 20/11/2026 : borne au clavier, FX3 jouable mais ses menus ne se parcourent pas.
const KEYBOARD = { buttons: { leftFlipper: 'ShiftLeft', rightFlipper: 'ShiftRight', start: 'Digit1', exit: 'Escape', plunger: 'Enter' }, navigation: undefined } as unknown as { buttons: CabinetButtons; navigation: undefined };

test('borne au clavier, Pinball FX3 : chaque flipper reçoit en plus la flèche de son côté', () => {
  const echoes = zenKeyboardEchoes(KEYBOARD, 'pinballfx3');
  assert.deepEqual([...echoes], [['ShiftLeft', ['ArrowLeft']], ['ShiftRight', ['ArrowRight']]]);
  assert.equal(zenKeyboardEchoes(KEYBOARD, 'pinballfx').size, 0, 'Pinball FX : ses menus se parcourent aux flippers');
  assert.equal(zenKeyboardEchoes(KEYBOARD).size, 0);
  assert.equal(zenKeyboardEchoes(PINSCAPE, 'pinballfx3').size, 0, 'flippers de joystick : zenJoystickKeys envoie déjà Maj et la flèche, rien en double');
  // Borne sans relevé des boutons : touches par défaut des encodeurs (Maj), doublées aussi.
  assert.ok(zenKeyboardEchoes(undefined, 'pinballfx3').size > 0);
});

test('tremblements : Alt gauche, Alt droite, Espace, comme dans le jeu', () => {
  const keys = zenJoystickKeys({ buttons: { ...PINSCAPE.buttons, nudgeLeft: JOY(14), nudgeRight: JOY(15), nudgeCenter: JOY(16) }, navigation: undefined });
  assert.deepEqual([keys.get(JOY(14)), keys.get(JOY(15)), keys.get(JOY(16))], [['AltLeft'], ['AltRight'], ['Space']]);
});

test('borne au clavier : rien n’est rejoué, ses touches arrivent déjà au jeu', () => {
  assert.equal(zenJoystickKeys(undefined).size, 0);
});

test('chaque touche des jeux de Zen a son code de touche virtuelle, sans les boutons de volume', () => {
  for (const key of Object.values(ZEN_GAME_KEYS)) assert.notEqual(windowsVk(key!), undefined, key);
  assert.equal(ZEN_GAME_KEYS.volumeUp, undefined);
  assert.equal(ZEN_GAME_KEYS.volumeDown, undefined);
});

test('touche partagée : relâchée au dernier bouton lâché', () => {
  const p = new ZenKeyPresser(new Map([['a', ['Enter']], ['b', ['Enter', 'Space']]]));
  assert.deepEqual(p.press('a', true), [{ key: 'Enter', down: true }]);
  assert.deepEqual(p.press('b', true), [{ key: 'Space', down: true }]);
  assert.deepEqual(p.press('a', false), []);
  assert.deepEqual(p.press('b', false), [{ key: 'Enter', down: false }, { key: 'Space', down: false }]);
  assert.deepEqual(p.press('a', true), [{ key: 'Enter', down: true }]);
  assert.deepEqual(p.releaseAll(), ['Enter']);
});

interface ZenKeysModule {
  bridgeZenKeys(
    buttons: unknown,
    gamePid: () => number | undefined,
    system: {
      foregroundPid(): number | undefined;
      key(vk: number, down: boolean): void;
      watch(l: (code: string, down: boolean) => void): () => void;
      keysDown?(vks: readonly number[]): number[];
      every?(ms: number, tick: () => void): () => void;
    },
    game?: string,
  ): () => void;
}

test('pont, borne au clavier dans FX3 : Maj lue par sondage, flèche envoyée en plus, jamais Maj ni en double', () => {
  const zen = require(path.join(REPO_ROOT, 'app', 'dist', 'zen-keys.js')) as ZenKeysModule;
  const held = new Set<number>();
  let tick: (() => void) | undefined;
  let polling = false;
  let front = 42;
  let watched = false;
  const sent: [number, boolean][] = [];
  const stop = zen.bridgeZenKeys(
    KEYBOARD,
    () => 42,
    {
      foregroundPid: () => front,
      key: (vk, down) => sent.push([vk, down]),
      watch: () => ((watched = true), () => undefined),
      keysDown: (vks) => vks.filter((vk) => held.has(vk)),
      every: (_ms, t) => ((tick = t), (polling = true), () => (polling = false)),
    },
    'pinballfx3',
  );
  assert.ok(tick && polling);
  assert.equal(watched, false, 'aucun bouton de joystick : rien n’est écouté');
  held.add(0xa0); // Maj gauche, du clavier : arrive seule au jeu
  tick();
  tick(); // toujours tenue : pas de second appui
  assert.deepEqual(sent, [[0x25, true]], 'flèche gauche seulement');
  held.delete(0xa0);
  tick();
  assert.deepEqual(sent.slice(1), [[0x25, false]]);
  sent.length = 0;
  front = 7; // front-end devant : rien vers le jeu
  held.add(0xa1);
  tick();
  held.delete(0xa1);
  tick();
  assert.deepEqual(sent, []);
  front = 42;
  held.add(0xa1);
  tick();
  stop();
  assert.equal(polling, false);
  assert.deepEqual(sent, [[0x27, true], [0x27, false]], 'flèche droite relâchée à l’arrêt');
  // Pinball FX : aucun sondage.
  let polled = false;
  zen.bridgeZenKeys(KEYBOARD, () => 42, { foregroundPid: () => 42, key: () => undefined, watch: () => () => undefined, keysDown: () => [], every: () => ((polled = true), () => undefined) }, 'pinballfx')();
  assert.equal(polled, false);
});

test('pont, Pinball FX3 : flipper gauche = Maj gauche puis flèche gauche ; appuis comptés au journal', (t) => {
  const zen = require(path.join(REPO_ROOT, 'app', 'dist', 'zen-keys.js')) as ZenKeysModule;
  const logs: string[] = [];
  t.mock.method(console, 'log', (msg: string) => logs.push(msg));
  let listener: ((code: string, down: boolean) => void) | undefined;
  let front = 42;
  const sent: [number, boolean][] = [];
  const stop = zen.bridgeZenKeys(
    { buttons: { leftFlipper: JOY(1), rightFlipper: JOY(2), start: 'Digit1', exit: 'Escape', credit: 'Digit5', plunger: 'Enter' } },
    () => 42,
    { foregroundPid: () => front, key: (vk, down) => sent.push([vk, down]), watch: (l) => ((listener = l), () => undefined) },
    'pinballfx3',
  );
  listener!(JOY(1), true);
  listener!(JOY(1), false);
  assert.deepEqual(sent, [[0xa0, true], [0x25, true], [0xa0, false], [0x25, false]]);
  front = 7;
  listener!(JOY(2), true);
  stop();
  assert.ok(logs.some((l) => /1 appui\(s\) de bouton envoyé\(s\) au jeu, 1 gardé\(s\)/.test(l)), logs.join('\n'));
});

test('pont : touches seulement quand le jeu a le premier plan, relâchées à la fin', () => {
  const zen = require(path.join(REPO_ROOT, 'app', 'dist', 'zen-keys.js')) as ZenKeysModule;
  let listener: ((code: string, down: boolean) => void) | undefined;
  let watching = false;
  let front = 42;
  const sent: [number, boolean][] = [];
  const stop = zen.bridgeZenKeys({ buttons: { leftFlipper: JOY(1), rightFlipper: JOY(2), start: 'Digit1', exit: 'Escape', credit: 'Digit5', plunger: 'Enter' } }, () => 42, {
    foregroundPid: () => front,
    key: (vk, down) => sent.push([vk, down]),
    watch: (l) => {
      listener = l;
      watching = true;
      return () => (watching = false);
    },
  });
  assert.ok(listener && watching);
  listener(JOY(1), true);
  assert.deepEqual(sent, [[0xa0, true]], 'Maj gauche');
  listener(JOY(1), false);
  assert.deepEqual(sent.slice(1), [[0xa0, false]]);
  sent.length = 0;
  front = 7; // le front-end est devant : le bouton lui revient, rien n'est joué au jeu
  listener(JOY(2), true);
  assert.deepEqual(sent, []);
  listener(JOY(2), false);
  assert.deepEqual(sent, [], 'pas de relâchement sans appui');
  front = 42;
  listener(JOY(2), true);
  listener(JOY(9), true); // bouton sans rôle
  stop();
  assert.equal(watching, false);
  assert.deepEqual(sent, [[0xa1, true], [0xa1, false]], 'touche tenue relâchée à l’arrêt');
});

test('pont : borne au clavier seulement, rien n’est écouté', () => {
  const zen = require(path.join(REPO_ROOT, 'app', 'dist', 'zen-keys.js')) as ZenKeysModule;
  let watched = false;
  const stop = zen.bridgeZenKeys(undefined, () => 1, { foregroundPid: () => 1, key: () => undefined, watch: () => ((watched = true), () => undefined) });
  stop();
  assert.equal(watched, false);
});
