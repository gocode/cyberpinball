// Cadence de VPX dans le casque : le bridage, lu dans les mesures du plugin (casque-vpx.txt).
//
// Constat du 13 novembre 2026 sur une borne (Quest 2 à 72 Hz, 23 parties sur 23) : chaque partie dans le
// casque commençait vers 69 images par seconde puis restait à 28,1, sur toutes les tables, lourdes ou
// légères, le plus grand écart entre deux images à 48 ms. Une cadence aussi stable, la même partout, n'est
// pas celle d'une table trop lourde (elle varierait avec la scène) : c'est un bridage. Il commençait à
// chaque fois 8 s après la première image, à l'instant où le plugin capturait une fenêtre de VPX.
// Explication retenue : VPX demande à Windows une minuterie d'une milliseconde (timeBeginPeriod), et
// Windows 11 peut ignorer cette demande pour un processus dont aucune fenêtre n'est visible ; en réalité
// virtuelle, l'image part dans le casque et la fenêtre d'aperçu de VPX est un timbre sous l'écran de Cyber
// Pinball. Mesuré sur la borne : dans un processus dont la demande est ignorée, Sleep(1) dure 15,4 ms au
// lieu de 1,4 ; et 28 images par seconde, c'est 7 images pour 16 battements de 15,6 ms, l'écart maximal de
// trois battements faisant 47 ms. L'essai de cadence (plus bas) fait la preuve directe sur une borne.
//
// Le plugin (packages/vpx-vision3d, minuterie.h) pose la garde et mesure la minuterie ; ici, ce que ses
// lignes disent d'une partie :
// - « mesure … vpx=… ecart_ms=… minuterie_ms=… » : toutes les 5 s, la cadence, le plus grand écart entre
//   deux images, la durée réelle de Sleep(1) ;
// - « minuterie garde=… resultat=… » : la garde demandée, acceptée ou non par Windows ;
// - « minuterie etat=degradee|retablie t=… ms=… » : l'instant où la minuterie a changé d'état.
// - « essai etape=debut|capture|garde|fin t=… » : l'essai de cadence ([Plugin.CyberPinball] CadenceTest) ;
// - « sortie t=… sans_image_ms=… » : la sortie demandée, et depuis quand VPX ne préparait plus d'image.
// Le palier se reconnaît sans la mesure de la minuterie (plugin plus ancien, autre cause de bridage) :
// la classe du défaut est « cadence fixe sous celle du casque », pas « minuterie ».

/** Au-dessus, Sleep(1) ne dure plus une à deux millisecondes : la minuterie demandée par VPX est ignorée. */
export const TIMER_DEGRADED_MS = 5;
/** Un palier : au moins ce nombre de relevés de 5 s de suite à la même cadence. */
export const PLATEAU_MIN_SAMPLES = 3;
/** « La même cadence » : relevés à moins de 2,5 % de leur médiane. */
export const PLATEAU_SPREAD = 0.025;
/** Un palier bride VPX quand il est sous 80 % de la fréquence du casque. */
export const PLATEAU_SHARE = 0.8;

export interface VrCadencePlateau {
  /** Cadence du palier, en images par seconde (médiane de ses relevés). */
  fps: number;
  /** Relevés de 5 s à cette cadence. */
  samples: number;
  /** Part des relevés de la partie passés sur le palier. */
  share: number;
  /** Meilleure cadence relevée avant le palier (undefined : la partie y a commencé). */
  before?: number;
  /** Instant du premier relevé du palier, en secondes de partie. */
  at: number;
}

export interface VrCadence {
  /** Images par seconde de VPX, relevé par relevé (5 s). */
  series: { at: number; fps: number; gapMs: number; timerMs?: number }[];
  plateau?: VrCadencePlateau;
  /** Durée réelle de Sleep(1) : moyenne et pire relevé, relevés dégradés ; undefined : plugin sans la sonde. */
  timer?: { mean: number; worst: number; degraded: number; samples: number };
  /** Changements d'état de la minuterie, à leur instant (secondes de partie). */
  timerEvents: { degraded: boolean; at: number; ms: number }[];
  /** La garde de la minuterie : mode demandé (0 Windows décide, 1 garde, 2 ignorée d'office) et réponse de Windows. */
  guard?: { mode: number; ok: boolean };
}

