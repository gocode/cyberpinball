// Critère de sortie du jalon 3 : chaque règle du médecin détecte son cas sur une
// table piégée exprès. Une table saine sert de témoin : elle ne déclenche rien.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, FINDING_CODES, pupMemory, pupOptionOps, scriptFacts, setPupMemory, tablePupPacks, type DoctorContext, type Finding } from '../doctor';
import type { PupCabinet } from '../puppack';
import { applyOps, sameFile, type FileOp } from '../fileops';
import { planJourney } from '../journey';
import { mediaErrorsFile, readMediaErrors, recordMediaError } from '../mediaerrors';
import { blocksPlay, playBlockers } from '../playable';
import { readInfo, scanTables, type TableEntry } from '../tables';
import { buildZip } from '../romzip';
import { devPcDisplays, framedFullDmd, starTrekPack, vpxWithScript } from './fixtures';
import { pngFrame } from '../fulldmdframe';
import { dressScreen, tableDressing } from '../fulldmdtable';
import type { Cabinet, PhysicalScreen } from '../model';
import { encodePng } from '../png';
import { buildScriptPatch } from '../scriptpatch';

const SCRIPT = 'Const cGameName="afm_113b"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = cGameName\r\n';
const TABLE = 'Attack from Mars (Bally 1995)';
/** Même table, avec un PuP-Pack chargé par le script. */
const PUP_SCRIPT = `${SCRIPT}Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\nPuPlayer.B2SInit "", cGameName\r\n`;
/** Même table, dont le script coupe le pack (« usePUP = False », comme 2001 : A Space Odyssey). */
const PUP_OFF_SCRIPT = `${SCRIPT}usePUP = False\r\nIf usePUP = True Then\r\n  Set PuPlayer = CreateObject("PinUpPlayer.PinDisplay")\r\n  PuPlayer.B2SInit "", cGameName\r\nEnd If\r\n`;
/** Même table refaite sans ROM, en FlexDMD, dont le script ne lance jamais PuP (Game of Thrones LE, VPW). */
const NO_PUP_SCRIPT = 'Const cGameName="afm_113b"\r\nSub Table1_Init\r\n  LoadEM\r\n  Set FlexDMD = CreateObject("FlexDMD.FlexDMD")\r\nEnd Sub\r\n';
/** Borne à trois écrans : backglass, DMD 4:1, pas de topper ; playfield 16:9 couché, Windows en paysage. */
const CABINET: PupCabinet = {
  backglass: true,
  dmd: true,
  topper: false,
  dmdRatio: 4,
  backglassRatio: 16 / 9,
  aspects: { playfield: 16 / 9, backglass: 16 / 9, dmd: 4 },
};
const HEADER = 'ScreenNum,ScreenDes,PlayList,PlayFile,Loopit,Active,Priority,CustomPos';
const SCREENS = `${HEADER}\r\n0,Topper,,,0,Off,0,\r\n2,Backglass,,,0,ForceON,0,\r\n5,FullDMD,,,0,ForceON,0,\r\n`;

function write(file: string, content: string | Buffer = ''): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

// --- Médias factices : de vrais en-têtes (dimensions lues par readMediaDimensions), le reste vide. ---

function chunk(type: string, data: Buffer): Buffer {
  const len = Buffer.alloc(4);
  len.writeUInt32BE(data.length);
  return Buffer.concat([len, Buffer.from(type, 'latin1'), data, Buffer.alloc(4)]);
}

function png(width: number, height: number): Buffer {
  const ihdr = Buffer.alloc(13);
  ihdr.writeUInt32BE(width, 0);
  ihdr.writeUInt32BE(height, 4);
  ihdr[8] = 8;
  ihdr[9] = 6;
  const signature = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  return Buffer.concat([signature, chunk('IHDR', ihdr), chunk('IDAT', Buffer.alloc(10)), chunk('IEND', Buffer.alloc(0))]);
}

function box(type: string, ...payload: Buffer[]): Buffer {
  const body = Buffer.concat(payload);
  const head = Buffer.alloc(8);
  head.writeUInt32BE(8 + body.length);
  head.write(type, 4, 'latin1');
  return Buffer.concat([head, body]);
}

/** MP4 réduit à ftyp et moov > trak > tkhd (version 0, matrice identité). */
function mp4(width: number, height: number): Buffer {
  const t = Buffer.alloc(84);
  t.writeInt32BE(0x10000, 40);
  t.writeInt32BE(0x10000, 56);
  t.writeInt32BE(0x40000000, 72);
  t.writeUInt32BE(width * 65536, 76);
  t.writeUInt32BE(height * 65536, 80);
  return Buffer.concat([box('ftyp', Buffer.from('isom\0\0\0\0isomavc1', 'latin1')), box('moov', box('trak', box('tkhd', t)))]);
}

/** Fichier de medias\ de la table. */
const media = (folder: string, name: string) => path.join(folder, 'medias', name);

/** Médias sains : chaque type au bon nom, aux proportions de son écran. */
function healthyMedias(folder: string): void {
  write(media(folder, `(Wheel) ${TABLE}.png`), png(512, 512));
  write(media(folder, `(Playfield) ${TABLE}.mp4`), mp4(1920, 1080));
  write(media(folder, `(Backglass) ${TABLE}.mp4`), mp4(1920, 1080));
  write(media(folder, `(DMD) ${TABLE}.png`), png(512, 128));
  write(media(folder, `(GameHelp) ${TABLE}.png`), png(800, 600));
  write(media(folder, `(GameHelp) ${TABLE} 2.png`), png(800, 600));
}

/** Journaux (erreurs de lecture des médias), à côté des tables piégées. */
const logsOf = (folder: string) => path.join(path.dirname(folder), '_journaux');

