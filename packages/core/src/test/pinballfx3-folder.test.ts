// Pinball FX3 depuis un dossier du jeu choisi à la main (packages/core/src/pinballfx3-folder.ts,
// app/src/pinballfx-install.ts, app/src/pinballfx-launcher.ts) : validation du dossier, réglage gardé,
// Steam inchangé sans dossier choisi, commande directe, inventaire, lancement qui échoue.
// Sur un disque simulé : ni Steam, ni jeu réel.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { findSteamPinballFx3, pinballFx3Command, pinballFx3InstalledTables } from '../pinballfx3';
import {
  checkPinballFx3Folder,
  chosenPinballFx3,
  pickPinballFx3Install,
  PINBALLFX3_FOLDER_FILE,
  pinballFx3DirectCommand,
  pinballFx3DirectFailureHint,
  pinballFx3FolderProblemReason,
  pinballFx3GameIn,
  pinballFx3FolderProblemText,
  pinballFx3LaunchCommand,
  readPinballFx3Folder,
  writePinballFx3Folder,
} from '../pinballfx3-folder';
import { REPO_ROOT } from './i18n-scan';

function tempDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-fx3-dossier-'));
}

/** Un jeu posé à la main : son exécutable et des tables dans data\steam. */
function fakeGame(dir: string, exe = 'Pinball FX Classic.exe', tables = ['WMS_Fish_Tales', 'Citadel', 'MARVEL_Ant-Man']): string {
  fs.mkdirSync(path.join(dir, 'data', 'steam'), { recursive: true });
  fs.writeFileSync(path.join(dir, exe), '');
  for (const t of [...tables, 'gui', 'PTSData']) fs.writeFileSync(path.join(dir, 'data', 'steam', `${t}.pxp`), '');
  return dir;
}

function listing(dir: string): string[] {
  const out: string[] = [];
  const walk = (d: string) => {
    for (const e of fs.readdirSync(d, { withFileTypes: true })) {
      const p = path.join(d, e.name);
      out.push(path.relative(dir, p));
      if (e.isDirectory()) walk(p);
    }
  };
  walk(dir);
  return out.sort();
}

test('dossier choisi : exécutable et tables exigés, le dossier du jeu trouvé d’où qu’on le désigne', () => {
  const root = tempDir();
  const game = fakeGame(path.join(root, 'Games', 'PinballFX3', 'Pinball FX3 Williams Pinball Volume 6'), 'Pinball FX3.exe');
  const before = listing(root);
  const ok = checkPinballFx3Folder(game);
  assert.ok(ok.ok);
  assert.deepEqual(ok.install, { store: 'folder', gameDir: game, launcher: path.join(game, 'Pinball FX3.exe'), tablesDir: path.join(game, 'data', 'steam') });
  // Le dossier des tables, son dossier data, l'exécutable lui-même, ou le dossier qui contient le jeu : le même jeu.
  for (const at of [path.join(game, 'data', 'steam'), path.join(game, 'data'), path.join(game, 'Pinball FX3.exe'), path.join(root, 'Games', 'PinballFX3')]) {
    const r = checkPinballFx3Folder(at);
    assert.ok(r.ok, at);
    assert.equal(r.install.gameDir, game, at);
  }
  // Le nom d'avril 2026 passe avant l'ancien.
  fs.writeFileSync(path.join(game, 'Pinball FX Classic.exe'), '');
  const both = checkPinballFx3Folder(game);
  assert.ok(both.ok);
  assert.equal(path.basename(both.install.launcher), 'Pinball FX Classic.exe');
  // Rien n'est écrit dans le dossier du jeu (ni steam_appid.txt, ni autre chose) par la vérification.
  assert.deepEqual(listing(root), [...before, path.join('Games', 'PinballFX3', 'Pinball FX3 Williams Pinball Volume 6', 'Pinball FX Classic.exe')].sort());
  fs.rmSync(root, { recursive: true });
});

