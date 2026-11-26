// Le train de fusion : il fusionne les branches vérifiées dans un candidat, passe la suite complète une
// fois sur lui, avance proto/ecrans s'il est vert, puis publie la préversion d'essai. Il tourne détaché
// des sessions.
//   npm run publication-groupee          (lancé d'office, détaché, par npm run fusionner)
//   npm run publication-groupee -- --sans-publier   (fusions et suite, sans publication)
//
// Un tour du train :
// 1. Le lot : chaque branche de a-fusionner.json (le commit exact que sa session a vérifié) est
//    fusionnée dans le CANDIDAT (worktree .claude/worktrees/train-candidat, ses propres node_modules),
//    en avance rapide si possible, sinon par un commit de fusion. Conflit : la branche est marquée
//    « conflit » et sa session le lit. Pendant 2 minutes au plus, il attend d'abord les branches
//    annoncées dans la file (scripts/coordination.mjs) dont la fusion est imminente, pour les emporter
//    dans le même lot.
// 2. Suite complète sur le candidat (scripts/avant-fusion.mjs --complete) : contrôles express puis tous
//    les tests lents. proto/ecrans n'avance (avance rapide) QUE si elle est verte : il est toujours vert.
//    Arbre déjà certifié : si le candidat a exactement l'arbre d'une branche vérifiée verte
//    (certificats/, écrits par avant-fusion.mjs après tous les tests rapides), les tests rapides ne sont
//    pas repassés : compilation, traductions, audit et tous les tests lents seulement.
//    Rouge confirmé (fichier tombé aussi à part) : la branche fautive est cherchée sur les états
//    successifs du lot, en ne rejouant que les fichiers en échec (dichotomie, scripts/avant-fusion.mjs
//    recheckFailures). Elle est écartée : refus.json (branche, commit, fichiers, message), lu en tête de
//    chaque npm run fusionner et par npm run refus ; le reste du lot est refait et revérifié en entier.
//    Un échec déjà présent sur proto/ecrans sans le lot ne fait écarter personne (état « rouge »).
//    Une sortie de test illisible est refaite (ILLISIBLE_MAX fois), jamais reprochée à une branche.
// 3. Publication : `node scripts/publier.mjs --rapide --essai --liberer` ; si le socle a changé
//    (Electron, exécutable), reprise d'office avec `--leger --essai`. Elle porte toujours le commit
//    vérifié : HEAD vérifié avant le lancement, et le commit à envoyer (« Version … ») contrôlé par le
//    train avant l'envoi (le commit vérifié plus son seul numéro), sinon l'envoi est refusé.
// 4. Envoi en parallèle : une fois la préversion fabriquée et son flux signé, publier.mjs rend le
//    dossier principal (--liberer) et envoie sur GitHub depuis une copie des fichiers. Le train
//    reprend aussitôt : il fusionne les branches arrivées et lance la vérification du lot suivant
//    pendant l'envoi. Les publications restent en série : la suivante attend la fin de l'envoi.
// Puis un nouveau tour pour les fusions arrivées entre-temps ; rien de neuf : le train s'arrête.
//
// Pendant la suite et la fabrication, le dossier principal ne bouge pas : les branches qui arrivent
// attendent dans a-fusionner.json, leur session n'attend pas (elle s'arrête à « en file »).
//
// Journal (train.txt) : chaque étape de publication est horodatée ([hh:mm:ss] > …) ; sa durée est
// notée dans durees.json (type « publication »), d'où l'heure de fin prévue des tours suivants.
//
// Pourquoi (23/11/2026, 3 à 5 sessions en même temps) : chaque branche refaisait toute la suite lente
// (11 à 22 min sous la charge), puis attendait la fabrication (5 à 15 min) pour fusionner, puis la
// publication. Une petite modification prenait 25 à 40 min et la session attendait tout ce temps.
// Avant (21/11/2026) : une préversion par fusion faisait 63 publications en trois jours.

import { spawn, spawnSync } from 'node:child_process';
import * as crypto from 'node:crypto';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BASE, IMMINENT_MS, coordinationDir, expectedPublicationMs, expectedSuiteMs, git, imminent, lockHolder, mainBusy, mainDir, readDurations, readJson, readQueue,
  recordPublication, sleep, tryLock, writeJson,
} from './coordination.mjs';
import { versionOnlyDiff } from './compilation-faite.mjs';
import { SANS_TESTS_RAPIDES } from './avant-fusion.mjs';
import { shortReport } from './sortie-tests.mjs';

export const ATTENTE_MAX_MS = 2 * 60_000;
export const RETARD_MAX_MS = 60_000;
/** Le dossier principal occupé (modifications, autre branche) plus longtemps : le train s'arrête. */
const OCCUPE_MAX_MS = 30 * 60_000;
/** Recherches de branche fautive par lot, et essais de lecture d'une sortie illisible : au-delà, le train s'arrête (la file reste). */
export const RECHERCHES_MAX = 5;
export const ILLISIBLE_MAX = 3;
const hhmm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const LEADER = 'chef-publication.lock';
const MERGE_QUEUE = 'a-fusionner.json';
const MERGES = 'fusions.json';
const STATE = 'train-etat.json';
const REFUS = 'refus.json';
export const JOURNAL = 'train.txt';
export const CANDIDAT_BRANCHE = 'train/candidat';

/** Commits de proto/ecrans pas encore publiés (depuis le dernier « Version … »). */
export function pendingCommits(cwd, ref = BASE) {
  const last = git(['log', '-1', '--format=%H', '--extended-regexp', '--grep=^Version [0-9]', ref], cwd);
  if (!last) return 0;
  return Number(git(['rev-list', '--count', `${last}..${ref}`], cwd));
}

/** Les branches à attendre : fusion prévue dans ATTENTE_MAX_MS, pas en retard de plus de RETARD_MAX_MS. */
export function worthWaiting(entries, { now = Date.now(), except } = {}) {
  return imminent(entries, { now, horizon: Math.min(IMMINENT_MS, ATTENTE_MAX_MS), except }).filter((e) => Date.parse(e.finPrevue) >= now - RETARD_MAX_MS);
}

function legerFile(dir) {
  return path.join(dir, 'leger-demande.json');
}

/** Une branche fusionnée qui demande une publication complète légère (Electron ou exécutable changés). */
export function requestLeger(branche, dir = coordinationDir()) {
  const list = readJson(legerFile(dir), []);
  if (!list.includes(branche)) writeJson(legerFile(dir), [...list, branche]);
}

