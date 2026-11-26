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
import { TEST_TIMEOUT_MS, printControles, rerunAlone, runControles, runSerie } from './controles.mjs';
import { GENRES, avertissementsLents, lireDurees } from './durees-tests.mjs';
import { shortReport, totals } from './sortie-tests.mjs';
import { changedFiles, collectTests, touchedTests } from './verifier.mjs';
import { ensureElectron } from './tests-node.mjs';

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
  if (complete) return slow;
  // Les gardes du dépôt (// garde-depot, scripts/verifier.mjs) passent à chaque branche : touchées ou non.
  const touched = new Set(touchedTests(changed, slow, all).map((t) => t.name));
  return slow.filter((t) => t.garde || touched.has(t.name));
}

/** Chemin d'une suite du train dont l'arbre est déjà certifié vert par une branche (scripts/publication-groupee.mjs). */
export const SANS_TESTS_RAPIDES = 'sans-tests-rapides';

/**
 * La vérification. Rend { ok, flaky: [...], failures: [...], problems?: [...] }.
 * `complete` : tous les tests lents (le train, ou avant une version finale) ; sinon ceux de la branche.
 * `train` : lancée par le train sur proto/ecrans : ni annonce dans la file, ni certificat.
 * `testsRapides: false` : contrôles express sans les tests rapides (compilation, traductions, audit
 * gardés), pour un arbre qu'une branche a déjà passé aux contrôles express complets (le train).
 */
export async function runAvantFusion({ cwd = REPO, say = console.log, complete = false, train = false, testsRapides = true } = {}) {
  const dir = coordinationDir(cwd);
  const branche = currentBranch(cwd);
  const durations = complete ? 'durees.json' : 'durees-branche.json';
  // Durées rangées par chemin : une suite sans tests rapides dure moitié moins (estimation à part).
  const chemin = testsRapides ? undefined : { chemin: SANS_TESTS_RAPIDES };
  const expected = expectedSuiteMs(readDurations(dir, durations), complete ? undefined : DUREE_BRANCHE_DEFAUT_MS, chemin);
  const note = (entry) => {
    if (!train) announce({ branche, ...entry }, dir);
  };
  const leave = () => {
    if (!train) withdraw(branche, dir);
  };
  const tmp = path.join(cwd, 'tmp');
  fs.mkdirSync(tmp, { recursive: true });

  say(complete ? `Suite complète de ${branche}${testsRapides ? '' : ' sans tests rapides (compilation, traductions, audit, puis tous les tests lents)'}.` : `Vérification de la branche ${branche} : contrôles express, puis les tests lents qu'elle touche.`);
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
  // Le travail vérifié est fixé ICI, avant tout contrôle : le certificat porte sur ce commit et cette empreinte, jamais
  // sur ce que HEAD est devenu à la fin. Un commit ou une intégration de proto/ecrans faits pendant les tests étaient
  // sinon certifiés sans avoir été vus (audit et tests lus sur l'arbre d'avant), et le train sautait ensuite les tests
  // rapides sur cette foi (26/11/2026).
  const verifie = train ? undefined : etatVerifie(cwd);
  note({ etape: 'tests', finPrevue: iso(started + expected + DUREE_FUSION_MS) });
  try {
    const controles = await runControles({ cwd, say, tests: testsRapides });
    printControles(controles, say);
    if (!controles.ok) {
      leave();
      // Fichiers en échec nommés (tests rapides), sinon l'étape : le train en cherche la branche en cause.
      const illisible = controles.problems.every((p) => p.illisible);
      return { ok: false, failures: controles.problems.flatMap((p) => (p.fichiers?.length ? p.fichiers : [p.etape])), flaky: [], problems: controles.problems, illisible };
    }
    const chosen = slowTestsFor(collectTests(cwd), { complete, changed: complete ? [] : changedFiles(cwd, BASE) });
    let t = {};
    let failing = [];
    let illisible;
    if (!chosen.length) {
      say('Aucun test lent ne touche cette branche : le train passera la suite complète sur proto/ecrans avant la préversion.');
      recordDuration(Date.now() - started, dir, durations, chemin);
    } else {
      ensureElectron(cwd, say);
      say(`Tests lents : ${chosen.length} fichier(s)${complete ? '' : ` touché(s) par la branche ou gardes du dépôt (${chosen.map((c) => c.name.replace(/\.test\.m?js$/, '')).join(', ')})`}…`);
      const log = path.join(tmp, 'avant-fusion.txt');
      // Un test figé échoue à TEST_TIMEOUT_MS ; un lanceur qui ne rend pas la main est arrêté au plafond. Sortie
      // illisible : la série est refaite une fois (controles.mjs, runSerie), jamais un blâme sans fichier.
      const first = await runSerie({ cwd, files: chosen.map((c) => c.file), log, genre: 'lents', timeoutMs: Math.max(3 * expected, 20 * 60_000), say });
      if (first.timedOut) say(`Tests lents arrêtés au plafond${first.hung.length ? ` ; figés : ${first.hung.map((f) => path.basename(f)).join(', ')}` : ''}.`);
      else recordDuration(Date.now() - started, dir, durations, chemin);
      for (const l of avertissementsLents(lireDurees(cwd, 'lents')?.fichiers ?? {}, GENRES.lents.seuilMs, 'lents')) say(l);
      t = totals(first.out);
      failing = first.failing;
      illisible = first.illisible;
    }
    // La place est rendue avant la relance : une autre session peut lancer sa vérification.
    release();
    const { flaky, failures } = await rerunAlone(failing.filter((f) => f.endsWith('js')), { cwd, say, prefix: 'avant-fusion-relance' });
    if (illisible) failures.push({ file: '(sortie illisible)', details: [{ name: 'diagnostic', error: illisible }] });
    if (failures.length) {
      say(`\nÉchecs confirmés (tombés aussi à part) :`);
      for (const f of failures) say(`  ${f.file}\n${shortReport(f.details, 6)}`);
      say(`\nTests lents : ${t.pass ?? '?'} passés, ${failures.length} fichier(s) en échec. Journal : tmp/avant-fusion.txt.`);
      leave();
      return { ok: false, failures: failures.map((f) => f.file), flaky, details: failures, illisible: Boolean(illisible) && failures.length === 1 };
    }
    if (!train) {
      // Certificat seulement pour un travail entièrement commité, resté le même du début à la fin : l'empreinte ne
      // voit que les commits.
      const fin = etatVerifie(cwd);
      if (!verifie.propre) say('Modifications non commitées : pas de certificat, npm run fusionner refera la vérification après le commit.');
      else if (fin.head !== verifie.head || !fin.propre) say(`Le travail a changé pendant la vérification (${verifie.head.slice(0, 8)} -> ${fin.head.slice(0, 8)}) : pas de certificat, npm run fusionner refera la vérification.`);
      else writeCertificate(branche, { empreinte: verifie.empreinte, head: verifie.head, base: verifie.base, niveau: complete ? 'complete' : 'branche' }, dir);
      note({ etape: 'testee', finPrevue: iso(Date.now() + APRES_TESTS_MS) });
    }
    say(`\n${complete ? 'Suite complète' : 'Vérification de branche'} : vert (${Math.round((Date.now() - started) / 60_000)} min, ${t.pass ?? 0} tests lents passés${flaky.length ? `, ${flaky.length} instable(s)` : ''}).${train ? '' : ' Suite : npm run fusionner.'}`);
    return { ok: true, failures: [], flaky, head: verifie?.head, certifie: Boolean(verifie?.propre) };
  } finally {
    release();
  }
}

