// Pinball FX (Zen Studios, 2023) : deuxième émulateur après Visual Pinball X.
// Ses tables ne sont pas des fichiers : ce sont des contenus de Steam ou d'Epic,
// désignés par un numéro. Lancement direct documenté par Zen (FAQ du mode borne,
// pinballfx.com) : « -Table <numéro> -GameMode <mode> » ; avec Steam, ces
// arguments suivent « steam.exe -applaunch 2328760 ». Le mode borne (écrans,
// DMD externe, image de fronton par table « Table_<numéro>.png » dans
// PinballFX\Mods\Cabinet) se règle dans le jeu.
// Pas de ROM, pas de NVRAM, pas de VR : ce que le jeu ne fournit pas est absent
// de ses tables, jamais simulé.

import * as fs from 'node:fs';
import * as path from 'node:path';
import type { VpsDb, VpsTableFile } from './vps';

export const PINBALLFX_STEAM_APPID = '2328760';
/** Nom de la fenêtre de jeu (Unreal Engine) ; repris des scripts de fermeture des frontends. */
export const PINBALLFX_WINDOW_TITLE = 'PinballFX';
/** Préfixe de l'identifiant d'une table de Pinball FX dans l'inventaire (« pinballfx/156 »). */
export const PINBALLFX_ID_PREFIX = 'pinballfx/';

export interface PinballFxTable {
  /** Numéro de la table pour -Table. */
  id: number;
  title: string;
  manufacturer: string;
  /** Année de la machine réelle (tables Williams et Bally) ; absente pour les créations de Zen. */
  year?: number;
  /**
   * Jeu de la base VPS : sa capture de la table dans Pinball FX (vignette de la liste) et ses
   * médias (VPinMediaDB, « Médias manquants »). Absent : table trop récente pour VPS.
   */
  vps?: string;
}

/** Modes de partie acceptés par -GameMode (FAQ de Zen). Pro : tables Williams seulement. */
export const PINBALLFX_GAME_MODES = [
  'Classic',
  'Pro',
  'Practice',
  'Hotseat_2',
  'Hotseat_3',
  'Hotseat_4',
  'Challenge_BallLimited',
  'Challenge_TimeLimited',
  'Challenge_DistanceLimited',
  'Challenge_FlipLimited',
] as const;
export type PinballFxGameMode = (typeof PINBALLFX_GAME_MODES)[number];

const ZEN = 'Zen Studios';

