// Le DMD de la table pendant une partie entre amis, lu par l'inspector de VPX (vpxinspector.ts) :
// /api/tree donne les afficheurs (DMD de PinMAME, FlexDMD…), /ws/display une image RVB à chaque
// changement. Rien n'est capturé à l'écran : la fenêtre des scores posée par-dessus le DMD ne se lit
// pas elle-même. La règle de l'écran de score est dans packages/core/src/dmdscore.ts.
// Seul un DMD de PinMAME se lit ainsi : celui de FlexDMD se dessine à chaque image demandée, et la
// demande viendrait du fil de l'inspector (dmdscore.ts, inspectorDisplayReadable).

import { DmdScoreWatch, DmdSignalWatch, chooseDmdDisplay, type DmdGameSignals, type DmdScoreVerdict, type InspectorDisplay } from '@cyberpinball/core';

/** L'arbre de l'inspector est relu tant qu'aucun afficheur n'est trouvé (la table charge encore). */
const TREE_RETRY_MS = 2000;

export interface DmdWatch {
  /** Le DMD envoie des images : les scores peuvent s'y poser. */
  readable(): boolean;
  /** Sinon, pourquoi, pour le journal (inspector injoignable, aucun DMD dans son arbre, flux fermé…). */
  unreadable(): string | undefined;
  /** Ce que la partie dit (relevé) : partie en cours, score du joueur. */
  game(signals: DmdGameSignals): void;
  /** Le DMD montre-t-il l'écran de score, maintenant ? */
  verdict(): DmdScoreVerdict;
  stop(): void;
}

export function watchVpxDmd(port: number, log: (line: string) => void, now: () => number = Date.now): DmdWatch {
  const watch = new DmdScoreWatch();
  let socket: WebSocket | undefined;
  let stopped = false;
  let timer: NodeJS.Timeout | undefined;
  let lastFrame = 0;
  let display: InspectorDisplay | undefined;
  /** Un DMD que l'inspector ne doit pas lire (FlexDMD) : le rythme de la partie, sans image. */
  let fallback: DmdSignalWatch | undefined;
  let signals: DmdGameSignals = { inGame: false };
  /** Ce que la lecture a vu en dernier, quand le DMD ne se lit pas. */
  let state = 'inspector de VPX pas encore joint'; // i18n-ignore : journal

  async function findDisplay(): Promise<void> {
    if (stopped) return;
    try {
      const res = await fetch(`http://127.0.0.1:${port}/api/tree`, { signal: AbortSignal.timeout(1500) });
      const refused: InspectorDisplay[] = [];
      const chosen = chooseDmdDisplay(((await res.json()) as { tree?: unknown }).tree, refused);
      state = 'aucun DMD dans l’arbre de l’inspector de VPX'; // i18n-ignore : journal
      if (!chosen && refused.length) {
        // Un DMD dessiné à la demande (FlexDMD…) : le lire d'ici ferait rendre sa scène hors du fil
        // du script de la table, et VPX peut s'arrêter (dmdscore.ts, inspectorDisplayReadable).
        // Les scores y passent au rythme de la partie, sans lire son image (DmdSignalWatch).
        const d = refused[0]!;
        log(`Bande de la partie entre amis : DMD de ${d.controller || 'la table'} (${d.name}) pas lu par l'inspector de VPX : le lire ferait dessiner sa scène hors du fil du script de la table (arrêt de VPX possible). Scores sur le DMD au rythme de la partie, bille en jeu, sans lire son image.`); // i18n-ignore : journal
        fallback = new DmdSignalWatch();
        fallback.game(signals, now());
        return;
      }
      if (chosen) {
        display = chosen;
        log(`Bande de la partie entre amis : DMD lu par l'inspector de VPX (${chosen.name}${chosen.controller ? `, ${chosen.controller}` : ''}).`); // i18n-ignore : journal
        return connect();
      }
    } catch {
      // VPX charge encore la table : l'inspector n'écoute pas, ou n'a pas encore d'afficheur.
      state = `inspector de VPX injoignable sur le port ${port}`; // i18n-ignore : journal
    }
    timer = setTimeout(() => void findDisplay(), TREE_RETRY_MS);
  }

  function connect(): void {
    if (stopped || !display) return;
    const ws = new WebSocket(`ws://127.0.0.1:${port}/ws/display?id=${display.mapping}`);
    state = `flux de « ${display.name} » ouvert, aucune image reçue`; // i18n-ignore : journal
    ws.binaryType = 'arraybuffer';
    ws.onmessage = (event) => {
      if (!(event.data instanceof ArrayBuffer) || event.data.byteLength < 12) return;
      const head = new DataView(event.data);
      const width = head.getUint32(0, true);
      const height = head.getUint32(4, true);
      if (!width || !height || event.data.byteLength < 12 + width * height * 3) return;
      // RVB vers nuance : la plus forte des trois (un DMD orange ou vert garde sa lumière).
      const rgb = new Uint8Array(event.data, 12, width * height * 3);
      const dots = new Uint8Array(width * height);
      for (let i = 0, j = 0; i < dots.length; i++, j += 3) dots[i] = Math.max(rgb[j]!, rgb[j + 1]!, rgb[j + 2]!);
      lastFrame = now();
      watch.frame({ width, height, dots }, lastFrame);
    };
    ws.onclose = () => {
      socket = undefined;
      state = `flux de « ${display?.name ?? 'DMD'} » fermé par l’inspector de VPX`; // i18n-ignore : journal
      // La table est finie, ou l'afficheur a changé : l'arbre est relu.
      if (!stopped) timer = setTimeout(() => void findDisplay(), TREE_RETRY_MS);
    };
    ws.onerror = () => undefined;
    socket = ws;
  }

  void findDisplay();
  return {
    // L'inspector n'envoie une image qu'à chaque changement : un DMD fixe se tait, il reste lisible.
    readable: () => !stopped && (fallback !== undefined || (socket?.readyState === WebSocket.OPEN && lastFrame > 0)),
    unreadable: () => (stopped ? 'lecture arrêtée' : fallback || (socket?.readyState === WebSocket.OPEN && lastFrame > 0) ? undefined : state), // i18n-ignore : journal
    game: (s) => {
      signals = s;
      watch.game(s, now());
      fallback?.game(s, now());
    },
    verdict: () => (fallback ? fallback.verdict(now()) : watch.verdict(now())),
    stop() {
      stopped = true;
      if (timer) clearTimeout(timer);
      socket?.close();
    },
  };
}

