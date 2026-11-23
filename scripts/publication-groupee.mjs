// Le train de fusion : il fusionne les branches vérifiées, passe la suite complète une fois sur
// proto/ecrans, puis publie la préversion d'essai. Il tourne détaché des sessions.
//   npm run publication-groupee          (lancé d'office, détaché, par npm run fusionner)
//   npm run publication-groupee -- --sans-publier   (fusions seulement)
//
// Un tour du train :
// 1. Fusions : chaque branche de a-fusionner.json (le commit exact que sa session a vérifié) est
//    fusionnée dans le dossier principal, en avance rapide si possible, sinon par un commit de fusion.
//    Conflit : rien n'est fusionné, la branche est marquée « conflit » et sa session le lit.
//    Pendant 2 minutes au plus, il attend les branches annoncées dans la file (scripts/coordination.mjs)
//    dont la fusion est imminente, pour les emporter dans la même préversion.
// 2. Suite complète sur proto/ecrans (scripts/avant-fusion.mjs --complete) : contrôles express puis
//    tous les tests lents. Rouge : pas de préversion ; train-etat.json nomme les échecs et les branches
//    suspectes, et chaque npm run fusionner l'affiche. La correction arrive par une branche comme une
//    autre, qui relance le train.
// 3. Publication : `node scripts/publier.mjs --rapide --essai` ; si le socle a changé (Electron,
//    exécutable), reprise d'office avec `--leger --essai`.
// Puis un nouveau tour pour les fusions arrivées entre-temps ; rien de neuf : le train s'arrête.
//
// Pendant la suite et la fabrication, le dossier principal ne bouge pas : les branches qui arrivent
// attendent dans a-fusionner.json, leur session n'attend pas (elle s'arrête à « en file »).
//
// Pourquoi (23/11/2026, 3 à 5 sessions en même temps) : chaque branche refaisait toute la suite lente
// (11 à 22 min sous la charge), puis attendait la fabrication (5 à 15 min) pour fusionner, puis la
// publication. Une petite modification prenait 25 à 40 min et la session attendait tout ce temps.
// Avant (21/11/2026) : une préversion par fusion faisait 63 publications en trois jours.

import { spawn, spawnSync } from 'node:child_process';
import * as path from 'node:path';
import * as fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import {
  BASE, IMMINENT_MS, coordinationDir, expectedSuiteMs, git, imminent, lockHolder, mainBusy, mainDir, readDurations, readJson, readQueue, sleep, tryLock, writeJson,
} from './coordination.mjs';

export const ATTENTE_MAX_MS = 2 * 60_000;
export const RETARD_MAX_MS = 60_000;
/** Le dossier principal occupé (modifications, autre branche) plus longtemps : le train s'arrête. */
const OCCUPE_MAX_MS = 30 * 60_000;
const hhmm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

export const LEADER = 'chef-publication.lock';
const MERGE_QUEUE = 'a-fusionner.json';
const MERGES = 'fusions.json';
const STATE = 'train-etat.json';
export const JOURNAL = 'train.txt';

