// Banc du cadrage des tables (21/11/2026) : la même table rendue par le VPX corrigé (packages/vpx-corrige, correctif
// 02) dans chaque cadrage automatique, sur le bureau caché, et une planche PNG pour comparer. Une image du playfield
// par cadrage, tirée par l'option -CaptureAttract de VPX (31 s d'attraction simulées, puis une image) ; fenêtre du
// playfield en portrait, écran déclaré de 42,5" 16:9 (95,89 × 53,94 cm). Tout se fait sur des copies : VPX, la table,
// ses ROM, et le dossier des préférences de VPX (-PrefPath) ; rien du poste n'est touché.
// À lancer par scripts/banc-cadrage.ps1.
//   node scripts/banc-cadrage.mjs --vpx <dossier de VPX 10.8.1-5436> --table <fichier.vpx> [--roms <dossier des ROM>]
//        [--sortie <planche.png>]
// Construit d'abord : node scripts/vpx-corrige.mjs.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VPX_CORRIGE_EXE } from './vpx-corrige.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = 'VPinballX_BGFX64.exe';
const LARGEUR = 540;
const HAUTEUR = 960;

/** Les cadrages comparés : [Player] de VPinballX.ini. */
const CADRAGES = [
  { nom: 'ajuster', titre: 'Ajuster (VPX)', reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '0' } },
  { nom: 'remplir', titre: 'Remplir (VPX)', reglages: { CabinetAutofitMode: '2', CabinetAutofitKeepTop: '0' } },
  { nom: 'entiere', titre: 'Table entière', reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '1', CabinetAutofitMaxStretch: '0', CabinetAutofitPos: '0.2' } },
  { nom: 'garde-le-haut', titre: 'Garder le haut (défaut)', reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '1', CabinetAutofitMaxStretch: '0.15', CabinetAutofitPos: '0.05' } },
];

/**
 * Étude du cadrage (23/11/2026, --etude) : la vue de l'auteur (cadrage manuel), les cadrages de VPX, celui de Cyber
 * Pinball, et deux vues « relief » où VPX place l'œil du joueur comme sur une vraie borne (mode Window : position des
 * yeux par rapport au bas de l'écran, inclinaison de l'écran).
 */
const ETUDE = [
  { nom: 'auteur', titre: 'Vue de l’auteur (manuel)', reglages: { CabinetAutofitMode: '0' } },
  CADRAGES[0],
  CADRAGES[1],
  CADRAGES[3],
  { nom: 'relief', titre: 'Relief (œil à 20 cm, 50 cm au-dessus)', reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '1', CabinetAutofitMaxStretch: '0.15', CabinetAutofitPos: '0.05', ScreenPlayerY: '-20', ScreenPlayerZ: '50' } },
  { nom: 'relief-incline', titre: 'Relief, écran incliné de 6°', reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '1', CabinetAutofitMaxStretch: '0.15', CabinetAutofitPos: '0.05', ScreenPlayerY: '-20', ScreenPlayerZ: '50', ScreenInclination: '6' } },
  // Coins calés (24/11/2026) : œil très haut au-dessus de l'écran pour effacer le trapèze de la perspective, puis
  // étirement large pour toucher les bords.
  // Vue d'une autre table copiée telle quelle : la section fullscreen d'un .pov communautaire (test.legacy.pov du dépôt
  // vpxtool, vue de borne tournée de 270°, mode legacy). Étude du 24/11/2026 : une vue réglée sur une table vaut-elle pour les autres ?
  {
    nom: 'vue-copiee',
    titre: 'Vue d’une autre table copiée (POV communautaire)',
    reglages: { CabinetAutofitMode: '0' },
    vue: { ViewCabMode: '0', ViewCabLookAt: '0', ViewCabFOV: '27', ViewCabLayback: '76', ViewCabRotation: '270', ViewCabScaleX: '1', ViewCabScaleY: '1.16', ViewCabScaleZ: '1', ViewCabPlayerX: '-10', ViewCabPlayerY: '0', ViewCabPlayerZ: '-200' },
  },
  { nom: 'haut-150', titre: 'Œil à 150 cm, étirement 0,5', reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '1', CabinetAutofitMaxStretch: '0.5', CabinetAutofitPos: '0.05', ScreenPlayerY: '-20', ScreenPlayerZ: '150' } },
  { nom: 'haut-400', titre: 'Œil à 400 cm, étirement 0,5', reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '1', CabinetAutofitMaxStretch: '0.5', CabinetAutofitPos: '0.05', ScreenPlayerY: '-20', ScreenPlayerZ: '400' } },
  { nom: 'etire-50', titre: 'Garder le haut, étirement 0,5', reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '1', CabinetAutofitMaxStretch: '0.5', CabinetAutofitPos: '0.05' } },
  // Coins ajustés, écran incliné ou à plat (24/11/2026) : la vue réglée à la main par le joueur sur Monster Bash (mode Window,
  // œil Y 2,49 / Z 100, fenêtre abaissée), puis l'autofit à œil identique, avec et sans inclinaison de l'écran.
  {
    nom: 'main-incline',
    titre: 'Vue réglée à la main (écran incliné)',
    reglages: { CabinetAutofitMode: '0', ScreenPlayerY: '2.485651', ScreenPlayerZ: '99.976471', CabinetAutofitMaxStretch: '0.5' },
    vue: { ViewCabMode: '2', ViewCabScaleX: '1.267907', ViewCabScaleY: '1.080779', ViewCabHOfs: '0', ViewCabVOfs: '5.197504', ViewCabWindowTop: '261.648926', ViewCabWindowBot: '60.455444', ViewCabRotation: '0' },
  },
  ...[['plat', '0'], ['i6', '6'], ['i12', '12'], ['n6', '-6']].map(([n, inc]) => ({
    nom: `oeil100-${n}`,
    titre: `Œil Y 2,5 / Z 100, étirement 0,5, inclinaison ${inc}°`,
    reglages: { CabinetAutofitMode: '1', CabinetAutofitKeepTop: '1', CabinetAutofitMaxStretch: '0.5', CabinetAutofitPos: '0.05', ScreenPlayerY: '2.5', ScreenPlayerZ: '100', ScreenInclination: inc },
  })),
];

