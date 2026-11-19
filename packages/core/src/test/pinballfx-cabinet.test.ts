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
  windowsVk,
  ZEN_GAME_KEYS,
  ZenKeyPresser,
  zenJoystickKeys,
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
  buttons: { leftFlipper: JOY(5), rightFlipper: JOY(4), start: JOY(12), exit: JOY(8), credit: JOY(1), plunger: JOY(9), rightMagna: JOY(6), leftMagna: JOY(7), pause: JOY(13), volumeUp: JOY(11) },
  navigation: { previous: JOY(5), next: JOY(4), confirm: JOY(6), back: JOY(7) },
} as unknown as { buttons: CabinetButtons; navigation: Record<string, string> };

test('boutons de joystick : la touche des encodeurs de leur rôle en jeu, comme une borne au clavier', () => {
  const keys = zenJoystickKeys(PINSCAPE);
  assert.deepEqual(keys.get(JOY(5)), ['ShiftLeft'], 'flipper gauche');
  assert.deepEqual(keys.get(JOY(4)), ['ShiftRight'], 'flipper droit');
  assert.deepEqual(keys.get(JOY(7)), ['ControlLeft'], 'MagnaSave gauche : Ctrl gauche, pas Retour de la roue');
  assert.deepEqual(keys.get(JOY(6)), ['ControlRight'], 'MagnaSave droit : Ctrl droit, pas Valider de la roue');
  assert.deepEqual(keys.get(JOY(12)), ['Digit1'], 'Start');
  assert.deepEqual(keys.get(JOY(9)), ['Enter'], 'lanceur');
  assert.deepEqual(keys.get(JOY(8)), ['Escape'], 'Exit');
  assert.deepEqual(keys.get(JOY(1)), ['Digit5'], 'Crédit');
  assert.deepEqual(keys.get(JOY(13)), ['KeyP'], 'Pause');
  assert.equal(keys.has(JOY(11)), false, 'Volume + : reste à Cyber Pinball');
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
    system: { foregroundPid(): number | undefined; key(vk: number, down: boolean): void; watch(l: (code: string, down: boolean) => void): () => void },
  ): () => void;
}

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
