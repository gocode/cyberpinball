// Fin de branche en une commande, depuis le worktree de la branche :
//   npm run fusionner                 -> vérifie la branche, la confie au train (fusion puis préversion)
//   npm run fusionner -- --leger      -> idem, la préversion refait les installeurs (Electron ou exécutable changés)
//   npm run fusionner -- --sans-publier
//
// Étapes, sans rien taper à la main :
// 1. Arbre propre exigé (tout est commité).
// 2. Intégration de proto/ecrans dans la branche ; npm ci si le lockfile a changé. Conflit : arrêt,
//    la session le résout, commite et relance.
// 3. Vérification de branche : contrôles express et tests lents touchés par la branche
//    (scripts/avant-fusion.mjs). Si une vérification verte porte déjà sur le même travail (certificat),
//    seulement les contrôles sans tests et les tests touchés.
// 4. La branche, au commit vérifié, est confiée au train de fusion (scripts/publication-groupee.mjs),
//    lancé détaché s'il ne tourne pas : il la fusionne dans un candidat avec le reste du lot, passe la
//    suite complète une fois dessus, n'avance proto/ecrans que si elle est verte, puis publie la
//    préversion. Si la branche fait tomber le lot, elle est écartée avec sa cause (refus.json) et le
//    reste du lot part sans elle ; le refus s'affiche en tête de chaque npm run fusionner.
// 5. La commande attend le vrai résultat (jusqu'à 2 h) : fusionnée puis publiée (code 0), ou conflit, refus,
//    erreur, publication en échec (code 1). Lancée en arrière-plan, elle réveille la session à sa fin :
//    plus aucun blocage ne reste ignoré. Une note changements/*.md supprimée par une publication et retouchée
//    par la branche est résolue seule (scripts/conflit-notes.mjs).
//
// Pourquoi (23/11/2026) : chaque session passait la suite lente complète (11 à 22 min à plusieurs),
// attendait la fabrication pour fusionner, puis la publication : 25 à 40 min pour une petite
// modification, et une session IA qui attend tout ce temps.

import { spawnSync } from 'node:child_process';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE, DUREE_FUSION_MS, REPO, announce, coordinationDir, currentBranch, git, mainDir, readCertificate, recentFlaky, sleep, withdraw, workFingerprint,
} from './coordination.mjs';
import { printControles, rerunAlone, run, runControles } from './controles.mjs';
import { failedFiles, shortReport } from './sortie-tests.mjs';
import { runAvantFusion } from './avant-fusion.mjs';
import { resoudreNotesSupprimees } from './conflit-notes.mjs';
import { bloqueesStatus, dropMerge, enqueueMerge, launchTrain, readMergeQueue, readTrainState, refusBrief, refusStatus, readRefus, requestLeger, trainHolder, trainStatus } from './publication-groupee.mjs';

const iso = (ms) => new Date(ms).toISOString();
const hhmm = (d) => new Date(d).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit' });
/** Attente de la fusion par le train quand il est libre ; au-delà, la session s'arrête sur « en file ». */
const ATTENTE_FUSION_MS = 3 * 60_000;
/** Durée maximale du suivi (file, fusion, publication) : au-delà, le processus rend la main en le disant. */
const SUIVI_MAX_MS = 120 * 60_000;

const isAncestor = (sha, ref, cwd) => spawnSync('git', ['merge-base', '--is-ancestor', sha, ref], { cwd, windowsHide: true }).status === 0;

/**
 * Vérifie la branche (intégration de proto/ecrans comprise). Rend le commit vérifié (sha), ou false. Ce commit est
 * celui qui est confié au train : fixé avant les tests, il est relu à la fin ; un commit fait pendant la vérification
 * n'est jamais confié sans avoir été vu (26/11/2026).
 */
