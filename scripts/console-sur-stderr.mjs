// Chargé avant chaque fichier de test (`node --import` ; voir NODE_TEST_ARGS dans tests-node.mjs).
//
// node --test lit sur la sortie standard de chaque fichier de test ses résultats, sérialisés. Un
// console.log du code testé y écrit du texte au milieu ; quand la machine est chargée, le texte et
// un message sérialisé arrivent dans le même morceau, et le lanceur échoue sur « Unable to
// deserialize cloned data due to invalid or unsupported version » : le fichier entier est compté en
// échec alors que ses tests passent (dedicated-menu, 21/11/2026). Ici, le texte de la console part
// sur la sortie d'erreur, que le lanceur rend telle quelle sans la mêler à ses messages.
//
// Il charge aussi la veille des tests figés (veille-tests.mjs) : un test sans aucun progrès pendant
// 5 min échoue, sans qu'un fichier long mais sain soit interrompu.

import { format } from 'node:util';
import './veille-tests.mjs';
import { isolerTemp } from './temp-tests.mjs';

// Le dossier temporaire du processus, à lui et vidé à la sortie (scripts/temp-tests.mjs).
isolerTemp();

for (const name of ['log', 'info', 'debug']) {
  console[name] = (...args) => {
    process.stderr.write(`${format(...args)}\n`);
  };
}
