// Départ commun d'une partie entre amis (essai réel du 31/10/2026, Matrix et Game of Thrones : une
// borne partait dès sa table chargée, l'autre chargeait encore, et rien ne disait pourquoi la
// partie n'avait pas démarré). Décision : on attend que tout le monde soit prêt, en même
// temps ; ensuite, peu importe qui finit le premier.
//
// - Chaque borne lance VPX ; quand sa table est chargée et que le relevé du double répond (premier
//   état écrit, « pret=1 » : livestate.ts), elle dit « prêt » à l'hôte (game-status, `ready`). Une
//   table sans relevé est prête dès qu'elle est à l'écran ; son joueur appuie sur Start au signal.
// - L'hôte donne « partez » quand tous les joueurs attendus sont prêts (liveGoDue) ; la salle le
//   porte à chacun (game-room, `go`). Chaque borne pose alors le fichier « partez » dans son double,
//   que le relevé surveille : alors seulement il met le crédit et appuie sur Start. D'ici là, Start
//   reste bloqué par le relevé : personne ne part seul.
// - Un joueur jamais prêt : le premier prêt, les autres ont LIVE_READY_WAIT_MS ; puis « partez » sans
//   eux (pas d'annulation : ceux qui sont prêts ne perdent pas leur partie, et le retardataire part
//   dès que sa table l'est, la salle lui ayant déjà dit « partez »). Le délai restant est affiché.
// - Un joueur qui quitte, ou dont la partie n'a pas démarré : il n'est plus attendu.
// - Une borne d'avant ce protocole (LIVE_PROTOCOL 3) ne dit jamais « prêt » : elle n'est pas
//   attendue, et la salle la dit en retard (liveBehindLabel) ; un invité dont l'hôte est en retard
//   part sans attendre, et le dit.
// - Plus aucun signal de l'hôte (sa borne éteinte) : un invité prêt part seul après
//   LIVE_GO_FALLBACK_MS, et le dit.
//
// Ici, ce qui se décide sur des données ; le service est dans app/src/live-game.ts, le fichier
// « partez » dans app/src/table-double.ts, l'affichage sur la table dans app/src/game-notice.ts.

import { t } from './i18n';
import { LIVE_PROTOCOL, LIVE_READY_WAIT_MS, liveFailedPlaying, livePlayers, type LiveGame, type LiveGoReason, type LivePlayer } from './livegame';
import type { LiveManualReason } from './livestate';
import type { Rect, Rotation } from './model';

/** Le départ commun existe chez cette borne (LIVE_PROTOCOL 4). */
export function liveCommonStart(p: { proto?: number }): boolean {
  return (p.proto ?? 1) >= LIVE_PROTOCOL;
}

/** Un invité prêt sans nouvelles de l'hôte part seul après ce délai (sa borne a pu s'éteindre). */
export const LIVE_GO_FALLBACK_MS = LIVE_READY_WAIT_MS + 30_000;
/** « Partez ! » reste à l'écran ce temps, puis la bande de la partie prend la suite. */
export const LIVE_GO_SHOW_MS = 4000;
/**
 * Connexion qui tombe et revient (essai réel du 01/11/2026) : tant que l'autre n'a pas pris en compte
 * un message du départ commun, il repart à ce rythme. L'invité renvoie son état (« prêt », sa partie
 * finie) quand la salle de l'hôte ne le montre pas encore ; l'hôte renvoie la salle (« partez »
 * compris) pendant toute la partie, et tout de suite à un invité revenu en ligne.
 */
export const LIVE_RESEND_MS = 3000;
/**
 * La carte de l'attente ne reste jamais plus longtemps, même sans aucune nouvelle du réseau : au-delà
 * du départ sans l'hôte (LIVE_GO_FALLBACK_MS) et de « Partez ! », elle n'a plus rien de vrai à dire.
 */
export const LIVE_WAIT_MAX_MS = LIVE_GO_FALLBACK_MS + LIVE_GO_SHOW_MS + 15_000;

