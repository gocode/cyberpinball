// Banc de la cadence des images d'une table : une partie de VPX sur le bureau caché, avec les fenêtres du fronton et
// du DMD à la taille voulue, puis le bilan que le plugin « CyberPinballDmd » écrit dans vpinball.log (cadence.h).
//
// Relevé le 17/11/2026 : des tables reprises d'une autre installation « rament énormément » sur une borne et pas sur
// une autre. Le plugin PUP de VPX 10.8.1 convertit chaque image de vidéo à la taille de la fenêtre où elle s'affiche
// (PUPMediaPlayer::HandleVideoFrame, sws_scale vers m_bounds), puis en fait une nouvelle texture : son coût dépend des
// écrans de la borne. Ce banc joue la même table à plusieurs tailles de fenêtres pour le mesurer.
// À lancer par scripts/banc-cadence.ps1, sur le bureau caché.
//   node scripts/banc-cadence.mjs --vpx <dossier de VPX 10.8.1> --table <fichier.vpx> [--fenetres 640x360,1920x1080,...]
//        [--duree <s>] [--cadence <images/s, 0 : sans limite>] [--ini <réglages en plus, Section.Clé=valeur;...>]
// La table est jouée dans son dossier (PuP-Pack, ROM), où VPX peut écrire (user\VPReg.stg, nvram) : donner une copie.
// Construit d'abord : node scripts/vision3d.mjs.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { copieVpx } from './banc-vpx.mjs';
import { BANC_DMD_PLUGIN } from './banc-dmd.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const VPX_EXE = 'VPinballX_BGFX64.exe';

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

