// Publie une version de Cyber Pinball : les bornes la trouvent par « Mise à jour de
// Cyber Pinball » (menu système, packages/core/src/update.ts).
//   npm run publier                       -> release GitHub v<version> de package.json
//   npm run publier -- --brouillon        -> release laissée en brouillon (invisible des bornes)
//   npm run publier -- --sans-fabrication -> reprend release\ tel qu'il est
//   npm run publier -- --notes <fichier>  -> nouveautés (sinon : section « ## <version> » de CHANGELOG.md,
//                                            et de CHANGELOG.en.md pour la release GitHub)
//   npm run publier -- --local <dossier> --url <adresse> -> flux et installeur dans un dossier
//                                            servi à cette adresse, sans GitHub (essais ;
//                                            --leger : sans fabriquer la version complète)
//
// Étapes : contrôle de publication (scripts/audit-publication.mjs), fabrication des deux
// installeurs, flux cyberpinball-maj.json signé par la clé de publication
// (scripts/cle-publication.mjs), puis release GitHub avec trois fichiers : les deux
// installeurs et le flux, posée sur l'instantané du code envoyé sur main (scripts/envoyer-github.mjs).
// Une version avec préversion (0.2.0-beta.1) est publiée en
// « pre-release » : GitHub ne la donne pas pour « latest », les bornes ne la voient pas.
//
// Jeton GitHub : CYBERPINBALL_GITHUB_TOKEN (sinon GITHUB_TOKEN, GH_TOKEN), à grain fin, limité
// au dépôt, permission « Contents : read and write ». Jamais dans le dépôt ni sur la ligne de commande.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRepository } from './audit-publication.mjs';
import { loadPrivateKey } from './cle-publication.mjs';
import { snapshotAndPush } from './envoyer-github.mjs';
import { bulletPoints, changelogNotes } from './traductions.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const release = path.join(repo, 'release');
const pkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
const version = process.env.CYBERPINBALL_VERSION_ESSAI || pkg.version;
const argv = process.argv.slice(2);
const option = (name) => {
  const at = argv.indexOf(name);
  return at >= 0 ? argv[at + 1] : undefined;
};
const local = option('--local');

function step(text) {
  console.log(`\n> ${text}`);
}
function fail(message) {
  console.error(`\nPublication arrêtée : ${message}`);
  process.exit(1);
}

step('Compilation TypeScript');
execFileSync(process.execPath, [path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '-b'], { cwd: repo, stdio: 'inherit' });
const update = require(path.join(repo, 'packages', 'core', 'dist', 'update.js'));
if (!update.isVersion(version)) fail(`version illisible : ${version}`);
const repository = /github\.com\/([^/]+\/[^/.]+)/.exec(pkg.repository?.url ?? '')?.[1];
if (repository !== update.UPDATE_REPOSITORY) fail(`le dépôt de package.json (${repository}) n'est pas celui que lisent les bornes (${update.UPDATE_REPOSITORY}).`);
const privateKey = loadPrivateKey();

step('Contrôle de publication');
const audit = auditRepository();
if (audit.problems.length) fail(`le dépôt est public, à retirer d'abord :\n  ${audit.problems.join('\n  ')}`);
console.log(`${audit.files} fichiers suivis : rien de personnel ni de secret.`);

// GitHub : la release est posée sur l'instantané du commit local (scripts/envoyer-github.mjs :
// le dépôt public n'a pas l'historique détaillé), ou sur --commit, déjà sur GitHub.
const token = process.env.CYBERPINBALL_GITHUB_TOKEN || process.env.GITHUB_TOKEN || process.env.GH_TOKEN;
const api = async (method, url, body, headers = {}) => {
  const response = await fetch(url.startsWith('https://') ? url : `https://api.github.com/repos/${repository}${url}`, {
    method,
    headers: { authorization: `Bearer ${token}`, accept: 'application/vnd.github+json', 'x-github-api-version': '2022-11-28', ...headers },
    body: body === undefined ? undefined : body instanceof Blob ? body : JSON.stringify(body),
  });
  const text = await response.text();
  return { status: response.status, json: text ? JSON.parse(text) : undefined };
};
if (!local) {
  if (!token) fail('jeton GitHub absent (CYBERPINBALL_GITHUB_TOKEN).');
  if (!option('--commit') && execFileSync('git', ['status', '--porcelain', '--untracked-files=no'], { cwd: repo, encoding: 'utf8' }).trim()) {
    fail('des modifications ne sont pas enregistrées (git status) : la version publiée doit correspondre à un commit.');
  }
  if (option('--commit')) {
    const remote = await api('GET', `/commits/${option('--commit')}`);
    if (remote.status !== 200) fail(`le commit ${option('--commit')} n'est pas sur github.com/${repository} (HTTP ${remote.status}).`);
  }
  const existing = await api('GET', `/releases/tags/v${version}`);
  if (existing.status === 200) fail(`la release v${version} existe déjà : changez la version de package.json.`);
}

if (!argv.includes('--sans-fabrication')) {
  step('Fabrication des installeurs');
  const args = [path.join(repo, 'scripts', 'fabriquer.mjs'), '--installeur', ...(argv.includes('--leger') ? ['--leger'] : [])];
  const run = spawnSync(process.execPath, args, { cwd: repo, stdio: 'inherit' });
  if (run.status !== 0) fail('la fabrication a échoué.');
}
const built = JSON.parse(fs.readFileSync(path.join(release, 'win-unpacked', 'resources', 'app', 'package.json'), 'utf8')).version;
if (built !== version) fail(`release\\ contient la version ${built}, pas ${version} : relancez sans --sans-fabrication.`);
const installer = path.join(release, update.UPDATE_INSTALLER_NAME);
const complete = path.join(release, 'CyberPinball-Setup-complet.exe');
if (!fs.existsSync(installer)) fail(`${installer} manque.`);

