// Un écran de la borne rangé pour une page plein écran du téléphone (lot 5 de la Communauté au
// téléphone, 18/11/2026 : Mon niveau, Mes badges, Comment gagner des XP). Une seule source : le
// téléphone ne recopie pas ces écrans, il reçoit celui de la borne (level-menu.ts), ses intertitres et
// ses lignes : texte, détail, valeur à droite, icône, badge officiel dessiné (niveau.js), barre de
// progression, badges de rareté, ton. Ni les actions (le téléphone a ses liens), ni rien d'autre
// qu'une ligne ne sait montrer : jamais un chemin, une pastille ou une image de la borne.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module.

import { remoteText } from '@cyberpinball/core';
import type { Built, Row } from './library';

/** Une ligne d'une page du téléphone. */
export interface RemotePageRow {
  text: string;
  detail?: string;
  aside?: string;
  icon?: string;
  /** Le badge officiel dessiné à gauche (CyberLevels.badgeSvg) : reçu, il brille. */
  medal?: { icon: string; rarity: string; earned: boolean };
  /** Une barre sous la ligne, de 0 à 1. */
  progress?: number;
  badges?: string[];
  tone?: string;
}

/** Une page plein écran : son titre, ce qu'elle dit d'abord, ses intertitres et leurs lignes. */
export interface RemotePageView {
  heading: string;
  subheading?: string;
  lead?: string;
  sections: { title?: string; rows: RemotePageRow[] }[];
}

const TEXT_MAX = 300;
const clip = (s: string) => remoteText(s, TEXT_MAX);

/** Une ligne de l'écran de la borne, telle que le téléphone la dessine. */
export function remotePageRow(r: Row): RemotePageRow {
  return {
    text: clip(r.text),
    ...(r.detail ? { detail: clip(r.detail) } : {}),
    ...(r.aside ? { aside: clip(r.aside) } : {}),
    ...(r.icon ? { icon: r.icon } : {}),
    ...(r.medal ? { medal: { icon: r.medal.icon, rarity: r.medal.rarity, earned: r.medal.earned } } : {}),
    ...(typeof r.progress?.value === 'number' ? { progress: Math.max(0, Math.min(1, r.progress.value)) } : {}),
    ...(r.badges?.length ? { badges: r.badges.slice(0, 4).map(clip) } : {}),
    ...(r.tone ? { tone: r.tone } : {}),
  };
}

/** L'écran de la borne rangé pour le téléphone : ses sections et leurs lignes, sans ses actions. */
export function remotePage(built: Built): RemotePageView {
  return {
    heading: clip(built.heading),
    ...(built.subheading ? { subheading: clip(built.subheading) } : {}),
    ...(built.lead ? { lead: clip(built.lead) } : {}),
    sections: built.sections.map((s) => ({ ...(s.title ? { title: clip(s.title) } : {}), rows: s.rows.map(remotePageRow) })),
  };
}
