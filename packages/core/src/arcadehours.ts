// Horaire de la borne, façon salle d'arcade (Menu système > Médias > « Médias, son et attente »
// > « Horaire de la borne ») : la nuit, en attente, un voile noir baisse les écrans et l'attente
// se tait ; à l'heure dite, la borne s'arrête (veille ou extinction) si personne ne joue.
//
// Règles :
// - les heures sont locales et l'horaire traverse minuit (nuit de 23 h à 8 h) ;
// - une partie en cours, un bouton récent retiennent l'arrêt : passé l'heure, il attend la borne
//   libre, jusqu'à la fin de la nuit (fenêtre d'arrêt) ; réveillée dans cette fenêtre puis
//   laissée seule, la borne se rendort ;
// - 30 s de préavis avant d'agir ; le moindre bouton le retire et la borne reste allumée ;
// - l'arrêt passe par le module d'alimentation (power.ts) : même écran noir, réglages
//   enregistrés avant d'agir, et jamais rien de réel pendant un essai (arcadehours.test.ts).

import { t } from './i18n';
import type { PowerAction, PowerClock, PowerControl, PowerOutcome, ScheduledPower } from './power';

/** Arrêts possibles à heure fixe : le redémarrage n'a pas de sens la nuit. */
export const STOP_ACTIONS = ['sleep', 'shutdown'] as const satisfies readonly PowerAction[];
export type StopAction = (typeof STOP_ACTIONS)[number];

export interface ArcadeHoursSettings {
  /** Horaire suivi ; coupé par défaut (la borne ne s'arrête jamais seule sans qu'on l'ait voulu). */
  on: boolean;
  /** Début et fin de la nuit, en minutes depuis minuit (heure locale). */
  nightFrom: number;
  nightTo: number;
  /** Voile noir des écrans la nuit, en attente, en pour cent ; 0 : écrans inchangés, 100 : noirs. */
  nightDim: number;
  /** Heure d'arrêt, en minutes depuis minuit ; null : jamais. */
  stopAt: number | null;
  stopBy: StopAction;
}

export const DEFAULT_ARCADE_HOURS: ArcadeHoursSettings = {
  on: false,
  nightFrom: 23 * 60,
  nightTo: 8 * 60,
  nightDim: 70,
  stopAt: 2 * 60,
  stopBy: 'sleep',
};

/** Voiles proposés, en pour cent. */
export const NIGHT_DIM_CHOICES: readonly number[] = [0, 50, 70, 85, 100];
/** Heures proposées (heures pleines), en minutes depuis minuit. */
export const HOUR_CHOICES: readonly number[] = Array.from({ length: 24 }, (_, h) => h * 60);
/** Préavis avant l'arrêt. */
export const STOP_NOTICE_MS = 30_000;
/** Borne libre sans mode attente (réglé sur « jamais ») : tant de temps sans bouton. */
export const STOP_IDLE_FALLBACK_MS = 5 * 60_000;
/** La nuit se relit à ce rythme (début et fin de la nuit, changement d'heure). */
export const NIGHT_CHECK_MS = 30_000;

const DAY_MINUTES = 24 * 60;

const minuteOf = (value: unknown, fallback: number) => (typeof value === 'number' && Number.isInteger(value) && value >= 0 && value < DAY_MINUTES ? value : fallback);

/** Réglages lus d'un objet quelconque (medias.json écrit à la main, version plus ancienne). */
export function normalizeArcadeHours(raw: unknown): ArcadeHoursSettings {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const d = DEFAULT_ARCADE_HOURS;
  return {
    on: typeof r.on === 'boolean' ? r.on : d.on,
    nightFrom: minuteOf(r.nightFrom, d.nightFrom),
    nightTo: minuteOf(r.nightTo, d.nightTo),
    nightDim: typeof r.nightDim === 'number' && Number.isInteger(r.nightDim) && r.nightDim >= 0 && r.nightDim <= 100 ? r.nightDim : d.nightDim,
    stopAt: r.stopAt === null ? null : minuteOf(r.stopAt, d.stopAt ?? 0),
    stopBy: STOP_ACTIONS.includes(r.stopBy as StopAction) ? (r.stopBy as StopAction) : d.stopBy,
  };
}

