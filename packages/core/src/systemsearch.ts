// Recherche dans le Menu système (22/11/2026) : « Aide et infos > Rechercher », ou une lettre tapée sur
// un vrai clavier depuis un écran du menu. Elle trouve les rubriques, les entrées de l'arbre
// (systemmenu.ts) et les réglages rangés dans les écrans de ces entrées (systemsearch-places.ts), que
// l'arbre ne décrit pas : « Logos animés » est une ligne de l'écran de la Roue.
//
// Ce module ne fait que chercher : il dit quoi ouvrir. L'application ouvre (app/src/system-search-menu.ts) :
// une rubrique, une entrée, ou l'écran d'une entrée, ses sous-écrans traversés un à un, le curseur posé
// sur la ligne du réglage (library.ts, reachSystemPlace).
//
// Comparaison : sans accents ni majuscules ; chaque mot tapé doit commencer un mot de la ligne (ou s'y
// trouver, à partir de trois lettres), et au moins un mot doit se trouver dans son nom ou ses mots-clés
// (une ligne n'est jamais trouvée par son seul chemin : « dmd » ne remonte pas toute la rubrique DMD).

import { say, t, type LaterText } from './i18n';
import type { IconName } from './icons';
import { SEARCH_PLACES } from './systemsearch-places';
import { SYSTEM_GROUP_IDS, SYSTEM_GROUPS, SYSTEM_ITEM_IDS, SYSTEM_ITEMS, systemPathOf, type SystemEntryId, type SystemGroupId, type SystemItemId } from './systemmenu';

/**
 * Un réglage ou une action d'un écran ouvert par une entrée du Menu système. Les textes sont des clés
 * françaises (tLater) : l'application retrouve les lignes à l'écran par leur début, en français comme
 * dans la langue affichée (les libellés montrent souvent leur valeur : « Ordre des tables : par nom »).
 */
export interface SearchPlace {
  /** L'entrée dont l'écran contient ce réglage. */
  readonly parent: SystemItemId;
  /**
   * Lignes à ouvrir l'une après l'autre depuis l'écran de l'entrée, avant celui du réglage. Une ligne
   * dont le nom change selon l'état (« Destination : … » ou « Choisir une destination ») : ses noms possibles.
   */
  readonly steps?: readonly (LaterText | readonly LaterText[])[];
  /** Début du libellé de la ligne du réglage, sans sa valeur : c'est aussi son nom dans les résultats. */
  readonly target: LaterText;
  /** Les autres noms de la même ligne selon l'état (« Désactiver la Vision 3D » pour « Activer la Vision 3D »). */
  readonly alt?: readonly LaterText[];
  /** Mots en plus (synonymes, ce qu'on tape sans connaître le nom), séparés par des espaces. */
  readonly keywords?: LaterText;
}

/** Les noms possibles d'une ligne (le premier sert dans le chemin affiché). */
export function placeNames(step: LaterText | readonly LaterText[]): readonly LaterText[] {
  return Array.isArray(step) ? step : [step as LaterText];
}

/** Les noms possibles de la ligne du réglage, son nom principal d'abord. */
export function placeTargets(place: SearchPlace): readonly LaterText[] {
  return [place.target, ...(place.alt ?? [])];
}

/** Ce que la recherche peut ouvrir. */
export type SearchTarget =
  | { readonly kind: 'group'; readonly id: SystemGroupId }
  | { readonly kind: 'item'; readonly id: SystemItemId }
  | { readonly kind: 'place'; readonly place: SearchPlace };

/** Une ligne de résultat, dans la langue affichée. */
export interface SearchResult {
  readonly target: SearchTarget;
  readonly label: string;
  /** Où elle se trouve : les rubriques, l'entrée et les écrans traversés (« Ma borne › DMD et LED »). */
  readonly path: readonly string[];
  readonly icon: IconName;
  readonly score: number;
}

