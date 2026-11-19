// Garde des liens physiques, branchée dès le démarrage de chaque point d'entrée (main.ts,
// sync-cli.ts, fulldmd-cli.ts), avant tout module qui écrit : une table reprise d'une autre
// installation partage ses gros fichiers avec elle (liens physiques NTFS, hardlink.ts), et une
// écriture sur place dans l'un d'eux modifierait l'original. La garde coupe le lien avant. Fixé
// par liens-physiques.test.ts.

import { installHardLinkGuard } from '@cyberpinball/core';

installHardLinkGuard();
