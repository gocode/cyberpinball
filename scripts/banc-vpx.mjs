// Banc d'essai de VPX dans le casque : le vrai VPX 10.8.1 et le plugin de Cyber Pinball (packages/vpx-vision3d,
// pause.h), sur le runtime OpenXR factice (packages/casque-vr/test/runtime-factice.cpp), qui joue un scénario
// (manettes, clics des joysticks, gâchettes) sans casque. Sert à suivre un geste du casque en partie jusqu'au
// plugin sans le vrai Link. À lancer par scripts/banc-vpx.ps1, sur le bureau caché : VPX y ouvre sa fenêtre
// d'aperçu, que personne ne voit.
//   node scripts/banc-vpx.mjs --vpx <dossier de VPX 10.8.1> --table <fichier.vpx> [--scenario <fichier>] [--duree <ms>]
// Cadence de VPX (13 novembre 2026, palier à 28 images par seconde sur une borne) :
//   --scenario repos     casque porté, aucun geste : la cadence seule
//   --cadence exacte     runtime factice dont l'attente d'une image ne dépend pas de la minuterie de Windows
//                        (packages/vpx-vision3d/test/runtime-cadence.cpp), comme un vrai runtime
//   --garde 0|1|2        [Plugin.CyberPinball] TimerGuard : 1 la garde de la minuterie (défaut du plugin), 0 Windows
//                        décide, 2 minuterie ignorée d'office (ce que Windows fait à un processus sans fenêtre visible)
//   --plugin 0           partie sans le plugin de Cyber Pinball ; --captures 0 : sans ses captures
//   --essai 1            [Plugin.CyberPinball] CadenceTest : l'essai de cadence d'une minute (--duree 70000)
//   --repere 1           la couche du repère de la pièce (packages/casque-vr/src/couche-repere.cpp) : trois remises
//                        d'origine en pleine partie, mesurées par la vraie sonde LibOVR, la correction écrite comme
//                        Cyber Pinball l'écrit ; verdict : l'espace de la projection de VPX revenu à sa place dans
//                        le monde (moins de 1 cm et 0,5°). Avec --couche 0 : la même partie sans la couche.
// La cadence est lue dans les mesures du plugin et, sans lui, dans la trace du runtime (cadenceDeLaTrace).
// Construit d'abord : npm run casque-vr (runtime factice), node scripts/vision3d.mjs (plugin, runtime à cadence exacte).
// VPX est copié une fois dans le dossier temporaire (jamais de jonction vers l'original) ; le plugin construit y
// remplace celui de la copie à chaque passage.

import { spawn, spawnSync } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BANC_RUNTIME = path.join(repo, 'build', 'casque-vr', 'Release', 'runtime-factice.dll');
export const BANC_PLUGIN = path.join(repo, 'build', 'vision3d', 'Release', 'plugin-cyberpinball64.dll');
export const BANC_RUNTIME_CADENCE = path.join(repo, 'build', 'vision3d', 'Release', 'runtime-cadence.dll');
/** La couche du repère de la pièce et la sonde LibOVR, construites avec le compagnon (npm run casque-vr). */
export const BANC_COUCHE_DIR = path.join(repo, 'build', 'casque-vr', 'Release');
export const BANC_COUCHE = 'XR_APILAYER_CYBERPINBALL_repere';
export const BANC_SONDE = path.join(repo, 'build', 'casque-vr', 'Release', 'cyberpinball-sonde-ovr.exe');
const VPX_EXE = 'VPinballX_BGFX64.exe';

/** Le geste du calage en partie : les deux clics des joysticks tenus 4 s, gâchette, puis A. */
export const SCENARIO_CALAGE = [
  '0 porte 1',
  '0 limite fixe',
  '0 tete 0 1.6 0 0',
  '0 manette gauche -0.3 1.02 -0.35',
  '0 manette droite 0.3 1.02 -0.35',
  '6000 bouton /user/hand/left/input/thumbstick/click 1',
  '6100 bouton /user/hand/right/input/thumbstick/click 1',
  '10100 bouton /user/hand/left/input/thumbstick/click 0',
  '10100 bouton /user/hand/right/input/thumbstick/click 0',
  '12000 valeur /user/hand/right/input/trigger/value 1',
  '12300 valeur /user/hand/right/input/trigger/value 0',
  '15000 bouton /user/hand/right/input/a/click 1',
  '15200 bouton /user/hand/right/input/a/click 0',
].join('\n');