const values = (line: string): Record<string, string> => Object.fromEntries([...line.matchAll(/(\w+)=(\S+)/g)].map((m) => [m[1]!, m[2]!]));

/**
 * Le palier d'une suite de cadences : la plus longue suite de relevés consécutifs à la même cadence
 * (PLATEAU_SPREAD), sous PLATEAU_SHARE de la fréquence du casque. Une table lourde ne donne pas de palier :
 * sa cadence suit la scène.
 */
export function vrCadencePlateau(series: readonly { at: number; fps: number }[], headsetHz = 72): VrCadencePlateau | undefined {
  let best: { start: number; length: number; fps: number } | undefined;
  for (let start = 0; start < series.length; start++) {
    let length = 0;
    let fps = 0;
    for (let end = start; end < series.length; end++) {
      const sorted = series
        .slice(start, end + 1)
        .map((s) => s.fps)
        .sort((a, b) => a - b);
      const median = sorted[Math.floor(sorted.length / 2)]!;
      if (median <= 0 || sorted[0]! < median * (1 - PLATEAU_SPREAD) || sorted[sorted.length - 1]! > median * (1 + PLATEAU_SPREAD)) break;
      length = end - start + 1;
      fps = median;
    }
    if (length >= PLATEAU_MIN_SAMPLES && fps < headsetHz * PLATEAU_SHARE && (!best || length > best.length)) best = { start, length, fps };
  }
  if (!best) return undefined;
  const before = series.slice(0, best.start).map((s) => s.fps);
  return {
    fps: best.fps,
    samples: best.length,
    share: best.length / series.length,
    ...(before.length && { before: Math.max(...before) }),
    at: series[best.start]!.at,
  };
}

/** Lit la cadence d'un bloc de mesures du plugin ; undefined s'il n'a rien relevé. */
export function parseVrCadence(text: string, headsetHz = 72): VrCadence | undefined {
  const lines = text.split(/\r?\n/);
  const series = lines
    .filter((l) => l.startsWith('mesure '))
    .map(values)
    .map((v) => ({ at: Number(v.t), fps: Number(v.vpx), gapMs: Number(v.ecart_ms), ...(v.minuterie_ms !== undefined && Number(v.minuterie_ms) >= 0 && { timerMs: Number(v.minuterie_ms) }) }))
    .filter((s) => Number.isFinite(s.fps));
  const guardLine = lines.filter((l) => l.startsWith('minuterie garde=')).map(values)[0];
  const timerEvents = lines
    .filter((l) => l.startsWith('minuterie etat='))
    .map(values)
    .map((v) => ({ degraded: v.etat === 'degradee', at: Number(v.t), ms: Number(v.ms) }));
  if (!series.length && !guardLine && !timerEvents.length) return undefined;
  const timers = series.map((s) => s.timerMs).filter((x): x is number => x !== undefined);
  const plateau = vrCadencePlateau(series, headsetHz);
  return {
    series,
    ...(plateau && { plateau }),
    ...(timers.length && { timer: { mean: timers.reduce((a, b) => a + b, 0) / timers.length, worst: Math.max(...timers), degraded: timers.filter((x) => x > TIMER_DEGRADED_MS).length, samples: timers.length } }),
    timerEvents,
    ...(guardLine && { guard: { mode: Number(guardLine.garde), ok: guardLine.resultat === 'ok' } }),
  };
}

/** La minuterie de Windows a été dégradée pendant la partie (un relevé, ou un changement d'état, au-dessus du seuil). */
export function vrTimerDegraded(c: VrCadence): boolean {
  return (c.timer?.degraded ?? 0) > 0 || c.timerEvents.some((e) => e.degraded);
}

/**
 * VPX a été bridé pendant la partie : un palier de cadence, ou la minuterie dégradée. Le verdict de fluidité
 * dit alors « bridé », pas « rendu trop lourd » : baisser les réglages graphiques n'y changerait rien.
 */
export function vrCadenceCapped(c: VrCadence | undefined): boolean {
  return Boolean(c && (c.plateau || vrTimerDegraded(c)));
}

