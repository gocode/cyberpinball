// Notifications du menu des tables (packages/core/src/notices.ts) : la pastille des amis en
// ligne et une notification discrète à la fois, à gauche de la roue dentée.
//
// Quatre relevés, comparés à chaque changement : le réseau des amis (un ami qui se connecte, qui
// lance une partie, une demande reçue ou acceptée, un record ou un badge d'un ami), la file des
// téléchargements (un téléchargement fini ou bloqué), les invitations reçues et la partie entre
// amis (livenotices.ts : un invité accepte ou décline, un joueur quitte, la partie est finie). La
// file des notifications décide quand montrer quoi ; ce module lui donne l'heure, dit si l'écran
// s'y prête et redessine le menu quand ce qu'elle montre change (une entrée, un départ, une fin),
// jamais plus.
//
// Chaque évènement entre aussi, dès son arrivée, au journal d'Activité récente (activity.ts,
// `activity`), qu'il se montre ou non ; la notification qui le dit en entier le donne pour lu,
// pas celle qui le résume (« 4 nouveautés »).
//
// Où et quoi : la zone des notifications de l'écran du moment (noticezone.ts, `zone`), la même
// règle pour tous les écrans : sur tout écran de Cyber Pinball, le compteur et toutes les
// notifications ; pendant une partie, ce qui se montre partout (NoticeRule.away : la partie entre
// amis, une invitation, un ami qui se connecte), par-dessus VPX. Jamais ce que l'écran de la partie
// ou de l'invitation dit déjà, ni ce que la bande de la partie en cours montre déjà (`live.band`). La partie entre amis reste même
// notifications coupées : le joueur attend ces nouvelles (NoticeRule.live). Chaque notification
// qui a son son (NoticeRule.sound) le fait entendre à son entrée, une fois (`sound`).

import {
  avatarView,
  NOTICE_RULES,
  NOTICE_STARTUP_QUIET_MS,
  createNoticeCenter,
  downloadNotices,
  downloadSnapshot,
  friendsOnlineView,
  inviteNotices,
  inviteTag,
  isLiveNotice,
  liveNotices,
  liveSnapshot,
  socialNotices,
  tagId,
  socialSnapshot,
  type DownloadJob,
  type DownloadSnapshot,
  type FriendsListSync,
  type LiveGame,
  type LiveInvite,
  type LiveInviteEndInfo,
  type LiveSnapshot,
  type NoticeEvent,
  type NoticeView,
  type NoticeZone,
  type AvatarView,
  type NoticesMode,
  type Presence,
  type SocialSnapshot,
  type SocialState,
  type UiSoundId,
} from '@cyberpinball/core';

export interface MenuNoticesHost {
  social: {
    state(): SocialState;
    online(key: string): boolean;
    presenceOf(key: string): Presence | undefined;
    /** La liste des amis est-elle sûre (friendpresence.ts) ? Sans lui : à jour. */
    listSync?(): FriendsListSync;
    /** Fichier de l'avatar d'un joueur (social-net.ts) : la pastille de la notification qui parle de lui. */
    avatarFile?(key: string): string | undefined;
  };
  jobs(): readonly DownloadJob[];
  /** Raison d'un téléchargement bloqué, courte (« plus de place »). */
  reason?(job: DownloadJob): string | undefined;
  badgeLabel?(id: string): string;
  mode(): NoticesMode;
  /** La zone des notifications de l'écran du moment (noticezone.ts) : où, le compteur, quelles notifications. */
  zone(): NoticeZone;
  /** Ce que la notification montre a changé : redessiner le menu. */
  redraw(): void;
  /** La partie entre amis et les invitations (live-game.ts) ; ce qui se montre partout. */
  live?: {
    game(): LiveGame | undefined;
    /** Invitations encore valables. */
    invites?(): readonly LiveInvite[];
    /** Comment une invitation reçue a pris fin (live-game.ts) : sa fin s'annonce, sauf par ma réponse. */
    inviteEnd?(id: string): LiveInviteEndInfo | undefined;
    /** Clé de cette borne. */
    me(): string;
    /** L'écran de la partie (salon, départ, résultats) est ouvert : il le dit déjà. */
    onScreen(): boolean;
    /** L'écran de cette invitation est ouvert : il le dit déjà. */
    inviteOnScreen?(id: string): boolean;
    /** La bande de la partie entre amis est sur les écrans (pendant la partie) : elle dit déjà où en sont les joueurs. */
    band?(): boolean;
  };
  /**
   * Une notification qui a son son entre à l'écran (NoticeRule.sound) ; sans `view` : une nouvelle
   * de la partie que l'écran ouvert montre déjà (le salon, l'invitation), qui sonne quand même.
   */
  sound?(id: UiSoundId, view?: NoticeView): void;
  /**
   * Activité récente (activity-menu.ts) : chaque évènement à son arrivée, affiché ou retenu, même
   * notifications coupées (`quiet` : celles-ci ne demandent pas à être revues) ; puis ceux qu'une
   * notification vient de dire en entier.
   */
  activity?: { record(events: readonly NoticeEvent[], quiet: boolean): void; shown(events: readonly NoticeEvent[]): void };
  now?: () => number;
  log?: (line: string) => void;
}

