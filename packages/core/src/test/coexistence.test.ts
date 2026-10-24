import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  FORBIDDEN_WINDOWS_CALLS,
  frontendNames,
  installedFrontends,
  parseTaskbarMarker,
  runningFrontends,
  simulatedInstalledFrontends,
  simulatedProcessNames,
  taskbarMarkerText,
  taskbarsToRestore,
  WINDOWS_CHANGES,
  type TaskbarState,
} from '../coexistence';
import { resolveLocations } from '../locations';

// Cohabitation avec un autre menu de borne (PinUP Popper, PinballX, PinballY) sur le même
// PC. L'invariant : Cyber Pinball ne change dans Windows que ce que WINDOWS_CHANGES déclare,
// aux endroits qu'il déclare, et ne remet que ce qu'il a lui-même changé.

const REPO = path.join(__dirname, '..', '..', '..', '..');

/** Sources de l'application et des paquets (sans les tests ni ce registre), et l'installeur. */
function sources(): { file: string; text: string }[] {
  const found: { file: string; text: string }[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['test', 'node_modules', 'dist'].includes(entry.name)) walk(full);
      } else if (/\.(ts|mjs|cjs|js|nsi|ps1|cmd)$/.test(entry.name) && !entry.name.endsWith('.d.ts')) {
        found.push({ file: path.relative(REPO, full).replace(/\\/g, '/'), text: fs.readFileSync(full, 'utf8') });
      }
    }
  };
  for (const dir of ['app/src', 'app/renderer', 'packages/core/src', 'packages/win-displays/src', 'packages/installer/src', 'scripts']) walk(path.join(REPO, dir));
  found.push({ file: 'lanceur.ps1', text: fs.readFileSync(path.join(REPO, 'lanceur.ps1'), 'utf8') });
  return found.filter((s) => s.file !== 'packages/core/src/coexistence.ts');
}