/** Ce que la cadence d'une partie dit, pour le journal : une phrase par constat (vide : rien à dire). */
export function describeVrCadence(c: VrCadence): string[] {
  const f = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
  const out: string[] = [];
  if (c.plateau) {
    const p = c.plateau;
    const from = p.before !== undefined && p.before > p.fps * 1.1 ? `, après ${f(p.before)} images/s en début de partie` : ''; // i18n-ignore : journal
    out.push(`VPX bridé à un palier de ${f(p.fps)} images/s (${p.samples} relevé(s) de 5 s de suite à la même cadence, depuis ${Math.round(p.at)} s de partie${from}) : une cadence fixe, pas une table trop lourde`); // i18n-ignore : journal
  }
  if (c.timer || c.timerEvents.length) {
    const first = c.timerEvents.find((e) => e.degraded);
    const guard = c.guard ? (c.guard.mode === 1 ? (c.guard.ok ? 'garde posée' : 'garde refusée par Windows') : c.guard.mode === 2 ? 'ignorée d’office (banc d’essai)' : 'sans garde') : 'plugin sans garde'; // i18n-ignore : journal
    if (vrTimerDegraded(c)) {
      const worst = Math.max(c.timer?.worst ?? 0, ...c.timerEvents.map((e) => e.ms));
      const when = first ? ` à ${f(first.at)} s de partie` : ''; // i18n-ignore : journal
      const share = c.timer ? `, ${c.timer.degraded} relevé(s) sur ${c.timer.samples}` : ''; // i18n-ignore : journal
      out.push(`minuterie de Windows dégradée${when} (Sleep(1) dure ${f(worst)} ms au lieu de 1 à 2${share} ; ${guard}) : Windows ignore la minuterie demandée par VPX, sa boucle se cale sur des battements de 15,6 ms`); // i18n-ignore : journal
    } else if (c.timer) out.push(`minuterie de Windows tenue (Sleep(1) dure ${f(c.timer.mean)} ms en moyenne, ${f(c.timer.worst)} au plus ; ${guard})`); // i18n-ignore : journal
  }
  return out;
}

/** Une phase de l'essai de cadence : cadence et minuterie moyennes de ses relevés entiers. */
export interface VrCadencePhase {
  fps: number;
  timerMs?: number;
  samples: number;
}

export type VrCadenceTestVerdict =
  /** La capture fait tomber la cadence et la minuterie, la garde rétablit les deux : cause prouvée. */
  | 'timer'
  /** La cadence tombe après la capture, la minuterie reste tenue : le bridage vient d'ailleurs. */
  | 'other'
  /** La cadence tombe avec la minuterie, la garde ne rétablit rien. */
  | 'guard-failed'
  /** Rien ne tombe après la capture : le défaut ne s'est pas produit pendant l'essai. */
  | 'no-drop'
  /** Essai interrompu avant sa fin, ou sans relevé entier dans une phase. */
  | 'incomplete';

export interface VrCadenceTest {
  before?: VrCadencePhase;
  afterCapture?: VrCadencePhase;
  afterGuard?: VrCadencePhase;
  verdict: VrCadenceTestVerdict;
}

/**
 * L'essai de cadence d'une partie ([Plugin.CyberPinball] CadenceTest = 1, lignes « essai etape=… ») : une
 * minute, sans garde, puis à 20 s la capture d'avant le 13 novembre 2026 (fenêtre cachée de VPX), puis à 40 s
 * la garde de la minuterie. undefined : pas d'essai dans ce bloc. Un relevé de 5 s compte pour la phase où
 * il tient en entier, le premier de chaque phase mis à part (régime transitoire).
 */