step('Nouveautés');
const notesFile = option('--notes');
const notes = notesFile ? bulletPoints(fs.readFileSync(notesFile, 'utf8')) : changelogNotes(path.join(repo, 'CHANGELOG.md'), version);
// Version anglaise : dans la release GitHub, et dans le flux pour les bornes réglées en anglais.
const notesEn = notesFile ? [] : changelogNotes(path.join(repo, 'CHANGELOG.en.md'), version);
if (!notes.length && !local) fail(`aucune nouveauté pour ${version} : ajoutez une section « ## ${version} » à CHANGELOG.md (une ligne « - » par point), ou --notes <fichier>.`);
for (const n of notes) console.log(`  - ${n}`);
for (const n of notesEn) console.log(`  - (en) ${n}`);
if (!notesFile && !notesEn.length) console.log(`  (pas de section « ## ${version} » dans CHANGELOG.en.md : release sans les nouveautés en anglais)`);

step('Flux signé');
const urlBase = option('--url');
if (local && !urlBase) fail('--local demande --url (adresse où le dossier sera servi).');
const manifest = {
  version,
  date: new Date().toISOString(),
  notes,
  ...(notesEn.length && { notesByLanguage: { en: notesEn } }),
  installer: {
    name: update.UPDATE_INSTALLER_NAME,
    url: local ? `${urlBase.replace(/\/$/, '')}/${update.UPDATE_INSTALLER_NAME}` : update.releaseAssetUrl(version, update.UPDATE_INSTALLER_NAME),
    size: fs.statSync(installer).size,
    sha256: await update.sha256File(installer),
  },
};
const envelope = update.signManifest(manifest, privateKey);
// Relu comme le ferait une borne, avec la clé livrée dans l'application.
update.openEnvelope(JSON.stringify(envelope), update.updatePublicKey({}));
const feed = path.join(release, update.UPDATE_FEED_NAME);
fs.writeFileSync(feed, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
console.log(`${feed}\n  installeur ${manifest.installer.size} octets, SHA-256 ${manifest.installer.sha256}`);

if (local) {
  fs.mkdirSync(local, { recursive: true });
  fs.copyFileSync(installer, path.join(local, update.UPDATE_INSTALLER_NAME));
  fs.copyFileSync(feed, path.join(local, update.UPDATE_FEED_NAME));
  console.log(`\nPublication locale : ${local} (à servir à ${urlBase})`);
  process.exit(0);
}

step('Code sur GitHub (instantané, sans l’historique)');
const commit = option('--commit') ?? snapshotAndPush({ message: `Cyber Pinball ${version}` });

step(`Release v${version} sur github.com/${repository}`);
const body = [
  ...notes.map((n) => `- ${n}`),
  '',
  ...(notesEn.length ? ['**English**', '', ...notesEn.map((n) => `- ${n}`), ''] : []),
  `**${update.UPDATE_INSTALLER_NAME}** : installeur léger (Visual Pinball X téléchargé au premier lancement). Les bornes déjà installées se mettent à jour depuis le menu système, « Mise à jour de Cyber Pinball ».`,
  '',
  '**CyberPinball-Setup-complet.exe** : avec l’archive officielle de Visual Pinball X, pour une borne sans Internet. Redistribution gratuite seulement : ni vendue, ni livrée avec une borne vendue ou exploitée commercialement (licence de VPX).',
  '',
  `SHA-256 de ${update.UPDATE_INSTALLER_NAME} : \`${manifest.installer.sha256}\``,
].join('\n');
const created = await api('POST', '/releases', {
  tag_name: `v${version}`,
  target_commitish: commit,
  name: `Cyber Pinball ${version}`,
  body,
  draft: true,
  prerelease: version.includes('-'),
});
if (created.status !== 201) fail(`création de la release refusée (HTTP ${created.status}) : ${JSON.stringify(created.json)}`);
const uploadBase = created.json.upload_url.replace(/\{.*\}$/, '');
for (const file of [installer, ...(fs.existsSync(complete) ? [complete] : []), feed]) {
  const name = path.basename(file);
  process.stdout.write(`  ${name} (${(fs.statSync(file).size / 1024 ** 2).toFixed(1)} Mio)… `);
  const blob = await fs.openAsBlob(file);
  const sent = await api('POST', `${uploadBase}?name=${encodeURIComponent(name)}`, blob, { 'content-type': name.endsWith('.json') ? 'application/json' : 'application/octet-stream' });
  if (sent.status !== 201) fail(`envoi de ${name} refusé (HTTP ${sent.status}) : ${JSON.stringify(sent.json)}. La release reste en brouillon.`);
  console.log('envoyé');
}
if (argv.includes('--brouillon')) {
  console.log(`\nBrouillon : ${created.json.html_url}\nLes bornes ne le voient pas tant qu'il n'est pas publié (bouton « Publish release »).`);
} else {
  const published = await api('PATCH', `/releases/${created.json.id}`, { draft: false });
  if (published.status !== 200) fail(`publication refusée (HTTP ${published.status}) ; la release reste en brouillon : ${created.json.html_url}`);
  console.log(`\nPubliée : ${published.json.html_url}`);
  // Les bornes lisent ce flux : vérifié tel qu'elles le recevront.
  const check = await update.checkForUpdate({ current: '0.0.0' }).catch((error) => error);
  if (check instanceof Error) console.log(`Attention : le flux n'est pas encore lisible par les bornes (${check.message}).`);
  else console.log(`Flux lu comme une borne : version ${check.latest.version}${version.includes('-') ? ' (préversion : les bornes restent sur la dernière version finale)' : ''}.`);
}
