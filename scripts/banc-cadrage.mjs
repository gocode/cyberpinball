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

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

/** Image QOI (format de capture de VPX) en RGBA. */
function decodeQoi(buf) {
  if (buf.toString('latin1', 0, 4) !== 'qoif') throw new Error('pas une image QOI');
  const width = buf.readUInt32BE(4);
  const height = buf.readUInt32BE(8);
  const data = Buffer.alloc(width * height * 4);
  const index = new Uint8Array(64 * 4);
  let [r, g, b, a] = [0, 0, 0, 255];
  let p = 14;
  let run = 0;
  for (let o = 0; o < data.length; o += 4) {
    if (run > 0) run--;
    else {
      const b1 = buf[p++];
      if (b1 === 0xfe) [r, g, b] = [buf[p++], buf[p++], buf[p++]];
      else if (b1 === 0xff) [r, g, b, a] = [buf[p++], buf[p++], buf[p++], buf[p++]];
      else if ((b1 & 0xc0) === 0x00) [r, g, b, a] = index.slice((b1 & 0x3f) * 4, (b1 & 0x3f) * 4 + 4);
      else if ((b1 & 0xc0) === 0x40) {
        r = (r + ((b1 >> 4) & 3) - 2) & 255;
        g = (g + ((b1 >> 2) & 3) - 2) & 255;
        b = (b + (b1 & 3) - 2) & 255;
      } else if ((b1 & 0xc0) === 0x80) {
        const b2 = buf[p++];
        const vg = (b1 & 0x3f) - 32;
        r = (r + vg - 8 + ((b2 >> 4) & 15)) & 255;
        g = (g + vg) & 255;
        b = (b + vg - 8 + (b2 & 15)) & 255;
      } else run = b1 & 0x3f;
      const h = ((r * 3 + g * 5 + b * 7 + a * 11) % 64) * 4;
      index.set([r, g, b, a], h);
    }
    data[o] = r;
    data[o + 1] = g;
    data[o + 2] = b;
    data[o + 3] = 255;
  }
  return { width, height, data };
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
  ];
  const ini = path.join(dir, `VPinballX-${cadrage.nom}.ini`);
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
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
  return decodeQoi(fs.readFileSync(path.join(capture, image)));
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
  for (const cadrage of CADRAGES) {
    const img = await rendu({ cadrage, vpx: a.vpx, table: a.table, roms, core });
    console.log(`${cadrage.titre} : ${img.width} × ${img.height}`);
    images.push(img);
  }
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
  console.log(`Planche (${CADRAGES.map((c) => c.titre).join(', ')}) : ${sortie}`);
}
