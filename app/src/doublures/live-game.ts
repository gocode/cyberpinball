// Doublure des parties en direct (live-game.ts), voir neutre.ts : aucune partie, aucune invitation ;
// créer ou rejoindre une partie n'est pas simulé (à donner par l'appelant).

import type { LiveGames } from '../live-game';
import { noop, overlay, unsimulated } from './neutre';

export function fakeLiveGames(over?: Partial<LiveGames>): LiveGames {
  return overlay<LiveGames>(
    {
      current: () => undefined,
      board: () => [],
      history: () => [],
      table: () => undefined,
      versionOf: async () => ({}),
      bytesOf: () => undefined,
      manualOf: async () => undefined,
      waitView: () => undefined,
      invites: () => [],
      inviteEnd: () => undefined,
      create: unsimulated('fakeLiveGames.create'),
      openInstant: unsimulated('fakeLiveGames.openInstant'),
      instantGames: () => [],
      joinInstant: unsimulated('fakeLiveGames.joinInstant'),
      joinPending: () => false,
      invite: () => false,
      matchFor: unsimulated('fakeLiveGames.matchFor'),
      accept: unsimulated('fakeLiveGames.accept'),
      decline: noop,
      start: () => false,
      leave: noop,
      close: noop,
      stop: noop,
    },
    over,
  );
}