/**
 * Mesures d'une image : bandes noires à gauche et à droite, vide en haut et en bas (colonnes ou lignes dont moins de
 * 2 % des pixels sont éclairés), surface utilisée (le reste), en pourcentage de l'image.
 */
export function mesures(img) {
  const { width: w, height: h, data } = img;
  const lit = (x, y) => {
    const o = (y * w + x) * 4;
    return Math.max(data[o], data[o + 1], data[o + 2]) > 14;
  };
  const colonne = (x) => {
    let n = 0;
    for (let y = 0; y < h; y++) if (lit(x, y)) n++;
    return n / h;
  };
  const ligne = (y) => {
    let n = 0;
    for (let x = 0; x < w; x++) if (lit(x, y)) n++;
    return n / w;
  };
  let g = 0;
  while (g < w && colonne(g) < 0.02) g++;
  let d = 0;
  while (d < w - g && colonne(w - 1 - d) < 0.02) d++;
  let haut = 0;
  while (haut < h && ligne(haut) < 0.02) haut++;
  let bas = 0;
  while (bas < h - haut && ligne(h - 1 - bas) < 0.02) bas++;
  const pc = (v) => Math.round(v * 1000) / 10;
  return { bandeGauche: pc(g / w), bandeDroite: pc(d / w), videHaut: pc(haut / h), videBas: pc(bas / h), surface: pc(((w - g - d) * (h - haut - bas)) / (w * h)) };
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

/** Une image du playfield dans un cadrage, sur des copies (dossier du banc). */
async function rendu({ cadrage, vpx, table, roms, core }) {
  const dir = path.join(os.tmpdir(), 'banc-cadrage');
  const copie = path.join(dir, 'vpx');
  if (!fs.existsSync(path.join(copie, EXE))) {
    fs.mkdirSync(copie, { recursive: true });
    const r = spawnSync('robocopy', [vpx, copie, '/E', '/XJ', '/XD', 'docs', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
    if (r.status >= 8) throw new Error(`copie de VPX impossible (robocopy ${r.status})`);
  }
  fs.copyFileSync(VPX_CORRIGE_EXE, path.join(copie, EXE));
  const tableDir = path.join(dir, 'table');
  const pinmame = path.join(dir, 'pinmame');
  if (!fs.existsSync(path.join(tableDir, path.basename(table)))) {
    fs.mkdirSync(path.join(pinmame, 'roms'), { recursive: true });
    if (roms && fs.existsSync(roms)) for (const f of fs.readdirSync(roms)) fs.copyFileSync(path.join(roms, f), path.join(pinmame, 'roms', f));
    fs.mkdirSync(tableDir, { recursive: true });
    fs.copyFileSync(table, path.join(tableDir, path.basename(table)));
  }
  const jouee = path.join(tableDir, path.basename(table));
  const capture = path.join(tableDir, 'Capture');
  fs.rmSync(capture, { recursive: true, force: true });
  const appdata = path.join(dir, `appdata-${cadrage.nom}`);
  fs.rmSync(appdata, { recursive: true, force: true });
  fs.mkdirSync(appdata, { recursive: true });
  const settings = [
    ...core.VPX_PLAY_SETTINGS,
    { section: 'Player', key: 'MusicVolume', value: '0' },
    { section: 'Player', key: 'SoundVolume', value: '0' },
    { section: 'Player', key: 'BGSet', value: '1' },
    { section: 'Player', key: 'ScreenWidth', value: '95.89' },
    { section: 'Player', key: 'ScreenHeight', value: '53.94' },
    { section: 'Player', key: 'PlayfieldFullScreen', value: '0' },
    { section: 'Player', key: 'PlayfieldWndX', value: '0' },
    { section: 'Player', key: 'PlayfieldWndY', value: '0' },
    { section: 'Player', key: 'PlayfieldWidth', value: String(LARGEUR) },
    { section: 'Player', key: 'PlayfieldHeight', value: String(HAUTEUR) },
    ...Object.entries(cadrage.reglages).map(([key, value]) => ({ section: 'Player', key, value })),
    { section: 'Backglass', key: 'BackglassOutput', value: '0' },
    { section: 'ScoreView', key: 'ScoreViewOutput', value: '0' },
    { section: 'Topper', key: 'TopperOutput', value: '0' },
    { section: 'Plugin.PinMAME', key: 'Enable', value: '1' },
    { section: 'Plugin.PinMAME', key: 'PinMAMEPath', value: pinmame },
    core.PINMAME_FAST_BOOT,
    { section: 'Plugin.B2S', key: 'Enable', value: '1' },
    // Tables dont le script crée PinUpPlayer.PinDisplay (JP's Space Cadet GE) : sans le plugin, erreur de script.
    { section: 'Plugin.PUP', key: 'Enable', value: '1' },
  ];
  const ini = path.join(dir, `VPinballX-${cadrage.nom}.ini`);
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
  // Une vue copiée d'une autre table : [TableOverride] ViewCab…, avec CabinetAutofitMode = 0 dans les réglages.
  for (const [key, value] of Object.entries(cadrage.vue ?? {})) doc.set('TableOverride', key, value);
  fs.writeFileSync(ini, doc.toString());
  const child = spawn(path.join(copie, EXE), ['-PrefPath', appdata, '-Ini', ini, '-CaptureAttract', '1', '1', jouee, 'noloop'], { cwd: copie, windowsHide: true, stdio: 'ignore' });
  const fini = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const code = await Promise.race([fini, new Promise((r) => setTimeout(() => r('délai'), 180000))]);
  if (code === 'délai') spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
  const image = fs.existsSync(capture) ? fs.readdirSync(capture).find((f) => /^Playfield_\d+.*\.qoi$/i.test(f)) : undefined;
  if (!image) {
    const log = [path.join(appdata, 'vpinball.log'), path.join(appdata, '10.8', 'vpinball.log')].find((f) => fs.existsSync(f));
    const erreurs = log ? fs.readFileSync(log, 'utf8').split(/\r?\n/).filter((l) => / (ERROR|FATAL) /.test(l)).slice(0, 5) : ['journal absent'];
    throw new Error(`${cadrage.nom} : aucune image (VPX ${code}) ${erreurs.join(' | ')}`);
  }
  return core.decodeQoi(fs.readFileSync(path.join(capture, image)));
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx || !a.table) {
    console.error('Usage : --vpx <dossier de VPX 10.8.1-5436> --table <fichier.vpx> [--roms <dossier des ROM>] [--sortie <planche.png>]');
    process.exit(2);
  }
  if (!fs.existsSync(VPX_CORRIGE_EXE)) {
    console.error('VPX corrigé absent : node scripts/vpx-corrige.mjs');
    process.exit(2);
  }
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const roms = a.roms ?? path.join(path.dirname(a.table), 'pinmame', 'roms');
  const images = [];
  const noms = process.env.BANC_NOMS ? process.env.BANC_NOMS.split(',') : null;
  const liste = (a.etude ? ETUDE : CADRAGES).filter((c) => !noms || noms.includes(c.nom));
  const releves = [];
  for (const cadrage of liste) {
    let img;
    try {
      img = await rendu({ cadrage, vpx: a.vpx, table: a.table, roms, core });
    } catch (error) {
      console.log(`${cadrage.titre} : ${error.message}`);
      releves.push({ cadrage: cadrage.nom, erreur: error.message });
      continue;
    }
    const m = mesures(img);
    console.log(`${cadrage.titre} : ${img.width} × ${img.height} ; ${JSON.stringify(m)}`);
    releves.push({ cadrage: cadrage.nom, titre: cadrage.titre, ...m });
    images.push(img);
    if (a.images) {
      fs.mkdirSync(a.images, { recursive: true });
      fs.writeFileSync(path.join(a.images, `${cadrage.nom}.png`), core.encodePng(img));
    }
  }
  if (a.images) fs.mkdirSync(a.images, { recursive: true });
  if (a.images) fs.writeFileSync(path.join(a.images, 'mesures.json'), JSON.stringify({ table: path.basename(a.table), releves }, null, 2));
  // Planche : les rendus côte à côte, séparés de 20 px, sur fond gris foncé.
  const marge = 20;
  const w = images.reduce((s, i) => s + i.width, 0) + marge * (images.length + 1);
  const h = Math.max(...images.map((i) => i.height)) + marge * 2;
  const planche = { width: w, height: h, data: Buffer.alloc(w * h * 4) };
  for (let o = 0; o < planche.data.length; o += 4) planche.data.set([40, 40, 44, 255], o);
  let x = marge;
  for (const img of images) {
    core.drawOver(planche, img, x, marge);
    x += img.width + marge;
  }
  const sortie = a.sortie ?? path.join(repo, 'tmp', 'banc-cadrage.png');
  fs.mkdirSync(path.dirname(sortie), { recursive: true });
  fs.writeFileSync(sortie, core.encodePng(planche));
  console.log(`Planche (${liste.map((c) => c.titre).join(', ')}) : ${sortie}`);
}
