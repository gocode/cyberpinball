// Publie une version de Cyber Pinball : les bornes la trouvent par « Mise à jour de
// Cyber Pinball » (menu système, packages/core/src/update.ts).
//   npm run publier                       -> release GitHub v<version> de package.json
//   npm run publier -- --brouillon        -> release laissée en brouillon (invisible des bornes)
//   npm run publier -- --sans-fabrication -> reprend release\ tel qu'il est
//   npm run publier -- --notes <fichier>  -> nouveautés (sinon : section « ## <version> » de CHANGELOG.md,
//                                            et de CHANGELOG.en.md pour la release GitHub)
//   npm run publier -- --rapide           -> sans refaire les installeurs (une à deux minutes) : le
//                                            paquet léger seul, le flux désignant les installeurs
//                                            de la dernière publication complète
//   npm run publier -- --local <dossier> --url <adresse> -> flux, installeur et paquet léger dans
//                                            un dossier servi à cette adresse, sans GitHub (essais ;
//                                            --leger : sans fabriquer la version complète ;
//                                            --rapide demande --reference <flux publié>)
//
// Étapes : contrôle de publication (scripts/audit-publication.mjs), fabrication des deux
// installeurs et du paquet léger (CyberPinball-application.zip), flux cyberpinball-maj.json
// signé par la clé de publication (scripts/cle-publication.mjs), puis release GitHub avec ces
// quatre fichiers, posée sur l'instantané du code envoyé sur main (scripts/envoyer-github.mjs).
// Une version avec préversion (0.2.0-essai.1) est publiée en « pre-release » : GitHub ne la
// donne pas pour « latest », seules les bornes qui acceptent les préversions la voient.
//
// Publication rapide : refusée si le socle (Electron, exécutable : scripts/fabriquer.mjs) n'est
// plus celui du dernier flux publié, puisque les bornes ne pourraient pas prendre le paquet léger.
//
// Jeton GitHub : voir scripts/jeton-github.mjs (%USERPROFILE%\.cyberpinball\jeton-github.txt, ou
// CYBERPINBALL_GITHUB_TOKEN). Jamais dans le dépôt ni sur la ligne de commande.

import { execFileSync, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { auditRepository } from './audit-publication.mjs';
import { loadPrivateKey } from './cle-publication.mjs';
import { describeRepository } from './decrire-github.mjs';
import { githubToken, missingTokenMessage } from './jeton-github.mjs';
import { snapshotAndPush } from './envoyer-github.mjs';
import { bulletPoints, changelogNotes, changelogSections } from './traductions.mjs';

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
const rapid = argv.includes('--rapide');
const prerelease = version.includes('-');

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
const found = githubToken();
const token = found?.token;
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
  if (!token) fail(missingTokenMessage());
  console.log(`Jeton GitHub : ${found.source}.`);
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
  step(rapid ? 'Fabrication de l’application seule (sans electron-builder ni installeurs)' : 'Fabrication des installeurs');
  const args = [path.join(repo, 'scripts', 'fabriquer.mjs'), ...(rapid ? ['--application'] : ['--installeur', ...(argv.includes('--leger') ? ['--leger'] : [])])];
  const run = spawnSync(process.execPath, args, { cwd: repo, stdio: 'inherit' });
  if (run.status !== 0) fail('la fabrication a échoué.');
}
// L'application telle que fabriquée (build\app), dont le paquet léger est l'image exacte.
const appPkg = JSON.parse(fs.readFileSync(path.join(repo, 'build', 'app', 'package.json'), 'utf8'));
const built = rapid ? appPkg.version : JSON.parse(fs.readFileSync(path.join(release, 'win-unpacked', 'resources', 'app', 'package.json'), 'utf8')).version;
if (built !== version || appPkg.version !== version) fail(`release\\ contient la version ${built}, pas ${version} : relancez sans --sans-fabrication.`);
const socle = appPkg.cyberpinball?.socle;
if (!socle) fail('build\\app\\package.json n’a pas de socle (cyberpinball.socle) : relancez sans --sans-fabrication.');
const installer = path.join(release, update.UPDATE_INSTALLER_NAME);
const complete = path.join(release, 'CyberPinball-Setup-complet.exe');
const appPackage = path.join(release, update.UPDATE_APP_NAME);
if (!rapid && !fs.existsSync(installer)) fail(`${installer} manque.`);
if (!fs.existsSync(appPackage)) fail(`${appPackage} manque.`);

