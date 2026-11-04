// Restauration préparée (Sauvegardes, backups-menu.ts) : ses fichiers sont posés ici, au tout
// début du démarrage, avant que la langue, le modèle de borne, les amis ou VPinballX.ini ne soient
// lus. Ainsi rien de ce que Cyber Pinball avait en mémoire ne réécrit un fichier restauré. Chaque
// fichier actuel part à la corbeille ; le constat (restauration-derniere.json) est montré dans
// Sauvegardes et permet d'annuler.

import { applyPendingRestore, layoutOf } from '@cyberpinball/core';
import { locations } from './paths';

const loc = locations();
if (loc.root) {
  try {
    const applied = applyPendingRestore(loc.root, loc.dataDir, layoutOf(loc.root).trash);
    if (applied) console.log(`Restauration posée au démarrage : ${applied.put.length} fichiers, ${applied.failed.length} en échec, état d'avant dans ${applied.trashDir}`); // i18n-ignore : journal
  } catch (error) {
    console.error(`Restauration au démarrage impossible : ${(error as Error).message}`); // i18n-ignore : journal
  }
}
