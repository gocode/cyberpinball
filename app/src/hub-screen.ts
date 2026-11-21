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

/**
 * Disposition d'une section : la carte du moment en grand, des cartes côte à côte, une liste, des puces,
 * ou des joueurs en tuiles (la pastille et son anneau, le nom, ce qu'il fait : Communauté, 21/11/2026).
 */
export type HubLayout = 'hero' | 'cards' | 'list' | 'chips' | 'people';

/** L'anneau de présence autour de la pastille d'un joueur : en ligne, en partie, ou suggéré. */
export type HubRing = 'online' | 'playing' | 'suggested';

/** Une ligne du journal d'un salon : l'heure, le pseudo à sa teinte, le texte (une ligne à la manière d'IRC). */
export interface HubLogLine {
  time: string;
  nick: string;
  hue: number;
  text: string;
  /** Ligne qui me cite, ou que j'ai écrite. */
  kind?: 'mention' | 'own';
}

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
  /** Une phrase toute prête à envoyer : en pastille de couleur, comme les phrases du salon. */
  quick?: boolean;
  key: string;
  run: () => void;
  /** Pas encore possible (« Bientôt », « Entre amis seulement ») : grisé avec sa raison, sauté par les flippers. */
  off?: string;
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
  /** Le dernier message, en bulle sous le titre (« <Bruno> » en tête pour un groupe). */
  bubble?: { text: string; who?: string; group?: boolean };
  /** Le journal d'un salon : ses dernières lignes, sous le titre. */
  lines?: HubLogLine[];
  /** Anneau de présence autour de la pastille. */
  ring?: HubRing;
  /** Messages non lus : le nombre en pastille, après le titre. */
  count?: number;
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
  /** Au bureau, sa colonne (sinon : la carte du moment et la suivante à gauche, le reste partagé). */
  column?: 'left' | 'right';
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
  /** Part que la partie vient d'ajouter, en clair au bout de l'acquis (retour de partie), de 0 à 1. */
  fresh?: number;
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
  /** Les commandes en pied, quand ce ne sont pas celles des onglets (un écran sans onglets). */
  hint?: string;
  /**
   * Un petit écran sans onglets (le retour de partie) : pas de blocs, les flippers vont d'un bouton à
   * l'autre et Exit quitte l'écran d'un appui. `focus` : le curseur sur cette action (sa clé) à l'ouverture.
   */
  flat?: true;
  focus?: string;
  /** Une touche, avant les MagnaSave : vrai si elle est prise (un écran qui ignore un bouton encore tenu). */
  keys?: (input: { code: string }) => boolean;
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
  bubble?: { text: string; who?: string; group?: boolean };
  lines?: HubLogLine[];
  ring?: HubRing;
  count?: number;
  quiet?: boolean;
  /** La carte elle-même se choisit (absent : elle a des boutons, ou se lit seulement). */
  action?: number;
  /** Les boutons ; `action` seulement quand on est entré dans le bloc de la carte ; `off` : grisé, sa raison, jamais d'action. */
  buttons?: { label: string; xp?: string; primary?: boolean; quick?: boolean; action?: number; off?: string }[];
}

export interface HubView {
  medallion: string;
  /** Le nom de la touche Start, cerclé sur le bouton choisi (comme la maquette : « START Reprendre ma place »). */
  start: string;
  title: string;
  facts: string[];
  band?: HubBand;
  /** Les onglets ; `action` seulement quand on est entré dans leur barre. */
  tabs: { label: string; icon: IconName; current: boolean; attention?: boolean; disabled?: string; action?: number }[];
  /** La barre d'onglets en bloc : `action` au premier niveau (se choisit comme un bloc), `entered` quand on y est. */
  tabsBlock?: HubBlockView;
  /** On est entré dans un bloc : les autres s'éteignent un peu. */
  inside?: true;
  sections: { title?: string; note?: string; layout: HubLayout; column?: 'left' | 'right'; block?: HubBlockView; cards: HubCardView[] }[];
  empty?: { title: string; detail: string };
}