/**
 * La carte de l'attente, déjà à l'écran, part-elle d'elle-même ? « Partez ! » lu (LIVE_GO_SHOW_MS
 * depuis son apparition réelle), ou la carte là depuis LIVE_WAIT_MAX_MS. Essai réel du 01/11/2026 :
 * « Partez ! » est resté 90 s chez l'invité (table sans relevé : aucun événement de la partie ne
 * venait plus redessiner la carte), indéfiniment chez l'hôte. La carte ne dépend plus d'un message.
 * `seen` : quand elle a montré l'attente, puis « Partez ! » (ms).
 */
export function liveWaitCardEnd(seen: { attente?: number; partez?: number }, now: number): 'partez-lu' | 'trop-long' | undefined {
  if (seen.partez !== undefined && now - seen.partez >= LIVE_GO_SHOW_MS) return 'partez-lu';
  const first = Math.min(seen.attente ?? Infinity, seen.partez ?? Infinity);
  return Number.isFinite(first) && now - first >= LIVE_WAIT_MAX_MS ? 'trop-long' : undefined;
}

/**
 * Côté invité : mon état est-il à renvoyer à l'hôte ? Sa salle (`room`, mon joueur dedans) ne montre
 * pas encore ce que je lui ai dit (`sent`) : « prêt », ou une partie partie ou finie. Un message perdu
 * pendant une coupure ne laisse pas l'autre attendre le délai pour rien.
 */
export function liveStatusBehind(room: Pick<LivePlayer, 'state' | 'ready'> | undefined, sent: { state: LivePlayer['state']; ready?: boolean }): boolean {
  if (!room) return true;
  const order: Partial<Record<LivePlayer['state'], number>> = { accepted: 0, loading: 1, playing: 2, done: 3, failed: 3, left: 3 };
  const theirs = order[room.state] ?? 0;
  const mine = order[sent.state] ?? 0;
  return theirs < mine || (sent.ready === true && !room.ready && room.state === 'loading' && sent.state === 'loading');
}

/** Les joueurs dont on attend encore le « prêt » : la partie lancée de leur côté, la table pas encore prête. */
export function liveAwaited(game: Pick<LiveGame, 'players'>): LivePlayer[] {
  return livePlayers(game).filter((p) => (p.state === 'accepted' || p.state === 'loading') && !p.ready && liveCommonStart(p));
}

/**
 * Garde-fou : la table à l'écran depuis ce temps sans que son relevé dise « prêt » (ligne illisible,
 * relevé muet), elle se dit prête quand même, et le journal dit pourquoi (frontend.ts). Le relevé
 * garde son propre compte (trois secondes de table à l'écran) avant le crédit et Start. Essai réel
 * du 04/11/2026 (The Goonies, The Matrix) : « Chargement de la table… » sans fin sur les deux bornes.
 */
export const LIVE_READY_SIGNAL_MS = 20_000;

/** La table est à l'écran depuis `onScreenSince` (ms) et son relevé ne dit toujours pas « prêt » : le garde-fou la dit prête. */
export function liveReadyOverdue(onScreenSince: number | undefined, now: number): boolean {
  return onScreenSince !== undefined && now - onScreenSince >= LIVE_READY_SIGNAL_MS;
}

/**
 * L'heure où « partez » sera donné sans les derniers (ms) : LIVE_READY_WAIT_MS après le premier prêt ;
 * personne prêt, au plus tard ce délai et le garde-fou après le lancement (`startAt`) : une attente
 * où nul ne se dit prêt finit quand même.
 */
export function liveGoDeadline(game: Pick<LiveGame, 'firstReadyAt' | 'startAt'>): number | undefined {
  if (game.firstReadyAt) return Date.parse(game.firstReadyAt) + LIVE_READY_WAIT_MS;
  return game.startAt ? Date.parse(game.startAt) + LIVE_READY_WAIT_MS + LIVE_READY_SIGNAL_MS : undefined;
}

