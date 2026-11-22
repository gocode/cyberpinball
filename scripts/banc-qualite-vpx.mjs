// Banc des pré-réglages de qualité (packages/core/src/vpxquality.ts) : la même table jouée avec chaque mode, par notre
// VPX (il écrit le temps de rendu de la carte graphique au journal, correctif 04), sur le bureau caché, sans
// synchronisation ni limite. Donne, pour chaque mode, le temps de rendu d'une image par la carte graphique (médiane et
// 95e centile) à la définition du banc. Une autre définition doit être mesurée séparément.
// À lancer par scripts/banc-qualite-vpx.ps1. Tout se fait sur des copies (VPX, table, PuP-Pack, préférences de VPX).
//   node scripts/banc-qualite-vpx.mjs --vpx <dossier de VPX 10.8.1-5436> --table <fichier.vpx> [--roms <dossier>]
//        [--duree 130000] [--largeur 1920] [--hauteur 1080] [--modes performance,equilibre,qualite,ultra]
// Construit d'abord : node scripts/vpx-corrige.mjs.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { VPX_CORRIGE_EXE, VPX_CORRIGE_PUP } from './vpx-corrige.mjs';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const EXE = 'VPinballX_BGFX64.exe';
const PUP = path.join('plugins', 'pup', VPX_CORRIGE_PUP);

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}
const attendre = (ms) => new Promise((r) => setTimeout(r, ms));