/** Une publication interrompue reprend le même numéro ; de nouveaux commits demandent une préversion. */
export function publicationPlan({ pending, retry = false, leger = false }) {
  if (!pending && !retry) return undefined;
  const reprendre = !pending && retry;
  return { reprendre, args: [leger ? '--leger' : '--rapide', ...(reprendre ? [] : ['--essai'])] };
}

/** Un échec avant le commit de préversion ne doit pas republier la version précédente. */
export function publicationRetry({ before, head, subject, reprendre, leger }) {
  if (!/^Version [0-9]+[.][0-9]+[.][0-9]+-essai[.][0-9]+$/.test(subject) || (!reprendre && before === head)) return undefined;
  return { head, leger };
}

// ---------------------------------------------------------------- file des fusions

/** Petit verrou synchrone autour d'une lecture-écriture de la file (sessions et train y écrivent). */
function withQueueLock(dir, fn) {
  const lock = path.join(dir, `${MERGE_QUEUE}.lock`);
  for (let i = 0; ; i++) {
    try {
      fs.writeFileSync(lock, String(process.pid), { flag: 'wx' });
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      let age = 0;
      try {
        age = Date.now() - fs.statSync(lock).mtimeMs;
      } catch {
        continue;
      }
      if (age > 30_000 || i > 200) fs.rmSync(lock, { force: true });
      else Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 50);
    }
  }
  try {
    const queue = readJson(path.join(dir, MERGE_QUEUE), []);
    const result = fn(Array.isArray(queue) ? queue : []);
    if (result?.queue) writeJson(path.join(dir, MERGE_QUEUE), result.queue);
    return result?.value;
  } finally {
    fs.rmSync(lock, { force: true });
  }
}

export function readMergeQueue(dir = coordinationDir()) {
  const queue = readJson(path.join(dir, MERGE_QUEUE), []);
  return Array.isArray(queue) ? queue : [];
}

/** La branche, au commit vérifié `head`, confiée au train (remplace une entrée précédente). */
export function enqueueMerge({ branche, head }, dir = coordinationDir()) {
  withQueueLock(dir, (queue) => ({ queue: [...queue.filter((e) => e.branche !== branche), { branche, head, date: new Date().toISOString(), etat: 'en-file' }] }));
  // Une branche reconfiée repart à zéro : son refus d'avant ne la désigne plus.
  clearRefus(branche, dir);
}

// ---------------------------------------------------------------- refus (branches écartées du train)

/**
 * Les branches que le train a écartées d'un lot parce que leur travail fait tomber la suite : [{ branche, head, date,
 * lot, fichiers, etape, message, tentatives }]. Le fichier vit jusqu'à ce que la branche soit reconfiée ou fusionnée :
 * la refuser ne doit jamais l'effacer en silence (26/11/2026).
 */
export function readRefus(dir = coordinationDir()) {
  const list = readJson(path.join(dir, REFUS), []);
  return Array.isArray(list) ? list : [];
}

export function recordRefus(refus, dir = coordinationDir()) {
  const previous = readRefus(dir).find((r) => r.branche === refus.branche);
  writeJson(path.join(dir, REFUS), [...readRefus(dir).filter((r) => r.branche !== refus.branche), { tentatives: 1, ...refus, date: new Date().toISOString(), ...(previous ? { tentatives: (previous.tentatives ?? 1) + 1 } : {}) }]);
}

export function clearRefus(branche, dir = coordinationDir()) {
  const list = readRefus(dir);
  if (list.some((r) => r.branche === branche)) writeJson(path.join(dir, REFUS), list.filter((r) => r.branche !== branche));
}

/** Ce que dit un refus, en quelques lignes : la branche, son commit, les fichiers et le message en cause. */
export function refusLine(r) {
  const fichiers = (r.fichiers ?? []).join(', ') || r.etape || '?';
  return `${r.branche} (commit ${String(r.head).slice(0, 8)}, écartée à ${hhmm(r.date)}${r.tentatives > 1 ? `, ${r.tentatives}e refus` : ''}) : ${fichiers}${r.message ? ` — ${String(r.message).split('\n').filter(Boolean).slice(0, 2).join(' / ').slice(0, 300)}` : ''}`;
}

/** Le brief prêt à donner à une session pour reprendre une branche refusée. */
export function refusBrief(r) {
  return [
    `La branche ${r.branche} (commit ${r.head}) a été écartée du train de fusion le ${r.date} : sa suite complète est rouge, et les tests suivants échouent avec son travail seulement (le lot sans elle passe) :`,
    ...(r.fichiers ?? []).map((f) => `  - ${f}`),
    r.message ? `Message : ${r.message}` : '',
    r.lot?.length ? `Lot du train : ${r.lot.join(', ')}.` : '',
    `Reprise : dans le worktree de la branche, relancer le test en cause (node scripts/verifier.mjs <nom du fichier de test>), corriger la cause (pas le test, sauf s'il est faux), commiter, puis npm run fusionner.`,
  ].filter(Boolean).join('\n');
}

/** Les refus à lire en tête de chaque npm run fusionner, ou undefined. */
export function refusStatus(dir = coordinationDir()) {
  const list = readRefus(dir);
  if (!list.length) return undefined;
  return `REFUSÉES par le train (leur travail fait tomber la suite ; elles ne partent pas tant qu'elles ne sont pas corrigées et reconfiées par npm run fusionner) :\n${list.map((r) => `  - ${refusLine(r)}`).join('\n')}\nnpm run refus : détail et brief de reprise.`;
}

/** Retire l'entrée de la branche (fusionnée, ou conflit lu par sa session). */
export function dropMerge(branche, dir = coordinationDir()) {
  withQueueLock(dir, (queue) => ({ queue: queue.filter((e) => e.branche !== branche) }));
}

function markMerge(branche, fields, dir) {
  withQueueLock(dir, (queue) => ({ queue: queue.map((e) => (e.branche === branche ? { ...e, ...fields } : e)) }));
}

