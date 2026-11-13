// Menu système > Médias > Réglages du Juke-box (demandé le 13/11/2026) : tous les réglages du
// Juke-box au même endroit, à part de la gestion de ses playlists. Les sorties du son (une ou
// plusieurs, chacune avec son volume, son profil, ses basses, médiums et aigus, son retard), le
// visualiseur du DMD et le médaillon dans la roue (le même réglage que Tables > Roue).
// Tout se règle aux boutons : Start change un choix ou ouvre la liste des valeurs, Exit revient.
// Les réglages s'appliquent aussitôt, même au morceau en cours, et sont gardés dans <données>\medias.json.

import {
  JUKEBOX_AUDIO_PROFILE_LABELS,
  JUKEBOX_AUDIO_PROFILES,
  JUKEBOX_DELAY_CHOICES,
  JUKEBOX_EQ_CHOICES,
  JUKEBOX_VISUALIZER_MODES,
  JUKEBOX_VOLUME_CHOICES,
  activeJukeboxOutputs,
  eqLabel,
  followsMenuOutput,
  isCabinetCandidate,
  jukeboxOutputActive,
  jukeboxOutputOf,
  jukeboxOutputSummary,
  jukeboxRoute,
  resetJukeboxAudio,
  t,
  toggleJukeboxOutput,
  visualizerModeLabel,
  withJukeboxOutput,
  type IconName,
  type JukeboxAudioProfile,
  type JukeboxAudioRoute,
  type JukeboxOutputSetting,
  type MenuMediaSettings,
  type ObservedAudioOutput,
} from '@cyberpinball/core';
import type { Action, Built, ProvidedSystemItem } from './library';

export interface JukeboxSettingsHost {
  library: {
    openCustom(build: () => Built, at?: number): void;
    openSystem(): void;
  };
  settings(): MenuMediaSettings;
  /** Enregistre et applique (état renvoyé aux fenêtres, morceau en cours compris). */
  save(next: MenuMediaSettings): void;
  /** Sorties audio actives de Windows ; undefined : illisibles. */
  outputs(): ObservedAudioOutput[] | undefined;
  /** Nom Windows de la sortie du menu (celle du fronton) ; undefined : sortie par défaut. */
  menuOutput(): string | undefined;
  /** Ce que la borne fait de cette sortie : « fronton », « playfield »… ; undefined : rien. */
  place(name: string): string | undefined;
  /** Joue l'extrait d'essai sur une seule route. */
  test(route: JukeboxAudioRoute): void;
}

const PROFILE_DETAILS: Record<JukeboxAudioProfile, string> = {
  get full() {
    return t('Tout le morceau, sans correction');
  },
  get bass() {
    return t('Seulement les basses, sous 120 Hz : pour un caisson de basses');
  },
  get highs() {
    return t('Tout sauf les basses, au-dessus de 120 Hz : pour de petits haut-parleurs, à côté d’un caisson');
  },
  get custom() {
    return t('Vos basses, médiums et aigus, de −12 à +12 dB');
  },
};

/** Libellé en tête de ligne : « basses seules » devient « Basses seules ». */
const capitalized = (text: string) => text.charAt(0).toLocaleUpperCase() + text.slice(1);

export const JUKEBOX_SETTINGS_ROWS = ['outputs', 'visualizer', 'wheel'] as const;
type Row = (typeof JUKEBOX_SETTINGS_ROWS)[number];
const row = (key: Row) => JUKEBOX_SETTINGS_ROWS.indexOf(key);

/** Lignes de l'écran d'une sortie, dans l'ordre (retour d'un sous-écran sur sa ligne). */
export const JUKEBOX_OUTPUT_ROWS = ['enabled', 'volume', 'profile', 'bass', 'mid', 'treble', 'delay', 'test'] as const;
type OutputRow = (typeof JUKEBOX_OUTPUT_ROWS)[number];
const outputRow = (key: OutputRow) => JUKEBOX_OUTPUT_ROWS.indexOf(key);

