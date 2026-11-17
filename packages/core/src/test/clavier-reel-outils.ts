// Outils communs des tests du relevé des boutons par le vrai chemin d'une touche du clavier
// (clavier-reel.test.ts, clavier-premier-ecran-*.test.ts). Séparés le 17/11/2026 pour que les cas du
// premier écran, une dizaine de lancements d'Electron, se répartissent sur plusieurs fichiers que
// node --test fait tourner en parallèle, au lieu d'un seul test de six minutes.
//
// Relevé des boutons par le vrai chemin d'une touche du clavier : l'assistant, rendu hors
// écran sur un bureau Windows caché, reçoit chaque touche par webContents.sendInputEvent
// (autopilote « Clavier:KeyA »), comme du clavier du PC : before-input-event, Chromium,
// la page (preload.ts). Octobre 2026 : l'assistant annulait l'appui, Chromium jetait alors
// le relâchement, et le relevé, qui compte une touche quand on la relâche, ne voyait plus
// aucune touche du clavier ; l'autopilote, qui appelait le traitement des touches sans
// passer par Chromium, ne le voyait pas. Les boutons du joystick passent par un joystick
// virtuel de la bibliothèque SDL de VPX (autopilote « Joy<n> »), comme un Pinscape.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { toPhysicalScreen } from '../fingerprint';
import { resolveLocations } from '../locations';
import type { Cabinet, CabinetButtons } from '../model';
import { saveCabinet } from '../store';
import { runElectron } from './electron-run';
import { devPcDisplays, emptyCabinet } from './fixtures';

export const REPO = path.join(__dirname, '..', '..', '..', '..');
export const SCREENS = path.join(REPO, 'packages', 'core', 'ecrans-simules', 'pc-dev.json');

/** Bibliothèque SDL de VPX : CYBERPINBALL_SDL, sinon celle du VPX installé à la racine de Cyber Pinball. */
export function sdlLibrary(): string | undefined {
  if (process.env.CYBERPINBALL_SDL) return process.env.CYBERPINBALL_SDL;
  const root = resolveLocations(process.env).root;
  if (!root) return undefined;
  const dir = path.join(root, 'emulators', 'vpx', 'current');
  return ['SDL364.dll', 'SDL3.dll'].map((name) => path.join(dir, name)).find((file) => fs.existsSync(file));
}

function electronPath(): string | undefined {
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    return require(require.resolve('electron', { paths: [REPO] })) as string;
  } catch {
    return undefined;
  }
}

export const electron = process.platform === 'win32' ? electronPath() : undefined;
export const skip = electron ? false : 'Electron sous Windows requis';

/** Borne des écrans simulés (pc-dev.json), avec ces boutons du jeu ; son VPinballX.ini dans le bac à sable. */
export function cabinetIn(home: string, buttons?: CabinetButtons): void {
  const cabinet: Cabinet = emptyCabinet();
  cabinet.screens = devPcDisplays().map(toPhysicalScreen);
  cabinet.roles = { playfield: cabinet.screens[3]!.fingerprint };
  cabinet.vpx = { iniPath: path.join(home, 'sandbox', 'VPinballX.ini') };
  if (buttons) cabinet.buttons = buttons;
  fs.mkdirSync(path.join(home, 'sandbox'), { recursive: true });
  saveCabinet(home, cabinet);
}

