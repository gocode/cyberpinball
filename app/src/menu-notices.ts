// Notifications du menu des tables (packages/core/src/notices.ts) : la pastille des amis en
// ligne et une notification discrète à la fois, à gauche de la roue dentée.
//
// Trois relevés, comparés à chaque changement : le réseau des amis (un ami qui se connecte, qui
// lance une partie, une demande reçue ou acceptée, un record ou un badge d'un ami), la file des
// téléchargements (un téléchargement fini ou bloqué) et la partie entre amis (livenotices.ts : un
// invité accepte ou décline, un joueur quitte, la partie est finie). La file des notifications
// décide quand montrer quoi ; ce module lui donne l'heure, dit si l'écran s'y prête et redessine
// le menu quand ce qu'elle montre change (une entrée, un départ, une fin), jamais plus.
//
// La partie entre amis se montre aussi hors du menu des tables (menu système, partie d'une autre
// table : `live.canShow`), sauf sur l'écran de la partie, qui le dit déjà, et même notifications
// coupées : le joueur attend ces nouvelles (NoticeRule.live).

import {
  NOTICE_RULES,
  NOTICE_STARTUP_QUIET_MS,
  createNoticeCenter,
  downloadNotices,
  downloadSnapshot,
  friendsOnlineView,
  isLiveNotice,
  liveNotices,
  liveSnapshot,
  socialNotices,
  socialSnapshot,
  type DownloadJob,
  type DownloadSnapshot,
  type LiveGame,
  type LiveSnapshot,
  type NoticeEvent,
  type NoticeView,
  type NoticesMode,
  type Presence,
  type SocialSnapshot,
  type SocialState,
} from '@cyberpinball/core';

export interface MenuNoticesHost {
  social: {
    state(): SocialState;
    online(key: string): boolean;
    presenceOf(key: string): Presence | undefined;
  };
  jobs(): readonly DownloadJob[];
  /** Raison d'un téléchargement bloqué, courte (« plus de place »). */
  reason?(job: DownloadJob): string | undefined;
  badgeLabel?(id: string): string;
  mode(): NoticesMode;
  /** Le menu des tables est à l'écran et rien ne s'y oppose (partie, attente, invité, écran plein, constat bref). */
  canShow(): boolean;
  /** Ce que la notification montre a changé : redessiner le menu. */
  redraw(): void;
  /** La partie entre amis (live-game.ts) : ses nouvelles se montrent aussi hors du menu des tables. */
  live?: {
    game(): LiveGame | undefined;
    /** Clé de cette borne. */
    me(): string;
    /** L'écran de la partie (salon, départ, résultats) est ouvert : il le dit déjà. */
    onScreen(): boolean;
    /** Une nouvelle de la partie peut se montrer ici (menu des tables, menu système, partie d'une autre table). */
    canShow(): boolean;
    /** Une nouvelle de la partie entre à l'écran : son discret. */
    shown?(view: NoticeView): void;
  };
  now?: () => number;
  log?: (line: string) => void;
}

export interface MenuNotices {
  /** Le réseau ou la file des téléchargements a changé : relever ce qui est nouveau. */
  observe(): void;
  /** Déjà dit ailleurs (le bandeau d'un écran plein) : la notification ne le redira pas. */
  said(kind: NoticeEvent['kind'], key: string): void;
  /** Ce que le menu des tables dessine maintenant (à chaque rendu de la fenêtre du plateau). */
  view(): { notice?: NoticeView; friendsOnline?: { count: number; title: string } };
  stop(): void;
}

