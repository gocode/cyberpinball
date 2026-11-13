// Banc du DMD qui remplit sa fenêtre redimensionnée en partie : le vrai VPX 10.8.1 en 2D, avec ScoreView, PinMAME
// et le plugin « CyberPinballDmd » (packages/vpx-vision3d/src/dmd-suivi.cpp), sur une table à DMD de PinMAME. En cours
// de partie, la fenêtre « Visual Pinball Score View » est redimensionnée comme le fait le menu en partie
// (setWindowBounds, in-game-menu.ts) ; la sonde du plugin ([Plugin.CyberPinballDmd] Probe = 1, un rendu placé devant
// ScoreView, qui le laisse dessiner) dit quelle part de sa surface l'afficheur remplit ; rapportée à la fenêtre posée,
// c'est ce que voit le joueur. Trois parties : suivi éteint (Follow = 0, la limite d'avant), taille donnée à SDL sans
// rien dire à ScoreView (Follow = 2), suivi entier (Follow = 1). À lancer par scripts/banc-dmd.ps1, sur le bureau caché.
//   node scripts/banc-dmd.mjs --vpx <dossier de VPX 10.8.1> --table <fichier.vpx> --pinmame <dossier de PinMAME>
//        [--suivi 0|1|2|tous] [--tailles 512x128,768x128,448x160]
// La table doit avoir un vrai DMD (128 × 32, Terminator 2 de Williams par exemple) : un afficheur alphanumérique n'a
// qu'une mise en page, sans variantes étirées.
// Construit d'abord : node scripts/vision3d.mjs. VPX est copié une fois dans le dossier temporaire (banc-vpx.mjs,
// copieVpx) ; la table jouée est une copie.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copieVpx } from './banc-vpx.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BANC_DMD_PLUGIN = path.join(repo, 'build', 'vision3d', 'Release', 'plugin-cyberpinballdmd64.dll');
const VPX_EXE = 'VPinballX_BGFX64.exe';
const TITRE = 'Visual Pinball Score View';

/** La première taille, puis celles posées en cours de partie : 4:1 (le DMD), 6:1, 2,8:1. */
export const TAILLES = [
  { width: 512, height: 128 },
  { width: 768, height: 128 },
  { width: 448, height: 160 },
];

/** Les mesures de la sonde (« sonde t=… sortie=LxH rempli=… ») et les diffusions du plugin, lues dans son journal. */
export function lireJournal(texte) {
  const sondes = [...texte.matchAll(/^sonde t=([\d.]+) sortie=(\d+)x(\d+) rempli=(-?[\d.]+)/gm)].map((m) => ({ t: Number(m[1]), width: Number(m[2]), height: Number(m[3]), rempli: Number(m[4]) }));
  const diffusions = [...texte.matchAll(/^diffusion t=([\d.]+) fenetre=(\d+)x(\d+)/gm)].map((m) => ({ t: Number(m[1]), width: Number(m[2]), height: Number(m[3]) }));
  return { sondes, diffusions };
}

/**
 * La part de la fenêtre posée (taille) que le DMD remplit, d'après la dernière mesure de la sonde (sur la surface où
 * VPX dessine, sortie) : une surface restée à l'ancienne taille n'en couvre qu'une partie. undefined : rien mesuré.
 */
