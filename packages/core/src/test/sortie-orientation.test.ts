// Orientation du bureau à la sortie. Signalement du 27/10/2026 : en quittant Cyber Pinball, le
// bureau et le menu Démarrer de l'écran du playfield restaient à l'envers. L'assistant tournait
// l'écran dans Windows pour VPX (CDS_UPDATEREGISTRY) et l'y laissait.
//
// L'invariant, sur les écrans simulés de docs\ecrans (ceux de CYBERPINBALL_DISPLAYS) et un
// Windows simulé qui distingue son réglage (gardé au redémarrage) du changement dynamique :
// quel que soit le chemin de sortie, chaque écran retrouve l'orientation qu'il avait avant
// Cyber Pinball, et le réglage de Windows n'est jamais changé, sauf pour lui rendre ce qu'une
// version précédente y avait laissé.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { edgeAfterRotation, rotatedDisplay, rotationDelta } from '../layout';
import type { Cabinet, FlipperEdge, ObservedDisplay, Rotation } from '../model';
import { parseSimulatedDisplays } from '../offscreen';
import {
  legacyOrientation,
  ORIENTATION_FILE,
  readOrientationRecord,
  readSimulatedOrientations,
  rotateSimulated,
  SessionOrientation,
  sessionScreens,
  wantedOrientations,
  withSimulatedOrientations,
} from '../sessionorientation';
import { vpxOrientationFix } from '../vpx';
import { emptyCabinet } from './fixtures';
import { REPO_ROOT } from './i18n-scan';

const FIXTURES = ['borne.json', 'pc-dev.json', 'poste-deux-ecrans.json', 'un-ecran.json'];
const fixture = (name: string): ObservedDisplay[] => {
  const file = path.join(REPO_ROOT, 'docs', 'ecrans', name);
  return parseSimulatedDisplays(JSON.parse(fs.readFileSync(file, 'utf8')), file);
};

/**
 * Windows simulé : un réglage par écran (repris au redémarrage) et, par-dessus, ce qu'un
 * changement dynamique y a mis. Il compte ce que Cyber Pinball écrit dans son réglage.
 */
class FakeWindows {
  readonly registry = new Map<string, Rotation>();
  readonly session = new Map<string, Rotation>();
  persisted = 0;
  /** Écrans que Windows refuse de tourner (pilote). */
  readonly refuses = new Set<string>();

  constructor(readonly base: ObservedDisplay[]) {
    for (const d of base) this.registry.set(d.gdiName, d.rotation);
  }

  rotation(gdiName: string): Rotation {
    return this.session.get(gdiName) ?? this.registry.get(gdiName)!;
  }

  displays(): ObservedDisplay[] {
    return this.base.map((d) => rotatedDisplay(d, rotationDelta(this.rotation(d.gdiName), d.rotation)));
  }

  rotate(gdiName: string, rotation: Rotation, persist: boolean): void {
    if (this.refuses.has(gdiName)) throw new Error('le pilote a refusé, code -1');
    if (persist) {
      this.registry.set(gdiName, rotation);
      this.session.delete(gdiName);
      this.persisted++;
    } else this.session.set(gdiName, rotation);
  }

  /** Redémarrage du PC (ou extinction) : seul le réglage reste. */
  reboot(): void {
    this.session.clear();
  }

  /** Bureau tel que l'utilisateur le voit : l'orientation de chaque écran. */
  desktop(): Record<string, Rotation> {
    return Object.fromEntries(this.base.map((d) => [d.gdiName, this.rotation(d.gdiName)]));
  }
}

/** Un écran et le bord du joueur pour lesquels l'assistant doit tourner l'écran (vpxOrientationFix). */
function flippedSetup(displays: ObservedDisplay[]): { display: ObservedDisplay; edge: FlipperEdge; rotation: Rotation } | undefined {
  for (const display of displays) {
    for (const edge of ['bottom', 'left', 'top', 'right'] as FlipperEdge[]) {
      const fix = vpxOrientationFix(display, edge);
      if (fix) return { display, edge, rotation: fix.rotation };
    }
  }
  return undefined;
}

