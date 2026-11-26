// Démarrage sans blocage : aucun appel qui attend un autre programme (spawnSync, execSync, execFileSync,
// Atomics.wait) entre le lancement et les premières fenêtres. PinCab, 26/11/2026 : la sonde 3D Vision,
// synchrone, figeait le processus principal 5 s avant ready ; une minuterie du réseau en est partie avant
// ready. Trois gardes : la sonde du lancement attendue sans bloquer, le chronomètre qui note au journal tout
// appel de ce genre fait avant la première fenêtre (app/src/startup-blocking.ts, chargé compilé), et la
// liste des appels synchrones de app/src, chacun avec la raison qui le tient hors du démarrage.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';

const APP_SRC = path.join(REPO_ROOT, 'app', 'src');
const read = (file: string) => fs.readFileSync(path.join(APP_SRC, file), 'utf8');

/** Le corps d'une fonction de premier niveau, jusqu'à l'accolade fermante en début de ligne. */
function body(source: string, signature: string): string {
  const start = source.indexOf(signature);
  assert.ok(start >= 0, `${signature} introuvable`);
  const end = source.indexOf('\n}', start);
  return source.slice(start, end);
}

test('la sonde 3D Vision du lancement ne bloque pas : lancée avant ready, attendue avant la première fenêtre', () => {
  const sonde = body(read('nvidia-3dvision.ts'), 'export async function stereoOffAtStart(');
  assert.doesNotMatch(sonde, /Sync\(|Atomics\.wait/, 'aucune sonde synchrone ni attente bloquante au lancement');
  const main = read('main.ts');
  const ready = main.indexOf('app.whenReady()');
  const launched = main.indexOf('stereoOffAtStart()');
  assert.ok(launched > 0 && launched < ready, 'lancée avant ready, pendant qu’Electron démarre');
  const awaited = main.indexOf('await stereoOff;');
  assert.ok(awaited > ready, 'attendue une fois Electron prêt');
  // Aucune fenêtre avant : la sonde est attendue avant chacune des premières ouvertures.
  for (const first of ['otherFrontendsGate()', 'guardScreens()', 'startOrientation()', 'startSettingsAlone(', 'startWizard()', 'startFrontend()']) {
    const at = main.indexOf(first, ready);
    assert.ok(at > awaited, `${first} après la sonde`);
  }
});

test('main.ts : le chronomètre des appels bloquants est posé en tête, arrêté à la première fenêtre', () => {
  const main = read('main.ts');
  // Les trois gardes d'écriture d'abord (elles ne lancent aucun programme), puis le chronomètre.
  const imports = [...main.matchAll(/^import [^\n]*?'([^']+)';$/gm)].map((m) => m[1]);
  assert.deepEqual(imports.slice(0, 4), ['./sandbox-guard', './sandbox-profile', './hardlink-guard', './startup-blocking'], 'avant les modules qui agissent dès leur chargement');
  assert.match(main, /app\.once\('browser-window-created', \(\) => stopStartupBlockingWatch\(\)\)/);
});

test('le chronomètre relève chaque appel bloquant, puis rend les fonctions d’origine', () => {
  // Chargé dans ce processus de test : il chronomètre son node:child_process jusqu'à l'arrêt.
  const cp = require('node:child_process') as typeof import('node:child_process');
  const original = { spawnSync: cp.spawnSync, execSync: cp.execSync, execFileSync: cp.execFileSync };
  const { stopStartupBlockingWatch } = require(path.join(REPO_ROOT, 'app', 'dist', 'startup-blocking.js')) as {
    stopStartupBlockingWatch(report?: (line: string) => void): { fn: string; command: string; ms: number }[];
  };
  assert.notEqual(cp.spawnSync, original.spawnSync, 'posé dès le chargement');
  const out = cp.spawnSync(process.execPath, ['-e', 'setTimeout(() => {}, 150)'], { windowsHide: true });
  assert.equal(out.status, 0, 'l’appel lui-même est inchangé');
  const lines: string[] = [];
  const calls = stopStartupBlockingWatch((line) => lines.push(line));
  assert.equal(calls.length, 1);
  assert.equal(calls[0]!.fn, 'spawnSync');
  assert.ok(calls[0]!.ms >= 100, `durée relevée (${calls[0]!.ms} ms)`);
  assert.match(lines[0]!, /^Démarrage : spawnSync\(.+\) a bloqué le processus principal \d+ ms avant les premières fenêtres/);
  assert.equal(cp.spawnSync, original.spawnSync, 'rendue à l’arrêt');
  assert.equal(cp.execSync, original.execSync);
  assert.equal(cp.execFileSync, original.execFileSync);
  assert.deepEqual(stopStartupBlockingWatch(), [], 'un second arrêt ne relève plus rien');
});

/**
 * Chaque appel synchrone à un autre programme dans app/src, et pourquoi il n'est jamais sur le chemin du
 * démarrage. Un nouvel appel fait échouer ce test : s'il peut tourner avant les premières fenêtres ou
 * pendant la navigation, le rendre asynchrone (spawn) ; sinon l'ajouter ici avec sa raison.
 */
const SYNC_CALLS: Record<string, { count: number; why: string }> = {
  'firewall-rule.ts': { count: 1, why: 'arrête l’arbre d’une commande du pare-feu restée bloquée, à la demande' },
  'futurepinball-registry.ts': { count: 1, why: 'installation de Future Pinball, à la demande' },
  'installation-hints.ts': { count: 1, why: 'recherche d’une autre installation de tables, à la demande' },
  'maj-legere.ts': { count: 2, why: 'script de mise à jour légère, processus à part sans fenêtre' },
  'nvidia-3dvision.ts': { count: 1, why: 'écran Lunettes 3D ouvert ou « Vérifier à nouveau » (readDriver), jamais au lancement' },
  'offscreen.ts': { count: 1, why: 'essais hors écran : relais arrêté après délai, processus sans fenêtre' },
  'origin-framing.ts': { count: 1, why: 'cadrage d’origine d’une table, au lancement d’une partie' },
  'start-relaunch-process.ts': { count: 1, why: 'veilleur de la relance par Start, et 15 s après l’ouverture du front-end' },
};

test('app/src : chaque appel synchrone à un autre programme est connu et tenu hors du démarrage', () => {
  const found: Record<string, number> = {};
  for (const file of fs.readdirSync(APP_SRC).filter((f) => f.endsWith('.ts'))) {
    const n = (read(file).match(/Atomics\.wait\(|\b(?:spawnSync|execSync|execFileSync)\(/g) ?? []).length;
    if (n) found[file] = n;
  }
  const expected = Object.fromEntries(Object.entries(SYNC_CALLS).map(([file, { count }]) => [file, count]));
  assert.deepEqual(
    found,
    expected,
    'appels synchrones changés : un appel possible avant les premières fenêtres ou pendant la navigation se rend asynchrone (spawn) ; sinon, mettre SYNC_CALLS à jour avec sa raison',
  );
});