/** Une table saine dans son dossier : backglass, ROM rangée, .info. */
function healthyTable(tablesDir: string): string {
  const folder = path.join(tablesDir, TABLE);
  write(path.join(folder, `${TABLE}.vpx`), 'vpx');
  write(path.join(folder, `${TABLE}.directb2s`), 'b2s');
  write(path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'), 'rom');
  write(path.join(folder, `${TABLE}.info`), '{}');
  return folder;
}

/** Pack sain : pupvideos\afm_113b, option appliquée (les .pup de la racine sont ceux de l'option 1). */
function healthyPack(folder: string): string {
  const pack = path.join(folder, 'pupvideos', 'afm_113b');
  for (const dir of ['', path.join('PuP-Pack_Options', 'Option 1 - Backglass DMD Separate')]) {
    write(path.join(pack, dir, 'screens.pup'), SCREENS);
    write(path.join(pack, dir, 'triggers.pup'), 'triggers');
  }
  write(path.join(pack, 'Option 1 - Backglass DMD Separate.bat'), 'xcopy /y "PuP-Pack_Options\\Option 1 - Backglass DMD Separate\\*"\r\n');
  write(path.join(pack, 'Backglass', 'attract.mp4'), 'mp4');
  // Le pack occupe la fenêtre du DMD (écran 5) d'une table à ROM : le DMD de la ROM reste devant.
  write(path.join(folder, `${TABLE}.ini`), '[ScoreView]\r\nPriority.PUP = 0\r\n');
  return pack;
}

/** Bibliothèque de ROM du dossier des tables piégé (à côté des tables, sans .vpx). */
const libraryOf = (folder: string) => path.join(path.dirname(folder), '_bibliotheque');

interface Trap {
  code: Finding['code'];
  /** Pose le piège dans la table saine (ou ailleurs dans le dossier des tables). */
  arm: (folder: string, tablesDir: string) => void;
  script?: DoctorContext['script'];
  /** Contexte en plus (journal de VPX), qui peut dépendre du dossier de la table. */
  ctx?: (folder: string) => Partial<DoctorContext>;
}

const TRAPS: Trap[] = [
  {
    code: 'outsideFolder',
    arm: (folder, tablesDir) => {
      for (const f of fs.readdirSync(folder)) fs.rmSync(path.join(folder, f), { recursive: true });
      fs.rmdirSync(folder);
      write(path.join(tablesDir, `${TABLE}.vpx`), 'vpx');
    },
  },
  { code: 'scriptOverride', arm: (folder) => write(path.join(folder, `${TABLE}.vbs`), 'script extrait') },
  // .vbs de Cyber Pinball (PuP-Pack allumé) tiré du script d'une version précédente de la table.
  {
    code: 'scriptPatchStale',
    arm: (folder) => {
      write(path.join(folder, `${TABLE}.vpx`), vpxWithScript(PUP_OFF_SCRIPT.replace('3.26', '3.27')));
      write(path.join(folder, `${TABLE}.vbs`), buildScriptPatch(PUP_OFF_SCRIPT, [scriptFacts(PUP_OFF_SCRIPT).pup!.disabledBy!])!);
    },
  },
  { code: 'backglassMissing', arm: (folder) => fs.rmSync(path.join(folder, `${TABLE}.directb2s`)) },
  {
    code: 'backglassMisnamed',
    arm: (folder) => fs.renameSync(path.join(folder, `${TABLE}.directb2s`), path.join(folder, '1492939964_AttackFromMars(Bally1995)v2.directb2s')),
  },
  { code: 'backglassStray', arm: (folder) => write(path.join(folder, 'Ancien backglass.directb2s'), 'b2s') },
  { code: 'romMissing', arm: (folder) => fs.rmSync(path.join(folder, 'pinmame'), { recursive: true }) },
  {
    code: 'romMisplaced',
    arm: (folder) => fs.renameSync(path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'), path.join(folder, 'afm_113b.zip')),
  },
  // Bibliothèque de ROM : la ROM y est, mais la table n'a pas de lien.
  {
    code: 'romNotLinked',
    arm: (folder) => {
      write(path.join(libraryOf(folder), 'afm_113b.zip'), 'rom');
      fs.rmSync(path.join(folder, 'pinmame'), { recursive: true });
    },
    ctx: (folder) => ({ romLibrary: libraryOf(folder) }),
  },
  // Puces de la ROM déballées à la racine de la table (ancien import d'un zip à sous-dossier).
  {
    code: 'romScattered',
    arm: (folder) => {
      fs.rmSync(path.join(folder, 'pinmame'), { recursive: true });
      write(path.join(folder, 'afm_113b.rom'), 'puce');
      write(path.join(folder, 'afm_u6.l1'), 'son');
    },
  },
  // ROM dont les puces sont dans un sous-dossier du zip : PinMAME ne la lit pas.
  {
    code: 'romNested',
    arm: (folder) => {
      const chip = path.join(folder, 'puce.tmp');
      write(chip, 'puce');
      write(path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'), buildZip([{ from: chip, name: 'afm_113b/afm_113b.rom' }]));
      fs.rmSync(chip);
    },
  },
  // Copie identique au lieu d'un lien.
  { code: 'romCopy', arm: (folder) => write(path.join(libraryOf(folder), 'afm_113b.zip'), 'rom'), ctx: (folder) => ({ romLibrary: libraryOf(folder) }) },
  // Alias de ROM (romalias.ts) : révision voisine dans la bibliothèque, ancien nom de VPinMAME, alias devenu inutile.
  {
    code: 'romAlias',
    arm: (folder) => {
      fs.rmSync(path.join(folder, 'pinmame'), { recursive: true });
      write(path.join(libraryOf(folder), 'afm_11.zip'), 'rom 1.1');
    },
    ctx: (folder) => ({ romLibrary: libraryOf(folder) }),
  },
  {
    code: 'romAliasHistoric',
    arm: (folder) => {
      fs.rmSync(path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'));
      write(path.join(folder, 'pinmame', 'roms', 'bond.zip'), 'rom bond');
    },
    script: scriptFacts('Const cGameName="goldfinger"\r\nLoadVPM "01560000", "S11.VBS", 3.26\r\nController.GameName = cGameName\r\n'),
  },
  { code: 'romAliasObsolete', arm: (folder) => write(path.join(folder, 'pinmame', 'alias.txt'), '# révision voisine\r\nafm_113b,afm_11\r\n') },
  { code: 'romUnknown', arm: () => {}, script: scriptFacts('LoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = RomChoisie()\r\n') },
  {
    code: 'dmdFolderMissing',
    arm: () => {},
    script: scriptFacts(`${SCRIPT}With FlexDMD\r\n  .ProjectFolder = "./TheGooniesDMD/"\r\nEnd With\r\n`),
  },
  { code: 'scriptUnreadable', arm: () => {}, script: { error: 'VPinballX -ExtractVBS a échoué (code 1)' } },
  {
    code: 'crashReport',
    arm: (folder) => {
      write(path.join(folder, 'crash.txt'), 'Reason: 0xC0000005 - EXCEPTION_ACCESS_VIOLATION\n');
      write(path.join(folder, 'crash.dmp'), 'x'.repeat(1024));
    },
  },
  { code: 'infoMissing', arm: (folder) => fs.rmSync(path.join(folder, `${TABLE}.info`)) },
  // PuP-Packs (docs/recherche/pup-packs.md, § 4.4).
  { code: 'pupMissing', arm: (folder) => write(path.join(folder, 'pupvideos', 'AFM PuP-Pack v2', 'screens.pup'), SCREENS), script: scriptFacts(PUP_SCRIPT) },
  {
    code: 'pupNested',
    arm: (folder) => {
      const pack = healthyPack(folder);
      const inner = path.join(path.dirname(pack), 'tmp');
      fs.renameSync(pack, inner);
      fs.mkdirSync(pack);
      fs.renameSync(inner, path.join(pack, 'afm_113b'));
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    code: 'pupOrphan',
    arm: (folder) => {
      healthyPack(folder);
      write(path.join(folder, 'pupvideos', 'afm_10', 'screens.pup'), SCREENS);
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    code: 'pupOptionNotApplied',
    arm: (folder) => {
      const pack = healthyPack(folder);
      for (const f of ['screens.pup', 'triggers.pup']) fs.rmSync(path.join(pack, f));
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    // Option appliquée faite pour une borne sans DMD (encart vide), alors que la borne en a un.
    code: 'pupOptionUnsuited',
    arm: (folder) => {
      const pack = path.join(folder, 'pupvideos', 'afm_113b');
      fs.mkdirSync(pack, { recursive: true });
      starTrekPack(pack);
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    // Option choisie dans la fiche (3), fichiers d'une autre (1) en place : un .bat lancé à la main.
    code: 'pupOptionMismatch',
    arm: (folder) => {
      const pack = path.join(folder, 'pupvideos', 'afm_113b');
      fs.mkdirSync(pack, { recursive: true });
      starTrekPack(pack);
      write(path.join(folder, `${TABLE}.info`), JSON.stringify({ CyberPinball: { pup: { afm_113b: { option: 'Option 3 - BG and Topper Seperate', chosen: 'user' } } } }));
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    code: 'pupScreenAbsent',
    arm: (folder) => {
      const pack = healthyPack(folder);
      // Topper allumé à la racine et dans l'option : la borne n'en a pas.
      const topper = SCREENS.replace('0,Topper,,,0,Off,0,', '0,Topper,,,0,ForceON,0,');
      write(path.join(pack, 'screens.pup'), topper);
      write(path.join(pack, 'PuP-Pack_Options', 'Option 1 - Backglass DMD Separate', 'screens.pup'), topper);
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    code: 'pupPlayfieldScreen',
    arm: (folder) => {
      const pack = healthyPack(folder);
      const playfield = `${SCREENS}3,Playfield,,,0,ForcePoP,0,\r\n`;
      write(path.join(pack, 'screens.pup'), playfield);
      write(path.join(pack, 'PuP-Pack_Options', 'Option 1 - Backglass DMD Separate', 'screens.pup'), playfield);
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    code: 'pupScriptDriven',
    arm: (folder) => write(path.join(folder, 'pupvideos', 'afm_113b', 'Attract', 'intro.mp4'), 'mp4'),
    script: scriptFacts(`${PUP_SCRIPT}PuPlayer.playlistadd 2, "Attract", 1, 0\r\n`),
  },
  // Pack bien rangé, que le script ne lance jamais (« usePUP = False »).
  // Playlist dont l'image transparente « aaclear.png » passe après « Overlay1.png » pour le plugin PUP.
  {
    code: 'pupPlaylistOrder',
    arm: (folder) => {
      const pack = healthyPack(folder);
      write(path.join(pack, 'PupAlphas', 'aaclear.png'), 'png');
      write(path.join(pack, 'PupAlphas', 'Overlay1.png'), 'png');
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  // Image PNG nommée comme une vidéo (Game of Thrones LE : « Stark.mp4 ») : jouée en boucle d'une image.
  {
    code: 'pupFileNames',
    arm: (folder) => {
      const pack = healthyPack(folder);
      write(path.join(pack, 'Attract', 'logo.mp4'), Buffer.from('89504e470d0a1a0a0000000d49484452', 'hex'));
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  // Déclencheur actif dont le fichier n'est pas dans le pack.
  {
    code: 'pupFilesMissing',
    arm: (folder) => {
      const pack = healthyPack(folder);
      write(path.join(pack, 'Attract', 'intro.mp4'), Buffer.from('000000146674797069736f6d', 'hex'));
      write(path.join(pack, 'triggers.pup'), 'ID,Active,Descript,Trigger,ScreenNum,PlayList,PlayFile\r\n1,1,Intro,D1,2,Attract,absent.mp4\r\n');
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  // Pack dans la fenêtre du DMD d'une table à ROM, sans réglage pour elle : le score serait caché.
  {
    code: 'pupHidesDmd',
    arm: (folder) => {
      healthyPack(folder);
      fs.rmSync(path.join(folder, `${TABLE}.ini`));
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    code: 'pupDisabledByScript',
    arm: (folder) => {
      healthyPack(folder);
      write(path.join(folder, `${TABLE}.vpx`), vpxWithScript(PUP_OFF_SCRIPT));
    },
    script: scriptFacts(PUP_OFF_SCRIPT),
  },
  // Table originale en FlexDMD dont le script ne lance jamais PuP (Game of Thrones LE, VPW).
  {
    code: 'pupNotLoaded',
    arm: (folder) => {
      healthyPack(folder);
      write(path.join(folder, `${TABLE}.vpx`), vpxWithScript(NO_PUP_SCRIPT));
    },
    script: scriptFacts(NO_PUP_SCRIPT),
  },
  {
    code: 'pupCaptureUnseen',
    arm: (folder) => {
      const pack = healthyPack(folder);
      write(path.join(pack, 'triggers.pup'), 'ID,Active,Descript,Trigger,ScreenNum,PlayList\r\n2,1,Drain,D2,2,Drain\r\n');
      write(path.join(pack, 'PupCapture', '2.bmp'), 'bmp');
    },
    script: scriptFacts(NO_PUP_SCRIPT),
  },
  {
    code: 'pupCaptureRom',
    arm: (folder) => {
      const pack = healthyPack(folder);
      write(path.join(pack, 'PupCapture', '1.bmp'), 'bmp');
      // Le pack venait d'un dossier « afm_11 » (autre version de la ROM), renommé à l'import.
      write(path.join(folder, `${TABLE}.info`), JSON.stringify({ CyberPinball: { pup: { afm_113b: { origin: 'afm_11' } } } }));
    },
    script: scriptFacts(PUP_SCRIPT),
  },
  {
    code: 'pupLog',
    arm: (folder) => {
      healthyPack(folder);
    },
    script: scriptFacts(PUP_SCRIPT),
    ctx: (folder) => ({
      vpxLog: [
        `2026-10-20 21:00:00.000 INFO  [Main] [PinTable::LoadGameFromFilename@1419] LoadGameFromFilename ${path.join(folder, `${TABLE}.vpx`)}`,
        // Lignes de VPX 10.8.1 lancé par Cyber Pinball (sans l'éditeur : jamais « Starting Play mode »).
        '2026-10-20 21:00:02.500 INFO  [Main] [MsgPI::MsgPlugin::Load@520] Plugin PUP loaded (library: plugin-pup64.dll) [id=13]',
        '2026-10-20 21:00:02.600 INFO  [Main] [Player::Player@727] Starting script',
        `2026-10-20 21:00:03.000 INFO  [Main] [PUP::PUPManager::SetGameDir@155] PUP path: ${path.join(folder, 'pupvideos', 'afm_113b')}`,
        '2026-10-20 21:00:03.100 INFO  [Main] [PUP::PUPManager::LoadConfig@213] No screens.pup file found',
      ].join('\r\n'),
    }),
  },
  {
    code: 'manualView',
    arm: (folder) => write(path.join(folder, `${TABLE}.ini`), '[Player]\r\nCabinetAutofitMode = 0\r\n\r\n[TableOverride]\r\nViewCabVOfs = 12\r\n'),
  },
  // Windows en portrait, joueur en bas : cadrage manuel imposé par la table, sa vue garde la rotation de l'auteur.
  {
    code: 'tableOrientation',
    arm: (folder) => write(path.join(folder, `${TABLE}.ini`), '[Player]\r\nCabinetAutofitMode = 0\r\n'),
    ctx: () => ({ orientation: portraitOrientation() }),
  },
  // DMD posé dans le cadre d'un PuP-Pack, enregistré pour la table par le menu de VPX.
  {
    code: 'tableWindows',
    arm: (folder) => write(path.join(folder, `${TABLE}.ini`), '[ScoreView]\r\nScoreViewWndX = 760\r\nScoreViewWndY = 860\r\nScoreViewWidth = 400\r\nScoreViewHeight = 100\r\n\r\n[Player]\r\nCabinetAutofitPos = 0.1\r\n'),
  },
  // Habillage FullDMD (fulldmdtable.ts) : le .ini de la table met le DMD sur tout l'écran, par-dessus l'habillage.
  {
    code: 'fullDmdHidden',
    arm: (folder) => {
      write(media(folder, `(FullDMD) ${TABLE}.png`), encodePng(framedFullDmd({ width: 1920, height: 1080 }).image));
      write(path.join(folder, `${TABLE}.ini`), '[ScoreView]\r\nScoreViewFullScreen = 1\r\n');
    },
    ctx: (folder) => {
      const screen = (fingerprint: string): PhysicalScreen => ({ fingerprint, strength: 'strong', label: fingerprint, widthPx: 1920, heightPx: 1080, widthCm: 48, heightCm: 27 });
      const cabinet: Cabinet = { version: 1, screens: [screen('PF'), screen('DMD')], roles: { playfield: 'PF', dmd: 'DMD' }, dmdKind: 'fulldmd', vpx: { iniPath: 'VPinballX.ini' }, updatedAt: '' };
      const entry = scanTables(path.dirname(folder))[0]!;
      return { dressing: tableDressing(entry, { screen: dressScreen(cabinet), root: path.dirname(folder), cabinet, facts: scriptFacts(SCRIPT), b2sFullDmd: false, frameOf: pngFrame }) };
    },
  },
  // Médias (docs/recherche/medias.md, § 5.5, tâche T11).
  { code: 'mediaUnreadable', arm: (folder) => write(media(folder, `(Backglass) ${TABLE}.flv`), 'flv') },
  { code: 'mediaMisnamed', arm: (folder) => write(media(folder, '(Wheel) Attack From Mars.png'), png(512, 512)) },
  { code: 'mediaStray', arm: (folder) => write(path.join(folder, 'POPMedia', 'Visual Pinball X', 'Wheel', `${TABLE}.png`), png(512, 512)) },
  // Fronton en 4:3 sur un écran 16:9.
  { code: 'mediaRatio', arm: (folder) => write(media(folder, `(Backglass) ${TABLE}.png`), png(1024, 768)) },
  // Vidéo 16:9 rangée en DMD 4:1.
  { code: 'mediaDmdSwapped', arm: (folder) => write(media(folder, `(DMD) ${TABLE}.mp4`), mp4(1920, 1080)) },
  // Logo de 10 000 × 10 000 pixels : 400 Mo une fois décodé.
  { code: 'mediaHuge', arm: (folder) => write(media(folder, `(Wheel) ${TABLE}.png`), png(10000, 10000)) },
  // Logo au nom de la table et au nom fixe de VPinFE : seul le premier est montré.
  {
    code: 'mediaDuplicate',
    arm: (folder) => {
      write(media(folder, `(Wheel) ${TABLE}.png`), png(512, 512));
      write(media(folder, 'wheel.png'), png(512, 512));
    },
  },
  {
    code: 'mediaPlaybackError',
    arm: (folder) => {
      const file = media(folder, `(Backglass) ${TABLE}.mp4`);
      write(file, mp4(1920, 1080));
      recordMediaError(mediaErrorsFile(logsOf(folder)), { file, type: 'Backglass', role: 'backglass', code: 3, message: 'PIPELINE_ERROR_DECODE' });
    },
    ctx: (folder) => ({ logsDir: logsOf(folder) }),
  },
];

test('table témoin : aucune règle ne se déclenche', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  healthyTable(tablesDir);
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(SCRIPT) }), []);
  fs.rmSync(tablesDir, { recursive: true });
});

test('table témoin avec PuP-Pack : pack bien nommé, option appliquée, écrans présents', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  const pack = healthyPack(folder);
  const entry = scanTables(tablesDir)[0]!;
  const log = [`LoadGameFromFilename ${entry.file}`, 'Plugin PUP loaded (library: plugin-pup64.dll)', '[Player::Player@727] Starting script', `PUP path: ${pack}`, '[Player::Player@832] Startup done'].join('\n');
  assert.deepEqual(diagnose(entry, { tablesDir, script: scriptFacts(PUP_SCRIPT), cabinet: CABINET, vpxLog: log }), []);
  fs.rmSync(tablesDir, { recursive: true });
});

test('table témoin liée à la bibliothèque de ROM : aucune règle ne se déclenche', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  const stored = path.join(libraryOf(folder), 'afm_113b.zip');
  fs.mkdirSync(libraryOf(folder));
  fs.renameSync(path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'), stored);
  fs.linkSync(stored, path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'));
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(SCRIPT), romLibrary: libraryOf(folder) }), []);
  fs.rmSync(tablesDir, { recursive: true });
});

test('corrections de la bibliothèque de ROM : lien posé, copie remplacée, le constat disparaît', () => {
  for (const code of ['romNotLinked', 'romCopy'] as const) {
    const trap = TRAPS.find((t) => t.code === code)!;
    const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
    const folder = healthyTable(tablesDir);
    trap.arm(folder, tablesDir);
    const ctx = () => ({ tablesDir, script: scriptFacts(SCRIPT), romLibrary: libraryOf(folder) });
    const finding = diagnose(scanTables(tablesDir)[0]!, ctx()).find((f) => f.code === code)!;
    assert.ok(finding.fix, `${code} : correction attendue`);
    const trashDir = `${tablesDir}-corbeille`;
    applyOps(finding.fix.ops, { trashDir });
    assert.ok(sameFile(path.join(libraryOf(folder), 'afm_113b.zip'), path.join(folder, 'pinmame', 'roms', 'afm_113b.zip')), code);
    assert.ok(!fs.existsSync(trashDir), `${code} : une copie identique ne va pas à la corbeille`);
    assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, ctx()), []);
    fs.rmSync(tablesDir, { recursive: true });
  }
});

test('alias de ROM : révision voisine acceptée, rappelée, puis retirée quand la ROM demandée arrive', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  TRAPS.find((t) => t.code === 'romAlias')!.arm(folder, tablesDir);
  const ctx = () => ({ tablesDir, script: scriptFacts(SCRIPT), romLibrary: libraryOf(folder) });
  const trashDir = `${tablesDir}-corbeille`;
  const first = diagnose(scanTables(tablesDir)[0]!, ctx()).find((f) => f.code === 'romAlias')!;
  assert.equal(first.severity, 'error');
  assert.match(first.detail, /NVRAM/);
  applyOps(first.fix!.ops, { trashDir });
  // La révision voisine est liée, l'alias écrit : reste un rappel.
  assert.ok(sameFile(path.join(libraryOf(folder), 'afm_11.zip'), path.join(folder, 'pinmame', 'roms', 'afm_11.zip')));
  assert.match(fs.readFileSync(path.join(folder, 'pinmame', 'alias.txt'), 'utf8'), /^afm_113b,afm_11\r$/m);
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, ctx()).map((f) => `${f.code}:${f.severity}`), ['romAlias:info']);
  // La ROM demandée arrive : l'alias la cacherait, le médecin propose de le retirer.
  write(path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'), 'rom');
  const obsolete = diagnose(scanTables(tablesDir)[0]!, ctx()).find((f) => f.code === 'romAliasObsolete')!;
  applyOps(obsolete.fix!.ops, { trashDir });
  assert.ok(!fs.existsSync(path.join(folder, 'pinmame', 'alias.txt')), 'plus aucun alias : le fichier part à la corbeille');
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, ctx()).filter((f) => f.code.startsWith('romAlias')), []);
  fs.rmSync(tablesDir, { recursive: true });
});

test('alias historique : la ligne « goldfinger,bond » est écrite, la table démarre sans constat', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  const trap = TRAPS.find((t) => t.code === 'romAliasHistoric')!;
  trap.arm(folder, tablesDir);
  const finding = diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: trap.script }).find((f) => f.code === 'romAliasHistoric')!;
  applyOps(finding.fix!.ops, { trashDir: `${tablesDir}-corbeille` });
  assert.match(fs.readFileSync(path.join(folder, 'pinmame', 'alias.txt'), 'utf8'), /^goldfinger,bond\r$/m);
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: trap.script }), []);
  // Sans bond.zip : le constat dit qu'il la faut, sans correction.
  fs.rmSync(path.join(folder, 'pinmame'), { recursive: true });
  const missing = diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: trap.script }).find((f) => f.code === 'romAliasHistoric')!;
  assert.equal(missing.fix, undefined);
  assert.match(missing.detail, /Il faut aussi bond\.zip/);
  fs.rmSync(tablesDir, { recursive: true });
});

