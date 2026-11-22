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

import { t, type AvatarView, type BadgeRarity, type FlagView, type IconName, type TierId } from '@cyberpinball/core';
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
  /** Son icône, devant le libellé (les actions de l'en-tête d'un joueur). */
  icon?: IconName;
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
  /** Valeur à droite (XP, score, place) ; en ambre pour un écart à combler (vert : ce qui se gagne). Un retour à la ligne la coupe en deux lignes. */
  aside?: string;
  asideTone?: 'warning';
  /** Icône devant la valeur : le pouce d'un « J'aime » (rempli quand on aime). */
  asideIcon?: IconName;
  /** Des badges, dessinés comme partout (la rangée de médailles des autres menus). */
  medals?: HubMedal[];
  ranks?: { label: string; icon?: IconName; flag?: FlagView; place: string }[];
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
  /** Des tables en médaillons superposés (tables en commun), et ce qui les suit (« +3 tables en commun »). */
  tables?: { title: string; src?: string }[];
  tablesNote?: string;
  /** Des joueurs en pastilles superposées (amis en commun), et ce qui les suit (« 4 amis en commun »). */
  mutual?: { avatars: AvatarView[]; note: string };
  /** Ce que Start fait sur la carte ; absent avec des boutons (chacun est un arrêt des flippers), ou pour une carte à lire. */
  run?: () => void;
  buttons?: HubButtonSpec[];
  /** Indisponible : grisée, son détail dit pourquoi. */
  quiet?: boolean;
}

/** Un badge dans une carte : son dessin (icône, rareté) et son nom. */
export interface HubMedal {
  icon: IconName;
  rarity: BadgeRarity;
  label: string;
}

/**
 * L'en-tête d'un joueur (son profil, 22/11/2026), à la place du médaillon et du grand titre : sa pastille
 * (l'anneau de son palier, celui de sa présence autour), ce que la relation dit de lui, son drapeau, son
 * nom et son niveau, ce qu'il fait ; puis les actions de la relation, chacune un arrêt des flippers.
 */
export interface HubPersonSpec {
  avatar: AvatarView;
  ring?: 'online' | 'playing';
  flag?: FlagView;
  name: string;
  level?: HubLevel;
  /** Au-dessus du nom : « Amis depuis… », « Vous a demandé en ami », ou le constat du dernier geste. */
  eyebrow?: string;
  eyebrowTone?: 'signal' | 'warning';
  /** Sous le nom : ce qu'il fait (« En partie sur… », « Vu il y a 3 h »). */
  status?: { text: string; tone?: 'signal' | 'meta' | 'quiet' | 'warning' };
  buttons: HubButtonSpec[];
}

export interface HubSectionSpec {
  title?: string;
  /** À droite du titre, plus discret (« encore 240 XP »). */
  note?: string;
  layout: HubLayout;
  /** Au bureau, sa colonne (sinon : la carte du moment et la suivante à gauche, le reste partagé). */
  column?: 'left' | 'right';
  /**
   * Ses choix (portes, écrans complets, actions), sous ses cartes : les lignes d'actions des autres menus
   * (icône, libellé, détail, aplat vert sur le choix courant), hors de l'encart ; chacun est un arrêt des
   * flippers au premier niveau et Start le valide, sans bloc où entrer (retour du mainteneur, 21/11/2026 :
   * « comme dans le reste de la plateforme »). Une section peut n'avoir que des choix (« Tout voir »).
   */
  choices?: HubCardSpec[];
  /**
   * Récapitulatif d'un onglet (accueil de la Communauté, 21/11/2026) : Start sur ce bloc ouvre l'onglet
   * nommé, le curseur dans son premier bloc (la même bande, l'œil n'est pas perdu) ; Exit y ramène.
   */
  opens?: string;
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
  /** Le profil d'un joueur : son en-tête à la place du médaillon ; ses actions sont les premiers arrêts des flippers. */
  person?: HubPersonSpec;
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
  /**
   * Un onglet en liste (22/11/2026, règle du mainteneur : « les onglets autres que l'accueil doivent
   * éviter les navigations par bloc et privilégier les navigations par liste ou affichage direct ») :
   * la barre d'onglets reste un bloc, mais chaque carte (ou chacun de ses boutons) et chaque choix est un
   * arrêt direct des flippers, que Start valide ; les sections n'ont pas de liseré. Les blocs restent
   * pour l'accueil : résumés et accès rapides.
   */
  list?: true;
  singleColumn?: true;
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
  asideIcon?: IconName;
  medals?: HubMedal[];
  ranks?: { label: string; icon?: IconName; flag?: FlagView; place: string }[];
  progress?: number;
  bubble?: { text: string; who?: string; group?: boolean };
  lines?: HubLogLine[];
  ring?: HubRing;
  count?: number;
  tables?: { title: string; src?: string }[];
  tablesNote?: string;
  mutual?: { avatars: AvatarView[]; note: string };
  quiet?: boolean;
  /** La carte elle-même se choisit (absent : elle a des boutons, ou se lit seulement). */
  action?: number;
  /** Les boutons ; `action` seulement quand on est entré dans le bloc de la carte ; `off` : grisé, sa raison, jamais d'action. */
  buttons?: HubButtonView[];
}

