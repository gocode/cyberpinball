// Doublure des contenus des amis (friend-content.ts), voir neutre.ts : tout ami est hors ligne, rien
// n'arrive ; les dossiers où écrire ne sont pas simulés (à donner par l'appelant).

import type { FriendContent } from '../friend-content';
import { noop, overlay, unsimulated } from './neutre';

export function fakeFriendContent(over?: Partial<FriendContent>): FriendContent {
  return overlay<FriendContent>(
    {
      library: () => ({ state: 'offline' }),
      refresh: noop,
      tableVersions: () => new Map(),
      fetch: async (_key, _tableId, medias) => ({ received: [], failed: medias.map((media) => ({ media, reason: 'offline' as const })) }),
      tableFiles: async () => 'offline',
      fetchTable: async (_key, _tableId, folder, files) => ({ dir: folder, received: [], failed: files.map((file) => ({ file, reason: 'offline' as const })) }),
      fetchFile: async () => ({ reason: 'offline' }),
      tableDir: unsimulated('fakeFriendContent.tableDir'),
      receivedDir: unsimulated('fakeFriendContent.receivedDir'),
      stop: noop,
    },
    over,
  );
}