test('dossier pinmame\\roms sans la ROM : PinMAME ne cherche pas ailleurs, le lien est indispensable', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  write(path.join(libraryOf(folder), 'afm_113b.zip'), 'rom');
  fs.rmSync(path.join(folder, 'pinmame', 'roms', 'afm_113b.zip'));
  const ctx = { tablesDir, script: scriptFacts(SCRIPT), romLibrary: libraryOf(folder) };
  const blocked = diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'romNotLinked')!;
  assert.equal(blocked.severity, 'error');
  assert.match(blocked.detail, /ne cherche alors que là/);
  // Sans dossier pinmame\roms, le dossier commun la fournit : un simple conseil.
  fs.rmSync(path.join(folder, 'pinmame'), { recursive: true });
  assert.equal(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'romNotLinked')!.severity, 'info');
  // Dossier vide, ROM nulle part : le constat le dit.
  fs.rmSync(libraryOf(folder), { recursive: true });
  fs.mkdirSync(path.join(folder, 'pinmame', 'roms'), { recursive: true });
  assert.match(diagnose(scanTables(tablesDir)[0]!, ctx).find((f) => f.code === 'romMissing')!.detail, /pinmame\\roms de la table est vide/);
  fs.rmSync(tablesDir, { recursive: true });
});

test('table témoin avec médias : bons noms, bons formats, proportions de la borne', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  healthyMedias(folder);
  // Une seconde version dans le dossier : son fronton porte le nom de son .vpx, celui du dossier sert à l'autre.
  write(path.join(folder, 'Attack from Mars VPW.vpx'), 'vpx');
  write(media(folder, '(Backglass) Attack from Mars VPW.mp4'), mp4(1920, 1080));
  // Ce que le médecin des médias ne regarde pas : PuP-Pack, dossier FlexDMD.
  healthyPack(folder);
  write(path.join(folder, 'AFMDMD', 'Wheel', 'logo.png'), png(10, 10));
  const script = scriptFacts(`${PUP_SCRIPT}With FlexDMD\r\n  .ProjectFolder = "./AFMDMD/"\r\nEnd With\r\n`);
  for (const entry of scanTables(tablesDir)) {
    assert.deepEqual(diagnose(entry, { tablesDir, script, cabinet: CABINET, otherPackNames: ['afm_113b'] }), [], entry.file);
  }
  fs.rmSync(tablesDir, { recursive: true });
});

