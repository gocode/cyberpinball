// Types de l'écran des tables (library.ts) : ce que le front-end lui fournit (LibraryHost), les
// entrées du Menu système, les écrans décrits (Built, Row, Section, Action) et l'état interne des
// écrans (Screen, Editor). Sortis de library.ts tels quels ; library.ts les réexporte.

import type { PhoneRemote, RemoteBar } from './phone-remote';
import { type RemoteWording } from './phone-remote-menu';
import { type ScoreboardView } from './scoreboard-menu';
import type { RankingView } from './table-rankings';
import type { TableBoard } from './table-scores';
import type { RomVolumeView } from './rom-volume';
import { BrowserWindow, type Input, type Rectangle } from 'electron';
import {
  type SystemGroupId,
  type TableContents,
  type TablePupPack,
  type WaitItem,
  type DownloadJob,
  type CompanionReport,
  type ImportLinks,
  type SourceFiles,
  type ImportSpace,
  type DriveInfo,
  type TechFacts,
  t,
  type Finding,
  type AddScreenId,
  type IconName,
  type AvatarView,
  type FlagView,
  type ImportPlan,
  type KnownTable,
  type NavigationKeys,
  type ObservedDisplay,
  type PlayfieldOrientation,
  type PupCabinet,
  type RoleId,
  type RomLibraryScan,
  type ScriptFacts,
  type SheetPageType,
  type TableEntry,
  type VpsDb,
  type GuestDoor,
  type GuestMode,
  type RecordedRole,
  type RecordingSettings,
  type RankingScope,
  type ScorePeriod,
  type VrNetworkFacts,
} from '@cyberpinball/core';
import { type PreparedImport } from './archives';
import { type ScriptResult } from './vbs';
import type { JukeboxPreview } from './jukebox-menu';
import { type MediaDbGameOffer } from './media-download';
import { type MediaView } from './library-medias';
import type { RomMusic } from './rom-music';
import { type HealthView } from './health';
import { type DisplayLinkFacts } from './tech-facts';
import { type ReportFriend } from './tech-sheet';
import type { FeedbackService } from './feedback-service';

