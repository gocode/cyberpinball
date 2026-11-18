// Nouveautés (Menu système > Nouveautés, app/src/news-menu.ts) : les grandes nouveautés de Cyber
// Pinball, choisies à la main, jamais tirées du CHANGELOG (17/11/2026). Une chronologie : la plus
// récente en haut, la date dite une seule fois pour les nouveautés du même jour ; chaque ligne a son
// détail et, si elle en a un, un petit aperçu ; Start l'agrandit (grand aperçu, texte entier) et
// « Essayer » mène à la fonction.
//
// Règles de choix (docs/manuel, rubrique « Nouveautés ») : une ligne par vraie capacité nouvelle,
// jamais une correction, un gain de vitesse ou un réglage ; une fonction améliorée sur plusieurs
// versions n'a qu'une ligne, à la date de son arrivée ; la date est celle de la version finale ;
// chaque ligne mène à sa fonction (`reach`). On n'en ajoute pas à chaque version : seulement quand
// une fonction le mérite. news.test.ts vérifie la forme (traductions, aperçus, cibles, ordre).
//
// Lu ou non : <données>\nouveautes.json garde les nouveautés déjà vues. Une borne qui n'a pas encore
// ce fichier (installation neuve, ou mise à jour depuis une version qui ne l'avait pas) voit comme
// nouvelles celles de la dernière date seulement : la pastille rouge l'invite à regarder dès la
// première installation (choix du 17/11/2026), sans marquer « Nouveau » toute la chronologie.

import * as fs from 'node:fs';
import { writeFileAtomic } from './atomicwrite';
import { language, t } from './i18n';
import { REACTIONS, isReaction, type Reaction } from './reactions';
import type { SystemEntryId } from './systemmenu';

export const NEWS_FILE = 'nouveautes.json';

/** Où « Essayer » mène : une entrée du menu système, une porte de la Communauté, « Mon niveau », le Juke-box, une partie de la fiche de la table choisie. */
export type NewsReach =
  | { kind: 'system'; id: SystemEntryId }
  | { kind: 'community'; door: 'home' | 'instant' | 'groups' }
  | { kind: 'level' }
  | { kind: 'jukebox' }
  | { kind: 'sheet'; part: 'credits' | 'scores' | 'rules' };

export interface NewsItem {
  /** Identité stable : l'état lu, le nom de l'aperçu (app/renderer/nouveautes/<id>-<langue>.webp). */
  readonly id: string;
  /** Date de la version finale qui l'a apportée (AAAA-MM-JJ). */
  readonly date: string;
  readonly version: string;
  readonly title: string;
  /** La ligne de la chronologie : une phrase, le bénéfice d'abord. */
  readonly detail: string;
  /** Le texte entier, lu une fois la nouveauté agrandie. */
  readonly more: readonly string[];
  /** Où la trouver, en clair (« Communauté › Parties instantanées »). */
  readonly where: string;
  readonly reach: NewsReach;
  /** Fonction encore en essai : badge « BÊTA ». */
  readonly beta?: boolean;
  /** Elle a un aperçu (app/renderer/nouveautes/<id>-fr.webp et -en.webp). */
  readonly preview?: boolean;
}