export function vrCadenceTest(text: string, c: VrCadence | undefined = parseVrCadence(text)): VrCadenceTest | undefined {
  const steps = Object.fromEntries(
    text
      .split(/\r?\n/)
      .filter((l) => l.startsWith('essai etape='))
      .map(values)
      .map((v) => [v.etape!, Number(v.t)]),
  ) as Record<string, number | undefined>;
  if (steps.debut === undefined || !c) return undefined;
  const phase = (from: number | undefined, to: number | undefined): VrCadencePhase | undefined => {
    if (from === undefined) return undefined;
    const rows = c.series.filter((s) => s.at - 5 >= from - 0.5 && (to === undefined || s.at <= to + 0.5));
    // Le premier relevé d'une phase porte son régime transitoire (démarrage de la partie, bascule) : écarté.
    if (rows.length >= 2) rows.shift();
    if (!rows.length) return undefined;
    const timers = rows.map((r) => r.timerMs).filter((x): x is number => x !== undefined);
    return { fps: rows.reduce((a, r) => a + r.fps, 0) / rows.length, ...(timers.length && { timerMs: timers.reduce((a, b) => a + b, 0) / timers.length }), samples: rows.length };
  };
  const before = phase(steps.debut, steps.capture);
  const afterCapture = phase(steps.capture, steps.garde);
  const afterGuard = phase(steps.garde, steps.fin);
  let verdict: VrCadenceTestVerdict = 'incomplete';
  if (before && afterCapture && afterGuard && steps.fin !== undefined) {
    const dropped = afterCapture.fps < before.fps * 0.8;
    const timerDown = (afterCapture.timerMs ?? 0) > TIMER_DEGRADED_MS;
    const restored = afterGuard.fps >= before.fps * 0.9 && (afterGuard.timerMs ?? 0) <= TIMER_DEGRADED_MS;
    verdict = !dropped ? 'no-drop' : !timerDown ? 'other' : restored ? 'timer' : 'guard-failed';
  }
  return { ...(before && { before }), ...(afterCapture && { afterCapture }), ...(afterGuard && { afterGuard }), verdict };
}

/** L'essai de cadence, pour le journal. */
export function describeVrCadenceTest(test: VrCadenceTest): string {
  const f = (v: number, d = 1) => v.toFixed(d).replace('.', ',');
  const p = (x: VrCadencePhase | undefined) => (x ? `${f(x.fps)} images/s${x.timerMs !== undefined ? `, Sleep(1) ${f(x.timerMs)} ms` : ''}` : 'aucun relevé'); // i18n-ignore : journal
  const verdict: Record<VrCadenceTestVerdict, string> = {
    timer: 'cause prouvée : la capture d’une fenêtre cachée de VPX fait ignorer sa minuterie par Windows, la cadence tombe ; la garde rétablit la minuterie et la cadence', // i18n-ignore : journal
    other: 'la cadence tombe après la capture alors que la minuterie reste tenue : le bridage ne vient pas de la minuterie', // i18n-ignore : journal
    'guard-failed': 'la cadence et la minuterie tombent après la capture, et la garde ne rétablit rien', // i18n-ignore : journal
    'no-drop': 'rien ne tombe après la capture : le défaut ne s’est pas produit pendant cet essai', // i18n-ignore : journal
    incomplete: 'essai incomplet (partie de moins d’une minute)', // i18n-ignore : journal
  };
  return `sans garde ${p(test.before)} ; après la capture d’une fenêtre cachée ${p(test.afterCapture)} ; après la garde de la minuterie ${p(test.afterGuard)} ; ${verdict[test.verdict]}`; // i18n-ignore : journal
}

/** Au-delà, VPX ne préparait plus d'image quand la sortie a été demandée : casque retiré, session OpenXR arrêtée. */
export const QUIT_IDLE_MS = 500;

/**
 * La sortie demandée alors que VPX ne préparait plus d'image (dernière ligne « sortie … » du bloc) : casque
 * retiré, la session OpenXR arrêtée ne demande plus d'image, et VPX 10.8.1 en attend une pour finir sa partie
 * (player.cpp, « Flush any pending frame ») : il se fige en quittant, jusqu'à ce que le casque soit remis ou
 * que Cyber Pinball le ferme (launcher.ts). undefined : sortie pas demandée, ou demandée casque porté.
 */
export function vrQuitWithoutHeadset(text: string): { at: number; idleMs: number } | undefined {
  const last = text
    .split(/\r?\n/)
    .filter((l) => l.startsWith('sortie '))
    .map(values)
    .pop();
  if (!last) return undefined;
  const idleMs = Number(last.sans_image_ms);
  return Number.isFinite(idleMs) && idleMs >= QUIT_IDLE_MS ? { at: Number(last.t), idleMs } : undefined;
}
