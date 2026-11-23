// Messages en attente (pastille des messages au coin d'état du menu des tables, 17/11/2026) : ce qui
// attend une lecture, réuni sur un écran, une ligne par conversation (jamais une par message) : les
// messages d'un ami, la discussion d'un groupe, les mentions dans un salon. Start ouvre la
// conversation, qui se lit là où elle se tient (chat-menu.ts, groups-menu.ts, rooms-menu.ts) ; son
// « Retour » revient ici. Dessous, les accès rapides de la communauté : Messages, Groupes, Salons,
// Activité récente.
//
// La pastille compte les messages non lus des conversations qui ne sont pas en sourdine ; rien
// quand rien n'attend (un zéro ne dit rien à qui passe devant la borne). Une conversation en
// sourdine reste sur l'écran, en dernier, avec son repère.
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des conversations d'essai.

import { language, t, tn, type AvatarView, type IconName } from '@cyberpinball/core';
import type { Action, Built, Row, Section } from './library';
import type { MessageKind } from './activity-menu';

/** Une conversation où quelque chose attend. */
export interface InboxThread {
  kind: MessageKind;
  /** La clé de l'ami, l'identifiant du groupe ou du salon. */
  id: string;
  /** Le pseudo de l'ami, le nom du groupe, « Salon France ». */
  name: string;
  /** Messages non lus (mentions non lues dans un salon). */
  unread: number;
  /** En sourdine : ses messages arrivent sans carte ni son ; hors du compte de la pastille. */
  muted?: boolean;
  /** Le dernier message reçu : son auteur (groupe, salon), son texte, son heure (ms). */
  last?: { who?: string; text: string; at: number };
  avatar?: AvatarView;
}

/** Un accès rapide de la communauté. */
export interface InboxLink {
  label: string;
  detail?: string;
  icon: IconName;
  /** Quelque chose y attend (une demande, une invitation). */
  attention?: boolean;
  open(back: () => void): void;
}

export interface InboxMenuHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
  };
  /** Les conversations où des messages attendent. */
  threads(): InboxThread[];
  open(kind: MessageKind, id: string, back: () => void): void;
  /** Messages, Groupes, Salons, Activité récente. */
  links(): InboxLink[];
  now?: () => number;
}

export interface InboxMenu {
  /** L'écran ; `back` : son « Retour ». */
  open(back: () => void): void;
  /** La pastille du coin d'état : undefined quand rien n'attend. */
  pill(): { count: number; title: string } | undefined;
}

/** Les messages qui comptent pour la pastille : ceux des conversations qui ne sont pas en sourdine. */
export function inboxCount(threads: readonly InboxThread[]): number {
  return threads.reduce((n, x) => n + (x.muted ? 0 : x.unread), 0);
}

/** Les conversations à montrer : les plus récentes d'abord, celles en sourdine en dernier. */
export function inboxOrder(threads: readonly InboxThread[]): InboxThread[] {
  return threads.filter((x) => x.unread > 0).sort((a, b) => Number(!!a.muted) - Number(!!b.muted) || (b.last?.at ?? 0) - (a.last?.at ?? 0));
}

const ICONS: Record<MessageKind, IconName> = { 'friend-message': 'message', 'group-message': 'group', 'room-mention': 'globe', 'team-message': 'report' };

export function createInboxMenu(host: InboxMenuHost): InboxMenu {
  const now = () => host.now?.() ?? Date.now();
  let back: () => void = () => {};

  const time = (at: number): string => {
    const locale = language() === 'en' ? 'en-GB' : 'fr-FR';
    const d = new Date(at);
    const sameDay = new Date(now()).toDateString() === d.toDateString();
    return sameDay ? d.toLocaleTimeString(locale, { hour: '2-digit', minute: '2-digit' }) : d.toLocaleDateString(locale, { day: 'numeric', month: 'short' });
  };

  function title(kind: MessageKind, unread: number): string {
    if (kind === 'room-mention') return tn(unread, '{n} mention non lue', '{n} mentions non lues');
    return tn(unread, '{n} non lu', '{n} non lus');
  }

  function build(): Built {
    const threads = inboxOrder(host.threads());
    const actions: Action[] = [];
    const sections: Section[] = [];
    const here = (at: number) => () => host.library.openCustom(build, at);
    const rows: Row[] = threads.map((x) => {
      const index: number = actions.push({ label: x.name, key: `inbox:${x.kind}:${x.id}`, icon: ICONS[x.kind], run: () => host.open(x.kind, x.id, here(index)) }) - 1;
      const said = x.last ? (x.last.who ? t('{name} : {text}', { name: x.last.who, text: x.last.text }) : x.last.text) : undefined;
      const kindText = x.kind === 'friend-message' ? t('Message privé') : x.kind === 'group-message' ? t('Groupe') : x.kind === 'team-message' ? t('Réponse de l’équipe') : t('Salon');
      return {
        text: x.name,
        detail: said ? `${kindText} · ${said}` : kindText,
        icon: ICONS[x.kind],
        ...(x.avatar ? { avatar: x.avatar } : {}),
        badges: [title(x.kind, x.unread), ...(x.last ? [time(x.last.at)] : []), ...(x.muted ? [t('Sourdine')] : [])],
        ...(x.muted ? { tone: 'quiet' as const } : { unread: true }),
        action: index,
        pick: true,
      };
    });
    const count = inboxCount(threads);
    sections.push(
      rows.length
        ? { title: t('En attente'), rows }
        : { rows: [{ text: t('Aucun message en attente'), detail: t('Les messages de tes amis, de tes groupes et les mentions dans les salons s’afficheront ici.'), icon: 'info', tone: 'info' }] },
    );
    const links = host.links();
    if (links.length) {
      sections.push({
        title: t('Communauté'),
        rows: links.map((l) => {
          const index: number = actions.push({ label: l.label, icon: l.icon, run: () => l.open(here(index)) }) - 1;
          return { text: l.label, ...(l.detail ? { detail: l.detail } : {}), icon: l.icon, ...(l.attention ? { unread: true } : {}), action: index, pick: true };
        }),
      });
    }
    actions.push({ label: t('Retour'), icon: 'back', run: () => back() });
    return {
      heading: t('Messages en attente'),
      icon: 'inbox',
      ...(count ? { subheading: tn(count, '{n} message attend ta lecture', '{n} messages attendent ta lecture') } : {}),
      sections,
      actions,
      back: () => back(),
      listStart: t('ouvrir la conversation'),
    };
  }

  return {
    open(to) {
      back = to;
      host.library.openCustom(build, 0);
    },
    pill() {
      const count = inboxCount(host.threads());
      if (!count) return undefined;
      return { count, title: tn(count, '{n} message en attente', '{n} messages en attente') };
    },
  };
}