test('les pièges couvrent toutes les règles du médecin', () => {
  assert.deepEqual(TRAPS.map((t) => t.code).sort(), [...FINDING_CODES].sort());
});

for (const trap of TRAPS) {
  test(`table piégée : ${trap.code}`, () => {
    const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
    const folder = healthyTable(tablesDir);
    trap.arm(folder, tablesDir);
    const [entry] = scanTables(tablesDir);
    const findings = diagnose(entry!, { tablesDir, script: trap.script ?? scriptFacts(SCRIPT), cabinet: CABINET, ...trap.ctx?.(folder) });
    assert.ok(
      findings.some((f) => f.code === trap.code),
      `${trap.code} attendu, constats : ${findings.map((f) => f.code).join(', ') || 'aucun'}`,
    );
    // La règle de playable.ts : seul un constat de ROM est bloquant, et « Jouer » n'attend que lui.
    for (const f of findings) assert.ok(f.severity !== 'error' || blocksPlay(f), `${f.code} classé bloquant`);
    const journey = planJourney({ file: entry!.file, vpxInstalled: true, cabinetConfigured: true, screens: { backglass: true, dmd: 'small', topper: false }, script: trap.script ?? scriptFacts(SCRIPT), findings });
    assert.equal(journey.ready, playBlockers(findings).length === 0, `${trap.code} : « Jouer » ${journey.ready ? 'proposé' : 'retenu'}`);
    assert.ok(journey.extras.every((s) => !s.required));
    assert.ok(journey.steps.every((s) => !s.required || s.state === 'done' || s.id === 'rom' || s.id === 'play'), `${trap.code} : une étape indispensable autre que la ROM`);
    fs.rmSync(tablesDir, { recursive: true });
  });
}

