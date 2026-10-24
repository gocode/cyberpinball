// Envoie le code sur le dépôt public (github.com/gocode/cyberpinball) sans son historique :
// GitHub ne reçoit qu'un instantané par envoi, un commit dont l'arbre est celui du commit
// local, sans les documents de travail internes (isPrivate, scripts/audit-publication.mjs),
// et le parent le dernier instantané publié. L'historique détaillé (messages, auteurs,
// anciennes versions des fichiers) et les documents internes restent sur ce poste.
//   node scripts/envoyer-github.mjs [--message "<titre>"] [--source <commit>] [--essai]
//                                   [--nouvel-historique]
//     --essai             : prépare l'instantané et le vérifie, sans rien envoyer
//     --nouvel-historique : instantané sans parent, qui remplace tout l'historique public
//                           (envoi forcé, refusé si main a changé sur GitHub depuis sa lecture)
//
// Auteur des instantanés : l'adresse noreply de GitHub du compte, jamais une adresse personnelle.
// Le dernier instantané publié est gardé dans refs/publication/main (relu depuis GitHub à
// chaque envoi). Le contrôle de publication (scripts/audit-publication.mjs) passe avant :
// fichiers publiés et message de l'instantané.

import { execFileSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRepository, auditText, isPrivate } from './audit-publication.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const PUBLIC_REF = 'refs/publication/main';
/** Compte gocode (identifiant public 11645218) : adresse noreply de GitHub. */
export const PUBLIC_AUTHOR = { name: 'Go Code', email: '11645218+gocode@users.noreply.github.com' };

// Sortie lue, ou laissée à la console (stdio inherit : rien à lire).
const git = (args, opts = {}) => (execFileSync('git', args, { cwd: repo, encoding: 'utf8', ...opts }) ?? '').trim();

export function remoteUrl() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  return pkg.repository.url;
}

/** Arbre publié de `source` : le sien, sans les documents internes (index git temporaire). */
export function publicTree(source) {
  const index = path.join(os.tmpdir(), `cyberpinball-publication-${process.pid}.index`);
  const env = { ...process.env, GIT_INDEX_FILE: index };
  try {
    git(['read-tree', source], { env });
    const internal = git(['ls-files', '-z'], { env }).split('\0').filter((f) => f && isPrivate(f));
    if (internal.length) git(['update-index', '--force-remove', '-z', '--stdin'], { env, input: `${internal.join('\0')}\0` });
    return { tree: git(['write-tree'], { env }), internal };
  } finally {
    fs.rmSync(index, { force: true });
  }
}

/**
 * Prépare l'instantané de `source` au-dessus du dernier publié (sans parent avec
 * `newHistory`) et, sauf essai, l'envoie sur main. Renvoie son identifiant (celui du
 * dernier publié s'il n'y a rien de nouveau).
 */
export function snapshotAndPush({ message, source = 'HEAD', dryRun = false, newHistory = false } = {}) {
  if (git(['status', '--porcelain', '--untracked-files=no'])) throw new Error('des modifications ne sont pas enregistrées (git status) : l’instantané doit être celui d’un commit.');
  const audit = auditRepository();
  if (audit.problems.length) throw new Error(`le dépôt est public, à retirer d'abord :\n  ${audit.problems.join('\n  ')}`);

  const url = remoteUrl();
  console.log(`Dernier instantané publié : ${url} main`);
  git(['fetch', '--quiet', url, `+main:${PUBLIC_REF}`], { stdio: ['ignore', 'pipe', 'inherit'] });
  const parent = git(['rev-parse', PUBLIC_REF]);
  const { tree, internal } = publicTree(source);
  console.log(`Arbre publié : celui de ${git(['rev-parse', '--short', source])} sans ${internal.length} document${internal.length > 1 ? 's' : ''} interne${internal.length > 1 ? 's' : ''}.`);
  if (!newHistory && git(['rev-parse', `${parent}^{tree}`]) === tree) {
    console.log(`Rien de nouveau : ${parent.slice(0, 7)} a déjà ce contenu.`);
    return parent;
  }
  const title = message ?? `Cyber Pinball ${JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8')).version}`;
  const found = auditText(title);
  if (found.length) throw new Error(`message de l'instantané refusé : ${found.map((f) => f.what).join(', ')}`);
  const env = {
    ...process.env,
    GIT_AUTHOR_NAME: PUBLIC_AUTHOR.name,
    GIT_AUTHOR_EMAIL: PUBLIC_AUTHOR.email,
    GIT_COMMITTER_NAME: PUBLIC_AUTHOR.name,
    GIT_COMMITTER_EMAIL: PUBLIC_AUTHOR.email,
  };
  const snapshot = git(['commit-tree', tree, ...(newHistory ? [] : ['-p', parent]), '-m', title], { env });
  console.log(`Instantané ${snapshot.slice(0, 7)} : « ${title} », ${newHistory ? `sans parent : il remplace tout l'historique public (${parent.slice(0, 7)} et avant)` : `au-dessus de ${parent.slice(0, 7)}`}.`);
  if (dryRun) {
    console.log('Essai : rien n’est envoyé.');
    return snapshot;
  }
  // Remplacement : forcé, mais seulement si main est encore celui qu'on vient de lire.
  const push = newHistory ? ['push', `--force-with-lease=main:${parent}`, url, `${snapshot}:refs/heads/main`] : ['push', url, `${snapshot}:refs/heads/main`];
  git(push, { stdio: ['ignore', 'inherit', 'inherit'] });
  git(['update-ref', PUBLIC_REF, snapshot]);
  console.log(`Envoyé sur main : ${url.replace(/\.git$/, '')}/commit/${snapshot}`);
  return snapshot;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const argv = process.argv.slice(2);
  const option = (name) => (argv.includes(name) ? argv[argv.indexOf(name) + 1] : undefined);
  try {
    snapshotAndPush({ message: option('--message'), source: option('--source'), dryRun: argv.includes('--essai'), newHistory: argv.includes('--nouvel-historique') });
  } catch (error) {
    console.error(`\nEnvoi arrêté : ${error.message}`);
    process.exit(1);
  }
}