/** Mots-clés des rubriques et des entrées de l'arbre : ce qu'on tape sans connaître leur nom. */
const ENTRY_KEYWORDS: Partial<Record<SystemEntryId, () => string>> = {
  'menu-media': () => t('musique volume sons ambiance attract veille écran de veille'),
  wheel: () => t('roue présentation ordre tri logos'),
  'missing-media': () => t('images vidéos fronton playfield logo wheel'),
  roms: () => t('rom pinmame'),
  'all-tables': () => t('liste bibliothèque jeux'),
  'add-table': () => t('installer importer nouvelle table télécharger pinball fx future pinball zen'),
  cabinet: () => t('boutons écrans son langue assistant'),
  'vpx-settings': () => t('visual pinball réglages graphismes nudge physique'),
  'dmd-screen': () => t('fulldmd dmd seul'),
  'hardware-dmd': () => t('zedmd pin2dmd pixelcade'),
  dof: () => t('led toys retours de force solénoïdes contacteurs'),
  vision3d: () => t('kinect webcam suivi de la tête'),
  anaglyph: () => t('lunettes rouge cyan relief'),
  vr: () => t('casque quest réalité virtuelle'),
  'phone-remote': () => t('téléphone smartphone qr code'),
  dedicated: () => t('shell remplacer le bureau windows'),
  startup: () => t('démarrage windows lancement automatique'),
  'guest-mode': () => t('enfants verrouiller invité'),
  backups: () => t('sauvegarde restaurer copie'),
  health: () => t('problèmes diagnostic état'),
  'tech-sheet': () => t('pc configuration matériel rapport'),
  updates: () => t('version mettre à jour préversion'),
  feedback: () => t('bug problème idée proposition signaler'),
  controls: () => t('aide boutons touches'),
  'player-name': () => t('nom pseudo'),
  account: () => t('mot de passe code de récupération transférer'),
  'account-delete': () => t('effacer supprimer compte'),
  sharing: () => t('réseau pare-feu partage bibliothèque'),
  'quiet-in-game': () => t('notifications silence pendant la partie'),
  'local-play': () => t('hors ligne sans internet local'),
  desktop: () => t('windows bureau sortir'),
  quit: () => t('fermer sortir'),
  shutdown: () => t('arrêter éteindre'),
  restart: () => t('redémarrer'),
  sleep: () => t('veille'),
  quitter: () => t('fermer éteindre arrêter'),
};

/** Une rubrique ou une entrée que l'écran affiche (fournie par l'application, hors jeu local, etc.). */
export type SearchAvailability = (id: SystemEntryId) => boolean;

/** Le texte ramené à sa forme comparable : sans accents, sans majuscules, la ponctuation en espaces. */
export function searchText(text: string): string {
  return text
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
}

function words(text: string): string[] {
  const clean = searchText(text);
  return clean ? clean.split(' ') : [];
}

/** Les mots tapés, chacun une fois. */
export function searchTerms(query: string): string[] {
  return [...new Set(words(query))];
}

/** Ce que vaut un mot tapé dans un champ : 2 s'il commence un mot, 1 s'il s'y trouve (trois lettres au moins), 0 sinon. */
function termIn(term: string, fieldWords: readonly string[]): number {
  if (fieldWords.some((w) => w.startsWith(term))) return 2;
  if (term.length >= 3 && fieldWords.some((w) => w.includes(term))) return 1;
  return 0;
}

interface Candidate {
  readonly target: SearchTarget;
  readonly label: string;
  readonly path: readonly string[];
  readonly icon: IconName;
  readonly keywords: string;
  /** Ce que dit la ligne d'une rubrique (son contenu). */
  readonly detail: string;
}

const groupLabels = (trail: readonly SystemGroupId[]) => trail.map((g) => SYSTEM_GROUPS[g].label);