export interface LibraryHost {
  /** Musique tirée des ROM (rom-music.ts) : repli de la musique du jeu, et source « Musique de la ROM ». */
  romMusic?(): RomMusic | undefined;
  /** Le réseau du casque pour la santé de la borne (vr-reseau.ts) ; undefined sans casque relevé. */
  vrNetwork?(): VrNetworkFacts | undefined;
  /** Fiche technique : ce que l'application sait d'elle-même (mode, borne dédiée, réseau des amis…). */
  techApp?(): Partial<NonNullable<TechFacts['app']>>;
  /** Connexion et fréquences des écrans (win-displays, probeDisplayLinks). */
  displayLinks?(): DisplayLinkFacts[];
  /** Amis à qui envoyer le résumé d'un rapport ; undefined : réseau des amis coupé. */
  reportFriends?(): ReportFriend[] | undefined;
  /** Écrit à un ami dans la messagerie (le résumé d'un rapport). */
  sendFriendReport?(key: string, text: string): void;
  /** Noms que le rapport remplace : le joueur, la borne, ses amis. */
  reportNames?(): string[];
  /** Le service des retours (feedback-service.ts) : propositions, votes, rapports privés. */
  feedbackService?: FeedbackService;
  /** Lecteurs de la borne (clés USB pour le rapport). */
  listDrives?(): Promise<DriveInfo[]>;
  ejectDrive?(drive: DriveInfo): Promise<boolean>;
  root: string | undefined;
  dataDir: string;
  vpxExe(): string | undefined;
  tables(): TableEntry[];
  /** Relit les tables et sélectionne celle-ci dans le menu. */
  reload(selectFile?: string): void;
  /** La gestion des tables prend la main sur le menu (phase « library »). */
  enter(): void;
  /** Retour au menu. */
  leave(): void;
  play(table: TableEntry): void;
  /** Réglages de VPX propres à cette table (écran des réglages, settings.ts). */
  tableSettings?(table: TableEntry): void;
  /** Volume de la ROM de la table (rom-volume.ts) : la fiche le dit, le médecin le signale bas. */
  romVolume?(table: TableEntry): RomVolumeView;
  /**
   * « Jouer avec un ami » (live-game-menu.ts) : l'entrée de la fiche, active quand un ami est en
   * ligne, grisée avec sa raison sinon ; `back` rouvre la fiche.
   */
  playWithFriend?(table: TableEntry, back: () => void): Action;
  /** « Partie instantanée » (instant-menu.ts) : ouverte à tous ; grisée avec sa raison (partage coupé, Pinball FX). */
  instantGame?(table: TableEntry, back: () => void): Action;
  /** « Tableau des scores » (table-scores.ts) : le tableau d'une période. */
  scores?(table: TableEntry, period: ScorePeriod): TableBoard;
  /** Classements en réseau d'une table (table-rankings.ts) : amis, pays, monde. */
  rankings?(table: TableEntry, scope: Exclude<RankingScope, 'cabinet'>, period: ScorePeriod): RankingView;
  /** Masquer sur cette borne un score des classements, ou tous ceux d'un joueur (social-net.ts). */
  hideScore?(id: string): void;
  hidePlayer?(key: string): void;
  /** « Ajouter aux favoris » / « Retirer des favoris » (collections.ts : User.Favorite du .info). */
  favorite?(table: TableEntry, on: boolean): void;
  /** « Ajouter à une collection… » : les collections personnelles de la table (collections-menu.ts) ; `back` rouvre la fiche. */
  tableCollections?(table: TableEntry, back: () => void): Action;
  /** « DMD sur la roue » (menu-dmd.ts) : le DMD du menu affiché ou masqué pour cette table, et sa place ; `back` : l'écran d'où on l'a ouvert. */
  menuDmd?: { detail(table: TableEntry): string; open(table: TableEntry, back: () => void): void };
  /**
   * Partie de réglage de l'affichage (« Régler l'affichage en partie ») : VPX démarre la table
   * menu ouvert sur le cadrage, sans statistiques ; undefined si elle n'a pas démarré pour une
   * raison que le menu affiche (écrans à revoir).
   */
  adjustDisplay?(table: TableEntry): Promise<{ ok: boolean; message?: string } | undefined>;
  /**
   * « Jouer et enregistrer » : la partie, l'enregistrement armé (game-recording.ts). Au retour,
   * le menu ouvre l'écran de l'enregistrement (recording.result).
   */
  playAndRecord?(table: TableEntry, settings: RecordingSettings): void;
  /** Écrans que la borne peut filmer en plus du plateau : fronton, DMD (ceux qu'elle a). */
  recordableRoles?(): RecordedRole[];
  /** Journal de VPX (vpinball.log), lu par le médecin pour les PuP-Packs. */
  vpxLogFile?(): string | undefined;
  /** « Dossier PinUP Player » de VPX ([Plugin.PUP] PUPFolder, VPinballX.ini de la configuration active) : le plugin y cherche aussi les packs. */
  pupFolder?(): string | undefined;
  /** Playfield de la borne et VPinballX.ini actif : le médecin y juge le sens d'une table. */
  playfieldOrientation?(): PlayfieldOrientation | undefined;
  quit(): void;
  /** Touches des boutons de la borne (flippers, Start, Exit), avec celles d'un clavier. */
  keys(): NavigationKeys;
  /** Touches qui basculent entre la liste de contenu d'un écran et ses actions : les MagnaSave, F6 (zoneSwitchKeys). */
  zoneKeys?(): string[];
  windows(): Map<RoleId, BrowserWindow>;
  /** Le menu est au bureau (playfield en largeur) plutôt qu'en borne (frontend.ts, playfieldLandscape). */
  landscape?(): boolean;
  /**
   * Écran du navigateur intégré (fenêtre « Récupérer »), en coordonnées Electron, et ce que
   * son bandeau en dit (écran choisi pas branché, playfield tourné).
   */
  browserScreen?(): { bounds: Rectangle; notice?: string; label?: string } | undefined;
  /** Pré-écoute d'un morceau en ligne, sur le fronton (jukebox-player.ts) ; absente : pas proposée. */
  jukeboxPreview?: JukeboxPreview;
  /** Touche qui écoute un morceau à l'import en borne : le MagnaSave droit, s'il est relevé avec le gauche. */
  listenKeys?(): string[];
  /** Le playfield reprend le premier plan (après une fenêtre d'un autre programme, comme Edge) : les boutons de la borne lui reviennent. */
  takeForeground?(): void;
  /** Nom Windows de la sortie audio du menu (menuAudioOutput), pour le son des pages de « Récupérer ». */
  audioOutput?(): string | undefined;
  /** Télécommande du téléphone (phone-remote.ts) ; absente : pas de QR code, ni écran de la télécommande. */
  phoneRemote?: PhoneRemote;
  /** Fichier qui arrive du téléphone (frontend.ts), pour la barre de l'écran de la télécommande. */
  phoneUpload?(): { name: string; received: number; size: number } | undefined;
  /** Choix de l'écran du navigateur intégré pour la configuration active ; Retour mène à `back`. */
  openBrowserScreen?(back: () => void): void;
  broadcast(): void;
  /** Dossier Téléchargements surveillé pour la liste d'attente (essais : un dossier du bac à sable). */
  downloadsDir?(): string;
  /** Bureau, raccourci du sélecteur de fichiers (essais : un dossier du bac à sable). */
  desktopDir?(): string;
  /** Télécharge et installe VPX, progression à l'écran (parcours « Ce qu'il manque pour jouer »). */
  installVpx?(): void;
  /** Assistant de la borne : écrans, boutons, son. */
  setup?(): void;
  /** Écrans branchés (displays.ts) : la santé de la borne les compare à la configuration retenue. */
  displays?(): ObservedDisplay[];
  /** Version de VPX installée et active ; undefined : pas installé. */
  vpxVersion?(): string | undefined;
  /** Espace d'un lecteur (essais : lecteurs simulés) ; sans lui, celui du vrai lecteur. */
  diskSpace?(dir: string): { free: number; total: number } | undefined;
  /** Mode invité : seules la fiche, ses pages et les actions à porte ouverte passent (guestmode.ts). */
  guest: Pick<GuestMode, 'active' | 'allows' | 'knock'>;
  /**
   * « Jouer en local » (localplay.ts) : vrai, le Menu système perd la partie sociale (LOCAL_PLAY_HIDDEN),
   * la fiche « Jouer avec un ami » et « Partie instantanée », le tableau des scores ses classements en ligne.
   */
  localPlay?(): boolean;
  /**
   * Un téléchargement fini que son écran n'a pas repris : au menu des tables, la notification du
   * menu le dit (menu-notices.ts) ; sur un écran plein, un bandeau bref (`text`).
   */
  notify?(text: string, job?: DownloadJob): void;
  /** La file des téléchargements a changé (progression, état) : la pastille ou l'écran se redessinent. */
  downloadsChanged?(): void;
  /** Juke-box : le lecteur, ouvert sur cette playlist (« Exit » de la gestion du Juke-box y revient). */
  jukeboxPlayer?(playlist?: string): void;
  /** Juke-box : ses réglages (sorties du son…), ouverts depuis sa gestion ; `back` y ramène. */
  jukeboxSettings?(back: () => void): void;
  /** Juke-box : playlists ou bibliothèque changées (jukebox-library.ts). */
  jukeboxChanged?(): void;
  /** Essais sans opérateur : ce qu'une capture de fenêtre ne voit pas (la vue du lecteur YouTube posée sur le fronton). */
  captureExtras?(): Promise<{ name: string; png: Buffer }[]>;
}

