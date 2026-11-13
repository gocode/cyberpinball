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
// principal, preload) : les paquets du monorepo y sont inclus. Seuls koffi, sodium-native et
// udx-native (réseau des bornes, Hyperswarm) restent à part, car ils contiennent des
// bibliothèques natives (.node) chargées depuis leur propre dossier.

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
// Copie de dossiers sûre avec les chemins accentués (packages/core/src/copytree.ts) : ce script
// tourne sous Node 22, dont fs.cpSync les abîme sous Windows.
const { copyTree } = require(path.join(repo, 'packages', 'core', 'dist', 'copytree.js'));

step('Regroupement (esbuild)');
fs.rmSync(path.join(repo, 'build'), { recursive: true, force: true });
const esbuild = require('esbuild');
// Modules natifs du réseau des bornes : chargés par require-addon depuis le dossier de leur paquet.
const NATIVE_NET = ['sodium-native', 'udx-native'];
// Le script préchargé du bloqueur de publicités est copié à part (plus bas) : laissé hors du regroupement.
const common = { bundle: true, platform: 'node', format: 'cjs', target: 'node22', external: ['electron', 'koffi', '@ghostery/adblocker-electron-preload', ...NATIVE_NET], logLevel: 'warning' };
await esbuild.build({ ...common, entryPoints: [path.join(repo, 'app', 'dist', 'main.js')], outfile: path.join(stage, 'dist', 'main.js') });
// Un preload par type de fenêtre (preload.js, settings-preload.js…) : on les prend tous. Et la
// mise en place de la mise à jour légère, le veilleur de la relance par Start, l'installation du
// runtime Visual C++ par l'installeur (runtime-vc.ts) et l'enregistreur de la
// musique des ROM (rom-music.ts), lancés à part par l'exécutable en mode Node.
for (const name of fs.readdirSync(path.join(repo, 'app', 'dist')).filter((f) => /preload\.js$/.test(f) || f === 'maj-legere.js' || f === 'veilleur.js' || f === 'enregistreur-rom.js' || f === 'runtime-vc.js')) {
  await esbuild.build({ ...common, entryPoints: [path.join(repo, 'app', 'dist', name)], outfile: path.join(stage, 'dist', name) });
}
// Script préchargé du bloqueur de publicités (app/src/ad-blocker.ts), injecté par la session
// dans les pages du navigateur intégré : déjà regroupé par Ghostery, il ne requiert qu'electron.
fs.copyFileSync(require.resolve('@ghostery/adblocker-electron-preload'), path.join(stage, 'dist', 'adblock-preload.js'));

