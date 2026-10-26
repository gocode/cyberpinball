// Mode invité (Menu système > Borne > Mode invité) : on choisit une table, on lit sa fiche, son
// prospectus, ses règles et les commandes, on joue ; rien d'autre. Ces tests fixent la classe de
// problème, pas seulement les portes d'aujourd'hui :
// - la liste des portes ouvertes à l'invité est figée ici : en ouvrir une de plus demande de
//   l'écrire, avec sa raison ;
// - chaque porte déclarée sert dans app/src, et chaque action de la fiche déclare la sienne
//   (le compilateur l'exige : SheetAction) ; une action sans porte est fermée à l'invité ;
// - toute source d'entrées de app/src (canal du rendu, raccourci global, touches d'une fenêtre,
//   boutons du joystick) est relevée : une nouvelle fait échouer le test tant qu'on n'a pas dit
//   par quelle porte elle passe ;
// - le verrou, l'indice, la combinaison de déverrouillage et l'enregistrement du réglage.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { mock, test } from 'node:test';
import { DEFAULT_BUTTONS, joystickCode } from '../buttons';
import { GUEST_DOORS, GUEST_UNLOCK_MS, GuestMode, guestUnlockHands, guestUnlockSlots, loadGuestMode, openGuestDoors, type GuestDoor } from '../guestmode';
import { SYSTEM_GROUPS } from '../systemmenu';
import { REPO_ROOT } from './i18n-scan';

const SOURCES = path.join(REPO_ROOT, 'app', 'src');
const read = (file: string) => fs.readFileSync(path.join(SOURCES, file), 'utf8');
const appSources = () => fs.readdirSync(SOURCES).filter((f) => f.endsWith('.ts')).map((file) => ({ file, text: read(file) }));

test('mode invité : les portes ouvertes sont exactement celles-ci, chacune pour choisir, lire ou jouer', () => {
  const reviewed: Record<GuestDoor, string> = {
    'menu.choose': 'choisir une table',
    'menu.sheet': 'ouvrir sa fiche',
    'menu.commands': 'lire les commandes',
    'game.force-stop': 'arrêter une partie bloquée : la partie seulement, rien n’est enregistré',
    'message.other-frontend': 'jouer quand même, un autre menu ouvert : rien n’est modifié',
    'message.power': 'extinction déjà en cours : l’écran reste noir, aucun choix n’y est offert',
    'sheet.play': 'jouer',
    'sheet.read': 'lire le prospectus et les règles',
    'sheet.back': 'revenir au menu',
  } as Record<GuestDoor, string>;
  assert.deepEqual(
    openGuestDoors().sort(),
    Object.keys(reviewed).sort(),
    'Ouvrir une porte à l’invité : l’ajouter ici avec sa raison, après avoir vérifié qu’elle ne modifie, ne supprime, ne répare ni ne télécharge rien.',
  );
});

test('mode invité : chaque porte déclarée sert dans app/src (aucune porte morte)', () => {
  const all = appSources().map((s) => s.text).join('\n');
  const unused = (Object.keys(GUEST_DOORS) as GuestDoor[]).filter((door) => !all.includes(`'${door}'`));
  assert.deepEqual(unused, [], 'porte déclarée dans guestmode.ts sans usage dans app/src');
});

test('mode invité : chaque action de la fiche déclare sa porte, et une action sans porte est cachée', () => {
  const library = read('library.ts');
  // Le type oblige chaque action de la fiche (Jouer, pages, PuP-Pack…) à dire sa porte.
  assert.match(library, /type SheetAction = Action & \{ door: GuestDoor \};/);
  const sheet = library.slice(library.indexOf('function buildSheet('), library.indexOf('function pagesAction('));
  assert.match(sheet, /const actions: SheetAction\[\] = \[/, 'buildSheet : actions typées SheetAction');
  assert.match(sheet, /const missing: SheetAction\[\]/);
  assert.match(sheet, /const further: SheetAction\[\]/);
  assert.match(library, /function pagesAction\([^)]*\): SheetAction \{/);
  assert.match(library, /function pupAction\([^)]*\): SheetAction\[\] \{/);
  // Le filtre : en mode invité, seules les actions à porte ouverte (une action sans porte ne passe pas).
  assert.match(library, /host\.guest\.active \? \{ \.\.\.built, actions: built\.actions\.filter\(\(a\) => host\.guest\.allows\(a\.door\)\) \}/);
  // Seuls la fiche et ses pages s'ouvrent ; tout autre écran passe par une porte fermée.
  const screens = /const GUEST_SCREENS: [^=]+= \{([^}]*)\};/.exec(library)?.[1];
  assert.equal(screens?.trim(), "sheet: 'menu.sheet', pages: 'sheet.read'");
  assert.match(library, /if \(!host\.guest\.knock\(GUEST_SCREENS\[next\.kind\]\)\) return;/);
  assert.match(library, /!host\.guest\.knock\('files\.drop'\)/);
  // Une entrée du menu système ne se lance pas, même atteinte sans passer par son écran (autopilote).
  const run = library.slice(library.indexOf('function runSystemEntry('), library.indexOf('function systemUp('));
  assert.match(run, /if \(!host\.guest\.knock\('menu\.system'\)\) return;/);
});

