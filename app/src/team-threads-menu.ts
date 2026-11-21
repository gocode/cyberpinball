// Les échanges avec l'équipe, à l'écran (team-threads.ts, 21/11/2026) : la liste des fils (rapports,
// plantages, propositions auxquels l'équipe a répondu ou où le joueur a écrit) et chaque fil comme
// une conversation, l'équipe d'un côté, le joueur de l'autre, avec « Répondre à l'équipe… » (clavier à
// l'écran ou téléphone). On y arrive par les Messages en attente (une réponse non lue), la notification
// d'une réponse et « Mes échanges avec l'équipe » de Retours et propositions.
//
// Sans electron à l'exécution : les tests chargent ce module avec des fils d'essai.

import { formatDateTime, t, tn, type FeedbackThread, type IconName, type ThreadOrigin } from '@cyberpinball/core';
import type { Action, Built, Row } from './library';
import type { TeamThreads } from './team-threads';

export interface TeamThreadsMenuHost {
  threads: TeamThreads;
  openCustom(build: () => Built, at?: number): void;
  showing(build: () => Built): boolean;
  prompt(heading: string, label: string, value: string, done: (value: string | undefined) => void, lead?: string): void;
  /** Rapports anonymes : le réglage, et le changer (feedback-menu.ts). */
  anonymous(): boolean;
  setAnonymous(on: boolean): void;
  now?: () => number;
}

const ORIGIN_ICON: Record<ThreadOrigin, IconName> = { report: 'report', crash: 'alert', proposal: 'inbox' };

/** D'où vient un fil, en quelques mots. */
export function originText(origin: ThreadOrigin): string {
  return origin === 'crash' ? t('Rapport de plantage') : origin === 'proposal' ? t('Votre proposition') : t('Votre rapport');
}