/**
 * Table sans PinMAME (DMD de FlexDMD dessiné par son script) : l'inspector ne lit jamais son image
 * (arrêt de VPX du 04/11/2026). Les scores y passent au rythme de la partie, d'après le relevé seul
 * (DmdSignalWatch) : partie en cours, bille en jeu.
 */
export function scriptDmdWatch(now: () => number = Date.now): DmdWatch {
  const watch = new DmdSignalWatch();
  return {
    readable: () => true,
    unreadable: () => undefined,
    game: (signals) => watch.game(signals, now()),
    verdict: () => watch.verdict(now()),
    stop: () => undefined,
  };
}

/**
 * Partie simulée (essais hors écran) : ni VPX ni inspector. Le DMD est « lisible » ; en partie, il
 * montre son écran de score, sauf une animation de 4 s toutes les 18 s (SIMULATED_DMD) : la bande s'y
 * pose comme en vrai, au rythme des passages, et en repart pendant l'animation.
 */
export const SIMULATED_DMD = { calmMs: 14_000, animationMs: 4000 } as const;

export function simulatedDmdWatch(now: () => number = Date.now): DmdWatch {
  let since: number | undefined;
  return {
    readable: () => true,
    unreadable: () => undefined,
    game: (signals) => void (since = signals.inGame ? (since ?? now()) : undefined),
    verdict: () => {
      if (since === undefined) return { scoreScreen: false, why: 'pas de partie en cours', screenMs: 0, runs: 0 }; // i18n-ignore : raison pour le journal
      const phase = (now() - since) % (SIMULATED_DMD.calmMs + SIMULATED_DMD.animationMs);
      return phase < SIMULATED_DMD.calmMs ? { scoreScreen: true, why: 'écran de score', screenMs: phase, runs: 1 } : { scoreScreen: false, why: 'animation', screenMs: 0, runs: 0 }; // i18n-ignore : raison pour le journal
    },
    stop: () => undefined,
  };
}