/** Entrée du menu système (Exit dans le menu). La session des réglages peut y ajouter la sienne. */
/**
 * Badge d'une entrée de menu, une pastille après son libellé (« BÊTA » : fonction en plein essai).
 * Le texte vient de menuBadgeLabel, jamais du libellé : il ne compte ni dans les recherches par
 * libellé ni dans l'identité de l'entrée.
 */
export type MenuBadge = 'beta';

/** Texte d'un badge, dans la langue de l'interface. */
export function menuBadgeLabel(badge: MenuBadge): string {
  return { beta: t('BÊTA') }[badge];
}

export interface SystemItem {
  label: string;
  detail?: string;
  /** Pastille après le libellé, dans tous les états de l'entrée (activée, désactivée, indisponible). */
  badge?: MenuBadge;
  /** Icône de l'entrée (registre app/renderer/icons.js) : chaque entrée du menu système a la sienne. */
  icon: IconName;
  /** Quelque chose attend l'utilisateur ici (une mise à jour disponible…) : pastille rouge, jusque sur la roue dentée. */
  attention?: boolean;
  /** « quiet » : l'entrée est indisponible, grisée ; son détail dit pourquoi. */
  tone?: Tone;
  /** Raccourci clavier qui fait la même chose sans passer par le menu (ActionShortcut). */
  shortcut?: ActionShortcut;
  run: () => void;
}

/**
 * Entrée du menu système fournie par l'application : son nom et son icône viennent de l'arbre
 * des rubriques (SYSTEM_ITEMS, core) ; `label` seulement pour un nom qui change (la langue).
 */
export type ProvidedSystemItem = Omit<SystemItem, 'label' | 'icon'> & { readonly label?: string };

/**
 * Raccourci clavier d'une entrée de menu : les touches à montrer, une touche cerclée chacune
 * (« Ctrl », « Maj », « D »), et ce qui le reconnaît. Les deux viennent de la définition du
 * raccourci (SHORTCUTS, touches de l'interface) : ce qui est affiché est ce qui marche.
 */
export interface ActionShortcut {
  keys: string[];
  matches(input: Input): boolean;
}

export type UiAction =
  /** `id` : identité de l'action cliquée (focus.ts), pour valider cet élément même si la liste a bougé. */
  | { type: 'activate'; index: number; id?: string }
  /** Le curseur posé sur cet élément sans l'activer (téléphone : les actions d'une playlist de la gestion). */
  | { type: 'focus'; index: number; id?: string }
  | { type: 'editor'; index: number }
  /** Texte arrivé sans touche dans la page (panneau des emojis de Windows, méthode de saisie) : au point d'insertion. */
  | { type: 'editor-text'; text: string }
  | { type: 'drop'; paths: string[] }
  | { type: 'key'; code: string }
  /** Bouton « ‹ Retour » de l'en-tête : comme Exit, sans redescendre au bas de la liste. */
  | { type: 'back' }
  /** Roue dentée du menu : menu et configuration, quels que soient les boutons. */
  | { type: 'config' }
  /** Pastille des téléchargements du menu des tables : le gestionnaire de téléchargements. */
  | { type: 'downloads' }
  /** Pastille des amis en ligne, notification d'un ami (Mes amis) ou d'une demande (Demandes d'amis). */
  | { type: 'friends' }
  | { type: 'friend-requests' }
  /** Notification de la partie entre amis (un invité accepte, la partie est finie) : l'écran de la partie. */
  | { type: 'live-game' }
  /** Notification d'un message : le fil de son auteur (chat-menu.ts). */
  | { type: 'messages' }
  /** Pastille des messages en attente (coin d'état) : l'écran Messages en attente (inbox-menu.ts). */
  | { type: 'inbox' }
  /** Notification d'un « J'aime » : Mon profil public (profile-menu.ts). */
  | { type: 'my-profile' }
  /** Carte du joueur du coin d'état : Mon niveau (level-menu.ts) ; pastille des badges : Mes badges. */
  | { type: 'level' }
  | { type: 'badges' }
  /** Le moment d'un badge ou d'un niveau a été vu (level-tracker.ts). */
  | { type: 'level-seen' }
  /** Notification d'une mention dans un salon : ce salon (rooms-menu.ts). */
  | { type: 'rooms' }
  /** Notification d'un signalement (modérateur) : la file des signalements (rooms-menu.ts). */
  | { type: 'moderation' }
  /** Notification d'un groupe (message, invitation) : ce groupe, ou l'invitation (groups-menu.ts). */
  | { type: 'groups' }
  /** Résumé « 4 nouveautés » : Activité récente, qui dit chacune en entier. */
  | { type: 'activity' }
  /** Repère de la liste de contenu (« Sortir de la liste », « Revenir à la liste ») : comme MagnaSave. */
  | { type: 'zone' }
  /** Mesure du texte de l'écran par le rendu (zone de lecture, reading.ts) : `key` désigne l'écran mesuré. */
  | { type: 'reading'; key: number; overflow: boolean; top: boolean; bottom: boolean }
  /** Recadrage d'un avatar à la souris (Built.crop) : le cadre glissé (`dx`, `dy` en parts de la largeur et de la hauteur de l'image), molette (`zoom` en crans). */
  | { type: 'crop'; dx?: number; dy?: number; zoom?: number }
  /** Repère de la collection (collection suivante) ou ligne de la liste des collections (celle-ci). */
  | { type: 'collections'; step?: number; id?: string }
  | { type: 'wheel'; offset: number }
  /** Juke-box (jukebox-player.ts) : une ligne de la liste, Start, une playlist voisine, Exit. */
  | { type: 'jukebox'; op: 'row' | 'start' | 'playlist' | 'exit' | 'manage' | 'up' | 'shuffle' | 'repeat' | 'pause' | 'seek-to' | 'wheel' | 'page'; key?: string; dir?: number; fraction?: number };