test('dossier choisi refusé : introuvable, sans exécutable, sans tables ; deux jeux sous un même dossier : ambigu', () => {
  const root = tempDir();
  assert.deepEqual(checkPinballFx3Folder(path.join(root, 'absent')), { ok: false, problem: 'absent', dir: path.join(root, 'absent') });
  // Des tables sans exécutable (le dossier data\steam copié seul).
  fs.mkdirSync(path.join(root, 'Tables', 'data', 'steam'), { recursive: true });
  fs.writeFileSync(path.join(root, 'Tables', 'data', 'steam', 'WMS_Fish_Tales.pxp'), '');
  assert.equal((checkPinballFx3Folder(path.join(root, 'Tables')) as { problem: string }).problem, 'no-exe');
  // Un autre .exe n'est pas le jeu.
  fs.writeFileSync(path.join(root, 'Tables', 'Pinball FX.exe'), '');
  assert.equal((checkPinballFx3Folder(path.join(root, 'Tables')) as { problem: string }).problem, 'no-exe');
  // L'exécutable sans tables (seulement les fichiers du jeu).
  const bare = fakeGame(path.join(root, 'Vide'), 'Pinball FX Classic.exe', []);
  assert.deepEqual(checkPinballFx3Folder(bare), { ok: false, problem: 'no-tables', dir: bare });
  // Deux jeux sous le même dossier : aucun n'est deviné.
  fakeGame(path.join(root, 'Deux', 'A'));
  fakeGame(path.join(root, 'Deux', 'B'));
  assert.equal((checkPinballFx3Folder(path.join(root, 'Deux')) as { problem: string }).problem, 'no-exe');
  fs.rmSync(root, { recursive: true });
});

test('ajout général : le dossier du jeu ou ses fichiers reconnus comme Pinball FX3, jamais un dossier de tables VPX qui le contiendrait', () => {
  const root = tempDir();
  const game = fakeGame(path.join(root, 'Pinball FX3 Williams Pinball Volume 6'), 'Pinball FX3.exe');
  // Fichiers du jeu sans rapport avec une table (quels qu'ils soient) : sans effet sur la reconnaissance.
  fs.writeFileSync(path.join(game, 'autre.dll'), '');
  fs.writeFileSync(path.join(game, 'data', 'steam', 'Aliens.jpg'), '');
  // Le dossier du jeu choisi.
  const whole = pinballFx3GameIn([game]);
  assert.equal(whole?.install.gameDir, game);
  assert.deepEqual(whole?.used, [game]);
  // Son dossier data\steam, ou des tables .pxp choisies une à une.
  assert.equal(pinballFx3GameIn([path.join(game, 'data', 'steam')])?.install.gameDir, game);
  const pxp = [path.join(game, 'data', 'steam', 'WMS_Fish_Tales.pxp'), path.join(game, 'data', 'steam', 'Citadel.pxp')];
  assert.deepEqual(pinballFx3GameIn(pxp)?.used, pxp);
  // Avec une table VPX d'ailleurs : elle reste à l'ajout habituel.
  const vpx = path.join(root, 'Ailleurs', 'Table.vpx');
  fs.mkdirSync(path.dirname(vpx));
  fs.writeFileSync(vpx, '');
  assert.deepEqual(pinballFx3GameIn([vpx, game])?.used, [game]);
  assert.equal(pinballFx3GameIn([vpx]), undefined);
  // Un dossier qui contient le jeu parmi d'autres choses : pas deviné, l'ajout habituel le prend.
  assert.equal(pinballFx3GameIn([root]), undefined);
  // Un fichier posé à côté du jeu, hors de son dossier : pas au jeu.
  const beside = path.join(root, 'Table posée là.vpx');
  fs.writeFileSync(beside, '');
  assert.equal(pinballFx3GameIn([beside]), undefined);
  fs.rmSync(root, { recursive: true });
});

test('réglage : le dossier gardé dans le dossier des données, relu et vérifié à chaque fois, oublié sur demande', () => {
  const root = tempDir();
  const data = path.join(root, 'data');
  assert.equal(readPinballFx3Folder(data), undefined);
  assert.equal(chosenPinballFx3(data), undefined);
  const game = fakeGame(path.join(root, 'Jeu'));
  writePinballFx3Folder(data, game);
  assert.deepEqual(JSON.parse(fs.readFileSync(path.join(data, PINBALLFX3_FOLDER_FILE), 'utf8')), { gameDir: game });
  assert.equal(chosenPinballFx3(data)?.install?.launcher, path.join(game, 'Pinball FX Classic.exe'));
  // Disque débranché ou dossier déplacé depuis : le choix reste, signalé, sans jeu.
  fs.rmSync(game, { recursive: true });
  assert.deepEqual(chosenPinballFx3(data), { dir: game, problem: 'absent' });
  writePinballFx3Folder(data, undefined);
  assert.equal(readPinballFx3Folder(data), undefined);
  // Retouché à la main et enregistré avec une marque d'ordre des octets (Bloc-notes, PowerShell 5.1) : lu quand même.
  fs.writeFileSync(path.join(data, PINBALLFX3_FOLDER_FILE), String.fromCharCode(0xfeff) + JSON.stringify({ gameDir: 'E:\\Jeux\\FX3' }));
  assert.equal(readPinballFx3Folder(data), 'E:\\Jeux\\FX3');
  // Fichier abîmé : aucun dossier, sans erreur.
  fs.writeFileSync(path.join(data, PINBALLFX3_FOLDER_FILE), '{ pas du json');
  assert.equal(readPinballFx3Folder(data), undefined);
  fs.rmSync(root, { recursive: true });
});