// Publication rapide : les installeurs sont ceux du dernier flux publié (préversions comprises
// pour une préversion), à condition que les bornes puissent prendre le paquet léger.
let reference;
if (rapid) {
  step('Installeurs de la dernière publication complète');
  const source = option('--reference') ?? (local ? undefined : prerelease ? await update.prereleaseFeedUrl() : update.updateFeedUrl({}));
  if (!source) fail('--rapide avec --local demande --reference <fichier ou adresse du flux publié>.');
  const text = /^https?:\/\//.test(source) ? await fetch(source, { redirect: 'follow' }).then((r) => (r.ok ? r.text() : fail(`flux publié illisible (HTTP ${r.status}) : ${source}`))) : fs.readFileSync(source, 'utf8');
  reference = update.openEnvelope(text, update.updatePublicKey({}));
  const installs = reference.installer.version ?? reference.version;
  if (!reference.app) fail(`le flux publié (${reference.version}) n'a pas de paquet léger : faites d'abord une publication complète (sans --rapide).`);
  if (reference.app.socle !== socle) {
    fail(`le socle a changé (publié : ${reference.app.socle} ; fabriqué : ${socle}) : Electron ou l'exécutable ne sont plus les mêmes, les bornes ont besoin de l'installeur. Publication complète (sans --rapide).`);
  }
  if (update.compareAppVersions(reference.version, version) >= 0) fail(`la version ${reference.version} est déjà publiée : changez la version de package.json.`);
  console.log(`Flux publié : ${reference.version}, socle identique. Installeurs repris : ceux de la ${installs}.`);
}

step('Nouveautés');
const notesFile = option('--notes');
// Une préversion (0.2.0-essai.1) sans section à elle prend celle de sa version finale (## 0.2.0).
const base = version.replace(/-.*$/, '');
const changelog = (file) => {
  const own = changelogNotes(file, version);
  return own.length || !prerelease ? own : changelogNotes(file, base);
};
let notes = notesFile ? bulletPoints(fs.readFileSync(notesFile, 'utf8')) : changelog(path.join(repo, 'CHANGELOG.md'));
// Version anglaise : dans la release GitHub, et dans le flux pour les bornes réglées en anglais.
let notesEn = notesFile ? [] : changelog(path.join(repo, 'CHANGELOG.en.md'));
if (!notes.length && prerelease) {
  notes = [`Préversion d'essai de la ${base}.`];
  notesEn = [`Test pre-release of ${base}.`];
}
if (!notes.length && !local) fail(`aucune nouveauté pour ${version} : ajoutez une section « ## ${version} » à CHANGELOG.md (une ligne « - » par point), ou --notes <fichier>.`);
for (const n of notes) console.log(`  - ${n}`);
for (const n of notesEn) console.log(`  - (en) ${n}`);
if (!notesFile && !notesEn.length) console.log(`  (pas de section « ## ${version} » dans CHANGELOG.en.md : release sans les nouveautés en anglais)`);
// Nouveautés des versions précédentes (les 20 dernières) : une borne qui en a sauté les voit toutes.
const readText = (file) => (fs.existsSync(file) ? fs.readFileSync(file, 'utf8') : '');
const sectionsFr = changelogSections(readText(path.join(repo, 'CHANGELOG.md')));
const sectionsEn = changelogSections(readText(path.join(repo, 'CHANGELOG.en.md')));
const history = [...sectionsFr.keys()]
  .filter((v) => update.isVersion(v) && update.compareAppVersions(v, version) < 0)
  .sort((a, b) => update.compareAppVersions(b, a))
  .slice(0, 20)
  .map((v) => ({ version: v, notes: sectionsFr.get(v), ...(sectionsEn.get(v)?.length && { notesByLanguage: { en: sectionsEn.get(v) } }) }));
if (history.length) console.log(`  Versions précédentes dans le flux : ${history.map((h) => h.version).join(', ')}`);

step('Flux signé');
const urlBase = option('--url');
if (local && !urlBase) fail('--local demande --url (adresse où le dossier sera servi).');
const manifest = {
  version,
  date: new Date().toISOString(),
  notes,
  ...(notesEn.length && { notesByLanguage: { en: notesEn } }),
  ...(history.length && { history }),
  installer: reference
    ? { ...reference.installer, version: reference.installer.version ?? reference.version }
    : {
        name: update.UPDATE_INSTALLER_NAME,
        url: local ? `${urlBase.replace(/\/$/, '')}/${update.UPDATE_INSTALLER_NAME}` : update.releaseAssetUrl(version, update.UPDATE_INSTALLER_NAME),
        size: fs.statSync(installer).size,
        sha256: await update.sha256File(installer),
      },
  app: {
    name: update.UPDATE_APP_NAME,
    url: local ? `${urlBase.replace(/\/$/, '')}/${update.UPDATE_APP_NAME}` : update.releaseAssetUrl(version, update.UPDATE_APP_NAME),
    size: fs.statSync(appPackage).size,
    sha256: await update.sha256File(appPackage),
    socle,
  },
};
const envelope = update.signManifest(manifest, privateKey);
// Relu comme le ferait une borne, avec la clé livrée dans l'application.
update.openEnvelope(JSON.stringify(envelope), update.updatePublicKey({}));
const feed = path.join(release, update.UPDATE_FEED_NAME);
fs.writeFileSync(feed, `${JSON.stringify(envelope, null, 2)}\n`, 'utf8');
console.log(`${feed}\n  installeur ${manifest.installer.size} octets${reference ? ` (celui de la ${manifest.installer.version})` : ''}, SHA-256 ${manifest.installer.sha256}`);
console.log(`  paquet léger ${manifest.app.size} octets, SHA-256 ${manifest.app.sha256}, socle ${socle}`);