export function createJukeboxSettings(host: JukeboxSettingsHost) {
  const s = () => host.settings();
  const audio = () => s().jukeboxAudio;
  const set = (patch: Partial<MenuMediaSettings>) => host.save({ ...s(), ...patch });
  /**
   * La sortie que le Juke-box suit par défaut : celle du menu, ou, sans elle (pas d'étape « Son »),
   * la sortie par défaut de Windows, nommée : elle se montre active et reste quand on en ajoute une.
   */
  const menuName = () => host.menuOutput() ?? host.outputs()?.find((o) => o.isDefault)?.friendlyName;
  const setOutput = (next: JukeboxOutputSetting) => set({ jukeboxAudio: withJukeboxOutput(audio(), next) });
  /** Retour depuis l'écran principal (menu système, ou la gestion du Juke-box). */
  let leave: () => void = () => host.library.openSystem();

  /** « Sur le fronton » : où joue le Juke-box, en quelques mots. */
  function outputsSummary(): string {
    const active = activeJukeboxOutputs(audio(), menuName());
    if (followsMenuOutput(audio())) {
      const o = active[0]!;
      const name = o.name ? (host.place(o.name) ?? o.name) : t('sortie par défaut de Windows');
      return o.volume === 100 && o.profile === 'full' && !o.delay ? t('{name}, son intact', { name }) : t('{name} · {summary}', { name, summary: jukeboxOutputSummary(o) });
    }
    return active.length === 1 ? (host.place(active[0]!.name) ?? active[0]!.name) : t('{n} sorties', { n: active.length });
  }

  function actions(): Action[] {
    const v = s();
    const rows: Record<Row, Action> = {
      outputs: {
        label: t('Sorties du son : {summary}', { summary: outputsSummary() }),
        detail: t('Une ou plusieurs sorties, chacune avec son volume, ses basses, médiums et aigus (Start : régler)'),
        icon: 'sound',
        run: () => openOutputs(),
      },
      visualizer: {
        label: t('Visualiseur du Juke-box : {mode}', { mode: visualizerModeLabel(v.jukeboxVisualizer) }),
        detail:
          v.jukeboxVisualizer === 'pochette'
            ? t('Le DMD prend les couleurs de la pochette du morceau, en dégradé ; multicolore sans pochette (Start : changer)')
            : v.jukeboxVisualizer === 'multicolore'
              ? t('Le DMD change doucement de couleur, d’une colonne à l’autre et dans le temps (Start : changer)')
              : t('Le DMD garde sa couleur réglée, sans dégradé (Start : changer)'),
        icon: 'spectrum',
        run: () => set({ jukeboxVisualizer: JUKEBOX_VISUALIZER_MODES[(JUKEBOX_VISUALIZER_MODES.indexOf(v.jukeboxVisualizer) + 1) % JUKEBOX_VISUALIZER_MODES.length]! }),
      },
      wheel: {
        label: v.jukebox ? t('Juke-box dans la roue : affiché') : t('Juke-box dans la roue : masqué'),
        detail: v.jukebox
          ? t('Le médaillon Juke-box ouvre chaque collection de la roue, avant les tables (Start : le masquer)')
          : t('La roue ne montre que les tables ; vos playlists restent dans la gestion du Juke-box (Start : afficher le médaillon)'),
        icon: 'wheel',
        run: () => set({ jukebox: !v.jukebox }),
      },
    };
    return JUKEBOX_SETTINGS_ROWS.map((key) => rows[key]);
  }

  function build(): Built {
    return {
      heading: t('Réglages du Juke-box'),
      icon: 'jukebox',
      lead: t('Comment le Juke-box joue sur la borne. Chaque choix s’applique aussitôt, même au morceau en cours ; les playlists se gèrent dans la gestion du Juke-box.'),
      sections: [],
      actions: [...actions(), { label: t('Retour'), icon: 'back', run: () => leave() }],
      back: () => leave(),
    };
  }

  function open(at = 0): void {
    host.library.openCustom(build, at);
  }

  // ---------- Sorties du son ----------

  /** Les sorties à montrer : celles de Windows (sans les virtuelles), celles réglées, celle du menu. */
  function outputNames(): { names: string[]; present: Set<string> | undefined } {
    const observed = host.outputs();
    const present = observed ? new Set(observed.map((o) => o.friendlyName)) : undefined;
    const names: string[] = [];
    const add = (n: string | undefined) => n && !names.includes(n) && names.push(n);
    add(menuName());
    for (const o of observed ?? []) if (isCabinetCandidate(o) || o.friendlyName === menuName()) add(o.friendlyName);
    for (const o of audio().outputs) add(o.name);
    return { names, present };
  }

  function openOutputs(at = 0): void {
    host.library.openCustom(() => {
      const { names, present } = outputNames();
      const menu = menuName();
      const list: Action[] = names.map((name) => {
        const o = jukeboxOutputOf(audio(), name);
        const on = jukeboxOutputActive(audio(), menu, name);
        const missing = present !== undefined && !present.has(name);
        const place = host.place(name);
        const bits = [
          on ? jukeboxOutputSummary(o) : t('coupée'),
          ...(place ? [place] : []),
          // Suivie par défaut : la sortie de la borne (la sortie par défaut de Windows le dit déjà par sa place).
          ...(on && followsMenuOutput(audio()) && host.menuOutput() ? [t('suit la sortie de la borne')] : []),
          ...(missing ? [t('absente de Windows')] : []),
        ];
        // Pas d'icône : une même icône sur plusieurs lignes ne dirait rien ; l'état est dans le détail et la couleur.
        return {
          label: name,
          detail: t('{facts} (Start : régler)', { facts: bits.join(' · ') }),
          tone: on ? ('ok' as const) : missing ? ('quiet' as const) : undefined,
          key: `output:${name}`,
          run: () => openOutput(name),
        };
      });
      if (!names.length) list.push({ label: t('Aucune sortie audio trouvée'), detail: t('Windows ne donne aucune sortie : le Juke-box joue sur la sortie par défaut'), tone: 'quiet', icon: 'alert', run: () => undefined });
      const custom = audio().outputs.length > 0;
      list.push({
        label: t('Revenir au réglage d’usine'),
        detail: custom ? t('Le Juke-box joue sur la sortie de la borne, son intact') : t('Déjà au réglage d’usine'),
        ...(custom ? {} : { tone: 'quiet' as const }),
        icon: 'restore',
        key: 'reset',
        run: () => {
          if (!custom) return;
          set({ jukeboxAudio: resetJukeboxAudio() });
          openOutputs(0);
        },
      });
      list.push({ label: t('Retour'), icon: 'back', run: () => open(row('outputs')) });
      return {
        heading: t('Sorties du son'),
        icon: 'sound',
        lead: t('Le Juke-box peut jouer sur plusieurs sorties à la fois : par exemple le fronton pour la musique, un caisson pour les basses. Start sur une sortie : l’activer, régler son volume, son profil, l’écouter.'),
        sections: [],
        actions: list,
        back: () => open(row('outputs')),
      };
    }, at);
  }

  function openOutput(name: string, at = 0): void {
    const backAt = () => Math.max(0, outputNames().names.indexOf(name));
    host.library.openCustom(() => {
      const o = jukeboxOutputOf(audio(), name);
      const menu = menuName();
      const on = jukeboxOutputActive(audio(), menu, name);
      const last = on && activeJukeboxOutputs(audio(), menu).filter((x) => x.name).length <= 1;
      const custom = o.profile === 'custom';
      const quiet = (reason: string) => ({ tone: 'quiet' as const, detail: reason });
      const eqRow = (key: 'bass' | 'mid' | 'treble', label: string, icon: IconName, about: string): Action => ({
        label: t('{band} : {db}', { band: label, db: eqLabel(o[key]) }),
        icon,
        ...(custom ? { detail: t('{about} (Start : choisir)', { about }) } : quiet(t('Profil personnalisé seulement'))),
        run: () => (custom ? openEq(name, key, label) : undefined),
      });
      const rows: Record<OutputRow, Action> = {
        enabled: {
          label: on ? t('Juke-box sur cette sortie : oui') : t('Juke-box sur cette sortie : non'),
          icon: on ? 'check' : 'volume-mute',
          ...(last ? quiet(t('Seule sortie du Juke-box : activez-en une autre avant de couper celle-ci')) : { detail: on ? t('Start : couper') : t('Start : l’ajouter aux sorties du Juke-box') }),
          run: () => {
            const next = toggleJukeboxOutput(audio(), menu, name);
            if (next) set({ jukeboxAudio: next });
          },
        },
        volume: {
          label: t('Volume : {n} %', { n: o.volume }),
          detail: t('Par rapport aux autres sorties ; le volume général reste celui de la borne (Start : choisir)'),
          icon: 'volume-low',
          run: () => openNumber(name, 'volume', t('Volume'), JUKEBOX_VOLUME_CHOICES, (n) => t('{n} %', { n })),
        },
        profile: {
          label: t('Profil : {profile}', { profile: JUKEBOX_AUDIO_PROFILE_LABELS[o.profile] }),
          detail: t('{detail} (Start : choisir)', { detail: PROFILE_DETAILS[o.profile] }),
          icon: 'sliders',
          run: () => openProfile(name),
        },
        bass: eqRow('bass', t('Basses'), 'pulse', t('Autour de 200 Hz et en dessous')),
        mid: eqRow('mid', t('Médiums'), 'music', t('Autour de 1 kHz : les voix')),
        treble: eqRow('treble', t('Aigus'), 'sparkle', t('À partir de 4 kHz : cymbales, souffle')),
        delay: {
          label: t('Retard : {n} ms', { n: o.delay }),
          detail: t('Retient le son de cette sortie, pour qu’il arrive en même temps que celui des autres (Start : choisir)'),
          icon: 'clock',
          run: () => openNumber(name, 'delay', t('Retard'), JUKEBOX_DELAY_CHOICES, (n) => t('{n} ms', { n })),
        },
        test: {
          label: t('Écouter cette sortie'),
          detail: t('Cinq secondes sur elle seule, avec ses réglages : basses, médiums, aigus, puis tout ensemble'),
          icon: 'play',
          run: () => host.test(jukeboxRoute({ ...o, enabled: true })),
        },
      };
      return {
        heading: name,
        icon: 'sound',
        lead: host.place(name) ? t('Sortie de la borne : {place}.', { place: host.place(name)! }) : t('Sortie de Windows.'),
        sections: [],
        actions: [...JUKEBOX_OUTPUT_ROWS.map((key) => rows[key]), { label: t('Retour'), icon: 'back', run: () => openOutputs(backAt()) }],
        back: () => openOutputs(backAt()),
      };
    }, at);
  }

  function openProfile(name: string): void {
    const back = () => openOutput(name, outputRow('profile'));
    host.library.openCustom(
      () => {
        const o = jukeboxOutputOf(audio(), name);
        return {
          heading: t('Profil'),
          icon: 'sliders',
          subheading: name,
          lead: t('Ce que cette sortie joue du morceau.'),
          sections: [],
          actions: [
            ...JUKEBOX_AUDIO_PROFILES.map((profile) => ({
              label: capitalized(JUKEBOX_AUDIO_PROFILE_LABELS[profile]),
              detail: profile === o.profile ? t('{detail} · choix actuel', { detail: PROFILE_DETAILS[profile] }) : PROFILE_DETAILS[profile],
              tone: profile === o.profile ? ('ok' as const) : undefined,
              run: () => {
                setOutput({ ...jukeboxOutputOf(audio(), name), profile });
                back();
              },
            })),
            { label: t('Retour'), run: back },
          ],
          back,
        };
      },
      Math.max(0, JUKEBOX_AUDIO_PROFILES.indexOf(jukeboxOutputOf(audio(), name).profile)),
    );
  }

  function openEq(name: string, key: 'bass' | 'mid' | 'treble', label: string): void {
    openNumber(name, key, label, JUKEBOX_EQ_CHOICES, eqLabel);
  }

  function openNumber(name: string, key: 'volume' | 'delay' | 'bass' | 'mid' | 'treble', heading: string, choices: readonly number[], label: (n: number) => string): void {
    const back = () => openOutput(name, outputRow(key));
    const now = jukeboxOutputOf(audio(), name)[key];
    host.library.openCustom(
      () => ({
        heading,
        icon: key === 'delay' ? 'clock' : key === 'volume' ? 'volume-low' : 'sliders',
        subheading: name,
        sections: [],
        actions: [
          ...choices.map((value) => ({
            label: label(value),
            detail: value === jukeboxOutputOf(audio(), name)[key] ? t('choix actuel') : undefined,
            tone: value === jukeboxOutputOf(audio(), name)[key] ? ('ok' as const) : undefined,
            run: () => {
              setOutput({ ...jukeboxOutputOf(audio(), name), [key]: value });
              back();
            },
          })),
          { label: t('Retour'), run: back },
        ],
        back,
      }),
      Math.max(0, choices.indexOf(choices.reduce((best, c) => (Math.abs(c - now) < Math.abs(best - now) ? c : best), choices[0]!))),
    );
  }

  const item: ProvidedSystemItem = {
    get detail() {
      return t('Sorties du son : {summary} · visualiseur : {mode}', { summary: outputsSummary(), mode: visualizerModeLabel(s().jukeboxVisualizer) });
    },
    run: () => {
      leave = () => host.library.openSystem();
      open();
    },
  };

  return {
    item,
    /** Depuis la gestion du Juke-box : Exit y ramène. */
    open: (back: () => void) => {
      leave = back;
      open();
    },
  };
}
