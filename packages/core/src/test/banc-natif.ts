// Bancs natifs des plugins VPX (build\vision3d\Release\banc-*.exe), construits à la main par
// node scripts/vision3d.mjs, jamais par les suites. Un banc construit avant la dernière modification
// de ses sources essaie un autre code que celui du dépôt : le 25/11/2026, le train lançait un
// banc-arrets.exe de 11 h 52 qui échouait sur un défaut corrigé depuis dans arrets.h. Un banc périmé
// est donc écarté, en le disant, comme un banc pas construit. Sa date est celle de la dernière
// construction réussie (Release\construit.txt, écrit par scripts/vision3d.mjs) : MSBuild ne refait
// pas un banc dont les sources n'ont pas bougé.

import * as fs from 'node:fs';
import * as path from 'node:path';

const repo = path.join(__dirname, '..', '..', '..', '..');
const SOURCES = path.join(repo, 'packages', 'vpx-vision3d');
const RELEASE = path.join(repo, 'build', 'vision3d', 'Release');

/** Date de la plus récente des sources du dossier (fichiers C/C++ et CMake). */
export function newestSourceMs(dir: string): number {
  let newest = 0;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) newest = Math.max(newest, newestSourceMs(full));
    else if (/\.(h|hpp|c|cpp|cc|cmake)$|^CMakeLists\.txt$/i.test(entry.name)) newest = Math.max(newest, fs.statSync(full).mtimeMs);
  }
  return newest;
}

/** Le banc à lancer, ou pourquoi il ne l'est pas (pas construit, ou plus ancien que ses sources). */
export function nativeBench(name: string): { exe: string } | { skip: string } {
  const exe = path.join(RELEASE, name);
  if (!fs.existsSync(exe)) return { skip: 'banc pas construit (node scripts/vision3d.mjs)' };
  const built = path.join(RELEASE, 'construit.txt');
  const builtMs = Math.max(fs.statSync(exe).mtimeMs, fs.existsSync(built) ? fs.statSync(built).mtimeMs : 0);
  if (builtMs < newestSourceMs(SOURCES)) return { skip: `banc périmé : ${name} est plus ancien que ses sources (node scripts/vision3d.mjs)` };
  return { exe };
}
