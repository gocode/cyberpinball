// Répondre en citant, mentionner un membre (demande du 20/11/2026) : ce que les écrans des messages
// entre amis (chat-menu.ts) et des groupes (groups-menu.ts) ont en commun. Le modèle est dans
// packages/core/src/citations.ts.
//
// - Une bulle qui répond porte sa citation au-dessus de son texte : l'auteur cité et l'extrait. Encore
//   chargé, le message cité se rejoint : la citation est un arrêt du curseur à elle (aux flippers comme à
//   la souris), juste avant sa bulle, et Start ramène au message cité. Disparu, la citation reste lisible
//   avec une mention discrète, et n'est plus un arrêt.
// - Les « @pseudo » des membres mentionnés sont mis en évidence dans la bulle, plus fortement quand
//   c'est moi.
// - « Mentionner un membre… » : la liste des membres (pas de saisie libre), Start ouvre le clavier avec
//   « @pseudo » déjà écrit.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module.

import { mentionPieces, t, type AvatarView, type QuoteView, type TextPiece } from '@cyberpinball/core';
import type { Action, Built, Row } from './library';

/** Clé de l'action d'une citation (« Voir le message cité ») ; celle d'une bulle est `line:<id>` (chat-cursor.ts). */
export const QUOTE_KEY = 'quote:';

/** La mention discrète d'une citation dont l'original n'est plus là. */
export function missingText(missing: QuoteView['missing']): string | undefined {
  if (missing === 'deleted') return t('message supprimé');
  if (missing === 'gone') return t('message plus affiché ici');
  return undefined;
}

/**
 * La citation d'une bulle, et son action quand le message cité est encore là : poussée dans `actions`
 * juste avant celle de la bulle (le curseur s'arrête sur la citation, puis sur la bulle).
 */
export function quoteRow(view: QuoteView, quoted: string, actions: Action[], go: (() => void) | undefined): NonNullable<Row['quote']> {
  const missing = missingText(view.missing);
  if (view.missing || !go) return { name: view.name, text: view.text, ...(missing ? { missing } : {}) };
  const action = actions.push({ label: t('Voir le message cité : « {text} »', { text: view.text.replace(/\s*\n\s*/g, ' ') }), key: `${QUOTE_KEY}${quoted}`, icon: 'message', run: go }) - 1;
  return { name: view.name, text: view.text, action };
}

/** Le texte d'une bulle en morceaux, ses mentions mises en évidence ; undefined s'il n'y en a aucune. */
export function bubblePieces(text: string, names: readonly { name: string; me?: boolean }[]): TextPiece[] | undefined {
  if (!names.length) return undefined;
  const pieces = mentionPieces(text, names);
  return pieces.some((p) => p.mention) ? pieces : undefined;
}

/** Rang de la bulle d'un message parmi les actions d'un écran (son action `line:<id>`) ; undefined s'il n'y est pas. */
export function lineAt(built: { actions: readonly { key?: string }[] }, id: string): number | undefined {
  const i = built.actions.findIndex((a) => a.key === `line:${id}`);
  return i >= 0 ? i : undefined;
}

/**
 * « Mentionner un membre » : les membres du groupe (moi excepté), Start ouvre le clavier avec
 * « @pseudo » déjà écrit. Choisis dans la liste, jamais saisis : un pseudo mal tapé ne mentionnerait
 * personne.
 */
export function buildMentionPicker(opts: {
  group: string;
  members: readonly { key: string; name: string; avatar?: AvatarView; online?: boolean }[];
  pick: (member: { key: string; name: string }) => void;
  back: () => void;
}): Built {
  const actions: Action[] = [];
  const rows: Row[] = opts.members.map((m) => {
    const index = actions.push({ label: m.name, key: `mention:${m.key}`, icon: 'friends', run: () => opts.pick(m) }) - 1;
    return { text: m.name, detail: `@${m.name}`, ...(m.avatar ? { avatar: m.avatar } : { icon: 'friends' as const }), ...(m.online ? { aside: t('En ligne') } : {}), action: index, pick: true };
  });
  actions.push({ label: t('Annuler'), icon: 'back', run: opts.back });
  return {
    heading: t('Mentionner un membre'),
    icon: 'friends',
    subheading: opts.group,
    lead: t('Le membre choisi reçoit une notification, même s’il a coupé celles du groupe.'),
    sections: [{ title: t('Membres'), kind: 'players', rows: rows.length ? rows : [{ text: t('Personne d’autre dans ce groupe pour l’instant'), icon: 'friends', tone: 'quiet' }] }],
    actions,
    back: opts.back,
    listStart: t('mentionner'),
  };
}
