// Chargement d'une page d'application (27/11/2026) : savoir si la page d'Edge charge, pour que la borne
// montre un liseré aux couleurs de l'application. Sans cela, on ne sait pas si la page charge ou si le
// bouton relayé n'a rien fait.
//
// Aucun signal de l'extérieur n'est fiable (arbre d'accessibilité de la page absent, titre qui change dès
// le début de la navigation, curseur, image : essais du 27/11/2026). Seul le protocole de débogage dit
// « la page commence / finit de charger ». Il passe par un TUBE (--remote-debugging-pipe : deux
// descripteurs hérités par Edge, aucun port TCP, rien n'écoute sur la machine), jamais par un port, et
// seulement pour les applications : la connexion à Google (youtube-account.ts) ne change pas.
//
// Ici, la logique pure : le découpage des messages du tube et le suivi de l'état « charge / ne charge pas ».

/** L'argument qui ouvre le tube de débogage d'Edge (descripteurs 3 : commandes, 4 : réponses). Jamais de port. */
export const PAGE_LOADING_ARGS: readonly string[] = ['--remote-debugging-pipe'];

/** Les messages du tube sont du JSON terminé par un octet nul : recolle les morceaux reçus. */
export class PipeDecoder {
  private rest = '';

  /** Les messages complets contenus dans ce morceau ; un message coupé attend la suite. Un message illisible est ignoré. */
  push(chunk: string | Uint8Array): unknown[] {
    this.rest += typeof chunk === 'string' ? chunk : Buffer.from(chunk).toString('utf8');
    const parts = this.rest.split('\0');
    this.rest = parts.pop() ?? '';
    const out: unknown[] = [];
    for (const p of parts) {
      if (!p) continue;
      try {
        out.push(JSON.parse(p));
      } catch {
        // message illisible : ignoré
      }
    }
    return out;
  }
}

export interface PageLoadTrackerOptions {
  /** Écrit une commande sur le tube (déjà terminée par l'octet nul). */
  send(command: string): void;
  /** Appelé à chaque changement de l'état « une page charge ». */
  onChange(loading: boolean): void;
}

interface PageSession {
  /** Cadre principal de la page, quand il est connu. */
  main?: string;
  loading: boolean;
}

interface Pending {
  sessionId: string;
  kind: 'tree' | 'state';
}

interface CdpMessage {
  id?: number;
  method?: string;
  sessionId?: string;
  params?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any -- messages du protocole, lus champ par champ
  result?: Record<string, any>; // eslint-disable-line @typescript-eslint/no-explicit-any
}

/**
 * Suit l'état de chargement des pages d'Edge d'après les messages du tube. Une page charge de
 * `Page.frameStartedNavigating` (ou `frameStartedLoading`) de son cadre principal à `Page.frameStoppedLoading` ; les cadres
 * enfants (publicités, lecteurs intégrés) ne comptent pas. Une page déjà en cours de chargement quand
 * on s'y attache est vue par `document.readyState`.
 */
export function createPageLoadTracker(opts: PageLoadTrackerOptions) {
  const sessions = new Map<string, PageSession>();
  const pending = new Map<number, Pending>();
  let nextId = 1;
  let last = false;

  const command = (method: string, params: object = {}, sessionId?: string): number => {
    const id = nextId++;
    opts.send(`${JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) })}\0`);
    return id;
  };

  const refresh = (): void => {
    const now = [...sessions.values()].some((s) => s.loading);
    if (now === last) return;
    last = now;
    opts.onChange(now);
  };

  function attached(sessionId: string, type: unknown): void {
    if (type !== 'page') return;
    sessions.set(sessionId, { loading: false });
    command('Page.enable', {}, sessionId);
    pending.set(command('Page.getFrameTree', {}, sessionId), { sessionId, kind: 'tree' });
    pending.set(command('Runtime.evaluate', { expression: 'document.readyState', returnByValue: true }, sessionId), { sessionId, kind: 'state' });
  }

  function receive(raw: unknown): void {
    const msg = raw as CdpMessage;
    if (msg.id !== undefined) {
      const p = pending.get(msg.id);
      if (!p) return;
      pending.delete(msg.id);
      const s = sessions.get(p.sessionId);
      if (!s) return;
      if (p.kind === 'tree') s.main = msg.result?.frameTree?.frame?.id;
      else if (msg.result?.result?.value === 'loading') s.loading = true;
      refresh();
      return;
    }
    const s = msg.sessionId ? sessions.get(msg.sessionId) : undefined;
    switch (msg.method) {
      case 'Target.targetCreated':
        if (msg.params?.targetInfo?.type === 'page') command('Target.attachToTarget', { targetId: msg.params.targetInfo.targetId, flatten: true });
        return;
      case 'Target.attachedToTarget':
        attached(String(msg.params?.sessionId), msg.params?.targetInfo?.type);
        return;
      case 'Target.detachedFromTarget':
        sessions.delete(String(msg.params?.sessionId));
        refresh();
        return;
      case 'Page.frameNavigated':
        if (s && msg.params?.frame && !msg.params.frame.parentId) s.main = msg.params.frame.id;
        return;
      case 'Page.frameStartedNavigating':
      case 'Page.frameStartedLoading':
      case 'Page.frameStoppedLoading': {
        if (!s) return;
        const frame = msg.params?.frameId;
        if (s.main !== undefined && frame !== s.main) return;
        // Un changement d'adresse dans la même page (application à page unique) ne charge rien.
        if (msg.params?.navigationType === 'sameDocument') return;
        s.loading = msg.method !== 'Page.frameStoppedLoading';
        refresh();
        return;
      }
    }
  }

  return {
    /** Demande à Edge de signaler ses pages ; à appeler une fois le tube ouvert. */
    start(): void {
      command('Target.setDiscoverTargets', { discover: true });
    },
    receive,
    /** Une page charge-t-elle maintenant ? */
    loading: () => last,
  };
}

export type PageLoadTracker = ReturnType<typeof createPageLoadTracker>;