/** Le travail d'une branche à un instant : son commit, son empreinte, la base, et s'il est entièrement commité. */
export function etatVerifie(cwd) {
  return { head: git(['rev-parse', 'HEAD'], cwd), empreinte: workFingerprint(cwd), base: git(['rev-parse', BASE], cwd), propre: !git(['status', '--porcelain'], cwd) };
}

/**
 * Parmi `failures` (fichiers de test et étapes rendus par runAvantFusion), ceux qui échouent encore dans `cwd` :
 * c'est la question que pose le train à chaque état intermédiaire de son lot pour trouver la branche en cause. Seuls les
 * échecs nommés sont rejoués (compilation, traductions et audit sans les tests, puis les fichiers de test en échec,
 * chacun deux fois s'il tombe : un fichier qui passe à la seconde fois n'accuse personne), jamais la suite.
 */
export async function recheckFailures({ cwd, failures, say = () => {} }) {
  const files = failures.filter((f) => /\.test\.m?js$/.test(f)).map((f) => path.basename(f));
  const steps = failures.filter((f) => !/\.test\.m?js$/.test(f));
  const controles = await runControles({ cwd, say: () => {}, tests: false });
  const still = controles.problems.filter((p) => steps.includes(p.etape)).map((p) => p.etape);
  // Compilation cassée dans cet état : les tests ne peuvent pas tourner, l'état est en échec.
  if (controles.problems.some((p) => ['liens-espaces', 'sorties-orphelines', 'compilation'].includes(p.etape))) return [...new Set([...still, ...controles.problems.map((p) => p.etape)])];
  let wanted = collectTests(cwd).filter((x) => files.includes(x.name));
  if (wanted.some((x) => x.slow)) ensureElectron(cwd, say);
  for (let essai = 1; essai <= 2 && wanted.length; essai++) {
    const r = await runSerie({ cwd, files: wanted.map((x) => x.file), log: path.join(cwd, 'tmp', `recherche-${essai}.txt`), genre: 'lents', timeoutMs: TEST_TIMEOUT_MS + 60_000, say });
    if (r.code === 0) return [...new Set(still)];
    const names = r.failing.length ? r.failing.map((x) => path.basename(x)) : wanted.map((x) => x.name);
    wanted = wanted.filter((x) => names.includes(x.name));
    if (essai === 2) still.push(...wanted.map((x) => x.name));
  }
  return [...new Set(still)];
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