test('jeu choisi : sans dossier, exactement celui de Steam ; dossier de Steam choisi : toujours Steam ; dossier invalide : Steam', () => {
  const steam = { store: 'steam' as const, gameDir: 'C:\\Steam\\steamapps\\common\\Pinball FX Classic', launcher: 'C:\\Steam\\steam.exe', tablesDir: 'C:\\Steam\\steamapps\\common\\Pinball FX Classic\\data\\steam' };
  const folder = { store: 'folder' as const, gameDir: 'D:\\Games\\PinballFX3', launcher: 'D:\\Games\\PinballFX3\\Pinball FX3.exe', tablesDir: 'D:\\Games\\PinballFX3\\data\\steam' };
  assert.equal(pickPinballFx3Install(steam, undefined), steam);
  assert.equal(pickPinballFx3Install(undefined, undefined), undefined);
  assert.equal(pickPinballFx3Install(steam, { dir: folder.gameDir, install: folder }), folder);
  assert.equal(pickPinballFx3Install(undefined, { dir: folder.gameDir, install: folder }), folder);
  // Le dossier de Steam lancé directement ferait demander une confirmation par Steam à chaque partie.
  const sameAsSteam = { ...folder, gameDir: steam.gameDir.toLowerCase(), launcher: `${steam.gameDir}\\Pinball FX Classic.exe` };
  assert.equal(pickPinballFx3Install(steam, { dir: sameAsSteam.gameDir, install: sameAsSteam }), steam);
  assert.equal(pickPinballFx3Install(steam, { dir: 'E:\\Débranché', problem: 'absent' }), steam);
});

test('commande directe : l’exécutable du dossier, -offline, -class pour Williams et Bally, -table_<fichier>, dans le dossier du jeu', () => {
  const install = { store: 'folder' as const, gameDir: 'D:\\Games\\PinballFX3', launcher: 'D:\\Games\\PinballFX3\\Pinball FX3.exe', tablesDir: 'D:\\Games\\PinballFX3\\data\\steam' };
  assert.deepEqual(pinballFx3DirectCommand(install, 'WMS_Fish_Tales'), { file: install.launcher, args: ['-offline', '-class', '-table_WMS_Fish_Tales'], cwd: install.gameDir });
  assert.deepEqual(pinballFx3DirectCommand(install, 'BALLY_Attack_from_Mars').args, ['-offline', '-class', '-table_BALLY_Attack_from_Mars']);
  assert.deepEqual(pinballFx3DirectCommand(install, 'MARVEL_Ant-Man').args, ['-offline', '-table_MARVEL_Ant-Man']);
  assert.deepEqual(pinballFx3DirectCommand(install, 'WMS_Fish_Tales', { classic: false }).args, ['-offline', '-table_WMS_Fish_Tales']);
  assert.deepEqual(pinballFx3LaunchCommand(install, 'Citadel'), { file: install.launcher, args: ['-offline', '-table_Citadel'], cwd: install.gameDir });
  for (const bad of ['Fish Tales', 'x" -offline', '', 'a/b', '..\\x']) assert.throws(() => pinballFx3DirectCommand(install, bad));
  // Le jeu de Steam : la commande d'avant, à l'identique (steam.exe -applaunch, pas de dossier de travail).
  const steam = { store: 'steam' as const, gameDir: 'C:\\S\\common\\Pinball FX3', launcher: 'C:\\S\\steam.exe', tablesDir: 'C:\\S\\common\\Pinball FX3\\data\\steam' };
  assert.deepEqual(pinballFx3LaunchCommand(steam, 'WMS_Fish_Tales'), pinballFx3Command(steam, 'WMS_Fish_Tales'));
  assert.deepEqual(pinballFx3LaunchCommand(steam, 'WMS_Fish_Tales'), { file: 'C:\\S\\steam.exe', args: ['-applaunch', '442120', '-class', '-table_WMS_Fish_Tales'] });
});

test('inventaire : les tables du dossier choisi, sans les fichiers du jeu', () => {
  const root = tempDir();
  const check = checkPinballFx3Folder(fakeGame(path.join(root, 'Jeu')));
  assert.ok(check.ok);
  assert.deepEqual(pinballFx3InstalledTables(check.install).map((t) => t.name).sort(), ['Citadel', 'MARVEL_Ant-Man', 'WMS_Fish_Tales']);
  fs.rmSync(root, { recursive: true });
});