export function rempliDansFenetre(mesure, taille) {
  if (!mesure || mesure.rempli < 0) return undefined;
  const couvert = (Math.min(mesure.width, taille.width) * Math.min(mesure.height, taille.height)) / (taille.width * taille.height);
  return mesure.rempli * couvert;
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Une partie : la fenêtre du DMD à chaque taille tour à tour, `pauseMs` à chacune. */
export async function partie({ vpx, table, pinmame, suivi = 1, tailles = TAILLES, pauseMs = 5000, chargementMs = 90000 }) {
  if (!fs.existsSync(BANC_DMD_PLUGIN)) throw new Error('Plugin absent : node scripts/vision3d.mjs.');
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const win = await import(pathToFileURL(path.join(repo, 'packages', 'win-displays', 'dist', 'index.js')).href);
  const copie = copieVpx(vpx);
  const plugin = path.join(copie, 'plugins', 'cyberpinball-dmd');
  fs.mkdirSync(plugin, { recursive: true });
  fs.copyFileSync(BANC_DMD_PLUGIN, path.join(plugin, path.basename(BANC_DMD_PLUGIN)));
  fs.copyFileSync(path.join(repo, 'packages', 'vpx-vision3d', 'cyberpinball-dmd.cfg'), path.join(plugin, 'plugin.cfg'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-dmd-'));
  // Les mises en page de Cyber Pinball (variantes étirées) : celles que la borne donne à ScoreView.
  const layouts = core.prepareScoreViewLayouts(path.join(copie, 'plugins', 'scoreview', 'layouts'), dir);
  const log = path.join(dir, 'dmd.txt');
  const [premiere] = tailles;
  const settings = [
    ...core.VPX_PLAY_SETTINGS,
    // Muette : rien ne s'entend sur le poste pendant le banc (fronton et playfield, player.cpp).
    { section: 'Player', key: 'MusicVolume', value: '0' },
    { section: 'Player', key: 'SoundVolume', value: '0' },
    // Sur le bureau caché, aucune composition d'écran : sans synchronisation, à 60 images par seconde.
    { section: 'Player', key: 'SyncMode', value: '0' },
    { section: 'Player', key: 'MaxFramerate', value: '60' },
    { section: 'Player', key: 'PlayfieldFullScreen', value: '0' },
    { section: 'Player', key: 'PlayfieldWndX', value: '0' },
    { section: 'Player', key: 'PlayfieldWndY', value: '0' },
    { section: 'Player', key: 'PlayfieldWidth', value: '640' },
    { section: 'Player', key: 'PlayfieldHeight', value: '480' },
    { section: 'Backglass', key: 'BackglassOutput', value: '0' },
    { section: 'Topper', key: 'TopperOutput', value: '0' },
    { section: 'ScoreView', key: 'ScoreViewOutput', value: '1' },
    { section: 'ScoreView', key: 'ScoreViewFullScreen', value: '0' },
    { section: 'ScoreView', key: 'ScoreViewWndX', value: '700' },
    { section: 'ScoreView', key: 'ScoreViewWndY', value: '0' },
    { section: 'ScoreView', key: 'ScoreViewWidth', value: String(premiere.width) },
    { section: 'ScoreView', key: 'ScoreViewHeight', value: String(premiere.height) },
    // La sonde d'abord, qui fait dessiner ScoreView ; jamais B2S ni PuP dans la fenêtre du DMD.
    { section: 'ScoreView', key: 'Priority.CyberPinballDmd', value: '90' },
    { section: 'ScoreView', key: 'Priority.ScoreView', value: '10' },
    { section: 'ScoreView', key: 'Priority.B2S', value: '0' },
    { section: 'ScoreView', key: 'Priority.PUP', value: '0' },
    { section: 'Plugin.PinMAME', key: 'Enable', value: '1' },
    { section: 'Plugin.PinMAME', key: 'PinMAMEPath', value: pinmame },
    core.PINMAME_FAST_BOOT,
    { section: 'Plugin.B2S', key: 'Enable', value: '1' },
    { section: 'Plugin.ScoreView', key: 'Enable', value: '1' },
    ...(layouts ? [{ section: 'Plugin.ScoreView', key: 'LayoutFolder', value: layouts }] : []),
    { section: 'Plugin.CyberPinballDmd', key: 'Enable', value: '1' },
    { section: 'Plugin.CyberPinballDmd', key: 'LogFile', value: log },
    { section: 'Plugin.CyberPinballDmd', key: 'Probe', value: '1' },
    { section: 'Plugin.CyberPinballDmd', key: 'Follow', value: String(suivi) },
  ];
  const ini = path.join(dir, 'VPinballX.ini');
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
  fs.writeFileSync(ini, doc.toString());
  const jouee = path.join(dir, path.basename(table));
  fs.copyFileSync(table, jouee);
  for (const ext of ['.vbs', '.directb2s']) {
    const voisin = table.replace(/\.vpx$/i, ext);
    if (fs.existsSync(voisin)) fs.copyFileSync(voisin, jouee.replace(/\.vpx$/i, ext));
  }
  const child = spawn(path.join(copie, VPX_EXE), ['-Ini', ini, '-Play', jouee], { cwd: copie, windowsHide: true, stdio: 'ignore' });
  const fini = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  const lire = () => (fs.existsSync(log) ? fs.readFileSync(log, 'utf8') : '');
  const etapes = [];
  /** La taille posée tenue `pauseMs` : la dernière mesure de la sonde, et la fenêtre telle que Windows la donne. */
  const relever = (taille) => {
    const mesure = lireJournal(lire()).sondes.at(-1);
    const rect = win.listWindows((w) => w.pid === child.pid && w.title === TITRE)[0]?.rect;
    etapes.push({ ...taille, rect, mesure, rempli: rempliDansFenetre(mesure, taille) });
  };
  try {
    // Le DMD dessiné (une mesure de la sonde) à la première taille : la partie a commencé.
    const t0 = Date.now();
    while (!lireJournal(lire()).sondes.some((s) => s.rempli > 0)) {
      if (Date.now() - t0 > chargementMs) throw new Error('Aucun DMD dessiné : table, ROM ou PinMAME introuvables ?');
      if (child.exitCode !== null) throw new Error(`VPX s'est arrêté (code ${child.exitCode}).`);
      await attendre(500);
    }
    await attendre(pauseMs);
    relever(tailles[0]);
    for (const taille of tailles.slice(1)) {
      const fenetre = win.listWindows((w) => w.pid === child.pid && w.title === TITRE)[0];
      if (!fenetre) throw new Error('Fenêtre « Visual Pinball Score View » introuvable.');
      // Comme le menu en partie : la fenêtre (sans bordure) change de taille, à sa place.
      win.setWindowBounds(fenetre, { x: fenetre.rect.x, y: fenetre.rect.y, width: taille.width, height: taille.height });
      await attendre(pauseMs);
      relever(taille);
    }
  } finally {
    spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    await fini;
  }
  const journal = lire();
  const { sondes, diffusions } = lireJournal(journal);
  return { dir, journal, sondes, diffusions, etapes };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx || !a.table || !a.pinmame) {
    console.error('node scripts/banc-dmd.mjs --vpx <dossier de VPX> --table <fichier.vpx> --pinmame <dossier de PinMAME> [--suivi 0|1|2|tous]');
    process.exit(2);
  }
  const tailles = a.tailles
    ? a.tailles.split(',').map((s) => {
        const [w, h] = s.split('x').map(Number);
        return { width: w, height: h };
      })
    : TAILLES;
  const modes = ['0', '1', '2'].includes(a.suivi) ? [Number(a.suivi)] : [0, 2, 1];
  const NOMS = { 0: 'suivi éteint', 1: 'suivi entier', 2: 'taille donnée à SDL seulement' };
  let ok = true;
  for (const suivi of modes) {
    const r = await partie({ vpx: a.vpx, table: a.table, pinmame: a.pinmame, suivi, tailles });
    console.log(`--- ${NOMS[suivi]} (Follow = ${suivi}, ${r.dir}) ---`);
    for (const e of r.etapes) {
      const m = e.mesure;
      console.log(
        `fenêtre ${e.width} × ${e.height} (${(e.width / e.height).toFixed(2)}:1, Windows : ${e.rect ? `${e.rect.width} × ${e.rect.height} en ${e.rect.x}, ${e.rect.y}` : '?'}) : ` +
          `VPX dessine en ${m ? `${m.width} × ${m.height}` : '?'}, DMD ${e.rempli === undefined ? 'jamais mesuré' : `${(e.rempli * 100).toFixed(1)} % de la fenêtre`}`,
      );
    }
    console.log(`diffusions : ${r.diffusions.map((d) => `${d.width}×${d.height} à ${d.t.toFixed(1)} s`).join(', ') || 'aucune'}`);
    // Suivi entier : chaque taille remplie à 97 % au moins (les variantes vont de 1,5 % en 1,5 %).
    if (suivi === 1 && r.etapes.some((e) => e.rempli === undefined || e.rempli < 0.97)) ok = false;
  }
  console.log(ok ? 'banc du DMD : tout va bien' : 'banc du DMD : ÉCHEC');
  process.exit(ok ? 0 : 1);
}
