// Coordination des sessions qui travaillent en même temps sur Cyber Pinball (un worktree chacune).
//
// Tout vit dans le dossier git commun (.git\coordination\), que voient le dossier principal et tous
// les worktrees, et qui ne part jamais sur GitHub :
//   file.json        : une entrée par branche en route vers une fusion (suite de tests, intégration,
//                      attente du verrou…), avec sa fin prévue ; lue par la publication groupée pour
//                      attendre les fusions imminentes (scripts/publication-groupee.mjs)
//   durees.json      : durées mesurées des suites complètes (train), pour prévoir la fin des suivantes
//   durees-branche.json : durées des vérifications de branche (contrôles et tests lents touchés)
//   instables.json   : tests tombés dans une suite puis passés seuls (scripts/avant-fusion.mjs)
//   certificats\     : dernière vérification verte de chaque branche (scripts/fusionner.mjs)
//   suite-<n>.lock   : places des vérifications (trois à la fois par défaut, avant-fusion.mjs)
//   chef-publication.lock : le train de fusion (un seul à la fois, scripts/publication-groupee.mjs)
//   a-fusionner.json : branches vérifiées que le train doit fusionner (commit exact vérifié)
//   fusions.json     : fusions faites par le train, pour désigner les suspectes d'une suite rouge
//   train-etat.json  : dernier résultat de la suite complète sur proto/ecrans (vert ou rouge)
//   train.txt        : journal du train (il tourne détaché des sessions)
//
// Pourquoi (relevé du 21/11/2026, 30 sessions, 3 jours) : 69 suites complètes, 58 en échec, souvent
// parce que trois sessions la lançaient en même temps (5 à 17 min la suite, délais dépassés) ; et
// 63 préversions, une par fusion, chacune déplaçant proto/ecrans sous les sessions en cours.

import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BASE = 'proto/ecrans';
/** Une fusion prévue dans ce délai est attendue par la publication groupée. */
export const IMMINENT_MS = 10 * 60_000;
/** Durée d'une suite complète tant qu'aucune n'a été mesurée. */
export const DUREE_SUITE_DEFAUT_MS = 8 * 60_000;
/** Après une suite verte, la session a ce délai pour lancer la fusion ; au-delà, elle n'est plus attendue. */
export const APRES_TESTS_MS = 5 * 60_000;
/** Durée prévue de l'intégration (proto/ecrans, contrôles, tests touchés, fusion). */
export const DUREE_FUSION_MS = 4 * 60_000;

export function git(args, cwd = REPO) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim();
}

/** Le dossier de coordination, dans le dossier git commun. */
export function coordinationDir(cwd = REPO) {
  const common = path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd));
  const dir = path.join(common, 'coordination');
  fs.mkdirSync(path.join(dir, 'certificats'), { recursive: true });
  return dir;
}

/** Le dossier principal (celui qui reste sur proto/ecrans) : le parent du dossier git commun. */
export function mainDir(cwd = REPO) {
  return path.dirname(path.resolve(cwd, git(['rev-parse', '--git-common-dir'], cwd)));
}

export function currentBranch(cwd = REPO) {
  return git(['branch', '--show-current'], cwd);
}

export function alive(pid) {
  if (!pid) return false;
  try {
    process.kill(pid, 0);
    return true;
  } catch (error) {
    return error.code === 'EPERM';
  }
}

export function readJson(file, fallback) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'));
  } catch {
    return fallback;
  }
}

