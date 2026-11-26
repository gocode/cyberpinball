import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { GUEST_DOORS, type GuestDoor } from '../guestmode';
import { describeTableFile, type TableEntry } from '../tables';
import { fakeLibraryHost } from './doublures';
import { REPO_ROOT } from './i18n-scan';
import { runElectron } from './electron-run';
import { test } from 'node:test';
import { removeTempDir } from './temp-dir';

interface Library {
  openSheet(table: TableEntry): void;
  handleKey(input: { code: string; type: 'keyDown'; isAutoRepeat: boolean }, fromPhone?: boolean): boolean;
  view(): { heading: string; cursor: number; actions: { label: string }[] } | undefined;
  remoteEntries(): unknown;
}
function libraryFactory() { return require(path.join(REPO_ROOT, 'app/dist/library.js')) as { createLibrary(host: unknown): Library }; }

function scenario(game: 'pinballfx' | 'pinballfxmidnight' | 'vpx' | 'fpt', run: (library: Library, table: TableEntry, modes: string[]) => void, landscape = false, guest = false, invalid = false): void {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-player-modes-'));
  try {
    const file = path.join(root, 'Demo.' + game);
    fs.writeFileSync(file, game === 'pinballfx' ? '{"PinballFX":{"Table":108}}' : game === 'pinballfxmidnight' && !invalid ? '{"PinballFXMidnight":{"Table":171}}' : '{}');
    const table = describeTableFile(root, file);
    const modes: string[] = [];
    const allowed = (door: GuestDoor) => !guest || GUEST_DOORS[door];
    const external = { previous: ['ArrowLeft'], next: ['ArrowRight'], confirm: ['Enter'], exit: ['Escape'] };
    const buttons = { previous: ['KeyA'], next: ['KeyS'], confirm: ['Digit2'], exit: ['KeyQ'] };
    const library = libraryFactory().createLibrary(fakeLibraryHost({
      root, dataDir: root, tables: () => [table],
      guest: { active: guest, allows: allowed, knock: allowed },
      landscape: () => landscape, keys: () => external, playerModeKeys: () => buttons,
      play: (entry: TableEntry, mode: string) => { assert.equal(entry.id, table.id); modes.push(mode); },
    }));
    run(library, table, modes);
  } finally { removeTempDir(root); }
}

const key = (library: Library, code: string, isAutoRepeat = false, fromPhone = false) => library.handleKey({ type: 'keyDown', code, isAutoRepeat }, fromPhone);
const selected = (library: Library) => { const view = library.view()!; return view.actions[view.cursor]?.label; };
function choosePlay(library: Library): void {
  const count = library.view()!.actions.length;
  for (let at = 0; at < count && selected(library) !== 'Jouer'; at++) key(library, 'ArrowRight');
  assert.equal(selected(library), 'Jouer');
  key(library, 'Enter');
}

function check(label: string, run: () => void): void {
  run();
  console.log(label);
}

export function parcours(): void {
  for (const game of ['pinballfx', 'pinballfxmidnight'] as const) check(game + ' : navigation locale, Start, Exit et les quatre choix', () => {
    for (const landscape of [false, true]) scenario(game, (library, table, modes) => {
      for (const [index, mode] of ['Classic', 'Hotseat_2', 'Hotseat_3', 'Hotseat_4'].entries()) {
        library.openSheet(table);
        choosePlay(library);
        assert.equal(library.view()?.heading, 'Mode de jeu');
        assert.equal(selected(library), '1 joueur');
        assert.equal(library.remoteEntries(), undefined);
        key(library, 'Digit2', true);
        key(library, 'Digit2', false, true);
        assert.equal(modes.length, index, 'Start répété ou depuis le téléphone ignoré');
        key(library, 'KeyS');
        assert.equal(selected(library), '2 joueurs');
        key(library, 'KeyA');
        assert.equal(selected(library), '1 joueur');
        for (let move = 0; move < index; move++) key(library, 'KeyS');
        assert.equal(selected(library), index === 0 ? '1 joueur' : (index + 1) + ' joueurs');
        key(library, 'Digit2');
        assert.equal(modes.at(-1), mode);
        assert.equal(library.view(), undefined);
      }
      library.openSheet(table);
      choosePlay(library);
      key(library, 'KeyQ');
      assert.equal(library.view()?.heading, table.title);
      assert.equal(modes.length, 4, 'Exit ne lance rien et revient à la fiche');
    }, landscape, true);
  });

  check('FX conserve Practice, Pro et les défis, Midnight ne les propose pas', () => {
    scenario('pinballfx', (library, table, modes) => {
      library.openSheet(table);
      choosePlay(library);
      for (let at = 0; at < 4; at++) key(library, 'KeyS');
      assert.equal(selected(library), 'Autres modes');
      key(library, 'Digit2');
      assert.equal(library.view()?.heading, 'Autres modes');
      assert.ok(library.view()?.actions.some(({ label }) => label === 'Pro'));
      assert.equal(library.view()?.actions.filter(({ label }) => label.startsWith('Défi')).length, 4);
      key(library, 'Digit2');
      assert.deepEqual(modes, ['Practice']);
    });
    scenario('pinballfxmidnight', (library, table) => {
      library.openSheet(table);
      choosePlay(library);
      assert.equal(library.view()?.actions.some(({ label }) => label === 'Autres modes'), false);
    });
  });

  check('VPX, Future Pinball et fiche Midnight illisible : aucun sélecteur, chemin de lancement existant', () => {
    for (const game of ['vpx', 'fpt', 'pinballfxmidnight'] as const) scenario(game, (library, table, modes) => {
      library.openSheet(table);
      choosePlay(library);
      assert.deepEqual(modes, [undefined]);
      assert.equal(library.view(), undefined);
    }, false, false, true);
  });
}

function electronPath(): string | undefined {
  try { return require(require.resolve('electron', { paths: [REPO_ROOT] })) as string; }
  catch { return undefined; }
}

if (process.versions.electron) {
  parcours();
} else {
  const electron = electronPath();
  test('sélecteur dans la vraie bibliothèque Electron, flippers et mode invité', { skip: process.platform !== 'win32' || !electron, timeout: 60_000 }, () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-modes-electron-'));
    try {
      const program = path.join(dir, 'bench.cjs');
      fs.writeFileSync(program, [
        'const { app } = require("electron");',
        'app.setPath("userData", ' + JSON.stringify(path.join(dir, 'chromium')) + ');',
        'try { require(' + JSON.stringify(__filename) + '); app.exit(0); }',
        'catch (error) { console.error(error); app.exit(1); }',
      ].join('\n'));
      const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_RESEAU: 'off', CYBERPINBALL_HOME: dir, CYBERPINBALL_ROOT: dir };
      delete env.ELECTRON_RUN_AS_NODE;
      delete env.CYBERPINBALL_A_L_ECRAN;
      const result = runElectron(electron!, [program, '--user-data-dir=' + path.join(dir, 'chromium')], { dir, env, cwd: REPO_ROOT, timeout: 45_000 });
      const output = result.stdout + result.stderr;
      assert.equal(result.status, 0, output);
      assert.match(output, /pinballfx : navigation locale/);
      assert.match(output, /pinballfxmidnight : navigation locale/);
      assert.match(output, /FX conserve Practice/);
      assert.match(output, /VPX, Future Pinball/);
    } finally { removeTempDir(dir); }
  });
}