test('corrections des PuP-Packs : appliquées, le constat disparaît', () => {
  for (const code of ['pupMissing', 'pupNested', 'pupOrphan', 'pupOptionNotApplied'] as const) {
    const trap = TRAPS.find((t) => t.code === code)!;
    const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
    const folder = healthyTable(tablesDir);
    trap.arm(folder, tablesDir);
    const ctx = () => ({ tablesDir, script: trap.script, cabinet: CABINET });
    const finding = diagnose(scanTables(tablesDir)[0]!, ctx()).find((f) => f.code === code)!;
    assert.ok(finding.fix, `${code} : correction attendue`);
    const trashDir = `${tablesDir}-corbeille`;
    applyOps(finding.fix.ops, { trashDir });
    const after = diagnose(scanTables(tablesDir)[0]!, ctx()).map((f) => f.code);
    // Ces packs occupent la fenêtre du DMD d'une table à ROM : pupHidesDmd peut suivre, à part.
    assert.ok(!after.some((c) => c.startsWith('pup') && c !== 'pupHidesDmd'), `${code} : reste ${after.join(', ')}`);
    fs.rmSync(tablesDir, { recursive: true });
    fs.rmSync(trashDir, { recursive: true, force: true });
  }
});

test('option inadaptée à la borne : proposée d’office, jamais contre un choix fait dans la fiche', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  TRAPS.find((t) => t.code === 'pupOptionUnsuited')!.arm(folder, tablesDir);
  const ctx = () => ({ tablesDir, script: scriptFacts(PUP_SCRIPT), cabinet: CABINET });
  const entry = () => scanTables(tablesDir)[0]!;
  const finding = diagnose(entry(), ctx()).find((f) => f.code === 'pupOptionUnsuited')!;
  assert.match(finding.detail, /applique « Option 1 - DMD on BG No Topper » \(sans topper · DMD dans le backglass\)/);
  assert.equal(finding.fix!.label, 'Appliquer « Option 3 - BG and Topper Seperate »');
  // La fiche liste les options, l'appliquée et la conseillée.
  const [pack] = tablePupPacks(entry(), CABINET);
  assert.deepEqual([pack!.applied?.label, pack!.recommended?.label], ['Option 1 - DMD on BG No Topper', 'Option 3 - BG and Topper Seperate']);
  // Choix fait dans la fiche : l'option 1 gardée, le médecin ne la remet plus en cause.
  const trashDir = `${tablesDir}-corbeille`;
  applyOps(pupOptionOps(entry(), pack!.root, pack!.pack, pack!.applied!, { chosen: 'user' }), { trashDir });
  assert.equal(pupMemory(readInfo(entry().infoFile), 'afm_113b')?.chosen, 'user');
  assert.ok(!diagnose(entry(), ctx()).some((f) => f.code === 'pupOptionUnsuited'));
  // Correction du médecin : l'option 3 appliquée et retenue, le constat disparaît.
  applyOps(pupMemoryReset(entry()), { trashDir });
  applyOps(diagnose(entry(), ctx()).find((f) => f.code === 'pupOptionUnsuited')!.fix!.ops, { trashDir });
  assert.equal(tablePupPacks(entry(), CABINET)[0]!.applied?.label, 'Option 3 - BG and Topper Seperate');
  assert.equal(pupMemory(readInfo(entry().infoFile), 'afm_113b')?.option, 'Option 3 - BG and Topper Seperate');
  assert.ok(!diagnose(entry(), ctx()).some((f) => f.code === 'pupOptionUnsuited'));
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

/** Le .info sans le choix fait dans la fiche : le médecin juge de nouveau l'option. */
function pupMemoryReset(entry: TableEntry): FileOp[] {
  return [{ op: 'write', path: entry.infoFile, content: JSON.stringify(setPupMemory(readInfo(entry.infoFile), 'afm_113b', {}), null, 2) }];
}

test('« Tout réparer » sur un pack imbriqué sans option : remonté, puis l’option appliquée à l’analyse suivante', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  const pack = healthyPack(folder);
  for (const f of ['screens.pup', 'triggers.pup']) fs.rmSync(path.join(pack, f));
  fs.renameSync(pack, `${pack}-tmp`);
  fs.mkdirSync(pack);
  fs.renameSync(`${pack}-tmp`, path.join(pack, 'afm_113b'));
  const trashDir = `${tablesDir}-corbeille`;
  const ctx = { tablesDir, script: scriptFacts(PUP_SCRIPT), cabinet: CABINET };
  const repairAll = () => {
    const fixable = diagnose(scanTables(tablesDir)[0]!, ctx).filter((f) => f.fix);
    for (const f of fixable) applyOps(f.fix!.ops, { trashDir });
    return fixable.map((f) => f.code);
  };
  assert.deepEqual(repairAll(), ['pupNested']);
  assert.deepEqual(repairAll(), ['pupOptionNotApplied']);
  // L'option appliquée par le médecin est retenue pour la prochaine mise à jour du pack.
  assert.equal(pupMemory(readInfo(path.join(folder, `${TABLE}.info`)), 'afm_113b')?.option, 'Option 1 - Backglass DMD Separate');
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, ctx), []);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('cadrage manuel imposé par la table : la clé est retirée, le reste du .ini gardé, l’ancien à la corbeille', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  const ini = path.join(folder, `${TABLE}.ini`);
  const ctx = () => ({ tablesDir, script: scriptFacts(SCRIPT) });
  const trashDir = `${tablesDir}-corbeille`;
  const repair = () => applyOps(diagnose(scanTables(tablesDir)[0]!, ctx()).find((f) => f.code === 'manualView')!.fix!.ops, { trashDir });
  TRAPS.find((t) => t.code === 'manualView')!.arm(folder, tablesDir);
  repair();
  assert.equal(fs.readFileSync(ini, 'utf8'), '[TableOverride]\r\nViewCabVOfs = 12\r\n');
  assert.equal(fs.readdirSync(trashDir).length, 1);
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, ctx()), []);
  // Seule la clé dans le fichier : il part entier à la corbeille.
  write(ini, '[Player]\nCabinetAutofitMode = Manual\n');
  repair();
  assert.ok(!fs.existsSync(ini));
  // Cadrage automatique choisi pour cette table : rien à signaler.
  write(ini, '[Player]\r\nCabinetAutofitMode = 2\r\n');
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, ctx()), []);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