/**
 * Côté hôte : « partez » est-il à donner, et pourquoi ? Tous les joueurs attendus sont prêts (ou ne
 * sont plus attendus : partis, pas démarrés, borne d'avant le départ commun) ; ou le délai des
 * derniers est passé. undefined : on attend encore (ou c'est déjà donné, ou la partie n'est pas lancée).
 */
export function liveGoDue(game: LiveGame, now = new Date()): 'all-ready' | 'timeout' | undefined {
  if (game.goAt || game.phase !== 'playing') return undefined;
  const awaited = liveAwaited(game);
  if (!awaited.length) return 'all-ready';
  const deadline = liveGoDeadline(game);
  return deadline !== undefined && now.getTime() >= deadline ? 'timeout' : undefined;
}

/** « Partez » donné : pourquoi, et qui n'était pas prêt (il partira dès que sa table le sera). */
export function giveGo(game: LiveGame, why: LiveGoReason, now = new Date()): LiveGame {
  if (game.goAt) return game;
  return { ...game, goAt: now.toISOString(), goWhy: why, goLate: liveAwaited(game).map((p) => p.key) };
}

/**
 * Côté invité : « partez » pour ma borne, sans attendre l'hôte ? Son Cyber Pinball ne connaît pas le
 * départ commun (« host-behind ») ; ou je suis prêt depuis LIVE_GO_FALLBACK_MS sans nouvelles
 * (« no-signal »). `readyAt` : quand ma table a été prête (ms).
 */
export function liveGuestGo(game: LiveGame, readyAt: number | undefined, now = new Date()): 'host-behind' | 'no-signal' | undefined {
  if (game.goAt) return undefined;
  const host = game.players.find((p) => p.host);
  if (host && !liveCommonStart(host)) return 'host-behind';
  return readyAt !== undefined && now.getTime() - readyAt >= LIVE_GO_FALLBACK_MS ? 'no-signal' : undefined;
}

// ---------------------------------------------------------------------------
// L'attente, à l'écran : sur la table de chaque borne (app/src/game-notice.ts) et dans l'écran de
// la partie en direct (app/src/live-game-menu.ts).

export interface LiveWaitRow {
  name: string;
  /** « Chargement de la table… », « Prêt », « A quitté la partie »… */
  status: string;
  /** Prêt (ou parti) : la coche verte. */
  ready: boolean;
  /** N'est plus attendu : quitté, pas démarré, ancienne version. */
  out: boolean;
  me: boolean;
}

export interface LiveWaitView {
  mode: 'wait';
  /** « En attente des joueurs », puis « Partez ! ». */
  title: string;
  go: boolean;
  /** Pourquoi la partie n'a pas encore démarré, ou comment elle part. */
  lead: string;
  /** Le délai des derniers : « Départ sans Bruno dans 45 s ». */
  note?: string;
  rows: LiveWaitRow[];
}

/** Le statut d'un joueur pendant l'attente. */
function waitStatus(p: LivePlayer, game: LiveGame): { status: string; ready: boolean; out: boolean } {
  if (p.state === 'left') return { status: t('A quitté la partie'), ready: false, out: true };
  if (p.state === 'failed') return { status: liveFailedPlaying(p) ? t('VPX arrêté pendant sa partie') : t('Partie pas démarrée de son côté'), ready: false, out: true };
  if (p.state === 'done') return { status: t('Partie terminée'), ready: true, out: true };
  if (!liveCommonStart(p)) return { status: t('Ancienne version : part sans attendre'), ready: false, out: true };
  if (p.state === 'playing') return { status: t('Parti'), ready: true, out: false };
  if (p.ready) return { status: t('Prêt'), ready: true, out: false };
  if (game.goLate?.includes(p.key)) return { status: t('Chargement de la table… il part dès qu’elle est prête'), ready: false, out: false };
  return { status: p.state === 'loading' ? t('Chargement de la table…') : t('Lancement de VPX…'), ready: false, out: false };
}