interface Borne {
  windows: FakeWindows;
  file: string;
  cabinet: Cabinet;
  playfield: ObservedDisplay;
  playing: Rotation;
  origin: Record<string, Rotation>;
  /** Un processus de Cyber Pinball (menu, assistant, relance) qui démarre. */
  launch(): SessionOrientation;
}

/** Borne configurée : l'assistant a dû tourner le playfield, le modèle dit l'orientation de jeu. */
function borne(name: string): Borne | undefined {
  const base = fixture(name);
  const setup = flippedSetup(base);
  if (!setup) return undefined;
  const windows = new FakeWindows(base);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-orientation-'));
  const file = path.join(dir, ORIENTATION_FILE);
  const screen = toPhysicalScreen(rotatedDisplay(setup.display, rotationDelta(setup.rotation, setup.display.rotation)));
  const cabinet: Cabinet = {
    ...emptyCabinet(),
    screens: [screen],
    roles: { playfield: screen.fingerprint },
    // Le bord enregistré vaut pour l'image tournée, comme dans l'assistant (flipPlayfield).
    playfield: { flipperEdge: edgeAfterRotation(setup.edge, rotationDelta(setup.rotation, setup.display.rotation)), windowsRotation: setup.rotation },
  };
  const launch = () => {
    const session = new SessionOrientation({
      file,
      screens: () => sessionScreens(windows.displays(), cabinet),
      rotate: (gdi, rotation, persist) => windows.rotate(gdi, rotation, persist),
    });
    session.start(wantedOrientations(cabinet));
    return session;
  };
  return { windows, file, cabinet, playfield: setup.display, playing: setup.rotation, origin: windows.desktop(), launch };
}

function bornes(): [string, Borne][] {
  const found = FIXTURES.map((name) => [name, borne(name)] as const).filter((e): e is [string, Borne] => e[1] !== undefined);
  assert.ok(found.length > 0, 'au moins un jeu d’écrans de docs\\ecrans demande de tourner le playfield');
  return found;
}

/**
 * Chemins de sortie de l'application (app/src/display-orientation.ts) : chacun part d'une
 * session en cours, l'écran tourné, et finit sur le bureau de l'utilisateur.
 */
const EXITS: Record<string, (b: Borne, session: SessionOrientation) => void> = {
  // will-quit, puis process 'exit' : la seconde ne refait rien.
  'Quitter Cyber Pinball': (_b, s) => {
    s.end();
    s.end();
  },
  'fermeture de la fenêtre': (_b, s) => s.end(),
  // L'installeur relance Cyber Pinball, qui retourne l'écran, puis se ferme à son tour.
  'redémarrage pour une mise à jour': (b, s) => {
    s.end();
    b.launch().end();
  },
  // dedicated-session.ts sort avec le code 77 dans will-quit : display-orientation.ts est passé avant.
  'borne dédiée, sortie code 77': (_b, s) => s.end(),
  // Relance couverte : le nouveau processus reprend la main, l'ancien sort par app.exit.
  'relance menu ↔ assistant, puis Quitter': (b, s) => {
    s.handOver();
    const next = b.launch();
    s.end();
    next.end();
  },
  'relance par Shell Launcher, puis Quitter': (b, s) => {
    s.handOver();
    b.launch().end();
  },
  'plantage, puis lancement suivant et Quitter': (b) => b.launch().end(),
  'plantage, puis redémarrage du PC sans Cyber Pinball': (b) => b.windows.reboot(),
  'extinction par le module d’alimentation': (b) => b.windows.reboot(),
  'redémarrage par le module d’alimentation, puis Quitter': (b) => {
    b.windows.reboot();
    b.launch().end();
  },
  // Au réveil, Windows remet parfois son réglage ; la session reprend l'orientation de jeu.
  'veille, réveil, puis Quitter': (b, s) => {
    b.windows.session.clear();
    s.check();
    assert.equal(b.windows.rotation(b.playfield.gdiName), b.playing, 'au réveil, la table est de nouveau dans le bon sens');
    s.end();
  },
  'mode bureau, retour, puis Quitter': (b, s) => {
    s.suspend();
    assert.deepEqual(b.windows.desktop(), b.origin, 'au mode bureau, le bureau a l’orientation de Windows');
    s.check();
    assert.deepEqual(b.windows.desktop(), b.origin, 'au mode bureau, un changement d’écrans ne retourne pas l’écran');
    s.resume();
    assert.equal(b.windows.rotation(b.playfield.gdiName), b.playing);
    s.end();
  },
};

