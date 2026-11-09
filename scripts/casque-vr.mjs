// Construit le compagnon « menu dans le casque » (packages/casque-vr) :
//   node scripts/casque-vr.mjs   -> build\casque-vr\Release\cyberpinball-casque.exe
// Demande CMake et les outils C++ de Visual Studio (Build Tools 2022, charge « Développement
// Desktop en C++ »). Sans eux : un message, code de sortie 2, rien d'autre (la fabrication de
// l'application continue sans le compagnon ; le menu dans le casque dit alors qu'il manque).

import { spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const source = path.join(repo, 'packages', 'casque-vr');
const build = path.join(repo, 'build', 'casque-vr');
export const HEADSET_EXE = path.join(build, 'Release', 'cyberpinball-casque.exe');

/** CMake : dans le PATH, sinon à sa place d'installation. */
function cmakePath() {
  const found = spawnSync('cmake', ['--version'], { encoding: 'utf8', shell: false });
  if (found.status === 0) return 'cmake';
  const installed = path.join(process.env.ProgramFiles ?? 'C:\\Program Files', 'CMake', 'bin', 'cmake.exe');
  if (fs.existsSync(installed)) return installed;
  // winget installe CMake en portable, dans le profil : …\WinGet\Packages\Kitware.CMake_…\cmake-<version>\bin.
  const packages = process.env.LOCALAPPDATA && path.join(process.env.LOCALAPPDATA, 'Microsoft', 'WinGet', 'Packages');
  if (!packages || !fs.existsSync(packages)) return undefined;
  for (const pkg of fs.readdirSync(packages).filter((d) => d.startsWith('Kitware.CMake'))) {
    for (const dir of fs.readdirSync(path.join(packages, pkg)).filter((d) => d.startsWith('cmake-'))) {
      const exe = path.join(packages, pkg, dir, 'bin', 'cmake.exe');
      if (fs.existsSync(exe)) return exe;
    }
  }
  return undefined;
}

/** Construit le compagnon ; renvoie son chemin, ou undefined (raison écrite sur la console). */
export function buildHeadset({ quiet = false } = {}) {
  const cmake = cmakePath();
  if (!cmake) {
    console.log('Compagnon du casque : CMake absent, pas construit (winget install Kitware.CMake).');
    return undefined;
  }
  const stdio = quiet ? 'pipe' : 'inherit';
  const run = (args) => spawnSync(cmake, args, { cwd: repo, stdio, encoding: 'utf8' });
  const configure = run(['-S', source, '-B', build, '-G', 'Visual Studio 17 2022', '-A', 'x64']);
  if (configure.status !== 0) {
    console.log('Compagnon du casque : configuration impossible (outils C++ de Visual Studio 2022 absents ?).');
    if (quiet) console.log(configure.stdout, configure.stderr);
    return undefined;
  }
  const compile = run(['--build', build, '--config', 'Release']);
  if (compile.status !== 0 || !fs.existsSync(HEADSET_EXE)) {
    console.log('Compagnon du casque : compilation échouée.');
    if (quiet) console.log(compile.stdout, compile.stderr);
    return undefined;
  }
  return HEADSET_EXE;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const exe = buildHeadset();
  if (!exe) process.exit(2);
  console.log(`Compagnon du casque : ${exe}`);
}