// Liste de Zen (FAQ du mode borne, consultée le 16/11/2026). Fabricant et année des
// machines réelles ajoutés pour retrouver leurs médias (« Titre (Fabricant Année) »).
const TABLES: [number, string, string, number?][] = [
  // Williams et Bally
  [199, 'Comet', 'Williams', 1985],
  [194, 'PIN·BOT', 'Williams', 1986],
  [200, 'Fire!', 'Williams', 1987],
  [129, 'Space Station', 'Williams', 1987],
  [188, 'Banzai Run', 'Williams', 1988],
  [149, 'Swords of Fury', 'Williams', 1988],
  [196, 'Taxi', 'Williams', 1988],
  [190, 'Black Knight 2000', 'Williams', 1989],
  [189, 'Earthshaker', 'Williams', 1989],
  [197, 'Elvira and the Party Monsters', 'Bally', 1989],
  [201, 'Diner', 'Williams', 1990],
  [135, 'Dr. Dude and His Excellent Ray', 'Bally', 1990],
  [134, 'FunHouse', 'Williams', 1990],
  [168, 'Whirlwind', 'Williams', 1990],
  [126, 'Hurricane', 'Williams', 1991],
  [120, 'The Party Zone', 'Bally', 1991],
  [148, 'The Machine: Bride of Pin·Bot', 'Williams', 1991],
  [118, 'Black Rose', 'Bally', 1992],
  [131, 'Creature from the Black Lagoon', 'Bally', 1992],
  [108, 'Fish Tales', 'Williams', 1992],
  [111, 'The Getaway: High Speed II', 'Williams', 1992],
  [156, 'The Addams Family', 'Bally', 1992],
  [133, 'Indiana Jones: The Pinball Adventure', 'Williams', 1993],
  [202, 'Judge Dredd', 'Bally', 1993],
  [163, 'Star Trek: The Next Generation', 'Williams', 1993],
  [162, 'Twilight Zone', 'Bally', 1993],
  [124, 'White Water', 'Williams', 1993],
  [125, "Red & Ted's Road Show", 'Williams', 1994],
  [157, 'World Cup Soccer', 'Bally', 1994],
  [119, 'Attack from Mars', 'Bally', 1995],
  [117, 'Theatre of Magic', 'Bally', 1995],
  [195, 'WHO dunnit', 'Bally', 1995],
  [110, 'Junk Yard', 'Williams', 1996],
  [122, 'Safe Cracker', 'Bally', 1996],
  [198, 'Scared Stiff', 'Bally', 1996],
  [132, 'Tales of the Arabian Nights', 'Williams', 1996],
  [127, 'Cirqus Voltaire', 'Bally', 1997],
  [109, 'Medieval Madness', 'Williams', 1997],
  [128, 'No Good Gofers', 'Williams', 1997],
  [121, 'The Champion Pub', 'Bally', 1998],
  [130, 'Monster Bash', 'Williams', 1998],
  // Créations de Zen Studios
  [29, 'Adventure Land', ZEN],
  [27, 'Biolab', ZEN],
  [191, 'Camp Bloodbrook', ZEN],
  [40, 'CastleStorm', ZEN],
  [112, 'Curse of the Mummy', ZEN],
  [67, 'Epic Quest', ZEN],
  [20, 'Excalibur', ZEN],
  [155, 'Grimm Tales', ZEN],
  [23, 'Pasha', ZEN],
  [123, 'Pinball Noir', ZEN],
  [31, 'Rome', ZEN],
  [165, "A Samurai's Vengeance", ZEN],
  [66, 'Secrets of the Deep', ZEN],
  [113, 'Sky Pirates: Treasures of the Clouds', ZEN],
  [80, 'Son of Zeus', ZEN], // i18n-ignore : nom de table
  [33, "Sorcerer's Lair", ZEN],
  [36, 'Super League Football', ZEN],
  [164, "Verne's Mysterious Island", ZEN],
  [75, 'Wild West Rampage', ZEN],
  [147, 'Wrath of the Elder Gods', ZEN],
  // Licences adaptées par Zen Studios
  [181, 'A Charlie Brown Christmas Pinball', ZEN],
  [97, 'Back to the Future Pinball', ZEN],
  [170, 'Battlestar Galactica Pinball', ZEN],
  [152, 'Borderlands: Vault Hunter Pinball', ZEN],
  [151, 'Brothers in Arms: Win the War Pinball', ZEN],
  [161, 'Crypt of the NecroDancer Pinball', ZEN],
  [92, 'DOOM Pinball', ZEN],
  [141, 'DreamWorks How to Train Your Dragon Pinball', ZEN],
  [139, 'DreamWorks Kung Fu Panda Pinball', ZEN],
  [140, 'DreamWorks Trolls Pinball', ZEN],
  [96, 'E.T. Pinball', ZEN],
  [178, 'Exploding Kittens: A Pinball Cat-astrophe', ZEN],
  [90, 'Fallout Pinball', ZEN],
  [145, 'Garfield Pinball', ZEN],
  [179, 'Gloomhaven Pinball', ZEN],
  [187, 'Goat Simulator Pinball', ZEN],
  [158, 'Godzilla Pinball', ZEN],
  [160, 'Godzilla vs. Kong Pinball', ZEN],
  [150, 'Homeworld: Journey to Hiigara Pinball', ZEN],
  [95, 'Jaws Pinball', ZEN],
  [100, 'Jurassic Park Pinball', ZEN],
  [102, 'Jurassic Park Pinball Mayhem', ZEN],
  [101, 'Jurassic World Pinball', ZEN],
  [177, 'Knight Rider Pinball', ZEN],
  [153, 'Kong Pinball', ZEN],
  [138, 'My Little Pony Pinball', ZEN],
  [186, 'Pacific Rim Pinball', ZEN],
  [146, "Peanuts' Snoopy Pinball", ZEN],
  [4, 'South Park: Super Sweet Pinball', ZEN],
  [55, "South Park: Butters' Very Own Pinball Game", ZEN],
  [183, 'System Shock Pinball', ZEN],
  [173, 'Terraforming Mars Pinball', ZEN],
  [91, 'The Elder Scrolls V: Skyrim Pinball', ZEN],
  [184, 'The Princess Bride Pinball', ZEN],
  [182, 'Tomb Raider Pinball: Adventures of Lara Croft', ZEN],
  [192, 'Tomb Raider Pinball: Secrets of Croft Manor', ZEN],
  [154, 'World War Z Pinball', ZEN],
  [167, 'Xena: Warrior Princess Pinball', ZEN],
  // Star Wars Pinball
  [106, 'Star Wars Pinball: Calrissian Chronicles', ZEN],
  [107, 'Star Wars Pinball: Battle of Mimban', ZEN],
  [104, 'Star Wars Pinball: Ahch-To Island', ZEN],
  [53, 'Star Wars Pinball: Boba Fett', ZEN],
  [137, 'Star Wars Pinball: Classic Collectibles', ZEN],
  [28, 'Star Wars Pinball: Darth Vader', ZEN],
  [58, 'Star Wars Pinball: Droids', ZEN],
  [12, 'Star Wars Pinball: Episode IV A New Hope', ZEN],
  [43, 'Star Wars Pinball: Episode V The Empire Strikes Back', ZEN],
  [24, 'Star Wars Pinball: Episode VI Return of the Jedi', ZEN],
  [10, 'Star Wars Pinball: Han Solo', ZEN],
  [2, 'Star Wars Pinball: Masters of the Force', ZEN],
  [89, 'Star Wars Pinball: Might of the First Order', ZEN],
  [98, 'Star Wars Pinball: Rogue One', ZEN],
  [105, 'Star Wars Pinball: Solo', ZEN],
  [77, 'Star Wars Pinball: Star Wars Rebels', ZEN],
  [6, 'Star Wars Pinball: Starfighter Assault', ZEN],
  [47, 'Star Wars Pinball: The Clone Wars', ZEN],
  [88, 'Star Wars Pinball: The Force Awakens', ZEN],
  [103, 'Star Wars Pinball: The Last Jedi', ZEN],
  [136, 'Star Wars Pinball: The Mandalorian', ZEN],
  // Star Trek Pinball
  [169, 'Star Trek Pinball: Discovery', ZEN],
  [172, 'Star Trek Pinball: Deep Space Nine', ZEN],
  [166, 'Star Trek Pinball: Kelvin Timeline', ZEN],
  // Marvel Pinball
  [79, "Marvel's Ant-Man", ZEN],
  [78, "Marvel's Avengers: Age of Ultron", ZEN],
  [45, 'Marvel Pinball: Blade', ZEN],
  [48, 'Marvel Pinball: Captain America', ZEN],
  [1, 'Marvel Pinball: Civil War', ZEN],
  [22, 'Marvel Pinball: Deadpool', ZEN],
  [30, 'Marvel Pinball: Doctor Strange', ZEN],
  [38, 'Marvel Pinball: Fantastic Four', ZEN],
  [5, 'Marvel Pinball: Fear Itself', ZEN],
  [21, 'Marvel Pinball: Ghost Rider', ZEN],
  [50, "Marvel Pinball: Guardians of the Galaxy", ZEN],
  [65, 'Marvel Pinball: Iron Man', ZEN],
  [49, 'Marvel Pinball: Moon Knight', ZEN],
  [46, 'Marvel Pinball: Spider-Man', ZEN],
  [17, 'Marvel Pinball: The Avengers', ZEN],
  [60, 'Marvel Pinball: The Infinity Gauntlet', ZEN],
  [7, 'Marvel Pinball: Thor', ZEN],
  [73, 'Marvel Pinball: Venom', ZEN],
  [71, 'Marvel Pinball: Wolverine', ZEN],
  [93, "Marvel's Women of Power: A-Force", ZEN],
  [94, "Marvel's Women of Power: Champions", ZEN],
  [56, 'Marvel Pinball: World War Hulk', ZEN],
  [59, 'Marvel Pinball: X-Men', ZEN],
];