function readText(file) {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

const gitRun = (args, cwd) => spawnSync('git', args, { cwd, encoding: 'utf8', windowsHide: true });

/**
 * Fusionne les branches `entries` (le commit exact que chaque session a vérifié) dans l'arbre de `cwd`, dans l'ordre
 * d'arrivée : en avance rapide si possible, sinon par un commit de fusion. Un conflit annule cette fusion seule.
 * Rend { merged: [{ entry, avant, apres }], conflicts: [{ entry, fichiers, message, base }] } ; `avant` et `apres` sont
 * les états successifs du lot : le train y revient pour chercher la branche en cause (« préfixes » du lot).
 * Le train ne s'en sert que dans son candidat (un worktree à lui) : le dossier principal n'avance qu'une fois ce lot vert
 * (mergeQueued : ce nom est aussi le repère par lequel launchTrain reconnaît un script qui connaît la file des fusions).
 */
export function mergeQueued(cwd, entries, say = console.log) {
  const merged = [];
  const conflicts = [];
  for (const entry of entries) {
    const avant = git(['rev-parse', 'HEAD'], cwd);
    let r = gitRun(['merge', '--ff-only', entry.head], cwd);
    if (r.status !== 0) {
      r = gitRun(['merge', '--no-ff', '--no-edit', '-m', `Merge branch '${entry.branche}' into ${BASE}`, entry.head], cwd);
      if (r.status !== 0) {
        const fichiers = git(['diff', '--name-only', '--diff-filter=U'], cwd).split('\n').filter(Boolean);
        const message = `${r.stdout}${r.stderr}`.trim().slice(0, 800);
        gitRun(['merge', '--abort'], cwd);
        conflicts.push({ entry, fichiers, message, base: avant });
        say(fichiers.length ? `Conflit en fusionnant ${entry.branche} : ${fichiers.join(', ')}. Sa session doit relancer npm run fusionner.` : `Fusion de ${entry.branche} impossible : ${message.slice(0, 300)}`);
        continue;
      }
    }
    merged.push({ entry, avant, apres: git(['rev-parse', 'HEAD'], cwd) });
  }
  return { merged, conflicts };
}

// ---------------------------------------------------------------- le candidat

/** Le worktree où le train fusionne et vérifie un lot, avant que proto/ecrans n'avance. */
export function candidateDir(main) {
  return path.join(main, '.claude', 'worktrees', 'train-candidat');
}

/**
 * Amène le candidat sur `sha` (il est créé au premier besoin), sans rien garder d'une fusion ou d'un essai précédent.
 * Le dossier principal reste intact : c'est tout l'intérêt (proto/ecrans ne reçoit jamais un travail non vérifié).
 */
export function resetCandidate(main, cand, sha) {
  gitRun(['worktree', 'prune'], main);
  if (!fs.existsSync(path.join(cand, '.git'))) {
    fs.mkdirSync(path.dirname(cand), { recursive: true });
    const r = gitRun(['worktree', 'add', '-q', '-f', '-B', CANDIDAT_BRANCHE, cand, sha], main);
    if (r.status !== 0) throw new Error(`candidat impossible à créer : ${`${r.stdout}${r.stderr}`.trim().slice(0, 400)}`);
    return;
  }
  gitRun(['merge', '--abort'], cand);
  const r = gitRun(['checkout', '-q', '-f', '-B', CANDIDAT_BRANCHE, sha], cand);
  if (r.status !== 0) throw new Error(`candidat impossible à remettre sur ${sha.slice(0, 8)} : ${`${r.stdout}${r.stderr}`.trim().slice(0, 400)}`);
  gitRun(['reset', '-q', '--hard', sha], cand);
  gitRun(['clean', '-fdq'], cand);
}

/**
 * Le candidat a ses propres node_modules (jamais ceux du dossier principal : npm ci les efface) ; npm ci ne tourne que
 * s'ils manquent ou si le lockfile n'est plus celui de leur installation. Rend false si l'installation échoue.
 */
export function prepareCandidate(cand, say = () => {}) {
  const lock = path.join(cand, 'package-lock.json');
  if (!fs.existsSync(lock)) return true;
  const hash = crypto.createHash('sha1').update(fs.readFileSync(lock)).digest('hex');
  const mark = path.join(cand, 'node_modules', '.train-lock');
  if (readText(mark).trim() === hash) return true;
  say('Candidat : npm ci (lockfile nouveau ou premier lot)…');
  const r = spawnSync('npm ci --prefer-offline --no-audit --no-fund', { cwd: cand, shell: true, encoding: 'utf8', windowsHide: true, timeout: 20 * 60_000, maxBuffer: 64 * 1024 * 1024 });
  if (r.status !== 0) {
    say(`npm ci du candidat a échoué : ${`${r.stdout}${r.stderr}`.trim().slice(-400)}`);
    return false;
  }
  fs.writeFileSync(mark, hash);
  return true;
}

// ---------------------------------------------------------------- état du train (vert, rouge)

export function readTrainState(dir = coordinationDir()) {
  return readJson(path.join(dir, STATE), {});
}

function writeTrainState(dir, state) {
  writeJson(path.join(dir, STATE), { ...state, date: new Date().toISOString() });
}

/**
 * La branche dont une vérification verte porte exactement sur l'arbre de `sha` : { branche, head, date },
 * ou undefined. Les certificats (avant-fusion.mjs) ne sont écrits qu'après tous les tests rapides,
 * sur un travail entièrement commité ; leur commit garde donc l'arbre vérifié. Un seul appel à git
 * pour tous les certificats (commits disparus ignorés).
 */
export function certifiedBy(main, dir, sha) {
  const folder = path.join(dir, 'certificats');
  let names = [];
  try {
    names = fs.readdirSync(folder).filter((f) => f.endsWith('.json'));
  } catch {
    return undefined;
  }
  const certs = names.map((n) => ({ branche: n.replace(/\.json$/, ''), ...readJson(path.join(folder, n), {}) })).filter((c) => /^[0-9a-f]{40}$/.test(c.head ?? ''));
  if (!certs.length) return undefined;
  const r = spawnSync('git', ['cat-file', '--batch-check=%(objectname)'], { cwd: main, input: `${[`${sha}^{tree}`, ...certs.map((c) => `${c.head}^{tree}`)].join('\n')}\n`, encoding: 'utf8', windowsHide: true });
  const lines = (r.stdout ?? '').split(/\r?\n/);
  if (r.status !== 0 || !/^[0-9a-f]{40}$/.test(lines[0])) return undefined;
  const hit = certs.find((c, i) => lines[i + 1] === lines[0]);
  return hit && { branche: hit.branche, head: hit.head, date: hit.date };
}

/**
 * Les branches suspectes d'une suite rouge : celles dont le changement touche un fichier de test en
 * échec ; aucune ne le touche (contrôles en échec, test qui relit tout) : toutes celles du lot.
 * `merges` : [{ branche, tests: [noms de fichiers de test touchés] }].
 */
export function pickSuspects(failing, merges) {
  const names = new Set(failing.map((f) => path.basename(f)));
  const touching = merges.filter((m) => m.tests.some((t) => names.has(t)));
  const list = touching.length ? touching : merges;
  return { suspects: [...new Set(list.map((m) => m.branche))], certain: touching.length > 0 };
}

async function suspectsFor(failing, main, dir, since) {
  const { collectTests, testsForChanges } = await import('./verifier.mjs');
  const log = readJson(path.join(dir, MERGES), []);
  const merges = (Array.isArray(log) ? log : []).filter((m) => !since || m.date > since);
  const all = collectTests(main);
  const names = all.map((t) => t.name);
  return pickSuspects(failing, merges.map((m) => {
    let changed = [];
    try {
      changed = git(['diff', '--name-only', m.avant, m.apres], main).split('\n').filter(Boolean);
    } catch {
      // Commit disparu : la branche reste suspecte avec les autres.
    }
    return { branche: m.branche, tests: testsForChanges(changed, names, (n) => all.find((t) => t.name === n)?.source()) };
  }));
}

/** Ce qu'une session doit savoir de proto/ecrans (suite rouge), ou undefined. */
export function trainStatus(dir = coordinationDir()) {
  const s = readTrainState(dir);
  if (s.etat === 'illisible') return `ATTENTION : le train n'a pas pu lire la sortie des tests (${ILLISIBLE_MAX} essais, depuis ${hhmm(s.date)}) : rien n'est écarté ni fusionné, les branches restent en file. npm run publication-groupee relance le train ; détails : .git/coordination/train.txt.`;
  if (s.etat !== 'rouge') return undefined;
  const suspects = s.suspects?.length ? ` Branche(s) ${s.suspectsCertains ? 'en cause' : 'possibles'} : ${s.suspects.join(', ')}.` : '';
  const avant = s.anterieur ? ' Elle était déjà rouge avant le dernier lot : aucune branche n\'est écartée pour cela.' : '';
  return `ATTENTION : la suite complète est rouge sur ${BASE} depuis ${hhmm(s.date)} (commit ${String(s.sha).slice(0, 8)}) : ${(s.echecs ?? []).join(', ')}.${avant}${suspects} Aucune préversion ne part avant une correction (une branche qui corrige, puis npm run fusionner). Détails : .git/coordination/train.txt.`;
}

// ---------------------------------------------------------------- lancement détaché

/**
 * Lance le train détaché de la session, sans fenêtre, et rend son numéro de processus.
 * Sous Windows, par WMI (Win32_Process.Create) : le processus naît hors de l'arbre et du job de la
 * session, et survit à sa fin ; la console de node est cachée (ShowWindow 0). L'environnement de la
 * session lui est transmis, sans les variables de npm run.
 */
export function launchTrain(main, { args = [], dir = coordinationDir(main) } = {}) {
  // Le script du dossier principal (le plus récent de proto/ecrans) ; tant qu'il ne connaît pas encore
  // la file des fusions (première fusion du train lui-même), celui de la branche.
  const fromMain = path.join(main, 'scripts', 'publication-groupee.mjs');
  const script = /mergeQueued/.test(readText(fromMain)) ? fromMain : fileURLToPath(import.meta.url);
  const argv = [script, '--train', ...args];
  if (process.platform === 'win32') {
    const spec = path.join(dir, `train-lancement-${process.pid}.json`);
    const env = Object.entries(process.env).filter(([k, v]) => v !== undefined && !/^npm_/i.test(k) && !/^=/.test(k)).map(([k, v]) => `${k}=${v}`);
    writeJson(spec, { commandLine: [process.execPath, ...argv].map((a) => `"${a}"`).join(' '), cwd: main, env });
    const ps = [
      `$s = Get-Content -LiteralPath '${spec.replace(/'/g, "''")}' -Raw -Encoding UTF8 | ConvertFrom-Json`,
      `$si = New-CimInstance -ClassName Win32_ProcessStartup -ClientOnly -Property @{ ShowWindow = [uint16]0; EnvironmentVariables = [string[]]$s.env }`,
      `$r = Invoke-CimMethod -ClassName Win32_Process -MethodName Create -Arguments @{ CommandLine = $s.commandLine; CurrentDirectory = $s.cwd; ProcessStartupInformation = $si }`,
      `"$($r.ReturnValue) $($r.ProcessId)"`,
    ].join('; ');
    const r = spawnSync('powershell', ['-NoProfile', '-NonInteractive', '-Command', ps], { encoding: 'utf8', windowsHide: true });
    fs.rmSync(spec, { force: true });
    const [code, pid] = (r.stdout ?? '').trim().split(/\s+/).map(Number);
    if (code === 0 && pid) return pid;
  }
  const child = spawn(process.execPath, argv, { cwd: main, detached: true, stdio: 'ignore', windowsHide: true });
  child.unref();
  return child.pid;
}

/** Le train en cours : { pid, etat, phase, finPrevue… }, ou undefined. */
export function trainHolder(dir = coordinationDir()) {
  return lockHolder(path.join(dir, LEADER));
}

// ---------------------------------------------------------------- le train

const heure = (ms = Date.now()) => new Date(ms).toLocaleTimeString('fr-FR');

/** Une durée lisible : « 42 s », « 3 min 05 s ». */
export function duree(ms) {
  const s = Math.round(Math.max(0, ms) / 1000);
  return s < 60 ? `${s} s` : `${Math.floor(s / 60)} min ${String(s % 60).padStart(2, '0')} s`;
}

/**
 * Horodatage des étapes de publier.mjs (lignes « > … ») : `line` met [hh:mm:ss] devant chacune et
 * note son début ; `end` rend [{ etape, ms }], chaque étape durant jusqu'au début de la suivante.
 */
export function publicationSteps() {
  const etapes = [];
  return {
    line(text, now = Date.now()) {
      if (!text.startsWith('> ')) return text;
      const last = etapes.at(-1);
      if (last) last.ms = now - last.debut;
      etapes.push({ etape: text.slice(2).trim(), debut: now });
      return `[${heure(now)}] ${text}`;
    },
    end(now = Date.now()) {
      const last = etapes.at(-1);
      if (last && last.ms === undefined) last.ms = now - last.debut;
      return etapes.map(({ etape, ms }) => ({ etape, ms }));
    },
  };
}

/** Une ligne de bilan : la durée de chaque étape, la plus longue en tête de lecture facile. */
export function stepsSummary({ etapes = [], totalMs, libereMs }) {
  const list = etapes.map((e) => `${e.etape.replace(/\s*\(.*$/, '')} ${duree(e.ms)}`).join(', ');
  return `${list}${list ? ' ; ' : ''}total ${duree(totalMs)}${libereMs ? `, dossier principal rendu après ${duree(libereMs)}` : ''}`;
}

/**
 * Le commit qu'une publication va envoyer est-il celui que le train a vérifié ? Le commit vérifié
 * lui-même (reprise), ou son enfant direct qui ne change que le numéro de version (commit
 * « Version … » : package.json, package-lock.json, CHANGELOG, changements/). Rend le problème, ou
 * undefined.
 */
export function unverifiedProblem(main, verified, frozen) {
  if (frozen && frozen === verified) return undefined;
  let parent;
  try {
    parent = git(['rev-parse', `${frozen}^`], main);
  } catch {
    parent = undefined;
  }
  if (parent && parent === verified && versionOnlyDiff(main, verified, frozen)) return undefined;
  return `le commit à publier (${String(frozen).slice(0, 8)}) n'est pas le commit vérifié (${String(verified).slice(0, 8)}) suivi de son seul numéro de version`;
}

/**
 * Lance publier.mjs (--liberer) en recopiant sa sortie, chaque étape horodatée. Rend
 * { freed, done } : `freed` se résout en { frozen, version } quand publier.mjs rend le dossier
 * principal pour l'envoi (après que `validate(frozen)` l'a accepté), ou en undefined s'il se termine
 * sans le rendre ; `done` en { code, out, etapes, totalMs, libereMs } à sa fin.
 */
export function startPublication(main, args, { say, write, validate }) {
  const started = Date.now();
  say(`> node scripts/publier.mjs ${args.join(' ')} --liberer (dossier principal)`);
  const child = spawn(process.execPath, [path.join(main, 'scripts', 'publier.mjs'), ...args, '--liberer'], { cwd: main, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe', 'ipc'] });
  const steps = publicationSteps();
  let out = '';
  let freedAt;
  let resolveFreed;
  const freed = new Promise((resolve) => {
    resolveFreed = resolve;
  });
  // Lignes entières seulement (horodatage) ; après la libération, l'envoi se mêle aux messages du train.
  const reader = () => {
    let rest = '';
    return {
      data(d) {
        out += d;
        rest += d;
        const lines = rest.split(/\r?\n/);
        rest = lines.pop();
        for (const text of lines) {
          const shown = steps.line(text);
          write(`${freedAt && shown === text && text ? 'envoi | ' : ''}${shown}\n`);
        }
      },
      flush() {
        if (rest) write(`${rest}\n`);
        rest = '';
      },
    };
  };
  const stdout = reader();
  const stderr = reader();
  child.stdout.on('data', (d) => stdout.data(String(d)));
  child.stderr.on('data', (d) => stderr.data(String(d)));
  child.on('message', (message) => {
    if (!message?.libere) return;
    const problem = validate(message.frozen);
    try {
      child.send({ continuer: !problem, raison: problem });
    } catch {
      // publier.mjs déjà parti : sa fin le dira.
    }
    if (problem) {
      say(`Envoi refusé par le train : ${problem}.`);
      resolveFreed(undefined);
      return;
    }
    freedAt = Date.now();
    resolveFreed({ frozen: message.frozen, version: message.version });
  });
  const done = new Promise((resolve) => {
    let settled = false;
    const finish = (code) => {
      if (settled) return;
      settled = true;
      stdout.flush();
      stderr.flush();
      resolveFreed(undefined);
      const end = Date.now();
      resolve({ code, out, etapes: steps.end(end), totalMs: end - started, libereMs: freedAt ? freedAt - started : undefined });
    };
    child.on('error', (error) => {
      out += String(error.message);
      finish(1);
    });
    child.on('close', (code) => finish(code ?? 1));
  });
  return { freed, done };
}

/**
 * Le train. Rend 0 si tout ce qu'il y avait à publier l'est (ou si un autre train s'en charge, ou s'il
 * n'y a rien à publier), 1 sinon (suite rouge, publication en échec, dossier principal occupé).
 * `deps` (essais) : `verify` (scripts/avant-fusion.mjs, runAvantFusion), `publish`
 * (startPublication), `pause` (attente entre deux regards sur la file).
 */
export async function publishGrouped({ cwd = process.cwd(), say = console.log, write = (d) => process.stdout.write(d), publier = true, deps = {} } = {}) {
  const dir = coordinationDir(cwd);
  const main = mainDir(cwd);
  const leaderFile = path.join(dir, LEADER);
  const retryFile = path.join(dir, 'publication-a-reprendre.json');
  const verify = deps.verify ?? (async (options) => (await import('./avant-fusion.mjs')).runAvantFusion(options));
  const recheck = deps.recheck ?? (async (options) => (await import('./avant-fusion.mjs')).recheckFailures(options));
  const prepare = deps.prepare ?? prepareCandidate;
  const publish = deps.publish ?? startPublication;
  const pause = deps.pause ?? sleep;
  const cand = deps.candidat ?? candidateDir(main);
  const release = tryLock(leaderFile, { branche: 'train', etat: 'attente', phase: 'attente' });
  if (!release) {
    say(`Le train tourne déjà (processus ${trainHolder(dir)?.pid ?? '?'}) : il emportera ces fusions.`);
    return 0;
  }
  // etat « publication » : le dossier principal ne doit pas bouger (lu aussi par les anciens fusionner.mjs).
  const setState = (etat, phase, extra = {}) => writeJson(leaderFile, { ...readJson(leaderFile, {}), etat, phase, pid: process.pid, maj: new Date().toISOString(), finPrevue: undefined, ...extra });
  // Pendant un envoi, le train attend sans tenir le dossier principal ; la fin prévue est celle de l'envoi.
  let envoi;
  const idle = () => (envoi ? setState('attente', 'attente', { envoi: envoi.version, finPrevue: envoi.finPrevue }) : setState('attente', 'attente', { envoi: undefined }));
  const key = (f) => path.basename(String(f));

  /**
   * Le lot en file : fusionné dans le candidat (un worktree à part), suite complète passée sur lui ; proto/ecrans n'avance
   * (avance rapide) que si elle est verte, jamais avant. Rouge : la branche fautive est cherchée sur les états
   * successifs du lot en ne rejouant que les fichiers en échec, écartée (refus.json) et le reste est revérifié en entier.
   * Rend { rouge, arret } : `rouge` si la suite reste rouge sur proto/ecrans lui-même (déjà rouge avant le lot),
   * `arret` si le train doit s'arrêter (la file reste intacte).
   */
  const integrate = async () => {
    let illisibles = 0;
    let recherches = 0;
    for (let essai = 1; essai <= 4 * RECHERCHES_MAX + ILLISIBLE_MAX; essai++) {
      // Un refus lu par sa session (ou resté sans lecteur plus de 15 min) sort de la file ; refus.json le garde.
      for (const e of readMergeQueue(dir)) if (e.etat === 'refusee' && Date.now() - (Date.parse(e.refuseeLe ?? '') || 0) > 15 * 60_000) dropMerge(e.branche, dir);
      const entries = readMergeQueue(dir).filter((e) => e.etat === 'en-file');
      if (!entries.length) return {};
      const base = git(['rev-parse', 'HEAD'], main);
      setState('publication', 'fusion', { envoi: envoi?.version });
      resetCandidate(main, cand, base);
      const { merged, conflicts } = mergeQueued(cand, entries, say);
      for (const c of conflicts) markMerge(c.entry.branche, c.fichiers.length ? { etat: 'conflit', fichiers: c.fichiers, base: c.base } : { etat: 'erreur', message: c.message }, dir);
      if (!merged.length) continue;
      const candSha = git(['rev-parse', 'HEAD'], cand);
      const noms = merged.map((m) => m.entry.branche);
      if (!prepare(cand, say)) {
        say('Train arrêté : le candidat n\'a pas pu être préparé (npm ci). Les branches restent en file ; npm run publication-groupee le relance.');
        return { arret: true };
      }
      const certified = certifiedBy(main, dir, candSha);
      const chemin = certified ? { chemin: SANS_TESTS_RAPIDES } : undefined;
      const expected = expectedSuiteMs(readDurations(dir), undefined, chemin);
      setState('publication', 'verification', { finPrevue: new Date(Date.now() + expected).toISOString(), envoi: envoi?.version });
      if (certified) say(`Arbre déjà certifié vert par ${certified.branche} (${certified.head.slice(0, 8)}, tous les tests rapides passés) : tests rapides sautés.`);
      say(`Candidat ${candSha.slice(0, 8)} (${noms.join(', ')} sur ${base.slice(0, 8)}) : suite complète${certified ? ' sans tests rapides' : ''}, fin prévue vers ${hhmm(Date.now() + expected)}${envoi ? `, pendant l'envoi de la ${envoi.version}` : ''}. ${BASE} n'avance qu'une fois elle verte.`);
      const result = await verify({ cwd: cand, say, complete: true, train: true, testsRapides: !certified });
      if (result.ok) {
        const avance = await advance({ merged, base, candSha });
        if (avance.refaire) continue;
        return avance;
      }
      // Sortie des tests illisible : refaite sans rien reprocher à personne.
      if (result.illisible) {
        if (++illisibles < ILLISIBLE_MAX) {
          say(`Sortie des tests illisible (essai ${illisibles}/${ILLISIBLE_MAX}) : la suite est refaite, aucune branche n'est écartée.`);
          await pause(30_000);
          continue;
        }
        writeTrainState(dir, { etat: 'illisible', sha: candSha, echecs: result.failures });
        say(`\n${trainStatus(dir)}`);
        return { arret: true };
      }
      // Échec confirmé : qui l'a causé ?
      const echecs = [...new Set(result.failures.map(key))];
      const cache = new Map();
      /** Parmi les échecs du lot, ceux qui tombent encore sur le préfixe k (k branches fusionnées), jamais la suite entière. */
      const encore = async (k) => {
        if (!cache.has(k)) {
          const sha = k === 0 ? base : merged[k - 1].apres;
          resetCandidate(main, cand, sha);
          if (!prepare(cand, say)) throw new Error('candidat non préparé');
          setState('publication', 'recherche', { envoi: envoi?.version });
          say(`Recherche : ${k === 0 ? `${BASE} seul` : `lot jusqu'à ${merged[k - 1].entry.branche}`} (${sha.slice(0, 8)}), ${echecs.length} échec(s) rejoué(s).`);
          cache.set(k, (await recheck({ cwd: cand, failures: echecs, say })).map(key));
        }
        return cache.get(k);
      };
      const etat = readTrainState(dir);
      const anterieurs = etat.etat === 'vert' && etat.sha === base ? [] : await encore(0);
      const restants = echecs.filter((f) => !anterieurs.includes(f));
      if (!restants.length) {
        // Rouge avant le lot, identiquement : le lot n'a rien cassé. Il avance, la suite reste rouge (correction à venir).
        say(`Les échecs (${echecs.join(', ')}) existent déjà sur ${BASE} sans le lot : aucune branche n'est écartée.`);
        const avance = await advance({ merged, base, candSha, rouge: { echecs, anterieur: true } });
        if (avance.refaire) continue;
        return { ...avance, rouge: true };
      }
      // Recherche par dichotomie : le préfixe 0 passe (sur ces fichiers), le lot entier tombe ; la première branche dont
      // l'ajout fait tomber l'un des échecs est la fautive.
      let lo = 0;
      let hi = merged.length;
      while (hi - lo > 1) {
        const mid = (lo + hi) >> 1;
        if ((await encore(mid)).some((f) => restants.includes(f))) hi = mid;
        else lo = mid;
      }
      const fautive = merged[hi - 1].entry;
      const detail = (result.details ?? []).find((d) => restants.includes(key(d.file)));
      const probleme = (result.problems ?? []).find((p) => restants.includes(p.etape) || (p.fichiers ?? []).some((f) => restants.includes(key(f))));
      const message = detail ? shortReport(detail.details, 4) : (probleme?.lignes ?? []).slice(0, 6).join('\n');
      recordRefus({ branche: fautive.branche, head: fautive.head, lot: noms, fichiers: restants, etape: probleme?.etape, message: String(message ?? '').slice(0, 1200) }, dir);
      markMerge(fautive.branche, { etat: 'refusee', fichiers: restants, message: String(message ?? '').slice(0, 800), refuseeLe: new Date().toISOString() }, dir);
      say(`\nBranche écartée du lot : ${refusLine(readRefus(dir).find((r) => r.branche === fautive.branche))}. Elle ne part pas ; le reste du lot est refait et revérifié en entier.`);
      if (++recherches >= RECHERCHES_MAX) {
        say(`Train arrêté : ${RECHERCHES_MAX} branches écartées de suite dans ce lot. Le reste de la file n'est pas touché ; npm run publication-groupee le relance.`);
        return { arret: true };
      }
    }
    say('Train arrêté : trop d\'essais sur ce lot. La file reste intacte ; npm run publication-groupee le relance.');
    return { arret: true };
  };

  /** Le lot est vert dans le candidat : proto/ecrans avance dessus (avance rapide), et la file est soldée. */
  const advance = async ({ merged, base, candSha, rouge }) => {
    setState('publication', 'avance', { envoi: envoi?.version });
    const waited = Date.now();
    let last;
    for (;;) {
      const busy = mainBusy(main);
      if (!busy) break;
      if (!lockHolder(path.join(main, 'release', '.fabrication.lock')) && Date.now() - waited > OCCUPE_MAX_MS) {
        say(`Train arrêté : ${busy} depuis ${OCCUPE_MAX_MS / 60_000} min, le lot vert ne peut pas avancer ${BASE}. Les branches restent en file ; npm run publication-groupee le relance.`);
        return { arret: true };
      }
      if (busy !== last) say(`Lot vert : j'attends que le dossier principal soit libre (${busy}).`);
      last = busy;
      await pause(10_000);
    }
    const now = git(['rev-parse', 'HEAD'], main);
    if (now !== base) {
      say(`${BASE} a bougé pendant la vérification (${base.slice(0, 8)} -> ${now.slice(0, 8)}) : le lot est refait sur le nouveau ${BASE}.`);
      return { refaire: true };
    }
    writeTrainState(dir, rouge ? { etat: 'rouge', sha: candSha, echecs: rouge.echecs, suspects: [], anterieur: rouge.anterieur } : { etat: 'vert', sha: candSha });
    const r = gitRun(['merge', '--ff-only', candSha], main);
    if (r.status !== 0) {
      say(`Avance de ${BASE} impossible : ${`${r.stdout}${r.stderr}`.trim().slice(0, 300)}. Le lot est refait.`);
      return { refaire: true };
    }
    const log = readJson(path.join(dir, MERGES), []);
    writeJson(path.join(dir, MERGES), [...(Array.isArray(log) ? log : []), ...merged.map((m) => ({ branche: m.entry.branche, head: m.entry.head, avant: m.avant, apres: m.apres, date: new Date().toISOString() }))].slice(-100));
    for (const m of merged) {
      dropMerge(m.entry.branche, dir);
      clearRefus(m.entry.branche, dir);
    }
    say(`${BASE} avancé sur le lot vert : ${merged.map((m) => m.entry.branche).join(', ')} (${git(['log', '-1', '--format=%h %s', 'HEAD'], main)}).`);
    idle();
    return {};
  };

  /** La fin d'une publication : préversion en ligne, ou échec noté pour la reprise. Rend true si publiée. */
  const settle = (result, lot) => {
    if (result.etapes?.length) say(`Durées de la publication${lot.version ? ` ${lot.version}` : ''} : ${stepsSummary(result)}.`);
    if (result.code !== 0) {
      const head = lot.frozen ?? git(['rev-parse', 'HEAD'], main);
      const interrupted = publicationRetry({ before: lot.verified, head, subject: git(['log', '-1', '--format=%s', head], main), reprendre: lot.plan.reprendre, leger: lot.args[0] === '--leger' });
      if (interrupted) writeJson(retryFile, interrupted);
      writeTrainState(dir, { ...readTrainState(dir), publication: 'echec' });
      say(`\nPublication${lot.version ? ` de la ${lot.version}` : ''} en échec : voir la sortie ci-dessus. npm run publication-groupee la relance${lot.frozen ? ' (même numéro)' : ' telle quelle'}.`);
      return false;
    }
    fs.rmSync(retryFile, { force: true });
    if (result.totalMs) recordPublication({ version: lot.version, args: lot.args, totalMs: result.totalMs, libereMs: result.libereMs, etapes: result.etapes ?? [] }, dir);
    // Le commit « Version … » est celui de la suite verte plus le numéro : il reste vert, sauf si le
    // lot suivant, vérifié pendant l'envoi, a déjà son propre résultat.
    const sha = lot.frozen ?? git(['rev-parse', 'HEAD'], main);
    const current = readTrainState(dir);
    if (!current.sha || current.sha === lot.verified) writeTrainState(dir, { etat: 'vert', sha });
    if (lot.leger.length) writeJson(legerFile(dir), readJson(legerFile(dir), []).filter((b) => !lot.leger.includes(b)));
    say(`Préversion publiée (${git(['log', '-1', '--format=%s', sha], main)}).`);
    return true;
  };
  /** Attend la fin de l'envoi en cours (s'il y en a un). Rend true s'il a réussi. */
  const finishEnvoi = async () => {
    if (!envoi) return true;
    const current = envoi;
    if (current.waitSaid) say(current.waitSaid);
    const result = await current.done;
    envoi = undefined;
    idle();
    return settle(result, current);
  };

  try {
    let tours = 0;
    for (let round = 1; round <= 6; ) {
      if (++tours > 20) {
        say('Train arrêté : trop de tours sans publication (proto/ecrans bouge sans cesse). npm run publication-groupee le relance.');
        break;
      }
      // 1. Attente (2 min au plus) des branches sur le point d'arriver, puis le lot : fusionné dans le candidat, suite
      // complète, et proto/ecrans n'avance que si elle est verte. Pendant un envoi aussi : le dossier principal est
      // rendu, les branches en file n'attendent pas la fin.
      const start = Date.now();
      let last = '';
      let capped = false;
      for (;;) {
        const busy = mainBusy(main);
        const fabrication = lockHolder(path.join(main, 'release', '.fabrication.lock'));
        if (busy && !fabrication && Date.now() - start > OCCUPE_MAX_MS) {
          say(`Train arrêté : ${busy} depuis ${OCCUPE_MAX_MS / 60_000} min. Les branches restent en file ; npm run publication-groupee le relance.`);
          await finishEnvoi();
          return 1;
        }
        const over = Date.now() - start > ATTENTE_MAX_MS;
        const queued = worthWaiting(readQueue(dir));
        if (over && queued.length && !capped) say(`Attente plafonnée à ${ATTENTE_MAX_MS / 60_000} min : départ sans ${queued.map((e) => e.branche).join(', ')}.`);
        capped ||= over;
        const waiting = capped ? [] : queued;
        if (!waiting.length && !busy) break;
        const what = busy ?? waiting.map((e) => `${e.branche} (${e.etape}, fusion prévue vers ${hhmm(e.finPrevue)})`).join(', ');
        if (what !== last) say(`Train : j'attends ${what}.`);
        last = what;
        await pause(10_000);
      }
      let integration;
      try {
        integration = await integrate();
      } catch (error) {
        say(`Train arrêté : ${error.message}. Les branches restent en file ; npm run publication-groupee le relance.`);
        await finishEnvoi();
        return 1;
      }
      if (integration.arret || integration.rouge) {
        if (integration.rouge) say(`\n${trainStatus(dir)}`);
        await finishEnvoi();
        return 1;
      }
      if (!publier) {
        say('Fusions et suite faites ; publication non demandée (--sans-publier).');
        return (await finishEnvoi()) ? 0 : 1;
      }
      const pending = pendingCommits(main);
      const previous = readJson(retryFile);
      const before = git(['rev-parse', 'HEAD'], main);
      const retry = previous?.head === before;
      const leger = readJson(legerFile(dir), []);
      const plan = publicationPlan({ pending, retry, leger: leger.length > 0 || (retry && previous.leger) });
      if (!plan) {
        if (envoi) {
          // Rien de neuf pour l'instant : la fin de l'envoi, puis un dernier regard sur la file.
          if (!(await finishEnvoi())) return 1;
          continue;
        }
        say(round === 1 ? 'Rien de neuf sur proto/ecrans depuis la dernière préversion : rien à publier.' : 'Plus rien de neuf : train terminé.');
        return 0;
      }
      // 2. Suite complète sur proto/ecrans, une fois pour tout le lot (pendant l'envoi précédent).
      const state = readTrainState(dir);
      if (state.etat === 'vert' && state.sha === before) {
        say('Suite complète déjà verte sur ce commit.');
      } else {
        const certified = certifiedBy(main, dir, before);
        const chemin = certified ? { chemin: SANS_TESTS_RAPIDES } : undefined;
        const expected = expectedSuiteMs(readDurations(dir), undefined, chemin);
        setState('publication', 'verification', { finPrevue: new Date(Date.now() + expected).toISOString(), envoi: envoi?.version });
        if (certified) say(`Arbre déjà certifié vert par ${certified.branche} (${certified.head.slice(0, 8)}, tous les tests rapides passés) : tests rapides sautés.`);
        say(`Suite complète${certified ? ' sans tests rapides' : ''} sur ${BASE} (${before.slice(0, 8)}, ${pending} commit(s) à publier), fin prévue vers ${hhmm(Date.now() + expected)}${envoi ? `, pendant l'envoi de la ${envoi.version}` : ''}.`);
        const result = await verify({ cwd: main, say, complete: true, train: true, testsRapides: !certified });
        if (!result.ok) {
          // Suspectes : les fusions depuis la dernière suite verte, sinon depuis la dernière préversion.
          const lastVersion = git(['log', '-1', '--format=%cI', '--extended-regexp', '--grep=^Version [0-9]', BASE], main);
          const since = (state.etat === 'vert' ? state.date : state.dernierVert) ?? (lastVersion ? new Date(lastVersion).toISOString() : undefined);
          const { suspects, certain } = await suspectsFor(result.failures, main, dir, since);
          writeTrainState(dir, { etat: 'rouge', sha: before, echecs: result.failures, suspects, suspectsCertains: certain, dernierVert: since });
          say(`\n${trainStatus(dir)}`);
          await finishEnvoi();
          return 1;
        }
        writeTrainState(dir, { etat: 'vert', sha: before });
      }
      // 3. Publication, en série : l'envoi précédent d'abord.
      if (envoi) {
        envoi.waitSaid = `Vérification faite ; j'attends la fin de l'envoi de la ${envoi.version} avant de publier ce lot.`;
        if (!(await finishEnvoi())) return 1;
      }
      // Jamais un commit non vérifié : le dossier principal n'a pas bougé depuis la vérification.
      const head = git(['rev-parse', 'HEAD'], main);
      if (head !== before) {
        say(`${BASE} a bougé pendant la vérification (${before.slice(0, 8)} -> ${head.slice(0, 8)}) : nouvelle vérification avant de publier.`);
        continue;
      }
      round++;
      const { libereMs, totalMs } = expectedPublicationMs(readDurations(dir));
      setState('publication', 'fabrication', { finPrevue: new Date(Date.now() + libereMs).toISOString() });
      say(`Publication : ${pending} commit(s) de ${BASE}${leger.length ? ` ; publication légère demandée par ${leger.join(', ')}` : ''}, dossier principal rendu vers ${hhmm(Date.now() + libereMs)}, préversion en ligne vers ${hhmm(Date.now() + totalMs)}.`);
      if (plan.reprendre) say('Reprise de la préversion interrompue, sans changer son numéro.');
      const launch = async (args) => {
        const started = publish(main, args, { say, write, validate: (frozen) => unverifiedProblem(main, before, frozen) });
        const freed = await started.freed;
        return freed ? { freed, done: started.done, args } : { result: await started.done, args };
      };
      let run = await launch(plan.args);
      if (run.result && run.result.code !== 0 && run.args[0] === '--rapide' && /le socle a changé/.test(run.result.out)) {
        say('Le socle a changé : reprise en publication légère (installeurs refaits).');
        run = await launch(publicationPlan({ pending, retry, leger: true }).args);
      }
      const lot = { verified: before, plan, args: run.args, leger };
      if (run.result) {
        if (!settle(run.result, lot)) return 1;
        continue;
      }
      // 4. Envoi en parallèle : le dossier principal est rendu, le tour suivant commence.
      const envoiMs = Math.max(60_000, totalMs - libereMs);
      envoi = { ...lot, ...run.freed, done: run.done, finPrevue: new Date(Date.now() + envoiMs).toISOString() };
      idle();
      say(`Dossier principal rendu : envoi de la ${envoi.version} sur GitHub (fin prévue vers ${hhmm(Date.now() + envoiMs)}) ; les branches en file sont fusionnées pendant ce temps.`);
    }
    return (await finishEnvoi()) ? 0 : 1;
  } finally {
    // Jamais de publier.mjs laissé sans lecteur : sa sortie coupée arrêterait l'envoi.
    if (envoi) await envoi.done.catch(() => undefined);
    release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  // Journal commun : le train tourne souvent détaché, sans console visible.
  const journal = path.join(coordinationDir(), JOURNAL);
  const write = (d) => {
    process.stdout.write(d);
    try {
      fs.appendFileSync(journal, d);
    } catch {
      // Journal indisponible : la sortie reste à l'écran.
    }
  };
  const say = (text) => write(`[${new Date().toLocaleTimeString('fr-FR')}] ${text}\n`);
  try {
    // Le journal garde les derniers tours seulement.
    if (fs.statSync(journal).size > 2_000_000) fs.writeFileSync(journal, fs.readFileSync(journal, 'utf8').slice(-500_000));
  } catch {
    // Pas encore de journal.
  }
  say(`--- Train lancé (processus ${process.pid}${process.argv.includes('--train') ? ', détaché' : ''}).`);
  const code = await publishGrouped({ say, write, publier: !process.argv.includes('--sans-publier') });
  say(`--- Train terminé (code ${code}).`);
  process.exit(code);
}
