// Mémoires de ROM réelles, relevées le 17/11/2026 au banc libpinmame (la libpinmame de VPX 10.8.1,
// sans fenêtre ni son audible), et les cartes qui les décrivent (dossier memoires-rom) :
// - <rom>-usine.nv.gz : la mémoire que la ROM écrit d'elle-même, partie sans mémoire puis arrêtée ;
// - <rom>-<volume>.nv.gz : la mémoire réécrite par la ROM après un démarrage sur ce volume, posé avec
//   une somme de contrôle juste (elle l'a gardé) ;
// - <rom>.map.json, platform_<plateforme>.json : cartes du projet Pinball Memory Maps, par Tom Collins,
//   licence Open Database License (ODbL v1.0) ; seule l'adresse de l'auteur a été retirée du copyright.
// ROM : Monster Bash (mb_106b, WPC-95), The Addams Family (taf_l7, WPC), Star Trek (st_161h, Stern SAM),
// The Walking Dead (twd_160h, Stern SAM), Back to the Future (bttf_a27, Data East, sans volume en mémoire).

import * as fs from 'node:fs';
import * as path from 'node:path';
import { gunzipSync } from 'node:zlib';
import type { RomMemory } from '../ballcount';
import { REPO_ROOT } from './i18n-scan';

export const MEMOIRES_ROM = path.join(REPO_ROOT, 'packages', 'core', 'src', 'test', 'memoires-rom');

/** La carte d'une ROM et sa plateforme (mb_106, taf_l7, st_161h, twd_160h, bttf_a27). */
export function realMemory(map: string): RomMemory {
  const m = JSON.parse(fs.readFileSync(path.join(MEMOIRES_ROM, `${map}.map.json`), 'utf8')) as RomMemory['map'];
  const platform = JSON.parse(fs.readFileSync(path.join(MEMOIRES_ROM, `platform_${m._metadata!.platform as string}.json`), 'utf8')) as RomMemory['platform'];
  return { map: m, platform };
}

/** Une mémoire relevée : `<rom>-usine` (écrite par la ROM partie sans mémoire) ou `<rom>-<volume>`. */
export function realNv(name: string): Buffer {
  return gunzipSync(fs.readFileSync(path.join(MEMOIRES_ROM, `${name}.nv.gz`)));
}

/** Les cartes en cache, comme loadRomMemory les range (index.json, la carte, sa plateforme). */
export function cacheRealMaps(dir: string, maps: Record<string, string>): string {
  const index: Record<string, string> = {};
  fs.mkdirSync(dir, { recursive: true });
  for (const [rom, map] of Object.entries(maps)) {
    const memory = realMemory(map);
    index[rom] = `maps/test/${map}.map.json`;
    fs.writeFileSync(path.join(dir, `maps_test_${map}.map.json`), JSON.stringify(memory.map));
    fs.writeFileSync(path.join(dir, `platform_${memory.map._metadata!.platform as string}.json`), JSON.stringify(memory.platform));
  }
  fs.writeFileSync(path.join(dir, 'index.json'), JSON.stringify(index));
  return dir;
}
