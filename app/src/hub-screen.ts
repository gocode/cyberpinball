// Écran à onglets et à cartes (21/11/2026, planche « Engagement ») : l'écran qu'ouvre Start sur le
// médaillon de l'Arène, conçu pour que la Communauté le reprenne ensuite. En tête, le médaillon, le
// grand titre, quelques chiffres et une bande (le niveau) ; puis une barre d'onglets à icônes ; puis
// des sections de cartes. Aux boutons de la borne :
// - les flippers choisissent une carte (ou l'un de ses boutons), Start la valide ;
// - MagnaSave passe d'un onglet à l'autre (le gauche revient en arrière quand il y en a deux) ;
// - Exit revient d'où l'on vient (la roue).
// Un onglet qui ne peut encore rien montrer reste visible, grisé, avec sa raison (règle de design) ;
// les flippers et MagnaSave le sautent. La pastille rouge dit ce qui attend.
//
// Le module ne sait rien de l'Arène : son hôte décrit chaque onglet (HubSpec) ; ici on en fait un
// écran du menu (Built) dont les actions suivent l'ordre de l'affichage (onglets, puis cartes de haut
// en bas et de gauche à droite), rendu par app/renderer/hub.js.
//
// Sans electron à l'exécution : les tests chargent ce module.

import { t, type AvatarView, type IconName, type TierId } from '@cyberpinball/core';
import type { Action, Built } from './library';

/** Disposition d'une section : la carte du moment en grand, des cartes côte à côte, une liste, des puces. */
export type HubLayout = 'hero' | 'cards' | 'list' | 'chips';

/** « Niv. 18 » à la teinte du palier, à côté d'un nom. */
export interface HubLevel {
  text: string;
  tier: TierId;
}

export interface HubButtonSpec {
  label: string;
  /** XP que l'action rapporte, déjà dits (« +25 XP »). */
  xp?: string;
  /** L'action principale : pleine, en vert. */
  primary?: boolean;
  key: string;
  run: () => void;
}

export interface HubCardSpec {
  /** Identité stable (le curseur la suit quand l'écran change). */
  key: string;
  /** Le joueur dont parle la carte, en tête du titre, suivi de son niveau (« Léa Niv. 18 vous a dépassé… »). */
  name?: string;
  title: string;
  /** Petit intitulé au-dessus du titre (« Partie ouverte », « Votre place est prise »), à sa teinte. */
  eyebrow?: string;
  tone?: 'warning' | 'meta' | 'signal';
  level?: HubLevel;
  detail?: string;
  icon?: IconName;
  avatar?: AvatarView;
  /** Places d'une partie : les joueurs assis, puis des places libres (null). */
  seats?: (AvatarView | null)[];
  /** Valeur à droite (XP, score, place) ; en ambre pour un écart à combler (vert : ce qui se gagne). */
  aside?: string;
  asideTone?: 'warning';
  /** Barre de progression sous le texte, de 0 à 1. */
  progress?: number;
  /** Ce que Start fait sur la carte ; absent avec des boutons (chacun est un arrêt des flippers), ou pour une carte à lire. */
  run?: () => void;
  buttons?: HubButtonSpec[];
  /** Indisponible : grisée, son détail dit pourquoi. */
  quiet?: boolean;
}

export interface HubSectionSpec {
  title?: string;
  /** À droite du titre, plus discret (« encore 240 XP »). */
  note?: string;
  layout: HubLayout;
  cards: HubCardSpec[];
}

export interface HubTabSpec {
  id: string;
  label: string;
  icon: IconName;
  /** Quelque chose attend dans cet onglet : pastille rouge. */
  attention?: boolean;
  /** Pourquoi l'onglet ne montre rien encore (« Bientôt ») : grisé, sauté. */
  disabled?: string;
}

/** La bande du niveau, en tête : le numéro dans l'anneau du palier, la barre, ce qu'il manque. */
export interface HubBand {
  level: number;
  /** « NIV. » */
  short: string;
  tier: TierId;
  tierLabel: string;
  /** « 380 XP » en gras, puis « avant le niveau 13 ». */
  missing: { strong: string; rest: string };
  progress: number;
  /** Part qu'une partie peut encore ajouter (hachures). */
  reach: number;
  lines: string[];
}

/** Ce que l'hôte décrit pour l'onglet ouvert. */
export interface HubSpec {
  /** Nom de l'écran (titre du menu, lecteurs d'écran) et son icône. */
  heading: string;
  icon: IconName;
  /** Le médaillon dessiné en tête (medaillons-vivants.js : « arene », « communaute »). */
  medallion: string;
  title: string;
  /** Sous le titre : des chiffres, leurs nombres en gras. */
  facts: string[];
  band?: HubBand;
  tabs: HubTabSpec[];
  sections: HubSectionSpec[];
  /** L'onglet n'a rien à montrer : ce qu'il dit à la place. */
  empty?: { title: string; detail: string };
}

// ---------- Vue envoyée au rendu (Built.hub) ----------