/**
 * Trois remises d'origine en pleine partie (essai réel du 13 novembre 2026, 23:50-23:52 : 170,7°, -29,6°, -48,3°) :
 * la tête va ailleurs, puis le Quest remet l'origine sur elle (signature : la tête arrive à l'origine même, cap nul).
 */
export const SCENARIO_REPERE = [
  '0 porte 1',
  '0 limite piece 3 3',
  '0 tete 0.2 1.6 0.3 0.4',
  '0 manette gauche -0.3 1.02 -0.35',
  '0 manette droite 0.3 1.02 -0.35',
  '14000 tete 0.6 1.62 -0.4 2.98',
  '15000 origine 0.6 -0.4 2.98',
  '19000 tete 0.1 1.6 0.9 2.46',
  '20000 origine 0.1 0.9 2.46',
  '24000 tete -0.8 1.58 0.2 1.62',
  '25000 origine -0.8 0.2 1.62',
  // Puis le geste du calage en partie : VPX situe alors les manettes posées, dans son espace.
  '28000 bouton /user/hand/left/input/thumbstick/click 1',
  '28100 bouton /user/hand/right/input/thumbstick/click 1',
  '32100 bouton /user/hand/left/input/thumbstick/click 0',
  '32100 bouton /user/hand/right/input/thumbstick/click 0',
  '34000 valeur /user/hand/right/input/trigger/value 1',
  '34300 valeur /user/hand/right/input/trigger/value 0',
].join('\n');

/** La pose de l'espace de la projection de VPX dans le monde, à chaque changement (trace du runtime factice). */
export function posesProjection(trace) {
  return [...trace.matchAll(/^(\d+) \d+ projection espace=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/gm)].map((m) => ({ ms: Number(m[1]), x: Number(m[2]), y: Number(m[3]), z: Number(m[4]), yaw: Number(m[5]) }));
}

/** Les manettes que VPX situe dans son espace, à chaque changement de plus de 1 cm (trace du runtime factice). */
export function manettesVues(trace) {
  return [...trace.matchAll(/^(\d+) \d+ manette (gauche|droite) (\w+) vue=(-?[\d.]+),(-?[\d.]+),(-?[\d.]+)/gm)].map((m) => ({ ms: Number(m[1]), main: `${m[2]} ${m[3]}`, x: Number(m[4]), y: Number(m[5]), z: Number(m[6]) }));
}

/** L'écart entre deux poses au sol (cm) et en cap (degrés). */
export function ecartPose(a, b) {
  let d = a.yaw - b.yaw;
  while (d > Math.PI) d -= 2 * Math.PI;
  while (d < -Math.PI) d += 2 * Math.PI;
  return { cm: Math.hypot(a.x - b.x, a.y - b.y, a.z - b.z) * 100, deg: (Math.abs(d) * 180) / Math.PI };
}

/** Casque porté, manettes posées, aucun geste : pour mesurer la cadence de VPX. */
export const SCENARIO_REPOS = ['0 porte 1', '0 limite fixe', '0 tete 0 1.6 0 0', '0 manette gauche -0.3 1.02 -0.35', '0 manette droite 0.3 1.02 -0.35'].join('\n');

/**
 * Images par seconde d'après la trace du runtime (« <ms> <pid> image <n> … », une ligne toutes les 360 images),
 * par tranche : la cadence de VPX sans rien demander au plugin.
 */
export function cadenceDeLaTrace(trace) {
  const points = [...trace.matchAll(/^(\d+) \d+ image (\d+)/gm)].map((m) => ({ ms: Number(m[1]), n: Number(m[2]) }));
  const out = [];
  for (let i = 1; i < points.length; i++) {
    const d = points[i].ms - points[i - 1].ms;
    if (d > 0) out.push({ deMs: points[i - 1].ms, aMs: points[i].ms, images: ((points[i].n - points[i - 1].n) * 1000) / d });
  }
  return out;
}

function args(argv) {
  const out = {};
  for (let i = 0; i < argv.length; i++) if (argv[i].startsWith('--')) out[argv[i].slice(2)] = argv[i + 1];
  return out;
}

