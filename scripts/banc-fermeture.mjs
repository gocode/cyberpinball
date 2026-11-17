// Banc de la fermeture de VPX avec un DMD réel (ZeDMD par le WiFi) : la partie se ferme comme un joueur la quitte,
// et le banc dit si VPX s'est arrêté proprement ou par un accès mémoire interdit (0xC0000005).
//
// Relevé le 17/11/2026 sur une borne à ZeDMD WiFi : sur les tables dont une source de DMD survit à la partie
// (FlexDMD, Serum…), VPX diffuse un dernier changement de sources pendant qu'il défait la table ; DMDUtil, dont le
// DMD vient d'être détruit, en recrée un et relance la recherche des afficheurs (connexion au ZeDMD WiFi), puis il
// est déchargé ; le fil de la recherche se réveille dans du code déchargé, quelques secondes plus tard : VPX plante
// en se fermant. Ici, une table jouée avec un FlexDMD (le script posé à côté du .vpx), DMDUtil réglé sur un ZeDMD
// WiFi à une adresse qui ne répond pas (192.0.2.1, réservée à la documentation : la connexion attend), puis la fenêtre
// du jeu fermée. À lancer par scripts/banc-fermeture.ps1, sur le bureau caché.
//   node scripts/banc-fermeture.mjs --vpx <dossier de VPX 10.8.1> --table <fichier.vpx> [--plugin 0|1] [--wifi <adresse>]
//        [--attente <ms>] [--fois <n>] [--faux-zedmd <ms>]
// --plugin 0 : sans le plugin « CyberPinballDmd » (la fermeture telle que VPX la fait seul) ; --attente : son réglage
// ShutdownWait ; --faux-zedmd : un faux ZeDMD WiFi sur 127.0.0.1 qui répond en <ms> (celui d'une vraie borne, joignable).
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
const ACCES_INTERDIT = 3221225477;

/** Script de la table au banc : un FlexDMD qui tourne, dont la source survit à la fin de la partie. */
const SCRIPT = [
  'Option Explicit',
  'On Error Resume Next',
  'Dim FlexDMD',
  'Set FlexDMD = CreateObject("FlexDMD.FlexDMD")',
  'FlexDMD.GameName = "banc"',
  'FlexDMD.RenderMode = 2',
  'FlexDMD.Width = 128',
  'FlexDMD.Height = 32',
  'FlexDMD.Clear = True',
  'FlexDMD.Run = True',
  '',
].join('\r\n');

const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

/**
 * Faux ZeDMD WiFi sur 127.0.0.1 : l'API HTTP que libzedmd lit (ZeDMDWiFi::DoConnect, « /handshake »), qui répond
 * après `delaiMs`, comme un ZeDMD que la partie précédente vient de quitter. undefined : le port 80 est déjà pris.
 */
async function fauxZedmd(delaiMs) {
  const http = await import('node:http');
  const server = http.createServer((req, res) => {
    setTimeout(() => {
      const corps = req.url === '/handshake' ? '128|32|5.1.8|0|UDP|3333|5|0' : req.url === '/get_version' ? '5.1.8' : '0';
      res.writeHead(200, { 'Content-Type': 'text/plain', Connection: 'close' });
      res.end(corps);
    }, delaiMs);
  });
  return new Promise((resolve) => {
    server.once('error', () => resolve(undefined));
    server.listen(80, '127.0.0.1', () => resolve(server));
  });
}

/** Une partie fermée par la croix de sa fenêtre : le code de sortie de VPX et ce que son journal dit de la fin. */
export async function fermeture({ vpx, table, plugin = true, wifi = '192.0.2.1', attente, partieMs = 8000, delaiZedmd }) {
  const faux = delaiZedmd !== undefined ? await fauxZedmd(delaiZedmd) : undefined;
  if (delaiZedmd !== undefined && !faux) throw new Error('Port 80 déjà pris : pas de faux ZeDMD.');
  if (faux) wifi = '127.0.0.1';
  try {
    return await partieFermee({ vpx, table, plugin, wifi, attente, partieMs });
  } finally {
    faux?.close();
  }
}