/** Une partie de `dureeS` secondes, fenêtres du fronton et du DMD à `largeur` × `hauteur` : le bilan de la cadence. */
export async function partie({ vpx, table, largeur, hauteur, dureeS = 45, cadence = 0, extra = [] }) {
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const win = await import(pathToFileURL(path.join(repo, 'packages', 'win-displays', 'dist', 'index.js')).href);
  const copie = copieVpx(vpx);
  const dossierPlugin = path.join(copie, 'plugins', 'cyberpinball-dmd');
  fs.mkdirSync(dossierPlugin, { recursive: true });
  const dll = path.join(dossierPlugin, path.basename(BANC_DMD_PLUGIN));
  if (!fs.existsSync(dll) || !fs.readFileSync(dll).equals(fs.readFileSync(BANC_DMD_PLUGIN))) fs.copyFileSync(BANC_DMD_PLUGIN, dll);
  fs.copyFileSync(path.join(repo, 'packages', 'vpx-vision3d', 'cyberpinball-dmd.cfg'), path.join(dossierPlugin, 'plugin.cfg'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-cadence-'));
  const fenetre = (section, prefix, x) => [
    { section, key: `${prefix}Output`, value: '1' },
    { section, key: `${prefix}FullScreen`, value: '0' },
    { section, key: `${prefix}WndX`, value: String(x) },
    { section, key: `${prefix}WndY`, value: '0' },
    { section, key: `${prefix}Width`, value: String(largeur) },
    { section, key: `${prefix}Height`, value: String(hauteur) },
  ];
  const settings = [
    ...core.VPX_PLAY_SETTINGS,
    { section: 'Player', key: 'MusicVolume', value: '0' },
    { section: 'Player', key: 'SoundVolume', value: '0' },
    { section: 'Player', key: 'SyncMode', value: '0' },
    { section: 'Player', key: 'MaxFramerate', value: String(cadence) },
    { section: 'Player', key: 'PlayfieldFullScreen', value: '0' },
    { section: 'Player', key: 'PlayfieldWndX', value: '0' },
    { section: 'Player', key: 'PlayfieldWndY', value: '0' },
    { section: 'Player', key: 'PlayfieldWidth', value: '1280' },
    { section: 'Player', key: 'PlayfieldHeight', value: '720' },
    ...fenetre('Backglass', 'Backglass', 1300),
    ...fenetre('ScoreView', 'ScoreView', 1300 + largeur + 20),
    { section: 'Topper', key: 'TopperOutput', value: '0' },
    { section: 'Plugin.PinMAME', key: 'Enable', value: '1' },
    { section: 'Plugin.FlexDMD', key: 'Enable', value: '1' },
    { section: 'Plugin.PUP', key: 'Enable', value: '1' },
    { section: 'Plugin.B2S', key: 'Enable', value: '1' },
    { section: 'Plugin.ScoreView', key: 'Enable', value: '1' },
    { section: 'Plugin.DMDUtil', key: 'Enable', value: '0' },
    { section: 'Plugin.CyberPinballDmd', key: 'Enable', value: '1' },
    ...extra,
  ];
  const ini = path.join(dir, 'VPinballX.ini');
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
  fs.writeFileSync(ini, doc.toString());

  const log = path.join(process.env.APPDATA ?? os.homedir(), 'VPinballX', '10.8', 'vpinball.log');
  const debut = Date.now();
  const child = spawn(path.join(copie, VPX_EXE), ['-Ini', ini, '-Play', table], { cwd: copie, windowsHide: true, stdio: 'ignore' });
  const fini = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  let code;
  let cpuS;
  try {
    let jeu;
    while (!(jeu = win.listWindows((w) => w.pid === child.pid && w.title === 'Visual Pinball Player' && w.visible)[0])) {
      if (Date.now() - debut > 180000) throw new Error('La fenêtre du jeu ne s’est jamais ouverte.');
      if (child.exitCode !== null) throw new Error(`VPX s'est arrêté avant la partie (code ${child.exitCode}).`);
      await attendre(250);
    }
    // Temps processeur de VPX pendant la partie : le travail fait, moins sensible que la cadence à la charge du poste
    // (d'autres essais qui tournent en même temps).
    const avant = tempsProcesseur(child.pid);
    await attendre(dureeS * 1000);
    cpuS = tempsProcesseur(child.pid) - avant;
    win.closeWindow(jeu);
    code = await Promise.race([fini, attendre(60000).then(() => 'délai')]);
  } finally {
    if (child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    await fini;
    try {
      fs.copyFileSync(log, path.join(dir, 'vpinball.log'));
    } catch {
      // Pas de journal : rien à garder.
    }
  }
  const texte = fs.existsSync(path.join(dir, 'vpinball.log')) ? fs.readFileSync(path.join(dir, 'vpinball.log'), 'utf8') : '';
  const lignes = texte.split(/\r?\n/);
  const bilan = core.readVpxCadence(lignes);
  return { dir, code, bilan, cpuS, aCoups: lignes.filter((l) => /Cadence: stall/.test(l)).length };
}

/** Secondes de processeur (utilisateur et noyau) consommées par un processus depuis son lancement. */
function tempsProcesseur(pid) {
  const r = spawnSync('powershell', ['-NoProfile', '-Command', `(Get-Process -Id ${pid}).TotalProcessorTime.TotalSeconds`], { encoding: 'utf8', windowsHide: true });
  return Number(String(r.stdout).trim().replace(',', '.')) || 0;
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx || !a.table) {
    console.error('node scripts/banc-cadence.mjs --vpx <dossier de VPX> --table <fichier.vpx> [--fenetres 640x360,1920x1080] [--duree <s>] [--cadence <n>] [--ini Section.Clé=valeur;...]');
    process.exit(2);
  }
  const extra = (a.ini ?? '')
    .split(';')
    .filter(Boolean)
    .map((s) => {
      const [id, value] = s.split('=');
      const point = id.lastIndexOf('.');
      return { section: id.slice(0, point), key: id.slice(point + 1), value };
    });
  for (const f of (a.fenetres ?? '640x360,1920x1080').split(',')) {
    const [largeur, hauteur] = f.split('x').map(Number);
    const r = await partie({ vpx: a.vpx, table: a.table, largeur, hauteur, dureeS: Number(a.duree ?? 45), cadence: Number(a.cadence ?? 0), extra });
    const b = r.bilan;
    console.log(
      b
        ? `fenêtres ${f} : VPX ${r.cpuS !== undefined ? (r.cpuS / Number(a.duree ?? 45)).toFixed(2) : '?'} cœur(s), ${b.fps} images/s${b.memMB !== undefined ? `, ${b.memMB} Mo` : ''}, médiane ${b.p50} ms, 99e centile ${b.p99} ms, pire ${b.max} ms, ${b.late} % en retard, ${b.stalls} à-coup(s), pire fenêtre de 10 s ${b.worst10s} images/s (code ${r.code}, ${r.dir})`
        : `fenêtres ${f} : pas de bilan de cadence (code ${r.code}, ${r.dir})`,
    );
  }
}