export function createMenuNotices(host: MenuNoticesHost): MenuNotices {
  const now = host.now ?? (() => Date.now());
  const center = createNoticeCenter();
  const quietUntil = now() + NOTICE_STARTUP_QUIET_MS;
  let social: SocialSnapshot | undefined;
  let downloads: DownloadSnapshot | undefined;
  let live: LiveSnapshot | undefined;
  /**
   * Le premier relevé, à la création, ne lit pas la partie entre amis : aucune n'existe au
   * démarrage, et le service qui la tient est créé après ce module (frontend.ts).
   */
  let born = false;
  /** Dernière nouvelle de la partie entrée à l'écran (son id), pour son seul son. */
  let liveShown: string | undefined;
  let timer: NodeJS.Timeout | undefined;
  let shown = 'null';
  let stopped = false;

  /** L'évènement a-t-il encore lieu d'être au moment de se montrer ? */
  function still(e: NoticeEvent): boolean {
    const s = host.social.state();
    switch (e.kind) {
      case 'friend-online':
        return host.social.online(e.key);
      case 'friend-playing':
        return host.social.presenceOf(e.key.split('|')[0]!)?.status === 'playing';
      case 'friend-request':
        return s.incoming.some((r) => r.key === e.key);
      case 'friend-accepted':
        return s.friends.some((f) => f.key === e.key);
      case 'download-done': {
        // Déjà rendu à son écran, ou retiré de la liste : plus rien à annoncer.
        const j = host.jobs().find((x) => x.id === e.key);
        return Boolean(j && j.state === 'done' && !j.delivered);
      }
      case 'download-failed': {
        const j = host.jobs().find((x) => x.id === e.key);
        return Boolean(j && j.state === 'failed' && !j.seen);
      }
      default:
        // La partie entre amis : encore la mienne, et son écran fermé (ouvert, il le dit déjà).
        if (isLiveNotice(e.kind)) return !!host.live && host.live.game()?.id === e.key.split('|')[0] && !host.live.onScreen();
        return true;
    }
  }

  function tick() {
    const all = host.mode() === 'all';
    // Notifications coupées : seule la partie entre amis reste.
    if (!all) center.clear((e) => isLiveNotice(e.kind));
    const menu = all && host.canShow();
    const liveHere = host.canShow() || (host.live?.canShow() ?? false);
    return center.tick(now(), { canShow: menu || liveHere, liveOnly: !menu, still });
  }

  /** Redessine si ce que la file montre a changé (le rendu reprogramme la suite), sinon repasse à l'heure qu'elle demande. */
  function poke(): void {
    if (stopped) return;
    const r = tick();
    if (JSON.stringify(r.view ?? null) !== shown) host.redraw();
    else schedule(r.nextAt);
  }

  function schedule(nextAt: number | undefined): void {
    clearTimeout(timer);
    timer = undefined;
    if (stopped || nextAt === undefined) return;
    timer = setTimeout(() => {
      timer = undefined;
      poke();
    }, Math.max(20, nextAt - now()));
  }

  function observe(): void {
    if (stopped) return;
    const t = now();
    const s = host.social.state();
    const nextSocial = socialSnapshot(s, (k) => host.social.online(k), (k) => host.social.presenceOf(k));
    const jobs = host.jobs();
    const game = born ? host.live?.game() : undefined;
    const me = born ? (host.live?.me() ?? '') : '';
    born = true;
    const nextLive = liveSnapshot(game, me);
    const events = [...liveNotices(live, nextLive, game, me, t), ...socialNotices(social, nextSocial, s, t, host.badgeLabel), ...downloadNotices(downloads, jobs, t, host.reason)]
      .filter((e) => t >= quietUntil || e.kind !== 'friend-online')
      // Notifications coupées : seule la partie entre amis reste.
      .filter((e) => host.mode() === 'all' || isLiveNotice(e.kind));
    social = nextSocial;
    downloads = downloadSnapshot(jobs);
    live = nextLive;
    if (!events.length) return;
    center.push(events);
    for (const e of events) host.log?.(`Notifications : ${e.kind} ${e.who ?? e.subject ?? ''} (priorité ${NOTICE_RULES[e.kind].priority})`); // i18n-ignore : journal
    poke();
  }

  function view() {
    const mode = host.mode();
    const r = tick();
    const next = JSON.stringify(r.view ?? null);
    if (r.view && next !== shown && !r.view.leaving) host.log?.(`Notifications : affichée « ${r.view.title} »${r.view.detail ? ` (${r.view.detail})` : ''}`); // i18n-ignore : journal
    else if (!r.view && shown !== 'null') host.log?.('Notifications : plus rien d’affiché'); // i18n-ignore : journal
    if (r.view?.live && !r.view.leaving && r.view.id !== liveShown) {
      liveShown = r.view.id;
      host.live?.shown?.(r.view);
    }
    shown = next;
    schedule(r.nextAt);
    const friends = mode === 'off' ? undefined : friendsOnlineView(socialSnapshot(host.social.state(), (k) => host.social.online(k), (k) => host.social.presenceOf(k)));
    return { ...(r.view ? { notice: r.view } : {}), ...(friends ? { friendsOnline: friends } : {}) };
  }

  // Ce qui est là au démarrage (amis, demandes, téléchargements finis) n'est pas une nouvelle.
  observe();

  return {
    observe,
    said: (kind, key) => center.said(kind, key, now()),
    view,
    stop: () => {
      stopped = true;
      clearTimeout(timer);
    },
  };
}