/** La copie de VPX du banc, faite une fois par version (robocopy /XJ : aucune jonction suivie ni recopiée). */
export function copieVpx(source) {
  const nom = path.basename(path.resolve(source)).replace(/[^\w.-]/g, '_');
  const dest = path.join(os.tmpdir(), 'cyberpinball-banc-vpx', nom);
  if (!fs.existsSync(path.join(dest, VPX_EXE))) {
    fs.mkdirSync(dest, { recursive: true });
    const r = spawnSync('robocopy', [source, dest, '/E', '/XJ', '/XD', 'docs', '/NFL', '/NDL', '/NJH', '/NJS', '/NP'], { windowsHide: true });
    if (r.status >= 8) throw new Error(`Copie de VPX impossible (robocopy ${r.status}).`);
  }
  const plugin = path.join(dest, 'plugins', 'cyberpinball');
  fs.mkdirSync(plugin, { recursive: true });
  fs.copyFileSync(BANC_PLUGIN, path.join(plugin, 'plugin-cyberpinball64.dll'));
  if (!fs.existsSync(path.join(plugin, 'plugin.cfg')))
    fs.writeFileSync(path.join(plugin, 'plugin.cfg'), '[configuration]\nid = "CyberPinball"\nname = "Cyber Pinball"\nversion = "1.0"\n\n[libraries]\nwindows.x64 = "plugin-cyberpinball64.dll"\n');
  return dest;
}

/** L'INI d'une partie dans le casque, comme Cyber Pinball l'écrit (vr.ts, manettes.ts, frontend.ts). */
async function iniPartie(dir, imageCalage, { garde, plugin = true, captures = true, essai = false } = {}) {
  const core = await import(pathToFileURL(path.join(repo, 'packages', 'core', 'dist', 'index.js')).href);
  const log = path.join(dir, 'casque-vpx.txt');
  const settings = [
    { section: 'PlayerVR', key: 'AskToTurnOn', value: '1' },
    { section: 'PlayerVR', key: 'ControllerLockbarScale', value: '1' },
    { section: 'PlayerVR', key: 'ControllerCabYOffset', value: '0' },
    { section: 'Player', key: 'VRPreview', value: '0' },
    { section: 'Plugin.CyberPinball', key: 'Enable', value: plugin ? '1' : '0' },
    ...(garde === undefined ? [] : [{ section: 'Plugin.CyberPinball', key: 'TimerGuard', value: String(garde) }]),
    ...(essai ? [{ section: 'Plugin.CyberPinball', key: 'CadenceTest', value: '1' }] : []),
    { section: 'Plugin.CyberPinball', key: 'LogFile', value: log },
    { section: 'Plugin.CyberPinball', key: 'Calibrate', value: '1' },
    { section: 'Plugin.CyberPinball', key: 'CalibrateHeight', value: '0' },
    { section: 'Plugin.CyberPinball', key: 'CalibrateLabel', value: 'Caler la borne' },
    // Le schéma des manettes sous « Caler la borne » (image faite par Cyber Pinball), et la capture de l'étape.
    { section: 'Plugin.CyberPinball', key: 'CalibrateImage', value: imageCalage ?? '' },
    { section: 'Plugin.CyberPinball', key: 'CalibratedImage', value: imageCalage ? imageCalage.replace(/pause-image\.png$/, 'pause-image-calee.png') : '' },
    { section: 'Plugin.CyberPinball', key: 'CaptureDir', value: captures ? dir : '' },
    ...core.vpxHeadsetInput(''),
  ];
  const ini = path.join(dir, 'VPinballX.ini');
  const doc = core.IniDocument.parse('');
  core.applyVpxSettings(doc, settings);
  fs.writeFileSync(ini, doc.toString());
  return { ini, log };
}