export interface HubCardView {
  name?: string;
  title: string;
  eyebrow?: string;
  tone?: 'warning' | 'meta' | 'signal';
  level?: HubLevel;
  detail?: string;
  icon?: IconName;
  avatar?: AvatarView;
  seats?: (AvatarView | null)[];
  aside?: string;
  asideTone?: 'warning';
  progress?: number;
  quiet?: boolean;
  /** La carte elle-même se choisit (absent : elle a des boutons, ou se lit seulement). */
  action?: number;
  buttons?: { label: string; xp?: string; primary?: boolean; action: number }[];
}

export interface HubView {
  medallion: string;
  /** Le nom de la touche Start, cerclé sur le bouton choisi (comme la maquette : « START Reprendre ma place »). */
  start: string;
  title: string;
  facts: string[];
  band?: HubBand;
  tabs: { label: string; icon: IconName; current: boolean; attention?: boolean; disabled?: string; action?: number }[];
  sections: { title?: string; note?: string; layout: HubLayout; cards: HubCardView[] }[];
  empty?: { title: string; detail: string };
}

export interface HubScreenHost {
  library: { openCustom(build: () => Built, at?: number): void };
  /** Touches MagnaSave relevées (la gauche d'abord). */
  zoneKeys(): readonly string[];
}

export interface HubScreen {
  /** Ouvre l'écran sur cet onglet (le premier sinon), le curseur sur sa première carte ; Exit vers `back`. */
  open(back: () => void, tab?: string): void;
  /** L'onglet ouvert. */
  current(): string;
}

/** Un écran à onglets : `describe` dit ce que montre l'onglet demandé ; `reopen` revient sur l'onglet courant. */
export function createHubScreen(host: HubScreenHost, describe: (tab: string, reopen: () => void) => HubSpec): HubScreen {
  let current = '';
  let back: () => void = () => undefined;

  /** Les onglets qui s'ouvrent, dans l'ordre. */
  const usable = (spec: HubSpec) => spec.tabs.filter((tab) => !tab.disabled);

  function reopen(): void {
    host.library.openCustom(build);
  }

  function go(tab: string): void {
    current = tab;
    const spec = describe(tab, reopen);
    // Le curseur sur la première carte : juste après les onglets qui s'ouvrent.
    host.library.openCustom(build, usable(spec).length);
  }

  function build(): Built {
    const spec = describe(current, reopen);
    if (!spec.tabs.some((tab) => tab.id === current && !tab.disabled)) current = usable(spec)[0]?.id ?? current;
    const actions: Action[] = [];
    const tabs = spec.tabs.map((tab) => {
      const view = { label: tab.label, icon: tab.icon, current: tab.id === current, ...(tab.attention ? { attention: true } : {}), ...(tab.disabled ? { disabled: tab.disabled } : {}) };
      if (tab.disabled) return view;
      const action = actions.push({ label: tab.label, key: `tab:${tab.id}`, icon: tab.icon, ...(tab.attention ? { attention: true } : {}), run: () => go(tab.id) }) - 1;
      return { ...view, action };
    });
    const sections = spec.sections
      .filter((s) => s.cards.length)
      .map((s) => ({
        ...(s.title ? { title: s.title } : {}),
        ...(s.note ? { note: s.note } : {}),
        layout: s.layout,
        cards: s.cards.map((c): HubCardView => {
          const { key, run, buttons, ...shown } = c;
          const out: HubCardView = { ...shown };
          if (buttons?.length)
            out.buttons = buttons.map((b) => ({ label: b.label, ...(b.xp ? { xp: b.xp } : {}), ...(b.primary ? { primary: true } : {}), action: actions.push({ label: b.label, key: `${key}:${b.key}`, run: b.run }) - 1 }));
          else if (run) out.action = actions.push({ label: c.title, key, ...(c.quiet ? { tone: 'quiet' as const } : {}), run }) - 1;
          return out;
        }),
      }));
    const hub: HubView = {
      medallion: spec.medallion,
      start: t('Start'),
      title: spec.title,
      facts: spec.facts,
      ...(spec.band ? { band: spec.band } : {}),
      tabs,
      sections,
      ...(spec.empty && !sections.length ? { empty: spec.empty } : {}),
    };
    return {
      heading: spec.heading,
      icon: spec.icon,
      sections: [],
      actions,
      back,
      hub,
      hint: t('Flippers : choisir · Start : valider · MagnaSave : onglet suivant · Exit : retour à la roue'),
      keys: (input) => {
        const magna = host.zoneKeys();
        if (!magna.includes(input.code)) return false;
        const list = usable(spec);
        if (list.length < 2) return true;
        const dir = magna.length > 1 && magna.indexOf(input.code) === 0 ? -1 : 1;
        const at = Math.max(0, list.findIndex((tab) => tab.id === current));
        go(list[(at + dir + list.length) % list.length]!.id);
        return true;
      },
    };
  }

  return {
    open(to, tab) {
      back = to;
      go(tab ?? '');
    },
    current: () => current,
  };
}