/** Les nouveautés, la plus récente d'abord. */
export const NEWS: readonly NewsItem[] = [
  {
    // Lots 2 à 5 de la Communauté au téléphone (18/11/2026), la ligne ajoutée avec le dernier.
    id: 'communaute-telephone',
    date: '2026-11-18',
    version: '0.1.16',
    get title() { return t('La Communauté dans votre téléphone'); },
    get detail() { return t('Joueurs, profils, groupes, parties instantanées, salons, classements et niveau, comme à la borne.'); },
    get more() {
      return [
        t('L’onglet Communauté du téléphone reprend celle de la borne : ouvrez le profil d’un joueur, répondez à une demande d’ami, rejoignez un groupe public, ouvrez une partie instantanée, choisissez votre salon.'),
        t('Dans Scores : votre niveau et vos badges, les classements de toutes vos tables, et la cloche de l’Activité récente en haut.'),
      ];
    },
    get where() { return t('Menu système › Télécommande du téléphone'); },
    reach: { kind: 'system', id: 'phone-remote' },
  },
  {
    // Demandé par un joueur (Retours et propositions, 18/11/2026) : réinstallé, il avait perdu son niveau.
    id: 'mon-compte',
    date: '2026-11-18',
    version: '0.1.16',
    get title() { return t('Mon compte'); },
    get detail() { return t('Votre pseudo, votre niveau, vos badges et vos amis vous suivent sur un autre PC ou après une réinstallation.'); },
    get more() {
      return [
        t('Cyber Pinball garde d’office une copie de secours de votre compte sur ce PC, hors de son dossier : une réinstallation la retrouve et vous propose de la reprendre.'),
        t('Notez votre code de récupération, 24 mots ou leur QR à photographier, pour retrouver votre compte sur n’importe quel PC. Un mot de passe est possible aussi : votre pseudo devient votre identifiant, et le serveur ne garde qu’une copie chiffrée qu’il ne peut pas ouvrir.'),
      ];
    },
    get where() { return t('Menu système › Mon compte'); },
    reach: { kind: 'system', id: 'account' },
  },
  {
    id: 'autres-vpx',
    date: '2026-11-18',
    version: '0.1.16',
    get title() { return t('Autres versions de VPX'); },
    get detail() { return t('Les tables qui tournent mieux avec VPX 10.8.0 se jouent avec lui, table par table.'); },
    get more() {
      return [
        t('Ajoutez un VPX déjà installé sur ce PC (ceux des autres installations sont proposés d’office), puis choisissez-le dans la fiche d’une table ou quand elle s’installe. Une table reprise d’une autre installation garde le VPX qui la jouait.'),
        t('Cyber Pinball le lance avec ses propres réglages ; la réalité virtuelle, le réglage de l’affichage et les parties entre amis restent avec le VPX de Cyber Pinball.'),
      ];
    },
    get where() { return t('Menu système › Borne › Autres versions de VPX'); },
    reach: { kind: 'system', id: 'other-vpx' },
  },
  {
    // Ajoutée après coup (17/11/2026) : les niveaux étaient sortis en préversion sans leur ligne.
    id: 'niveaux',
    date: '2026-11-17',
    version: '0.1.14',
    get title() { return t('Niveaux'); },
    get detail() { return t('Vos parties, vos progrès, vos badges et la vie entre joueurs vous font monter de niveau.'); },
    get more() {
      return [
        t('Chaque partie, chaque record battu, chaque classement de la semaine, chaque badge reçu et la vie entre joueurs rapportent des XP. Votre niveau monte et ne baisse jamais ; votre carte de joueur, en haut de l’écran des tables, le montre avec sa barre.'),
        t('Un badge reçu a son moment au retour de la partie, avec son animation et sa musique, et le passage de niveau a ses rayons. « Mon niveau » dit ce qui rapporte des XP et quels badges sont les plus proches.'),
      ];
    },
    get where() { return t('Communauté › Mon niveau'); },
    reach: { kind: 'level' },
    preview: true,
  },
  {
    id: 'parties-instantanees',
    date: '2026-11-17',
    version: '0.1.14',
    get title() { return t('Parties instantanées'); },
    get detail() { return t('Une partie en direct ouverte à tous, qui part d’elle-même dès qu’elle est complète.'); },
    get more() {
      return [
        t('Choisissez une table et le nombre de joueurs, de 2 à 4 : votre partie s’affiche chez tous les joueurs en ligne, et part toute seule dès qu’elle est complète.'),
        t('Amis ou non, il suffit d’avoir la même version de la table. Vous êtes prévenu de chaque arrivée, et une partie s’ouvre aussi depuis la fiche d’une table.'),
      ];
    },
    get where() { return t('Communauté › Parties instantanées'); },
    reach: { kind: 'community', door: 'instant' },
    preview: true,
  },
  {
    id: 'groupes',
    date: '2026-11-17',
    version: '0.1.14',
    get title() { return t('Groupes'); },
    get detail() { return t('Vos cercles, publics ou privés : une discussion et une table de la semaine, avec son classement.'); },
    get more() {
      return [
        t('Créez un groupe avec vos amis : privé, il ne paraît nulle part et l’on y entre sur invitation ; public, n’importe quel joueur le rejoint d’un appui. Chaque semaine, une table choisie pour tous : Start la lance, et le classement du groupe se remplit tout seul.'),
        t('Chaque membre peut inviter ses amis. Tout passe d’une borne à l’autre, sans serveur : un membre absent reçoit les messages à son retour.'),
      ];
    },
    get where() { return t('Communauté › Groupes'); },
    reach: { kind: 'community', door: 'groups' },
    preview: true,
  },
  {
    id: 'pinball-fx',
    date: '2026-11-16',
    version: '0.1.13',
    get title() { return t('Pinball FX sur la roue'); },
    get detail() { return t('Vos tables Pinball FX, achetées sur Steam ou Epic, à côté de vos tables VPX.'); },
    get more() {
      return [
        t('Choisissez les tables que vous possédez : elles rejoignent la roue avec leurs médias, vos collections, vos favoris et vos statistiques.'),
        t('Un appui long sur Exit ferme le jeu et ramène au front-end. Ce que Pinball FX ne fournit pas (scores, partie avec un ami, réalité virtuelle) reste grisé sur la fiche, avec la raison.'),
      ];
    },
    get where() { return t('Menu système › Tables › Ajouter une table › Tables de Pinball FX'); },
    reach: { kind: 'system', id: 'add-table' },
    beta: true,
  },
  {
    id: 'avis-et-propositions',
    date: '2026-11-16',
    version: '0.1.13',
    get title() { return t('Retours et propositions'); },
    get detail() { return t('Les idées des joueurs, les plus demandées en tête : votez, ou proposez la vôtre.'); },
    get more() {
      return [
        t('Un tableau public des idées et des problèmes signalés par les joueurs. Votez pour une proposition, ou publiez la vôtre au clavier à l’écran ou au téléphone : les propositions proches s’affichent pendant que vous écrivez.'),
        t('Un problème se signale aussi depuis l’écran d’une partie qui n’a pas pu se dérouler, avec un rapport technique lu par l’équipe seule.'),
      ];
    },
    get where() { return t('Menu système › Cyber Pinball › Retours et propositions'); },
    reach: { kind: 'system', id: 'feedback' },
    preview: true,
  },
  {
    id: 'communaute',
    date: '2026-11-13',
    version: '0.1.11',
    get title() { return t('La Communauté'); },
    get detail() { return t('Les joueurs en ligne du monde entier, et un salon de discussion par pays.'); },
    get more() {
      return [
        t('Un médaillon de la roue ouvre la Communauté : les joueurs en ligne, amis ou non, avec leur drapeau ; vos messages ; les classements de toutes vos tables.'),
        t('Chaque pays a son salon, plus « Monde » : une ligne par message, avec l’heure, le drapeau et le pseudo de chacun. On écrit avec des phrases d’un appui, le clavier à l’écran ou le téléphone.'),
      ];
    },
    get where() { return t('Roue › Communauté'); },
    reach: { kind: 'community', door: 'home' },
    preview: true,
  },
  {
    id: 'credits',
    date: '2026-11-13',
    version: '0.1.11',
    get title() { return t('Les crédits de vos tables'); },
    get detail() { return t('Qui a fait la table, son fronton, son PuP-Pack, ses médias : chaque auteur cité.'); },
    get more() {
      return [
        t('La fiche de chaque table a ses crédits, d’après la base VPS : la table, le fronton, le PuP-Pack, les couleurs et les sons, les médias et les règles. Start sur une ligne montre tous ses auteurs et la page d’où vient la pièce, en QR code à viser au téléphone.'),
        t('La roue cite l’auteur principal de chaque table, et « La communauté » rassemble les auteurs de toutes vos tables.'),
      ];
    },
    get where() { return t('Fiche d’une table › Crédits'); },
    reach: { kind: 'sheet', part: 'credits' },
  },
  {
    id: 'juke-box',
    date: '2026-11-11',
    version: '0.1.9',
    get title() { return t('Le Juke-box'); },
    get detail() { return t('Vos playlists YouTube et vos fichiers sur la borne, le clip au fronton, le spectre au DMD.'); },
    get more() {
      return [
        t('Un médaillon en tête de la roue joue vos playlists : importées de YouTube, ou vos propres fichiers. Le fronton montre le clip ou la pochette, le DMD un spectre aux couleurs de la pochette.'),
        t('Tout se pilote aux boutons de la borne, ou au téléphone. Le son peut sortir sur plusieurs haut-parleurs à la fois, chacun avec son volume.'),
      ];
    },
    get where() { return t('Roue › Juke-box'); },
    reach: { kind: 'jukebox' },
    preview: true,
  },
  {
    id: 'classements',
    date: '2026-11-11',
    version: '0.1.9',
    get title() { return t('Classements jusqu’au mondial'); },
    get detail() { return t('Le tableau des scores de chaque table : votre borne, vos amis, votre pays, le monde.'); },
    get more() {
      return [
        t('Chaque partie laisse ses scores sur la fiche de la table. Les MagnaSave passent de « Cette borne » à « Amis », « National » et « Mondial » ; les flippers changent de période, de tout temps à aujourd’hui.'),
        t('Un score n’est comparé qu’avec ceux de la même version de la table, jouée avec le même nombre de billes. Il passe de borne en borne, signé par son joueur, sans serveur.'),
      ];
    },
    get where() { return t('Fiche d’une table › Tableau des scores'); },
    reach: { kind: 'sheet', part: 'scores' },
    preview: true,
  },
  {
    id: 'realite-virtuelle',
    date: '2026-11-11',
    version: '0.1.9',
    get title() { return t('Réalité virtuelle'); },
    get detail() { return t('Vos tables et le front-end dans un casque, la borne calée sur la vraie.'); },
    get more() {
      return [
        t('Avec un casque (Meta Quest par Link ou Virtual Desktop, SteamVR), le front-end s’affiche dans une borne habillée, et chaque table se joue en grand devant vous.'),
        t('« Caler la borne » pose la borne du casque exactement sur la vraie : vous jouez avec les boutons de votre borne, sous vos mains.'),
      ];
    },
    get where() { return t('Menu système › Borne › Réalité virtuelle'); },
    reach: { kind: 'system', id: 'realite-virtuelle' },
    beta: true,
  },
  {
    id: 'vision-3d',
    date: '2026-11-11',
    version: '0.1.9',
    get title() { return t('Vision 3D'); },
    get detail() { return t('La perspective de la table suit votre tête, avec une webcam ou une Kinect.'); },
    get more() {
      return [
        t('La table se voit comme par une fenêtre : penchez-vous, elle change de perspective, sans casque ni lunettes.'),
        t('Une webcam suffit ; une Kinect de Xbox 360 ou de Xbox One marche aussi, et son pilote s’installe en un clic.'),
      ];
    },
    get where() { return t('Menu système › Borne › Vision 3D'); },
    reach: { kind: 'system', id: 'vision3d' },
    beta: true,
  },
  {
    id: 'collections',
    date: '2026-11-07',
    version: '0.1.8',
    get title() { return t('Collections et favoris'); },
    get detail() { return t('Favoris, récentes, fabricants, décennies, les vôtres : la roue montre celle de votre choix.'); },
    get more() {
      return [
        t('Les MagnaSave passent d’une collection à l’autre ; le médaillon Collections les montre toutes. « Ajouter aux favoris » sur la fiche d’une table pose une étoile devant son titre.'),
        t('Créez vos propres collections, et choisissez celle qu’un invité a le droit de parcourir.'),
      ];
    },
    get where() { return t('Roue › Collections'); },
    reach: { kind: 'system', id: 'collections' },
    preview: true,
  },
  {
    id: 'telephone',
    date: '2026-11-07',
    version: '0.1.8',
    get title() { return t('Le téléphone pilote tout'); },
    get detail() { return t('Tout le front-end, le Juke-box et les scores dans la main, sans rien installer.'); },
    get more() {
      return [
        t('Visez le QR code de la borne : votre téléphone devient sa télécommande, dans tout le front-end. Il ouvre directement n’importe quel écran, tape un texte, envoie un fichier.'),
        t('Accepté une fois, il est gardé : il revient ensuite sans QR code.'),
      ];
    },
    get where() { return t('Menu système › Télécommande du téléphone'); },
    reach: { kind: 'system', id: 'phone-remote' },
    preview: true,
  },
  {
    id: 'regles',
    date: '2026-11-07',
    version: '0.1.8',
    get title() { return t('Les règles de chaque table'); },
    get detail() { return t('Prospectus, règles trouvées toutes seules et commandes de la partie, page par page.'); },
    get more() {
      return [
        t('Cyber Pinball trouve les règles d’une table : la carte et le texte que l’auteur a rangés dans la table, une feuille de règles en ligne, sa vidéo. Elles se lisent page par page, aux flippers.'),
        t('La dernière page donne toujours les commandes de la partie, avec les boutons de votre borne.'),
      ];
    },
    get where() { return t('Fiche d’une table › Prospectus et règles'); },
    reach: { kind: 'sheet', part: 'rules' },
    preview: true,
  },
  {
    id: 'autre-installation',
    date: '2026-11-06',
    version: '0.1.7',
    get title() { return t('Vos tables d’une autre installation'); },
    get detail() { return t('Chaque table arrive avec tout son dossier : PuP-Pack, ROM, sauvegarde, sons et médias.'); },
    get more() {
      return [
        t('Vous venez d’un autre front-end ? Cyber Pinball montre d’abord les tables que vous jouiez vraiment, avec leurs listes, et reprend chacune avec tout ce qui l’accompagne, rangé au bon endroit.'),
        t('Les copies et anciennes versions restent à part ; rien n’est déplacé sans votre accord.'),
      ];
    },
    get where() { return t('Menu système › Tables › Ajouter une table › Depuis une autre installation'); },
    reach: { kind: 'system', id: 'add-table' },
  },
  {
    id: 'sauvegardes',
    date: '2026-11-06',
    version: '0.1.7',
    get title() { return t('Sauvegardes'); },
    get detail() { return t('Vos réglages, vos scores et vos tables copiés, puis restaurés partie par partie.'); },
    get more() {
      return [
        t('Copiez vos réglages et vos scores, vos tables en plus si vous le voulez, sur un autre disque ou une clé USB. Une sauvegarde automatique peut s’en charger chaque jour ou chaque semaine.'),
        t('Pour restaurer, un plan dit d’abord, partie par partie, ce qui sera remplacé, remis ou gardé.'),
      ];
    },
    get where() { return t('Menu système › Cyber Pinball › Sauvegardes'); },
    reach: { kind: 'system', id: 'backups' },
  },
  {
    id: 'amis',
    date: '2026-10-29',
    version: '0.1.4',
    get title() { return t('Amis, de borne à borne'); },
    get detail() { return t('Jouer en direct jusqu’à quatre bornes, échanger des tables, sans serveur ni compte.'); },
    get more() {
      return [
        t('Invitez jusqu’à trois amis sur une table : un compte à rebours commun lance la partie partout en même temps, et les scores de chacun s’affichent en direct.'),
        t('Parcourez la bibliothèque d’un ami pour récupérer une table ou les médias qui vous manquent. Vos bornes se relient directement, par Internet ou sur le réseau local.'),
      ];
    },
    get where() { return t('Menu système › Amis'); },
    reach: { kind: 'system', id: 'amis' },
    preview: true,
  },
];