export async function jouerVpx({ vpx, table, scenario = SCENARIO_CALAGE, dureeMs = 40000, imageCalage, garde, plugin = true, captures = true, cadenceExacte = false, essai = false, couche = false, pendant }) {
  const runtime = cadenceExacte ? BANC_RUNTIME_CADENCE : BANC_RUNTIME;
  if (!fs.existsSync(runtime)) throw new Error(cadenceExacte ? 'Runtime à cadence exacte absent : node scripts/vision3d.mjs.' : 'Runtime factice absent : npm run casque-vr.');
  if (!fs.existsSync(BANC_PLUGIN)) throw new Error('Plugin absent : node scripts/vision3d.mjs.');
  const copie = copieVpx(vpx);
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-vpx-'));
  const { ini, log } = await iniPartie(dir, imageCalage, { garde, plugin, captures, essai });
  const manifeste = path.join(dir, 'runtime.json');
  fs.writeFileSync(manifeste, JSON.stringify({ file_format_version: '1.0.0', runtime: { name: 'Banc Cyber Pinball', library_path: runtime } }, null, 2));
  const scenarioFile = path.join(dir, 'scenario.txt');
  const traceFile = path.join(dir, 'trace.txt');
  fs.writeFileSync(scenarioFile, scenario.trim() + '\n');
  const env = {
    ...process.env,
    XR_RUNTIME_JSON: manifeste,
    CYBERPINBALL_XR_SCENARIO: scenarioFile,
    CYBERPINBALL_XR_TRACE: traceFile,
    CYBERPINBALL_XR_DEBUT_FICHIER: path.join(dir, 'debut.txt'),
  };
  // La couche du repère de la pièce, comme Cyber Pinball la pose au lancement d'une partie dans le casque.
  const correction = path.join(dir, 'correction-partie.txt');
  const journalCouche = path.join(dir, 'couche-repere.txt');
  if (couche) {
    fs.writeFileSync(correction, `journal ${journalCouche}\nsaut 0 0 0 0\n`);
    Object.assign(env, { XR_API_LAYER_PATH: BANC_COUCHE_DIR, XR_ENABLE_API_LAYERS: BANC_COUCHE, CYBERPINBALL_REPERE: correction });
  }
  // La table jouée est une copie : VPX ne touche jamais à l'original (ni .ini de table, ni fichiers voisins).
  const jouee = path.join(dir, path.basename(table));
  fs.copyFileSync(table, jouee);
  const vbs = table.replace(/\.vpx$/i, '.vbs');
  if (fs.existsSync(vbs)) fs.copyFileSync(vbs, jouee.replace(/\.vpx$/i, '.vbs'));
  const sortie = [];
  const child = spawn(path.join(copie, VPX_EXE), ['-Ini', ini, '-Play', jouee], { cwd: copie, env, windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.on('data', (c) => sortie.push(String(c)));
  child.stderr.on('data', (c) => sortie.push(String(c)));
  // Ce qui joue à côté de VPX pendant la partie (la sonde de Cyber Pinball) : arrêté à la fin.
  const aCote = pendant?.({ dir, env, correction, journalCouche });
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => {
      spawnSync('taskkill', ['/PID', String(child.pid), '/T', '/F'], { windowsHide: true });
    }, dureeMs);
    child.on('exit', (c) => {
      clearTimeout(timer);
      resolve(c);
    });
  });
  await aCote?.stop?.();
  const lire = (f) => (fs.existsSync(f) ? fs.readFileSync(f, 'utf8') : '');
  const vpxLog = [path.join(dir, 'vpinball.log'), path.join(copie, 'vpinball.log'), path.join(process.env.APPDATA ?? '', 'VPinballX', 'vpinball.log')].find((f) => fs.existsSync(f) && fs.statSync(f).mtimeMs > Date.now() - dureeMs - 60000);
  return { dir, code, plugin: lire(log), trace: lire(traceFile), couche: lire(journalCouche), vpxLog: vpxLog ? lire(vpxLog) : '', vpxLogFile: vpxLog, sortie: sortie.join('') };
}

/**
 * La preuve de la couche du repère (--repere 1) : VPX joue SCENARIO_REPERE ; la vraie sonde LibOVR (OvrProbe de
 * l'application) mesure les remises d'origine ; chaque saut est composé avec les précédents et la correction écrite
 * comme Cyber Pinball l'écrit (frontend.ts). Rend les poses de l'espace de la projection et le verdict.
 */