const names = (players: readonly { name: string }[]) => players.map((p) => p.name).join(', ');

/**
 * L'attente du départ commun, vue de la borne `me` ; undefined quand il n'y a rien à montrer (pas de
 * partie lancée, ou « Partez ! » montré depuis LIVE_GO_SHOW_MS). `manual` : ma table n'a pas de
 * relevé, Start n'y est pas bloqué, c'est au joueur d'appuyer au signal. `readyAt` : quand ma table
 * a été prête (ms) ; « Partez ! » se compte de là pour un retardataire.
 */
export function liveWaitView(game: LiveGame, me: string, now = new Date(), opts: { manual?: boolean; readyAt?: number } = {}): LiveWaitView | undefined {
  if (game.phase !== 'playing' && game.phase !== 'countdown') return undefined;
  // Ma table prête se voit tout de suite, sans attendre que la salle de l'hôte me le renvoie.
  const players = livePlayers(game).map((p) => (p.key === me && opts.readyAt !== undefined && !p.ready && p.state === 'loading' ? { ...p, ready: true as const } : p));
  const mine = players.find((p) => p.key === me);
  const rows = players.map((p) => ({ name: p.name, ...waitStatus(p, game), me: p.key === me }));
  const host = game.players.find((p) => p.host);
  if (game.goAt) {
    // « Partez ! » se montre quand ma table part : au signal, ou plus tard si elle chargeait encore.
    const from = Math.max(Date.parse(game.goAt), opts.readyAt ?? 0);
    if (opts.readyAt === undefined && !mine?.ready && mine?.state !== 'playing') {
      return { mode: 'wait', title: t('Les autres sont partis'), go: false, lead: t('Votre table part dès qu’elle est chargée'), rows };
    }
    if (now.getTime() - from > LIVE_GO_SHOW_MS) return undefined;
    const late = players.filter((p) => game.goLate?.includes(p.key) && p.key !== me);
    const lead =
      game.goWhy === 'host-behind'
        ? t('{name} a une ancienne version de Cyber Pinball : votre table part sans attendre les autres', { name: host?.name ?? '?' })
        : game.goWhy === 'no-signal'
          ? t('Plus de nouvelles de {name} : votre table part seule', { name: host?.name ?? '?' })
          : game.goLate?.includes(me)
            ? t('Les autres sont déjà partis : à vous !')
            : late.length
              ? t('Départ sans {names} : table pas prête à temps, départ dès qu’elle le sera', { names: names(late) })
              : t('Tout le monde est prêt');
    return { mode: 'wait', title: t('Partez !'), go: true, lead: opts.manual ? t('{lead} · Appuyez sur Start', { lead }) : lead, ...(opts.manual ? { note: liveManualHint() } : {}), rows };
  }
  const awaited = players.filter((p) => !waitStatus(p, game).ready && !waitStatus(p, game).out);
  const others = awaited.filter((p) => p.key !== me);
  const meWaiting = awaited.some((p) => p.key === me);
  const lead = meWaiting
    ? others.length
      ? t('Votre table se charge ; en attente aussi : {names}', { names: names(others) })
      : t('Votre table se charge…')
    : others.length === 1
      ? t('En attente : {name} — {status}', { name: others[0]!.name, status: waitStatus(others[0]!, game).status })
      : others.length
        ? t('En attente : {names}', { names: names(others) })
        : t('Tout le monde est prêt : départ…');
  const deadline = liveGoDeadline(game);
  const left = deadline !== undefined && others.length ? Math.max(0, Math.ceil((deadline - now.getTime()) / 1000)) : undefined;
  const note = left !== undefined && !meWaiting ? t('Départ sans {names} dans {s} s si sa table n’est pas prête', { names: names(others), s: left }) : undefined;
  const hint = opts.manual ? `${t('Attendez « Partez ! » pour appuyer sur Start')} · ${liveManualHint()}` : undefined;
  return { mode: 'wait', title: t('En attente des joueurs'), go: false, lead, ...(note || hint ? { note: [note, hint].filter(Boolean).join(' · ') } : {}), rows };
}

