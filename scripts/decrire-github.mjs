// Description et sujets (« topics ») du dépôt public github.com/gocode/cyberpinball, tirés
// de package.json (« description » et « keywords ») : un seul endroit à tenir à jour.
//   npm run decrire                -> les applique au dépôt (jeton CYBERPINBALL_GITHUB_TOKEN)
//   npm run decrire -- --essai     -> vérifie et affiche ce qui serait envoyé, sans jeton
// Aussi lancé par npm run publier, après la release.
//
// Jeton : le même que pour la publication (à grain fin, limité au dépôt), avec en plus la
// permission « Administration : read and write », qu'exige GitHub pour changer la
// description et les sujets.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditText } from './audit-publication.mjs';
import { githubToken, missingTokenMessage } from './jeton-github.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Ce que GitHub accepte : description de 350 caractères au plus, 20 sujets en minuscules, chiffres et tirets. */
export function repositoryProfile() {
  const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
  const repository = /github\.com\/([^/]+\/[^/.]+)/.exec(pkg.repository?.url ?? '')?.[1];
  const description = pkg.description ?? '';
  const topics = pkg.keywords ?? [];
  const problems = [];
  if (!repository) problems.push('dépôt GitHub introuvable dans « repository » de package.json');
  if (!description || description.length > 350) problems.push(`description de ${description.length} caractères (1 à 350)`);
  if (topics.length === 0 || topics.length > 20) problems.push(`${topics.length} sujets (1 à 20)`);
  for (const t of topics) if (!/^[a-z0-9][a-z0-9-]{0,49}$/.test(t)) problems.push(`sujet refusé par GitHub : « ${t} » (minuscules, chiffres et tirets, 50 caractères au plus)`);
  if (new Set(topics).size !== topics.length) problems.push('sujet en double');
  for (const f of auditText(description)) problems.push(`description : ${f.what} (${f.excerpt})`);
  return { repository, description, topics, problems };
}

export async function describeRepository({ dryRun = false } = {}) {
  const profile = repositoryProfile();
  if (profile.problems.length) throw new Error(profile.problems.join(' ; '));
  console.log(`Dépôt : github.com/${profile.repository}\nDescription (${profile.description.length} caractères) : ${profile.description}\nSujets : ${profile.topics.join(', ')}`);
  if (dryRun) return console.log('Essai : rien n’est envoyé.');
  const token = githubToken()?.token;
  if (!token) throw new Error(missingTokenMessage());
  const api = async (method, url, body) => {
    const response = await fetch(`https://api.github.com/repos/${profile.repository}${url}`, {
      method,
      headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28' },
      body: body && JSON.stringify(body),
    });
    const json = await response.json().catch(() => undefined);
    if (!response.ok) {
      const hint = response.status === 403 || response.status === 404 ? ' : le jeton doit avoir la permission « Administration : read and write » sur ce dépôt' : '';
      throw new Error(`${method} ${url || '/'} refusé (HTTP ${response.status})${hint}. ${json?.message ?? ''}`);
    }
    return json;
  };
  await api('PATCH', '', { description: profile.description });
  await api('PUT', '/topics', { names: profile.topics });
  const check = await api('GET', '');
  const same = check.description === profile.description && [...(check.topics ?? [])].sort().join() === [...profile.topics].sort().join();
  console.log(same ? 'Description et sujets appliqués, relus sur GitHub.' : 'Attention : GitHub ne renvoie pas encore la description ou les sujets envoyés.');
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  describeRepository({ dryRun: process.argv.includes('--essai') }).catch((error) => {
    console.error(`\nDescription du dépôt arrêtée : ${error.message}`);
    process.exit(1);
  });
}
