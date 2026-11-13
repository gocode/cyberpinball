// Sorties du son du Juke-box (Menu système > Médias > Réglages du Juke-box, demandé le 13/11/2026) :
// une ou plusieurs sorties de Windows, chacune avec son volume par rapport aux autres, un profil
// (complet, basses seules, médiums et aigus, ou personnalisé : basses, médiums, aigus) et un retard
// pour caler des haut-parleurs qui ne répondent pas en même temps.
//
// Sans réglage, le Juke-box joue comme avant : la sortie du menu (celle du fronton, menuAudioOutput),
// son intact. Une sortie se désigne par son nom Windows, comme partout ailleurs (VPX, menu-audio.js).
// Ce module ne fait que des calculs : le plan de routage (jukeboxRoutes) est joué par
// app/renderer/audio-routes.js, dans la fenêtre du clip et dans la page du lecteur YouTube.

import { t } from './i18n';

export const JUKEBOX_AUDIO_PROFILES = ['full', 'bass', 'highs', 'custom'] as const;
export type JukeboxAudioProfile = (typeof JUKEBOX_AUDIO_PROFILES)[number];

export const JUKEBOX_AUDIO_PROFILE_LABELS: Record<JukeboxAudioProfile, string> = {
  get full() {
    return t('complet');
  },
  get bass() {
    return t('basses seules');
  },
  get highs() {
    return t('médiums et aigus');
  },
  get custom() {
    return t('personnalisé');
  },
};

/** Réglage d'une sortie. */
export interface JukeboxOutputSetting {
  /** Nom Windows de la sortie (friendlyName). */
  name: string;
  /** Le Juke-box y joue. */
  enabled: boolean;
  /** Volume par rapport aux autres sorties, en pour cent. */
  volume: number;
  profile: JukeboxAudioProfile;
  /** Profil personnalisé : correction des basses, des médiums et des aigus, en dB. */
  bass: number;
  mid: number;
  treble: number;
  /** Retard ajouté, en millisecondes. */
  delay: number;
}

export interface JukeboxAudioSettings {
  /** Sorties réglées ; aucune activée : la sortie du menu, son intact. */
  outputs: JukeboxOutputSetting[];
}

export const DEFAULT_JUKEBOX_AUDIO: JukeboxAudioSettings = { outputs: [] };

/** Choix de volume, de correction et de retard (réglages aux boutons : Start passe au suivant). */
export const JUKEBOX_VOLUME_CHOICES = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100] as const;
export const JUKEBOX_EQ_CHOICES = [-12, -9, -6, -3, 0, 3, 6, 9, 12] as const;
export const JUKEBOX_DELAY_CHOICES = [0, 10, 20, 30, 40, 50, 75, 100, 150, 200] as const;
export const JUKEBOX_EQ_LIMIT = 12;
export const JUKEBOX_DELAY_MAX = 200;

/** Réglage d'une sortie jamais touchée : à plein, son intact. */
export function defaultJukeboxOutput(name: string, enabled = false): JukeboxOutputSetting {
  return { name, enabled, volume: 100, profile: 'full', bass: 0, mid: 0, treble: 0, delay: 0 };
}

const intIn = (v: unknown, min: number, max: number, fallback: number) => (typeof v === 'number' && Number.isFinite(v) ? Math.round(Math.min(max, Math.max(min, v))) : fallback);

/** Réglages lus d'un objet quelconque (medias.json écrit à la main, version plus ancienne). */
export function normalizeJukeboxAudio(raw: unknown): JukeboxAudioSettings {
  const r = raw && typeof raw === 'object' ? (raw as Record<string, unknown>) : {};
  const outputs: JukeboxOutputSetting[] = [];
  const seen = new Set<string>();
  for (const item of Array.isArray(r.outputs) ? r.outputs : []) {
    if (!item || typeof item !== 'object') continue;
    const o = item as Record<string, unknown>;
    if (typeof o.name !== 'string' || !o.name.trim() || seen.has(o.name)) continue;
    seen.add(o.name);
    const d = defaultJukeboxOutput(o.name);
    outputs.push({
      name: o.name,
      enabled: typeof o.enabled === 'boolean' ? o.enabled : d.enabled,
      volume: intIn(o.volume, 0, 100, d.volume),
      profile: JUKEBOX_AUDIO_PROFILES.includes(o.profile as JukeboxAudioProfile) ? (o.profile as JukeboxAudioProfile) : d.profile,
      bass: intIn(o.bass, -JUKEBOX_EQ_LIMIT, JUKEBOX_EQ_LIMIT, 0),
      mid: intIn(o.mid, -JUKEBOX_EQ_LIMIT, JUKEBOX_EQ_LIMIT, 0),
      treble: intIn(o.treble, -JUKEBOX_EQ_LIMIT, JUKEBOX_EQ_LIMIT, 0),
      delay: intIn(o.delay, 0, JUKEBOX_DELAY_MAX, 0),
    });
  }
  return { outputs };
}

