// Publication groupée des préversions d'essai : une préversion emporte toutes les fusions faites
// depuis la précédente, et attend celles qui sont sur le point d'arriver.
//   npm run publication-groupee          (lancé d'office par npm run fusionner)
//
// Règles :
// - Une seule publication groupée à la fois (chef-publication.lock du dossier de coordination). Une
//   fusion qui arrive pendant qu'elle attend est emportée par elle : la session n'a rien d'autre à faire.
// - Avant de publier, elle attend chaque branche annoncée dans la file (scripts/coordination.mjs) dont
//   la fusion est prévue dans les 10 minutes (suite de tests en cours, suite verte en attente de
//   fusion, intégration…). Une branche en retard de plus de 5 minutes sur sa fin prévue n'est plus
//   attendue ; l'attente totale ne dépasse pas 20 minutes.
// - Rien de neuf sur proto/ecrans depuis le dernier commit « Version … » : rien à publier.
// - `node scripts/publier.mjs --rapide --essai` depuis le dossier principal ; si le socle a changé
//   (Electron, exécutable), elle reprend d'elle-même avec `--leger --essai`.
// - Des fusions arrivées pendant la publication : elle recommence (une préversion de plus).
//
// Pourquoi : une préversion par fusion faisait 63 publications en trois jours (21/11/2026), chacune
// déplaçant proto/ecrans sous les sessions en cours et tenant le verrou de fabrication 4 à 5 minutes.

import { spawn } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE, IMMINENT_MS, coordinationDir, currentBranch, git, imminent, lockHolder, mainDir, readJson, readQueue, sleep, tryLock, writeJson,
} from './coordination.mjs';

export const ATTENTE_MAX_MS = 20 * 60_000;
export const RETARD_MAX_MS = 5 * 60_000;
const hhmm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });

/** Commits de proto/ecrans pas encore publiés (depuis le dernier « Version … »). */
export function pendingCommits(cwd) {
  const last = git(['log', '-1', '--format=%H', '--extended-regexp', '--grep=^Version [0-9]', BASE], cwd);
  if (!last) return 0;
  return Number(git(['rev-list', '--count', `${last}..${BASE}`], cwd));
}

/** Les branches à attendre : fusion prévue dans l'horizon, pas en retard de plus de RETARD_MAX_MS. */
export function worthWaiting(entries, { now = Date.now(), except } = {}) {
  return imminent(entries, { now, horizon: IMMINENT_MS, except }).filter((e) => Date.parse(e.finPrevue) >= now - RETARD_MAX_MS);
}

function legerFile(dir) {
  return path.join(dir, 'leger-demande.json');
}

/** Une branche fusionnée qui demande une publication complète légère (Electron ou exécutable changés). */
export function requestLeger(branche, dir = coordinationDir()) {
  const list = readJson(legerFile(dir), []);
  if (!list.includes(branche)) writeJson(legerFile(dir), [...list, branche]);
}

/** Lance publier.mjs en recopiant sa sortie ; rend { code, out }. */
function publish(main, args, say) {
  return new Promise((resolve) => {
    say(`\n> node scripts/publier.mjs ${args.join(' ')} (dossier principal)`);
    const child = spawn(process.execPath, [path.join(main, 'scripts', 'publier.mjs'), ...args], { cwd: main, windowsHide: true });
    let out = '';
    const keep = (d) => {
      out += d;
      process.stdout.write(d);
    };
    child.stdout.on('data', keep);
    child.stderr.on('data', keep);
    child.on('close', (code) => resolve({ code: code ?? 1, out }));
  });
}

/**
 * La publication groupée. Rend 0 si la préversion est partie (ou si une autre publication groupée
 * emporte ces fusions, ou s'il n'y a rien à publier), 1 sinon.
 */
export async function publishGrouped({ cwd = process.cwd(), say = console.log, branche } = {}) {
  const dir = coordinationDir(cwd);
  const main = mainDir(cwd);
  const me = branche ?? currentBranch(cwd);
  const leaderFile = path.join(dir, 'chef-publication.lock');
  let release;
  // Une autre publication groupée en attente emporte nos fusions ; si elle est déjà en train de
  // publier, on attend sa fin pour reprendre la main (ce qu'elle publie ne contient peut-être pas tout).
  for (;;) {
    release = tryLock(leaderFile, { branche: me, etat: 'attente' });
    if (release) break;
    const holder = lockHolder(leaderFile);
    if (holder?.etat === 'attente') {
      say(`Publication groupée déjà en attente (menée depuis ${holder.branche ?? '?'}) : elle emportera cette fusion. Rien d'autre à faire.`);
      return 0;
    }
    await sleep(10_000);
  }
  const setState = (etat) => writeJson(leaderFile, { ...readJson(leaderFile, {}), etat, pid: process.pid });
  try {
    for (let round = 1; round <= 4; round++) {
      setState('attente');
      const start = Date.now();
      let last = '';
      for (;;) {
        const waiting = worthWaiting(readQueue(dir), { except: me });
        const fabrication = lockHolder(path.join(main, 'release', '.fabrication.lock'));
        if (!waiting.length && !fabrication) break;
        if (Date.now() - start > ATTENTE_MAX_MS) {
          say(`Attente plafonnée à ${ATTENTE_MAX_MS / 60_000} min : publication sans ${waiting.map((e) => e.branche).join(', ')}.`);
          break;
        }
        const what = fabrication ? `une fabrication en cours (processus ${fabrication.pid})` : waiting.map((e) => `${e.branche} (${e.etape}, fusion prévue vers ${hhmm(e.finPrevue)})`).join(', ');
        if (what !== last) say(`Publication groupée : j'attends ${what}.`);
        last = what;
        await sleep(15_000);
      }
      const pending = pendingCommits(main);
      if (!pending) {
        say(round === 1 ? 'Rien de neuf sur proto/ecrans depuis la dernière préversion : rien à publier.' : 'Plus rien de neuf : publication groupée terminée.');
        return 0;
      }
      setState('publication');
      const leger = readJson(legerFile(dir), []);
      let args = leger.length ? ['--leger', '--essai'] : ['--rapide', '--essai'];
      say(`Publication groupée : ${pending} commit(s) de proto/ecrans à publier${leger.length ? ` ; publication légère demandée par ${leger.join(', ')}` : ''}.`);
      let result = await publish(main, args, say);
      if (result.code !== 0 && args[0] === '--rapide' && /le socle a changé/.test(result.out)) {
        say('Le socle a changé : reprise en publication légère (installeurs refaits).');
        args = ['--leger', '--essai'];
        result = await publish(main, args, say);
      }
      if (result.code !== 0) {
        say('\nPublication groupée en échec : voir la sortie ci-dessus. Elle se relance telle quelle par npm run publication-groupee.');
        return 1;
      }
      if (leger.length) writeJson(legerFile(dir), readJson(legerFile(dir), []).filter((b) => !leger.includes(b)));
      say(`Préversion publiée (${git(['log', '-1', '--format=%s', BASE], main)}).`);
    }
    return 0;
  } finally {
    release();
  }
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await publishGrouped());
}