/** Ce que la borne garde : les nouveautés déjà vues. */
export interface NewsState {
  seen: string[];
}

/** La dernière date de la liste. */
export const newestNewsDate = (items: readonly NewsItem[] = NEWS): string | undefined => items.reduce<string | undefined>((a, n) => (a === undefined || n.date > a ? n.date : a), undefined);

/**
 * Lit l'état. Sans fichier (installation neuve, mise à jour depuis une version qui ne l'avait pas) :
 * tout est vu sauf la dernière date, qui garde sa pastille. Un fichier illisible repart de même.
 */
export function loadNewsState(file: string, items: readonly NewsItem[] = NEWS): { state: NewsState; fresh: boolean } {
  try {
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as unknown;
    const seen = (raw as { seen?: unknown })?.seen;
    if (Array.isArray(seen)) return { state: { seen: seen.filter((s): s is string => typeof s === 'string') }, fresh: false };
  } catch {
    // Absent ou illisible : l'état de départ.
  }
  const newest = newestNewsDate(items);
  return { state: { seen: items.filter((n) => n.date !== newest).map((n) => n.id) }, fresh: true };
}

export function saveNewsState(file: string, state: NewsState): void {
  writeFileAtomic(file, JSON.stringify({ seen: [...new Set(state.seen)] }, null, 1) + '\n');
}