/** Le réglage d'une sortie, tel qu'il est gardé, ou celui d'une sortie jamais touchée. */
export function jukeboxOutputOf(settings: JukeboxAudioSettings, name: string): JukeboxOutputSetting {
  return settings.outputs.find((o) => o.name === name) ?? defaultJukeboxOutput(name);
}

/** Aucune sortie choisie : le Juke-box suit la sortie du menu (celle de la borne). */
export function followsMenuOutput(settings: JukeboxAudioSettings): boolean {
  return !settings.outputs.some((o) => o.enabled);
}

/**
 * Les sorties où le Juke-box joue : celles activées ; sinon la sortie du menu, avec son réglage
 * s'il en a un (volume, profil), ou la sortie par défaut de Windows (`name` vide) sans sortie de menu.
 */
export function activeJukeboxOutputs(settings: JukeboxAudioSettings, menuOutput: string | undefined): JukeboxOutputSetting[] {
  const on = settings.outputs.filter((o) => o.enabled);
  if (on.length) return on;
  return [{ ...jukeboxOutputOf(settings, menuOutput ?? ''), enabled: true }];
}

/** La sortie joue-t-elle le Juke-box (activée, ou sortie du menu suivie par défaut) ? */
export function jukeboxOutputActive(settings: JukeboxAudioSettings, menuOutput: string | undefined, name: string): boolean {
  return activeJukeboxOutputs(settings, menuOutput).some((o) => o.name === name);
}

/** Remplace le réglage d'une sortie (ajouté s'il n'existait pas). */
export function withJukeboxOutput(settings: JukeboxAudioSettings, next: JukeboxOutputSetting): JukeboxAudioSettings {
  const outputs = settings.outputs.some((o) => o.name === next.name) ? settings.outputs.map((o) => (o.name === next.name ? next : o)) : [...settings.outputs, next];
  return { outputs };
}

/**
 * Active ou coupe une sortie. La première sortie ajoutée garde celle du menu, qui jouait jusque-là
 * (on ajoute une sortie, on ne déplace pas le son) ; la dernière sortie active ne se coupe pas :
 * `undefined`, le Juke-box resterait muet.
 */
export function toggleJukeboxOutput(settings: JukeboxAudioSettings, menuOutput: string | undefined, name: string): JukeboxAudioSettings | undefined {
  const active = activeJukeboxOutputs(settings, menuOutput).filter((o) => o.name);
  const on = active.some((o) => o.name === name);
  if (on && active.length <= 1) return undefined;
  let next = settings;
  // Rendre explicites les sorties qui jouent (la sortie du menu, suivie par défaut).
  for (const o of active) next = withJukeboxOutput(next, { ...jukeboxOutputOf(next, o.name), enabled: true });
  return withJukeboxOutput(next, { ...jukeboxOutputOf(next, name), enabled: !on });
}

/** Revient au réglage d'usine : la sortie du menu, son intact. */
export function resetJukeboxAudio(): JukeboxAudioSettings {
  return { outputs: [] };
}

// ---------------------------------------------------------------------------
// Plan de routage, joué par app/renderer/audio-routes.js

export interface JukeboxAudioFilter {
  type: 'lowpass' | 'highpass' | 'lowshelf' | 'peaking' | 'highshelf';
  frequency: number;
  Q?: number;
  gain?: number;
}

