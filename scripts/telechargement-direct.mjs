// Téléchargement direct de la dernière version, en tête de README.md et README.fr.md :
// https://github.com/<dépôt>/releases/latest/download/<fichier> mène tout droit au fichier de la
// dernière version finale (GitHub ne donne jamais une préversion pour « latest »). Le lien ne
// change jamais ; il ne marche que si chaque version finale porte ses installeurs sous ces noms.
//   - npm test (scripts/traductions.mjs) : les deux README donnent ces liens, et aucun lien vers
//     une version précise qui vieillirait (releases/download/v…) ;
//   - scripts/publier.mjs : une version finale sans ses deux installeurs est refusée (--rapide,
//     --leger), et les liens sont vérifiés une fois la version publiée.

import * as fs from 'node:fs';
import * as path from 'node:path';

/** Les installeurs que donne le téléchargement direct, dans l'ordre des README. */
export const DIRECT_DOWNLOADS = ['CyberPinball-Setup.exe', 'CyberPinball-Setup-complet.exe'];

export const READMES = ['README.md', 'README.fr.md'];

export function directDownloadUrl(repository, name) {
  return `https://github.com/${repository}/releases/latest/download/${name}`;
}

/** Dépôt GitHub de package.json (« gocode/cyberpinball »). */
export function repositoryOf(pkg) {
  return /github\.com\/([^/]+\/[^/.]+)/.exec(pkg.repository?.url ?? '')?.[1];
}

/** Écarts des README : lien direct manquant, ou lien figé sur une version. */
export function readmeDownloadProblems(repo) {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  const repository = repositoryOf(pkg);
  if (!repository) return ['package.json : pas de dépôt GitHub (repository.url), liens de téléchargement direct invérifiables'];
  const problems = [];
  for (const file of READMES) {
    const text = fs.readFileSync(path.join(repo, file), 'utf8');
    for (const name of DIRECT_DOWNLOADS) {
      if (!text.includes(`](${directDownloadUrl(repository, name)})`)) problems.push(`${file} : pas de lien de téléchargement direct vers ${name} (${directDownloadUrl(repository, name)})`);
    }
    for (const m of text.matchAll(/releases\/download\/v[^/)\s]+\/[^)\s]+/g)) problems.push(`${file} : lien figé sur une version (${m[0]}), qui vieillira : prendre releases/latest/download/…`);
  }
  return problems;
}

/**
 * Après la publication d'une version finale : chaque lien direct mène-t-il bien à son fichier
 * dans cette version ? Réponse : [] si oui, sinon les écarts. GitHub met « latest » à jour avec
 * quelques secondes de retard : relu jusqu'à une minute.
 */
export async function directDownloadProblems(repository, version, { attempts = 12, wait = 5000 } = {}) {
  let problems = [];
  for (let attempt = 0; attempt < attempts; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, wait));
    problems = [];
    for (const name of DIRECT_DOWNLOADS) {
      const url = directDownloadUrl(repository, name);
      const res = await fetch(url, { method: 'HEAD', redirect: 'manual' }).catch((error) => error);
      if (res instanceof Error) problems.push(`${name} : ${res.message}`);
      else {
        const location = res.headers.get('location') ?? '';
        if (!location.includes(`/releases/download/v${version}/${name}`)) problems.push(`${name} : HTTP ${res.status}${location ? `, mène à ${location}` : ''}, pas à la version ${version}`);
      }
    }
    if (!problems.length) break;
  }
  return problems;
}
