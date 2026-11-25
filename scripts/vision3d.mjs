// Construit les plugins VPX de Cyber Pinball (packages/vpx-vision3d) et leurs bancs d'essai, pour chaque API de
// plugins de VPX (un jeu de DLL par version, même source : packages/vpx-vision3d/CMakeLists.txt) :
//   node scripts/vision3d.mjs          -> build\vision3d\Release\plugin-*.dll (VPX 10.8.1)
//                                         build\vision3d\Release\vpx-10.9.0\plugin-*.dll (VPX 10.9.0)
//   node scripts/vision3d.mjs --banc   -> construit, puis lance le banc de Vision3D de chaque jeu (sans VPX ni écran)
// Demande CMake et les outils C++ de Visual Studio (Build Tools 2022), comme le compagnon du
// casque. Sans eux : un message, code de sortie 2 ; l'application part sans le plugin et
// l'entrée « Vision 3D » le dit.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmakePath } from './casque-vr.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const VISION3D_SOURCE = path.join(repo, 'packages', 'vpx-vision3d');
const build = path.join(repo, 'build', 'vision3d');
export const VISION3D_DLL = path.join(build, 'Release', 'plugin-vision3d64.dll');
export const VISION3D_BANC = path.join(build, 'Release', 'banc-vision3d.exe');
export const VISION3D_BUILT = path.join(build, 'Release', 'construit.txt');
/**
 * Dossier de chaque jeu de DLL des plugins, par API de plugins de VPX (app/src/vpx-plugins.ts, vpxPluginSetDir) :
 * 10.8.1 dans Release, les autres dans Release\vpx-<version>. Mêmes noms de fichiers partout.
 */
export const VPX_PLUGIN_BUILDS = { '10.8.1': path.join(build, 'Release'), '10.9.0': path.join(build, 'Release', 'vpx-10.9.0') };
/** Fausse Kinect10.dll des essais (CYBERPINBALL_KINECT_DLL). */
export const KINECT_FACTICE = path.join(build, 'Release', 'kinect-factice.dll');

/** Construit le plugin ; renvoie le chemin de la DLL, ou undefined (raison écrite sur la console). */
export function buildVision3d({ quiet = false } = {}) {
  const cmake = cmakePath();
  if (!cmake) {
    console.log('Plugin Vision 3D : CMake absent, pas construit (winget install Kitware.CMake).');
    return undefined;
  }
  const stdio = quiet ? 'pipe' : 'inherit';
  const run = (args) => spawnSync(cmake, args, { cwd: repo, stdio, encoding: 'utf8', windowsHide: true });
  const configure = run(['-S', VISION3D_SOURCE, '-B', build, '-G', 'Visual Studio 17 2022', '-A', 'x64']);
  if (configure.status !== 0) {
    console.log('Plugin Vision 3D : configuration impossible (outils C++ de Visual Studio 2022 absents ?).');
    if (quiet) console.log(configure.stdout, configure.stderr);
    return undefined;
  }
  const compile = run(['--build', build, '--config', 'Release']);
  if (compile.status !== 0 || !fs.existsSync(VISION3D_DLL)) {
    console.log('Plugin Vision 3D : compilation échouée.');
    if (quiet) console.log(compile.stdout, compile.stderr);
    return undefined;
  }
  // Témoin d'une construction réussie : tout ce qui est dans Release répond aux sources de cet instant, même un banc
  // que MSBuild n'a pas refait (à jour). Les essais écartent un banc plus ancien que ses sources (test/banc-natif.ts).
  fs.writeFileSync(VISION3D_BUILT, `${new Date().toISOString()}\n`);
  return VISION3D_DLL;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dll = buildVision3d();
  if (!dll) process.exit(2);
  console.log(`Plugin Vision 3D : ${dll}`);
  if (process.argv.includes('--banc')) {
    let status = 0;
    for (const [version, dir] of Object.entries(VPX_PLUGIN_BUILDS)) {
      console.log(`Banc de Vision3D, API de VPX ${version} :`);
      const banc = spawnSync(path.join(dir, 'banc-vision3d.exe'), [path.join(dir, 'plugin-vision3d64.dll')], { stdio: 'inherit', windowsHide: true });
      if (banc.status !== 0) status = banc.status ?? 1;
    }
    process.exit(status);
  }
}