export type Tone = 'error' | 'warning' | 'info' | 'ok' | 'quiet';
export interface Row {
  /** Libellé à gauche, dans sa colonne (Fiche technique, Section.kind 'spec') : « Processeur ». */
  label?: string;
  text: string;
  detail?: string;
  tone?: Tone;
  badges?: string[];
  /**
   * Pastille d'état en tête de la ligne du détail (Retours et propositions : PROPOSAL_STATUS_VIEW) :
   * icône et mot, à la couleur de son ton ; contour, fond plein ou pointillés selon `fill`. Sous le
   * texte, toutes au même bord gauche d'une ligne à l'autre.
   */
  status?: { text: string; icon: IconName; tone: 'neutral' | 'info' | 'warning' | 'ok' | 'quiet'; fill: 'outline' | 'solid' | 'dashed' };
  /** Ligne rattachée à une action : surlignée quand l'action est choisie. */
  action?: number;
  /** Ligne à choisir (un fichier, un élément de la liste d'attente) : son action n'est pas répétée dans la liste des actions. */
  pick?: boolean;
  /** Icône devant le texte (registre app/renderer/icons.js). */
  icon?: IconName;
  /** Un pays : son drapeau à la place de l'icône. */
  flag?: FlagView;
  /** Un emoji en grand à la place de l'icône (les réactions : « 👍 », puis son mot en texte). */
  emoji?: string;
  /** Repère neutre (filet clair) : l'emplacement ouvert, un fichier coché ; jamais en vert, réservé au choix courant. */
  current?: boolean;
  /** Seconde ligne, mot et signe : à quoi sert un fichier (« ✓ Installé avec… », « ! À installer… »). */
  note?: { text: string; sign: string; tone: Tone };
  /** Barre d'un téléchargement sous la ligne (Téléchargements) : `value` de 0 à 1, absente si la taille est inconnue. */
  progress?: { value?: number; tone?: Tone; busy?: boolean };
  /** Badges d'un joueur (profil public) : chacun dessiné dans sa forme et sa rareté (niveau.js), son nom dessous. */
  medals?: { icon: IconName; rarity: string; label: string; /** XP que le badge rapporte, montrés sous son nom. */ xp?: number }[];
  /**
   * Le badge dessiné à gauche de la ligne, à la place de l'icône (Mes badges, Badges les plus
   * proches) : dans sa forme et sa rareté (niveau.js) ; reçu, il brille ; pas encore, il est gris et éteint.
   */
  medal?: { icon: IconName; rarity: string; earned: boolean };
  /** Schéma de l'écran du DMD à droite de la ligne (« Écran du DMD ») : FullDMD ou DMD seul en bande. */
  figure?: 'fulldmd' | 'dmd';
  /** Schéma des manettes du casque à gauche (légende du menu du casque) : ces commandes en vert ; vide, une case vide. */
  controls?: string[];
  /** Pastille d'un joueur devant le texte (avatar.ts) : son image, sinon ses initiales ; à la place de l'icône. */
  avatar?: AvatarView;
  /** Pastilles des joueurs d'une partie, en ligne après le texte (historique des parties). */
  avatars?: AvatarView[];
  /** Pas encore lue (Activité récente) : la pastille rouge des entrées du menu, après le texte. */
  unread?: boolean;
  /**
   * Vignette carrée à gauche (Juke-box : pochette, miniature) : une adresse cyber-media:, ou le nom
   * d'une icône dessinée à sa place quand il n'y a pas d'image.
   */
  thumb?: string;
  /** Icône à la place d'une vignette illisible (« music » sans elle, pour le Juke-box). */
  thumbIcon?: string;
  /** Valeur courte à droite de la ligne (« 1080p », « 4:12 », « 21 / 24 retenus »), jamais coupée. */
  aside?: string;
  /** Icône devant cette valeur (le pouce des « J'aime » devant leur nombre). */
  asideIcon?: IconName;
  /** Seconde ligne de détail, plus discrète (dernière synchro, raison d'une indisponibilité). */
  sub?: string;
  /** Case devant la ligne : cochée, vide, ou barrée (sautée, refusée : on ne peut pas la cocher). */
  check?: 'on' | 'off' | 'skip';
  /**
   * Numéro dans la case (vérification du code de récupération : l'ordre des mots choisis). Cochée,
   * le numéro à la place de la coche ; vide, le numéro que la ligne prendrait, montré en pâle tant
   * qu'elle est sous le curseur : on voit d'avance que ce mot deviendra le n° 2.
   */
  checkRank?: number;
  /**
   * Fil de la messagerie (chat-menu.ts, section `kind: 'chat'`) : bulle reçue (à gauche), envoyée (à
   * droite), en attente (pointillés) ou non remise, carte d'un évènement de la borne (au centre), ou
   * séparateur de jour. Les badges sont les réactions posées sur le message, sous la bulle.
   */
  bubble?: 'in' | 'out' | 'pending' | 'expired' | 'card' | 'day';
  /**
   * Bulle qui répond à un message (messages-citations.ts) : la citation au-dessus de son texte, l'auteur
   * cité et l'extrait. `missing` : la mention discrète d'un original disparu ; `action` : la citation est un
   * arrêt du curseur à elle, Start (ou un clic) ramène au message cité.
   */
  quote?: { name: string; text: string; missing?: string; action?: number };
  /** Le texte d'une bulle en morceaux : les mentions mises en évidence (`me` : c'est moi qu'on cite, plus fort). */
  pieces?: { text: string; mention?: 'me' | 'other' }[];
  /**
   * Ligne d'un salon (rooms-menu.ts), à l'ancienne : l'heure, le drapeau, « <pseudo> » à la teinte de
   * sa clé, le texte. `kind` : une ligne, une action (/me), une ligne qui me cite, la mienne, ou une
   * ligne de service (arrivée, départ) plus discrète. `reactions` : ses pastilles de réactions
   * (« 👍 2 »), sous le texte ; `mine` : celle que j'ai posée, cerclée.
   */
  log?: { time: string; nick?: string; hue?: number; text: string; kind: 'line' | 'me' | 'mention' | 'own' | 'sys' | 'masked'; flag?: FlagView; reactions?: { text: string; mine: boolean }[] };
  /**
   * « En train d'écrire » (typing.ts), en bas d'un fil ou d'un journal : un badge par joueur (avatar,
   * pseudo, trois points animés) ; `more`, les autres au-delà des badges (« +2 »). `text` dit la même
   * chose en toutes lettres, pour les lecteurs d'écran. Jamais choisi par le curseur.
   */
  typing?: { players: { name: string; avatar: AvatarView }[]; more?: number };
  /**
   * Ligne de la chronologie des Nouveautés (news-menu.ts) : la date et la version, dites sur la
   * première ligne de leur jour seulement (`first`), un petit aperçu s'il y en a un (adresse relative
   * à la page : nouveautes/<id>-<langue>.webp), ses badges (« Nouveau », « BÊTA »), et ce que fait Start
   * quand elle est choisie.
   */
  news?: {
    date: string;
    version: string;
    first: boolean;
    last: boolean;
    preview?: string;
    unread?: boolean;
    badges: { text: string; kind: 'new' | 'beta' }[];
    start?: string;
    /** Le résumé des réactions des joueurs : les trois emojis les plus choisis, le total, et si j'ai réagi (`label` le dit en toutes lettres). */
    reactions?: { emojis: string[]; total: number; mine: boolean; label: string };
  };
}
export interface Section {
  title?: string;
  /**
   * Liste d'options (deux ou trois réglages au choix, « Ce que montre cet écran ») : ses lignes à
   * choisir ne forment pas une liste de contenu (listzones.ts), Exit y revient en arrière.
   */
  options?: boolean;
  /** Rôle de la section, pour la mise en page d'un écran (classe kind-<kind>) : « places », « entries »… */
  kind?: string;
  rows: Row[];
  more?: number;
  /** Section de la colonne latérale (les choix d'un import) : à droite au bureau, sous le reste en borne. */
  side?: boolean;
}
export interface Action {
  label: string;
  detail?: string;
  tone?: Tone;
  /** Icône devant le libellé (registre app/renderer/icons.js) ; dans un même écran, deux actions n'ont jamais la même. */
  icon?: IconName;
  /** Un pays (« Mon pays ») : son drapeau dans la colonne des icônes. */
  flag?: FlagView;
  /** Pastille rouge à côté du libellé : cette action attend l'utilisateur. */
  attention?: boolean;
  /** Badge après le libellé (MenuBadge). */
  badge?: MenuBadge;
  /** Raccourci clavier de l'action, montré à droite du libellé ; il la déclenche aussi depuis son menu. */
  shortcut?: ActionShortcut;
  /** Porte de l'action en mode invité (GUEST_DOORS) : sans porte, ou porte fermée, l'invité ne la voit pas. */
  door?: GuestDoor;
  /**
   * Identité stable de l'élément (une proposition, un fichier) : le curseur le suit quand
   * la liste change, et un clic le valide où qu'il soit (focus.ts). Sans clé, le libellé
   * sert d'identité s'il est unique dans l'écran.
   */
  key?: string;
  /** Issue vers le web de cet écran d'ajout ou de choix (« Chercher sur le web… », ADD_SCREENS). */
  web?: AddScreenId;
  /**
   * Page web de l'élément (une ligne des crédits) : tant qu'il est choisi, son QR code s'affiche
   * sous les actions, pour l'ouvrir aussi sur le téléphone.
   */
  qr?: {
    url: string;
    title: string;
    /**
     * Un QR qui n'est pas une page (le code de récupération du compte : ses mots en texte) : `url` est
     * le texte encodé, `caption` ce qui s'écrit sous le QR à sa place, `hint` à quoi il sert.
     */
    caption?: string;
    hint?: string;
  };
  /**
   * Page web hors de la borne (« Nous suivre ») : à la télécommande, la ligne est un lien que le
   * téléphone ouvre lui-même, au lieu d'envoyer Start à la borne. https seulement (remote-menus.ts).
   */
  link?: string;
  run: () => void | Promise<void>;
}