export interface MenuNotices {
  /** Le réseau ou la file des téléchargements a changé : relever ce qui est nouveau. */
  observe(): void;
  /** Déjà dit ailleurs (le bandeau d'un écran plein) : la notification ne le redira pas. */
  said(kind: NoticeEvent['kind'], key: string): void;
  /** Ce que le menu des tables dessine maintenant (à chaque rendu de la fenêtre du plateau). */
  view(): { notice?: NoticeView & { avatar?: AvatarView }; friendsOnline?: { count: number; title: string; searching?: boolean } };
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
  /** Invitations déjà vues (le premier relevé les prend telles quelles). */
  let invites: ReadonlySet<string> | undefined;
  /** Dernière notification entrée à l'écran (son id), pour son seul son. */
  let sounded: string | undefined;
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
      case 'live-invite':
        // Encore valable, et son écran fermé (ouvert, il le dit déjà).
        return !!host.live?.invites?.().some((i) => inviteTag(i) === e.key) && !host.live.inviteOnScreen?.(tagId(e.key));
      case 'live-invite-ended':
        // Son écran ouvert dit déjà la fin (« Invitation annulée par … »).
        return !host.live?.inviteOnScreen?.(tagId(e.key));
      default:
        // La partie entre amis : encore la mienne, son écran fermé, la bande pas là (elles le disent déjà).
        if (isLiveNotice(e.kind)) return !!host.live && host.live.game()?.id === e.key.split('|')[0] && !host.live.onScreen() && !host.live.band?.();
        return true;
    }
  }

  function tick() {
    const all = host.mode() === 'all';
    // Notifications coupées : seule la partie entre amis reste.
    if (!all) center.clear((e) => isLiveNotice(e.kind));
    const zone = host.zone();
    // Rien maintenant : la file garde tout pour l'écran suivant. En partie, ou notifications coupées : ce qui se montre partout.
    const r = center.tick(now(), { canShow: zone.notices !== 'wait', away: zone.notices === 'away' || !all, still });
    // Dite en entier : vue. Un résumé ne dit rien de chacune : Activité récente les garde à revoir.
    if (r.entered && !r.entered.digest) host.activity?.shown(r.entered.events);
    return r;
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
    const received = born ? (host.live?.invites?.() ?? []) : [];
    born = true;
    const nextLive = liveSnapshot(game, me);
    const news = [...inviteNotices(invites, received, t, (id) => host.live?.inviteEnd?.(id)), ...liveNotices(live, nextLive, game, me, t), ...socialNotices(social, nextSocial, s, t, host.badgeLabel), ...downloadNotices(downloads, jobs, t, host.reason)]
      // Au démarrage, et tant que la borne cherche ses amis, c'est elle qui arrive : pas une nouvelle.
      .filter((e) => (t >= quietUntil && host.social.listSync?.() !== 'searching') || e.kind !== 'friend-online');
    // Au journal, toutes : affichées, retenues pour la fin de la partie, ou notifications coupées.
    if (news.length) host.activity?.record(news, host.mode() !== 'all');
    // Notifications coupées : seule la partie entre amis reste.
    const events = news.filter((e) => host.mode() === 'all' || isLiveNotice(e.kind));
    social = nextSocial;
    downloads = downloadSnapshot(jobs);
    live = nextLive;
    invites = new Set(received.map(inviteTag));
    if (!events.length) return;
    // L'écran ouvert dit déjà la nouvelle (le salon : « Bruno a refusé » ; l'invitation : « annulée ») : la
    // notification n'y paraît pas, son son si, une fois (essai réel du 04/11/2026 : « plus de dynamisme »).
    const told = events.find((e) => isLiveNotice(e.kind) && NOTICE_RULES[e.kind].sound && (e.kind === 'live-invite-ended' ? host.live?.inviteOnScreen?.(tagId(e.key)) : e.kind !== 'live-invite' && host.live?.onScreen()));
    if (told && host.zone().notices !== 'wait') host.sound?.(NOTICE_RULES[told.kind].sound!);
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
    if (r.view?.sound && !r.view.leaving && r.view.id !== sounded) {
      sounded = r.view.id;
      host.sound?.(r.view.sound, r.view);
    }
    shown = next;
    schedule(r.nextAt);
    const friends = mode === 'off' || !host.zone().count ? undefined : friendsOnlineView(socialSnapshot(host.social.state(), (k) => host.social.online(k), (k) => host.social.presenceOf(k)), host.social.listSync?.());
    // Un seul joueur en cause : sa pastille (son avatar, sinon ses initiales) à la place de l'icône.
    const who = r.view?.player;
    const notice = r.view && who ? { ...r.view, avatar: avatarView(who.key, who.name, host.social.avatarFile?.(who.key)) } : r.view;
    return { ...(notice ? { notice } : {}), ...(friends ? { friendsOnline: friends } : {}) };

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