async function verifier({ cwd, dir, branche, say }) {
  announce({ branche, etape: 'integration', finPrevue: iso(Date.now() + DUREE_FUSION_MS) }, dir);
  const before = git(['rev-parse', 'HEAD'], cwd);
  const merge = await run('git', ['merge', '--no-edit', BASE], { cwd });
  if (merge.code !== 0 && !resoudreNotesSupprimees(cwd, { say }).resolu) {
    const conflicts = git(['diff', '--name-only', '--diff-filter=U'], cwd);
    say(`Conflit en intégrant ${BASE} :\n${conflicts.split('\n').map((f) => `  - ${f}`).join('\n')}\nRésous, commite (git commit --no-edit), puis relance npm run fusionner.`);
    return false;
  }
  const after = git(['rev-parse', 'HEAD'], cwd);
  if (before !== after) {
    say(`${BASE} intégré (${git(['log', '-1', '--format=%s', BASE], cwd)}).`);
    const changed = git(['diff', '--name-only', before, after], cwd).split('\n');
    if (changed.includes('package-lock.json')) {
      say('Le lockfile a changé : npm ci…');
      const npmArgs = ['ci', '--prefer-offline', '--no-audit', '--no-fund'];
      // Sous npm run, npm_execpath désigne npm-cli.js : pas de shell. Sinon, npm par le shell (npm.cmd).
      const ci = process.env.npm_execpath
        ? await run(process.execPath, [process.env.npm_execpath, ...npmArgs], { cwd, log: path.join(cwd, 'tmp', 'fusionner-npm-ci.txt') })
        : await run('npm', npmArgs, { cwd, log: path.join(cwd, 'tmp', 'fusionner-npm-ci.txt'), shell: true });
      if (ci.code !== 0) {
        say('npm ci a échoué : voir tmp/fusionner-npm-ci.txt.');
        return false;
      }
    }
  }
  const cert = readCertificate(branche, dir);
  const head = git(['rev-parse', 'HEAD'], cwd);
  if (cert && cert.head === head) {
    say('Vérification verte sur ce commit même : rien à revérifier.');
    return head;
  }
  if (cert && cert.empreinte === workFingerprint(cwd)) {
    // Le travail est celui de la vérification verte ; seul proto/ecrans a changé : contrôles sans
    // tests, puis les tests touchés par la branche.
    say('Vérification déjà verte pour ce travail : contrôles sans tests, puis les tests touchés par la branche.');
    const controles = await runControles({ cwd, say, tests: false });
    printControles(controles, say);
    if (!controles.ok) return false;
    const touched = await run(process.execPath, [path.join(cwd, 'scripts', 'verifier.mjs'), '--sans-build', '--modifies'], { cwd, log: path.join(cwd, 'tmp', 'fusionner-touches.txt'), timeoutMs: 15 * 60_000 });
    const stable = () => git(['rev-parse', 'HEAD'], cwd) === head;
    if (touched.code === 0) return stable() ? head : false;
    // Relance à part des seuls fichiers en échec, jamais une suite complète.
    const failing = [...new Set([...failedFiles(touched.out), ...touched.hung])];
    if (!failing.length) {
      say('Tests touchés en échec sans fichier identifiable (tmp/fusionner-touches.txt).');
      return false;
    }
    const { failures } = await rerunAlone(failing, { cwd, say, prefix: 'fusionner-relance' });
    if (failures.length) {
      say(`Échecs confirmés :\n${failures.map((f) => `  ${f.file}\n${shortReport(f.details, 6)}`).join('\n')}`);
      return false;
    }
    return stable() ? head : false;
  }
  if (cert) say('Le travail a changé depuis la dernière vérification verte : nouvelle vérification.');
  const result = await runAvantFusion({ cwd, say });
  if (!result.ok) return false;
  // Le commit certifié est celui du début de la vérification ; s'il a bougé depuis, rien n'est confié.
  return git(['rev-parse', 'HEAD'], cwd) === result.head ? result.head : false;
}

/**
 * La branche est en file : le train est lancé s'il ne tourne pas, puis la session attend la fusion,
 * tant que le train est libre et au plus ATTENTE_FUSION_MS. Rend le code de sortie.
 */
