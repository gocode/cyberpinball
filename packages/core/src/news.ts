// Nouveautés (Menu système > Aide et infos > Nouveautés, app/src/news-menu.ts) : les grandes nouveautés de Cyber
// Pinball, choisies à la main, jamais tirées du CHANGELOG (17/11/2026). Une chronologie : la plus
// récente en haut, la date dite une seule fois pour les nouveautés du même jour ; chaque ligne a son
// détail et son petit aperçu (une image, toujours : la liste doit rester vivante, 21/11/2026) ;
// Start l'agrandit (grand aperçu, texte entier) et
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

/** Où « Essayer » mène : une entrée du menu système, une porte de la Communauté, l'écran de l'Arène, « Mon niveau », le Juke-box, une partie de la fiche de la table choisie. */
export type NewsReach =
  | { kind: 'system'; id: SystemEntryId }
  | { kind: 'community'; door: 'home' | 'instant' | 'groups' | 'daily' }
  | { kind: 'arena' }
  | { kind: 'level' }
  | { kind: 'jukebox' }
  /** La roue, et un tirage de la table surprise tout de suite. */
  | { kind: 'surprise' }
  | { kind: 'sheet'; part: 'credits' | 'scores' | 'rules' | 'pov' };

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
  /** Où la trouver, en clair (« Communauté › Parties en direct »). */
  readonly where: string;
  readonly reach: NewsReach;
  /** Fonction encore en essai : badge « BÊTA ». */
  readonly beta?: boolean;
  /**
   * Chaque nouveauté a son aperçu (app/renderer/nouveautes/<id>-fr.webp et -en.webp, faits par la
   * démonstration interne des aperçus) : un écran de la fonction ou, à défaut, une illustration.
   * Exception rare, à justifier ici : pourquoi aucune image n'est possible (news.test.ts l'exige).
   */
  readonly noPreview?: string;
}

