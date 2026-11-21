// Vérification complète d'une branche avant sa fusion dans proto/ecrans.
//   npm run avant-fusion
//
// 1. Contrôles express (scripts/controles.mjs) : compilation, traductions, audit de publication et
//    tous les tests rapides, tous les problèmes ensemble. En cas d'échec, arrêt ici (une à deux
//    minutes au lieu d'une suite complète).
// 2. Tests lents (Electron, Chromium, processus), une seule suite à la fois sur la machine : la
//    suivante attend son tour (verrou suite.lock du dossier de coordination). Trois suites en même
//    temps duraient jusqu'à 17 minutes et faisaient tomber les tests qui attendent un délai.
// 3. Chaque fichier en échec est relancé seul, une fois. Passé seul : « instable », noté dans
//    .git/coordination/instables.json, et il ne bloque pas. Tombé encore : vrai échec.
// 4. Suite verte : certificat de la branche (empreinte de son travail), que scripts/fusionner.mjs
//    reconnaît pour ne pas refaire la suite après une simple intégration de proto/ecrans.
//
// Pendant tout ce temps la branche est annoncée dans la file (scripts/coordination.mjs), avec sa fin
// prévue : la publication groupée attend une fusion imminente au lieu de publier sans elle.
// Journal complet des tests lents : tmp/avant-fusion.txt.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APRES_TESTS_MS, DUREE_FUSION_MS, REPO, BASE, announce, coordinationDir, currentBranch, expectedSuiteMs, git, lockHolder,
  readDurations, readFlaky, recordDuration, sleep, tryLock, withdraw, workFingerprint, writeCertificate,
} from './coordination.mjs';
import { TEST_TIMEOUT_MS, printControles, rerunAlone, run, runControles } from './controles.mjs';
import { failedFiles, shortReport, totals } from './sortie-tests.mjs';
import { collectTests } from './verifier.mjs';

const hhmm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const iso = (ms) => new Date(ms).toISOString();

/** Electron téléchargé ? (Premier lancement d'un worktree neuf : les tests Electron tombaient en 5 s.) */
async function ensureElectron(cwd, say) {
  const exe = path.join(cwd, 'node_modules', 'electron', 'dist', 'electron.exe');
  if (fs.existsSync(exe)) return;
  say('Electron pas encore téléchargé dans ce worktree : installation…');
  await run(process.execPath, [path.join(cwd, 'node_modules', 'electron', 'install.js')], { cwd });
}

/**
 * La vérification complète. Rend { ok, flaky: [...], failures: [...] }.
 * `fusion: true` quand fusionner.mjs l'appelle : la fin prévue annoncée inclut alors la fusion.
 */