test('messages : dossier refusé expliqué ; échec du jeu sans promesse, avec mode borne, achat et retour à Steam', () => {
  assert.match(pinballFx3FolderProblemText('no-exe', 'D:\\X'), /Pinball FX Classic\.exe.*Pinball FX3\.exe/);
  assert.match(pinballFx3FolderProblemText('no-tables', 'D:\\X'), /data\\steam/);
  assert.match(pinballFx3FolderProblemText('absent', 'D:\\X'), /introuvable/);
  // Sous une ligne qui montre déjà le dossier : la raison seule, sans le chemin répété.
  for (const p of ['absent', 'no-exe', 'no-tables'] as const) assert.doesNotMatch(pinballFx3FolderProblemReason(p), /D:\\X|«\s*\{dir\}/);
  const hint = pinballFx3DirectFailureHint('D:\\Games\\PinballFX3');
  assert.match(hint, /D:\\Games\\PinballFX3/);
  assert.match(hint, /mode borne/);
  assert.match(hint, /achetée/);
  assert.match(hint, /Oublier ce dossier/);
  // Jamais de promesse qu'une table s'ouvrira, jamais d'invitation à contourner Steam.
  assert.doesNotMatch(hint, /s’ouvrira|steam_appid|débloqu/i);
});

// ---------------------------------------------------------------------------
// Côté app : détection (Steam simulé) et lanceur.
// ---------------------------------------------------------------------------

const install = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx-install.js')) as {
  detectPinballFx3(dataDir?: string): { store: string; gameDir: string; launcher: string; tablesDir: string } | undefined;
  pinballFx3Setup(dataDir?: string): { install?: { store: string; gameDir: string }; chosen?: { dir: string; problem?: string }; steamDir?: string; downloading: boolean };
};

test('détection : sans dossier choisi, Steam comme avant ; dossier choisi : lui ; dossier de Steam choisi : Steam', () => {
  const root = tempDir();
  const steam = path.join(root, 'Steam');
  const common = path.join(steam, 'steamapps', 'common', 'Pinball FX Classic');
  fakeGame(common);
  fs.writeFileSync(path.join(steam, 'steam.exe'), '');
  fs.writeFileSync(path.join(steam, 'steamapps', 'appmanifest_442120.acf'), `"AppState" { "appid" "442120" "installdir" "Pinball FX Classic" "StateFlags" "4" }`);
  const data = path.join(root, 'data');
  const saved = process.env.CYBERPINBALL_STEAM_SIMULE;
  process.env.CYBERPINBALL_STEAM_SIMULE = steam;
  try {
    // Aucun dossier choisi : exactement ce que Steam donne, avec ou sans dossier des données.
    assert.deepEqual(install.detectPinballFx3(data), findSteamPinballFx3(steam));
    assert.deepEqual(install.detectPinballFx3(), findSteamPinballFx3(steam));
    assert.equal(install.pinballFx3Setup(data).chosen, undefined);
    // Dossier choisi ailleurs : il passe avant Steam.
    const game = fakeGame(path.join(root, 'Games', 'PinballFX3'), 'Pinball FX3.exe');
    writePinballFx3Folder(data, game);
    assert.deepEqual(install.detectPinballFx3(data), { store: 'folder', gameDir: game, launcher: path.join(game, 'Pinball FX3.exe'), tablesDir: path.join(game, 'data', 'steam') });
    assert.equal(install.pinballFx3Setup(data).steamDir, common);
    // Dossier choisi débranché : Steam, et le problème dit.
    fs.rmSync(game, { recursive: true });
    assert.equal(install.detectPinballFx3(data)?.store, 'steam');
    assert.equal(install.pinballFx3Setup(data).chosen?.problem, 'absent');
    // Le dossier de Steam lui-même choisi : la partie passe toujours par Steam.
    writePinballFx3Folder(data, common);
    assert.deepEqual(install.detectPinballFx3(data), findSteamPinballFx3(steam));
  } finally {
    if (saved === undefined) delete process.env.CYBERPINBALL_STEAM_SIMULE;
    else process.env.CYBERPINBALL_STEAM_SIMULE = saved;
    fs.rmSync(root, { recursive: true });
  }
});

interface FakeWindow {
  hwnd: unknown;
  handle: bigint;
  pid: number;
  threadId: number;
  title: string;
  className: string;
  visible: boolean;
  minimized: boolean;
  topmost: boolean;
  rect: { x: number; y: number; width: number; height: number };
}