/** Lignes de code (hors commentaires) où l'appel figure, définition de la fonction exclue. */
function callers(call: string): string[] {
  const name = call.split('.').at(-1)!;
  // Identifiant du code (hideWindow) : à la casse près. Commande (« reg add », powercfg) : sans casse.
  const command = /^[a-z]+$/.test(call) || /[\s/']/.test(call);
  const escaped = call.replace(/[.*+?^${}()|[\]\\]/g, '\\$&').replace(/ /g, '\\s+');
  const pattern = new RegExp(`${/^\w/.test(call) ? '\\b' : ''}${escaped}${/\w$/.test(call) ? '\\b' : ''}`, command ? 'i' : '');
  return sources().flatMap((s) =>
    s.text.split('\n').flatMap((line, i) => {
      const code = line.trim();
      if (code.startsWith('//') || code.startsWith('*') || code.startsWith(';') || code.startsWith('#') || code.startsWith('rem ')) return [];
      if (!pattern.test(line) || new RegExp(`function\\s+${name}\\b`).test(line) || /^\s*import\b/.test(line)) return [];
      return [`${s.file}:${i + 1}`];
    }),
  );
}

test('autres menus ouverts : reconnus par leur exécutable, sans casse ; le lecteur des PuP-Packs seul ne compte pas', () => {
  assert.deepEqual(runningFrontends(['explorer.exe', 'pinupmenu.EXE']).map((f) => f.id), ['popper']);
  assert.deepEqual(runningFrontends(['PinUpDisplay.exe', 'PinballX.exe', 'PinballY.exe']).map((f) => f.id), ['popper', 'pinballx', 'pinbally']);
  assert.deepEqual(runningFrontends(['PinUpPlayer.exe', 'VPinballX64.exe']), []);
  assert.equal(frontendNames(runningFrontends(['PinUpMenu.exe'])), 'PinUP Popper');
  assert.equal(frontendNames(runningFrontends(['PinUpMenu.exe', 'PinballX.exe', 'PinballY.exe'])), 'PinUP Popper, PinballX et PinballY');
});

test('autres menus simulés pour les essais sans opérateur : fermés quand leur fichier témoin disparaît', () => {
  assert.equal(simulatedProcessNames({}, () => true), undefined);
  assert.deepEqual(simulatedProcessNames({ CYBERPINBALL_AUTRES_MENUS: 'PinUpMenu.exe, PinballX.exe' }, () => true), ['PinUpMenu.exe', 'PinballX.exe']);
  const env = { CYBERPINBALL_AUTRES_MENUS: 'PinUpMenu.exe', CYBERPINBALL_AUTRES_MENUS_FICHIER: 'tmp\\popper-ouvert' };
  assert.deepEqual(simulatedProcessNames(env, () => true), ['PinUpMenu.exe']);
  assert.deepEqual(simulatedProcessNames(env, () => false), []);
  assert.equal(simulatedInstalledFrontends({}), undefined);
  assert.deepEqual(simulatedInstalledFrontends({ CYBERPINBALL_AUTRES_MENUS_INSTALLES: 'PinUpMenu.exe' })?.map((f) => f.id), ['popper']);
});

test('autres menus installés : par leur exécutable à l’emplacement par défaut', () => {
  const at = (...files: string[]) => (file: string) => files.includes(file);
  assert.deepEqual(installedFrontends(['Q:'], at('Q:\\vPinball\\PinUPSystem\\PinUpMenu.exe')).map((f) => f.id), ['popper']);
  assert.deepEqual(installedFrontends(['Q:'], at('Q:\\PinballY\\PinballY.exe')).map((f) => f.id), ['pinbally']);
  assert.deepEqual(installedFrontends(['Q:'], at()), []);
});

test('barres des tâches : seules celles que Cyber Pinball a masquées reviennent', () => {
  const bar = (handle: number, visible: boolean, className = 'Shell_SecondaryTrayWnd'): TaskbarState => ({ handle: BigInt(handle), className, visible });
  // Avant la partie : la principale visible, une secondaire masquée par PinUP Popper.
  const marker = parseTaskbarMarker(taskbarMarkerText([{ handle: 101n, className: 'Shell_TrayWnd' }]));
  assert.deepEqual(marker, [{ handle: 101n, className: 'Shell_TrayWnd' }]);
  const now = [bar(101, false, 'Shell_TrayWnd'), bar(202, false)];
  assert.deepEqual(taskbarsToRestore(marker, now).map((t) => t.handle), [101n], 'la barre masquée par l’autre menu reste masquée');
  // Explorateur relancé pendant la partie : nouvelles barres, déjà visibles, rien à faire.
  assert.deepEqual(taskbarsToRestore(marker, [bar(303, true, 'Shell_TrayWnd')]), []);
  // Barre déjà réaffichée : rien à faire.
  assert.deepEqual(taskbarsToRestore(marker, [bar(101, true, 'Shell_TrayWnd')]), []);
  // Témoin d'une version précédente (classes seulement) : désignées par classe.
  const legacy = parseTaskbarMarker('Shell_TrayWnd\nShell_SecondaryTrayWnd');
  assert.deepEqual(legacy, [{ className: 'Shell_TrayWnd' }, { className: 'Shell_SecondaryTrayWnd' }]);
  assert.equal(taskbarsToRestore(legacy, now).length, 2);
});

test('le gardien des écrans ne réaffiche une barre des tâches que par taskbarsToRestore', () => {
  const guard = fs.readFileSync(path.join(REPO, 'app', 'src', 'screen-guard.ts'), 'utf8');
  const restore = guard.slice(guard.indexOf('export function restoreTaskbars'));
  assert.equal(guard.match(/showWindowInactive\(/g)?.length, 1, 'un seul appel à showWindowInactive');
  assert.ok(restore.indexOf('taskbarsToRestore(') >= 0 && restore.indexOf('taskbarsToRestore(') < restore.indexOf('showWindowInactive('));
  assert.doesNotMatch(guard, /restoreTaskbars\(\)\s*;?\s*\n[^\n]*existsSync\(taskbarMarker/, 'au démarrage, le témoin dit quelles barres remettre');
  assert.match(guard, /restoreTaskbars\(parseTaskbarMarker\(/);
});

test('réglages de Windows : chaque modification est déclarée dans WINDOWS_CHANGES, et faite là seulement', () => {
  for (const change of WINDOWS_CHANGES) {
    const where = callers(change.call);
    const files = [...new Set(where.map((w) => w.split(':')[0]!))];
    assert.deepEqual(files.filter((f) => !change.files.includes(f)), [], `${change.call} hors de ${change.files.join(', ')} : ${where.join(', ')}`);
    for (const file of change.files) assert.ok(files.includes(file), `${change.call} déclaré dans ${file} mais absent : mettre WINDOWS_CHANGES à jour`);
  }
});

test('réglages de Windows : aucun appel interdit (registre hors installeur, son par défaut, démarrage de session, paramètres système)', () => {
  for (const call of FORBIDDEN_WINDOWS_CALLS) assert.deepEqual(callers(call), [], `${call} : à déclarer dans WINDOWS_CHANGES et dans « Cohabitation avec un autre menu » du manuel`);
});

test('retournement de l’écran : seulement depuis l’assistant, après l’avertissement si un autre menu est installé', () => {
  const wizard = fs.readFileSync(path.join(REPO, 'app', 'src', 'wizard.ts'), 'utf8');
  const confirm = wizard.slice(wizard.indexOf('function confirmEdge'), wizard.indexOf('function flipPlayfield'));
  assert.ok(confirm.indexOf('otherFrontends.length') >= 0 && confirm.indexOf('otherFrontends.length') < confirm.indexOf('flipPlayfield('), 'l’avertissement passe avant le retournement');
  assert.match(wizard, /otherFrontends = otherFrontendsOnThisPc\(\)/);
});

test('autre menu ouvert : vérifié avant de couvrir les écrans et avant chaque partie', () => {
  const main = fs.readFileSync(path.join(REPO, 'app', 'src', 'main.ts'), 'utf8');
  const ready = main.slice(main.indexOf('app.whenReady()'));
  assert.ok(ready.indexOf('otherFrontendsGate(') >= 0 && ready.indexOf('otherFrontendsGate(') < ready.indexOf('guardScreens('), 'otherFrontendsGate() avant guardScreens()');
  const frontend = fs.readFileSync(path.join(REPO, 'app', 'src', 'frontend.ts'), 'utf8');
  const play = frontend.slice(frontend.indexOf('async function play('));
  assert.ok(play.indexOf('unacceptedFrontends(') >= 0 && play.indexOf('unacceptedFrontends(') < play.indexOf('launchVpx('), 'vérifié avant launchVpx');
});

test('VPX : réglages dans la racine, passés par -Ini, jamais dans %APPDATA%\\VPinballX', () => {
  const appData = path.join('C:', 'profil', 'AppData', 'Roaming');
  const loc = resolveLocations({ APPDATA: appData, CYBERPINBALL_ROOT: 'D:\\CyberPinball' });
  assert.ok(loc.vpxIni.toLowerCase().startsWith('d:\\cyberpinball\\'), loc.vpxIni);
  assert.ok(loc.dataDir.toLowerCase().startsWith('d:\\cyberpinball\\'), loc.dataDir);
  for (const p of [loc.vpxIni, loc.dataDir]) assert.ok(!p.toLowerCase().includes('vpinballx\\'), p);
  const launcher = fs.readFileSync(path.join(REPO, 'app', 'src', 'launcher.ts'), 'utf8');
  assert.match(launcher, /\['-Ini', opts\.ini/);
});