/** Les nouveautés pas encore vues, la plus récente d'abord. */
export const unreadNews = (state: NewsState, items: readonly NewsItem[] = NEWS): NewsItem[] => items.filter((n) => !state.seen.includes(n.id));

/** Marque ces nouveautés vues ; vrai si l'état a changé. */
export function markNewsSeen(state: NewsState, ids: readonly string[]): boolean {
  const add = ids.filter((id) => !state.seen.includes(id));
  if (!add.length) return false;
  state.seen.push(...add);
  return true;
}

/** Durée pendant laquelle « Nouveautés » reste en tête du menu système après sa dernière date, même lue. */
export const NEWS_ROOT_DAYS = 21;

/** « Nouveautés » en tête du menu système : tant qu'il y en a une à voir, ou que la dernière a moins de trois semaines. */
export function newsAtRoot(state: NewsState, now: number, items: readonly NewsItem[] = NEWS): boolean {
  if (unreadNews(state, items).length) return true;
  const newest = newestNewsDate(items);
  return newest !== undefined && now - Date.parse(`${newest}T12:00:00`) < NEWS_ROOT_DAYS * 86_400_000;
}

// ---------------------------------------------------------------------------
// Réactions des joueurs (les sept des messages), comptées par le service des retours
// (packages/service-telephone/worker.mjs, GET et POST /api/nouveautes) : une par borne et par nouveauté.