test('mode invité : chaque message du menu dit la porte de son action', () => {
  const frontend = read('frontend.ts');
  assert.match(frontend, /const MESSAGE_DOORS: Record<NonNullable<Message\['action'\]>, GuestDoor> = \{/);
  // Start passe par la porte du message, Exit le ferme sans rien faire d'autre.
  assert.match(frontend, /state\.message\?\.action && !guest\.allows\(MESSAGE_DOORS\[state\.message\.action\]\)/);
});

/**
 * Sources d'entrées de app/src, par fichier : canal du rendu (ipcMain), raccourci global,
 * touches d'une fenêtre (before-input-event), boutons du joystick. Chacune est revue : soit elle
 * passe par une porte, soit elle n'est atteignable que derrière une porte fermée.
 */
const INPUT_SOURCES: Record<string, { count: number; why: string }> = {
  'frontend.ts': { count: 7, why: 'le menu : handleKey, handleKeyUp, le canal « action » et les raccourcis globaux passent par GuestMode (knock)' },
  'frontend-gate.ts': { count: 2, why: 'au démarrage, un autre menu de borne ouvert : attendre ou continuer, rien n’est modifié' },
  'language.ts': { count: 1, why: 'lecture du catalogue des traductions' },
  'settings.ts': { count: 4, why: 'réglages de VPX : derrière menu.vpx-settings et sheet.table-settings, fermées' },
  'wizard.ts': { count: 5, why: 'assistant de la borne, lancé à part : derrière message.wizard, message.buttons, message.interface et le menu système, fermés' },
  'acquire-window.ts': { count: 12, why: 'fenêtre « Récupérer » : derrière sheet.missing, sheet.further et le menu système, fermés' },
};
const INPUT_PATTERN = /ipcMain\.(?:on|once|handle|handleOnce)\(|globalShortcut\.register\(|'before-input-event'|(?<!function )onJoystickInput\(/g;

test('mode invité : toute source d’entrées de app/src est revue (une nouvelle doit dire sa porte)', () => {
  const found: Record<string, number> = {};
  for (const { file, text } of appSources()) {
    const code = text
      .split('\n')
      .filter((line) => !/^\s*(\/\/|\*|\/\*)/.test(line))
      .join('\n');
    const n = code.match(INPUT_PATTERN)?.length ?? 0;
    if (n) found[file] = n;
  }
  const expected = Object.fromEntries(Object.entries(INPUT_SOURCES).map(([file, s]) => [file, s.count]));
  assert.deepEqual(
    found,
    expected,
    'Nouvelle source d’entrées dans app/src : la faire passer par une porte du mode invité (GUEST_DOORS, guest.knock) ou vérifier qu’elle n’est atteignable que derrière une porte fermée, puis l’inscrire dans INPUT_SOURCES.',
  );
});

test('mode invité : l’entrée est dans la rubrique Borne', () => {
  assert.ok(SYSTEM_GROUPS.borne.entries.includes('guest-mode'));
});

function sandbox(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cp-invite-'));
}

function guestMode(dataDir: string, buttons = DEFAULT_BUTTONS) {
  let clock = 1_000_000;
  const events: string[] = [];
  const mode = new GuestMode({ dataDir, buttons: () => buttons, onChange: () => events.push('change'), onUnlock: () => events.push('unlock'), now: () => clock });
  return { mode, events, tick: (ms: number) => ((clock += ms), mock.timers.tick(ms)) };
}

test('mode invité : désactivé, toutes les portes passent ; activé, seules les ouvertes, et le réglage survit au redémarrage', () => {
  const dir = sandbox();
  const { mode } = guestMode(dir);
  assert.equal(mode.active, false);
  assert.equal(mode.allows('menu.system'), true);
  assert.equal(mode.knock('sheet.remove'), true);
  assert.equal(mode.view(), undefined);
  mode.set(true);
  assert.equal(loadGuestMode(dir), true);
  for (const door of Object.keys(GUEST_DOORS) as GuestDoor[]) assert.equal(mode.allows(door), GUEST_DOORS[door], door);
  // Une action sans porte est fermée.
  assert.equal(mode.allows(undefined), false);
  // Au démarrage suivant, toujours actif.
  assert.equal(guestMode(dir).mode.active, true);
  mode.set(false);
  assert.equal(guestMode(dir).mode.active, false);
});

test('mode invité : une porte fermée ne s’ouvre pas et montre « Verrouillé » quelques secondes', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { mode, events, tick } = guestMode(sandbox());
    mode.set(true);
    assert.deepEqual(mode.view(), { active: true });
    assert.equal(mode.knock('menu.system'), false);
    assert.match(mode.view()?.hint ?? '', /Verrouillé/);
    assert.equal(mode.knock('sheet.play'), true);
    tick(3100);
    assert.deepEqual(mode.view(), { active: true });
    assert.ok(events.length >= 3, 'chaque changement est redessiné');
  } finally {
    mock.timers.reset();
  }
});

test('mode invité : les deux flippers et les deux MagnaSave tenus 3 s déverrouillent, pas un de moins', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const dir = sandbox();
    const { mode, events, tick } = guestMode(dir);
    mode.set(true);
    const down = (code: string) => mode.input(code, true, true);
    const up = (code: string) => mode.input(code, false, true);
    // Le premier bouton fait ce qu'il fait d'habitude ; les suivants, tenus avec lui, rien d'autre.
    assert.equal(down('ShiftLeft'), false);
    assert.equal(down('ControlLeft'), true);
    assert.equal(down('ShiftRight'), true);
    assert.equal(mode.view()?.unlocking, undefined, 'trois boutons ne suffisent pas');
    assert.equal(down('ControlRight'), true);
    assert.equal(mode.view()?.unlocking?.ms, GUEST_UNLOCK_MS);
    // Relâché avant la fin : l'anneau retombe, rien n'est déverrouillé.
    tick(2000);
    up('ControlRight');
    assert.equal(mode.view()?.unlocking, undefined);
    tick(2000);
    assert.equal(mode.active, true);
    // Tenus jusqu'au bout.
    down('ControlRight');
    tick(GUEST_UNLOCK_MS);
    assert.equal(mode.active, false);
    assert.equal(loadGuestMode(dir), false);
    assert.ok(events.includes('unlock'));
    // Le constat « désactivé » remplace le cadenas un moment, puis la roue dentée revient.
    assert.deepEqual(mode.view(), { active: false });
    tick(4100);
    assert.equal(mode.view(), undefined);
  } finally {
    mock.timers.reset();
  }
});