/** L'assistant sans opérateur dans un bac à sable : sa sortie (traces de l'autopilote comprises). */
export function runWizard(home: string, codes: string[], args: string[], extra: NodeJS.ProcessEnv = {}): string {
  const dir = path.dirname(home);
  const audio = path.join(dir, 'sans-son.json');
  fs.writeFileSync(audio, '[]');
  const env: NodeJS.ProcessEnv = {
    ...process.env,
    CYBERPINBALL_HOME: home,
    CYBERPINBALL_ROOT: path.join(dir, 'root'),
    CYBERPINBALL_DISPLAYS: SCREENS,
    CYBERPINBALL_AUDIO_OUTPUTS: audio,
    CYBERPINBALL_LANGUE: 'fr',
    CYBERPINBALL_AUTOPILOT: codes.join(','),
    ...extra,
  };
  delete env.CYBERPINBALL_A_L_ECRAN;
  delete env.CYBERPINBALL_CAPTURE;
  const run = runElectron(electron!, ['app', '--assistant', ...args, `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, cwd: REPO, env, timeout: 170_000 });
  const output = `${run.stdout}\n${run.stderr}`;
  assert.equal(run.status, 0, output);
  assert.doesNotMatch(output, /Autopilote : .* n’est pas arrivée|sans joystick lisible/, output);
  return output;
}

export const keyboard = (...codes: string[]) => codes.map((c) => `Clavier:${c}`);
export const repeat = (code: string, n: number) => Array.from({ length: n }, () => code);

/** Ligne de trace d'un relevé (handleButtonKey, sans opérateur). */
export const recorded = (kind: string, id: string, code: string, outcome = 'gardé') => `Assistant : relevé ${kind}, ${id} sur ${code} : ${outcome}`;

/** Un relevé au clavier de chaque bouton du jeu, tous différents et acceptés par VPX. */
export const GAME_BY_KEYBOARD: Record<string, string> = {
  leftFlipper: 'KeyA',
  rightFlipper: 'KeyS',
  start: 'Digit2',
  exit: 'KeyQ',
  credit: 'Digit3',
  plunger: 'KeyW',
  leftMagna: 'KeyR',
  rightMagna: 'KeyT',
  extraBall: 'KeyD',
  pause: 'KeyF',
  tilt: 'KeyG',
  slamTilt: 'KeyH',
  coinDoor: 'KeyN',
  serviceDown: 'KeyY',
  serviceUp: 'KeyV',
  nudgeLeft: 'KeyZ',
  nudgeRight: 'KeyX',
  nudgeCenter: 'Space',
  volumeDown: 'Minus',
  volumeUp: 'Equal',
  volumeMute: 'KeyM',
};

// Premier écran d'une borne neuve (16/11/2026) : l'assistant ouvrait directement le relevé, qui
// aurait pris Entrée pour un bouton ; un testeur dont les touches étaient déjà bonnes ne trouvait pas
// comment continuer. Invariant : ce premier écran se quitte toujours, sans relever ni attendre VPX.
// Les flippers et les flèches ne font que choisir (16/11/2026 : une flèche gardait les touches et
// passait aux boutons de l'interface, sans que le joueur l'ait voulu).
// Maj gauche et droite ne passent pas par webContents.sendInputEvent (touches de modification) : appui direct de l'autopilote.
// Le premier écran porte sur les boutons de l'interface. Garder : ceux du jeu proposés dessus,
// à valider ; modifier : le relevé de l'interface ; Retour arrière au premier bouton : l'étape d'avant.

/** Un cas du premier écran : les touches pressées, puis l'étape où « Quitter sans enregistrer ? » doit arriver. */
export type FirstScreenCase = [keys: string[], phase: string, why: string];

/** Un test par cas : chacun lance son propre assistant, dans son bac à sable. */
export function firstScreenTests(cases: FirstScreenCase[]): void {
  for (const [keys, phase, why] of cases) {
    test(`premier écran d’une borne neuve : ${why} (${keys.join(', ')} → ${phase}), rien n’est relevé`, { skip, timeout: 200_000 }, () => {
      const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-premier-ecran-'));
      try {
        const home = path.join(dir, 'home');
        const output = runWizard(home, [...keys, 'CtrlQ'], []);
        assert.doesNotMatch(output, /Assistant : relevé game/, `${keys} : rien n’est relevé\n${output}`);
        // Garder : boutons de l'interface ; modifier : relevé ; flippers et flèches seuls : toujours le premier écran.
        assert.ok(output.includes(`Assistant : « Quitter sans enregistrer ? » (${phase})`), `${keys} : ${phase} attendu\n${output}`);
      } finally {
        fs.rmSync(dir, { recursive: true, force: true });
      }
    });
  }
}