/** Écriture par fichier temporaire puis renommage : un lecteur ne voit jamais un fichier à moitié écrit. */
export function writeJson(file, value) {
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 1));
  for (let i = 0; ; i++) {
    try {
      fs.renameSync(tmp, file);
      return;
    } catch (error) {
      if (i >= 20 || !['EPERM', 'EBUSY', 'EACCES'].includes(error.code)) throw error;
      Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
}

/**
 * Verrou par fichier (création exclusive). Un verrou dont le processus a disparu est repris.
 * Rend la fonction qui le libère, ou undefined s'il est tenu par un autre processus vivant.
 */
export function tryLock(file, info = {}) {
  for (let attempt = 0; attempt < 2; attempt++) {
    try {
      fs.writeFileSync(file, JSON.stringify({ pid: process.pid, since: new Date().toISOString(), ...info }), { flag: 'wx' });
      const release = () => {
        if (readJson(file)?.pid === process.pid) fs.rmSync(file, { force: true });
      };
      process.once('exit', release);
      return release;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      const held = readJson(file);
      if (held && alive(held.pid)) return undefined;
      fs.rmSync(file, { force: true });
    }
  }
  return undefined;
}

export function lockHolder(file) {
  const held = readJson(file);
  return held && alive(held.pid) ? held : undefined;
}

export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// ---------------------------------------------------------------- file des branches en route

/**
 * Une entrée compte tant que son processus vit, ou, une fois la suite verte (étape « testee »),
 * jusqu'à sa fin prévue : la session lit le résultat puis lance la fusion.
 */
export function liveEntries(entries, now = Date.now(), isAlive = alive) {
  return entries.filter((e) => (e.etape === 'testee' ? now <= Date.parse(e.finPrevue) : isAlive(e.pid)));
}

/** Les entrées (autres que `except`) dont la fusion est prévue avant `now + horizon`. */
export function imminent(entries, { now = Date.now(), horizon = IMMINENT_MS, except } = {}) {
  return entries.filter((e) => e.branche !== except && e.etape !== 'fusionnee' && Date.parse(e.finPrevue) <= now + horizon);
}

function queueFile(dir) {
  return path.join(dir, 'file.json');
}

export function readQueue(dir = coordinationDir()) {
  const all = readJson(queueFile(dir), []);
  const kept = liveEntries(Array.isArray(all) ? all : []);
  return kept;
}

/** Pose ou met à jour l'entrée de la branche (une par branche). */
export function announce(entry, dir = coordinationDir()) {
  const queue = readQueue(dir).filter((e) => e.branche !== entry.branche);
  const full = { pid: process.pid, maj: new Date().toISOString(), ...entry };
  queue.push(full);
  writeJson(queueFile(dir), queue);
  return full;
}

export function withdraw(branche, dir = coordinationDir()) {
  writeJson(queueFile(dir), readQueue(dir).filter((e) => e.branche !== branche));
}

// ---------------------------------------------------------------- durées des suites complètes

/** Part d'une suite complète que prend une suite sans tests rapides, tant qu'aucune n'a été mesurée. */
export const PART_SANS_TESTS_RAPIDES = 0.45;
/** Durée prévue d'une publication (fabrication et envoi) tant qu'aucune n'a été mesurée. */
export const DUREE_PUBLICATION_DEFAUT_MS = 10 * 60_000;

const median = (values) => {
  const sorted = values.filter((v) => v > 0).sort((a, b) => a - b);
  return sorted.length ? sorted[Math.floor(sorted.length / 2)] : undefined;
};

/**
 * Médiane des dernières durées de suite mesurées (ms), sinon la valeur par défaut.
 * `chemin` : la suite sans tests rapides du train (arbre déjà certifié) a ses propres mesures ; sans
 * mesure, une part de la suite complète. Les mesures de publication (`type`) sont ignorées ici.
 */
export function expectedSuiteMs(durations, fallback = DUREE_SUITE_DEFAUT_MS, { chemin } = {}) {
  const suites = durations.filter((d) => !d.type && (d.chemin ?? undefined) === (chemin ?? undefined));
  const found = median(suites.slice(-10).map((d) => d.ms));
  if (found) return found;
  return chemin ? Math.round(PART_SANS_TESTS_RAPIDES * expectedSuiteMs(durations, fallback)) : fallback;
}

/**
 * Durées prévues d'une publication, d'après les dernières mesurées (scripts/publication-groupee.mjs) :
 * `libereMs` jusqu'à la libération du dossier principal, `totalMs` jusqu'à la préversion en ligne.
 */
export function expectedPublicationMs(durations) {
  const last = durations.filter((d) => d.type === 'publication').slice(-10);
  const totalMs = median(last.map((d) => d.totalMs)) ?? DUREE_PUBLICATION_DEFAUT_MS;
  return { totalMs, libereMs: Math.min(totalMs, median(last.map((d) => d.libereMs)) ?? totalMs) };
}

/** `name` : durees.json (suites complètes, celles du train) ou durees-branche.json (vérifications de branche). */
export function readDurations(dir = coordinationDir(), name = 'durees.json') {
  return readJson(path.join(dir, name), []);
}

/** Les 30 dernières mesures de chaque sorte (suite complète, suite sans tests rapides, publication). */
function keepRecent(list, per = 30) {
  const kind = (d) => d.type ?? d.chemin ?? 'suite';
  const counts = new Map();
  const kept = [];
  for (let i = list.length - 1; i >= 0; i--) {
    const k = kind(list[i]);
    const n = counts.get(k) ?? 0;
    if (n >= per) continue;
    counts.set(k, n + 1);
    kept.unshift(list[i]);
  }
  return kept;
}

/** `extra` : précisions rangées avec la mesure (chemin de la suite…). */
export function recordDuration(ms, dir = coordinationDir(), name = 'durees.json', extra = {}) {
  const list = readDurations(dir, name);
  list.push({ ms, ...extra, date: new Date().toISOString() });
  writeJson(path.join(dir, name), keepRecent(list));
}

/**
 * Mesure d'une publication : durée totale, durée jusqu'à la libération du dossier principal, et celle
 * de chaque étape. Sans champ `ms` : les lecteurs des suites (même anciens) ne la comptent pas.
 */
export function recordPublication(entry, dir = coordinationDir(), name = 'durees.json') {
  const list = readDurations(dir, name);
  list.push({ type: 'publication', ...entry, date: new Date().toISOString() });
  writeJson(path.join(dir, name), keepRecent(list));
}

// ---------------------------------------------------------------- dossier principal

/**
 * Ce qui empêche d'écrire dans le dossier principal maintenant (texte), ou undefined : fabrication
 * en cours, fusion à moitié faite, autre branche, modifications non commitées.
 */
export function mainBusy(main) {
  const fabrication = lockHolder(path.join(main, 'release', '.fabrication.lock'));
  if (fabrication) return `publication en cours de fabrication (processus ${fabrication.pid})`;
  if (fs.existsSync(path.join(main, '.git', 'MERGE_HEAD'))) return 'une fusion à moitié faite dans le dossier principal (MERGE_HEAD)';
  if (currentBranch(main) !== BASE) return `le dossier principal n'est pas sur ${BASE}`;
  if (git(['status', '--porcelain', '--untracked-files=no'], main)) return 'des modifications non commitées dans le dossier principal';
  return undefined;
}

// ---------------------------------------------------------------- certificats de suite verte

/**
 * Empreinte du travail propre de la branche : son écart à proto/ecrans, sans contexte. Elle ne change
 * pas quand proto/ecrans est intégré sans recouvrir ce travail ; elle change au moindre commit de la
 * branche. Une suite complète verte reste ainsi valable après une simple intégration.
 */
export function workFingerprint(cwd = REPO, base = BASE) {
  return fingerprintOfDiff(execFileSync('git', ['diff', '-U0', '--no-color', '--no-ext-diff', `${base}...HEAD`], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 }));
}