test('mode invité : la combinaison n’est pas écoutée pendant une partie, ni hors mode invité', () => {
  mock.timers.enable({ apis: ['setTimeout'] });
  try {
    const { mode, tick } = guestMode(sandbox());
    for (const code of ['ShiftLeft', 'ControlLeft', 'ShiftRight', 'ControlRight']) assert.equal(mode.input(code, true, true), false);
    tick(GUEST_UNLOCK_MS);
    assert.equal(mode.active, false, 'hors mode invité : rien');
    mode.set(true);
    for (const code of ['ShiftLeft', 'ControlLeft', 'ShiftRight', 'ControlRight']) mode.input(code, true, false);
    tick(GUEST_UNLOCK_MS);
    assert.equal(mode.active, true, 'pendant une partie : rien');
    assert.equal(mode.input('Digit1', true, true), false, 'Start n’est pas de la combinaison');
  } finally {
    mock.timers.reset();
  }
});

test('mode invité : la combinaison suit les boutons relevés, un clavier la remplace pour une MagnaSave absente', () => {
  // Pinscape : tout en boutons de joystick ; les touches d'un clavier servent aussi.
  const pin = (n: number) => joystickCode(`SDLJoy_${'0123456789abcdef'.repeat(2)}_0`, n);
  const joy = { ...DEFAULT_BUTTONS, leftFlipper: pin(1), rightFlipper: pin(2), leftMagna: pin(3), rightMagna: pin(4) };
  assert.deepEqual(
    guestUnlockSlots(joy).map((s) => s.codes),
    [[pin(1), 'ShiftLeft'], [pin(3), 'ControlLeft'], [pin(2), 'ShiftRight'], [pin(4), 'ControlRight']],
  );
  // Une touche par défaut prise par un autre bouton ne tient pas ce bouton-ci.
  const taken = { ...DEFAULT_BUTTONS, leftFlipper: pin(1), start: 'ShiftLeft' };
  assert.deepEqual(guestUnlockSlots(taken)[0]!.codes, [pin(1)]);
  // MagnaSave passées à l'étape « Boutons » : Ctrl gauche et Ctrl droit d'un clavier, dits sur l'écran de l'entrée.
  const { leftMagna: _l, rightMagna: _r, ...without } = DEFAULT_BUTTONS;
  assert.deepEqual(guestUnlockSlots(without)[1]!.codes, ['ControlLeft']);
  assert.match(guestUnlockHands(without).left, /MagnaSave gauche \(.+ d’un clavier\)/);
  assert.doesNotMatch(guestUnlockHands(DEFAULT_BUTTONS).left, /clavier/);
});
