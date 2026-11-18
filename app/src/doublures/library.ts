// Doublures de l'écran des tables (library.ts), voir neutre.ts :
// - l'hôte que reçoit createLibrary (LibraryHost) : aucune table, rien ne se lance, mode invité inactif ;
// - la vue de l'écran des tables qu'ont les menus (`library` de chaque hôte de menu) : rien ne s'ouvre.

import { navigationKeys } from '@cyberpinball/core';
import type { AccountMenuHost } from '../account-menu';
import type { ActivityMenuHost } from '../activity-menu';
import type { createCollectionsItem } from '../collections-menu';
import type { CommunityMenuHost } from '../community-menu';
import type { FriendLibraryMenuHost } from '../friend-library-menu';
import type { FriendsMenuHost } from '../friends-menu';
import type { HardwareDmdMenuHost } from '../hardware-dmd-menu';
import type { InboxMenuHost } from '../inbox-menu';
import type { LibraryHost } from '../library-types';
import type { RankingsMenuHost } from '../rankings-menu';
import type { RoomsMenuHost } from '../rooms-menu';
import { noop, overlay } from './neutre';

/** L'hôte de createLibrary ; la racine et le dossier des données sont toujours ceux de l'appelant. */
export function fakeLibraryHost(over: Partial<LibraryHost> & Pick<LibraryHost, 'root' | 'dataDir'>): LibraryHost {
  return overlay<LibraryHost>(
    {
      root: over.root,
      dataDir: over.dataDir,
      vpxExe: () => undefined,
      tables: () => [],
      reload: noop,
      enter: noop,
      leave: noop,
      play: noop,
      quit: noop,
      keys: () => navigationKeys(undefined),
      windows: () => new Map(),
      broadcast: noop,
      // Mode invité inactif : toute porte est ouverte.
      guest: { active: false, allows: () => true, knock: () => true },
    },
    over,
  );
}

/** Tout ce que les menus demandent à l'écran des tables, réuni. */
export type MenuLibrary = AccountMenuHost['library'] &
  ActivityMenuHost['library'] &
  CommunityMenuHost['library'] &
  FriendsMenuHost['library'] &
  FriendLibraryMenuHost['library'] &
  InboxMenuHost['library'] &
  RankingsMenuHost['library'] &
  RoomsMenuHost['library'] &
  HardwareDmdMenuHost['library'] &
  Parameters<typeof createCollectionsItem>[0]['library'];

/** La vue de l'écran des tables d'un menu : rien ne s'ouvre, rien n'est affiché, une tâche est faite tout de suite. */
export function fakeMenuLibrary(over?: Partial<MenuLibrary>): MenuLibrary {
  return overlay<MenuLibrary>(
    {
      openCustom: noop,
      openSystem: noop,
      openPrompt: noop,
      openNotice: noop,
      openScores: noop,
      openDownloads: noop,
      openMediasWith: noop,
      catalogFor: noop,
      installReceived: noop,
      runSystemItem: noop,
      hasSystemItem: () => false,
      cursor: () => 0,
      isShowing: () => false,
      leave: noop,
      task: async (_message, work) => {
        await work();
      },
    },
    over,
  );
}