/** Les nouveautés, la plus récente d'abord. */
export const NEWS: readonly NewsItem[] = [
  {
    // Table surprise (26/11/2026), contribution d'un joueur sur GitHub ; « Retours et propositions »
    // (0.1.13) sort de la liste pour la garder à 24. Date à poser au jour de la version finale.
    id: 'table-surprise',
    date: '2026-11-26',
    version: '0.2.4',
    get title() { return t('Table surprise'); },
    get detail() { return t('Tiens les deux flippers sur la roue : une table de la collection est tirée au hasard.'); },
    get more() {
      return [
        t('Sur la roue, tiens les deux flippers une seconde et demie : les logos des tables défilent comme à la loterie, puis l’une d’elles est tirée. Relâche les deux flippers et la partie démarre ; Exit ou un MagnaSave annule.'),
        t('Le tirage se fait dans la collection affichée. Une table s’en écarte dans Gérer la table > Table surprise ; une collection s’écarte du tirage de « Toutes les tables » dans Collections.'),
      ];
    },
    get where() { return t('Sur la roue : les deux flippers tenus'); },
    reach: { kind: 'surprise' },
    beta: true,
  },
  {
    // Animations des LED hors partie (25/11/2026) : « Groupes » (0.1.14) sort de la liste pour la garder
    // à 24. Date à poser au jour de la version finale.
    id: 'animations-led',
    date: '2026-11-25',
    version: '0.2.4',
    get title() { return t('Animations des LED'); },
    get detail() { return t('Tes LED adressables s’animent aux couleurs de la table choisie, et se taisent quand une partie démarre.'); },
    get more() {
      return [
        t('Dans les écrans de la borne et à la roue, tes bandes de LED adressables montrent une ambiance douce, aux couleurs de la table choisie. Chaque changement de table lance un balayage dans le sens du défilement, et l’ouverture d’une fiche une pulsation.'),
        t('Style, luminosité maximale, vitesse, couleurs, extinction après inactivité : tout se règle. Dès qu’une partie se prépare, les LED sont rendues à DOF.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › DMD et LED › LED et retours (DOF) › Animations des LED'); },
    reach: { kind: 'system', id: 'dof' },
    noPreview: 'Une animation de LED se voit sur les bandes de la borne, pas à l’écran : aucune capture ne la montre sans matériel réel.', // i18n-ignore : raison interne, jamais affichée
  },
  {
    // Recherche dans le Menu système (24/11/2026) ; « La Communauté » (0.1.11) sort de la liste pour
    // la garder à 24. Date à poser au jour de la version finale.
    id: 'recherche-menu',
    date: '2026-11-24',
    version: '0.2.4',
    get title() { return t('Rechercher dans le Menu système'); },
    get detail() { return t('Tape une lettre dans le Menu système : les réglages qui correspondent s’affichent aussitôt.'); },
    get more() {
      return [
        t('Le nom d’un réglage, d’une rubrique ou un mot-clé (« logo », « volume », « kinect ») : les résultats suivent chaque lettre, au clavier à l’écran, sur un vrai clavier ou au téléphone.'),
        t('Un résultat ouvre son écran, le curseur posé sur le réglage ; Retour revient à la liste.'),
      ];
    },
    get where() { return t('Menu système › Aide et infos › Rechercher'); },
    reach: { kind: 'system', id: 'search' },
  },
  {
    // Mode débogage (23/11/2026) : les mesures de tous les écrans en direct, par-dessus l'un d'eux. « Les crédits de vos tables » (0.1.11)
    // sort de la liste pour la garder à 24. Date à poser au jour de la version finale.
    id: 'mode-debogage',
    date: '2026-11-23',
    version: '0.2.4',
    get title() { return t('Le mode débogage'); },
    get detail() { return t('Les mesures de tous tes écrans en direct : cadence, chargements, processeur, mémoire.'); },
    get more() {
      return [
        t('Allume-le dans Santé et sauvegardes : une ligne ou un panneau paraît sur l’écran de ton choix, le backglass par défaut, même pendant une partie, sans prendre la main à VPX.'),
        t('Tu vois la cadence de chaque écran et de VPX, les à-coups et leur cause probable, les temps de chargement, le processeur et la mémoire. Les mesures des 10 dernières minutes peuvent partir avec ton rapport.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › Santé et sauvegardes › Mode débogage'); },
    reach: { kind: 'system', id: 'debug-mode' },
  },
  {
    // Cadrage des tables choisi sur une image (23/11/2026) ; « Le Juke-box » (0.1.9) sort de la liste pour la garder
    // à 24. Date à poser au jour de la version finale.
    id: 'cadrage-des-tables',
    date: '2026-11-23',
    version: '0.2.4',
    get title() { return t('Le cadrage des tables, choisi sur ta table'); },
    get detail() { return t('Choisis comment les tables remplissent l’écran, en voyant ta propre table rendue par VPX.'); },
    get more() {
      return [
        t('Plein écran avec l’apron rogné, table entière avec des bandes, ou table élargie : chaque cadrage est montré sur une de tes tables, rendue par VPX sans rien afficher sur la borne.'),
        t('Chaque table peut aussi avoir le sien : un autre style, le POV fourni ou celui de la communauté, et un retour arrière. Les tables reprises d’une autre installation gardent le cadrage qu’elles avaient.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › VPX › Cadrage des tables'); },
    reach: { kind: 'system', id: 'vpx-framing' },
    beta: true,
  },
  {
    id: 'point-de-vue',
    date: '2026-11-22',
    version: '0.2.3',
    get title() { return t('Le point de vue de chaque table'); },
    get detail() { return t('Garde le cadrage de la borne, utilise le POV fourni avec la table ou importe le tien, table par table.'); },
    get more() {
      return [
        t('Dans « Gérer la table… › Point de vue », choisis le cadrage de la borne ou le POV de cette table. Tu peux aussi importer un fichier .pov ou le .ini d’un POV pour VPX 10.8, depuis Téléchargements, une clé USB ou un disque.'),
        t('Le POV importé est rangé avec la table et appliqué à elle seule. Une vue qui mettrait la table de travers sur la borne est refusée, avec la raison.'),
      ];
    },
    get where() { return t('Fiche d’une table › Gérer la table… › Point de vue'); },
    reach: { kind: 'sheet', part: 'pov' },
    beta: true,
  },
  {
    id: 'vpx-corrige',
    date: '2026-11-22',
    version: '0.2.3',
    get title() { return t('Le VPX corrigé de Cyber Pinball'); },
    get detail() { return t('Le VPX de Cyber Pinball corrige les saccades des PuP-Packs et améliore le cadrage des tables.'); },
    get more() {
      return [
        t('Cyber Pinball installe son VPX 10.8.1-5436 corrigé et son plugin PuP : un fronton plus lent ne bride plus le plateau et les grandes images animées des PuP-Packs ne bloquent plus le rendu.'),
        t('Le cadrage garde le haut du plateau visible, et le temps de rendu GPU permet au mode Auto d’adapter la qualité entre les parties. Les sources des correctifs sont publiées avec la version ; la fiche technique indique le VPX installé.'),
      ];
    },
    get where() { return t('Menu système › Aide et infos › Fiche technique'); },
    reach: { kind: 'system', id: 'tech-sheet' },
  },
  {
    // Pré-réglages de qualité de VPX (22/11/2026) ; « Vision 3D » (0.1.9) sort de la
    // liste pour la garder à 24. Date à poser au jour de la version finale.
    id: 'prereglages-vpx',
    date: '2026-11-22',
    version: '0.2.3',
    get title() { return t('Pré-réglages de qualité'); },
    get detail() { return t('Une belle image sans régler VPX : le mode Auto choisit la qualité qui convient à ta machine.'); },
    get more() {
      return [
        t('Auto part de ta carte graphique et de ton playfield, puis s’ajuste après chaque partie d’après le temps que la carte graphique met à dessiner une image : plus beau s’il reste de la marge, plus léger si elle peine.'),
        t('Ou choisis toi-même : Performance, Équilibré, Qualité ou Ultra. Un réglage changé à la main dans Réglages de VPX passe en Personnalisé : Cyber Pinball n’y touche plus.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › VPX › Pré-réglages'); },
    reach: { kind: 'system', id: 'vpx-presets' },
    beta: true,
  },
  {
    // Défis asynchrones (engagement, vague 2, 22/11/2026) ; « Collections et favoris » (0.1.8) sort de la
    // liste pour la garder à 24. Date à poser au jour de la version finale.
    id: 'defis',
    date: '2026-11-22',
    version: '0.2.3',
    get title() { return t('Les défis'); },
    get detail() { return t('Défie un joueur sur une table : 48 h pour battre ton score, chacun quand il veut.'); },
    get more() {
      return [
        t('Sur la fiche d’une table, « Jouer ensemble… › Défier un joueur… » : un ami ou un joueur classé sur la même version. Ton meilleur score est celui à battre ; essais illimités, et chacun peut encore monter le sien.'),
        t('À l’échéance, le plus haut score gagne 40 XP, puis « Revanche » d’un geste. Les défis arrivent même si tes bornes ne sont jamais allumées en même temps.'),
      ];
    },
    get where() { return t('Arène › Défis'); },
    reach: { kind: 'arena' },
  },
  {
    // Lunettes 3D (anaglyphe, 21/11/2026) ; « Le téléphone pilote tout » (0.1.8) sort de la liste pour
    // la garder à 24. Sélection de la finale validée le 22/11/2026.
    id: 'lunettes-3d',
    date: '2026-11-22',
    version: '0.2.3',
    get title() { return t('Lunettes 3D'); },
    get detail() { return t('La table en relief avec de simples lunettes rouge et cyan, et avec la Vision 3D si tu veux.'); },
    get more() {
      return [
        t('Mets des lunettes à filtres colorés : rouge / cyan, vert / magenta ou ambre / bleu. Le plateau sort de l’écran ; avec la Vision 3D, le relief suit aussi ta tête.'),
        t('Calibre tes lunettes aux boutons de la borne, un œil fermé à chaque fois : moins d’images fantômes, des couleurs plus justes.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › Réalité virtuelle et vision 3D › Lunettes 3D'); },
    reach: { kind: 'system', id: 'anaglyph' },
    beta: true,
  },
  {
    // Le médaillon Arène (21/11/2026, planche « Engagement ») ; « Les règles de chaque table » (0.1.8)
    // sort de la liste pour la garder à 24. Date à poser au jour de la version finale.
    id: 'arene',
    date: '2026-11-22',
    version: '0.2.3',
    get title() { return t('L’Arène'); },
    get detail() { return t('Un médaillon pour se mesurer aux autres : parties ouvertes, places à reprendre, ton niveau.'); },
    get more() {
      return [
        t('Dans la roue, à côté de la Communauté. Son affiche fait tourner tes records et les places qu’on vient de te prendre ; Start ouvre l’Arène, ses onglets se changent aux MagnaSave.'),
        t('En tête, ton niveau et le plus pressant (une place à reprendre, une partie qui t’attend), puis le classement mondial. Une partie que tu ouvres et que d’autres rejoignent rapporte des XP, une fois par groupe.'),
      ];
    },
    get where() { return t('Roue › Arène'); },
    reach: { kind: 'arena' },
  },
  {
    // Tables du jour et objectif à battre (engagement, 21/11/2026) ; « Vos tables d'une autre
    // installation » (0.1.7) sort de la liste pour la garder à 24. Date à poser au jour de la version finale.
    id: 'tables-du-jour',
    date: '2026-11-22',
    version: '0.2.3',
    get title() { return t('Les tables du jour'); },
    get detail() { return t('Les tables les plus jouées aujourd’hui, le record du jour et le joueur juste devant toi.'); },
    get more() {
      return [
        t('Dans le monde, ton pays ou entre amis : chaque table montre son record du jour, ta place et ce qu’il te manque. Start lance la table.'),
        t('La fiche d’une table dit qui battre, qui y joue en ce moment, et regroupe les parties à plusieurs dans « Jouer ensemble… ». Sans vidéo de chargement, l’objectif s’affiche aussi au lancement.'),
      ];
    },
    // Les classements sont passés dans l'Arène (21/11/2026) : son onglet « Du jour ».
    get where() { return t('Arène › Du jour'); },
    reach: { kind: 'community', door: 'daily' },
  },
  {
    // Dialogue avec l'équipe sur un rapport (21/11/2026) ; « Sauvegardes » (0.1.7) sort de la liste
    // pour la garder à 24. Date à poser au jour de la version finale (publier.mjs le rappelle).
    id: 'echanges-equipe',
    date: '2026-11-22',
    version: '0.2.3',
    get title() { return t('Un échange avec l’équipe'); },
    get detail() { return t('Envoie un rapport : l’équipe te répond sur la borne, et tu peux lui répondre.'); },
    get more() {
      return [
        t('Chaque rapport, plantage automatique compris, ouvre un échange. La réponse de l’équipe arrive avec une notification, dans tes messages en attente.'),
        t('Tes rapports partent avec ton pseudo, ou anonymement si tu le choisis : l’équipe peut te répondre dans les deux cas. Tout reste chiffré entre la borne et l’équipe.'),
      ];
    },
    get where() { return t('Menu système › Aide et infos › Retours et propositions › Mes échanges avec l’équipe'); },
    reach: { kind: 'system', id: 'feedback' },
  },
  {
    // Refonte du Menu système (0.2.2-essai), retenue pour les Nouveautés de la 0.2.2 (20/11/2026) ;
    // la ligne « Amis, de borne à borne » (0.1.4) sort de la liste pour la garder à 24.
    id: 'menu-systeme',
    date: '2026-11-20',
    version: '0.2.2',
    get title() { return t('Le Menu système, plus court'); },
    // La racine énumérée ici suit SYSTEM_ROOT_ENTRIES (news.test.ts) : l'Arène y est entrée le 21/11/2026.
    get detail() { return t('Huit lignes au plus par écran, neuf à l’ouverture, rangées dans l’ordre où l’on s’en sert.'); },
    get more() {
      return [
        t('Neuf rubriques dans l’ordre de l’usage : Tables, Ma borne, Téléchargements, Activité récente, Communauté, Arène, Juke-box, Aide et infos, Quitter ou éteindre. Les autres écrans n’ont pas plus de huit lignes.'),
        t('Ma borne réunit ce qui dépend de la borne : écrans, boutons, son, VPX, DMD et LED, VR. La Communauté est celle de la roue, et le Menu système rouvre la dernière rubrique choisie.'),
      ];
    },
    get where() { return t('Menu système'); },
    reach: { kind: 'system', id: 'borne' },
  },
  {
    // Rapport du 20/11/2026 (SSF introuvable) : la borne propose sa configuration du son.
    id: 'son-propose',
    date: '2026-11-20',
    version: '0.2.2',
    get title() { return t('Le son de la borne se règle presque seul'); },
    get detail() { return t('Cyber Pinball regarde ce qui est branché, propose la configuration du son et la vérifie avec toi.'); },
    get more() {
      return [
        t('L’étape « Son de la borne » lit les prises de la carte son et les haut-parleurs de tes écrans, puis propose quelques configurations, la plus probable en tête, avec un schéma de la borne.'),
        t('Essayer une configuration la vérifie paire par paire. Carte en stéréo dans Windows : le panneau Son s’ouvre et l’assistant attend le 5.1 ou le 7.1. Sinon, « Régler pas à pas » reste là.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › Configuration de la borne › Son de la borne'); },
    reach: { kind: 'system', id: 'cabinet' },
  },
  {
    // Demandé par un joueur sur Facebook (19/11/2026) : premier niveau, sans BAM.
    id: 'future-pinball',
    date: '2026-11-20',
    version: '0.2.1',
    get title() { return t('Future Pinball sur la roue'); },
    get detail() { return t('Tes tables Future Pinball (.fpt) à côté de tes tables VPX, lancées en un appui.'); },
    get more() {
      return [
        t('Cyber Pinball trouve Future Pinball sur ce PC et liste les tables de son dossier Tables ; Start en ajoute une, avec son nom et ses médias.'),
        t('La partie passe par BAM s’il est installé et revient à la roue quand tu quittes la table ; un appui long sur Exit la ferme.'),
        t('« Trouver une table en ligne » propose aussi ses tables : l’archive reçue est rangée dans le jeu, sans rien écraser.'),
      ];
    },
    get where() { return t('Menu système › Tables › Ajouter une table › Tables de Future Pinball'); },
    reach: { kind: 'system', id: 'add-table' },
    beta: true,
  },
  {
    // Reprise d'une autre installation par liens physiques NTFS (0.2.1-essai.15), retenue pour la
    // 0.2.1 en bêta (19/11/2026), à la place de la traduction des propositions.
    id: 'reprise-sans-duplication',
    date: '2026-11-20',
    version: '0.2.1',
    get title() { return t('Reprendre tes tables sans les dupliquer'); },
    get detail() { return t('Les tables de PinUP Popper, PinballX ou PinballY rejoignent la roue sans être dupliquées sur le disque.'); },
    get more() {
      return [
        t('Sur le même disque, tables, frontons, vidéos, PuP-Packs et ROM sont liés au lieu d’être copiés : aucune place en plus, et l’installation d’origine reste telle quelle.'),
        t('Chaque table arrive avec son PuP-Pack, sa ROM et ses médias. Avant d’installer, le plan d’ajout dit ce qui sera lié, ce qui sera copié et la place qu’il faut.'),
      ];
    },
    get where() { return t('Menu système › Tables › Ajouter une table › Depuis une autre installation'); },
    reach: { kind: 'system', id: 'add-table' },
    beta: true,
  },
  {
    // Lots 2 à 5 de la Communauté au téléphone (18/11/2026), la ligne ajoutée avec le dernier.
    id: 'communaute-telephone',
    date: '2026-11-18',
    version: '0.2.0',
    get title() { return t('La Communauté dans ton téléphone'); },
    get detail() { return t('Joueurs, profils, groupes, parties en direct, salons, classements et niveau, comme à la borne.'); },
    get more() {
      return [
        t('L’onglet Communauté du téléphone reprend celle de la borne : ouvre le profil d’un joueur, réponds à une demande d’ami, rejoins un groupe public, ouvre une partie en direct, choisis ton salon.'),
        t('Dans Scores : ton niveau et tes badges, les classements de toutes tes tables, et la cloche de l’Activité récente en haut.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › Télécommande du téléphone'); },
    reach: { kind: 'system', id: 'phone-remote' },
  },
  {
    // Demandé par un joueur (Retours et propositions, 18/11/2026) : réinstallé, il avait perdu son niveau.
    id: 'mon-compte',
    date: '2026-11-18',
    version: '0.2.0',
    get title() { return t('Ton compte te suit'); },
    get detail() { return t('Pseudo, niveau, badges et amis : tu retrouves tout sur un autre PC ou après une réinstallation.'); },
    get more() {
      return [
        t('Cyber Pinball garde d’office une copie de secours de ton compte sur ce PC, hors de son dossier : une réinstallation la retrouve et te propose de la reprendre.'),
        t('Note ton code de récupération, 24 mots ou leur QR à photographier, pour retrouver ton compte sur n’importe quel PC. Un mot de passe est possible aussi : ton pseudo devient ton identifiant, et le serveur ne garde qu’une copie chiffrée qu’il ne peut pas ouvrir.'),
      ];
    },
    get where() { return t('Menu système › Communauté › Mon profil › Mon compte'); },
    reach: { kind: 'system', id: 'account' },
  },
  {
    id: 'autres-vpx',
    date: '2026-11-18',
    version: '0.2.0',
    get title() { return t('Autres versions de VPX'); },
    get detail() { return t('Les tables qui tournent mieux avec VPX 10.8.0 se jouent avec lui, table par table.'); },
    get more() {
      return [
        t('Ajoute un VPX déjà installé sur ce PC (ceux des autres installations sont proposés d’office), puis choisis-le dans la fiche d’une table ou quand elle s’installe. Une table reprise d’une autre installation garde le VPX qui la jouait.'),
        t('Cyber Pinball le lance avec ses propres réglages ; la réalité virtuelle, le réglage de l’affichage et les parties entre amis restent avec le VPX de Cyber Pinball.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › VPX › Autres versions de VPX'); },
    reach: { kind: 'system', id: 'other-vpx' },
  },
  {
    // Ajoutée avant la 0.2.0 (18/11/2026) : la reprise de l'ancien DOF n'avait pas sa ligne.
    id: 'dof-repris',
    date: '2026-11-18',
    version: '0.2.0',
    get title() { return t('Ta configuration DOF reprise'); },
    get detail() { return t('Une borne venue d’un autre front-end retrouve ses LED et ses toys, sans rien refaire dans le configtool.'); },
    get more() {
      return [
        t('Cyber Pinball cherche l’ancien DOF sur les disques et montre ce qu’il a trouvé. « Reprendre la configuration de l’ancien DOF » copie ses fichiers du configtool et, s’il est cohérent, son Cabinet.xml, en sauvegardant ce qui était en place.'),
        t('Des LED adressables sans Cabinet.xml sont signalées avec le port probable de leur contrôleur, et des bandes pilotées par une Wemos D1 reçoivent d’office les réglages qu’attend son micrologiciel.'),
      ];
    },
    get where() { return t('Menu système › Ma borne › DMD et LED › LED et retours (DOF)'); },
    reach: { kind: 'system', id: 'dof' },
  },
  {
    // Ajoutée après coup (17/11/2026) : les niveaux étaient sortis en préversion sans leur ligne.
    id: 'niveaux',
    date: '2026-11-17',
    version: '0.1.14',
    get title() { return t('Niveaux'); },
    get detail() { return t('Tes parties, tes progrès, tes badges et la vie entre joueurs te font monter de niveau.'); },
    get more() {
      return [
        t('Chaque partie, chaque record battu, chaque classement de la semaine, chaque badge reçu et la vie entre joueurs rapportent des XP. Ton niveau monte et ne baisse jamais ; ta carte de joueur, en haut de l’écran des tables, le montre avec sa barre.'),
        t('Un badge reçu a son moment au retour de la partie, avec son animation et sa musique, et le passage de niveau a ses rayons. « Mon niveau » dit ce qui rapporte des XP et quels badges sont les plus proches.'),
      ];
    },
    get where() { return t('Communauté › Mon niveau'); },
    reach: { kind: 'level' },
  },
  {
    id: 'parties-instantanees',
    date: '2026-11-17',
    version: '0.1.14',
    get title() { return t('Parties en direct'); },
    get detail() { return t('Une partie en direct ouverte à tous, qui part d’elle-même dès qu’elle est complète.'); },
    get more() {
      return [
        t('Choisis une table et le nombre de joueurs, de 2 à 4 : ta partie s’affiche chez tous les joueurs en ligne, et part toute seule dès qu’elle est complète.'),
        t('Amis ou non, il suffit d’avoir la même version de la table. Tu es prévenu de chaque arrivée, et une partie s’ouvre aussi depuis la fiche d’une table.'),
      ];
    },
    get where() { return t('Communauté › Parties en direct'); },
    reach: { kind: 'community', door: 'instant' },
  },
  {
    id: 'pinball-fx',
    date: '2026-11-16',
    version: '0.1.13',
    get title() { return t('Pinball FX sur la roue'); },
    get detail() { return t('Tes tables Pinball FX, achetées sur Steam ou Epic, à côté de tes tables VPX.'); },
    get more() {
      return [
        t('Choisis les tables que tu possèdes : elles rejoignent la roue avec leurs médias, tes collections, tes favoris et tes statistiques.'),
        t('Un appui long sur Exit ferme le jeu et ramène au front-end. Ce que Pinball FX ne fournit pas (scores, partie avec un ami, réalité virtuelle) reste grisé sur la fiche, avec la raison.'),
      ];
    },
    get where() { return t('Menu système › Tables › Ajouter une table › Tables de Pinball FX'); },
    reach: { kind: 'system', id: 'add-table' },
    beta: true,
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
