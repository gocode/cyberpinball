// Contrôles express : tout ce qui ne demande ni Electron, ni Chromium, ni processus lancé, en une
// passe, et TOUS les problèmes rapportés ensemble.
//   npm run controles
//
// Compilation (liens-espaces, sorties-orphelines, tsc), traductions, audit de publication, puis tous
// les tests rapides : ceux-ci comprennent les gardes qui relisent tout le dépôt (écritures atomiques,
// copies de dossiers, lectures bornées, i18n, vocabulaire, démonstrations…), qu'un `verifier --modifies`
// ne lance pas quand le fichier fautif ne les nomme pas.
//
// Pourquoi : `avant-fusion` enchaînait `audit && build && traductions && tests` et s'arrêtait au premier
// échec. Les sessions découvraient ainsi un problème par suite complète, à 8 minutes la suite
// (21/11/2026 : .gitattributes, puis une traduction, puis fs.cpSync, puis un test instable : quatre
// suites pour quatre problèmes visibles en une minute). Lancé aussi en tête de scripts/avant-fusion.mjs
// et par scripts/fusionner.mjs. Journaux complets : tmp/controles-<étape>.txt.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coordinationDir, currentBranch, recordFlaky } from './coordination.mjs';
import { failedFiles, failureDetails, shortReport, totals } from './sortie-tests.mjs';
import { collectTests } from './verifier.mjs';

const here = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Délai d'un test (node --test-timeout) : un test figé échoue au lieu de bloquer toute la suite. */
export const TEST_TIMEOUT_MS = 5 * 60_000;

/** Fichiers de test encore en cours sous un lanceur node --test (ceux qui l'empêchent de finir). */
export function runningTestFiles(pid) {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', `Get-CimInstance Win32_Process -Filter 'ParentProcessId=${Number(pid)}' | ForEach-Object CommandLine`], { encoding: 'utf8', windowsHide: true });
  return [...(r.stdout ?? '').matchAll(/(\S+\.test\.m?js)/g)].map((m) => m[1].replace(/^"|"$/g, ''));
}

/**
 * Lance une commande, sortie complète dans un fichier ; rend { code, out, timedOut, hung }.
 * `timeoutMs` : au-delà, l'arbre de processus est arrêté (taskkill /T) ; `hung` liste les fichiers
 * de test qui tournaient encore. Le 21/11/2026, telecommande.test.js figé a tenu le verrou de suite
 * plus de dix minutes : toutes les fusions de la machine attendaient derrière.
 */
export function run(cmd, args, { cwd, log, shell = false, timeoutMs } = {}) {
  return new Promise((resolve) => {
    const child = spawn(cmd, args, { cwd, windowsHide: true, shell });
    let out = '';
    let timedOut = false;
    let hung = [];
    const timer = timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          hung = runningTestFiles(child.pid);
          out += `\n# délai dépassé (${Math.round(timeoutMs / 60_000)} min) : arrêt${hung.length ? ` ; encore en cours : ${hung.join(', ')}` : ''}\n`;
          spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
        }, timeoutMs)
      : undefined;
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (out += d));
    child.on('error', (error) => (out += `\n${error.message}`));
    child.on('close', (code) => {
      if (timer) clearTimeout(timer);
      if (log) fs.writeFileSync(log, out);
      resolve({ code: timedOut ? 1 : code ?? 1, out, timedOut, hung });
    });
  });
}

/**
 * Chaque fichier en échec relancé seul, l'un après l'autre. Passé seul : instable (noté dans le
 * registre commun, non bloquant). Tombé encore : vrai échec, avec ses cas et leurs erreurs.
 * Les instables relevés le 21/11/2026 venaient surtout de la charge (plusieurs suites en même temps)
 * et du lanceur de node lui-même (« Unable to deserialize cloned data »).
 */
export async function rerunAlone(files, { cwd, say = console.log, prefix = 'relance' }) {
  const flaky = [];
  const failures = [];
  for (const file of files) {
    const name = path.basename(file);
    say(`Relance seule : ${name}…`);
    const again = await run(process.execPath, ['--test', '--test-reporter=tap', `--test-timeout=${TEST_TIMEOUT_MS}`, file], { cwd, log: path.join(cwd, 'tmp', `${prefix}-${name}.txt`), timeoutMs: TEST_TIMEOUT_MS + 60_000 });
    if (again.code === 0) flaky.push(name);
    else failures.push({ file: name, details: again.timedOut ? [{ name: 'figé : ne finit pas, même seul', file: name }] : failureDetails(again.out) });
  }
  if (flaky.length) {
    let reg = {};
    try {
      reg = recordFlaky(flaky, currentBranch(cwd), coordinationDir(cwd));
    } catch {
      // Registre illisible : les instables restent signalés ici.
    }
    say(`Instables (tombés avec les autres, passés seuls, non bloquants) :\n${flaky.map((f) => `  - ${f}${reg[f] ? ` (${reg[f].fois} fois au total)` : ''}`).join('\n')}`);
  }
  return { flaky, failures };
}