/** Playfield en portrait dans Windows, joueur en bas, VPinballX.ini synchronisé (vue borne, cadrage automatique). */
function portraitOrientation(globalIni = '[Player]\nBGSet = 1\nCabinetAutofitMode = 1\n'): NonNullable<DoctorContext['orientation']> {
  const d = devPcDisplays()[3]!;
  return { window: { ...d, bounds: { ...d.bounds, width: 1080, height: 1920 }, rotation: 90 }, edge: 'bottom', globalIni };
}

test('table qui change le sens de la partie : constat, réparation, rien quand VPinballX.ini est en cause', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  const ini = path.join(folder, `${TABLE}.ini`);
  const trashDir = `${tablesDir}-corbeille`;
  const findings = (orientation = portraitOrientation()) => diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(SCRIPT), orientation });
  // Cadrage manuel : un seul constat, celui du sens (il remplace « Cadrage manuel imposé »).
  write(ini, '[Player]\r\nCabinetAutofitMode = 0\r\n\r\n[TableOverride]\r\nViewCabRotation = 270\r\n');
  const manual = findings();
  assert.deepEqual(manual.map((f) => f.code), ['tableOrientation']);
  assert.match(manual[0]!.detail, /\[Player\] CabinetAutofitMode = 0 : VPX reprend la vue de l’auteur/);
  applyOps(manual[0]!.fix!.ops, { trashDir });
  assert.equal(fs.readFileSync(ini, 'utf8'), '[TableOverride]\r\nViewCabRotation = 270\r\n');
  assert.deepEqual(findings(), [], 'cadrage automatique : ViewCabRotation est sans effet');
  // Vue bureau imposée à une borne dont le joueur est à droite d'une image paysage : flippers en bas.
  write(ini, '[Player]\nBGSet = 0\n');
  const d = devPcDisplays()[3]!;
  const side = { window: d, edge: 'right' as const, globalIni: '[Player]\nBGSet = 1\nCabinetAutofitMode = 1\n' };
  const desktop = findings(side);
  assert.equal(desktop[0]?.code, 'tableOrientation');
  assert.match(desktop[0]!.detail, /flippers en bas, alors que vous êtes à droite/);
  applyOps(desktop[0]!.fix!.ops, { trashDir });
  assert.ok(!fs.existsSync(ini), 'seule la clé dans le fichier : il part entier à la corbeille');
  // VPinballX.ini lui-même en cadrage manuel : la synchronisation le dit, pas le médecin de chaque table.
  write(ini, '[Player]\nCabinetAutofitMode = 0\n');
  assert.deepEqual(findings(portraitOrientation('[Player]\nBGSet = 1\nCabinetAutofitMode = 0\n')).map((f) => f.code), ['manualView']);
  // Cadrage choisi pour cette table, ou rien sur la borne : pas de constat de sens.
  write(ini, '[Player]\nCabinetAutofitMode = 2\n');
  assert.deepEqual(findings(), []);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('écrans placés pour la table : constat lisible, retour à la disposition générale sans toucher au reste', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  const ini = path.join(folder, `${TABLE}.ini`);
  const ctx = () => ({ tablesDir, script: scriptFacts(SCRIPT) });
  const trashDir = `${tablesDir}-corbeille`;
  TRAPS.find((t) => t.code === 'tableWindows')!.arm(folder, tablesDir);
  const finding = diagnose(scanTables(tablesDir)[0]!, ctx()).find((f) => f.code === 'tableWindows')!;
  assert.match(finding.detail, /place DMD \(400 × 100 en 760, 860\) pour cette table seulement/);
  applyOps(finding.fix!.ops, { trashDir });
  assert.equal(fs.readFileSync(ini, 'utf8'), '[Player]\r\nCabinetAutofitPos = 0.1\r\n');
  assert.deepEqual(diagnose(scanTables(tablesDir)[0]!, ctx()), []);
  // Topper éteint et DMD incrusté : dits comme tels ; seules ces clés : le fichier part à la corbeille.
  write(ini, '[Topper]\nTopperOutput = 0\n[ScoreView]\nScoreViewOutput = 2\nScoreViewWidth = 300\nScoreViewHeight = 75\n');
  const again = diagnose(scanTables(tablesDir)[0]!, ctx()).find((f) => f.code === 'tableWindows')!;
  assert.match(again.detail, /place DMD \(incrusté dans le plateau, 300 × 75\), Topper \(éteint\)/);
  applyOps(again.fix!.ops, { trashDir });
  assert.ok(!fs.existsSync(ini));
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('corrections des médias : appliquées, le constat disparaît', () => {
  const cases: { code: Finding['code']; arm: (folder: string) => void; after: (folder: string) => void }[] = [
    {
      code: 'mediaUnreadable',
      arm: (folder) => {
        write(media(folder, `(Backglass) ${TABLE}.flv`), 'flv');
        write(media(folder, `(Backglass) ${TABLE}.mp4`), mp4(1920, 1080));
      },
      after: (folder) => assert.ok(!fs.existsSync(media(folder, `(Backglass) ${TABLE}.flv`))),
    },
    {
      code: 'mediaMisnamed',
      arm: (folder) => {
        write(media(folder, '(Wheel) Attack From Mars.png'), png(512, 512));
        write(media(folder, '(GameHelp) AFM rules.png'), png(800, 600));
        write(media(folder, `(GameHelp) ${TABLE}.png`), png(800, 600));
      },
      after: (folder) => {
        assert.ok(fs.existsSync(media(folder, `(Wheel) ${TABLE}.png`)));
        // Une carte de règles de plus devient la page 2.
        assert.ok(fs.existsSync(media(folder, `(GameHelp) ${TABLE} 2.png`)));
      },
    },
    {
      code: 'mediaStray',
      arm: (folder) => {
        const popper = path.join(folder, 'POPMedia', 'Visual Pinball X');
        write(path.join(popper, 'Wheel', `${TABLE}.png`), png(512, 512));
        write(path.join(popper, 'Backglass', `${TABLE}.mp4`), mp4(1920, 1080));
        write(path.join(popper, 'GameHelp', `${TABLE}.png`), png(800, 600));
        write(path.join(popper, 'GameHelp', `${TABLE}_2.png`), png(800, 600));
        // Rangement de PinballX, et un « (Type) nom » posé à côté de la table.
        write(path.join(folder, 'Media', 'Visual Pinball', 'Topper Images', 'AFM.png'), png(1920, 540));
        write(path.join(folder, `(Loading) ${TABLE}.mp4`), mp4(1920, 1080));
      },
      after: (folder) => {
        const names = fs.readdirSync(path.join(folder, 'medias'));
        for (const type of ['Wheel', 'Backglass', 'GameHelp', 'Topper', 'Loading']) assert.ok(names.some((f) => f.startsWith(`(${type}) ${TABLE}`)), type);
        assert.ok(names.includes(`(GameHelp) ${TABLE} 2.png`));
        // Les arborescences de Popper et de PinballX, vidées, sont parties à la corbeille.
        assert.ok(!fs.existsSync(path.join(folder, 'POPMedia')));
        assert.ok(!fs.existsSync(path.join(folder, 'Media')));
      },
    },
    {
      code: 'mediaDmdSwapped',
      arm: (folder) => write(media(folder, `(DMD) ${TABLE}.mp4`), mp4(1920, 1080)),
      after: (folder) => assert.ok(fs.existsSync(media(folder, `(FullDMD) ${TABLE}.mp4`))),
    },
    {
      code: 'mediaDuplicate',
      arm: (folder) => {
        write(media(folder, `(Wheel) ${TABLE}.png`), png(512, 512));
        write(media(folder, 'wheel.png'), png(512, 512));
        write(media(folder, `(Wheel) ${TABLE}.webp`), 'webp');
      },
      after: (folder) => assert.deepEqual(fs.readdirSync(path.join(folder, 'medias')), [`(Wheel) ${TABLE}.png`]),
    },
    {
      code: 'mediaPlaybackError',
      arm: (folder) => TRAPS.find((t) => t.code === 'mediaPlaybackError')!.arm(folder, path.dirname(folder)),
      after: (folder) => assert.ok(!fs.existsSync(media(folder, `(Backglass) ${TABLE}.mp4`))),
    },
  ];
  for (const c of cases) {
    const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
    const folder = healthyTable(tablesDir);
    c.arm(folder);
    const ctx = () => ({ tablesDir, script: scriptFacts(SCRIPT), cabinet: CABINET, logsDir: logsOf(folder) });
    const finding = diagnose(scanTables(tablesDir)[0]!, ctx()).find((f) => f.code === c.code);
    assert.ok(finding?.fix, `${c.code} : correction attendue`);
    const trashDir = `${tablesDir}-corbeille`;
    applyOps(finding.fix.ops, { trashDir });
    c.after(folder);
    // Un FullDMD rendu à son type reste montré réduit sur le DMD 4:1 de la borne : constat d'information seulement.
    const after = diagnose(scanTables(tablesDir)[0]!, ctx()).filter((f) => f.code.startsWith('media') && f.code !== 'mediaRatio');
    assert.deepEqual(after.map((f) => f.code), [], c.code);
    // Ce qui est retiré va à la corbeille ; un simple renommage n'y met rien.
    assert.equal(fs.existsSync(trashDir), !['mediaMisnamed', 'mediaDmdSwapped'].includes(c.code), `${c.code} : corbeille`);
    fs.rmSync(tablesDir, { recursive: true });
    fs.rmSync(trashDir, { recursive: true, force: true });
  }
});

test('« Tout réparer » sur des médias mélangés : les corrections ne se marchent pas dessus', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  write(media(folder, `(Backglass) ${TABLE}.flv`), 'flv');
  write(media(folder, `(Backglass) ${TABLE}.mp4`), mp4(1920, 1080));
  write(media(folder, `(Backglass) ${TABLE}.webm`), 'webm');
  write(media(folder, `(DMD) ${TABLE}.mp4`), mp4(1920, 1080));
  write(media(folder, '(Wheel) AFM.png'), png(512, 512));
  write(path.join(folder, 'POPMedia', 'Visual Pinball X', 'Wheel', `${TABLE}.png`), png(512, 512));
  TRAPS.find((t) => t.code === 'mediaPlaybackError')!.arm(folder, tablesDir);
  const trashDir = `${tablesDir}-corbeille`;
  const ctx = { tablesDir, script: scriptFacts(SCRIPT), cabinet: CABINET, logsDir: logsOf(folder) };
  for (let round = 0; round < 3; round++) {
    for (const f of diagnose(scanTables(tablesDir)[0]!, ctx).filter((x) => x.fix)) applyOps(f.fix!.ops, { trashDir });
  }
  const left = diagnose(scanTables(tablesDir)[0]!, ctx);
  assert.ok(left.every((f) => !f.fix), `corrections restantes : ${left.map((f) => f.code).join(', ')}`);
  assert.ok(fs.existsSync(media(folder, `(FullDMD) ${TABLE}.mp4`)));
  assert.equal(fs.readdirSync(path.join(folder, 'medias')).filter((f) => f.startsWith('(Wheel)')).length, 1);
  fs.rmSync(tablesDir, { recursive: true });
  fs.rmSync(trashDir, { recursive: true, force: true });
});