export async function preuveRepere({ vpx, table, couche = true, dureeMs = 40000 }) {
  const req = (await import('node:module')).createRequire(import.meta.url);
  const sondeOvr = req('../app/dist/sonde-ovr.js');
  const core = req('../packages/core/dist/index.js');
  const sauts = [];
  const r = await jouerVpx({
    vpx,
    table,
    scenario: SCENARIO_REPERE,
    dureeMs,
    couche,
    pendant: ({ dir, env, correction, journalCouche }) => {
      let probe;
      let cumul = { angle: 0, tx: 0, tz: 0, dy: 0 };
      // La sonde part une fois la session de VPX ouverte : le scénario compte depuis elle.
      const debut = path.join(dir, 'debut.txt');
      const attente = setInterval(() => {
        if (!fs.existsSync(debut) || probe) return;
        clearInterval(attente);
        probe = new sondeOvr.OvrProbe({
          appDir: dir,
          exe: BANC_SONDE,
          dll: BANC_RUNTIME,
          env,
          log: () => undefined,
          onJump: (j) => {
            cumul = core.composeJumps(cumul, j);
            sauts.push({ ...j, ms: Date.now() - Number(fs.readFileSync(debut, 'utf8')) });
            const tmp = `${correction}.tmp`;
            fs.writeFileSync(tmp, `journal ${journalCouche}\nsaut ${cumul.angle} ${cumul.tx} ${cumul.tz} ${cumul.dy}\n`);
            fs.renameSync(tmp, correction);
          },
        });
        probe.set(true);
      }, 100);
      return {
        stop: async () => {
          clearInterval(attente);
          probe?.set(false);
          await new Promise((res) => setTimeout(res, 500));
        },
      };
    },
  });
  const poses = posesProjection(r.trace);
  const depart = poses[0];
  const fin = poses.at(-1);
  const ecart = depart && fin ? ecartPose(depart, fin) : undefined;
  // VPX ne situe les manettes qu'au geste du calage, fait après les trois remises : posées et immobiles dans le monde,
  // il doit les voir où elles étaient au lancement (origine du monde au départ : leurs prises, 3 cm au-dessus et 8 cm
  // en arrière des bouts du scénario).
  const vues = manettesVues(r.trace);
  const prises = { 'gauche prise': { x: -0.3, y: 1.05, z: -0.27 }, 'droite prise': { x: 0.3, y: 1.05, z: -0.27 } };
  const mains = Object.entries(prises).map(([main, w]) => {
    const l = vues.filter((v) => v.main === main);
    return l.length ? { main, cm: Math.hypot(l.at(-1).x - w.x, l.at(-1).y - w.y, l.at(-1).z - w.z) * 100, vues: l.length } : { main, cm: NaN, vues: 0 };
  });
  const mainsOk = mains.every((m) => m.vues > 0 && m.cm < 1);
  return { ...r, sauts, poses, ecart, mains, ok: Boolean(ecart && sauts.length === 3 && ecart.cm < 1 && ecart.deg < 0.5 && mainsOk) };
}

/**
 * La garde de la couche (--garde-couche 1), règle « plantage de VPX : module fautif » : une première partie lancée avec
 * la couche, où VPX tombe (verbe planter du runtime factice, code 0xC0000005) ; jugée comme l'application la juge
 * (roomLayerFault), la couche est écartée (setRoomLayerAside) ; la partie suivante se lance sans elle et se joue.
 */
