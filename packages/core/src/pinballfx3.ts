// Pinball FX3 (Zen Studios, 2017), renommé « Pinball FX Classic » sur Steam en avril 2026 :
// deuxième jeu de Zen après Pinball FX (pinballfx.ts). Beaucoup de bornes l'ont encore, avec des
// tables achetées qui ne passent pas dans Pinball FX. Pinball FX2 n'est pas pris en charge.
//
// Ce qui est établi (vérifié le 17/11/2026) :
// - Steam seulement (appid 442120) : le mode borne n'existe que dans la version Steam ; les
//   versions Microsoft Store et consoles n'ont ni mode borne ni lancement direct.
// - Lancement direct : « steam.exe -applaunch 442120 -table_<nom> », <nom> étant le fichier .pxp
//   de la table sans extension (dossier data\steam du jeu). « -class » joue les tables Williams et
//   Bally dans leur mode classique (règles de la machine, sans améliorations). Ces arguments ne
//   sont pas documentés par Zen : ils viennent des front-ends (PinUP Popper, PinballX, RetroBat)
//   et du support de Zen cité par eux.
// - Le lancement direct demande le mode borne. Depuis la mise à jour 1.0.26.1 du 4 novembre 2024,
//   plus aucun code n'est à demander à Zen : le mode borne se débloque pour tout le monde, il
//   reste à l'activer une fois dans le jeu (icône de borne à côté du profil). Sans lui, ou sans
//   la table sur le compte Steam, le jeu s'ouvre sur son menu.
// - Tous les fichiers de tables sont installés, achetées ou non (ils servent aux essais) : le
//   dossier du jeu dit quelles tables existent, jamais lesquelles le joueur possède.
// - Fenêtre du jeu : « Pinball FX Classic » depuis avril 2026, « Pinball FX3 » avant.
// Pas de ROM, pas de NVRAM, pas de VR, pas de scores lisibles : absents, jamais simulés.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { t } from './i18n';
import { pinballFxTable } from './pinballfx';
import { isFreePinballFx3Table } from './pinballfx3-cabinet';
import { findSteamGame, steamGameDownloading, steamInstallUrl } from './steam';

export const PINBALLFX3_STEAM_APPID = '442120';
/** Titres de la fenêtre de jeu : le nom d'avril 2026 d'abord, l'ancien pour un jeu pas mis à jour. */
export const PINBALLFX3_WINDOW_TITLES = ['Pinball FX Classic', 'Pinball FX3'] as const;
/** Mode borne de Pinball FX3 expliqué par Zen (activation, écrans, DMD). */
export const PINBALLFX3_CABINET_HELP_URL = 'https://www.pinballfx.com/?page_id=7754';
/** Installation par Steam (le jeu est gratuit ; les tables s'y achètent). */
export const PINBALLFX3_STEAM_INSTALL_URL = steamInstallUrl(PINBALLFX3_STEAM_APPID);

export interface PinballFx3Table {
  /** Fichier de la table dans data\steam, sans .pxp : ce que reçoit -table_. */
  name: string;
  title: string;
  manufacturer: string;
  year?: number;
  /** Jeu de la base VPS (le même que la table de Pinball FX quand elle y existe). */
  vps?: string;
  /** Table Williams ou Bally : lancée dans son mode classique (-class). */
  williams: boolean;
  /** Table du catalogue ; un fichier inconnu (table plus récente) est montré sous son nom. */
  known: boolean;
}

const ZEN = 'Zen Studios';

