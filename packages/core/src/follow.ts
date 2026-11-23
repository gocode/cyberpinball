// « Nous suivre » : les endroits où l'on trouve Cyber Pinball hors de la borne (décision du
// 20/11/2026). Dans l'ordre voulu : Facebook, YouTube, GitHub ; le site s'ajoutera ici quand il
// existera. Une seule source pour toutes les adresses : la page « Nous suivre » de la borne
// (app/src/follow-menu.ts), l'encart du téléphone et les README la reprennent.
//
// La langue choisit la page Facebook : la page francophone pour une interface en français, la page
// anglophone pour toute autre langue (celles à venir comprises). Les vidéos YouTube sont en
// français, avec une piste doublée en anglais : une seule adresse pour tous.

import { language as currentLanguage, t, type Language } from './i18n';
import type { IconName } from './icons';

export type FollowNetwork = 'facebook' | 'youtube' | 'github';

/** Une icône par réseau, du registre commun (pas de logo de marque), toutes différentes dans la liste. */
const FOLLOW_ICONS: Record<FollowNetwork, IconName> = { facebook: 'friends', youtube: 'video', github: 'book' };

export interface FollowLink {
  network: FollowNetwork;
  icon: IconName;
  /** Nom du réseau : il ne se traduit pas. */
  name: string;
  url: string;
  /** L'adresse sans « https://www. », pour l'écrire sous un QR code. */
  short: string;
  /** Ce qu'on y trouve, dans la langue de l'interface. */
  purpose: string;
}

/** Adresses officielles. Facebook : `fr` pour une interface en français, `other` pour toutes les autres langues. */
export const FOLLOW_URLS = {
  facebook: { fr: 'https://www.facebook.com/cyberpinball.fr', other: 'https://www.facebook.com/cyberpinball' },
  youtube: 'https://www.youtube.com/@cyberpinball',
  github: 'https://github.com/gocode/cyberpinball',
} as const;

/** L'adresse sans protocole, sans « www. » ni barre finale. */
export function shortFollowUrl(url: string): string {
  return url.replace(/^https?:\/\/(www\.)?/, '').replace(/\/$/, '');
}

/** Les réseaux de Cyber Pinball, dans l'ordre de la page, pour une langue (par défaut, celle de l'interface). */
export function followLinks(lang: Language = currentLanguage()): FollowLink[] {
  const link = (network: FollowNetwork, name: string, url: string, purpose: string): FollowLink => ({ network, icon: FOLLOW_ICONS[network], name, url, short: shortFollowUrl(url), purpose });
  return [
    link('facebook', 'Facebook', lang === 'fr' ? FOLLOW_URLS.facebook.fr : FOLLOW_URLS.facebook.other, t('Les nouveautés et tes questions')),
    link('youtube', 'YouTube', FOLLOW_URLS.youtube, t('Les tutoriels vidéo, pas à pas')),
    link('github', 'GitHub', FOLLOW_URLS.github, t('Les versions et le code source')),
  ];
}