/** « 2 h », « 23 h », « 6 h 30 ». */
export function hourLabel(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return m ? t('{hour} h {minutes}', { hour: h, minutes: String(m).padStart(2, '0') }) : t('{hour} h', { hour: h });
}

/** Minute du jour (heure locale) d'un instant. */
export function minuteOfDay(ms: number): number {
  const d = new Date(ms);
  return d.getHours() * 60 + d.getMinutes();
}

/** La minute est-elle dans la plage [from, to[ ? La plage traverse minuit si from > to ; vide si from = to. */
export function inDailyRange(minute: number, from: number, to: number): boolean {
  if (from === to) return false;
  return from < to ? minute >= from && minute < to : minute >= from || minute < to;
}

/** Est-ce la nuit de l'horaire ? Jamais quand l'horaire n'est pas suivi. */
export function isNight(now: number, s: ArcadeHoursSettings): boolean {
  return s.on && inDailyRange(minuteOfDay(now), s.nightFrom, s.nightTo);
}

/** Instant local du jour de `ms` à `minute` (le jour décalé de `days`) ; un changement d'heure est suivi par Date. */
function atMinute(ms: number, minute: number, days = 0): number {
  const d = new Date(ms);
  d.setDate(d.getDate() + days);
  d.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  return d.getTime();
}

/** Prochaine fois où l'horloge marque `minute`, strictement après `after`. */
export function nextOccurrence(after: number, minute: number): number {
  const today = atMinute(after, minute);
  return today > after ? today : atMinute(after, minute, 1);
}

/** Dernière fois où l'horloge a marqué `minute`, au plus tard `atOrBefore`. */
export function lastOccurrence(atOrBefore: number, minute: number): number {
  const today = atMinute(atOrBefore, minute);
  return today <= atOrBefore ? today : atMinute(atOrBefore, minute, -1);
}

/** Fenêtre d'arrêt : de l'heure d'arrêt à la fin de la nuit qui suit. */
export interface StopWindow {
  action: StopAction;
  /** Heure d'arrêt (ms) ; maintenant si l'on est déjà dans la fenêtre. */
  at: number;
  /** Fin de la fenêtre : passé cette heure, un arrêt retenu n'est plus fait. */
  until: number;
}

/** L'heure d'arrêt tombe-t-elle dans la nuit ? Sinon, l'écran des réglages le signale. */
export function stopInNight(s: ArcadeHoursSettings): boolean {
  return s.stopAt === null || inDailyRange(s.stopAt, s.nightFrom, s.nightTo);
}

/**
 * Heure d'arrêt hors de la nuit (22 h pour une nuit de 23 h à 8 h, ou 8 h pile) : la fenêtre ne
 * dure qu'une heure. Sans cela, un arrêt réglé à la fin de la nuit arrêterait la borne toute la journée.
 */
export const STOP_WINDOW_OUTSIDE_MS = 3600_000;

/** Fin de la fenêtre qui s'ouvre à `at` : la fin de la nuit, ou une heure plus tard hors de la nuit. */
function windowEnd(at: number, s: ArcadeHoursSettings): number {
  return stopInNight(s) ? nextOccurrence(at, s.nightTo) : at + STOP_WINDOW_OUTSIDE_MS;
}

/** Prochaine fenêtre d'arrêt, ou celle en cours. undefined : horaire non suivi, ou sans heure d'arrêt. */
export function stopWindow(now: number, s: ArcadeHoursSettings): StopWindow | undefined {
  if (!s.on || s.stopAt === null) return undefined;
  const lastUntil = windowEnd(lastOccurrence(now, s.stopAt), s);
  if (now < lastUntil) return { action: s.stopBy, at: now, until: lastUntil };
  const at = nextOccurrence(now, s.stopAt);
  return { action: s.stopBy, at, until: windowEnd(at, s) };
}