// Jeu VPS de chaque table (base VPS du 16/11/2026) : celui qui a une version « FX » du même titre ;
// pour une machine Williams ou Bally qui n’en a pas, le jeu de la machine (même titre, fabricant et
// année : mêmes logo et fronton). Les tables que VPS ne connaît pas encore n’en ont pas.
const VPS_IDS: Record<number, string> = {
199: 'sfiWmEeN', // Comet
  194: 'u3bADyBV', // PIN·BOT
  200: 'HGEZhWjM', // Fire!
  129: 'UvueodZg', // Space Station
  188: 'D7db6H4M', // Banzai Run
  149: 'UQ6dnKLa', // Swords of Fury
  196: '7eRiA3gK', // Taxi
  190: '8ND2ag4u', // Black Knight 2000
  189: 'HB-50MQb', // Earthshaker
  197: '3LNcE1yH', // Elvira and the Party Monsters
  201: '2qcWVEi9', // Diner
  135: 'klXtdvkv', // Dr. Dude and His Excellent Ray
  134: 'O1-qbuxg', // FunHouse
  168: 'JcJtmz2q', // Whirlwind
  126: 'DEp2LBTL', // Hurricane
  120: 'd4FUrVlu', // The Party Zone
  148: 'MKZNH4Rl', // The Machine: Bride of Pin·Bot
  118: 'qQNywC8u', // Black Rose
  131: 'OiRcNWYu', // Creature from the Black Lagoon
  108: 'tV1GotAP', // Fish Tales
  111: 'cCV4A6uc', // The Getaway: High Speed II
  156: 'aT_GONvw', // The Addams Family
  133: 'lkSumsrF', // Indiana Jones: The Pinball Adventure
  202: 'aGzQHF72', // Judge Dredd
  163: 'eKpfZo80', // Star Trek: The Next Generation
  162: 'WMwkA7_p', // Twilight Zone
  124: 'LJRH3fKk', // White Water
  125: 'LMK5EL-k', // Red & Ted's Road Show
  157: 'GXsgeoz_', // World Cup Soccer
  119: '9Paf7-CL', // Attack from Mars
  117: 'Tc_1PRrM', // Theatre of Magic
  195: 'n7aheBtw', // WHO dunnit
  110: 'WX9RToIR', // Junk Yard
  122: 'sx604oSu', // Safe Cracker
  198: 'EC_7xF96', // Scared Stiff
  132: '3CvHz8Fa', // Tales of the Arabian Nights
  127: 'amqQVZGq', // Cirqus Voltaire
  109: '-5yMpqSy', // Medieval Madness
  128: 'AV8W-O2R', // No Good Gofers
  121: '2HPDN_tT', // The Champion Pub
  130: 'F1Skyh5h', // Monster Bash
  29: 'IisAylS2', // Adventure Land
  27: 'xBRVRUkm', // Biolab
  40: 'hw8c55mW', // CastleStorm
  112: '0QFtwlS1Sg', // Curse of the Mummy
  67: 'EXdJ6CPT', // Epic Quest
  20: 'Xdg7bo_y', // Excalibur
  155: 'PMMTFLL2Sv', // Grimm Tales
  23: 'YIjARuli', // Pasha
  123: 'WCiFOdmdGp', // Pinball Noir
  31: '-YvvPVSn', // Rome
  165: 'IcO8o0iTWx', // A Samurai's Vengeance
  66: 'ckwfgv9u', // Secrets of the Deep
  113: '91OqFMMLwT', // Sky Pirates: Treasures of the Clouds
  80: 'aHEbWqso', // Son of Zeus
  33: 'q9Pywo-y', // Sorcerer's Lair
  36: 'Py45rx2y', // Super League Football
  164: 'x2d9uK4Z6D', // Verne's Mysterious Island
  75: '9C9EMQDj', // Wild West Rampage
  147: 'vowocZpLev', // Wrath of the Elder Gods
  97: 'OLJJqhmH', // Back to the Future Pinball
  170: 'Olb9_xOyHI', // Battlestar Galactica Pinball
  152: 'BwyxFoXrWB', // Borderlands: Vault Hunter Pinball
  151: 'MEsTwjO3Co', // Brothers in Arms: Win the War Pinball
  161: 'U4yraMCAm4', // Crypt of the NecroDancer Pinball
  92: 'afSJlqcJ', // DOOM Pinball
  141: 'm0PXAdgeoN', // DreamWorks How to Train Your Dragon Pinball
  139: 'LuGjuCO8X5', // DreamWorks Kung Fu Panda Pinball
  140: 'WMT9p6SoA4', // DreamWorks Trolls Pinball
  96: 'Q0eoaNi8', // E.T. Pinball
  90: 'r-AaNHEG', // Fallout Pinball
  145: 'ac1sVe4NuU', // Garfield Pinball
  158: 'QMLNe1qCrN', // Godzilla Pinball
  160: '4VaNRfBCyN', // Godzilla vs. Kong Pinball
  150: 'jxiVspOPjc', // Homeworld: Journey to Hiigara Pinball
  95: 'XWuSTJd_', // Jaws Pinball
  100: 'CIyg-Fkr', // Jurassic Park Pinball
  102: 'l5NF9UsQ', // Jurassic Park Pinball Mayhem
  101: 'yZxX7BhI', // Jurassic World Pinball
  177: 'iBh5ImB1GE', // Knight Rider Pinball
  153: '-e2yRulgXR', // Kong Pinball
  138: 'Iar1iFvVkh', // My Little Pony Pinball
  186: '4Ixrmq5_eS', // Pacific Rim Pinball
  146: 'EKrqbaCT5u', // Peanuts' Snoopy Pinball
  4: 'vCarNqyA', // South Park: Super Sweet Pinball
  55: 'ym4kiB_D', // South Park: Butters' Very Own Pinball Game
  91: 'Gda1Ftiy', // The Elder Scrolls V: Skyrim Pinball
  154: 'UxqQoD3Fd0', // World War Z Pinball
  167: '0BxxyhvO1Q', // Xena: Warrior Princess Pinball
  106: 'aEKL3AQS', // Star Wars Pinball: Calrissian Chronicles
  107: '-ADs8A2T', // Star Wars Pinball: Battle of Mimban
  104: 'RP516eQB', // Star Wars Pinball: Ahch-To Island
  53: 'UNmAoob8', // Star Wars Pinball: Boba Fett
  137: 'NQBEdl2_LU', // Star Wars Pinball: Classic Collectibles
  28: 'XZYNNi6Q', // Star Wars Pinball: Darth Vader
  58: 'IBo3BQ9R', // Star Wars Pinball: Droids
  12: '2X4QrVSl', // Star Wars Pinball: Episode IV A New Hope
  43: 'X8tW8BSq', // Star Wars Pinball: Episode V The Empire Strikes Back
  24: '2HRbDI1s', // Star Wars Pinball: Episode VI Return of the Jedi
  10: 'wOcpiLN5', // Star Wars Pinball: Han Solo
  2: 'zM2gyg3v', // Star Wars Pinball: Masters of the Force
  89: 'aD15MFIl', // Star Wars Pinball: Might of the First Order
  98: 'Wq6-Ja_Z', // Star Wars Pinball: Rogue One
  105: 'YOnTzG4i', // Star Wars Pinball: Solo
  77: '5-Xujd2f', // Star Wars Pinball: Star Wars Rebels
  6: '-QapTUxg', // Star Wars Pinball: Starfighter Assault
  47: 'gc_fCLKX', // Star Wars Pinball: The Clone Wars
  88: 'l_Goj8OT', // Star Wars Pinball: The Force Awakens
  103: '9OiBgvNc', // Star Wars Pinball: The Last Jedi
  136: 'ASNPgDCBTL', // Star Wars Pinball: The Mandalorian
  79: '2_JLJXjg', // Marvel's Ant-Man
  78: 'EtvgYOOC', // Marvel's Avengers: Age of Ultron
  45: 'SPr7u47N', // Marvel Pinball: Blade
  48: 'ZmBDqqWq', // Marvel Pinball: Captain America
  1: 'lJZbvtXM', // Marvel Pinball: Civil War
  22: '-bv6-HSX', // Marvel Pinball: Deadpool
  30: 'ag17FVP8', // Marvel Pinball: Doctor Strange
  38: 'hXrY9de4', // Marvel Pinball: Fantastic Four
  5: 'WHFVK2U2', // Marvel Pinball: Fear Itself
  21: 'HrBzAuzI', // Marvel Pinball: Ghost Rider
  50: 'pCiHQy7m', // Marvel Pinball: Guardians of the Galaxy
  65: '81x-JmcS', // Marvel Pinball: Iron Man
  49: 'sO1oqiw2', // Marvel Pinball: Moon Knight
  46: 'Em0MXlrN', // Marvel Pinball: Spider-Man
  17: 'eeD6wgDQ', // Marvel Pinball: The Avengers
  60: 'rjPOmeGe', // Marvel Pinball: The Infinity Gauntlet
  7: 'P6DNo4w2', // Marvel Pinball: Thor
  73: 'ZQ23Ls6t', // Marvel Pinball: Venom
  71: '8be3V_4N', // Marvel Pinball: Wolverine
  93: 'YDtIBV05', // Marvel's Women of Power: A-Force
  94: 'fOUA_24M', // Marvel's Women of Power: Champions
  56: 'wN2A3iiB', // Marvel Pinball: World War Hulk
  59: 'phOiYA09', // Marvel Pinball: X-Men
};