/** Copie de VPX (avec notre exécutable et notre plugin PuP), de la table et de son PuP-Pack, une fois pour tous les modes. */
function preparer({ vpx, table, roms }) {
  const dir = path.join(os.tmpdir(), 'banc-qualite-vpx');
  const copie = path.join(dir, 'vpx');
  {
    fs.mkdirSync(copie, { recursive: true });
    const r = spawnSync('robocopy', [vpx, copie, '/E', '/XJ', '/XD', 'docs', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
    if (r.status >= 8) throw new Error(`copie de VPX impossible (robocopy ${r.status})`);
  }
  fs.copyFileSync(VPX_CORRIGE_EXE, path.join(copie, EXE));
  const pup = path.join(path.dirname(VPX_CORRIGE_EXE), PUP);
  if (fs.existsSync(pup)) fs.copyFileSync(pup, path.join(copie, PUP));
  const tableDir = path.join(dir, 'table');
  fs.mkdirSync(tableDir, { recursive: true });
  const jouee = path.join(tableDir, path.basename(table));
  if (!fs.existsSync(jouee)) fs.copyFileSync(table, jouee);
  const b2s = table.replace(/\.vpx$/i, '.directb2s');
  if (fs.existsSync(b2s) && !fs.existsSync(jouee.replace(/\.vpx$/i, '.directb2s'))) fs.copyFileSync(b2s, jouee.replace(/\.vpx$/i, '.directb2s'));
  const pack = path.join(path.dirname(table), 'pupvideos');
  if (fs.existsSync(pack) && !fs.existsSync(path.join(tableDir, 'pupvideos'))) {
    const r = spawnSync('robocopy', [pack, path.join(tableDir, 'pupvideos'), '/E', '/XJ', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
    if (r.status >= 8) throw new Error(`copie du PuP-Pack impossible (robocopy ${r.status})`);
  }
  const pinmame = path.join(dir, 'pinmame');
  fs.mkdirSync(path.join(pinmame, 'roms'), { recursive: true });
  if (roms) for (const f of fs.readdirSync(roms)) fs.copyFileSync(path.join(roms, f), path.join(pinmame, 'roms', f));
  return { dir, copie, jouee, pinmame };
}

/**
 * Les réglages d'un mode, ou d'une variante pour isoler le coût d'un réglage : « defaut » (aucune clé des
 * pré-réglages : les défauts de VPX), ou « <mode>+<clé>=<valeur> » (le mode avec un réglage changé).
 */
function modeSettings(core, name) {
  if (name === 'defaut') return [];
  const [mode, ...changes] = name.split('+');
  const settings = core.qualitySettings(mode).map((s) => ({ ...s }));
  for (const change of changes) {
    const [key, value] = change.split('=');
    const s = settings.find((x) => x.key === key);
    if (s) s.value = value;
    else settings.push({ section: 'Player', key, value });
  }
  return settings;
}

/** Une partie avec les réglages d'un mode ; le bilan GPU lu dans le journal. */
async function partie({ banc, mode, dureeMs, largeur, hauteur, core }) {
  const appdata = path.join(banc.dir, `appdata-${mode.replace(/[^\w-]/g, '_')}`);
  fs.rmSync(appdata, { recursive: true, force: true });
  fs.mkdirSync(appdata, { recursive: true });
  const settings = [
    ...core.VPX_PLAY_SETTINGS,
    ...modeSettings(core, mode),
    { section: 'Player', key: 'MusicVolume', value: '0' },
    { section: 'Player', key: 'SoundVolume', value: '0' },
    { section: 'Player', key: 'SyncMode', value: '0' },
    { section: 'Player', key: 'MaxFramerate', value: '0' },
    { section: 'Player', key: 'PlayfieldFullScreen', value: '0' },
    { section: 'Player', key: 'PlayfieldWndX', value: '0' },
    { section: 'Player', key: 'PlayfieldWndY', value: '0' },
    { section: 'Player', key: 'PlayfieldWidth', value: String(largeur) },
    { section: 'Player', key: 'PlayfieldHeight', value: String(hauteur) },
    { section: 'Backglass', key: 'BackglassOutput', value: '0' },
    { section: 'ScoreView', key: 'ScoreViewOutput', value: '0' },
    { section: 'Topper', key: 'TopperOutput', value: '0' },
    { section: 'Plugin.PinMAME', key: 'Enable', value: '1' },
    { section: 'Plugin.PinMAME', key: 'PinMAMEPath', value: banc.pinmame },
    core.PINMAME_FAST_BOOT,
    { section: 'Plugin.B2S', key: 'Enable', value: '0' },
    { section: 'Plugin.B2SLegacy', key: 'Enable', value: '0' },
    { section: 'Plugin.CyberPinballDmd', key: 'Enable', value: '1' },
    { section: 'Plugin.PUP', key: 'Enable', value: '1' },
  ];
  const ini = path.join(banc.dir, `VPinballX-${mode.replace(/[^\w-]/g, '_')}.ini`);
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
  fs.writeFileSync(ini, doc.toString());
  const child = spawn(path.join(banc.copie, EXE), ['-PrefPath', appdata, '-Ini', ini, '-Play', banc.jouee], { cwd: banc.copie, windowsHide: true, stdio: 'ignore' });
  const fini = new Promise((resolve) => child.on('exit', (code) => resolve(code)));
  let code = await Promise.race([fini, attendre(dureeMs).then(() => undefined)]);
  const vivant = code === undefined;
  if (vivant) {
    // Arrêt forcé : pas de ligne « end », la dernière minute complète (« running ») sert de bilan, sans le chargement.
    child.kill();
    code = await fini;
  }
  const logFile = [path.join(appdata, 'vpinball.log'), path.join(appdata, '10.8', 'vpinball.log')].find((f) => fs.existsSync(f));
  const log = logFile ? fs.readFileSync(logFile, 'utf8').split(/\r?\n/) : [];
  const minutes = log.filter((l) => /GPU frame running/.test(l));
  return {
    mode,
    vivant,
    gpu: core.readGpuFrames(log),
    minutes: minutes.length,
    cadence: core.readVpxCadence(log),
    erreurs: log.filter((l) => / ERROR /.test(l)).length,
    crash: fs.existsSync(path.join(path.dirname(banc.jouee), 'crash.txt')),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx || !a.table) {
    console.error('Usage : --vpx <dossier de VPX 10.8.1-5436> --table <fichier.vpx> [--roms <dossier>] [--duree 130000] [--largeur 1920] [--hauteur 1080] [--modes …]');
    process.exit(2);
  }
  if (!fs.existsSync(VPX_CORRIGE_EXE)) {
    console.error('VPX corrigé absent : node scripts/vpx-corrige.mjs');
    process.exit(2);
  }
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const dureeMs = Number(a.duree ?? 130000);
  const largeur = Number(a.largeur ?? 1920);
  const hauteur = Number(a.hauteur ?? 1080);
  const modes = (a.modes ?? core.QUALITY_LEVELS.join(',')).split(',');
  const banc = preparer({ vpx: a.vpx, table: a.table, roms: a.roms });
  const resultats = [];
  for (const mode of modes) {
    console.log(`Mesure : ${mode} (${Math.round(dureeMs / 1000)} s).`);
    resultats.push(await partie({ banc, mode, dureeMs, largeur, hauteur, core }));
  }
  const px = (largeur * hauteur) / 1e6;
  console.log(`\nTable : ${path.basename(a.table)} ; fenêtre ${largeur} × ${hauteur} (${px.toFixed(2)} Mpx), sans synchronisation, ${Math.round(dureeMs / 1000)} s par mode.`);
  for (const r of resultats) {
    const g = r.gpu;
    if (!g) {
      console.log(`== ${r.mode} : aucun bilan GPU au journal${r.crash ? ' (crash.txt écrit)' : ''}`);
      continue;
    }
    console.log(
      `== ${r.mode} : GPU médiane ${g.p50Ms.toFixed(2)} ms, 95e centile ${g.p95Ms.toFixed(2)} ms, ${g.frames} images ; ` +
        `${r.cadence ? `${r.cadence.fps} i/s` : 'cadence non lue'} ; erreurs ${r.erreurs}${r.crash ? ', crash.txt' : ''}`,
    );
  }
  fs.rmSync(banc.dir, { recursive: true, force: true });
  process.exit(resultats.every((r) => r.gpu && !r.crash) ? 0 : 1);
}
