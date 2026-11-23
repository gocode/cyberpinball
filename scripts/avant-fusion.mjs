// Vérification d'une branche avant sa fusion dans proto/ecrans, et suite complète du train.
//   npm run avant-fusion                 -> vérification de branche (ce que fait npm run fusionner)
//   npm run avant-fusion -- --complete   -> suite complète : tous les tests lents
//
// Vérification de branche :
// 1. Contrôles express (scripts/controles.mjs) : compilation, traductions, audit de publication et
//    tous les tests rapides, tous les problèmes ensemble. En cas d'échec, arrêt ici.
// 2. Les seuls tests lents (Electron, Chromium, processus) qui importent ou citent un fichier changé
//    par la branche. La suite lente complète ne tourne plus par branche : le train de fusion la passe
//    une fois sur proto/ecrans avant chaque préversion (scripts/publication-groupee.mjs).
//    Pourquoi (23/11/2026) : avec 3 à 5 sessions, chaque branche refaisait les 61 fichiers lents, même
//    pour un titre ; la vérification passait de 6 min (seule) à 11-22 min, alors qu'une petite
//    modification ne touche que 0 à 6 de ces fichiers.
// 3. Chaque fichier en échec est relancé à part. Passé : « instable », noté dans
//    .git/coordination/instables.json, et il ne bloque pas. Tombé encore : vrai échec.
// 4. Vérification verte : certificat de la branche (empreinte de son travail), que
//    scripts/fusionner.mjs reconnaît pour ne pas tout refaire après une simple intégration.
//
// Au plus SUITES_SIMULTANEES vérifications à la fois sur la machine (verrous suite-<n>.lock).
// Journal des tests lents : tmp/avant-fusion.txt.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  APRES_TESTS_MS, DUREE_FUSION_MS, REPO, BASE, announce, coordinationDir, currentBranch, expectedSuiteMs, git, lockHolder,
  readDurations, readFlaky, recordDuration, sleep, tryLock, withdraw, workFingerprint, writeCertificate,
} from './coordination.mjs';
import { TEST_TIMEOUT_MS, printControles, rerunAlone, run, runControles } from './controles.mjs';
import { failedFiles, shortReport, totals } from './sortie-tests.mjs';
import { changedFiles, collectTests, touchedTests } from './verifier.mjs';
import { NODE_TEST_ARGS, ensureElectron } from './tests-node.mjs';

const hhmm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
const iso = (ms) => new Date(ms).toISOString();

/** Nombre de vérifications simultanées sur la machine. */
export const SUITES_SIMULTANEES = Math.max(1, Number(process.env.CYBERPINBALL_SUITES) || 3);
/** Durée prévue d'une vérification de branche tant qu'aucune n'a été mesurée. */
export const DUREE_BRANCHE_DEFAUT_MS = 4 * 60_000;

/** Les verrous des places de vérification (suite-1.lock, suite-2.lock…). */
export function suiteSlots(dir, n = SUITES_SIMULTANEES) {
  return Array.from({ length: n }, (_, i) => path.join(dir, `suite-${i + 1}.lock`));
}

/**
 * Les tests lents à passer : tous pour la suite complète, sinon ceux que la branche touche.
 * `changed` : fichiers changés par la branche (scripts/verifier.mjs, changedFiles).
 */
export function slowTestsFor(all, { complete, changed = [] }) {
  const slow = all.filter((t) => t.slow);
  return complete ? slow : touchedTests(changed, slow, all);
}

/**
 * La vérification. Rend { ok, flaky: [...], failures: [...], problems?: [...] }.
 * `complete` : tous les tests lents (le train, ou avant une version finale) ; sinon ceux de la branche.
 * `train` : lancée par le train sur proto/ecrans : ni annonce dans la file, ni certificat.
 */