// Fichiers des tables (dépôt Steam 442121, manifeste du 1er avril 2026) et la table de Pinball FX
// qui est la même (titre, fabricant, année, jeu VPS repris de pinballfx.ts) ; sinon son titre.
// Correspondances des noms peu parlants (« Citadel », « SpaceBear1 »…) : listes des front-ends
// (PinUP Popper, PinballX), recoupées avec l'ordre alphabétique des fichiers.
// Tables propres à FX3 : leur titre et leur jeu VPS (format FX3, relevés le 20/11/2026) ; sans lui,
// ni capture ni médias (un joueur l'a vu : Aliens, Archer, American Dad sans image). Toute table du
// catalogue a son jeu VPS (test) ; Zen Studios est le fabricant.
const TABLES: [string, number | string | { title: string; vps: string }][] = [
  ['Alien_Isolation', { title: 'Aliens vs. Pinball: Alien: Isolation', vps: 'sO_RrYyX' }],
  ['Alien_vs_Predator', { title: 'Aliens vs. Pinball: Alien vs. Predator', vps: 'nocBs6Iu' }],
  ['Aliens', { title: 'Aliens vs. Pinball: Aliens', vps: 'GNXfb2HW' }],
  ['AmericanDad', { title: "American Dad! Pinball", vps: 'wc2QMFRD' }],
  ['Amusement_Park', 29], // Adventure Land
  ['Archer', { title: 'Archer Pinball', vps: 'kyx3Helo' }],
  ['Atlantis', 66], // Secrets of the Deep
  ['BALLY_Attack_from_Mars', 119],
  ['BALLY_BlackRose', 118],
  ['BALLY_Champion_Pub', 121],
  ['BALLY_Cirqus_Voltaire', 127],
  ['BALLY_Creature_from_the_Black_Lagoon', 131],
  ['BALLY_Dr_Dude', 135],
  ['BALLY_Party_Zone', 120],
  ['BALLY_Safe_Cracker', 122],
  ['BALLY_TheatreOfMagic', 117],
  ['BETHESDA_Doom', 92],
  ['BETHESDA_Fallout', 90],
  ['BETHESDA_Skyrim', 91],
  ['BioLab', 27],
  ['BobsBurgers', { title: "Bob's Burgers Pinball", vps: 'nJT6s8UJ' }],
  ['CastleStorm', 40],
  ['Citadel', 33], // Sorcerer's Lair
  ['EarthDefense', { title: 'Earth Defense', vps: 'dDRlUWW0' }],
  ['Eldorado', { title: 'El Dorado', vps: '2kGICARX' }],
  ['Excalibur', 20],
  ['FamilyGuy', { title: 'Family Guy Pinball', vps: 'U1lV4AjF' }],
  ['Hercules', 80], // Son of Zeus
  ['Looter', 67], // Epic Quest
  ['MARVEL_Age_of_Ultron', 78],
  ['MARVEL_Ant-Man', 79],
  ['MARVEL_Avengers', 17],
  ['MARVEL_Blade', 45],
  ['MARVEL_CaptainAmerica', 48],
  ['MARVEL_CivilWar', 1],
  ['MARVEL_Deadpool', 22],
  ['MARVEL_DrStrange', 30],
  ['MARVEL_FantasticFour', 38],
  ['MARVEL_FearItSelf', 5],
  ['MARVEL_GhostRider', 21],
  ['MARVEL_Guardians', 50],
  ['MARVEL_InfinityGauntlet', 60],
  ['MARVEL_IronMan', 65],
  ['MARVEL_MoonKnight', 49],
  ['MARVEL_MsMarvel', 93], // Women of Power: A-Force
  ['MARVEL_SpiderMan', 46],
  ['MARVEL_Thor', 7],
  ['MARVEL_Venom', 73],
  ['MARVEL_WOP_TheNextGeneration', 94], // Women of Power: Champions
  ['MARVEL_WWH', 56],
  ['MARVEL_Wolverine', 71],
  ['MARVEL_XMen', 59],
  ['Mars', { title: 'Mars', vps: 'lzQr2axU' }],
  ['Paranormal', { title: 'Paranormal', vps: 'MfPacfn9' }],
  ['Pasha', 23],
  ['Portal', { title: 'Portal Pinball', vps: 'SQ0gMY8e' }],
  ['RedCup1', 105], // Star Wars Pinball: Solo
  ['RedCup2', 106], // Calrissian Chronicles
  ['RedCup3', 107], // Battle of Mimban
  ['Rome', 31],
  ['STARWARS_AVCO2', 89], // Might of the First Order
  ['STARWARS_Boba_Fett', 53],
  ['STARWARS_CloneWars', 47],
  ['STARWARS_Darth_Vader', 28],
  ['STARWARS_Droids', 58],
  ['STARWARS_Episode7', 88],
  ['STARWARS_Episode_4', 12],
  ['STARWARS_Episode_5', 43],
  ['STARWARS_Episode_6', 24],
  ['STARWARS_Han_Solo', 10],
  ['STARWARS_LAPB', 98], // Rogue One
  ['STARWARS_Light_VS_Dark', 2], // Masters of the Force
  ['STARWARS_Rebels', 77],
  ['STARWARS_SFA', 6], // Starfighter Assault
  ['Shaman', { title: 'Shaman', vps: 'Nlr4_9mD' }],
  ['SpaceBear1', 103], // The Last Jedi
  ['SpaceBear2', 104], // Ahch-To Island
  ['Tesla', { title: 'Tesla', vps: 'wyotFFE4' }],
  ['TheWalkingDead', { title: 'The Walking Dead Pinball', vps: 'vGWzIhsr' }],
  ['UNIVERSAL_BTTF', 97],
  ['UNIVERSAL_ET', 96],
  ['UNIVERSAL_Jaws', 95],
  ['UNIVERSAL_Jurassic_Park', 100],
  ['UNIVERSAL_Jurassic_Theme_Park', 102], // Jurassic Park Pinball Mayhem
  ['UNIVERSAL_Jurassic_World', 101],
  ['V12', { title: 'V12', vps: 'kK0wZBYn' }],
  ['WMS_Fish_Tales', 108],
  ['WMS_Funhouse', 134],
  ['WMS_Getaway', 111],
  ['WMS_Hurricane', 126],
  ['WMS_Indiana_Jones', 133],
  ['WMS_Junkyard', 110],
  ['WMS_Medieval_Madness', 109],
  ['WMS_Monster_Bash', 130],
  ['WMS_No_Good_Gofers', 128],
  ['WMS_Roadshow', 125],
  ['WMS_Space_Station', 129],
  ['WMS_Tales_of_the_Arabian_Nights', 132],
  ['WMS_White_Water', 124],
  ['Western', 75], // Wild West Rampage
];