const launcher = require(path.join(REPO_ROOT, 'app', 'dist', 'pinballfx-launcher.js')) as {
  DIRECT_GRACE_MS: number;
  ZEN_LAUNCH_GAMES: Record<'pinballfx' | 'pinballfx3', { name: string }>;
  launchPinballFx(opts: { command: { file: string; args: string[]; cwd?: string }; game?: unknown; timeoutMs?: number; system: unknown }): {
    pid: number | undefined;
    stop(): void;
    done: Promise<{ ok: boolean; failure?: string; message?: string; seconds: number }>;
  };
};

function win(pid: number, title: string): FakeWindow {
  return { hwnd: null, handle: BigInt(pid), pid, threadId: 1, title, className: 'PxWindowClass', visible: true, minimized: false, topmost: false, rect: { x: 0, y: 0, width: 10, height: 10 } };
}

function fakeSystem() {
  let clock = 0;
  const sys = {
    spawned: [] as { file: string; args: string[]; cwd?: string }[],
    shown: [] as FakeWindow[],
    living: new Set<number>([500]),
    launch(file: string, args: string[], cwd?: string) {
      sys.spawned.push({ file, args, ...(cwd ? { cwd } : {}) });
      return { pid: 500, on: () => undefined };
    },
    windows: () => sys.shown,
    alive: (pid: number) => sys.living.has(pid),
    kill: (pid: number) => void sys.living.delete(pid),
    close: () => undefined,
    front: () => undefined,
    foregroundPid: () => undefined,
    now: () => clock,
    advance(ms: number) {
      clock += ms;
    },
  };
  return sys;
}

const tick = (ms = 300) => new Promise((r) => setTimeout(r, ms));

test('lancement direct : exécutable lancé dans le dossier du jeu, fenêtre reconnue à son titre ; fermé sans fenêtre : échec rapide', async () => {
  const direct = { ...launcher.ZEN_LAUNCH_GAMES.pinballfx3, direct: true };
  const command = { file: 'D:\\Jeu\\Pinball FX3.exe', args: ['-offline', '-class', '-table_WMS_Fish_Tales'], cwd: 'D:\\Jeu' };
  // Le jeu paraît : partie normale, le processus lancé est le jeu.
  const sys = fakeSystem();
  const game = launcher.launchPinballFx({ command, game: direct, system: sys, timeoutMs: 120_000 });
  assert.deepEqual(sys.spawned, [command]);
  sys.shown.push(win(500, 'Pinball FX3'));
  await tick();
  sys.advance(60_000);
  sys.living.delete(500);
  const played = await game.done;
  assert.equal(played.ok, true);
  assert.equal(played.seconds, 60);
  // Le jeu refuse de s'ouvrir (exige Steam, par exemple) : échec après le délai de grâce, pas au bout de 120 s.
  const sys2 = fakeSystem();
  const refused = launcher.launchPinballFx({ command, game: direct, system: sys2, timeoutMs: 120_000 });
  sys2.living.delete(500);
  await tick();
  sys2.advance(launcher.DIRECT_GRACE_MS + 1);
  const r = await refused.done;
  assert.equal(r.ok, false);
  assert.equal(r.failure, 'crash');
  assert.match(r.message ?? '', /Pinball FX3/);
  // Processus parti, fenêtre parue dans le délai (jeu relancé par un autre processus) : la partie compte.
  const sys3 = fakeSystem();
  const relaunched = launcher.launchPinballFx({ command, game: direct, system: sys3, timeoutMs: 120_000 });
  sys3.living.delete(500);
  await tick();
  sys3.advance(3000);
  sys3.shown.push(win(600, 'Pinball FX Classic'));
  sys3.living.add(600);
  await tick();
  sys3.advance(30_000);
  sys3.living.delete(600);
  assert.equal((await relaunched.done).ok, true);
  // Par Steam (sans `direct`), steam.exe qui s'arrête tout de suite n'est pas un échec : la fenêtre est attendue.
  const sys4 = fakeSystem();
  const bySteam = launcher.launchPinballFx({ command: { file: 'steam.exe', args: [] }, game: launcher.ZEN_LAUNCH_GAMES.pinballfx3, system: sys4, timeoutMs: 120_000 });
  sys4.living.delete(500);
  await tick();
  sys4.advance(launcher.DIRECT_GRACE_MS + 1);
  await tick();
  sys4.shown.push(win(700, 'Pinball FX Classic'));
  sys4.living.add(700);
  await tick();
  sys4.living.delete(700);
  assert.equal((await bySteam.done).ok, true);
});