export interface HubButtonView {
  label: string;
  icon?: IconName;
  xp?: string;
  primary?: boolean;
  quick?: boolean;
  action?: number;
  off?: string;
}

export interface HubView {
  singleColumn?: true;
  medallion: string;
  /** Le nom de la touche Start, cerclé sur le bouton choisi (comme la maquette : « START Reprendre ma place »). */
  start: string;
  title: string;
  facts: string[];
  band?: HubBand;
  /** L'en-tête d'un joueur ; ses boutons portent leur action au premier niveau (chacun est un bloc d'une seule action). */
  person?: Omit<HubPersonSpec, 'buttons'> & { buttons: HubButtonView[] };
  /** Les onglets ; `id` pour le clic direct, `action` pour le curseur dans leur barre. */
  tabs: { id: string; label: string; icon: IconName; current: boolean; attention?: boolean; disabled?: string; action?: number }[];
  /** La barre d'onglets en bloc : `action` au premier niveau (se choisit comme un bloc), `entered` quand on y est. */
  tabsBlock?: HubBlockView;
  /** On est entré dans un bloc : les autres s'éteignent un peu. */
  inside?: true;
  sections: { title?: string; note?: string; layout: HubLayout; column?: 'left' | 'right'; block?: HubBlockView; cards: HubCardView[]; choices?: HubCardView[] }[];
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
  /** Les flippers (Précédent, Suivant) : dans la barre d'onglets, ils changent d'onglet (`menuFirst`). */
  navKeys?(): { previous: readonly string[]; next: readonly string[] };
}

