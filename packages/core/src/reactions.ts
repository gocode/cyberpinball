// Réactions par emoji (16/11/2026) : les sept réactions courantes des messageries (J'aime, J'adore,
// Solidaire, Haha, Waouh, Triste, Grrr), les mêmes partout où l'on écrit : messages privés
// (chat.ts) et salons (rooms.ts), et toute discussion à venir (groupes). Un joueur pose au plus une
// réaction par message ; la reposer la retire, en choisir une autre la remplace.
//
// Ici, rien du réseau ni de l'écran : la liste, l'emoji, le mot, et le décompte affiché sous un message.

import { t } from './i18n';

/** Les réactions proposées, dans l'ordre affiché. `like` garde l'identifiant de l'ancien « J'aime ». */
export const REACTIONS = ['like', 'love', 'care', 'haha', 'wow', 'sad', 'angry'] as const;
export type Reaction = (typeof REACTIONS)[number];

export const REACTION_EMOJI: Readonly<Record<Reaction, string>> = { like: '👍', love: '❤️', care: '🥰', haha: '😆', wow: '😮', sad: '😢', angry: '😡' };

export const isReaction = (v: unknown): v is Reaction => typeof v === 'string' && (REACTIONS as readonly string[]).includes(v);

/** Le mot d'une réaction, dans la langue de la borne. */
export function reactionName(r: Reaction): string {
  switch (r) {
    case 'like':
      return t('J’aime');
    case 'love':
      return t('J’adore');
    case 'care':
      return t('Solidaire');
    case 'haha':
      return t('Haha');
    case 'wow':
      return t('Waouh');
    case 'sad':
      return t('Triste');
    case 'angry':
      return t('Grrr');
  }
}

/** L'emoji suivi de son mot : « 👍 J'aime ». */
export const reactionText = (r: Reaction): string => `${REACTION_EMOJI[r]} ${reactionName(r)}`;

/** Une réaction comptée sous un message : l'emoji, combien de joueurs, et si j'en suis. */
export interface ReactionCount {
  kind: Reaction;
  emoji: string;
  count: number;
  mine: boolean;
}

/**
 * Les réactions d'un message, une pastille par emoji, dans l'ordre de REACTIONS : chaque joueur
 * compte une fois (sa dernière réaction), `null` (retirée) ne compte pas.
 */
export function countReactions(list: readonly { key: string; kind: Reaction | null }[], me: string): ReactionCount[] {
  const last = new Map<string, Reaction | null>();
  for (const r of list) last.set(r.key, r.kind);
  return REACTIONS.flatMap((kind) => {
    const who = [...last.entries()].filter(([, k]) => k === kind).map(([key]) => key);
    return who.length ? [{ kind, emoji: REACTION_EMOJI[kind], count: who.length, mine: who.includes(me) }] : [];
  });
}

/** Une pastille en texte : « 👍 2 », ou « 👍 » seul pour une seule réaction. */
export const reactionChip = (c: Pick<ReactionCount, 'emoji' | 'count'>): string => (c.count > 1 ? `${c.emoji} ${c.count}` : c.emoji);