/** Libellé d'un voile : « voile noir à 70 % », « écrans noirs », « écrans inchangés ». */
export function nightDimLabel(percent: number): string {
  return percent >= 100 ? t('écrans noirs') : percent <= 0 ? t('écrans inchangés') : t('voile noir à {percent} %', { percent });
}

export function stopActionLabel(action: StopAction): string {
  return action === 'sleep' ? t('mise en veille') : t('extinction');
}

/** Résumé de l'horaire, sur la ligne qui ouvre son écran : « nuit 23 h–8 h · veille à 2 h ». */
export function arcadeHoursSummary(s: ArcadeHoursSettings): string {
  if (!s.on) return t('désactivé');
  const night = t('nuit {from}–{to}', { from: hourLabel(s.nightFrom), to: hourLabel(s.nightTo) });
  if (s.stopAt === null) return t('{night} · sans arrêt automatique', { night });
  return s.stopBy === 'sleep'
    ? t('{night} · veille à {hour}', { night, hour: hourLabel(s.stopAt) })
    : t('{night} · extinction à {hour}', { night, hour: hourLabel(s.stopAt) });
}

/** Préavis d'arrêt en cours : l'action, et son heure (horloge de l'horaire). */
export interface StopNotice {
  action: StopAction;
  endsAt: number;
}

export interface ArcadeHoursHost {
  /** Module d'alimentation : l'arrêt passe par lui (écran noir, réglages enregistrés, essais simulés). */
  control: Pick<PowerControl, 'schedule'>;
  settings(): ArcadeHoursSettings;
  /** Borne libre : personne ne joue, aucun bouton depuis un moment (mode attente en cours). */
  idle(): boolean;
  /** Préavis affiché, ou retiré (undefined). */
  notice(notice: StopNotice | undefined): void;
  /** La nuit commence ou finit (voile, son de l'attente). */
  changed(): void;
  /** Après l'arrêt : réveil, refus de Windows, fin d'un essai. */
  done(action: StopAction, outcome: PowerOutcome): void;
  log(line: string): void;
  clock?: PowerClock;
}

const SYSTEM_CLOCK: PowerClock = {
  now: () => Date.now(),
  setTimeout: (run, ms) => {
    const handle = setTimeout(run, ms);
    handle.unref?.();
    return handle;
  },
  clearTimeout: (handle) => clearTimeout(handle as NodeJS.Timeout),
};

/**
 * L'horaire en marche : programme l'arrêt de la prochaine fenêtre (puis de la suivante, après
 * l'arrêt ou s'il est manqué), relit la nuit, retire le préavis au premier bouton.
 */
export class ArcadeHours {
  private readonly clock: PowerClock;
  private job: ScheduledPower | undefined;
  private shown: StopNotice | undefined;
  private nightTimer: unknown;
  private wasNight = false;
  private stopped = false;

  constructor(private readonly host: ArcadeHoursHost) {
    this.clock = host.clock ?? SYSTEM_CLOCK;
  }

  /** Met l'horaire en marche (au démarrage du menu). */
  start(): void {
    this.stopped = false;
    this.wasNight = this.night();
    this.watchNight();
    this.arm();
  }

  /** Réglages changés : l'arrêt est reprogrammé, la nuit relue. */
  update(): void {
    if (this.stopped) return;
    this.arm();
    this.checkNight();
  }

  /** Est-ce la nuit de l'horaire ? */
  night(): boolean {
    return isNight(this.clock.now(), this.host.settings());
  }

  /** Préavis en cours, s'il y en a un. */
  get notice(): StopNotice | undefined {
    return this.shown;
  }

  /** Arrêt programmé, s'il y en a un. */
  get scheduled(): ScheduledPower | undefined {
    return this.job?.pending ? this.job : undefined;
  }