/** Action de la fiche : chacune déclare sa porte, ouverte ou fermée à l'invité (le compilateur l'exige). */
export type SheetAction = Action & { door: GuestDoor };
/** Écran décrit : titre, sections, actions (flippers pour choisir, Start pour valider) et retour (Exit). */
export interface Built {
  heading: string;
  /** Icône du titre : celle de l'entrée qui a ouvert l'écran, pour s'y retrouver. */
  icon?: IconName;
  /** Pastille du joueur dont parle l'écran (fiche d'un ami), devant le titre à la place de l'icône. */
  avatar?: AvatarView;
  /** Fiche d'une table en favori : l'étoile blanche près du titre. */
  favorite?: boolean;
  subheading?: string;
  lead?: string;
  sections: Section[];
  actions: Action[];
  back: () => void;
  /** Cartes des médias d'un jeu, chacune rattachée à une action (library-medias.ts). */
  media?: MediaView;
  /** Fichiers glissés sur la fenêtre quand cet écran est affiché ; sans lui, c'est un ajout de table. */
  drop?: (paths: string[]) => void;
  /** Mise en page propre à l'écran (classe lib-<variant>) : « files » (fichiers d'une table), « facts » (libellé et valeur). */
  variant?: string;
  /** Parcours « Ce qu'il manque pour jouer » (journey.ts) : progression et étapes numérotées, à la place des sections. */
  journey?: JourneyView;
  /** Santé de la borne (health.ts) : bilan et lignes, chacune rattachée à son action, à la place des sections. */
  health?: HealthView;
  /** Tableau des scores d'une table (scoreboard-menu.ts) : onglets des périodes et lignes, à la place des sections. */
  scoreboard?: ScoreboardView;
  /**
   * Onglets en tête de la liste (Joueurs en ligne : les filtres) : chacun ouvre son action, qui n'est
   * pas répétée dans la colonne des actions. L'onglet ouvert en bleu (le vert reste au choix) ; un
   * onglet qui ne peut rien montrer reste visible, grisé, sa raison à la place du nombre.
   */
  tabs?: { label: string; count: string; current: boolean; disabled?: boolean; action: number; flag?: FlagView }[];
  /** Bandeau d'aide propre à l'écran (sélecteur de fichiers : Exit remonte d'un dossier). */
  hint?: string;
  /** Intitulé des actions de l'écran, quand elles portent sur un élément choisi (« Néon nocturne · playlist mixte »). */
  actionsTitle?: string;
  /**
   * Interface propre (gestion du Juke-box) : son nom en tête à droite, à la place de la roue dentée,
   * et la barre de ses commandes (boutons de la borne ou touches du clavier) à la place du bandeau
   * d'aide ; ni bouton « Retour » en tête ni bandeau de la liste. Le chemin d'où l'on vient (« Juke-box ›
   * Néon nocturne ») sous le titre.
   */
  app?: { name: string; trail?: string };
  /** Recadrage d'une image (avatar-menu.ts) : l'image, le carré gardé et l'aperçu, à la place des sections. */
  crop?: CropView;
  /** Télécommande du téléphone (phone-remote-menu.ts) : le QR code, le code à comparer ou le téléphone connecté, en tête du contenu. */
  remote?: RemoteBar;
  /** Phrases propres à cet écran pour le bloc du téléphone (remoteBlock). */
  remoteWording?: RemoteWording;
  /**
   * L'écran montre le bloc de la télécommande du téléphone (son QR code à viser, puis le téléphone
   * relié) sans en être l'écran : la télécommande s'éveille tant qu'il est affiché, et le moteur
   * remplit `remote` lui-même (« Écrire dans le salon »).
   */
  phone?: true;
  /**
   * Le bloc du téléphone en bande, à la taille de celle du clavier à l'écran, après les sections
   * plutôt qu'en tête (« Écrire dans le salon », 13/11/2026 : le QR ne prend pas la place des
   * derniers messages).
   */
  phoneBand?: true;
  /**
   * Ce que Start fait sur un élément de la liste de contenu (« cocher ou décocher »), dit par le
   * bandeau d'aide tant qu'on y est ; sans lui, « valider ». Une liste de cases à cocher le dit :
   * sinon rien n'indique qu'on y coche (la ROM d'un ami, 01/11/2026).
   */
  listStart?: string;
  /** Bandeau d'aide de la liste de contenu, entier, quand MagnaSave y fait autre chose que changer de zone (Joueurs en ligne : le filtre suivant). */
  listHint?: string;
  /**
   * Commandes de plus dans la liste de contenu, dites par la barre des commandes (pré-écoute : MagnaSave
   * droit, flipper tenu). `first` : juste après les flippers, bien en vue ; un MagnaSave droit pris ainsi
   * fait dire « MagnaSave gauche » à la bascule des zones.
   */
  listCommands?: { key: string; desk: string; text: string; first?: boolean }[];
  /**
   * Touches propres à l'écran, avant la navigation (DMD sur la roue : une ligne ouverte prend les
   * flippers pour déplacer les points) ; true : la touche est prise, l'écran se redessine.
   * Les appuis seulement, sauf `keysUp`.
   */
  keys?: (input: Input) => boolean;
  /**
   * `keys` reçoit aussi les relâchements (pré-écoute du Juke-box : la fin d'un flipper tenu). À
   * demander exprès : un écran qui ne les attend pas prendrait le relâchement du Start qui vient
   * d'ouvrir une ligne pour sa validation (DMD sur la roue, 12/11/2026).
   */
  keysUp?: boolean;
  /**
   * Une nouveauté agrandie (news-menu.ts), à la place des sections : son grand aperçu (adresse relative
   * à la page, nouveautes/<id>-<langue>.webp), son texte entier et où la trouver ; `note` : la ligne
   * d'état sous ses réactions (Section.kind « news-reactions », rendue dans la carte).
   */
  newsPage?: { preview?: string; lines: string[]; where: string; note?: string };
}

