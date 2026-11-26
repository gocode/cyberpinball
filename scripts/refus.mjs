// Les branches que le train a écartées d'un lot : leur cause, et le brief prêt à donner à une session pour les reprendre.
//   npm run refus                      -> la liste, avec le brief de chacune
//   npm run refus -- --effacer <branche>   -> oublie un refus (branche abandonnée)
// Un refus s'efface de lui-même quand la branche est reconfiée au train (npm run fusionner) ou fusionnée.
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';
import { coordinationDir } from './coordination.mjs';
import { clearRefus, readRefus, refusBrief } from './publication-groupee.mjs';

export function refus({ dir = coordinationDir(), argv = [], say = console.log } = {}) {
  const i = argv.indexOf('--effacer');
  if (i >= 0) {
    const branche = argv[i + 1];
    if (!branche) {
      say('Usage : npm run refus -- --effacer <branche>');
      return 1;
    }
    clearRefus(branche, dir);
    say(`Refus de ${branche} effacé.`);
    return 0;
  }
  const list = readRefus(dir);
  if (!list.length) {
    say('Aucune branche refusée par le train.');
    return 0;
  }
  for (const r of list) say(`--- ${r.branche}\n${refusBrief(r)}\n`);
  return 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  process.exit(refus({ argv: process.argv.slice(2) }));
}