/** Les réactions d'une nouveauté : combien de joueurs pour chacune, et la mienne. */
export interface NewsReactions {
  counts: Partial<Record<Reaction, number>>;
  mine?: Reaction;
}

/** Une réponse du service, vérifiée champ par champ : rien d'inattendu n'entre dans les écrans. */
export function parseNewsReactions(raw: unknown): Record<string, NewsReactions> {
  const all = raw && typeof raw === 'object' ? (raw as { reactions?: unknown }).reactions : undefined;
  const out: Record<string, NewsReactions> = {};
  if (!all || typeof all !== 'object') return out;
  for (const [item, value] of Object.entries(all as Record<string, unknown>)) {
    if (!/^[a-z0-9-]{2,40}$/.test(item)) continue;
    const one = parseNewsReaction(value);
    if (one) out[item] = one;
  }
  return out;
}

/** Les réactions d'une nouveauté (réponse d'un POST, ou une entrée de la liste). */
export function parseNewsReaction(raw: unknown): NewsReactions | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const r = raw as { counts?: unknown; mine?: unknown };
  const counts: Partial<Record<Reaction, number>> = {};
  if (r.counts && typeof r.counts === 'object') {
    for (const kind of REACTIONS) {
      const n = (r.counts as Record<string, unknown>)[kind];
      if (typeof n === 'number' && Number.isSafeInteger(n) && n > 0) counts[kind] = n;
    }
  }
  return { counts, ...(isReaction(r.mine) ? { mine: r.mine } : {}) };
}