export const PINBALLFX_TABLES: readonly PinballFxTable[] = TABLES.map(([id, title, manufacturer, year]) => {
  const vps = VPS_IDS[id];
  return { id, title, manufacturer, ...(year === undefined ? {} : { year }), ...(vps ? { vps } : {}) };
});

const BY_ID = new Map(PINBALLFX_TABLES.map((t) => [t.id, t]));

/** Images de la base VPS : seules celles de son site sont téléchargées (même règle que le catalogue). */
const VPS_IMAGE = /^https:\/\/virtualpinballspreadsheet\.github\.io\/vps-db\/img\//;

/**
 * Capture de la table que donne la base VPS : celle de sa version Pinball FX, sinon de Pinball
 * FX3, sinon (machine Williams ou Bally sans version FX chez VPS) d'une recréation de la même
 * machine. Une vue du plateau, en hauteur : vignette de la liste, image du plateau à défaut.
 */
export function pinballFxVpsImage(vps: Pick<VpsDb, 'games'>, table: PinballFxTable): string | undefined {
  const game = table.vps ? vps.games.find((g) => g.id === table.vps) : undefined;
  const files = (game?.tableFiles ?? []).filter((f) => f.imgUrl && VPS_IMAGE.test(f.imgUrl));
  const rank = (f: VpsTableFile) => ['FX', 'FX3', 'FX2'].indexOf(f.tableFormat ?? '') + 1 || 9;
  return [...files].sort((a, b) => rank(a) - rank(b))[0]?.imgUrl;
}