/** Ce que le rendu montre d'un recadrage (app/renderer/library.js, renderCrop). */
export interface CropView {
  /** Adresse cyber-media:// de l'image de travail. */
  src: string;
  width: number;
  height: number;
  /** Carré gardé, en parts de la largeur et de la hauteur de l'image (cropBox, avatar.ts). */
  box: { left: number; top: number; width: number; height: number };
  /** Légende de l'aperçu (« Ce que verront vos amis »). */
  caption: string;
  /** Glisser et molette sur l'image (UiAction « crop ») ; le rendu ne fait que transmettre. */
  input(gesture: { dx?: number; dy?: number; zoom?: number }): void;
}

/** Ce que le rendu montre du parcours d'une table (app/renderer/library.js, renderJourney). */
export interface JourneyView {
  /** « Étape 3 sur 4 » et « 2 étapes réglées · 1 indispensable à faire · 1 amélioration proposée ». */
  position: string;
  summary: string;
  /** Ce qui vient de se passer : fichier reçu, réparé, installé. */
  notice?: { text: string; tone: Tone };
  /** Le chemin jusqu'à « Jouer », numéroté ; puis « Pour aller plus loin », sans numéro. */
  steps: JourneyStepView[];
  extrasTitle: string;
  extras: JourneyStepView[];
}