export function createTeamThreadsMenu(host: TeamThreadsMenuHost) {
  const now = () => host.now?.() ?? Date.now();
  let current: (() => Built) | undefined;
  /** Message en cours d'envoi, ou dernier résultat, par fil. */
  const sending = new Map<string, 'sending' | 'queued' | 'failed'>();

  function show(build: () => Built, at?: number): void {
    current = build;
    host.openCustom(build, at);
  }

  /** Redessine l'écran montré, s'il l'est encore (une réponse arrivée, un message parti). */
  function changed(): void {
    if (current && host.showing(current)) host.openCustom(current);
  }

  const when = (at: number): string => {
    const sameDay = new Date(now()).toDateString() === new Date(at).toDateString();
    return sameDay ? formatDateTime(at, { timeStyle: 'short' }) : formatDateTime(at, { dateStyle: 'medium', timeStyle: 'short' });
  };

  const preview = (x: FeedbackThread): string => {
    const last = x.lines[x.lines.length - 1];
    if (!last) return originText(x.origin);
    const text = last.text.replace(/\s*\n\s*/g, ' ');
    return last.from === 'team' ? t('Équipe : {text}', { text }) : t('Vous : {text}', { text });
  };

  // ---------- La liste ----------

  function openList(back: () => void, at?: number): void {
    void host.threads.pollIfOld();
    const self = (i?: number) => openList(back, i);
    show(() => {
      const list = host.threads.visible();
      const actions: Action[] = [];
      const rows: Row[] = list.map((x) => {
        const index = actions.push({ label: x.title || originText(x.origin), key: `team-thread:${x.fil}`, icon: ORIGIN_ICON[x.origin], run: () => openThread(x.fil, () => self(index)) }) - 1;
        const last = x.lines[x.lines.length - 1];
        return {
          action: index,
          pick: true,
          icon: ORIGIN_ICON[x.origin],
          text: x.title || originText(x.origin),
          detail: `${originText(x.origin)} · ${preview(x)}`,
          badges: [...(x.unread ? [tn(x.unread, '{n} réponse non lue', '{n} réponses non lues')] : []), ...(last ? [when(last.at)] : [])],
          ...(x.unread ? { unread: true } : {}),
        };
      });
      actions.push(anonymousAction(() => self()));
      actions.push({ label: t('Retour'), icon: 'back', run: back });
      return {
        heading: t('Mes échanges avec l’équipe'),
        icon: 'message',
        subheading: t('Retours et propositions'),
        lead: t('Chaque rapport que vous envoyez ouvre un échange : l’équipe peut vous y répondre, et vous lui répondre en retour. Une réponse arrive avec une notification et dans vos messages en attente.'),
        sections: rows.length
          ? [{ title: t('Les plus récents d’abord'), rows }]
          : [{ rows: [{ icon: 'info', text: t('Aucun échange pour l’instant'), detail: t('Envoyez un rapport ou signalez un problème : la réponse de l’équipe s’affichera ici.'), tone: 'quiet' }] }],
        actions,
        back,
        listStart: t('ouvrir l’échange'),
      };
    }, at);
  }

  /** « Mes rapports : avec mon pseudo / anonymes », changé d'un appui, retenu. */
  function anonymousAction(reopen: () => void): Action {
    const anonymous = host.anonymous();
    return {
      label: t('Mes rapports'),
      detail: anonymous ? t('Anonymes : l’équipe peut vous répondre sans savoir qui vous êtes') : t('Avec mon pseudo : l’équipe sait à qui elle répond'),
      icon: anonymous ? 'lock' : 'account',
      key: 'team-threads:anonymous',
      run: () => {
        host.setAnonymous(!anonymous);
        reopen();
      },
    };
  }

  // ---------- Un fil ----------

  function openThread(fil: string, back: () => void): void {
    void host.threads.pollIfOld();
    const self = () => openThread(fil, back);
    const build = (): Built => {
      const x = host.threads.thread(fil);
      if (!x) return { heading: t('Échange introuvable'), icon: 'alert', sections: [{ rows: [{ icon: 'info', text: t('Il a été effacé de cette borne.'), tone: 'quiet' }] }], actions: [{ label: t('Retour'), icon: 'back', run: back }], back };
      // Ouvert sous les yeux : les réponses sont lues.
      if (x.unread) host.threads.read(fil);
      const rows: Row[] = [];
      let day = '';
      for (const line of x.lines) {
        const d = new Date(line.at).toDateString();
        if (d !== day) {
          day = d;
          rows.push({ text: formatDateTime(line.at, { dateStyle: 'full' }), bubble: 'day' });
        }
        const who = line.from === 'team' ? t('Équipe Cyber Pinball') : t('Vous');
        const time = formatDateTime(line.at, { timeStyle: 'short' });
        rows.push({ text: line.text, detail: line.queued ? t('{who} · {time} · part à la prochaine connexion', { who, time }) : `${who} · ${time}`, bubble: line.from === 'team' ? 'in' : line.queued ? 'pending' : 'out' });
      }
      if (!x.lines.length) rows.push({ text: t('Pas encore de message dans cet échange'), bubble: 'day' });
      const state = sending.get(fil);
      const actions: Action[] = [
        {
          label: t('Répondre à l’équipe…'),
          detail: state === 'sending' ? t('Envoi en cours…') : state === 'failed' ? t('Pas parti : écriture impossible dans les données de la borne') : t('Clavier à l’écran, ou votre téléphone appairé · chiffré pour l’équipe'),
          icon: 'keyboard',
          tone: state === 'sending' ? 'quiet' : 'ok',
          key: 'team-thread:write',
          run: () => (state === 'sending' ? self() : compose(fil, self)),
        },
        { label: t('Retour'), icon: 'back', run: back },
      ];
      const head: Row = {
        icon: ORIGIN_ICON[x.origin],
        text: x.title || originText(x.origin),
        detail: [originText(x.origin), x.table ?? '', x.anonymous ? t('envoyé anonymement') : ''].filter(Boolean).join(' · '),
        tone: 'info',
      };
      return {
        heading: t('Échange avec l’équipe'),
        icon: 'message',
        subheading: x.title || originText(x.origin),
        sections: [{ rows: [head] }, { kind: 'chat', rows }],
        actions,
        back,
      };
    };
    show(build);
  }

  function compose(fil: string, reopen: () => void): void {
    host.prompt(
      t('Répondre à l’équipe'),
      t('Votre message'),
      '',
      (value) => {
        if (!value?.trim()) return reopen();
        sending.set(fil, 'sending');
        reopen();
        void host.threads.write(fil, value).then((r) => {
          if (r === 'sent') sending.delete(fil);
          else sending.set(fil, r === 'queued' ? 'queued' : 'failed');
          changed();
        });
      },
      t('Lu par l’équipe seule, chiffré. Ni adresse, ni numéro de téléphone.'),
    );
  }

  return {
    openList,
    openThread,
    changed,
    /** La ligne « Mes échanges avec l'équipe » de Retours et propositions. */
    entry(back: () => void): Action {
      const unread = host.threads.unread();
      const n = host.threads.visible().length;
      return {
        label: t('Mes échanges avec l’équipe'),
        detail: unread ? tn(unread, '{n} réponse de l’équipe à lire', '{n} réponses de l’équipe à lire') : n ? tn(n, '{n} échange · vos rapports et les réponses de l’équipe', '{n} échanges · vos rapports et les réponses de l’équipe') : t('Vos rapports et les réponses de l’équipe'),
        icon: 'message',
        ...(unread ? { attention: true, tone: 'ok' as const } : {}),
        key: 'feedback:threads',
        run: () => openList(back),
      };
    },
    anonymousAction,
  };
}

export type TeamThreadsMenu = ReturnType<typeof createTeamThreadsMenu>;
