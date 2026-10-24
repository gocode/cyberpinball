// Fabrique l'exécutable de Cyber Pinball, ses installeurs, ou le déploie dans une racine.
//   node scripts/fabriquer.mjs                 -> release\win-unpacked\CyberPinball.exe
//   node scripts/fabriquer.mjs --installeur    -> idem, puis release\CyberPinball-Setup.exe (légère)
//                                                 et CyberPinball-Setup-complet.exe (avec VPX) ;
//                                                 --leger : sans la version complète
//   node scripts/fabriquer.mjs --deployer      -> idem, puis copie dans <racine>\app\ + raccourci
//   node scripts/fabriquer.mjs --application   -> l'application seule (build\app et son paquet),
//                                                 sans electron-builder : publication rapide
//
// Chaque fabrication écrit aussi release\CyberPinball-application.zip : le contenu de
// app\resources\app, que les bornes du même socle prennent en mise à jour légère
// (packages/core/src/update.ts). Le socle (Electron, electron-builder, icône et métadonnées de
// l'exécutable) est noté dans le package.json de l'application (cyberpinball.socle) : tout ce
// qui, hors de resources\app, demanderait l'installeur pour changer.
//
// Signature : facultative, par variables d'environnement (voir scripts/signature.mjs).
//
// L'application est d'abord regroupée par esbuild en deux fichiers (processus
// principal, preload) : les paquets du monorepo y sont inclus. Seul koffi reste
// à part, car il contient des bibliothèques natives (.node).

import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import { createRequire } from 'node:module';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { sign, signatureConfigured } from './signature.mjs';

const require = createRequire(import.meta.url);
const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const stage = path.join(repo, 'build', 'app');
const release = path.join(repo, 'release');
const unpacked = path.join(release, 'win-unpacked');
const rootPkg = JSON.parse(fs.readFileSync(path.join(repo, 'package.json'), 'utf8'));
// CYBERPINBALL_VERSION_ESSAI : autre numéro de version, pour les essais de la mise à jour
// (deux installeurs de versions différentes sans toucher au package.json).
const version = process.env.CYBERPINBALL_VERSION_ESSAI || rootPkg.version;

function step(text) {
  console.log(`\n> ${text}`);
}

step('Compilation TypeScript');
execFileSync(process.execPath, [path.join(repo, 'node_modules', 'typescript', 'bin', 'tsc'), '-b'], { cwd: repo, stdio: 'inherit' });

step('Regroupement (esbuild)');
fs.rmSync(path.join(repo, 'build'), { recursive: true, force: true });
const esbuild = require('esbuild');
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'koffi'], logLevel: 'warning' };
await esbuild.build({ ...common, entryPoints: [path.join(repo, 'app', 'dist', 'main.js')], outfile: path.join(stage, 'dist', 'main.js') });
// Un preload par type de fenêtre (preload.js, settings-preload.js…) : on les prend tous. Et la
// mise en place de la mise à jour légère, lancée à part par l'exécutable en mode Node.
for (const name of fs.readdirSync(path.join(repo, 'app', 'dist')).filter((f) => /preload\.js$/.test(f) || f === 'maj-legere.js')) {
  await esbuild.build({ ...common, entryPoints: [path.join(repo, 'app', 'dist', name)], outfile: path.join(stage, 'dist', name) });
}

step('Fichiers de l’application');
// Mêmes chemins relatifs qu'en développement : dist\..\renderer, dist\..\components.json.
fs.cpSync(path.join(repo, 'app', 'renderer'), path.join(stage, 'renderer'), { recursive: true });
const installerDir = path.join(repo, 'packages', 'installer');
for (const name of fs.readdirSync(installerDir)) {
  const from = path.join(installerDir, name);
  // Données du manifeste et schémas éventuels (par exemple vpx-settings\).
  if (name.endsWith('.json') && name !== 'package.json' && name !== 'tsconfig.json') fs.cpSync(from, path.join(stage, name));
  if (name === 'vpx-settings') fs.cpSync(from, path.join(stage, name), { recursive: true });
}
// koffi et son binaire natif, livré à part dans un paquet propre à la plateforme
// (seul celui de win32-x64 est copié). Du paquet koffi, on ne garde que le
// JavaScript chargé à l'exécution : ni sources C++, ni en-têtes, ni documentation.
const koffiNative = `@koromix/koffi-${process.platform}-${process.arch}`;
const koffiRuntime = (src) => {
  if (fs.statSync(src).isDirectory()) return !['vendor', 'doc', 'lib'].includes(path.basename(src));
  const name = path.basename(src);
  return /^LICENSE/i.test(name) || (/\.(c?js|json|node)$/.test(name) && name !== 'cnoke.cjs');
};
for (const pkg of ['koffi', koffiNative]) {
  fs.cpSync(path.join(repo, 'node_modules', pkg), path.join(stage, 'node_modules', pkg), { recursive: true, filter: koffiRuntime });
}
const versionOf = (pkg) => require(path.join(repo, 'node_modules', pkg, 'package.json')).version;