/** Une section en bloc (son liseré) : `action` au premier niveau, `entered` quand on y est ; vide : un bloc où l'on n'est pas. */
export interface HubBlockView {
  action?: number;
  entered?: true;
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

/** Le seul bloc d'un écran à plat (HubSpec.flat). */
const FLAT = 'flat';

/** Ce qui se choisit dans un bloc : un onglet, une carte, un bouton d'une carte. */
interface BlockItem {
  label: string;
  key: string;
  tone?: 'quiet';
  run: () => void;
}

/** Un bloc de l'écran : la barre d'onglets, ou une section qui a quelque chose à faire. */
interface Block {
  key: string;
  label: string;
  items: BlockItem[];
}

/**
 * Un écran à onglets : `describe` dit ce que montre l'onglet demandé ; `reopen` revient sur l'onglet courant.
 *
 * Navigation par blocs (demandée par le mainteneur le 21/11/2026 : « naviguer de bloc en bloc, rentrer
 * dans ce bloc en validant et ressortir du bloc ») : chaque section porte un liseré ; au premier niveau,
 * les flippers vont d'un bloc à l'autre (la barre d'onglets en est un), Start entre dans le bloc (ou fait
 * tout de suite sa seule action), puis les flippers vont d'un élément à l'autre et Exit ressort du bloc,
 * le curseur sur lui. Au premier niveau, Exit revient d'où l'on vient (la roue). Le menu du dessus n'est
 * ainsi jamais qu'à un Exit : plus besoin de remonter toute une liste pour l'atteindre.
 */
export function createHubScreen(host: HubScreenHost, describe: (tab: string, reopen: () => void) => HubSpec): HubScreen {
  let current = '';
  let back: () => void = () => undefined;
  /** Le bloc où l'on est entré (sa clé) ; absent : on choisit un bloc. */
  let inside: string | undefined;

  /** Les onglets qui s'ouvrent, dans l'ordre. */
  const usable = (spec: HubSpec) => spec.tabs.filter((tab) => !tab.disabled);

  function reopen(): void {
    host.library.openCustom(build);
  }

  /** Les blocs de l'onglet ouvert, dans l'ordre de l'écran : la barre d'onglets, puis chaque section qui a de quoi agir. */
  function blocksOf(spec: HubSpec): Block[] {
    const tabs = usable(spec);
    const out: Block[] = [];
    if (tabs.length > 1) out.push({ key: 'tabs', label: t('Onglets'), items: tabs.map((tab) => ({ label: tab.label, key: `tab:${tab.id}`, run: () => go(tab.id) })) });
    spec.sections.forEach((s, i) => {
      const items: BlockItem[] = [];
      for (const c of s.cards) {
        // Un bouton grisé (`off`) n'est jamais un arrêt des flippers.
        if (c.buttons?.length) for (const b of c.buttons) !b.off && items.push({ label: b.label, key: `${c.key}:${b.key}`, run: b.run });
        else if (c.run) items.push({ label: c.title, key: c.key, ...(c.quiet ? { tone: 'quiet' as const } : {}), run: c.run });
      }
      if (items.length) out.push({ key: `section:${i}`, label: s.title ?? s.cards[0]?.title ?? '', items });
    });
    // Un écran à plat : un seul bloc, tout ce qui se choisit, sans liseré ni entrée.
    if (spec.flat) return [{ key: FLAT, label: spec.title, items: out.flatMap((b) => b.items) }];
    return out;
  }

  /** Onglet choisi : son contenu, le curseur sur son premier bloc (après la barre d'onglets). */
  function go(tab: string): void {
    current = tab;
    inside = undefined;
    const spec = describe(tab, reopen);
    const blocks = blocksOf(spec);
    // Un écran à plat (retour de partie) : le curseur sur l'action demandée.
    if (spec.flat) {
      inside = FLAT;
      const at = blocks[0]?.items.findIndex((item) => item.key === spec.focus) ?? -1;
      return void host.library.openCustom(build, Math.max(0, at));
    }
    host.library.openCustom(build, blocks[0]?.key === 'tabs' && blocks.length > 1 ? 1 : 0);
  }

  /** Start sur un bloc : sa seule action tout de suite, sinon on y entre, le curseur sur son premier élément (l'onglet ouvert pour la barre). */
  function enter(block: Block, spec: HubSpec): void {
    if (block.items.length === 1) return void block.items[0]!.run();
    inside = block.key;
    const at = block.key === 'tabs' ? Math.max(0, usable(spec).findIndex((tab) => tab.id === current)) : 0;
    host.library.openCustom(build, at);
  }

  /** Exit dans un bloc : on en ressort, le curseur sur lui. */
  function leave(blockIndex: number): void {
    inside = undefined;
    host.library.openCustom(build, Math.max(0, blockIndex));
  }

  function build(): Built {
    const spec = describe(current, reopen);
    if (!spec.tabs.some((tab) => tab.id === current && !tab.disabled)) current = usable(spec)[0]?.id ?? current;
    const blocks = blocksOf(spec);
    // Le bloc où l'on était a disparu (onglet changé, partie fermée) : retour au choix des blocs.
    if (spec.flat) inside = FLAT;
    const enteredAt = inside ? blocks.findIndex((b) => b.key === inside) : -1;
    if (enteredAt < 0) inside = undefined;
    const actions: Action[] = [];
    // Premier niveau : une action par bloc ; dans un bloc, seulement ses éléments.
    const blockAction = new Map<string, number>();
    const itemAction = new Map<string, number>();
    if (enteredAt >= 0) for (const item of blocks[enteredAt]!.items) itemAction.set(item.key, actions.push({ label: item.label, key: item.key, ...(item.tone ? { tone: item.tone } : {}), run: item.run }) - 1);
    else for (const block of blocks) blockAction.set(block.key, actions.push({ label: block.label, key: `block:${block.key}`, run: () => enter(block, spec) }) - 1);
    const blockView = (key: string): HubBlockView | undefined => (blockAction.has(key) ? { action: blockAction.get(key)! } : inside === key ? { entered: true } : blocks.some((b) => b.key === key) ? {} : undefined);
    const tabs = spec.tabs.map((tab) => {
      const view = { label: tab.label, icon: tab.icon, current: tab.id === current, ...(tab.attention ? { attention: true } : {}), ...(tab.disabled ? { disabled: tab.disabled } : {}) };
      const action = itemAction.get(`tab:${tab.id}`);
      return action === undefined ? view : { ...view, action };
    });
    const sections = spec.sections.flatMap((s, i) => {
      if (!s.cards.length) return [];
      const block = blockView(`section:${i}`);
      return [
        {
          ...(s.title ? { title: s.title } : {}),
          ...(s.note ? { note: s.note } : {}),
          layout: s.layout,
          ...(s.column ? { column: s.column } : {}),
          ...(block ? { block } : {}),
          cards: s.cards.map((c): HubCardView => {
            const { key, run: _run, buttons, ...shown } = c;
            const out: HubCardView = { ...shown };
            if (buttons?.length)
              out.buttons = buttons.map((b) => ({
                label: b.label,
                ...(b.xp ? { xp: b.xp } : {}),
                ...(b.primary ? { primary: true } : {}),
                ...(b.quick ? { quick: true } : {}),
                ...(b.off ? { off: b.off } : itemAction.has(`${key}:${b.key}`) ? { action: itemAction.get(`${key}:${b.key}`)! } : {}),
              }));
            else if (itemAction.has(key)) out.action = itemAction.get(key)!;
            return out;
          }),
        },
      ];
    });
    const tabsBlock = blockView('tabs');
    const hub: HubView = {
      medallion: spec.medallion,
      start: t('Start'),
      title: spec.title,
      facts: spec.facts,
      ...(spec.band ? { band: spec.band } : {}),
      tabs,
      ...(tabsBlock ? { tabsBlock } : {}),
      ...(inside && !spec.flat ? { inside: true } : {}),
      sections,
      ...(spec.empty && !sections.length ? { empty: spec.empty } : {}),
    };
    return {
      heading: spec.heading,
      icon: spec.icon,
      sections: [],
      actions,
      // À plat, Exit quitte l'écran d'un appui ; dans un bloc, il en ressort.
      back: enteredAt >= 0 && !spec.flat ? () => leave(enteredAt) : back,
      hub,
      hint: spec.hint ?? (enteredAt >= 0 ? t('Flippers : choisir · Start : valider · Exit : sortir du bloc') : t('Flippers : choisir un bloc · Start : y entrer · Exit : retour à la roue')),
      keys: (input) => {
        if (spec.keys?.(input)) return true;
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