/** Toutes les lignes que la recherche peut trouver, dans la langue affichée. */
export function searchCandidates(available: SearchAvailability): Candidate[] {
  const out: Candidate[] = [];
  for (const id of SYSTEM_GROUP_IDS) {
    if (!available(id)) continue;
    const g = SYSTEM_GROUPS[id];
    out.push({ target: { kind: 'group', id }, label: g.label, path: groupLabels(systemPathOf(id) ?? []), icon: g.icon, keywords: ENTRY_KEYWORDS[id]?.() ?? '', detail: g.detail });
  }
  for (const id of SYSTEM_ITEM_IDS) {
    // La recherche ne se trouve pas elle-même.
    if (id === 'search' || !available(id)) continue;
    const trail = systemPathOf(id);
    if (!trail) continue;
    out.push({ target: { kind: 'item', id }, label: SYSTEM_ITEMS[id].label, path: groupLabels(trail), icon: SYSTEM_ITEMS[id].icon, keywords: ENTRY_KEYWORDS[id]?.() ?? '', detail: '' });
  }
  for (const place of SEARCH_PLACES) {
    if (!available(place.parent)) continue;
    const trail = systemPathOf(place.parent);
    if (!trail) continue;
    out.push({
      target: { kind: 'place', place },
      label: say(place.target),
      path: [...groupLabels(trail), SYSTEM_ITEMS[place.parent].label, ...(place.steps ?? []).map((s) => say(placeNames(s)[0]!).replace(/…$/, ''))],
      icon: SYSTEM_ITEMS[place.parent].icon,
      // Les autres noms de la ligne se trouvent aussi (« désactiver » trouve « Activer la Vision 3D »).
      keywords: [place.keywords ? say(place.keywords) : '', ...(place.alt ?? []).map((a) => say(a))].join(' '),
      detail: '',
    });
  }
  return out;
}

/** Note d'une ligne pour ces mots ; 0 : elle n'est pas trouvée. */
function scoreOf(c: Candidate, terms: readonly string[], query: string): number {
  const label = words(c.label);
  const keywords = words(c.keywords);
  const detail = words(c.detail);
  const path = words(c.path.join(' '));
  let score = 0;
  let named = false;
  for (const term of terms) {
    const inLabel = termIn(term, label);
    const inKeywords = termIn(term, keywords);
    if (inLabel || inKeywords) named = true;
    const best = Math.max(inLabel * 10, inKeywords * 5, termIn(term, detail) * 2, termIn(term, path));
    if (!best) return 0;
    score += best;
  }
  if (!named) return 0;
  // Le nom commence par ce qui est tapé : en tête (« logo » → « Logos animés »).
  if (searchText(c.label).startsWith(searchText(query))) score += 8;
  // À note égale, ce qu'on voit dans le menu avant ce qui est rangé dans un écran.
  if (c.target.kind !== 'place') score += 1;
  return score;
}

/** Les lignes trouvées pour `query`, les meilleures d'abord ; aucune pour une recherche vide. */
export function searchSystem(query: string, available: SearchAvailability): SearchResult[] {
  const terms = searchTerms(query);
  if (!terms.length) return [];
  return searchCandidates(available)
    .map((c) => ({ c, score: scoreOf(c, terms, query) }))
    .filter((x) => x.score > 0)
    .sort((a, b) => b.score - a.score || a.c.path.length - b.c.path.length || a.c.label.localeCompare(b.c.label))
    .map(({ c, score }) => ({ target: c.target, label: c.label, path: c.path, icon: c.icon, score }));
}

/** Le chemin d'un résultat tel qu'il s'affiche sous son nom. */
export function searchPathText(result: Pick<SearchResult, 'path'>): string {
  return result.path.length ? result.path.join(' › ') : t('Menu système');
}

/** Identifiant stable d'un résultat (clé de l'action, pour que le curseur le suive quand la liste change). */
export function searchKey(target: SearchTarget): string {
  if (target.kind !== 'place') return `${target.kind}:${target.id}`;
  return `place:${target.place.parent}:${[...(target.place.steps ?? []).map((s) => placeNames(s)[0]!), target.place.target].map((x) => x.key).join('>')}`;
}
