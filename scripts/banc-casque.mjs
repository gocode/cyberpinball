// Banc d'essai du compagnon du casque (packages/casque-vr) : le vrai compagnon, sur le runtime OpenXR factice
// (packages/casque-vr/test/runtime-factice.cpp), qui joue un scénario (casque retiré et remis, boutons des
// manettes, poses, limite de la pièce) sans casque ni fenêtre. Rend les lignes du compagnon et la trace du
// runtime, horodatées depuis le début du scénario.
//   node scripts/banc-casque.mjs <scenario.txt> [durée en ms]   (construit d'abord : npm run casque-vr)

import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
export const BANC_COMPAGNON = path.join(repo, 'build', 'casque-vr', 'Release', 'cyberpinball-casque.exe');
export const BANC_RUNTIME = path.join(repo, 'build', 'casque-vr', 'Release', 'runtime-factice.dll');
export const BANC_SONDE = path.join(repo, 'build', 'casque-vr', 'Release', 'cyberpinball-sonde-ovr.exe');
/** Le témoin de la dernière construction réussie (HEADSET_BUILT de scripts/casque-vr.mjs). */
const HEADSET_BUILT = path.join(repo, 'build', 'casque-vr', 'construit.txt');

/**
 * La sonde LibOVR (packages/casque-vr/src/sonde-ovr.cpp) sur le runtime factice, qui exporte aussi les fonctions
 * de LibOVR : rend ses lignes au bout de `dureeMs` (la sonde reçoit « fin » et s'arrête).
 */
