// Fin de branche en une commande, depuis le worktree de la branche :
//   npm run fusionner                 -> vérifie, fusionne dans proto/ecrans, publie (groupé)
//   npm run fusionner -- --leger      -> idem, la préversion refait les installeurs (Electron ou exécutable changés)
//   npm run fusionner -- --sans-publier
//
// Étapes, sans rien taper à la main :
// 1. Arbre propre exigé (tout est commité).
// 2. Intégration de proto/ecrans dans la branche ; npm ci si le lockfile a changé. Conflit : arrêt,
//    la session le résout, commite et relance.
// 3. Tests : si la dernière suite complète verte de la branche porte sur le même travail (certificat
//    d'avant-fusion), seulement les contrôles express et les tests lents touchés par la branche ;
//    sinon la vérification complète (scripts/avant-fusion.mjs).
// 4. Attente de la voie libre dans le dossier principal : pas de fabrication ni de publication en
//    cours, pas de fusion à moitié faite (MERGE_HEAD), arbre propre, sur proto/ecrans.
// 5. git merge --ff-only. Si proto/ecrans a bougé entre-temps : retour à l'étape 2, d'office.
// 6. Publication groupée (scripts/publication-groupee.mjs) : elle attend les fusions imminentes des
//    autres sessions, ou laisse celle déjà en attente emporter cette fusion.
//
// Pourquoi : chaque session réécrivait ces étapes en longues commandes PowerShell (erreurs de syntaxe,
// « Not possible to fast-forward », verrou oublié, suite complète relancée après chaque intégration).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BASE, DUREE_FUSION_MS, REPO, announce, coordinationDir, currentBranch, git, lockHolder, mainDir, readCertificate, sleep, withdraw, workFingerprint,
} from './coordination.mjs';
import { printControles, rerunAlone, run, runControles } from './controles.mjs';
import { failedFiles, shortReport } from './sortie-tests.mjs';
import { runAvantFusion } from './avant-fusion.mjs';
import { publishGrouped, requestLeger } from './publication-groupee.mjs';

const iso = (ms) => new Date(ms).toISOString();
const VOIE_LIBRE_MAX_MS = 30 * 60_000;

/** Ce qui empêche de fusionner dans le dossier principal maintenant (texte), ou undefined. */
export function mainBlocker(main, dir) {
  const fabrication = lockHolder(path.join(main, 'release', '.fabrication.lock'));
  if (fabrication) return `publication en cours de fabrication (processus ${fabrication.pid})`;
  const chef = lockHolder(path.join(dir, 'chef-publication.lock'));
  if (chef?.etat === 'publication') return `publication groupée en cours (${chef.branche ?? '?'})`;
  if (fs.existsSync(path.join(main, '.git', 'MERGE_HEAD'))) return 'une fusion à moitié faite dans le dossier principal (MERGE_HEAD)';
  if (currentBranch(main) !== BASE) return `le dossier principal n'est pas sur ${BASE}`;
  if (git(['status', '--porcelain', '--untracked-files=no'], main)) return 'des modifications non commitées dans le dossier principal';
  return undefined;
}