export async function confier({ dir, main, branche, head, say, publier = true, wait = ATTENTE_FUSION_MS, suivi = SUIVI_MAX_MS, pas = 3000 }) {
  const started = Date.now();
  let launches = 0;
  let lastLaunch = 0;
  let toldOld = false;
  let toldQueue = false;
  let lastNews = started;
  let fusionneeA = 0;
  for (;;) {
    const entry = readMergeQueue(dir).find((e) => e.branche === branche);
    if (entry?.etat === 'conflit') {
      dropMerge(branche, dir);
      say(`Conflit avec ce qui vient d'arriver sur ${BASE} : ${(entry.fichiers ?? []).join(', ')}. Rien n'a été fusionné : relance npm run fusionner (il intègre ${BASE}, tu résous, tu commites, tu relances).`);
      return 1;
    }
    if (entry?.etat === 'refusee') {
      dropMerge(branche, dir);
      const refus = readRefus(dir).find((r) => r.branche === branche);
      say(`Le train a ÉCARTÉ cette branche : sa suite complète tombe avec son travail (le lot sans elle passe). Rien n'a été fusionné.\n${refus ? refusBrief(refus) : (entry.fichiers ?? []).join(', ')}\nCorrige la cause, commite, relance npm run fusionner. Le refus reste affiché en tête de chaque npm run fusionner (et par npm run refus) tant que la branche n'est pas reconfiée.`);
      return 1;
    }
    if (entry?.etat === 'erreur') {
      dropMerge(branche, dir);
      say(`Le train n'a pas pu fusionner la branche :\n${entry.message ?? '?'}`);
      return 1;
    }
    if (!entry && isAncestor(head, BASE, main)) {
      if (!fusionneeA) {
        fusionneeA = Date.now();
        say(`Fusionnée dans ${BASE} (${git(['log', '-1', '--format=%h %s', BASE], main)}), après une suite complète verte sur le lot.`);
        if (!publier) {
          say('Le train a fini (--sans-publier). Rien d\'autre à faire ici.');
          return 0;
        }
        say('J\'attends la fin de la publication de la préversion pour te dire si elle est en ligne (journal : .git/coordination/train.txt).');
      }
      // Le suivi va jusqu'au bout : fusionnée ne suffit pas, la branche n'est utile que publiée (27/11/2026).
      if (trainHolder(dir) && Date.now() - started < suivi) {
        await sleep(pas);
        continue;
      }
      const etat = readTrainState(dir);
      if (etat.publication === 'echec' && Date.parse(etat.date) >= fusionneeA - 60_000) {
        say(`La publication de la préversion a ÉCHOUÉ après la fusion de ${branche} (la branche, elle, est bien dans ${BASE}). Lance npm run publication-groupee depuis le dossier principal ; journal : .git/coordination/train.txt.`);
        return 1;
      }
      say(trainHolder(dir) ? `Le train tourne encore après ${Math.round(suivi / 60_000)} min : la branche est fusionnée, je n'attends pas plus (journal : .git/coordination/train.txt).` : 'Le train a fini : la préversion contenant cette branche est publiée. Rien d\'autre à faire ici.');
      return 0;
    }
    if (!entry) {
      say(`La branche n'est plus dans la file du train mais ${head.slice(0, 8)} n'est pas dans ${BASE} : relance npm run fusionner.`);
      return 1;
    }
    const holder = trainHolder(dir);
    if (!holder) {
      // Pas de train (ou il vient de finir sans voir cette branche) : on le lance, deux fois au plus.
      if (Date.now() - lastLaunch > 20_000) {
        if (launches >= 2) {
          say('Le train ne démarre pas : la branche reste en file. Lance npm run publication-groupee depuis le dossier principal, puis regarde .git/coordination/train.txt.');
          return 1;
        }
        const pid = launchTrain(main, { args: publier ? [] : ['--sans-publier'], dir });
        say(`Train lancé (processus ${pid}, détaché : il continue sans cette session).`);
        launches++;
        lastLaunch = Date.now();
      }
    } else if (!holder.phase) {
      // Publication groupée d'avant le train (sans file des fusions) : sa fin, puis le train.
      if (!toldOld) say(`Une publication groupée d'avant le train tourne (processus ${holder.pid}) : j'attends sa fin pour lancer le train.`);
      toldOld = true;
    } else if (['verification', 'recherche', 'fabrication'].includes(holder.phase) || Date.now() - started > wait) {
      const fin = holder.finPrevue ? `, fin prévue vers ${hhmm(holder.finPrevue)}` : '';
      const phase = { verification: 'suite complète du lot en cours', recherche: 'recherche de la branche qui fait tomber le lot', fabrication: 'fabrication de la préversion' }[holder.phase] ?? holder.phase ?? '?';
      // Le processus reste là jusqu'au vrai résultat (fusionnée et publiée, conflit, refus, erreur) : lancé en arrière-plan,
      // il réveille la session à sa fin. Avant : « En file », code 0, et personne n'apprenait un blocage (27/11/2026).
      if (!toldQueue) {
        toldQueue = true;
        say(`En file : le train est occupé (${phase}${fin}). Il fusionnera ${branche} (${head.slice(0, 8)}) dans le lot suivant, une fois la suite verte${publier ? ', puis la publiera' : ''}. Si le lot tombe à cause de cette branche, elle sera écartée avec sa cause ; les autres partent sans elle. J'attends le résultat ici et je le dirai : ne recommite pas sur cette branche d'ici là.`);
      } else if (Date.now() - lastNews > 10 * 60_000) {
        lastNews = Date.now();
        say(`Toujours en file (${phase}${fin}).`);
      }
      if (Date.now() - started > suivi) {
        say(`En file depuis ${Math.round(suivi / 60_000)} min : j'arrête d'attendre. Le train garde la branche ; vérifie .git/coordination/train.txt, ou relance npm run fusionner.`);
        return 0;
      }
    }
    await sleep(pas);
  }
}