export async function runAvantFusion({ cwd = REPO, say = console.log, complete = false, train = false } = {}) {
  const dir = coordinationDir(cwd);
  const branche = currentBranch(cwd);
  const durations = complete ? 'durees.json' : 'durees-branche.json';
  const expected = expectedSuiteMs(readDurations(dir, durations), complete ? undefined : DUREE_BRANCHE_DEFAUT_MS);
  const note = (entry) => {
    if (!train) announce({ branche, ...entry }, dir);
  };
  const leave = () => {
    if (!train) withdraw(branche, dir);
  };
  const tmp = path.join(cwd, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  say(complete ? `Suite complète de ${branche}.` : `Vérification de la branche ${branche} : contrôles express, puis les tests lents qu'elle touche.`);
  // Au plus SUITES_SIMULTANEES vérifications à la fois sur la machine, contrôles express compris :
  // trois ou quatre suites menées ensemble mettaient le processeur à 100 % (21/11/2026).
  const slots = suiteSlots(dir);
  let release;
  let told;
  for (;;) {
    for (const file of slots) if ((release = tryLock(file, { branche, finPrevue: iso(Date.now() + expected) }))) break;
    if (release) break;
    const holders = slots.map((f) => lockHolder(f)).filter(Boolean);
    const firstEnd = Math.min(...holders.map((h) => (h.finPrevue ? Date.parse(h.finPrevue) : Date.now() + expected)));
    note({ etape: 'attente-suite', finPrevue: iso(Math.max(firstEnd, Date.now()) + expected + DUREE_FUSION_MS) });
    const key = holders.map((h) => h.pid).join(',');
    if (told !== key) {
      say(`${holders.length} vérifications tournent déjà (${holders.map((h) => h.branche ?? '?').join(', ')}) : attente d'une place, vers ${hhmm(firstEnd)}.`);
      told = key;
    }
    await sleep(10_000);
  }
  const started = Date.now();
  note({ etape: 'tests', finPrevue: iso(started + expected + DUREE_FUSION_MS) });
  try {
    const controles = await runControles({ cwd, say });
    printControles(controles, say);
    if (!controles.ok) {
      leave();
      return { ok: false, failures: controles.problems.map((p) => p.etape), flaky: [], problems: controles.problems };
    }
    const chosen = slowTestsFor(collectTests(cwd), { complete, changed: complete ? [] : changedFiles(cwd, BASE) });
    let t = {};
    let failing = [];
    let unreadable = [];
    if (!chosen.length) {
      say('Aucun test lent ne touche cette branche : le train passera la suite complète sur proto/ecrans avant la préversion.');
      recordDuration(Date.now() - started, dir, durations);
    } else {
      ensureElectron(cwd, say);
      say(`Tests lents : ${chosen.length} fichier(s)${complete ? '' : ` touché(s) par la branche (${chosen.map((c) => c.name.replace(/\.test\.m?js$/, '')).join(', ')})`}…`);
      const log = path.join(tmp, 'avant-fusion.txt');
      // Un test figé échoue à TEST_TIMEOUT_MS ; un lanceur qui ne rend pas la main est arrêté au plafond.
      const first = await run(process.execPath, [...NODE_TEST_ARGS, '--test-reporter=tap', `--test-timeout=${TEST_TIMEOUT_MS}`, ...chosen.map((c) => path.relative(cwd, c.file))], { cwd, log, timeoutMs: Math.max(3 * expected, 20 * 60_000) });
      if (first.timedOut) say(`Tests lents arrêtés au plafond${first.hung.length ? ` ; figés : ${first.hung.map((f) => path.basename(f)).join(', ')}` : ''}.`);
      else recordDuration(Date.now() - started, dir, durations);
      t = totals(first.out);
      failing = first.code === 0 ? [] : [...new Set([...failedFiles(first.out), ...first.hung])];
      if (first.code !== 0 && !failing.length) failing = ['(sortie illisible : voir tmp/avant-fusion.txt)'];
      unreadable = failing.filter((f) => !f.endsWith('js'));
    }
    // La place est rendue avant la relance : une autre session peut lancer sa vérification.
    release();
    const { flaky, failures } = await rerunAlone(failing.filter((f) => f.endsWith('js')), { cwd, say, prefix: 'avant-fusion-relance' });
    for (const file of unreadable) failures.push({ file, details: [] });
    if (failures.length) {
      say(`\nÉchecs confirmés (tombés aussi à part) :`);
      for (const f of failures) say(`  ${f.file}\n${shortReport(f.details, 6)}`);
      say(`\nTests lents : ${t.pass ?? '?'} passés, ${failures.length} fichier(s) en échec. Journal : tmp/avant-fusion.txt.`);
      leave();
      return { ok: false, failures: failures.map((f) => f.file), flaky, details: failures };
    }
    if (!train) {
      // Certificat seulement pour un travail entièrement commité : l'empreinte ne voit que les commits.
      if (git(['status', '--porcelain'], cwd)) say('Modifications non commitées : pas de certificat, npm run fusionner refera la vérification après le commit.');
      else writeCertificate(branche, { empreinte: workFingerprint(cwd), head: git(['rev-parse', 'HEAD'], cwd), base: git(['rev-parse', BASE], cwd), niveau: complete ? 'complete' : 'branche' }, dir);
      note({ etape: 'testee', finPrevue: iso(Date.now() + APRES_TESTS_MS) });
    }
    say(`\n${complete ? 'Suite complète' : 'Vérification de branche'} : vert (${Math.round((Date.now() - started) / 60_000)} min, ${t.pass ?? 0} tests lents passés${flaky.length ? `, ${flaky.length} instable(s)` : ''}).${train ? '' : ' Suite : npm run fusionner.'}`);
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
  const result = await runAvantFusion({ complete: process.argv.includes('--complete') });
  process.exit(result.ok ? 0 : 1);
}