export function pinballFxTable(id: number): PinballFxTable | undefined {
  return BY_ID.get(id);
}

/** Identifiant d'inventaire d'une table de Pinball FX : « pinballfx/156 ». */
export function pinballFxEntryId(tableId: number): string {
  return `${PINBALLFX_ID_PREFIX}${tableId}`;
}

/** Numéro de table d'un identifiant d'inventaire, ou undefined si ce n'est pas une table de Pinball FX. */
export function pinballFxTableId(entryId: string): number | undefined {
  if (!entryId.startsWith(PINBALLFX_ID_PREFIX)) return undefined;
  const n = Number(entryId.slice(PINBALLFX_ID_PREFIX.length));
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

// ---------------------------------------------------------------------------
// Installation : Steam ou Epic
// ---------------------------------------------------------------------------

export type PinballFxStore = 'steam' | 'epic';

export interface PinballFxInstall {
  store: PinballFxStore;
  /** Dossier du jeu (…\steamapps\common\Pinball FX). */
  gameDir: string;
  /** steam.exe pour Steam ; exécutable du jeu pour Epic. */
  launcher: string;
  /** Dossier du mode borne : images de fronton et Settings.ini. */
  cabinetDir: string;
}

type VdfNode = { [key: string]: string | VdfNode };

/** Lecture des fichiers texte de Steam (KeyValues : "clé" "valeur" et "clé" { … }). */
export function parseVdf(text: string): VdfNode {
  const tokens: string[] = [];
  const re = /"((?:[^"\\]|\\.)*)"|([{}])|\/\/[^\n]*/g;
  for (let m = re.exec(text); m; m = re.exec(text)) {
    if (m[1] !== undefined) tokens.push(m[1].replace(/\\\\/g, '\\').replace(/\\"/g, '"'));
    else if (m[2]) tokens.push(m[2]);
  }
  let i = 0;
  const readObject = (): VdfNode => {
    const node: VdfNode = {};
    while (i < tokens.length) {
      const key = tokens[i++]!;
      if (key === '}') return node;
      if (key === '{') continue;
      const next = tokens[i++];
      if (next === undefined) break;
      node[key] = next === '{' ? readObject() : next;
    }
    return node;
  };
  return readObject();
}

function readText(file: string): string | undefined {
  try {
    return fs.readFileSync(file, 'utf8');
  } catch {
    return undefined;
  }
}

/** Bibliothèques de Steam (steamapps\libraryfolders.vdf), dossier principal compris. */
export function steamLibraries(steamDir: string): string[] {
  const libs = [steamDir];
  const text = readText(path.join(steamDir, 'steamapps', 'libraryfolders.vdf'));
  if (text) {
    const root = parseVdf(text);
    const folders = (root['libraryfolders'] ?? root['LibraryFolders']) as VdfNode | undefined;
    for (const value of Object.values(folders ?? {})) {
      const p = typeof value === 'string' ? value : typeof value['path'] === 'string' ? value['path'] : undefined;
      if (p && !libs.some((l) => path.resolve(l).toLowerCase() === path.resolve(p).toLowerCase())) libs.push(p);
    }
  }
  return libs;
}

/** Pinball FX installé par Steam : manifeste appmanifest_2328760.acf dans l'une des bibliothèques. */
export function findSteamPinballFx(steamDir: string): PinballFxInstall | undefined {
  const steamExe = path.join(steamDir, 'steam.exe');
  for (const lib of steamLibraries(steamDir)) {
    const state = steamAppState(lib);
    if (!state || !steamAppComplete(state)) continue;
    const installdir = typeof state['installdir'] === 'string' ? state['installdir'] : 'Pinball FX';
    const gameDir = path.join(lib, 'steamapps', 'common', installdir);
    if (!fs.existsSync(gameDir)) continue;
    return { store: 'steam', gameDir, launcher: steamExe, cabinetDir: cabinetDirOf(gameDir) };
  }
  return undefined;
}

/** AppState du manifeste de Pinball FX dans une bibliothèque de Steam, s'il y en a un. */
function steamAppState(lib: string): VdfNode | undefined {
  const text = readText(path.join(lib, 'steamapps', `appmanifest_${PINBALLFX_STEAM_APPID}.acf`));
  const state = text ? parseVdf(text)['AppState'] : undefined;
  return state && typeof state === 'object' ? state : undefined;
}

/**
 * Jeu entièrement installé : drapeau 4 (« FullyInstalled ») de StateFlags. Steam écrit le manifeste
 * dès le début du téléchargement ; sans ce contrôle, une table se lancerait sur un jeu à moitié
 * reçu. Un manifeste sans StateFlags (ancien format) vaut installé.
 */
function steamAppComplete(state: VdfNode): boolean {
  const flags = state['StateFlags'];
  if (typeof flags !== 'string') return true;
  const n = Number(flags);
  return Number.isFinite(n) && (n & 4) === 4;
}

/** Pinball FX en cours de téléchargement ou de mise à jour dans Steam (manifeste présent, jeu incomplet). */
export function steamPinballFxDownloading(steamDir: string): boolean {
  return steamLibraries(steamDir).some((lib) => {
    const state = steamAppState(lib);
    return state !== undefined && !steamAppComplete(state);
  });
}

/** Pinball FX installé par Epic : manifeste *.item dont le nom affiché est « Pinball FX ». */
export function findEpicPinballFx(manifestsDir: string): PinballFxInstall | undefined {
  let files: string[];
  try {
    files = fs.readdirSync(manifestsDir).filter((f) => f.toLowerCase().endsWith('.item'));
  } catch {
    return undefined;
  }
  for (const f of files) {
    try {
      const item = JSON.parse(fs.readFileSync(path.join(manifestsDir, f), 'utf8')) as Record<string, unknown>;
      if (typeof item['DisplayName'] !== 'string' || item['DisplayName'].trim().toLowerCase() !== 'pinball fx') continue;
      const gameDir = typeof item['InstallLocation'] === 'string' ? item['InstallLocation'] : undefined;
      const exe = typeof item['LaunchExecutable'] === 'string' ? item['LaunchExecutable'] : undefined;
      if (!gameDir || !exe || !fs.existsSync(gameDir)) continue;
      return { store: 'epic', gameDir, launcher: path.join(gameDir, exe), cabinetDir: cabinetDirOf(gameDir) };
    } catch {
      // Manifeste illisible : ignoré.
    }
  }
  return undefined;
}

function cabinetDirOf(gameDir: string): string {
  return path.join(gameDir, 'PinballFX', 'Mods', 'Cabinet');
}

export interface PinballFxSearch {
  /** Dossier de Steam (registre HKCU\Software\Valve\Steam, SteamPath). */
  steamDir?: string;
  /** Manifestes d'Epic (C:\ProgramData\Epic\EpicGamesLauncher\Data\Manifests). */
  epicManifestsDir?: string;
}

export function findPinballFx(search: PinballFxSearch): PinballFxInstall | undefined {
  return (
    (search.steamDir ? findSteamPinballFx(search.steamDir) : undefined) ??
    (search.epicManifestsDir ? findEpicPinballFx(search.epicManifestsDir) : undefined)
  );
}

/** Installation par Steam : sa fenêtre « Installer », ou la page du jeu en boutique s'il n'est pas sur le compte. */
export const PINBALLFX_STEAM_INSTALL_URL = `steam://install/${PINBALLFX_STEAM_APPID}`;
/** Page de Pinball FX dans le lanceur d'Epic. */
export const PINBALLFX_EPIC_STORE_URL = 'com.epicgames.launcher://store/p/pinball-fx';

/** Comment obtenir Pinball FX quand il n'est pas installé : par Steam d'abord, sinon par Epic. */
export type PinballFxGetter = { store: 'steam'; file: string; args: string[] } | { store: 'epic'; url: string };

export interface PinballFxStores {
  /** Dossier de Steam, s'il est installé. */
  steamDir?: string;
  /** Le lanceur d'Epic est installé. */
  epic?: boolean;
}

/**
 * Steam ouvert sur l'installation de Pinball FX (steam.exe reçoit l'adresse : rien ne dépend de
 * l'association du protocole steam://), sinon le lanceur d'Epic sur sa page ; ni l'un ni l'autre :
 * rien à ouvrir, le joueur installe d'abord une boutique.
 */
export function pinballFxGetter(stores: PinballFxStores): PinballFxGetter | undefined {
  const steamExe = stores.steamDir ? path.join(stores.steamDir, 'steam.exe') : undefined;
  if (steamExe && fs.existsSync(steamExe)) return { store: 'steam', file: steamExe, args: [PINBALLFX_STEAM_INSTALL_URL] };
  if (stores.epic) return { store: 'epic', url: PINBALLFX_EPIC_STORE_URL };
  return undefined;
}

/** Commande de lancement direct d'une table. */
export function pinballFxCommand(
  install: PinballFxInstall,
  tableId: number,
  mode: PinballFxGameMode = 'Classic',
): { file: string; args: string[] } {
  const game = ['-Table', String(tableId), '-GameMode', mode];
  return install.store === 'steam'
    ? { file: install.launcher, args: ['-applaunch', PINBALLFX_STEAM_APPID, ...game] }
    : { file: install.launcher, args: game };
}

/** Image de fronton propre à une table, lue par le mode borne du jeu. */
export function pinballFxBackglassFile(install: PinballFxInstall, tableId: number): string {
  return path.join(install.cabinetDir, `Table_${tableId}.png`);
}