export async function fusionner({ cwd = REPO, say = console.log, leger = false, publier = true } = {}) {
  const dir = coordinationDir(cwd);
  const main = mainDir(cwd);
  const branche = currentBranch(cwd);
  if (!branche || branche === BASE || path.resolve(cwd) === path.resolve(main)) {
    say(`Lancez npm run fusionner depuis le worktree de la branche à fusionner (ici : ${branche || 'HEAD détachée'}, ${cwd}).`);
    return 1;
  }
  if (git(['status', '--porcelain', '--untracked-files=no'], cwd)) {
    say('Des modifications ne sont pas commitées : commitez-les (ou mettez-les de côté), puis relancez.');
    return 1;
  }
  try {
    for (let round = 1; round <= 5; round++) {
      announce({ branche, etape: 'integration', finPrevue: iso(Date.now() + DUREE_FUSION_MS) }, dir);
      // 2. Intégration de proto/ecrans.
      const before = git(['rev-parse', 'HEAD'], cwd);
      const merge = await run('git', ['merge', '--no-edit', BASE], { cwd });
      if (merge.code !== 0) {
        const conflicts = git(['diff', '--name-only', '--diff-filter=U'], cwd);
        say(`Conflit en intégrant ${BASE} :\n${conflicts.split('\n').map((f) => `  - ${f}`).join('\n')}\nRésolvez, commitez (git commit --no-edit), puis relancez npm run fusionner.`);
        withdraw(branche, dir);
        return 1;
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
            withdraw(branche, dir);
            return 1;
          }
        }
      }
      // 3. Tests.
      const cert = readCertificate(branche, dir);
      const head = git(['rev-parse', 'HEAD'], cwd);
      if (cert && cert.head === head) {
        say('Suite complète verte sur ce commit même : rien à revérifier.');
      } else if (cert && cert.empreinte === workFingerprint(cwd)) {
        // Le travail est celui de la suite verte ; seul proto/ecrans a changé. Pas de nouvelle passe
        // complète (21/11/2026 : refaire les 360 fichiers rapides à chaque fusion, hors verrou,
        // prenait 8 minutes sur une machine chargée) : contrôles sans tests, puis les tests touchés.
        say('Suite complète déjà verte pour ce travail : contrôles sans tests, puis les tests touchés par la branche.');
        const controles = await runControles({ cwd, say, tests: false });
        printControles(controles, say);
        if (!controles.ok) {
          withdraw(branche, dir);
          return 1;
        }
        const touched = await run(process.execPath, [path.join(cwd, 'scripts', 'verifier.mjs'), '--sans-build', '--modifies'], { cwd, log: path.join(cwd, 'tmp', 'fusionner-touches.txt'), timeoutMs: 15 * 60_000 });
        if (touched.code !== 0) {
          // Relance à part des seuls fichiers en échec, jamais une suite complète : le 21/11/2026,
          // telecommande (instable connu) relançait 11 puis 8 minutes de suite à chaque réintégration.
          const failing = [...new Set([...failedFiles(touched.out), ...touched.hung])];
          if (!failing.length) {
            say('Tests touchés en échec sans fichier identifiable (tmp/fusionner-touches.txt).');
            withdraw(branche, dir);
            return 1;
          }
          const { failures } = await rerunAlone(failing, { cwd, say, prefix: 'fusionner-relance' });
          if (failures.length) {
            say(`Échecs confirmés :\n${failures.map((f) => `  ${f.file}\n${shortReport(f.details, 6)}`).join('\n')}`);
            withdraw(branche, dir);
            return 1;
          }
        }
      } else {
        if (cert) say('Le travail a changé depuis la dernière suite verte : vérification complète.');
        const full = await runAvantFusion({ cwd, say });
        if (!full.ok) return 1;
      }
      announce({ branche, etape: 'attente-verrou', finPrevue: iso(Date.now() + 60_000) }, dir);
      // 4. Voie libre dans le dossier principal.
      const waitStart = Date.now();
      let last;
      for (;;) {
        const blocker = mainBlocker(main, dir);
        if (!blocker) break;
        if (Date.now() - waitStart > VOIE_LIBRE_MAX_MS) {
          say(`Fusion impossible depuis ${VOIE_LIBRE_MAX_MS / 60_000} min : ${blocker}. Rien n'a été fusionné.`);
          withdraw(branche, dir);
          return 1;
        }
        if (blocker !== last) say(`J'attends : ${blocker}.`);
        last = blocker;
        // Toujours annoncée comme imminente : la publication groupée qui suit l'attendra.
        announce({ branche, etape: 'attente-verrou', finPrevue: iso(Date.now() + 60_000) }, dir);
        await sleep(10_000);
      }
      // 5. Fusion.
      const ff = await run('git', ['merge', '--ff-only', branche], { cwd: main });
      if (ff.code === 0) {
        announce({ branche, etape: 'fusionnee', finPrevue: iso(Date.now()) }, dir);
        say(`Fusionnée dans ${BASE} : ${git(['log', '-1', '--format=%h %s', BASE], main)}.`);
        break;
      }
      if (round === 5) {
        say(`${BASE} bouge sans cesse : fusion abandonnée après 5 essais.\n${ff.out.trim()}`);
        withdraw(branche, dir);
        return 1;
      }
      say(`${BASE} a bougé pendant la vérification : nouvelle intégration (essai ${round + 1}).`);
    }
  } catch (error) {
    withdraw(branche, dir);
    throw error;
  }
  // 6. Publication groupée.
  if (leger) requestLeger(branche, dir);
  withdraw(branche, dir);
  if (!publier) {
    say('Publication non lancée (--sans-publier) : la prochaine publication groupée emportera cette fusion.');
    return 0;
  }
  return publishGrouped({ cwd, say, branche });
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(await fusionner({ leger: process.argv.includes('--leger'), publier: !process.argv.includes('--sans-publier') }));
}