async function partieFermee({ vpx, table, plugin, wifi, attente, partieMs }) {
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const win = await import(pathToFileURL(path.join(repo, 'packages', 'win-displays', 'dist', 'index.js')).href);
  const copie = copieVpx(vpx);
  const dossierPlugin = path.join(copie, 'plugins', 'cyberpinball-dmd');
  fs.mkdirSync(dossierPlugin, { recursive: true });
  const dll = path.join(dossierPlugin, path.basename(BANC_DMD_PLUGIN));
  if (!fs.existsSync(dll) || !fs.readFileSync(dll).equals(fs.readFileSync(BANC_DMD_PLUGIN))) fs.copyFileSync(BANC_DMD_PLUGIN, dll);
  fs.copyFileSync(path.join(repo, 'packages', 'vpx-vision3d', 'cyberpinball-dmd.cfg'), path.join(dossierPlugin, 'plugin.cfg'));
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-fermeture-'));
  const journalPlugin = path.join(dir, 'dmd.txt');
  const settings = [
    ...core.VPX_PLAY_SETTINGS,
    { section: 'Player', key: 'MusicVolume', value: '0' },
    { section: 'Player', key: 'SoundVolume', value: '0' },
    { section: 'Player', key: 'SyncMode', value: '0' },
    { section: 'Player', key: 'MaxFramerate', value: '60' },
    { section: 'Player', key: 'PlayfieldFullScreen', value: '0' },
    { section: 'Player', key: 'PlayfieldWndX', value: '0' },
    { section: 'Player', key: 'PlayfieldWndY', value: '0' },
    { section: 'Player', key: 'PlayfieldWidth', value: '640' },
    { section: 'Player', key: 'PlayfieldHeight', value: '480' },
    { section: 'Backglass', key: 'BackglassOutput', value: '0' },
    { section: 'Topper', key: 'TopperOutput', value: '0' },
    { section: 'ScoreView', key: 'ScoreViewOutput', value: '0' },
    { section: 'Plugin.PinMAME', key: 'Enable', value: '0' },
    { section: 'Plugin.FlexDMD', key: 'Enable', value: '1' },
    { section: 'Plugin.DMDUtil', key: 'Enable', value: '1' },
    { section: 'Plugin.DMDUtil', key: 'ZeDMD', value: '0' },
    { section: 'Plugin.DMDUtil', key: 'ZeDMDWiFiEnabled', value: '1' },
    { section: 'Plugin.DMDUtil', key: 'ZeDMDWiFiAddr', value: wifi },
    { section: 'Plugin.CyberPinballDmd', key: 'Enable', value: plugin ? '1' : '0' },
    { section: 'Plugin.CyberPinballDmd', key: 'LogFile', value: journalPlugin },
    ...(attente !== undefined ? [{ section: 'Plugin.CyberPinballDmd', key: 'ShutdownWait', value: String(attente) }] : []),
  ];
  const ini = path.join(dir, 'VPinballX.ini');
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
  fs.writeFileSync(ini, doc.toString());
  const jouee = path.join(dir, path.basename(table));
  fs.copyFileSync(table, jouee);
  fs.writeFileSync(jouee.replace(/\.vpx$/i, '.vbs'), SCRIPT);

  const debut = Date.now();
  const child = spawn(path.join(copie, VPX_EXE), ['-Ini', ini, '-Play', jouee], { cwd: copie, windowsHide: true, stdio: 'ignore' });
  const fini = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  let code;
  let ferme;
  try {
    // La partie commence : la fenêtre du jeu est là ; elle tourne `partieMs`, puis on la ferme comme un joueur.
    let fenetre;
    while (!(fenetre = win.listWindows((w) => w.pid === child.pid && w.title === 'Visual Pinball Player' && w.visible)[0])) {
      if (Date.now() - debut > 120000) throw new Error('La fenêtre du jeu ne s’est jamais ouverte.');
      if (child.exitCode !== null) throw new Error(`VPX s'est arrêté avant la partie (code ${child.exitCode}).`);
      await attendre(250);
    }
    await attendre(partieMs);
    ferme = Date.now();
    win.closeWindow(fenetre);
    code = await Promise.race([fini, attendre(60000).then(() => 'délai')]);
  } finally {
    if (child.exitCode === null) spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    await fini;
    // Le journal de VPX de cette partie, gardé à côté d'elle (le suivant l'écrase).
    const log = path.join(process.env.APPDATA ?? os.homedir(), 'VPinballX', '10.8', 'vpinball.log');
    try {
      fs.copyFileSync(log, path.join(dir, 'vpinball.log'));
    } catch {
      // Pas de journal : rien à garder.
    }
  }
  return { dir, code, fermetureMs: ferme ? Date.now() - ferme : undefined, journalPlugin: fs.existsSync(journalPlugin) ? fs.readFileSync(journalPlugin, 'utf8') : '' };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx || !a.table) {
    console.error('node scripts/banc-fermeture.mjs --vpx <dossier de VPX> --table <fichier.vpx> [--plugin 0|1] [--wifi <adresse>] [--attente <ms>] [--fois <n>] [--faux-zedmd <ms>]');
    process.exit(2);
  }
  const fois = Number(a.fois ?? 1);
  let plantages = 0;
  for (let i = 0; i < fois; i++) {
    const r = await fermeture({
      vpx: a.vpx,
      table: a.table,
      plugin: a.plugin !== '0',
      wifi: a.wifi,
      attente: a.attente === undefined ? undefined : Number(a.attente),
      delaiZedmd: a['faux-zedmd'] === undefined ? undefined : Number(a['faux-zedmd']),
    });
    const plante = r.code === ACCES_INTERDIT;
    if (plante) plantages++;
    console.log(`partie ${i + 1} : VPX ${plante ? 'PLANTÉ (0xC0000005)' : `fermé (code ${r.code})`} ${r.fermetureMs} ms après la fermeture de la fenêtre (${r.dir})`);
    if (r.journalPlugin.trim()) console.log(r.journalPlugin.trim().split(/\r?\n/).map((l) => `  plugin : ${l}`).join('\n'));
  }
  console.log(plantages ? `banc de la fermeture : ${plantages} plantage(s) sur ${fois}` : `banc de la fermeture : ${fois} fermeture(s) propre(s)`);
  process.exit(plantages ? 1 : 0);
}
