// Coordination des sessions qui travaillent en même temps sur Cyber Pinball (un worktree chacune).
//
// Tout vit dans le dossier git commun (.git\coordination\), que voient le dossier principal et tous
// les worktrees, et qui ne part jamais sur GitHub :
//   file.json        : une entrée par branche en route vers une fusion (suite de tests, intégration,
//                      attente du verrou…), avec sa fin prévue ; lue par la publication groupée pour
//                      attendre les fusions imminentes (scripts/publication-groupee.mjs)
//   durees.json      : durées mesurées des suites complètes, pour prévoir la fin des suivantes
//   instables.json   : tests tombés dans la suite complète puis passés seuls (scripts/avant-fusion.mjs)
//   certificats\     : dernière suite complète verte de chaque branche (scripts/fusionner.mjs)
//   suite.lock       : une seule suite complète à la fois sur la machine
//   chef-publication.lock : une seule publication groupée à la fois
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

/** Médiane des dernières durées mesurées (ms), sinon la valeur par défaut. */
export function expectedSuiteMs(durations) {
  const last = durations.slice(-10).map((d) => d.ms).filter((ms) => ms > 0).sort((a, b) => a - b);
  if (!last.length) return DUREE_SUITE_DEFAUT_MS;
  return last[Math.floor(last.length / 2)];
}

export function readDurations(dir = coordinationDir()) {
  return readJson(path.join(dir, 'durees.json'), []);
}

export function recordDuration(ms, dir = coordinationDir()) {
  const list = readDurations(dir);
  list.push({ ms, date: new Date().toISOString() });
  writeJson(path.join(dir, 'durees.json'), list.slice(-30));
}

// ---------------------------------------------------------------- certificats de suite verte

/**
 * Empreinte du travail propre de la branche : son écart à proto/ecrans, sans contexte. Elle ne change
 * pas quand proto/ecrans est intégré sans recouvrir ce travail ; elle change au moindre commit de la
 * branche. Une suite complète verte reste ainsi valable après une simple intégration.
 */
export function workFingerprint(cwd = REPO, base = BASE) {
  const diff = execFileSync('git', ['diff', '-U0', '--no-color', '--no-ext-diff', `${base}...HEAD`], { cwd, encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  return createHash('sha1').update(diff.replace(/^index [0-9a-f]+\.\.[0-9a-f]+.*$/gm, '')).digest('hex');
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

/** Tests tombés dans la suite complète puis passés seuls : comptés, pour la session qui les corrigera. */
export function recordFlaky(files, branche, dir = coordinationDir()) {
  const file = path.join(dir, 'instables.json');
  const reg = readJson(file, {});
  const now = new Date().toISOString();
  for (const f of files) {
    const e = reg[f] ?? { fois: 0 };
    e.fois++;
    e.dernier = now;
    e.branche = branche;
    reg[f] = e;
  }
  writeJson(file, reg);
  return reg;
}

export function readFlaky(dir = coordinationDir()) {
  return readJson(path.join(dir, 'instables.json'), {});
}
