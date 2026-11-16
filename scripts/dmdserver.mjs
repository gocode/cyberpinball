// Construit cyberpinball-dmdserver (packages/dmdserver) : le dmdserver de libdmdutil sur le dmdutil64.dll
// que VPX installe (image du menu sur le DMD réel, app/src/dmd-server.ts).
//   node scripts/dmdserver.mjs                          -> build\dmdserver\Release\cyberpinball-dmdserver.exe
//   node scripts/dmdserver.mjs --verifier --vpx <VPX>   -> construit, puis vérifie <VPX>\plugins\dmdutil\dmdutil64.dll
// Demande CMake et les outils C++ de Visual Studio (Build Tools 2022), comme le plugin Vision 3D. Sans
// eux : un message, code de sortie 2 ; l'application part sans lui et « Image du menu » le dit.

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { cmakePath } from './casque-vr.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const DMDSERVER_SOURCE = path.join(repo, 'packages', 'dmdserver');
const build = path.join(repo, 'build', 'dmdserver');
export const DMDSERVER_EXE = path.join(build, 'Release', 'cyberpinball-dmdserver.exe');

/** Construit le serveur ; renvoie le chemin de l'exécutable, ou undefined (raison écrite sur la console). */
export function buildDmdServer({ quiet = false } = {}) {
  const cmake = cmakePath();
  if (!cmake) {
    console.log('dmdserver : CMake absent, pas construit (winget install Kitware.CMake).');
    return undefined;
  }
  const stdio = quiet ? 'pipe' : 'inherit';
  const run = (args) => spawnSync(cmake, args, { cwd: repo, stdio, encoding: 'utf8', windowsHide: true });
  const configure = run(['-S', DMDSERVER_SOURCE, '-B', build, '-G', 'Visual Studio 17 2022', '-A', 'x64']);
  if (configure.status !== 0) {
    console.log('dmdserver : configuration impossible (outils C++ de Visual Studio 2022 absents ?).');
    if (quiet) console.log(configure.stdout, configure.stderr);
    return undefined;
  }
  const compile = run(['--build', build, '--config', 'Release']);
  if (compile.status !== 0 || !fs.existsSync(DMDSERVER_EXE)) {
    console.log('dmdserver : compilation échouée.');
    if (quiet) console.log(compile.stdout, compile.stderr);
    return undefined;
  }
  return DMDSERVER_EXE;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exe = buildDmdServer();
  if (!exe) process.exit(2);
  console.log(`dmdserver : ${exe}`);
  if (process.argv.includes('--verifier')) {
    const vpx = process.argv[process.argv.indexOf('--vpx') + 1];
    if (!process.argv.includes('--vpx') || !vpx) {
      console.log('--verifier demande --vpx <dossier de VPX 10.8.1>.');
      process.exit(2);
    }
    const check = spawnSync(exe, ['--verifier', '-d', path.join(vpx, 'plugins', 'dmdutil')], { stdio: 'inherit', windowsHide: true });
    process.exit(check.status ?? 1);
  }
}