/** Fichiers .pxp du dossier data\steam qui ne sont pas des tables (interface, sons, textes…). */
const SYSTEM_FILES = new Set(['ptsdata', 'game_cfg', 'gui', 'gui_cfg', 'gui_sfx', 'preview', 'sfx', 'txt']);

/** Nom de table accepté par -table_ : lettres, chiffres, « _ » et « - » (aucun espace, aucun guillemet). */
const SAFE_NAME = /^[A-Za-z0-9_-]+$/;

/** Table Williams ou Bally d'après son fichier : seules à avoir un mode classique. */
export function isWilliamsPinballFx3(name: string): boolean {
  return /^(WMS|BALLY)_/i.test(name);
}

function describe(name: string, ref: number | string | { title: string; vps: string } | undefined): PinballFx3Table {
  const williams = isWilliamsPinballFx3(name);
  // Table propre à FX3 que la base VPS connaît (format FX3) : son jeu VPS donne capture et médias.
  if (typeof ref === 'object') return { name, title: ref.title, manufacturer: ZEN, vps: ref.vps, williams, known: true };
  if (typeof ref === 'number') {
    const fx = pinballFxTable(ref);
    if (fx) return { name, title: fx.title, manufacturer: fx.manufacturer, ...(fx.year ? { year: fx.year } : {}), ...(fx.vps ? { vps: fx.vps } : {}), williams, known: true };
  }
  if (typeof ref === 'string') return { name, title: ref, manufacturer: ZEN, williams, known: true };
  // Fichier que le catalogue ne connaît pas : « STARWARS_New_Table » -> « STARWARS New Table ».
  return { name, title: name.replace(/_+/g, ' ').trim(), manufacturer: williams ? (/^bally_/i.test(name) ? 'Bally' : 'Williams') : ZEN, williams, known: false };
}

export const PINBALLFX3_TABLES: readonly PinballFx3Table[] = TABLES.map(([name, ref]) => describe(name, ref));

const BY_NAME = new Map(PINBALLFX3_TABLES.map((t) => [t.name.toLowerCase(), t]));

/** Table de Pinball FX3 d'après son fichier ; un nom inconnu mais valable est décrit d'après lui. */
export function pinballFx3Table(name: string): PinballFx3Table | undefined {
  if (!SAFE_NAME.test(name)) return undefined;
  return BY_NAME.get(name.toLowerCase()) ?? describe(name, undefined);
}

// ---------------------------------------------------------------------------
// Installation : Steam seulement
// ---------------------------------------------------------------------------

export interface PinballFx3Install {
  /** 'folder' : dossier du jeu choisi à la main, lancé par son exécutable (pinballfx3-folder.ts). */
  store: 'steam' | 'folder';
  /** Dossier du jeu (…\steamapps\common\Pinball FX3). */
  gameDir: string;
  /** steam.exe : le jeu se lance par Steam ; dossier choisi : l'exécutable du jeu. */
  launcher: string;
  /** Dossier des tables (data\steam). */
  tablesDir: string;
}

/** Pinball FX3 installé par Steam : manifeste appmanifest_442120.acf complet, dossier du jeu présent. */
export function findSteamPinballFx3(steamDir: string): PinballFx3Install | undefined {
  const gameDir = findSteamGame(steamDir, PINBALLFX3_STEAM_APPID, 'Pinball FX3');
  return gameDir ? { store: 'steam', gameDir, launcher: path.join(steamDir, 'steam.exe'), tablesDir: path.join(gameDir, 'data', 'steam') } : undefined;
}

/** Pinball FX3 en cours de téléchargement ou de mise à jour dans Steam. */
export function steamPinballFx3Downloading(steamDir: string): boolean {
  return steamGameDownloading(steamDir, PINBALLFX3_STEAM_APPID);
}