export async function runAvantFusion({ cwd = REPO, say = console.log } = {}) {
  const dir = coordinationDir(cwd);
  const branche = currentBranch(cwd);
  const expected = expectedSuiteMs(readDurations(dir));
  const tmp = path.join(cwd, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  say(`Avant-fusion de ${branche}.`);
  // Une vérification complète à la fois sur la machine, contrôles express compris : trois suites
  // menées ensemble mettaient le processeur à 100 % et chacune durait trois fois plus (21/11/2026).
  const lockFile = path.join(dir, 'suite.lock');
  let release;
  let told;
  while (!(release = tryLock(lockFile, { branche, finPrevue: iso(Date.now() + expected) }))) {
    const holder = lockHolder(lockFile);
    const holderEnd = holder?.finPrevue ? Date.parse(holder.finPrevue) : Date.now() + expected;
    announce({ branche, etape: 'attente-suite', finPrevue: iso(Math.max(holderEnd, Date.now()) + expected + DUREE_FUSION_MS) }, dir);
    if (holder && told !== holder.pid) {
      say(`Une autre suite tourne (${holder.branche ?? 'branche inconnue'}, fin prévue ${hhmm(holderEnd)}) : attente de son tour.`);
      told = holder.pid;
    }
    await sleep(10_000);
  }
  const started = Date.now();
  announce({ branche, etape: 'tests', finPrevue: iso(started + expected + DUREE_FUSION_MS) }, dir);
  try {
    const controles = await runControles({ cwd, say });
    printControles(controles, say);
    if (!controles.ok) {
      withdraw(branche, dir);
      return { ok: false, failures: controles.problems.map((p) => p.etape), flaky: [] };
    }
    await ensureElectron(cwd, say);
    const slow = collectTests(cwd).filter((t) => t.slow);
    say(`Tests lents : ${slow.length} fichiers…`);
    const log = path.join(tmp, 'avant-fusion.txt');
    // Un test figé échoue à TEST_TIMEOUT_MS ; un lanceur qui ne rend pas la main est arrêté au plafond.
    const first = await run(process.execPath, ['--test', '--test-reporter=tap', `--test-timeout=${TEST_TIMEOUT_MS}`, ...slow.map((t) => path.relative(cwd, t.file))], { cwd, log, timeoutMs: Math.max(3 * expected, 20 * 60_000) });
    if (first.timedOut) say(`Suite lente arrêtée au plafond${first.hung.length ? ` ; figés : ${first.hung.map((f) => path.basename(f)).join(', ')}` : ''}.`);
    else recordDuration(Date.now() - started, dir);
    const t = totals(first.out);
    let failing = first.code === 0 ? [] : [...new Set([...failedFiles(first.out), ...first.hung])];
    if (first.code !== 0 && !failing.length) failing = ['(sortie illisible : voir tmp/avant-fusion.txt)'];
    const unreadable = failing.filter((f) => !f.endsWith('js'));
    const { flaky, failures } = await rerunAlone(failing.filter((f) => f.endsWith('js')), { cwd, say, prefix: 'avant-fusion-relance' });
    for (const file of unreadable) failures.push({ file, details: [] });
    if (failures.length) {
      say(`\nÉchecs confirmés (tombés aussi seuls) :`);
      for (const f of failures) say(`  ${f.file}\n${shortReport(f.details, 6)}`);
      say(`\nTests lents : ${t.pass ?? '?'} passés, ${failures.length} fichier(s) en échec. Journal : tmp/avant-fusion.txt.`);
      withdraw(branche, dir);
      return { ok: false, failures: failures.map((f) => f.file), flaky };
    }
    // Certificat seulement pour un travail entièrement commité : l'empreinte ne voit que les commits.
    if (git(['status', '--porcelain'], cwd)) say('Modifications non commitées : pas de certificat, npm run fusionner refera la suite après le commit.');
    else writeCertificate(branche, { empreinte: workFingerprint(cwd), head: git(['rev-parse', 'HEAD'], cwd), base: git(['rev-parse', BASE], cwd) }, dir);
    announce({ branche, etape: 'testee', finPrevue: iso(Date.now() + APRES_TESTS_MS) }, dir);
    say(`\nAvant-fusion : vert (${Math.round((Date.now() - started) / 60_000)} min, ${t.pass ?? '?'} passés${flaky.length ? `, ${flaky.length} instable(s)` : ''}). Suite suivante : npm run fusionner.`);
    return { ok: true, failures: [], flaky };
  } finally {
    release();
  }
}

/** Les instables les plus fréquents, pour qui voudra les corriger. */
export function flakySummary(dir = coordinationDir(), max = 10) {
  return Object.entries(readFlaky(dir)).sort((a, b) => b[1].fois - a[1].fois).slice(0, max).map(([f, e]) => `${String(e.fois).padStart(3)}  ${f}`);
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  if (process.argv.includes('--instables')) {
    console.log(flakySummary().join('\n') || 'Aucun test instable noté.');
    process.exit(0);
  }
  const result = await runAvantFusion();
  process.exit(result.ok ? 0 : 1);
}