export interface JukeboxAudioRoute {
  /** Nom Windows de la sortie ; vide : sortie par défaut de Windows. */
  output: string;
  /** Gain linéaire, 0 à 1. */
  gain: number;
  filters: JukeboxAudioFilter[];
  /** Retard en secondes. */
  delay: number;
}

/** Fréquence de coupure des profils « basses seules » et « médiums et aigus ». */
export const JUKEBOX_CROSSOVER_HZ = 120;

export function jukeboxFilters(o: Pick<JukeboxOutputSetting, 'profile' | 'bass' | 'mid' | 'treble'>): JukeboxAudioFilter[] {
  switch (o.profile) {
    case 'bass':
      // Deux étages : une pente assez raide pour qu'un caisson ne chante pas les voix.
      return [
        { type: 'lowpass', frequency: JUKEBOX_CROSSOVER_HZ, Q: 0.707 },
        { type: 'lowpass', frequency: JUKEBOX_CROSSOVER_HZ, Q: 0.707 },
      ];
    case 'highs':
      return [
        { type: 'highpass', frequency: JUKEBOX_CROSSOVER_HZ, Q: 0.707 },
        { type: 'highpass', frequency: JUKEBOX_CROSSOVER_HZ, Q: 0.707 },
      ];
    case 'custom': {
      const out: JukeboxAudioFilter[] = [];
      if (o.bass) out.push({ type: 'lowshelf', frequency: 200, gain: o.bass });
      if (o.mid) out.push({ type: 'peaking', frequency: 1000, Q: 0.8, gain: o.mid });
      if (o.treble) out.push({ type: 'highshelf', frequency: 4000, gain: o.treble });
      return out;
    }
    default:
      return [];
  }
}

export function jukeboxRoute(o: JukeboxOutputSetting): JukeboxAudioRoute {
  return { output: o.name, gain: Math.round(o.volume) / 100, filters: jukeboxFilters(o), delay: Math.round(o.delay) / 1000 };
}

/** Le plan de routage : une route par sortie active. */
export function jukeboxRoutes(settings: JukeboxAudioSettings, menuOutput: string | undefined): JukeboxAudioRoute[] {
  return activeJukeboxOutputs(settings, menuOutput).map(jukeboxRoute);
}

/**
 * Une seule sortie, son intact : l'élément y joue directement (setSinkId), sans graphe Web Audio ;
 * c'est le cas d'usine, inchangé depuis le premier Juke-box.
 */
export function plainRoutes(routes: readonly JukeboxAudioRoute[]): boolean {
  return routes.length === 1 && routes[0]!.gain === 1 && routes[0]!.filters.length === 0 && routes[0]!.delay === 0;
}

// ---------------------------------------------------------------------------
// Libellés

export function eqLabel(db: number): string {
  return db > 0 ? t('+{n} dB', { n: db }) : db < 0 ? t('−{n} dB', { n: -db }) : t('0 dB');
}

/** Résumé d'une sortie active : « 100 % · complet », « 80 % · basses +6 dB, aigus −3 dB · retard 20 ms ». */
export function jukeboxOutputSummary(o: JukeboxOutputSetting): string {
  const parts = [t('{n} %', { n: o.volume })];
  if (o.profile === 'custom') {
    const eq = [
      o.bass ? t('basses {db}', { db: eqLabel(o.bass) }) : '',
      o.mid ? t('médiums {db}', { db: eqLabel(o.mid) }) : '',
      o.treble ? t('aigus {db}', { db: eqLabel(o.treble) }) : '',
    ].filter(Boolean);
    parts.push(eq.length ? eq.join(', ') : t('son intact'));
  } else parts.push(JUKEBOX_AUDIO_PROFILE_LABELS[o.profile]);
  if (o.delay) parts.push(t('retard {n} ms', { n: o.delay }));
  return parts.join(' · ');
}

/** Valeur suivante d'une liste de choix (Start), la plus proche si la valeur gardée n'y est pas. */
export function nextChoice<T extends number>(choices: readonly T[], value: number): T {
  let at = choices.findIndex((c) => c === value);
  if (at < 0) at = choices.reduce((best, c, i) => (Math.abs(c - value) < Math.abs(choices[best]! - value) ? i : best), 0);
  return choices[(at + 1) % choices.length]!;
}