export interface JourneyStepView {
  /** Rang dans le chemin ; absent pour une amélioration. */
  n?: number;
  title: string;
  detail: string;
  /** À savoir avant de choisir (étape courante seulement). */
  note?: string;
  state: string;
  /** Mot et signe de l'état : jamais la couleur seule. */
  word: string;
  sign: string;
  tone: Tone;
  current: boolean;
  /** Première action de l'étape : un clic sur l'étape la déclenche. */
  action?: number;
}

export type Field = 'Title' | 'Manufacturer' | 'Year';

/**
 * Champ à préfixe fixe (lien du Juke-box) : le champ commence par l'un de ces textes, qu'on ne tape
 * pas ; une touche par préfixe, en fin de clavier, passe de l'un à l'autre (« Playlist », « Vidéo »).
 */
export interface PromptOptions {
  prefixes?: { label: string; text: string }[];
  /** Préfixe de départ (0 par défaut). */
  prefix?: number;
  /**
   * Le texte a changé, par quelque voie que ce soit (touche, clavier à l'écran, téléphone, collage) :
   * `active`, il en reste ; false aussi quand la saisie se ferme ou cède la place à un autre écran.
   * Pour « en train d'écrire » (typing.ts). Le texte donné à l'ouverture ne compte pas.
   */
  onInput?: (active: boolean) => void;
  /** Mot de passe (Mon compte) : le texte s'affiche en points, ni emoji ni préfixe. */
  secret?: boolean;
}

/**
 * Texte à préfixe : `prefixAt` désigne le préfixe affiché ; `prefixOff` : retiré par deux retours
 * arrière de suite sur un champ vide (`armed` après le premier). Les lettres y sont tapées telles
 * quelles (un identifiant mêle majuscules et minuscules) : Maj est un verrou.
 */
export type TextPrefix = { prefixes?: { label: string; text: string }[]; prefixAt?: number; prefixOff?: boolean; armed?: boolean };
export type Editor =
  /** Sans `field` : saisie libre d'un écran « prompt ». */
  /** `at` : point d'insertion (textedit.ts, absent : à la fin) ; `emoji` : panneau des emojis ouvert. */
  | ({ kind: 'text'; field?: Field; label: string; value: string; at?: number; emoji?: boolean; cursor: number; shift: boolean; typed: boolean; secret?: boolean } & TextPrefix)
  | { kind: 'choice'; field: Field; label: string; choices: string[]; cursor: number }
  | { kind: 'number'; field: Field; label: string; value: number; typed: string; cursor: number };