for (const [name, exit] of Object.entries(EXITS)) {
  test(`orientation à la sortie : ${name} rend au bureau l’orientation d’avant Cyber Pinball`, () => {
    for (const [fixtureName, b] of bornes()) {
      const session = b.launch();
      assert.equal(b.windows.rotation(b.playfield.gdiName), b.playing, `${fixtureName} : en partie, l’écran est dans l’orientation de jeu`);
      exit(b, session);
      assert.deepEqual(b.windows.desktop(), b.origin, `${fixtureName} : ${name}`);
      assert.equal(b.windows.persisted, 0, `${fixtureName} : le réglage de Windows n’a pas été touché`);
      // Le démarrage suivant n'a plus rien à rendre (fichier repris ou effacé).
      const after = b.launch();
      after.end();
      assert.deepEqual(b.windows.desktop(), b.origin);
      assert.ok(!fs.existsSync(b.file), `${fixtureName} : plus de fichier d’orientation après une sortie propre`);
    }
  });
}

test('orientation : l’origine est notée dans le fichier avant de tourner l’écran', () => {
  const [, b] = bornes()[0]!;
  let seen: ReturnType<typeof readOrientationRecord> = [];
  const session = new SessionOrientation({
    file: b.file,
    screens: () => sessionScreens(b.windows.displays(), b.cabinet),
    rotate: (gdi, rotation, persist) => {
      seen = readOrientationRecord(b.file);
      b.windows.rotate(gdi, rotation, persist);
    },
  });
  session.start(wantedOrientations(b.cabinet));
  assert.equal(seen.length, 1, 'le fichier existe déjà quand Windows tourne l’écran');
  assert.equal(seen[0]!.origin, b.origin[b.playfield.gdiName]);
  assert.equal(readOrientationRecord(b.file)[0]!.applied, b.playing);
  session.end();
});

test('orientation : un écran tourné par l’utilisateur après un plantage garde son orientation', () => {
  const [, b] = bornes()[0]!;
  b.launch();
  // Plantage, puis Paramètres > Affichage : l'utilisateur choisit une autre orientation.
  const chosen = ((b.playing + 90) % 360) as Rotation;
  b.windows.rotate(b.playfield.gdiName, chosen, true);
  b.windows.persisted = 0;
  b.launch().end();
  assert.equal(b.windows.rotation(b.playfield.gdiName), chosen, 'son choix devient l’orientation du bureau');
});

test('orientation : une sortie qui n’a pas pu rendre l’orientation le dit, et le démarrage suivant aussi', () => {
  const [, b] = bornes()[0]!;
  const session = b.launch();
  b.windows.refuses.add(b.playfield.gdiName);
  const report = session.end();
  assert.equal(report.problems.length, 1);
  assert.match(report.problems[0]!, /orientation d’origine/);
  assert.match(report.problems[0]!, /Paramètres > Affichage/);
  assert.ok(fs.existsSync(b.file), 'l’origine reste notée pour la reprise');
  b.windows.refuses.clear();
  const next = new SessionOrientation({
    file: b.file,
    screens: () => sessionScreens(b.windows.displays(), b.cabinet),
    rotate: (gdi, rotation, persist) => b.windows.rotate(gdi, rotation, persist),
  });
  const start = next.start(wantedOrientations(b.cabinet));
  assert.ok(start.problems.some((p) => p.startsWith('À la dernière fermeture de Cyber Pinball')), start.problems.join('\n'));
  next.end();
  assert.deepEqual(b.windows.desktop(), b.origin);
});