/** Ma réaction changée, tout de suite à l'écran (la réponse du service fait foi ensuite). */
export function withMyNewsReaction(before: NewsReactions | undefined, kind: Reaction | null): NewsReactions {
  const counts = { ...(before?.counts ?? {}) };
  const old = before?.mine;
  if (old) counts[old] = Math.max(0, (counts[old] ?? 0) - 1) || undefined;
  if (kind) counts[kind] = (counts[kind] ?? 0) + 1;
  for (const k of REACTIONS) if (!counts[k]) delete counts[k];
  return { counts, ...(kind ? { mine: kind } : {}) };
}

/**
 * Le résumé d'une ligne de la liste : les trois réactions les plus choisies (à égalité, dans l'ordre
 * des sept), le total des joueurs, et si j'ai réagi. Rien quand personne n'a réagi.
 */
export function newsReactionSummary(r: NewsReactions | undefined): { top: Reaction[]; total: number; mine: boolean } | undefined {
  if (!r) return undefined;
  const chosen = REACTIONS.filter((k) => (r.counts[k] ?? 0) > 0);
  const total = chosen.reduce((s, k) => s + r.counts[k]!, 0);
  if (!total) return undefined;
  const top = [...chosen].sort((a, b) => r.counts[b]! - r.counts[a]! || REACTIONS.indexOf(a) - REACTIONS.indexOf(b)).slice(0, 3);
  return { top, total, mine: r.mine !== undefined };
}

const locale = () => (language() === 'en' ? 'en-GB' : 'fr-FR');

/** « 17 nov. » ; « 17 Nov » en anglais. */
export function newsShortDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'short' });
}

/** « 17 novembre 2026 » ; « 17 November 2026 ». */
export function newsLongDate(date: string): string {
  return new Date(`${date}T12:00:00`).toLocaleDateString(locale(), { day: 'numeric', month: 'long', year: 'numeric' });
}