test('médecin des médias : proportions, orientation du plateau et DMD selon la borne', () => {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-traps-'));
  const folder = healthyTable(tablesDir);
  const ratio = (cabinet: PupCabinet) =>
    diagnose(scanTables(tablesDir)[0]!, { tablesDir, script: scriptFacts(SCRIPT), cabinet }).find((f) => f.code === 'mediaRatio');
  // Plateau en paysage 16:9 sur un playfield en portrait pour Windows : le menu le tourne, rien à dire.
  write(media(folder, `(Playfield) ${TABLE}.mp4`), mp4(1920, 1080));
  assert.equal(ratio({ ...CABINET, aspects: { playfield: 1080 / 1920 } }), undefined);
  // Plateau en 4:3 : recadré.
  write(media(folder, `(Playfield) ${TABLE}.mp4`), mp4(1024, 768));
  assert.match(ratio(CABINET)!.detail, /4:3.*16:9.*recadre, 25 %/);
  // Presque carré : orientation impossible à déduire.
  write(media(folder, `(Playfield) ${TABLE}.mp4`), mp4(1000, 1000));
  assert.match(ratio(CABINET)!.detail, /Presque carré/);
  fs.rmSync(media(folder, `(Playfield) ${TABLE}.mp4`));
  // Fronton en portrait sur un écran en paysage.
  write(media(folder, `(Backglass) ${TABLE}.png`), png(1080, 1920));
  assert.match(ratio(CABINET)!.detail, /en portrait sur un écran en paysage/);
  fs.rmSync(media(folder, `(Backglass) ${TABLE}.png`));
  // DMD 4:1 sur un écran 4:1 : rien. Seulement un FullDMD 16:9 : montré réduit, faute de DMD.
  write(media(folder, `(DMD) ${TABLE}.png`), png(512, 128));
  assert.equal(ratio(CABINET), undefined);
  fs.rmSync(media(folder, `(DMD) ${TABLE}.png`));
  write(media(folder, `(FullDMD) ${TABLE}.png`), png(1920, 1080));
  assert.match(ratio(CABINET)!.detail, /faute de média « Afficheur » \(DMD\)/);
  // Le même FullDMD sur un écran DMD 16:9 : il est chez lui.
  assert.equal(ratio({ ...CABINET, dmdRatio: 16 / 9, aspects: { ...CABINET.aspects, dmd: 16 / 9 } }), undefined);
  // Écran dit FullDMD (Configuration de la borne > Écran du DMD), encore dans sa bande 4,78:1 : le
  // FullDMD est le média attendu, seules ses proportions sont signalées ; dit DMD seul : faute de DMD.
  const band = { ...CABINET, dmdRatio: 4.78, aspects: { ...CABINET.aspects, dmd: 4.78 } };
  assert.doesNotMatch(ratio({ ...band, fullDmd: true })!.detail, /faute de média/);
  assert.match(ratio({ ...band, fullDmd: true })!.detail, /Afficheur large|FullDMD/);
  assert.match(ratio({ ...band, fullDmd: false })!.detail, /faute de média « Afficheur » \(DMD\)/);
  // Borne non configurée : pas de comparaison.
  assert.equal(ratio({ backglass: true, dmd: true, topper: false }), undefined);
  fs.rmSync(tablesDir, { recursive: true });
});