/** Steam ouvert sur l'installation de Pinball FX3 (steam.exe reçoit l'adresse) ; sans Steam, rien à ouvrir. */
export function pinballFx3Getter(steamDir: string | undefined): { store: 'steam'; file: string; args: string[] } | undefined {
  const steamExe = steamDir ? path.join(steamDir, 'steam.exe') : undefined;
  return steamExe && fs.existsSync(steamExe) ? { store: 'steam', file: steamExe, args: [PINBALLFX3_STEAM_INSTALL_URL] } : undefined;
}

/**
 * Tables installées avec le jeu : les fichiers .pxp de data\steam, sans ceux du jeu lui-même.
 * Achetées ou non : Steam installe toutes les tables (essais). Triées par titre. Un dossier
 * illisible donne une liste vide.
 */
export function pinballFx3InstalledTables(install: Pick<PinballFx3Install, 'tablesDir'>): PinballFx3Table[] {
  let files: string[];
  try {
    files = fs.readdirSync(install.tablesDir);
  } catch {
    return [];
  }
  const out: PinballFx3Table[] = [];
  for (const f of files) {
    if (path.extname(f).toLowerCase() !== '.pxp') continue;
    const name = f.slice(0, -4);
    const key = name.toLowerCase();
    if (SYSTEM_FILES.has(key) || /assets$|_cfg$|_sfx$/i.test(name)) continue;
    const table = pinballFx3Table(name);
    if (table) out.push(table);
  }
  return out.sort((a, b) => a.title.localeCompare(b.title, 'fr'));
}

/**
 * Commande de lancement direct d'une table : « steam.exe -applaunch 442120 [-class] -table_<nom> ».
 * `-class` pour les tables Williams et Bally (mode classique), sauf `classic: false`. Un nom qui
 * contiendrait autre chose que lettres, chiffres, « _ » ou « - » est refusé : il passerait mal.
 */
export function pinballFx3Command(install: Pick<PinballFx3Install, 'launcher'>, name: string, opts: { classic?: boolean } = {}): { file: string; args: string[] } {
  if (!SAFE_NAME.test(name)) throw new Error(`Nom de table de Pinball FX3 refusé : « ${name} »`); // i18n-ignore : erreur interne
  const classic = (opts.classic ?? true) && isWilliamsPinballFx3(name);
  return { file: install.launcher, args: ['-applaunch', PINBALLFX3_STEAM_APPID, ...(classic ? ['-class'] : []), `-table_${name}`] };
}

/**
 * Partie de Pinball FX3 plus courte que ce seuil : le jeu est peut-être resté sur son menu (table
 * pas sur le compte Steam, mode borne pas activé). Rien ne le dit à Cyber Pinball : la fenêtre du
 * jeu est la même sur son menu et sur une table.
 */
export const PINBALLFX3_SHORT_GAME_S = 45;

/**
 * Message au retour d'une partie de Pinball FX3 trop courte : les causes possibles d'un jeu resté
 * sur son menu, au conditionnel (une partie vraiment courte est possible). undefined : rien à dire.
 */
export function pinballFx3ShortGameMessage(seconds: number, name: string): { title: string; lines: string[] } | undefined {
  if (seconds >= PINBALLFX3_SHORT_GAME_S) return undefined;
  const game = 'Pinball FX3';
  return {
    title: t('{game} est resté sur son écran d’accueil ?', { game }),
    lines: [
      t('La partie a duré {n} s. Si {game} s’est ouvert sur son écran d’accueil au lieu de la table :', { n: Math.round(seconds), game }),
      // Fish Tales et Sorcerer's Lair sont gratuites : sur tout compte, ce n'est jamais un achat qui manque.
      ...(isFreePinballFx3Table(name) ? [] : [t('la table n’est peut-être pas sur ce compte Steam : seules les tables achetées s’ouvrent directement, les autres restent en essai dans le jeu ;')]),
      t('ou le mode borne n’est pas activé : dans {game}, icône de borne à côté du profil, puis « Activer ». Aucun code à demander à Zen depuis novembre 2024.', { game }),
      ...(name.toLowerCase() === 'mars' ? [t('« Mars » : un défaut connu de {game} ouvre « Attack from Mars » à sa place quand le compte a les deux tables.', { game })] : []),
      t('Start ou Exit : revenir au front-end.'),
    ],
  };
}

/** Fenêtre de jeu de Pinball FX3 : son titre exact, pas une page de Steam qui le nommerait. */
export function isPinballFx3WindowTitle(title: string): boolean {
  const t = title.trim().toLowerCase();
  return PINBALLFX3_WINDOW_TITLES.some((w) => w.toLowerCase() === t);
}
