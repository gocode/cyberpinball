// Menu système > Activité récente (packages/core/src/activity.ts) : les notifications des derniers
// jours, en entier, pour relire celles qu'on a manquées. Groupées par jour, les plus récentes en
// haut ; chaque ligne dit le texte entier, l'heure, ce qui s'est répété, si elle n'est pas lue, et
// dessous ce que fait Start (« ↩ Start : voir sa fiche »), ou pourquoi il ne fait plus rien
// (« ✕ Invitation expirée », la ligne grisée). Maquette revue par Codex le 06/11/2026
// (docs/recherche/maquettes/activite-recente.cjs).
//
// Le journal se tient ici : chaque évènement des notifications (menu-notices.ts), une version
// disponible ou installée (updates-menu.ts), les constats du démarrage (frontend.ts, `note`). Il
// est écrit dans <données>\activite.json à chaque changement. Une ligne est vue quand le curseur
// s'y pose ; son repère « Non lu » reste jusqu'à ce qu'on quitte l'écran, pour ne pas disparaître
// sous les yeux. Mode invité : l'écran est fermé, comme tout le menu système (library.ts).
//
// Sans electron à l'exécution : les tests du cœur chargent ce module avec des amis et des
// téléchargements d'essai.

import * as path from 'node:path';
import {
  ACTIVITY_FILE,
  ACTIVITY_KEEP_UNREAD,
  ACTIVITY_MAX,
  SYSTEM_ITEMS,
  activityAct,
  activityDay,
  activityFacts,
  activityLook,
  activityText,
  activityUnread,
  addActivity,
  isLiveNotice,
  language,
  loadActivity,
  markActivityRead,
  saveActivity,
  saveOrWarn,
  t,
  tn,
  type ActivityAdd,
  type ActivityEntry,
  type ActivityLog,
  type AvatarView,
  type LiveInviteEndInfo,
  type NoticeEvent,
  type SystemItemId,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem, Row, Section } from './library';

export interface ActivityMenuHost {
  dataDir: string;
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
    /** Position du curseur de l'écran ouvert. */
    cursor(): number;
    isShowing(build: () => Built): boolean;
    runSystemItem(id: SystemItemId, back: () => void): void;
    hasSystemItem(id: SystemItemId): boolean;
    /** Le gestionnaire de téléchargements, sur ce téléchargement. */
    openDownloads(focus?: string): void;
  };
  /** Le téléchargement est-il encore dans la liste du gestionnaire ? */
  hasDownload(id: string): boolean;
  friends: {
    isFriend(key: string): boolean;
    online(key: string): boolean;
    playing(key: string): boolean;
    /** Une demande reçue de ce joueur attend encore ma réponse. */
    incoming(key: string): boolean;
    openFriend(key: string, back: () => void): void;
    openRequests(back: () => void): void;
    avatar?(key: string, name: string): AvatarView;
  };
  live: {
    /** Cette invitation vaut encore. */
    hasInvite(id: string): boolean;
    inviteEnd(id: string): LiveInviteEndInfo | undefined;
    openInvite(id: string, back: () => void): void;
    /** La partie entre amis en cours (salon, départ, résultats pas encore fermés). */
    current(): { id: string } | undefined;
    open(back: () => void): void;
    inHistory(id: string): boolean;
    openHistory(id: string, back: () => void): void;
  };
  /** Le journal a changé (une ligne de plus, une ligne vue) : la pastille de la roue dentée se redessine. */
  changed?(): void;
  now?: () => number;
  log?: (line: string) => void;
}

export interface ActivityMenu {
  /** Évènements des notifications, à leur arrivée ; `quiet` : notifications coupées, ce qui ne compte pas reste lu. */
  record(events: readonly NoticeEvent[], quiet?: boolean): void;
  /** Une ligne qui ne vient pas d'une notification : version disponible, mise à jour faite, constat. */
  note(add: Omit<ActivityAdd, 'at'> & { at?: number }): void;
  /** Ces évènements viennent d'être dits en entier par la notification. */
  shown(events: readonly NoticeEvent[]): void;
  /** L'entrée du menu système (pastille rouge tant qu'il y a du non lu). */
  item: ProvidedSystemItem;
  /** L'écran ; `back` : son « Retour » (sans lui, le menu système). */
  open(back?: () => void): void;
  unread(): number;
  /** Le journal (essais, démonstrations). */
  entries(): readonly ActivityEntry[];
}