export type Screen =
  /** Menu système : une rubrique, ou ses rubriques (racine). */
  | { kind: 'system'; group?: SystemGroupId }
  /** `manage` : « Gérer la table… », les actions de la fiche qui ne servent pas à jouer. */
  | { kind: 'sheet'; file: string; flash?: string; pup?: TablePupPack[]; contents?: TableContents; manage?: boolean }
  /** Options des PuP-Packs de la table (fiche > « PuP-Pack »). */
  | { kind: 'pupOptions'; file: string; flash?: string; pup?: TablePupPack[] }
  /** Prospectus ou règles de la table, page par page (flippers : page précédente ou suivante). */
  | { kind: 'pages'; file: string; type: SheetPageType; index: number }
  /** Tableau des scores de la table : une portée (MagnaSave) et une période (flippers) à la fois. */
  // `back` : ouvert depuis un autre écran (Classements de la Communauté), son « Retour » y ramène ; sans lui, la fiche.
  | { kind: 'scores'; file: string; period: ScorePeriod; scope: RankingScope; back?: () => void }
  | { kind: 'edit'; file: string; fields: { Title: string; Manufacturer: string; Year?: number }; editor?: Editor }
  /** `added` : ce que l'ajout a fait en plus de ranger les fichiers (médias de VPinMediaDB), montré à la vérification. */
  /** `back` : l'écran qui l'a ouvert (Santé de la borne), à la place de la fiche. */
  | { kind: 'doctor'; file: string; findings?: Finding[]; ignored?: Finding[]; script?: ScriptResult; log: string[]; queue: string[]; afterImport: boolean; added?: Row[]; back?: () => void }
  | { kind: 'remove'; file: string }
  | { kind: 'addSource' }
  | {
      kind: 'addPlan';
      prepared?: PreparedImport;
      plan?: ImportPlan;
      mode: 'move' | 'copy';
      scripts: Map<string, ScriptFacts>;
      existing: KnownTable[];
      /** Base VPS utilisée pour ce plan (absente : jamais téléchargée et pas de réseau). */
      vps?: VpsDb;
      /** Jeu choisi par table (TableVps.key) : identifiant VPS, ou null pour le nom des fichiers. */
      vpsChoices: Map<string, string | null>;
      /** Option choisie par PuP-Pack (PackPlan.key). */
      pupChoices: Map<string, string>;
      /** Écrans de la borne, pour l'option des PuP-Packs. */
      cabinet?: PupCabinet;
      /** Version gardée par ROM (RomImport.key) : empreinte du contenu choisi. */
      romChoices: Map<string, string>;
      /**
       * VPX choisi par table du plan (dossier de la table, en minuscules) : un autre VPX du PC (autres-vpx.ts),
       * ou null pour celui de Cyber Pinball. Absent : celui que disent `vpxHints`, sinon celui de la table installée.
       */
      vpxChoices?: Map<string, string | null>;
      /** L'exécutable de VPX qui jouait chaque .vpx dans l'installation d'où il vient (chemin en minuscules). */
      vpxHints?: Map<string, string>;
      /** Fichiers récupérés depuis le catalogue : le jeu VPS est déjà choisi, la provenance notée après l'installation ; `quick` : installation rapide. */
      acquisition?: { gameId: string; items: WaitItem[]; quick?: boolean };
      /** Ajout fait depuis le parcours de cette table (« Ce qu'il manque pour jouer ») : on y revient ensuite. */
      journey?: string;
      /** Ouvert depuis l'entonnoir (fichiers choisis sur ce PC) : « Annuler » y revient. */
      fromHub?: boolean;
      /** Dossier de la table installée à qui tout revient (parties du jeu, Téléchargements : « Ajouter à »). */
      target?: string;
      /** « Annuler » revient là (l'écran des parties du jeu, le fichier de Téléchargements). */
      back?: () => void;
      /**
       * Médias de VPinMediaDB pour les nouvelles tables du plan, téléchargés juste après
       * l'installation (seulement ceux qui manquent). `games` : par identifiant VPS ;
       * `wanted` : le choix de l'utilisateur (oui d'office) ; `problem` : index indisponible.
       */
      medias?: { wanted: boolean; games: Map<string, MediaDbGameOffer>; problem?: string };
      /**
       * Tables choisies dans une installation existante (Popper, PinballX…) : ce qui a été
       * retrouvé ailleurs dans l'installation et ajouté au plan, et ce qui y manque.
       */
      companions?: CompanionReport[];
      /** Installation reprise : ce qui sera lié (sans place en plus) et copié ; parcours des sources gardés d'un plan à l'autre. */
      links?: ImportLinks;
      linkScan?: Map<string, SourceFiles>;
      /** Place que le plan demandera sur chaque disque (importspace.ts), refaite avec lui. */
      space?: ImportSpace;
      /** Tailles déjà mesurées des fichiers et dossiers du plan, pour ne pas les remesurer à chaque choix. */
      sizes?: Map<string, number>;
    }
  | { kind: 'addChoice'; plan: AddPlan; key: string }
  | { kind: 'addPupChoice'; plan: AddPlan; key: string }
  /** Bibliothèque de ROM : vue globale. */
  | { kind: 'roms'; scan?: RomLibraryScan }
  /** Rangement des ROM existantes dans la bibliothèque : plan à valider. */
  | { kind: 'romMigrate'; scan?: RomLibraryScan; choices: Map<string, string> }
  /** `table` : la table dont parle l'écran (tableOf), pour les écrans de la borne. */
  | { kind: 'notice'; heading: string; lines: string[]; then: () => void; table?: string }
  /** Écran décrit hors de la gestion des tables (configurations de la borne), recalculé à chaque affichage. */
  | { kind: 'custom'; build: () => Built; table?: string }
  /** Saisie d'un texte au clavier à l'écran ; `done` reçoit undefined à l'annulation. */
  | { kind: 'prompt'; heading: string; lead?: string; editor: Editor; done: (value: string | undefined) => void; table?: string; onInput?: (active: boolean) => void };

export type EditorScreen = Extract<Screen, { kind: 'edit' | 'prompt' }>;

/** Écrans d'une table : son titre est le nom du jeu, sans l'icône de la partie du menu d'où l'on vient. */
export const TABLE_SCREENS: readonly Screen['kind'][] = ['sheet', 'pupOptions', 'pages', 'scores', 'edit', 'doctor', 'remove'];

/**
 * Table dont parle un écran : les écrans de la borne gardent ses médias (screensTable de
 * packages/core). Les écrans d'une table la portent ; un écran décrit (médias du jeu, fichiers,
 * parcours…) la déclare à son ouverture (openCustom) ; une saisie ou un message garde celle de
 * l'écran d'où il s'ouvre. Tout autre écran n'en a pas : l'affichage par défaut de Cyber Pinball.
 */
export function tableOf(s: Screen | undefined): string | undefined {
  if (!s) return undefined;
  if (TABLE_SCREENS.includes(s.kind)) return (s as Extract<Screen, { file: string }>).file;
  if (s.kind === 'custom' || s.kind === 'notice' || s.kind === 'prompt') return s.table;
  return undefined;
}

/** Écrans ouverts à l'invité, par leur porte : la fiche, le prospectus et les règles, le tableau des scores. Tout autre écran est fermé. */
export const GUEST_SCREENS: Partial<Record<Screen['kind'], GuestDoor>> = { sheet: 'menu.sheet', pages: 'sheet.read', scores: 'sheet.scores' };

export type AddPlan = Extract<Screen, { kind: 'addPlan' }>;
export type PagesScreen = Extract<Screen, { kind: 'pages' }>;
export type ScoresScreen = Extract<Screen, { kind: 'scores' }>;
/** Le retour, dans les actions du tableau des scores : après les quatre périodes et les quatre portées. */
export const SCORES_BACK = 8;
/** Au-delà, la construction d'un écran est dite au journal : plusieurs par touche, les flippers ne suivent plus. */
export const SLOW_BUILD_MS = 40;
/** L'ouverture d'un écran lit le disque une fois (kept) : au-delà, elle est dite au journal. */
export const SLOW_OPENING_MS = 500;

/** Page préc. / Page suiv. d'un clavier : le texte de l'écran défile de partout (reading.ts). */
export const PAGE_KEYS: Record<string, -1 | 1> = { PageUp: -1, PageDown: 1 };