export interface HubOptions {
  /**
   * Le menu d'abord (Communauté, 21/11/2026, demande du mainteneur) : l'écran s'ouvre le curseur dans la
   * barre d'onglets ; les flippers y passent d'un onglet à l'autre et montrent son contenu tout de suite,
   * Start entre dans le contenu, Exit y remonte (puis, de la barre, revient à la roue).
   */
  menuFirst?: boolean;
  /**
   * Exit ne revient pas à la roue mais à l'écran d'où l'on vient (le profil d'un joueur, ouvert de la
   * Communauté, d'un salon, d'une notification) : le pied dit « retour ».
   */
  backNotWheel?: boolean;
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
  /** Récapitulatif : l'onglet que Start ouvre (HubSectionSpec.opens). */
  opens?: string;
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
export function createHubScreen(host: HubScreenHost, describe: (tab: string, reopen: () => void) => HubSpec, options: HubOptions = {}): HubScreen {
  let current = '';
  let back: () => void = () => undefined;
  /** Le bloc où l'on est entré (sa clé) ; absent : on choisit un bloc. */
  let inside: string | undefined;
  /** Ouvert par un récapitulatif : l'onglet et le rang du bloc où Exit ramène. */
  let origin: { tab: string; block: number } | undefined;

  /** Les onglets qui s'ouvrent, dans l'ordre. */
  const usable = (spec: HubSpec) => spec.tabs.filter((tab) => !tab.disabled);

  function reopen(): void {
    host.library.openCustom(build);
  }

  /** Les blocs de l'onglet ouvert, dans l'ordre de l'écran : la barre d'onglets, puis chaque section qui a de quoi agir. */
  function blocksOf(spec: HubSpec): Block[] {
    const tabs = usable(spec);
    const out: Block[] = [];
    // Les actions de l'en-tête d'un joueur, d'abord : chacune un bloc d'une seule action (Start la fait tout de suite).
    for (const b of spec.person?.buttons ?? []) if (!b.off) out.push({ key: `person:${b.key}`, label: b.label, items: [{ label: b.label, key: `person:${b.key}`, run: b.run }] });
    if (tabs.length > 1) out.push({ key: 'tabs', label: t('Onglets'), items: tabs.map((tab) => ({ label: tab.label, key: `tab:${tab.id}`, run: () => go(tab.id) })) });
    spec.sections.forEach((s, i) => {
      const items: BlockItem[] = [];
      for (const c of s.cards) {
        // Un bouton grisé (`off`) n'est jamais un arrêt des flippers.
        if (c.buttons?.length) for (const b of c.buttons) !b.off && items.push({ label: b.label, key: `${c.key}:${b.key}`, run: b.run });
        else if (c.run) items.push({ label: c.title, key: c.key, ...(c.quiet ? { tone: 'quiet' as const } : {}), run: c.run });
      }
      // Un onglet en liste : chaque élément est un arrêt à lui seul (un bloc d'une action, sans liseré).
      if (spec.list && !spec.flat) for (const item of items) out.push({ key: `item:${i}:${item.key}`, label: item.label, items: [item] });
      // Un récapitulatif est un bloc même sans action : Start ouvre son onglet.
      else if (s.cards.length && (items.length || s.opens)) out.push({ key: `section:${i}`, label: s.title ?? s.cards[0]?.title ?? '', items, ...(s.opens ? { opens: s.opens } : {}) });
      // Ses choix, sous elle : un bloc d'une seule action chacun (Start la fait tout de suite).
      for (const c of s.choices ?? []) if (c.run) out.push({ key: `choice:${i}:${c.key}`, label: c.title, items: [{ label: c.title, key: c.key, ...(c.quiet ? { tone: 'quiet' as const } : {}), run: c.run }] });
    });
    // Un écran à plat : un seul bloc, tout ce qui se choisit, sans liseré ni entrée.
    if (spec.flat) return [{ key: FLAT, label: spec.title, items: out.flatMap((b) => b.items) }];
    return out;
  }

  /**
   * Ce que les flippers parcourent au premier niveau : les blocs, sauf la barre d'onglets d'un onglet en
   * liste (elle n'est pas un élément de la liste : Exit y mène, 22/11/2026).
   */
  const topOf = (spec: HubSpec, blocks: Block[]): Block[] => (spec.list ? blocks.filter((b) => b.key !== 'tabs') : blocks);

  /** Le rang, au premier niveau, du premier bloc du contenu (après la barre d'onglets et les actions de l'en-tête d'un joueur). */
  const firstContentAt = (spec: HubSpec): number => {
    const top = topOf(spec, blocksOf(spec));
    const at = top.findIndex((b) => b.key !== 'tabs' && !b.key.startsWith('person:'));
    return at >= 0 ? at : Math.max(0, top.findIndex((b) => b.key === 'tabs'));
  };

  /** Le curseur dans la barre d'onglets, sur l'onglet ouvert (menuFirst). */
  function toTabs(): void {
    inside = 'tabs';
    origin = undefined;
    const spec = describe(current, reopen);
    host.library.openCustom(build, Math.max(0, usable(spec).findIndex((tab) => tab.id === current)));
  }

  /** Un autre onglet depuis la barre : son contenu tout de suite, le curseur reste dans la barre (menuFirst). */
  function browse(tab: string): void {
    current = tab;
    toTabs();
  }

  /** Start sur un récapitulatif : son onglet, le curseur dans son premier bloc ; Exit ramènera ici. */
  function shortcut(tab: string, from: number): void {
    origin = { tab: current, block: from };
    current = tab;
    const spec = describe(tab, reopen);
    const blocks = blocksOf(spec);
    // Un onglet en liste : le curseur sur son premier élément, au premier niveau (Exit ramène ici).
    if (spec.list) {
      inside = undefined;
      return void host.library.openCustom(build, firstContentAt(spec));
    }
    const first = blocks.find((b) => b.key !== 'tabs');
    inside = first?.items.length ? first.key : undefined;
    host.library.openCustom(build, first?.items.length ? 0 : 1);
  }

  /** Exit dans l'onglet ouvert par un récapitulatif : retour à l'accueil, le curseur sur ce récapitulatif. */
  function backToOrigin(): void {
    const o = origin!;
    origin = undefined;
    current = o.tab;
    inside = undefined;
    host.library.openCustom(build, o.block);
  }

  /**
   * Onglet choisi : son contenu, le curseur sur son premier bloc (après la barre d'onglets). `opening` :
   * l'écran s'ouvre, le curseur sur la première action de l'en-tête d'un joueur quand il y en a une.
   */
  function go(tab: string, opening = false): void {
    current = tab;
    inside = undefined;
    origin = undefined;
    const spec = describe(tab, reopen);
    const blocks = blocksOf(spec);
    // Un écran à plat (retour de partie) : le curseur sur l'action demandée.
    if (spec.flat) {
      inside = FLAT;
      const at = blocks[0]?.items.findIndex((item) => item.key === spec.focus) ?? -1;
      return void host.library.openCustom(build, Math.max(0, at));
    }
    // À l'ouverture d'un profil : le curseur sur l'action principale de l'en-tête.
    if (opening && blocks[0]?.key.startsWith('person:')) return void host.library.openCustom(build, 0);
    host.library.openCustom(build, firstContentAt(spec));
  }

  /** Start sur un bloc : sa seule action tout de suite, sinon on y entre, le curseur sur son premier élément (l'onglet ouvert pour la barre). */
  function enter(block: Block, spec: HubSpec): void {
    if (block.opens) return shortcut(block.opens, blocksOf(spec).findIndex((b) => b.key === block.key));
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
    else for (const block of topOf(spec, blocks)) blockAction.set(block.key, actions.push({ label: block.label, key: `block:${block.key}`, run: () => enter(block, spec) }) - 1);
    const blockView = (key: string): HubBlockView | undefined => (blockAction.has(key) ? { action: blockAction.get(key)! } : inside === key ? { entered: true } : blocks.some((b) => b.key === key) ? {} : undefined);
    const tabs = spec.tabs.map((tab) => {
      const view = { id: tab.id, label: tab.label, icon: tab.icon, current: tab.id === current, ...(tab.attention ? { attention: true } : {}), ...(tab.disabled ? { disabled: tab.disabled } : {}) };
      const action = itemAction.get(`tab:${tab.id}`);
      return action === undefined ? view : { ...view, action };
    });
    const buttonView = (b: HubButtonSpec, action: number | undefined): HubButtonView => ({
      label: b.label,
      ...(b.icon ? { icon: b.icon } : {}),
      ...(b.xp ? { xp: b.xp } : {}),
      ...(b.primary ? { primary: true } : {}),
      ...(b.quick ? { quick: true } : {}),
      ...(b.off ? { off: b.off } : action !== undefined ? { action } : {}),
    });
    const sections = spec.sections.flatMap((s, i) => {
      if (!s.cards.length && !s.choices?.length) return [];
      const block = blockView(`section:${i}`);
      return [
        {
          ...(s.title ? { title: s.title } : {}),
          ...(s.note ? { note: s.note } : {}),
          layout: s.layout,
          ...(s.column ? { column: s.column } : {}),
          ...(block ? { block } : {}),
          ...(s.choices?.length
            ? {
                choices: s.choices.map((c): HubCardView => {
                  const { key, run: _run, buttons: _buttons, ...shown } = c;
                  const own = blockAction.get(`choice:${i}:${key}`);
                  return { ...shown, ...(own !== undefined ? { action: own } : {}) };
                }),
              }
            : {}),
          cards: s.cards.map((c): HubCardView => {
            const { key, run: _run, buttons, ...shown } = c;
            const out: HubCardView = { ...shown };
            // Dans le bloc où l'on est entré, ou, dans un onglet en liste, l'arrêt de l'élément lui-même.
            const own = (k: string) => itemAction.get(k) ?? blockAction.get(`item:${i}:${k}`);
            if (buttons?.length) out.buttons = buttons.map((b) => buttonView(b, own(`${key}:${b.key}`)));
            else if (own(key) !== undefined) out.action = own(key)!;
            return out;
          }),
        },
      ];
    });
    const tabsBlock = blockView('tabs');
    const person = spec.person ? { ...spec.person, buttons: spec.person.buttons.map((b) => buttonView(b, blockAction.get(`person:${b.key}`))) } : undefined;
    // Exit (règle du mainteneur, 22/11/2026 : « exit sélectionne la barre de menu, exit à nouveau : on sort
    // de l'écran ») : d'un bloc ouvert par un récapitulatif (la même bande), à l'accueil ; d'un autre bloc,
    // on en ressort ; au premier niveau, à l'accueil (récapitulatif), sinon à la barre d'onglets, le curseur
    // sur l'onglet ouvert ; de la barre d'onglets, à la roue (au profil d'un joueur : d'où l'on vient).
    const firstContent = blocks.findIndex((b) => b.key !== 'tabs' && !b.key.startsWith('person:'));
    const hasTabs = blocks.some((b) => b.key === 'tabs');
    const exit = (): (() => void) => {
      if (spec.flat || inside === 'tabs') return back;
      if (enteredAt >= 0) return origin && enteredAt === firstContent ? backToOrigin : () => leave(enteredAt);
      if (origin) return backToOrigin;
      return hasTabs ? toTabs : back;
    };
    const navHint = (): string | undefined => {
      if (spec.hint || spec.flat) return undefined;
      if (inside === 'tabs' && options.backNotWheel) return options.menuFirst ? t('Flippers : changer d’onglet · Start : y entrer · Exit : retour') : t('Flippers : choisir un onglet · Start : l’ouvrir · Exit : retour');
      if (inside === 'tabs') return options.menuFirst ? t('Flippers : changer d’onglet · Start : y entrer · Exit : retour à la roue') : t('Flippers : choisir un onglet · Start : l’ouvrir · Exit : retour à la roue');
      if (origin && (enteredAt < 0 || enteredAt === firstContent))
        return enteredAt >= 0 || spec.list ? t('Flippers : choisir · Start : valider · Exit : retour à l’accueil') : t('Flippers : choisir un bloc · Start : y entrer · Exit : retour à l’accueil');
      if (enteredAt >= 0) return undefined;
      if (hasTabs) return spec.list ? t('Flippers : choisir · Start : valider · Exit : retour aux onglets') : t('Flippers : choisir un bloc · Start : y entrer · Exit : retour aux onglets');
      return spec.list ? t('Flippers : choisir · Start : valider · Exit : retour à la roue') : undefined;
    };
    const hub: HubView = {
      medallion: spec.medallion,
      start: t('Start'),
      title: spec.title,
      facts: spec.facts,
      ...(spec.band ? { band: spec.band } : {}),
      ...(person ? { person } : {}),
      tabs,
      ...(tabsBlock ? { tabsBlock } : {}),
      ...(spec.singleColumn ? { singleColumn: true as const } : {}),
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
      back: exit(),
      hub,
      selectHubTab: (tab) => {
        if (usable(spec).some((item) => item.id === tab)) go(tab);
      },
      hint: navHint() ?? spec.hint ?? (enteredAt >= 0 ? t('Flippers : choisir · Start : valider · Exit : sortir du bloc') : t('Flippers : choisir un bloc · Start : y entrer · Exit : retour à la roue')),
      keys: (input) => {
        if (spec.keys?.(input)) return true;
        // Dans la barre d'onglets (menuFirst) : les flippers changent d'onglet, son contenu tout de suite.
        if (options.menuFirst && inside === 'tabs' && host.navKeys) {
          const nav = host.navKeys();
          const dir = nav.previous.includes(input.code) ? -1 : nav.next.includes(input.code) ? 1 : 0;
          if (dir) {
            const list = usable(spec);
            const at = Math.max(0, list.findIndex((tab) => tab.id === current));
            browse(list[(at + dir + list.length) % list.length]!.id);
            return true;
          }
        }
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
      origin = undefined;
      if (options.menuFirst) {
        current = tab ?? '';
        if (!describe(current, reopen).tabs.some((x) => x.id === current && !x.disabled)) current = usable(describe(current, reopen))[0]?.id ?? current;
        return toTabs();
      }
      go(tab ?? '', true);
    },
    current: () => current,
  };
}