test('orientation : sans orientation de jeu dans le modèle, Cyber Pinball ne tourne aucun écran', () => {
  for (const name of FIXTURES) {
    const windows = new FakeWindows(fixture(name));
    const before = windows.desktop();
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-orientation-'));
    const session = new SessionOrientation({
      file: path.join(dir, ORIENTATION_FILE),
      screens: () => sessionScreens(windows.displays()),
      rotate: (gdi, rotation, persist) => windows.rotate(gdi, rotation, persist),
    });
    assert.deepEqual(session.start(wantedOrientations(emptyCabinet())).turned, []);
    session.end();
    assert.deepEqual(windows.desktop(), before, name);
    assert.equal(fs.readdirSync(dir).length, 0, `${name} : aucun fichier`);
  }
});

test('orientation : l’assistant tourne l’écran, Exit ou le délai le remet, et Quitter rend l’origine', () => {
  const [, b] = bornes()[0]!;
  const cabinet: Cabinet = { ...b.cabinet, playfield: { ...b.cabinet.playfield!, windowsRotation: undefined } };
  const session = new SessionOrientation({
    file: b.file,
    screens: () => sessionScreens(b.windows.displays(), cabinet),
    rotate: (gdi, rotation, persist) => b.windows.rotate(gdi, rotation, persist),
  });
  session.start(wantedOrientations(cabinet));
  const fp = cabinet.roles.playfield!;
  const origin = b.origin[b.playfield.gdiName]!;
  session.want(fp, b.playing);
  assert.equal(b.windows.rotation(b.playfield.gdiName), b.playing);
  assert.equal(session.origin(fp), origin, 'l’assistant enregistre l’orientation de jeu à côté de celle d’origine');
  session.want(fp, origin);
  assert.equal(b.windows.rotation(b.playfield.gdiName), origin);
  session.want(fp, b.playing);
  session.end();
  assert.deepEqual(b.windows.desktop(), b.origin);
  assert.equal(b.windows.persisted, 0);
});

test('orientation : borne configurée avant le 27/10/2026, retrouvée et réparée', () => {
  for (const [name, b] of bornes()) {
    if (b.origin[b.playfield.gdiName] !== 0) continue;
    const fp = b.cabinet.roles.playfield!;
    // L'ancien assistant : écran tourné dans le réglage de Windows, pas d'orientation de jeu dans le modèle.
    const old: Cabinet = { ...b.cabinet, playfield: { flipperEdge: b.cabinet.playfield!.flipperEdge } };
    b.windows.rotate(b.playfield.gdiName, b.playing, true);
    const now = () => b.windows.displays().find((d) => d.gdiName === b.playfield.gdiName);
    assert.deepEqual(legacyOrientation(old, now()), { playing: b.playing, origin: 0, desktopTurned: true }, name);
    // Réparée : Windows reprend 0° dans son réglage, la session garde l'orientation de jeu.
    const repaired: Cabinet = { ...old, playfield: { ...old.playfield!, windowsRotation: b.playing } };
    const session = new SessionOrientation({
      file: b.file,
      screens: () => sessionScreens(b.windows.displays(), repaired),
      rotate: (gdi, rotation, persist) => b.windows.rotate(gdi, rotation, persist),
    });
    session.start(wantedOrientations(repaired));
    const persisted = b.windows.persisted;
    session.giveBack(fp, 0);
    assert.equal(b.windows.persisted, persisted + 1, 'le réglage de Windows est rendu, une fois');
    assert.equal(b.windows.rotation(b.playfield.gdiName), b.playing, 'les tables restent dans le même sens');
    session.end();
    assert.equal(b.windows.rotation(b.playfield.gdiName), 0, `${name} : bureau droit à la sortie`);
    b.windows.reboot();
    assert.equal(b.windows.rotation(b.playfield.gdiName), 0, `${name} : et après un redémarrage`);
    assert.equal(legacyOrientation(repaired, now()), undefined, 'la question ne revient pas');
    // Windows a perdu l'orientation de jeu (redémarrage) : rien à proposer, le menu la reprend seul.
    assert.deepEqual(legacyOrientation(old, now()), { playing: b.playing, origin: 0, desktopTurned: false });
  }
  // Une borne qui n'a jamais été tournée n'est pas prise pour une ancienne.
  for (const name of FIXTURES) {
    for (const d of fixture(name)) {
      const screen = toPhysicalScreen(d);
      const cabinet: Cabinet = { ...emptyCabinet(), screens: [screen], roles: { playfield: screen.fingerprint }, playfield: { flipperEdge: 'bottom' } };
      assert.equal(legacyOrientation(cabinet, d), undefined, `${name} ${d.gdiName}`);
    }
  }
});