if (local) {
  fs.mkdirSync(local, { recursive: true });
  if (!reference) fs.copyFileSync(installer, path.join(local, update.UPDATE_INSTALLER_NAME));
  fs.copyFileSync(appPackage, path.join(local, update.UPDATE_APP_NAME));
  fs.copyFileSync(feed, path.join(local, update.UPDATE_FEED_NAME));
  console.log(`\nPublication locale : ${local} (à servir à ${urlBase})`);
  process.exit(0);
}

step('Code sur GitHub (instantané, sans l’historique)');
const commit = option('--commit') ?? snapshotAndPush({ message: `Cyber Pinball ${version}` });

step(`Release v${version} sur github.com/${repository}`);
const installs = manifest.installer.version ?? version;
const installersText = reference
  ? [
      `**Installeurs** : ceux de la [${installs}](https://github.com/${repository}/releases/tag/v${installs}) ; une borne installée avec eux reçoit ensuite la mise à jour légère vers ${version}.`,
      '',
    ]
  : [
      `**${update.UPDATE_INSTALLER_NAME}** : installeur léger (Visual Pinball X téléchargé au premier lancement).`,
      '',
      '**CyberPinball-Setup-complet.exe** : avec l’archive officielle de Visual Pinball X, pour une borne sans Internet. Redistribution gratuite seulement : ni vendue, ni livrée avec une borne vendue ou exploitée commercialement (licence de VPX).',
      '',
    ];
const body = [
  ...notes.map((n) => `- ${n}`),
  '',
  ...(notesEn.length ? ['**English**', '', ...notesEn.map((n) => `- ${n}`), ''] : []),
  `Les bornes déjà installées se mettent à jour depuis le menu système, « Mise à jour de Cyber Pinball » : mise à jour légère (**${update.UPDATE_APP_NAME}**, l'application seule) si elles ont déjà le même socle (${socle}), sinon par l'installeur.`,
  '',
  ...installersText,
  `SHA-256 de ${update.UPDATE_INSTALLER_NAME} : \`${manifest.installer.sha256}\``,
  `SHA-256 de ${update.UPDATE_APP_NAME} : \`${manifest.app.sha256}\``,
].join('\n');
const created = await api('POST', '/releases', {
  tag_name: `v${version}`,
  target_commitish: commit,
  name: `Cyber Pinball ${version}`,
  body,
  draft: true,
  prerelease,
});
if (created.status !== 201) fail(`création de la release refusée (HTTP ${created.status}) : ${JSON.stringify(created.json)}`);
const uploadBase = created.json.upload_url.replace(/\{.*\}$/, '');
const files = reference ? [appPackage, feed] : [installer, ...(fs.existsSync(complete) ? [complete] : []), appPackage, feed];
for (const file of files) {
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
  // Une préversion : lue comme une borne qui accepte les préversions.
  // GitHub met sa liste des releases à jour avec quelques secondes de retard (le 25/10/2026,
  // 0.1.3-essai.2 lue « 0.1.3-essai.1 ») : on relit jusqu'à voir la version publiée.
  let check;
  for (let attempt = 0; attempt < 12; attempt++) {
    if (attempt) await new Promise((resolve) => setTimeout(resolve, 5000));
    check = await update.checkForUpdate({ current: '0.0.0', prereleases: prerelease }).catch((error) => error);
    if (!(check instanceof Error) && check.latest.version === version) break;
  }
  if (check instanceof Error) console.log(`Attention : le flux n'est pas encore lisible par les bornes (${check.message}).`);
  else if (check.latest.version !== version) console.log(`Attention : au bout d'une minute, les bornes lisent encore la version ${check.latest.version}, pas ${version} : à vérifier sur GitHub.`);
  else console.log(`Flux lu comme une borne : version ${check.latest.version}${prerelease ? ' (préversion : seules les bornes qui acceptent les préversions la voient)' : ''}.`);
}

// Description et sujets du dépôt, d'après package.json. Sans la permission « Administration »,
// la release est faite quand même : seul ce point reste à refaire (npm run decrire).
step('Description et sujets du dépôt');
await describeRepository().catch((error) => console.log(`Non appliqués : ${error.message}`));