/**
 * Les tests qui tombent le plus en ce moment (instables.json, 7 derniers jours), dits avant tout : une session voit
 * venir celui qui ralentira le train, et peut s'en charger (26/11/2026).
 */
export function flakyLine(recent) {
  if (!recent.length) return '';
  return `Tests instables des 7 derniers jours (tombés dans la suite complète, passés seuls) : ${recent.map((e) => `${e.test} (${e.fois} fois)`).join(', ')}.`;
}

export async function fusionner({ cwd = REPO, say = console.log, leger = false, publier = true } = {}) {
  const dir = coordinationDir(cwd);
  const main = mainDir(cwd);
  const branche = currentBranch(cwd);
  if (!branche || branche === BASE || path.resolve(cwd) === path.resolve(main)) {
    say(`Lance npm run fusionner depuis le worktree de la branche à fusionner (ici : ${branche || 'HEAD détachée'}, ${cwd}).`);
    return 1;
  }
  if (git(['status', '--porcelain', '--untracked-files=no'], cwd)) {
    say('Des modifications ne sont pas commitées : commite-les (ou mets-les de côté), puis relance.');
    return 1;
  }
  const flaky = flakyLine(recentFlaky(dir));
  if (flaky) say(`${flaky}\n`);
  const refuses = refusStatus(dir);
  if (refuses) say(`${refuses}\n`);
  const bloquees = bloqueesStatus(dir);
  if (bloquees) say(`${bloquees}\n`);
  const status = trainStatus(dir);
  if (status) say(`${status}\n`);
  const previous = readMergeQueue(dir).find((e) => e.branche === branche);
  if (previous?.etat === 'en-file' && previous.head === git(['rev-parse', 'HEAD'], cwd)) {
    say('Cette branche est déjà dans la file du train, à ce commit.');
    return confier({ dir, main, branche, head: previous.head, say, publier });
  }
  if (previous) dropMerge(branche, dir);
  let head;
  try {
    head = await verifier({ cwd, dir, branche, say });
    withdraw(branche, dir);
    if (!head) {
      say('Rien n\'est confié au train : la vérification a échoué, ou le travail a bougé pendant qu\'elle tournait (relance npm run fusionner).');
      return 1;
    }
  } catch (error) {
    withdraw(branche, dir);
    throw error;
  }
  if (leger) requestLeger(branche, dir);
  enqueueMerge({ branche, head }, dir);
  say(`Vérifiée : ${branche} (${head.slice(0, 8)}) confiée au train de fusion.`);
  return confier({ dir, main, branche, head, say, publier });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await fusionner({ leger: process.argv.includes('--leger'), publier: !process.argv.includes('--sans-publier') }));
}