export async function preuveGardeCouche({ vpx, table }) {
  const req = (await import('node:module')).createRequire(import.meta.url);
  const core = req('../packages/core/dist/index.js');
  const couche = req('../app/dist/couche-repere.js');
  const vrDir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-garde-couche-'));
  const version = 'banc';
  const avec = !couche.roomLayerSetAside(vrDir, version);
  const t0 = Date.now();
  const r1 = await jouerVpx({ vpx, table, scenario: `${SCENARIO_REPOS}\n8000 planter`, dureeMs: 25000, couche: avec });
  // Comme le lanceur de l'application : un code de sortie d'erreur sans arrêt demandé est un plantage.
  const failure = r1.code !== 0 && r1.code !== null ? 'crash' : undefined;
  const faute = avec ? core.roomLayerFault({ failure, exitCode: r1.code, seconds: (Date.now() - t0) / 1000, stopAsked: false }) : undefined;
  if (faute) couche.setRoomLayerAside(vrDir, version, faute);
  const ecartee = couche.roomLayerSetAside(vrDir, version);
  const r2 = await jouerVpx({ vpx, table, scenario: SCENARIO_REPOS, dureeMs: 15000, couche: !ecartee });
  const images2 = Math.max(0, ...[...r2.trace.matchAll(/^\d+ \d+ image (\d+)/gm)].map((m) => Number(m[1])));
  // Une autre version de l'application : l'écart est levé.
  const leveeApresMiseAJour = !couche.roomLayerSetAside(vrDir, 'version-suivante');
  fs.rmSync(vrDir, { recursive: true, force: true });
  return {
    r1,
    r2,
    faute,
    ecartee,
    images2,
    leveeApresMiseAJour,
    ok: Boolean(avec && r1.code === 0xc0000005 && /couche chargée par VPX/.test(r1.couche) && faute && ecartee && !r2.couche && images2 > 0 && leveeApresMiseAJour),
  };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const a = args(process.argv.slice(2));
  if (!a.vpx || !a.table) {
    console.error('node scripts/banc-vpx.mjs --vpx <dossier de VPX> --table <fichier.vpx> [--scenario <fichier>] [--duree <ms>]');
    process.exit(2);
  }
  if (a['garde-couche'] === '1') {
    const g = await preuveGardeCouche({ vpx: a.vpx, table: a.table });
    console.log(`Partie 1, avec la couche : sortie de VPX ${g.r1.code} (0x${(g.r1.code >>> 0).toString(16).toUpperCase()})\n${g.r1.couche || '(journal de la couche vide)'}`);
    console.log(`Jugée : ${g.faute ?? 'rien d’anormal'} ; couche écartée : ${g.ecartee ? `oui (${g.ecartee.why})` : 'non'}`);
    console.log(`Partie 2 : ${g.r2.couche ? 'avec la couche (FAUX)' : 'sans la couche'}, ${g.images2} image(s) rendue(s), sortie ${g.r2.code}`);
    console.log(`Autre version de l'application : écart ${g.leveeApresMiseAJour ? 'levé' : 'maintenu (FAUX)'}`);
    console.log(`Verdict : ${g.ok ? 'OK' : 'ÉCHEC'}.`);
    process.exit(g.ok ? 0 : 1);
  }
  if (a.repere === '1') {
    const p = await preuveRepere({ vpx: a.vpx, table: a.table, couche: a.couche !== '0', ...(a.duree && { dureeMs: Number(a.duree) }) });
    console.log(`Dossier : ${p.dir}\nSortie de VPX : ${p.code}`);
    console.log(`--- sauts mesurés par la sonde (${p.sauts.length}) ---\n` + p.sauts.map((s) => `${s.ms} ms : ${((s.angle * 180) / Math.PI).toFixed(1)}°, ${(Math.hypot(s.tx, s.tz) * 100).toFixed(0)} cm`).join('\n'));
    console.log('--- espace de la projection de VPX dans le monde ---\n' + p.poses.map((q) => `${q.ms} ms : ${q.x.toFixed(4)}, ${q.y.toFixed(4)}, ${q.z.toFixed(4)}, cap ${((q.yaw * 180) / Math.PI).toFixed(2)}°`).join('\n'));
    console.log('--- manettes vues par VPX au geste du calage, face à leur place au lancement ---\n' + p.mains.map((m) => `${m.main} : ${m.vues ? `${m.cm.toFixed(2)} cm (${m.vues} relevé(s))` : 'jamais située'}`).join('\n'));
    console.log(`xrLocateSpaces : ${/xrLocateSpaces utilise/.test(p.trace) ? 'utilisé par VPX' : 'pas utilisé par VPX'}`);
    console.log('--- couche du repère ---\n' + (p.couche || '(rien)'));
    console.log(p.ecart ? `Verdict : ${p.ok ? 'OK' : 'ÉCHEC'}, projection à ${p.ecart.cm.toFixed(2)} cm et ${p.ecart.deg.toFixed(2)}° de sa place de départ après ${p.sauts.length} saut(s).` : 'Verdict : ÉCHEC, aucune projection tracée.');
    process.exit(p.ok ? 0 : 1);
  }
  const r = await jouerVpx({
    vpx: a.vpx,
    table: a.table,
    scenario: a.scenario === 'repos' ? SCENARIO_REPOS : a.scenario ? fs.readFileSync(a.scenario, 'utf8') : undefined,
    dureeMs: a.duree ? Number(a.duree) : undefined,
    imageCalage: a['image-calage'],
    garde: a.garde === undefined ? undefined : Number(a.garde),
    plugin: a.plugin !== '0',
    captures: a.captures !== '0',
    cadenceExacte: a.cadence === 'exacte',
    essai: a.essai === '1',
  });
  console.log(`Dossier : ${r.dir}\nSortie de VPX : ${r.code}\nJournal de VPX : ${r.vpxLogFile ?? '(introuvable)'}`);
  console.log('--- cadence (trace du runtime) ---\n' + cadenceDeLaTrace(r.trace).map((c) => `${(c.deMs / 1000).toFixed(1)} s à ${(c.aMs / 1000).toFixed(1)} s : ${c.images.toFixed(1)} images/s`).join('\n'));
  console.log('--- plugin (casque-vpx.txt) ---\n' + r.plugin);
  console.log('--- runtime (trace) ---\n' + r.trace.split('\n').filter((l) => !/ image /.test(l)).slice(0, 200).join('\n'));
  console.log('--- VPX (extraits) ---\n' + r.vpxLog.split('\n').filter((l) => /OpenXR|XR|binding|Plugin|CyberPinball|Input|ERROR|WARN/i.test(l)).slice(0, 120).join('\n'));
}