/** Lignes utiles d'une sortie en échec : celles qui disent le problème, sans le bruit de npm. */
export function problemLines(out, max = 15) {
  const lines = out.split(/\r?\n/).map((l) => l.trimEnd()).filter((l) => l.trim() && !/^\s*>|^npm (ERR|error)|^\s*at |node:internal/.test(l));
  const useful = lines.filter((l) => /error|erreur|problème|:\d+|manque|sans traduction|écart|interdit|à ranger|introuvable/i.test(l));
  const pick = (useful.length ? useful : lines.slice(-max)).slice(0, max);
  return pick.map((l) => `  ${l.trim().slice(0, 240)}`);
}

/**
 * Tous les contrôles express. Rend { ok, problems: [{ etape, lignes }] } ; écrit les journaux dans
 * <cwd>/tmp. `tests: false` pour s'arrêter avant les tests rapides.
 */
export async function runControles({ cwd = here, tests = true, say = console.log } = {}) {
  const tmp = path.join(cwd, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });
  const node = process.execPath;
  const s = (f) => path.join(cwd, 'scripts', f);
  const tsc = path.join(cwd, 'node_modules', 'typescript', 'bin', 'tsc');
  const started = Date.now();
  // La compilation dans l'ordre de npm run build (liens des espaces, puis sorties orphelines retirées
  // de dist\, puis tsc), tout du long ; traductions et audit, qui ne font que lire, pendant ce temps.
  const problems = [];
  const compile = (async () => {
    const chain = [
      ['liens-espaces', [s('liens-espaces.mjs')], 'controles-liens.txt'],
      ['sorties-orphelines', [s('sorties-orphelines.mjs')], 'controles-orphelines.txt'],
      ['compilation', [tsc, '-b'], 'controles-tsc.txt'],
    ];
    const results = [];
    for (const [etape, args, log] of chain) {
      const r = await run(node, args, { cwd, log: path.join(tmp, log) });
      results.push([etape, r]);
      if (r.code !== 0 && etape !== 'compilation') {
        results.push(['compilation', { code: 1, out: `non lancée : ${etape} a échoué` }]);
        break;
      }
    }
    return results;
  })();
  const readers = [
    ['traductions', run(node, [s('traductions.mjs')], { cwd, log: path.join(tmp, 'controles-traductions.txt') })],
    ['audit de publication', run(node, [s('audit-publication.mjs')], { cwd, log: path.join(tmp, 'controles-audit.txt') })],
  ];
  for (const [etape, { code, out }] of await compile) if (code !== 0) problems.push({ etape, lignes: problemLines(out) });
  for (const [etape, promise] of readers) {
    const { code, out } = await promise;
    if (code !== 0) problems.push({ etape, lignes: problemLines(out) });
  }
  const compiled = !problems.some((p) => p.etape === 'compilation');
  if (tests && compiled) {
    const fast = collectTests(cwd).filter((t) => !t.slow);
    say(`Contrôles : ${fast.length} fichiers de tests rapides…`);
    const { code, out, hung } = await run(node, ['--test', '--test-reporter=tap', `--test-timeout=${TEST_TIMEOUT_MS}`, ...fast.map((t) => path.relative(cwd, t.file))], { cwd, log: path.join(tmp, 'controles-tests.txt'), timeoutMs: 20 * 60_000 });
    if (code !== 0) {
      const files = [...new Set([...failedFiles(out), ...hung])];
      if (!files.length) {
        problems.push({ etape: 'tests rapides', lignes: ['  échec sans fichier identifiable : voir tmp/controles-tests.txt'] });
      } else {
        const { failures } = await rerunAlone(files, { cwd, say, prefix: 'controles-relance' });
        if (failures.length) {
          problems.push({ etape: `tests rapides (${failures.length} fichier(s))`, lignes: failures.flatMap((f) => (f.details.length ? shortReport(f.details, 6) : `  - ${f.file}`).split('\n')) });
        } else {
          say(`Contrôles : tests rapides passés (${files.length} instable(s) repassé(s) seul(s)).`);
        }
      }
    } else {
      const t = totals(out);
      say(`Contrôles : ${t.pass ?? '?'} tests rapides passés.`);
    }
  } else if (tests) {
    problems.push({ etape: 'tests rapides', lignes: ['  non lancés : la compilation a échoué'] });
  }
  const seconds = Math.round((Date.now() - started) / 1000);
  return { ok: problems.length === 0, problems, seconds };
}

export function printControles(result, say = console.log) {
  if (result.ok) {
    say(`Contrôles express : tout passe (${result.seconds} s).`);
    return;
  }
  say(`Contrôles express : ${result.problems.length} étape(s) en échec (${result.seconds} s). Tout est listé ici ; journaux complets dans tmp/controles-*.txt.`);
  for (const p of result.problems) {
    say(`\n[${p.etape}]`);
    say(p.lignes.join('\n'));
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const result = await runControles({ tests: !process.argv.includes('--sans-tests') });
  printControles(result);
  process.exit(result.ok ? 0 : 1);
}