const locale = () => (language() === 'en' ? 'en-GB' : 'fr-FR');
const time = (at: number) => new Date(at).toLocaleTimeString(locale(), { hour: '2-digit', minute: '2-digit' });

/** « Aujourd'hui », « Hier », puis « Mercredi 4 novembre 2026 ». */
function dayTitle(at: number, now: number): string {
  if (activityDay(at) === activityDay(now)) return t('Aujourd’hui');
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (activityDay(at) === activityDay(yesterday.getTime())) return t('Hier');
  const text = new Date(at).toLocaleDateString(locale(), { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
  return text.charAt(0).toUpperCase() + text.slice(1);
}

/** « 21:31, 19:02 et 14:10 » : les heures d'une ligne qui se répète, la plus récente d'abord. */
function timesText(e: ActivityEntry): string {
  const list = e.times.map(time);
  const more = e.count - e.times.length;
  const joined = list.length > 1 ? t('{list} et {last}', { list: list.slice(0, -1).join(', '), last: list.at(-1)! }) : (list[0] ?? '');
  return more > 0 ? tn(more, 'À {times}, et {n} fois plus tôt', 'À {times}, et {n} fois plus tôt', { times: joined }) : t('À {times}', { times: joined });
}

/** Ce que Start fait sur une ligne, maintenant : l'ouvrir (`run`, et ce qu'il ouvre), ou pourquoi plus rien. */
interface Reach {
  run?: () => void;
  /** « Start : voir sa fiche ». */
  label?: string;
  /** Pourquoi plus rien : « Invitation expirée ». */
  gone?: string;
  /** État de ce dont parle la ligne, à côté de l'heure : « En ligne ». */
  status?: string;
}

export function createActivityMenu(host: ActivityMenuHost): ActivityMenu {
  const now = () => host.now?.() ?? Date.now();
  const file = path.join(host.dataDir, ACTIVITY_FILE);
  const loaded = loadActivity(file);
  if (loaded.setAside) host.log?.(`Activité récente : ${ACTIVITY_FILE} illisible, mis de côté (${loaded.setAside}).`); // i18n-ignore : journal
  const log: ActivityLog = loaded.log;
  /** L'écran ouvert : son Retour, et ce qui n'était pas lu à son ouverture (le repère reste jusqu'à ce qu'on en sorte). */
  let screen: { back: () => void; unread: ReadonlySet<string> } | undefined;

  /** Écrit le journal ; `later` : depuis le rendu de l'écran, la pastille de la roue dentée se redessine après lui, pas pendant. */
  function save(later = false): void {
    saveOrWarn(file, () => saveActivity(file, log));
    if (later) setImmediate(() => host.changed?.());
    else host.changed?.();
  }

  function record(events: readonly NoticeEvent[], quiet = false): void {
    for (const e of events) {
      // Notifications coupées : ce qui ne se montre plus n'a pas à être revu ; la partie entre amis, les erreurs et les fins de téléchargement, si.
      const read = quiet && !isLiveNotice(e.kind) && !ACTIVITY_KEEP_UNREAD.has(e.kind);
      const entry = addActivity(log, { kind: e.kind, facts: activityFacts(e), at: e.at, ...(read ? { read } : {}) });
      host.log?.(`Activité récente : ${e.kind} consigné (${entry.count} fois ce jour-là${entry.read ? ', lu' : ''}).`); // i18n-ignore : journal
    }
    if (events.length) save();
  }

  function note(add: Omit<ActivityAdd, 'at'> & { at?: number }): void {
    addActivity(log, { ...add, at: add.at ?? now() });
    save();
  }

  function shown(events: readonly NoticeEvent[]): void {
    const ids = log.entries.filter((x) => !x.read && !ACTIVITY_KEEP_UNREAD.has(x.kind) && events.some((e) => e.kind === x.kind && sameSubject(x, e))).map((x) => x.id);
    if (ids.length && markActivityRead(log, ids)) save();
  }

  /** La ligne parle-t-elle de cet évènement (la même clé, ou ce qu'elle regroupe) ? */
  function sameSubject(x: ActivityEntry, e: NoticeEvent): boolean {
    if (x.key === e.key) return true;
    if (e.kind === 'friend-online') return !!e.player && x.player === e.player && activityDay(x.at) === activityDay(e.at);
    if (e.kind === 'friend-playing') return !!e.player && x.player === e.player && x.subject === e.subject && activityDay(x.at) === activityDay(e.at);
    return false;
  }

  /** Revenir à cet écran, la ligne qu'on quitte choisie. */
  const backTo = (at: number) => () => show(at);

  function reach(e: ActivityEntry, at: number): Reach {
    const act = activityAct(e);
    const back = backTo(at);
    if (!act) return {};
    switch (act.type) {
      case 'friend': {
        if (!host.friends.isFriend(act.key)) return { gone: t('N’est plus dans vos amis') };
        const status = host.friends.playing(act.key) ? t('En partie') : host.friends.online(act.key) ? t('En ligne') : t('Hors ligne');
        return { run: () => host.friends.openFriend(act.key, back), label: t('voir sa fiche'), status };
      }
      case 'friend-request':
        if (host.friends.incoming(act.key)) return { run: () => host.friends.openRequests(back), label: t('répondre à la demande') };
        if (host.friends.isFriend(act.key)) return { run: () => host.friends.openFriend(act.key, back), label: t('voir sa fiche'), status: t('Ami') };
        return { gone: t('Demande déjà traitée ou retirée') };
      case 'invite': {
        if (host.live.hasInvite(act.id)) return { run: () => host.live.openInvite(act.id, back), label: t('répondre à l’invitation') };
        const why = host.live.inviteEnd(act.id)?.why;
        const gone: Record<string, string> = {
          answered: t('Invitation déjà répondue'),
          cancelled: t('Invitation annulée'),
          started: t('Partie lancée sans vous'),
          replaced: t('Remplacée par une nouvelle invitation'),
          expired: t('Invitation expirée'),
          offline: t('Invitation retirée'),
          'host-offline': t('Invitation retirée'),
        };
        return { gone: (why && gone[why]) ?? t('Invitation expirée') };
      }
      case 'live-game':
        if (host.live.current()?.id === act.id) return { run: () => host.live.open(back), label: e.kind === 'live-finished' ? t('voir les résultats') : t('voir la partie') };
        if (host.live.inHistory(act.id)) return { run: () => host.live.openHistory(act.id, back), label: t('revoir les résultats') };
        return { gone: e.kind === 'live-cancelled' ? t('Partie annulée') : t('Partie terminée') };
      case 'download':
        if (host.hasDownload(act.id)) return { run: () => host.library.openDownloads(act.id), label: t('ouvrir les téléchargements') };
        return { gone: t('Retiré de la liste des téléchargements') };
      case 'system':
        if (!host.library.hasSystemItem(act.item)) return {};
        return { run: () => host.library.runSystemItem(act.item, back), label: act.item === 'updates' ? t('voir la mise à jour') : t('ouvrir « {entry} »', { entry: SYSTEM_ITEMS[act.item].label }) };
    }
  }

  function build(): Built {
    const t0 = now();
    const entries = log.entries;
    const cursor = host.library.cursor();
    // La ligne sous le curseur est vue (son repère reste jusqu'à la sortie de l'écran).
    const looked = entries[cursor];
    if (looked && !looked.read && markActivityRead(log, [looked.id])) save(true);
    const was = screen?.unread ?? new Set<string>();
    const actions: Action[] = [];
    const sections: Section[] = [];
    entries.forEach((e, i) => {
      const look = activityLook(e);
      const text = activityText(e);
      const r = reach(e, i);
      const unread = was.has(e.id);
      const repeated = e.count > 1 && (e.kind === 'friend-online' || e.kind === 'friend-playing');
      const detail = repeated ? [text.detail, timesText(e)].filter(Boolean).join(' · ') : text.detail;
      actions.push({
        label: text.title,
        key: `activity:${e.id}`,
        icon: look.icon,
        ...(r.gone ? { tone: 'quiet' as const, detail: r.gone } : {}),
        run: () => {
          if (markActivityRead(log, [e.id])) save();
          r.run?.();
        },
      });
      const row: Row = {
        text: text.title,
        ...(detail ? { detail } : {}),
        icon: look.icon,
        ...(e.player && host.friends.avatar ? { avatar: host.friends.avatar(e.player, e.who ?? '?') } : {}),
        tone: r.gone ? 'quiet' : look.tone,
        badges: [time(e.at), ...(r.status ? [r.status] : []), ...(unread ? [t('Non lu')] : [])],
        ...(unread ? { unread: true } : {}),
        ...(r.gone ? { note: { sign: '✕', text: r.gone, tone: 'quiet' as const } } : r.label ? { note: { sign: '↩', text: t('Start : {action}', { action: r.label }), tone: 'quiet' as const } } : {}),
        action: i,
        pick: true,
      };
      const title = dayTitle(e.at, t0);
      const last = sections.at(-1);
      if (last?.title === title) last.rows.push(row);
      else sections.push({ title, rows: [row] });
    });
    const back = screen?.back ?? (() => host.library.openSystem());
    if (entries.length) actions.push({ label: t('Effacer l’activité récente'), detail: t('Vos amis, téléchargements et parties restent'), icon: 'broom', run: () => confirmClear(entries.length) });
    actions.push({ label: t('Retour'), icon: 'back', run: () => leave(back) });
    return {
      heading: t('Activité récente'),
      icon: 'bell',
      ...(was.size ? { subheading: tn(was.size, '{n} notification non lue', '{n} notifications non lues', {}) } : {}),
      lead: tn(ACTIVITY_MAX, 'Jusqu’à {n} notification, gardée d’un démarrage à l’autre.', 'Jusqu’à {n} notifications, gardées d’un démarrage à l’autre.'),
      sections: sections.length ? sections : [{ rows: [{ text: t('Aucune activité récente'), detail: t('Vos prochaines notifications apparaîtront ici.'), tone: 'info', icon: 'info' }] }],
      actions,
      back: () => leave(back),
      listStart: t('ouvrir l’action indiquée'),
    };
  }

  function leave(back: () => void): void {
    screen = undefined;
    back();
  }

  /** Effacer : une question, Annuler choisi d'abord (revue de Codex). */
  function confirmClear(at: number): void {
    const cancel = () => show(at);
    host.library.openCustom(
      () => ({
        heading: t('Effacer toute l’activité récente ?'),
        icon: 'alert',
        lead: t('Vos amis, téléchargements et parties restent.'),
        sections: [],
        actions: [
          {
            label: t('Effacer'),
            icon: 'broom',
            tone: 'warning',
            run: () => {
              log.entries = [];
              save();
              host.log?.('Activité récente : effacée.'); // i18n-ignore : journal
              show(0);
            },
          },
          { label: t('Annuler'), icon: 'back', run: cancel },
        ],
        back: cancel,
      }),
      1,
    );
  }

  function show(at: number): void {
    host.library.openCustom(build, at);
  }

  function open(back?: () => void): void {
    screen = { back: back ?? (() => host.library.openSystem()), unread: new Set(log.entries.filter((e) => !e.read).map((e) => e.id)) };
    host.log?.(`Activité récente : ouverte, ${log.entries.length} lignes, ${screen.unread.size} non lues.`); // i18n-ignore : journal
    // Sans rien, le curseur sur Retour ; sinon sur la plus récente.
    show(0);
  }

  return {
    record,
    note,
    shown,
    open,
    unread: () => activityUnread(log),
    entries: () => log.entries,
    item: {
      get attention() {
        return activityUnread(log) > 0;
      },
      get detail() {
        const n = activityUnread(log);
        const latest = log.entries.find((e) => !e.read) ?? log.entries[0];
        if (!latest) return t('Les notifications des derniers jours, en entier');
        const title = activityText(latest).title;
        return n ? t('{count} · {latest}', { count: tn(n, '{n} non lue', '{n} non lues'), latest: title }) : t('Dernière : {latest}', { latest: title });
      },
      run: () => open(),
    },
  };
}