test('fichier des erreurs de lecture : compteur, entrée périmée quand le fichier change, lecture interrompue ignorée', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-medias-erreurs-'));
  const log = mediaErrorsFile(path.join(dir, 'logs'));
  const video = path.join(dir, '(Backglass) T2.mp4');
  write(video, mp4(1920, 1080));
  assert.equal(recordMediaError(log, { file: video, code: 1 }), undefined);
  assert.equal(recordMediaError(log, { file: path.join(dir, 'absent.mp4'), code: 3 }), undefined);
  assert.ok(!fs.existsSync(log));
  recordMediaError(log, { file: video, code: 3, message: 'x'.repeat(500) }, new Date('2026-10-21T20:00:00Z'));
  const second = recordMediaError(log, { file: video, code: 3 }, new Date('2026-10-21T20:05:00Z'))!;
  assert.equal(second.count, 2);
  assert.equal(second.first, '2026-10-21T20:00:00.000Z');
  const saved = JSON.parse(fs.readFileSync(log, 'utf8'));
  assert.equal(saved.version, 1);
  assert.equal(saved.errors.length, 1);
  assert.equal(saved.errors[0].kind, 'decode');
  // Fichier remplacé : l'ancienne erreur ne compte plus, et disparaît au prochain enregistrement.
  write(video, mp4(1280, 720));
  fs.utimesSync(video, new Date('2026-10-22T10:00:00Z'), new Date('2026-10-22T10:00:00Z'));
  const image = path.join(dir, '(Wheel) T2.png');
  write(image, png(10, 10));
  recordMediaError(log, { file: image, image: true });
  assert.deepEqual(
    readMediaErrors(log).map((e) => [path.basename(e.file), e.kind]),
    [['(Wheel) T2.png', 'image']],
  );
  fs.rmSync(dir, { recursive: true });
});