export async function sonder(scenario, { dureeMs = 3000, dll = BANC_RUNTIME, reel = false } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-sonde-'));
  const scenarioFile = path.join(dir, 'scenario.txt');
  fs.writeFileSync(scenarioFile, scenario.trim() + '\n');
  const env = { ...process.env, CYBERPINBALL_XR_SCENARIO: scenarioFile, CYBERPINBALL_XR_TRACE: path.join(dir, 'trace.txt'), CYBERPINBALL_XR_DEBUT_FICHIER: path.join(dir, 'debut.txt') };
  // Le vrai runtime (`reel`) ne lit pas de scénario : l'environnement du banc ne lui est pas donné.
  const child = spawn(BANC_SONDE, ['--ovr', dll], { env: reel ? process.env : env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
  let out = '';
  child.stdout.setEncoding('utf8');
  child.stdout.on('data', (c) => (out += c));
  child.stderr.on('data', () => undefined);
  const code = await new Promise((resolve) => {
    const timer = setTimeout(() => child.stdin.end('fin\n'), dureeMs);
    const kill = setTimeout(() => child.kill(), dureeMs + 5000);
    child.on('exit', (c) => {
      clearTimeout(timer);
      clearTimeout(kill);
      resolve(c);
    });
  });
  return { code, lignes: out.split(/\r?\n/).filter(Boolean) };
}

/** Le banc est-il construit (compagnon et runtime factice) ? */
export function bancPret() {
  return fs.existsSync(BANC_COMPAGNON) && fs.existsSync(BANC_RUNTIME);
}

/**
 * Les sources du banc (packages/casque-vr : CMakeLists.txt, src, test) plus récentes que sa dernière construction
 * réussie (témoin écrit par scripts/casque-vr.mjs ; à défaut, le plus récent des binaires) : le banc les jouerait
 * sans elles, et ses essais échoueraient (ou passeraient) pour rien. Vide quand il est à jour ou pas construit.
 */
export function bancPerime() {
  const bins = [BANC_COMPAGNON, BANC_RUNTIME, BANC_SONDE].filter((f) => fs.existsSync(f));
  if (!bins.length) return [];
  const built = fs.existsSync(HEADSET_BUILT) ? fs.statSync(HEADSET_BUILT).mtimeMs : Math.max(...bins.map((f) => fs.statSync(f).mtimeMs));
  const base = path.join(repo, 'packages', 'casque-vr');
  const files = [path.join(base, 'CMakeLists.txt')];
  for (const dir of ['src', 'test']) {
    for (const name of fs.readdirSync(path.join(base, dir), { recursive: true })) files.push(path.join(base, dir, String(name)));
  }
  return files
    .filter((f) => fs.statSync(f).isFile() && fs.statSync(f).mtimeMs > built)
    .map((f) => path.relative(repo, f).replace(/\\/g, '/'));
}

/**
 * Joue un scénario : lance le compagnon (relancé comme Cyber Pinball le ferait s'il sort de lui-même, quand
 * `relancer` est vrai), lui décrit un écran, et rend au bout de `dureeMs` ses lignes et la trace du runtime.
 * `commandes` : des lignes à envoyer au compagnon à un instant donné ([ms, ligne]).
 */
export async function jouer(scenario, { dureeMs = 8000, commandes = [], relancer = false, suspensionMaxMs } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'banc-casque-'));
  const scenarioFile = path.join(dir, 'scenario.txt');
  const traceFile = path.join(dir, 'trace.txt');
  fs.writeFileSync(scenarioFile, scenario.trim() + '\n');
  // L'instant zéro : la première session créée (le runtime l'écrit) ; un compagnon lent à démarrer (machine
  // chargée, toute la suite de tests en même temps) ne décale pas le scénario.
  const startFile = path.join(dir, 'debut.txt');
  let debut = Date.now();
  const env = {
    ...process.env,
    CYBERPINBALL_XR_SCENARIO: scenarioFile,
    CYBERPINBALL_XR_TRACE: traceFile,
    CYBERPINBALL_XR_DEBUT_FICHIER: startFile,
    ...(suspensionMaxMs !== undefined && { CYBERPINBALL_SUSPENSION_MAX_MS: String(suspensionMaxMs) }),
  };
  const lignes = [];
  let lancements = 0;
  let fini = false;
  const vivants = new Set();
  const lancer = () => {
    lancements++;
    const child = spawn(BANC_COMPAGNON, ['--chargeur', BANC_RUNTIME], { env, windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    vivants.add(child);
    let tampon = '';
    child.stdout.setEncoding('utf8');
    child.stdout.on('data', (chunk) => {
      tampon += chunk;
      let nl;
      while ((nl = tampon.indexOf('\n')) >= 0) {
        const ligne = tampon.slice(0, nl).trim();
        tampon = tampon.slice(nl + 1);
        if (ligne && !/^libre /.test(ligne)) lignes.push({ ms: Date.now(), pid: child.pid, ligne });
      }
    });
    child.stderr.on('data', () => undefined);
    child.on('exit', (code) => {
      vivants.delete(child);
      lignes.push({ ms: Date.now(), pid: child.pid, ligne: `(sortie ${code})` });
      if (relancer && !fini) setTimeout(lancer, 50);
    });
    // Un écran décrit, comme Cyber Pinball le fait au lancement.
    child.stdin.write('panneau playfield 0 0 640 360 0 1.0 -0.6 0 0 0 1 0.9 0.5\nfin\n');
    return child;
  };
  lancer();
  const timers = commandes.map(([ms, ligne]) =>
    setTimeout(() => {
      for (const c of vivants) {
        try {
          c.stdin.write(`${ligne}\n`);
        } catch {
          // Compagnon parti entre-temps.
        }
      }
    }, ms),
  );
  // Le scénario commence à la première session (jusqu'à 60 s pour la créer), puis dure `dureeMs`.
  for (let i = 0; i < 600 && !fs.existsSync(startFile); i++) await new Promise((r) => setTimeout(r, 100));
  if (fs.existsSync(startFile)) debut = Number(fs.readFileSync(startFile, 'utf8')) || debut;
  await new Promise((r) => setTimeout(r, Math.max(0, debut + dureeMs - Date.now())));
  fini = true;
  for (const t of timers) clearTimeout(t);
  for (const c of [...vivants]) {
    try {
      c.stdin.write('quitter\n');
    } catch {
      // Déjà parti.
    }
  }
  await new Promise((r) => setTimeout(r, 1500));
  for (const c of [...vivants]) c.kill();
  const trace = fs.existsSync(traceFile)
    ? fs
        .readFileSync(traceFile, 'utf8')
        .split('\n')
        .filter(Boolean)
        .map((l) => {
          const [ms, pid, ...rest] = l.split(' ');
          return { ms: Number(ms), pid: Number(pid), ligne: rest.join(' ') };
        })
    : [];
  fs.rmSync(dir, { recursive: true, force: true });
  // Les lignes du compagnon, en millisecondes depuis l'instant zéro du scénario, comme la trace.
  for (const l of lignes) l.ms -= debut;
  return { lignes, trace, lancements };
}

if (process.argv[1] && path.resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const file = process.argv[2];
  if (!file || !bancPret()) {
    console.log(bancPret() ? 'usage : node scripts/banc-casque.mjs <scenario.txt> [durée]' : 'Banc pas construit : npm run casque-vr');
    process.exit(2);
  }
  const r = await jouer(fs.readFileSync(file, 'utf8'), { dureeMs: Number(process.argv[3]) || 8000, relancer: true });
  for (const l of [...r.lignes.map((x) => ({ ...x, src: 'compagnon' })), ...r.trace.map((x) => ({ ...x, src: 'runtime' }))].sort((a, b) => a.ms - b.ms))
    console.log(`${String(l.ms).padStart(6)} ${l.src.padEnd(9)} ${l.pid} ${l.ligne}`);
}
