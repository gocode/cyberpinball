// Construit le plugin VPX « Vision3D » (packages/vpx-vision3d) et son banc d'essai :
//   node scripts/vision3d.mjs          -> build\vision3d\Release\plugin-vision3d64.dll
//   node scripts/vision3d.mjs --banc   -> construit, puis lance le banc (sans VPX ni écran)
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
  return VISION3D_DLL;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const dll = buildVision3d();
  if (!dll) process.exit(2);
  console.log(`Plugin Vision 3D : ${dll}`);
  if (process.argv.includes('--banc')) {
    const banc = spawnSync(VISION3D_BANC, [dll], { stdio: 'inherit', windowsHide: true });
    process.exit(banc.status ?? 1);
  }
}