/**
 * Empreinte d'un diff -U0 : son contenu seul. Les lignes « index » (identifiants d'objets) et les
 * en-têtes de bloc « @@ -12,3 +14,4 @@ fonction » sont réduits à « @@ » : leurs numéros et la
 * fonction citée bougent dès que proto/ecrans ajoute des lignes plus haut dans le même fichier, sans
 * que le travail de la branche change (23/11/2026 : un simple décalage invalidait le certificat et
 * relançait toute la vérification).
 */
export function fingerprintOfDiff(diff) {
  const content = diff.replace(/^index [0-9a-f]+\.\.[0-9a-f]+.*$/gm, '').replace(/^@@ -\d+(?:,\d+)? \+\d+(?:,\d+)? @@.*$/gm, '@@');
  return createHash('sha1').update(content).digest('hex');
}

export function certificateFile(branche, dir = coordinationDir()) {
  return path.join(dir, 'certificats', `${branche.replace(/[^\w.-]+/g, '_')}.json`);
}

export function writeCertificate(branche, data, dir = coordinationDir()) {
  writeJson(certificateFile(branche, dir), { ...data, date: new Date().toISOString() });
}

export function readCertificate(branche, dir = coordinationDir()) {
  return readJson(certificateFile(branche, dir), undefined);
}

// ---------------------------------------------------------------- tests instables

/** Jours de chutes gardés par test (dates) : de quoi dire lesquels tombent en ce moment. */
const FLAKY_KEEP_MS = 30 * 24 * 3600_000;

/**
 * Tests tombés dans la suite complète puis passés seuls : comptés, pour la session qui les corrigera, avec la date
 * de chaque chute (les 30 derniers jours) pour recentFlaky.
 */
export function recordFlaky(files, branche, dir = coordinationDir(), nowMs = Date.now()) {
  const file = path.join(dir, 'instables.json');
  const reg = readJson(file, {});
  const now = new Date(nowMs).toISOString();
  for (const f of files) {
    const e = reg[f] ?? { fois: 0 };
    e.fois++;
    e.dernier = now;
    e.branche = branche;
    e.dates = [...(e.dates ?? []).filter((d) => nowMs - Date.parse(d) < FLAKY_KEEP_MS), now];
    reg[f] = e;
  }
  writeJson(file, reg);
  return reg;
}

export function readFlaky(dir = coordinationDir()) {
  return readJson(path.join(dir, 'instables.json'), {});
}

/**
 * Les tests qui tombent le plus en ce moment : chutes des `days` derniers jours, les plus nombreuses d'abord. Une
 * entrée d'avant les dates (25/11/2026) compte pour sa dernière chute seulement.
 */
export function recentFlaky(dir = coordinationDir(), { days = 7, max = 3, nowMs = Date.now() } = {}) {
  const since = nowMs - days * 24 * 3600_000;
  return Object.entries(readFlaky(dir))
    .map(([test, e]) => ({ test, fois: (e.dates ?? (e.dernier ? [e.dernier] : [])).filter((d) => Date.parse(d) >= since).length, dernier: e.dernier }))
    .filter((e) => e.fois > 0)
    .sort((a, b) => b.fois - a.fois || Date.parse(b.dernier) - Date.parse(a.dernier))
    .slice(0, max);
}