step('Fichiers de l’application');
// Mêmes chemins relatifs qu'en développement : dist\..\renderer, dist\..\components.json.
copyTree(path.join(repo, 'app', 'renderer'), path.join(stage, 'renderer'));
const installerDir = path.join(repo, 'packages', 'installer');
for (const name of fs.readdirSync(installerDir)) {
  const from = path.join(installerDir, name);
  // Données du manifeste et schémas éventuels (par exemple vpx-settings\).
  if (name.endsWith('.json') && name !== 'package.json' && name !== 'tsconfig.json') fs.copyFileSync(from, path.join(stage, name));
  if (name === 'vpx-settings') copyTree(from, path.join(stage, name));
}
// Compagnon « menu dans le casque » (packages/casque-vr, app/src/casque.ts) : construit ici quand
// CMake et les outils C++ de Visual Studio sont là. Sans eux, l'application part sans lui, et le
// menu dans le casque le dit (« compagnon absent »).
{
  const { buildHeadset } = await import('./casque-vr.mjs');
  const exe = buildHeadset({ quiet: true });
  if (exe) {
    fs.mkdirSync(path.join(stage, 'natif'), { recursive: true });
    fs.copyFileSync(exe, path.join(stage, 'natif', path.basename(exe)));
    console.log('Compagnon du casque : natif\\' + path.basename(exe));
    // Sonde LibOVR (app/src/sonde-ovr.ts), construite avec le compagnon.
    const sonde = path.join(path.dirname(exe), 'cyberpinball-sonde-ovr.exe');
    if (fs.existsSync(sonde)) fs.copyFileSync(sonde, path.join(stage, 'natif', path.basename(sonde)));
    // Textures du décor de la VR (caisse et capsule, packages/core/src/decor.ts) : natif\decor.
    const decorSrc = path.join(repo, 'packages', 'casque-vr', 'decor');
    fs.mkdirSync(path.join(stage, 'natif', 'decor'), { recursive: true });
    for (const f of fs.readdirSync(decorSrc)) fs.copyFileSync(path.join(decorSrc, f), path.join(stage, 'natif', 'decor', f));
    console.log('Décor du casque : natif\\decor');
  }
}
// Vision 3D (app/src/vision3d.ts) : le plugin VPX « Vision3D » (packages/vpx-vision3d, construit ici
// avec les mêmes outils que le compagnon du casque ; sans eux, l'entrée « Vision 3D » dit qu'il
// manque), MediaPipe pour la webcam (le seul script classique et son WebAssembly) et le modèle du visage.
{
  const { buildVision3d, VISION3D_SOURCE } = await import('./vision3d.mjs');
  const dll = buildVision3d({ quiet: true });
  if (dll) {
    const dir = path.join(stage, 'natif', 'vision3d');
    fs.mkdirSync(dir, { recursive: true });
    fs.copyFileSync(dll, path.join(dir, path.basename(dll)));
    fs.copyFileSync(path.join(VISION3D_SOURCE, 'plugin.cfg'), path.join(dir, 'plugin.cfg'));
    console.log(`Plugin Vision 3D : ${path.join('natif', 'vision3d', path.basename(dll))}`);
    // Plugin « CyberPinball » (la pause dans le casque), construit avec lui (app/src/pause-vr.ts).
    const pauseDll = path.join(path.dirname(dll), 'plugin-cyberpinball64.dll');
    if (fs.existsSync(pauseDll)) {
      const pauseDir = path.join(stage, 'natif', 'cyberpinball');
      fs.mkdirSync(pauseDir, { recursive: true });
      fs.copyFileSync(pauseDll, path.join(pauseDir, path.basename(pauseDll)));
      fs.copyFileSync(path.join(VISION3D_SOURCE, 'cyberpinball.cfg'), path.join(pauseDir, 'plugin.cfg'));
      console.log(`Plugin de la pause dans le casque : ${path.join('natif', 'cyberpinball', path.basename(pauseDll))}`);
    }
  }
  const mediapipe = path.dirname(require.resolve('@mediapipe/tasks-vision', { paths: [path.join(repo, 'app')] }));
  const vendor = path.join(stage, 'vendor', 'mediapipe');
  fs.mkdirSync(vendor, { recursive: true });
  for (const [from, name] of [['vision_bundle.js', 'vision_bundle.js'], [path.join('wasm', 'vision_wasm_internal.js'), 'vision_wasm_internal.js'], [path.join('wasm', 'vision_wasm_internal.wasm'), 'vision_wasm_internal.wasm'], ['package.json', 'package.json']]) {
    // package.json : nom, version et licence (Apache-2.0) de MediaPipe, avec ses fichiers.
    if (fs.existsSync(path.join(mediapipe, from))) fs.copyFileSync(path.join(mediapipe, from), path.join(vendor, name));
  }
  copyTree(path.join(repo, 'app', 'ressources', 'vision3d'), path.join(stage, 'ressources', 'vision3d'));
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
  copyTree(path.join(repo, 'node_modules', pkg), path.join(stage, 'node_modules', pkg), { filter: koffiRuntime });
}
const versionOf = (pkg) => require(path.join(repo, 'node_modules', pkg, 'package.json')).version;

// sodium-native et udx-native, avec les paquets qu'ils chargent eux-mêmes (require-addon…) :
// le JavaScript, la licence et le seul binaire de cette plateforme (prebuilds\win32-x64).
const nativeNet = new Set();
const closure = (pkg) => {
  if (nativeNet.has(pkg)) return;
  nativeNet.add(pkg);
  const meta = require(path.join(repo, 'node_modules', pkg, 'package.json'));
  for (const dep of Object.keys({ ...meta.dependencies, ...meta.optionalDependencies })) closure(dep);
};
for (const pkg of NATIVE_NET) closure(pkg);
for (const pkg of nativeNet) {
  const from = path.join(repo, 'node_modules', pkg);
  copyTree(from, path.join(stage, 'node_modules', pkg), {
    filter: (src) => {
      const rel = path.relative(from, src).split(path.sep);
      if (rel[0] === 'prebuilds' && rel[1] && rel[1] !== `${process.platform}-${process.arch}`) return false;
      if (['test', 'examples', 'deps', 'vendor', 'include', 'src', 'docs'].includes(rel[0])) return false;
      if (fs.statSync(src).isDirectory()) return true;
      const name = path.basename(src);
      return /^LICENSE/i.test(name) || /\.(c?js|mjs|json|node)$/.test(name);
    },
  });
}

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
// (comme après un changement d'Electron).
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
      dependencies: { koffi: versionOf('koffi'), [koffiNative]: versionOf(koffiNative), ...Object.fromEntries(NATIVE_NET.map((pkg) => [pkg, versionOf(pkg)])) },
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

  // Le veilleur de la relance par Start (CyberPinball.exe --veilleur, sans fenêtre) tient
  // l'exécutable : arrêté d'abord, Cyber Pinball le relance à son prochain démarrage.
  const watcherPidFile = path.join(root, 'data', 'relance-start', 'veilleur.pid');
  const watcherPid = fs.existsSync(watcherPidFile) ? Number.parseInt(fs.readFileSync(watcherPidFile, 'utf8'), 10) : NaN;
  if (watcherPid > 0) {
    spawnSync('taskkill', ['/T', '/F', '/FI', `PID eq ${watcherPid}`, '/FI', 'IMAGENAME eq CyberPinball.exe'], { stdio: 'ignore' });
    Atomics.wait(new Int32Array(new SharedArrayBuffer(4)), 0, 0, 500);
  }
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
