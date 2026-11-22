// Communauté à onglets (21/11/2026, planche « Engagement » validée) : ce que l'écran de la Communauté
// calcule sans rien savoir de l'écran. Deux choses :
// - les joueurs suggérés (« En ligne » de l'accueil et de l'onglet Joueurs) : ceux qui ne sont pas
//   encore mes amis, rangés par ce qui nous rapproche (tables en commun, même pays, niveau proche,
//   nouveaux venus), ceux en ligne d'abord. Ils remplacent les amis quand peu de monde est en ligne :
//   l'écran n'est jamais vide ;
// - les trois réponses toutes prêtes d'une conversation qui attend.
//
// Pur : les tests le chargent tel quel.

import { t } from './i18n';

/** Un joueur qu'on pourrait suggérer : ce que la borne sait de lui. */
export interface SuggestCandidate {
  key: string;
  name: string;
  country?: string;
  /** Son niveau (carte publique vraisemblable) ; inconnu : rien ne se compare. */
  level?: number;
  /** Tables que nous avons tous les deux (classements). */
  commonTables: number;
  online: boolean;
  /** Sur le même réseau local que ma borne. */
  nearby?: boolean;
  /** Amis que nous avons en commun (sa carte publique les cite, publicprofile.ts, mutualFriends). */
  mutual?: number;
}

/** Pourquoi un joueur est suggéré : la raison la plus forte, montrée sous son nom. */
export type SuggestReason = 'newcomer' | 'mutual' | 'tables' | 'nearby' | 'country' | 'level' | 'online';

export interface Suggestion {
  candidate: SuggestCandidate;
  reason: SuggestReason;
  score: number;
}

/** Un nouveau venu : un joueur encore aux tout premiers niveaux. */
export const NEWCOMER_MAX_LEVEL = 3;
/** Niveau proche : à trois niveaux du mien au plus. */
export const LEVEL_CLOSE = 3;

/**
 * Les joueurs à suggérer, les plus proches d'abord : amis en commun (le plus fort lien), tables en commun, même
 * réseau local, même pays, niveau proche, nouveau venu (qu'on accueille), puis ceux en ligne. Jamais
 * un ami, un joueur bloqué ou à qui j'ai déjà écrit une demande : `skip` les écarte.
 */
export function suggestPlayers(candidates: readonly SuggestCandidate[], me: { country?: string; level?: number }, skip: ReadonlySet<string>, max: number): Suggestion[] {
  const out: Suggestion[] = [];
  for (const c of candidates) {
    if (skip.has(c.key)) continue;
    const newcomer = c.level !== undefined && c.level <= NEWCOMER_MAX_LEVEL;
    const sameCountry = Boolean(me.country && c.country === me.country);
    const closeLevel = c.level !== undefined && me.level !== undefined && Math.abs(c.level - me.level) <= LEVEL_CLOSE;
    const tables = Math.min(c.commonTables, 5);
    // Un ami en commun rapproche plus que tout (22/11/2026 : développer le réseau d'amis).
    const mutual = Math.min(c.mutual ?? 0, 5);
    const score = mutual * 5 + tables * 3 + (c.nearby ? 6 : 0) + (sameCountry ? 4 : 0) + (closeLevel ? 3 : 0) + (newcomer ? 3 : 0) + (c.online ? 5 : 0);
    // La raison dite : celle qui pèse le plus, un nouveau venu toujours dit comme tel (on l'accueille).
    const reason: SuggestReason = newcomer ? 'newcomer' : mutual ? 'mutual' : c.nearby ? 'nearby' : tables >= 2 ? 'tables' : sameCountry ? 'country' : tables ? 'tables' : closeLevel ? 'level' : 'online';
    if (!score) continue;
    out.push({ candidate: c, reason, score });
  }
  return out.sort((a, b) => b.score - a.score || Number(b.candidate.online) - Number(a.candidate.online) || a.candidate.name.localeCompare(b.candidate.name)).slice(0, Math.max(0, max));
}

/** Les trois réponses toutes prêtes sous le message qui attend (dans la langue de la borne). */
export function quickReplies(): string[] {
  return [t('Partant !'), t('Quelle table ?'), t('Plus tard')];
}

/**
 * La page de téléchargement à donner à quelqu'un qu'on invite (QR code de « Inviter quelqu'un ») : les
 * versions en français, la section « Download » du README dans les autres langues.
 */
export const DOWNLOAD_PAGES = { fr: 'https://github.com/gocode/cyberpinball/releases', other: 'https://github.com/gocode/cyberpinball/#download' } as const;

export function downloadPage(lang: string): string {
  return lang === 'fr' ? DOWNLOAD_PAGES.fr : DOWNLOAD_PAGES.other;
}

/** Ce qu'on écrit dans le salon pour saluer un nouveau venu. */
export function welcomeLine(name: string): string {
  return t('Bienvenue {name} !', { name });
}