/**
 * Table sans relevé (départ manuel) : ni départ automatique, ni score en direct, ni fin de partie vue
 * par Cyber Pinball. Le joueur appuie sur Start au signal, et quitte la table à la fin de sa partie ;
 * son score compte s'il entre au tableau d'honneur de la table (lu dans le double à la fermeture).
 */
export function liveManualHint(): string {
  return t('Table sans relevé : quittez-la à la fin de votre partie ; votre score compte s’il entre à son tableau d’honneur');
}

/**
 * La marque d'une table sans relevé, avant la partie (choix de la table, salon, invitation) : ce
 * qu'elle n'aura pas, et pourquoi. Jamais cachée : la table reste jouable, en départ manuel.
 */
export function liveManualLabel(reason: LiveManualReason): { text: string; detail: string } {
  const text = t('Départ manuel, pas de score en direct');
  const why =
    reason === 'script'
      ? t('son script ne donne pas l’état de jeu (score, bille, fin de partie)')
      : reason === 'rom'
        ? t('la mémoire de sa ROM n’est pas décrite (carte absente ou incomplète)')
        : reason === 'inspector'
          ? t('il faudrait l’inspector de VPX : Menu système > Amis > Partage et réseau, règle du pare-feu de VPX')
          : t('le relevé ne s’ajoute pas à son script');
  return { text, detail: t('{why} ; chacun appuie sur Start à « Partez ! », et son score compte s’il entre au tableau d’honneur', { why }) };
}

/** Aux résultats : pourquoi le score d'un joueur sur une table sans relevé n'est pas connu. */
export function liveManualScoreLabel(): string {
  return t('Score non lu : table sans relevé, et score pas entré à son tableau d’honneur');
}

// --- Sur la table ---

/**
 * La carte de l'attente vue du joueur, sur un plateau de 1 080 px de petit côté : titre, raison,
 * délai, puis une ligne de 46 par joueur. Au centre du plateau, dans son tiers haut : aucune bille
 * n'est en jeu pendant l'attente, et c'est là que le joueur regarde.
 */
export const LIVE_WAIT_SIZE = { width: 640, head: 176, row: 46, padding: 24 } as const;

export function liveWaitSize(rows: number): { width: number; height: number } {
  return { width: LIVE_WAIT_SIZE.width, height: LIVE_WAIT_SIZE.head + Math.max(1, rows) * LIVE_WAIT_SIZE.row + LIVE_WAIT_SIZE.padding };
}

/** Place de la carte de l'attente, en pixels de l'écran : centrée en largeur, dans le tiers haut du plateau vu du joueur. */
export function liveWaitBounds(zone: Rect, rotation: Rotation, rows: number): Rect {
  const unit = Math.min(zone.width, zone.height) / 1080;
  const base = liveWaitSize(rows);
  const quarter = rotation === 90 || rotation === 270;
  // Vue du joueur : sa largeur et sa hauteur, et le haut du plateau.
  const viewW = quarter ? zone.height : zone.width;
  const viewH = quarter ? zone.width : zone.height;
  const w = Math.min(Math.round(base.width * unit), viewW);
  const h = Math.min(Math.round(base.height * unit), viewH);
  const top = Math.round(Math.max(0, viewH / 3 - h / 2));
  const left = Math.round((viewW - w) / 2);
  // Du repère du joueur à celui de l'écran, par quart de tour horaire.
  let x = left, y = top, bw = w, bh = h, vw = viewW, vh = viewH;
  for (let r = 0; r < rotation; r += 90) {
    [x, y] = [vh - y - bh, x];
    [bw, bh] = [bh, bw];
    [vw, vh] = [vh, vw];
  }
  return { x: zone.x + x, y: zone.y + y, width: bw, height: bh };
}