// Configuration de l'exécutable (electron-builder). Avec la version d'Electron, d'electron-builder
// et l'icône, elle fait le socle : tout ce qui entoure resources\app dans app\.
const icon = path.join(repo, 'app', 'ressources', 'icone.ico');
const builderConfig = {
  appId: 'org.cyberpinball.app',
  productName: 'Cyber Pinball',
  executableName: 'CyberPinball',
  copyright: 'Cyber Pinball, logiciel libre',
  electronVersion: rootPkg.devDependencies.electron,
  // koffi charge des .node : hors archive asar pour qu'ils restent chargeables.
  asar: false,
  npmRebuild: false,
  nodeGypRebuild: false,
};
const sha256 = (data) => createHash('sha256').update(data).digest('hex');
// CYBERPINBALL_SOCLE_ESSAI : un autre socle, pour les essais de la mise à jour par installeur
// (comme après un changement d'Electron : docs\demo-mise-a-jour.ps1).
const socle = process.env.CYBERPINBALL_SOCLE_ESSAI || `electron-${builderConfig.electronVersion}-${sha256(
  JSON.stringify({ builderConfig, electronBuilder: versionOf('electron-builder'), icon: sha256(fs.readFileSync(icon)), platform: `${process.platform}-${process.arch}` }),
).slice(0, 12)}`;

fs.writeFileSync(
  path.join(stage, 'package.json'),
  JSON.stringify(
    {
      name: 'cyberpinball',
      productName: 'Cyber Pinball',
      version: version,
      description: 'Frontend de borne de flipper virtuel',
      main: 'dist/main.js',
      author: 'Cyber Pinball',
      dependencies: { koffi: versionOf('koffi'), [koffiNative]: versionOf(koffiNative) },
      cyberpinball: { socle },
    },
    null,
    2,
  ),
);

/** release\CyberPinball-application.zip : build\app tel quel, écrit par le tar.exe de Windows (bsdtar, qui fait les zip). */
function packageApplication() {
  const { UPDATE_APP_NAME, windowsTar } = require(path.join(repo, 'packages', 'core', 'dist', 'update.js'));
  const zip = path.join(release, UPDATE_APP_NAME);
  fs.mkdirSync(release, { recursive: true });
  fs.rmSync(zip, { force: true });
  const run = spawnSync(windowsTar(), ['-a', '-c', '-f', zip, '-C', stage, ...fs.readdirSync(stage)], { encoding: 'utf8' });
  if (run.status !== 0) throw new Error(`Paquet de l'application impossible : ${run.stderr || run.error?.message}`);
  console.log(`\nPaquet de l'application : ${zip} (${(fs.statSync(zip).size / 1024 ** 2).toFixed(1)} Mio, socle ${socle})`);
}

if (process.argv.includes('--application')) {
  packageApplication();
  process.exit(0);
}

step('Assemblage de l’exécutable (electron-builder)');
const { build, Platform } = require('electron-builder');
await build({
  targets: Platform.WINDOWS.createTarget('dir'),
  config: {
    ...builderConfig,
    directories: { app: stage, output: release },
    // Icône et métadonnées (version, description) écrites dans l'exe. La signature,
    // facultative, est faite ensuite par scripts/signature.mjs, comme pour les installeurs.
    win: { icon, signExecutable: false },
  },
});
packageApplication();
const exe = path.join(unpacked, 'CyberPinball.exe');
if (signatureConfigured()) {
  step('Signature');
  await sign(exe);
}
console.log(`\nExécutable : ${exe}`);

if (process.argv.includes('--installeur')) {
  const { buildInstallers } = await import('./installeur.mjs');
  await buildInstallers({ complete: !process.argv.includes('--leger') });
}

if (process.argv.includes('--deployer')) {
  const pointer = path.join(process.env.APPDATA ?? '', 'CyberPinball', 'root.json');
  const root = process.env.CYBERPINBALL_ROOT ?? (fs.existsSync(pointer) ? JSON.parse(fs.readFileSync(pointer, 'utf8')).root : undefined);
  if (!root) throw new Error("Aucune racine : lancez d'abord l'installation (setup) ou définissez CYBERPINBALL_ROOT.");
  const target = path.join(root, 'app');

  const running = spawnSync('tasklist', ['/FI', 'IMAGENAME eq CyberPinball.exe', '/NH'], { encoding: 'utf8' }).stdout;
  if (running.includes('CyberPinball.exe')) throw new Error('Cyber Pinball est en cours d’exécution : fermez-le avant de déployer.');

  step(`Déploiement dans ${target}`);
  // /MIR : le dossier app\ devient l'exact reflet de la nouvelle version, sauf le
  // désinstalleur et son journal, posés là par l'installeur.
  const keep = ['/XF', 'Désinstaller Cyber Pinball.exe', 'installation.ini'];
  const copy = spawnSync('robocopy', [unpacked, target, '/MIR', ...keep, '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { stdio: 'inherit' });
  if (copy.status === null || copy.status >= 8) throw new Error(`robocopy a échoué (code ${copy.status}).`);

  const shortcut = path.join(root, 'Cyber Pinball.lnk');
  const ps = [
    '$s = (New-Object -ComObject WScript.Shell).CreateShortcut($env:CP_LNK)',
    '$s.TargetPath = $env:CP_EXE',
    '$s.WorkingDirectory = $env:CP_DIR',
    "$s.Description = 'Cyber Pinball'",
    '$s.Save()',
  ].join('; ');
  execFileSync('powershell', ['-NoProfile', '-Command', ps], {
    env: { ...process.env, CP_LNK: shortcut, CP_EXE: path.join(target, 'CyberPinball.exe'), CP_DIR: target },
  });
  console.log(`Raccourci : ${shortcut}`);
}