  /**
   * Bouton, clic : retire le préavis tout de suite (l'arrêt attend de nouveau la borne libre).
   * Vrai si un préavis était affiché : le bouton n'a pas d'autre effet.
   */
  activity(): boolean {
    if (!this.shown) return false;
    this.show(undefined);
    return true;
  }

  dispose(): void {
    this.stopped = true;
    this.job?.cancel();
    this.job = undefined;
    if (this.nightTimer !== undefined) this.clock.clearTimeout(this.nightTimer);
    this.nightTimer = undefined;
    this.show(undefined);
  }

  private show(notice: StopNotice | undefined): void {
    if (!notice && !this.shown) return;
    this.shown = notice;
    this.host.notice(notice);
  }

  private arm(): void {
    this.job?.cancel();
    this.job = undefined;
    if (this.stopped) return;
    const window = stopWindow(this.clock.now(), this.host.settings());
    if (!window) return;
    const { action, at, until } = window;
    this.host.log(`Horaire : ${action} prévu le ${new Date(at).toLocaleString('fr-FR')}, au plus tard le ${new Date(until).toLocaleString('fr-FR')}.`); // i18n-ignore : journal
    const job = this.host.control.schedule(action, at, {
      ready: () => this.host.idle(),
      until,
      notice: { ms: STOP_NOTICE_MS, show: (endsAt) => this.show(endsAt === undefined ? undefined : { action, endsAt }) },
      onMissed: () => {
        this.host.log(`Horaire : ${action} manqué (borne en veille, éteinte, ou occupée jusqu'à la fin de la nuit).`); // i18n-ignore : journal
        if (this.job === job) this.arm();
      },
      onDone: (outcome) => {
        this.host.done(action, outcome);
        // Réveil (ou essai) : la fenêtre suivante, ou celle en cours si la nuit n'est pas finie.
        if (this.job === job) this.arm();
      },
    });
    this.job = job;
  }

  private watchNight(): void {
    this.nightTimer = this.clock.setTimeout(() => {
      this.nightTimer = undefined;
      if (this.stopped) return;
      this.checkNight();
      this.watchNight();
    }, NIGHT_CHECK_MS);
  }

  private checkNight(): void {
    const night = this.night();
    if (night === this.wasNight) return;
    this.wasNight = night;
    this.host.changed();
  }
}

// ---------------------------------------------------------------------------
// Réveil par un bouton

/** Classes de périphériques qui font un bouton de borne : encodeurs en clavier, Pinscape et manettes, souris (trackball). */
const WAKE_CLASSES = ['Keyboard', 'HIDClass', 'Mouse'];

/**
 * Périphériques que Windows autorise à réveiller le PC (MSPower_DeviceWakeEnable, lu sans rien
 * écrire), d'après la sortie JSON de la lecture : noms des boutons, claviers et souris, sans doublon.
 */
export function parseWakeDevices(raw: unknown): string[] {
  const list = Array.isArray(raw) ? raw : raw && typeof raw === 'object' ? [raw] : [];
  const names = list
    .filter((d): d is { name: string; cls?: string } => Boolean(d) && typeof (d as { name?: unknown }).name === 'string')
    .filter((d) => WAKE_CLASSES.includes(d.cls ?? ''))
    .map((d) => d.name.trim())
    .filter(Boolean);
  return [...new Set(names)];
}

/**
 * Horloge de l'horaire. Un essai peut la décaler (CYBERPINBALL_HORLOGE=2026-10-27T01:59:20,
 * heure locale) pour montrer la nuit et l'arrêt sans attendre ; jamais hors essai
 * (`simulated` : powerSimulated de l'environnement), où l'horloge est celle du PC.
 */
export function arcadeHoursClock(env: NodeJS.ProcessEnv, simulated: boolean, base: PowerClock = SYSTEM_CLOCK): PowerClock {
  const wanted = simulated && env.CYBERPINBALL_HORLOGE ? Date.parse(env.CYBERPINBALL_HORLOGE) : NaN;
  if (Number.isNaN(wanted)) return base;
  const offset = wanted - base.now();
  return { ...base, now: () => base.now() + offset };
}
