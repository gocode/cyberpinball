// Doublures des parties d'hôtes de menus imitées à plusieurs endroits, voir neutre.ts : les amis et
// les parties de l'activité récente (activity-menu.ts), les messages de l'accueil de la communauté
// (community-menu.ts). Personne, rien en attente, rien ne s'ouvre.

import type { ActivityMenuHost } from '../activity-menu';
import type { CommunityMenuHost } from '../community-menu';
import { noop, overlay } from './neutre';

export function fakeActivityFriends(over?: Partial<ActivityMenuHost['friends']>): ActivityMenuHost['friends'] {
  return overlay<ActivityMenuHost['friends']>(
    { isFriend: () => false, online: () => false, playing: () => false, incoming: () => false, openFriend: noop, openRequests: noop },
    over,
  );
}

export function fakeActivityLive(over?: Partial<ActivityMenuHost['live']>): ActivityMenuHost['live'] {
  return overlay<ActivityMenuHost['live']>(
    {
      hasInvite: () => false,
      inviteEnd: () => undefined,
      openInvite: noop,
      current: () => undefined,
      open: noop,
      inHistory: () => false,
      openHistory: noop,
    },
    over,
  );
}

export function fakeCommunityMessages(over?: Partial<CommunityMenuHost['messages']>): CommunityMenuHost['messages'] {
  return overlay<CommunityMenuHost['messages']>({ detail: () => '', attention: () => false, quiet: () => true, open: noop }, over);
}