/** Commits de proto/ecrans pas encore publiés (depuis le dernier « Version … »). */
export function pendingCommits(cwd) {
  const last = git(['log', '-1', '--format=%H', '--extended-regexp', '--grep=^Version [0-9]', BASE], cwd);
  if (!last) return 0;
  return Number(git(['rev-list', '--count', `${last}..${BASE}`], cwd));
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
 * Fusionne dans le dossier principal les branches en file, dans l'ordre d'arrivée. Rend les branches
 * fusionnées. S'arrête (sans rien perdre) si le dossier principal est occupé : le train le dit.
 */
export function mergeQueued(main, dir, say = console.log) {
  const merged = [];
  for (const entry of readMergeQueue(dir).filter((e) => e.etat === 'en-file')) {
    if (mainBusy(main)) break;
    const before = git(['rev-parse', 'HEAD'], main);
    let r = gitRun(['merge', '--ff-only', entry.head], main);
    if (r.status !== 0) {
      r = gitRun(['merge', '--no-ff', '--no-edit', '-m', `Merge branch '${entry.branche}' into ${BASE}`, entry.head], main);
      if (r.status !== 0) {
        const conflits = git(['diff', '--name-only', '--diff-filter=U'], main).split('\n').filter(Boolean);
        gitRun(['merge', '--abort'], main);
        markMerge(entry.branche, conflits.length ? { etat: 'conflit', fichiers: conflits, base: before } : { etat: 'erreur', message: `${r.stdout}${r.stderr}`.trim().slice(0, 800) }, dir);
        say(conflits.length ? `Conflit en fusionnant ${entry.branche} : ${conflits.join(', ')}. Sa session doit relancer npm run fusionner.` : `Fusion de ${entry.branche} impossible : ${`${r.stdout}${r.stderr}`.trim().slice(0, 300)}`);
        continue;
      }
    }
    const after = git(['rev-parse', 'HEAD'], main);
    const log = readJson(path.join(dir, MERGES), []);
    writeJson(path.join(dir, MERGES), [...(Array.isArray(log) ? log : []), { branche: entry.branche, head: entry.head, avant: before, apres: after, date: new Date().toISOString() }].slice(-100));
    dropMerge(entry.branche, dir);
    say(`Fusionnée : ${entry.branche} (${git(['log', '-1', '--format=%h %s', 'HEAD'], main)}).`);
    merged.push(entry.branche);
  }
  return merged;
}

// ---------------------------------------------------------------- état du train (vert, rouge)

export function readTrainState(dir = coordinationDir()) {
  return readJson(path.join(dir, STATE), {});
}

function writeTrainState(dir, state) {
  writeJson(path.join(dir, STATE), { ...state, date: new Date().toISOString() });
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
  if (s.etat !== 'rouge') return undefined;
  const suspects = s.suspects?.length ? ` Branche(s) ${s.suspectsCertains ? 'en cause' : 'possibles'} : ${s.suspects.join(', ')}.` : '';
  return `ATTENTION : la suite complète est rouge sur ${BASE} depuis ${hhmm(s.date)} (commit ${String(s.sha).slice(0, 8)}) : ${(s.echecs ?? []).join(', ')}.${suspects} Aucune préversion ne part avant une correction (une branche qui corrige, puis npm run fusionner). Détails : .git/coordination/train.txt.`;
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

/** Lance publier.mjs en recopiant sa sortie ; rend { code, out }. */
function publish(main, args, say, write) {
  return new Promise((resolve) => {
    say(`\n> node scripts/publier.mjs ${args.join(' ')} (dossier principal)`);
    const child = spawn(process.execPath, [path.join(main, 'scripts', 'publier.mjs'), ...args], { cwd: main, windowsHide: true });
    let out = '';
    const keep = (d) => {
      out += d;
      write(d);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

/**
 * Le train. Rend 0 si tout ce qu'il y avait à publier l'est (ou si un autre train s'en charge, ou s'il
 * n'y a rien à publier), 1 sinon (suite rouge, publication en échec, dossier principal occupé).
 */
export async function publishGrouped({ cwd = process.cwd(), say = console.log, write = (d) => process.stdout.write(d), publier = true } = {}) {
  const dir = coordinationDir(cwd);
  const main = mainDir(cwd);
  const leaderFile = path.join(dir, LEADER);
  const retryFile = path.join(dir, 'publication-a-reprendre.json');
  const release = tryLock(leaderFile, { branche: 'train', etat: 'attente', phase: 'attente' });
  if (!release) {
    say(`Le train tourne déjà (processus ${trainHolder(dir)?.pid ?? '?'}) : il emportera ces fusions.`);
    return 0;
  }
  // etat « publication » : le dossier principal ne doit pas bouger (lu aussi par les anciens fusionner.mjs).
  const setState = (etat, phase, extra = {}) => writeJson(leaderFile, { ...readJson(leaderFile, {}), etat, phase, pid: process.pid, maj: new Date().toISOString(), ...extra });
  const mergeNow = () => {
    setState('publication', 'fusion');
    const merged = mergeQueued(main, dir, say);
    setState('attente', 'attente');
    return merged;
  };
  try {
    for (let round = 1; round <= 6; round++) {
      // 1. Fusions, et attente (2 min au plus) des branches sur le point d'arriver.
      const start = Date.now();
      let last = '';
      let capped = false;
      for (;;) {
        mergeNow();
        const busy = mainBusy(main);
        const fabrication = lockHolder(path.join(main, 'release', '.fabrication.lock'));
        if (busy && !fabrication && Date.now() - start > OCCUPE_MAX_MS) {
          say(`Train arrêté : ${busy} depuis ${OCCUPE_MAX_MS / 60_000} min. Les branches restent en file ; npm run publication-groupee le relance.`);
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
        await sleep(10_000);
      }
      if (!publier) {
        say('Fusions faites ; publication non demandée (--sans-publier).');
        return 0;
      }
      const pending = pendingCommits(main);
      const previous = readJson(retryFile);
      const before = git(['rev-parse', 'HEAD'], main);
      const retry = previous?.head === before;
      const leger = readJson(legerFile(dir), []);
      const plan = publicationPlan({ pending, retry, leger: leger.length > 0 || (retry && previous.leger) });
      if (!plan) {
        say(round === 1 ? 'Rien de neuf sur proto/ecrans depuis la dernière préversion : rien à publier.' : 'Plus rien de neuf : train terminé.');
        return 0;
      }
      // 2. Suite complète sur proto/ecrans, une fois pour tout le lot.
      const state = readTrainState(dir);
      if (state.etat === 'vert' && state.sha === before) {
        say('Suite complète déjà verte sur ce commit.');
      } else {
        const expected = expectedSuiteMs(readDurations(dir));
        setState('publication', 'verification', { finPrevue: new Date(Date.now() + expected).toISOString() });
        say(`Suite complète sur ${BASE} (${before.slice(0, 8)}, ${pending} commit(s) à publier), fin prévue vers ${hhmm(Date.now() + expected)}.`);
        const { runAvantFusion } = await import('./avant-fusion.mjs');
        const result = await runAvantFusion({ cwd: main, say, complete: true, train: true });
        if (!result.ok) {
          // Suspectes : les fusions depuis la dernière suite verte, sinon depuis la dernière préversion.
          const lastVersion = git(['log', '-1', '--format=%cI', '--extended-regexp', '--grep=^Version [0-9]', BASE], main);
          const since = (state.etat === 'vert' ? state.date : state.dernierVert) ?? (lastVersion ? new Date(lastVersion).toISOString() : undefined);
          const { suspects, certain } = await suspectsFor(result.failures, main, dir, since);
          writeTrainState(dir, { etat: 'rouge', sha: before, echecs: result.failures, suspects, suspectsCertains: certain, dernierVert: since });
          say(`\n${trainStatus(dir)}`);
          // Les branches arrivées pendant la suite sont fusionnées : la correction pourra les suivre.
          mergeNow();
          return 1;
        }
        writeTrainState(dir, { etat: 'vert', sha: before });
      }
      // 3. Publication.
      setState('publication', 'fabrication', { finPrevue: new Date(Date.now() + 10 * 60_000).toISOString() });
      let args = plan.args;
      say(`Publication : ${pending} commit(s) de proto/ecrans${leger.length ? ` ; publication légère demandée par ${leger.join(', ')}` : ''}.`);
      if (plan.reprendre) say('Reprise de la préversion interrompue, sans changer son numéro.');
      let result = await publish(main, args, say, write);
      if (result.code !== 0 && args[0] === '--rapide' && /le socle a changé/.test(result.out)) {
        say('Le socle a changé : reprise en publication légère (installeurs refaits).');
        args = publicationPlan({ pending, retry, leger: true }).args;
        result = await publish(main, args, say, write);
      }
      if (result.code !== 0) {
        const interrupted = publicationRetry({ before, head: git(['rev-parse', 'HEAD'], main), subject: git(['log', '-1', '--format=%s'], main), reprendre: plan.reprendre, leger: args[0] === '--leger' });
        if (interrupted) writeJson(retryFile, interrupted);
        writeTrainState(dir, { ...readTrainState(dir), publication: 'echec' });
        say('\nPublication en échec : voir la sortie ci-dessus. npm run publication-groupee la relance telle quelle.');
        return 1;
      }
      fs.rmSync(retryFile, { force: true });
      // Le commit « Version … » est celui de la suite verte plus le numéro : il reste vert.
      writeTrainState(dir, { etat: 'vert', sha: git(['rev-parse', 'HEAD'], main) });
      if (leger.length) writeJson(legerFile(dir), readJson(legerFile(dir), []).filter((b) => !leger.includes(b)));
      say(`Préversion publiée (${git(['log', '-1', '--format=%s', BASE], main)}).`);
    }
    return 0;
  } finally {
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