test('orientation : les écrans simulés de CYBERPINBALL_DISPLAYS suivent la session, et un redémarrage simulé les rend', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-orientation-'));
  const file = path.join(dir, 'ecrans-simules-orientation.json');
  const base = fixture('borne.json');
  const gdi = base[0]!.gdiName;
  rotateSimulated(file, gdi, 180, false);
  assert.equal(withSimulatedOrientations(base, readSimulatedOrientations(file))[0]!.rotation, 180);
  rotateSimulated(file, gdi, 90, true);
  const turned = withSimulatedOrientations(base, readSimulatedOrientations(file))[0]!;
  assert.equal(turned.rotation, 90);
  assert.equal(turned.bounds.width, base[0]!.bounds.height, 'au quart de tour, largeur et hauteur s’échangent');
});

// Ce qui garde l'invariant dans le code : les chemins de sortie et de relance passent par la session.

const appSource = (file: string) => fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', file), 'utf8');

test('orientation : chaque relance passe la main, et la sortie passe avant celle de la borne dédiée', () => {
  const guard = appSource('screen-guard.ts');
  const relaunch = guard.slice(guard.indexOf('export function relaunchCovered('));
  assert.ok(relaunch.indexOf('handOverOrientation()') > 0 && relaunch.indexOf('handOverOrientation()') < relaunch.indexOf('spawn('), 'relaunchCovered passe la main avant de lancer le nouveau processus');
  const dedicated = appSource('dedicated-session.ts');
  const shell = dedicated.slice(dedicated.indexOf('export function relaunchThroughShellLauncher('));
  assert.ok(shell.indexOf('handOverOrientation()') > 0 && shell.indexOf('handOverOrientation()') < shell.indexOf('app.exit('), 'la relance par Shell Launcher passe la main avant de sortir');
  const main = appSource('main.ts');
  assert.ok(main.indexOf("from './display-orientation'") < main.indexOf("import './dedicated-session'"), 'main.ts importe display-orientation avant dedicated-session (ordre des will-quit)');
  assert.match(main, /await startOrientation\(\);[\s\S]*startFrontend\(\)/, 'l’orientation de jeu est donnée avant que le menu lise les écrans');
  const orientation = appSource('display-orientation.ts');
  assert.match(orientation, /app\.on\('will-quit', endOrientation\)/);
  assert.match(orientation, /process\.on\('exit', endOrientation\)/);
  // Aucune autre sortie détournée : chaque app.exit de l'application est une relance qui a passé la main, ou une fin d'essai (process 'exit').
  const frontend = appSource('frontend.ts');
  assert.match(frontend, /orientationForDesktop\(\)/, 'le mode bureau rend l’orientation de Windows');
  assert.match(frontend, /orientationFromDesktop\(\)/, 'le retour du bureau reprend l’orientation de jeu');
  const wizard = appSource('wizard.ts');
  assert.doesNotMatch(wizard, /setDisplayOrientation/, 'l’assistant tourne l’écran par la session, jamais directement');
});

test('orientation : seul display-orientation.ts écrit le réglage de Windows, et seulement pour le rendre', () => {
  const orientation = appSource('display-orientation.ts');
  const persist = [...orientation.matchAll(/giveBack\(/g)].length;
  assert.equal(persist, 1, 'une seule réparation qui écrit le réglage de Windows : answerLegacy');
  const core = fs.readFileSync(path.join(REPO_ROOT, 'packages', 'core', 'src', 'sessionorientation.ts'), 'utf8');
  assert.equal([...core.matchAll(/rotate\([^)]*, true\)/g)].length, 1, 'giveBack est le seul appel avec persist');
});
