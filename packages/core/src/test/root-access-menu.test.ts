/**
 * Root Access dans le vrai front-end (Electron hors écran, bac à sable) : la combinaison de flips sur la
 * roue ouvre le jeu caché sur le plateau, une suite incomplète ne l'ouvre pas, et la page du jeu se charge.
 */
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { cabinetIn, electron, GAME_BY_KEYBOARD, SCREENS } from './clavier-reel-outils';
import { runElectron } from './electron-run';
import { REPO_ROOT } from './i18n-scan';
import { removeTempDir } from './temp-dir';

const left = GAME_BY_KEYBOARD.leftFlipper!;
const right = GAME_BY_KEYBOARD.rightFlipper!;
// Une fois à gauche, une fois à droite, deux fois, puis trois fois de chaque côté.
const COMBO = [left, right, left, left, right, right, left, left, left, right, right, right];
/** Nom de capture de l'autopilote (library.ts) pour une étape. */
const shotName = (i: number, step: string) => `${String(i).padStart(2, '0')}-${step.replace(/[^\w-]+/g, '_').slice(0, 40)}`;

test('Root Access : la combinaison de flips sur la roue ouvre le jeu caché sur le plateau', { timeout: 90_000 }, () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-root-access-'));
  try {
    const home = path.join(dir, 'home'), root = path.join(dir, 'root');
    cabinetIn(home, GAME_BY_KEYBOARD);
    // Une table fictive (jamais lancée), pour que la roue s'affiche.
    fs.mkdirSync(path.join(root, 'tables', 'Ocean'), { recursive: true });
    fs.writeFileSync(path.join(root, 'tables', 'Ocean', 'Ocean.fpt'), 'fictional, never launched');
    const fp = path.join(dir, 'fake-fp');
    fs.mkdirSync(fp);
    fs.writeFileSync(path.join(fp, 'Future Pinball.exe'), 'not a Windows executable');
    const audio = path.join(dir, 'audio.json'); fs.writeFileSync(audio, '[]');
    const capture = path.join(dir, 'captures');
    const incomplete = `keys:${COMBO.slice(0, 8).join('|')}`;
    const combo = `keys:${COMBO.join('|')}`;
    // Exit ferme « VPX n'est pas installé » (bac à sable sans VPX) ; puis la suite incomplète, une pause
    // plus longue que COMBO_GAP_MS (la combinaison repart de zéro), et la combinaison complète.
    const steps = [GAME_BY_KEYBOARD.exit!, incomplete, 'wait:1700', combo, 'wait:1500'];
    const env: NodeJS.ProcessEnv = { ...process.env, CYBERPINBALL_HOME: home, CYBERPINBALL_ROOT: root, CYBERPINBALL_DISPLAYS: SCREENS, CYBERPINBALL_AUDIO_OUTPUTS: audio, CYBERPINBALL_LANGUE: 'fr', CYBERPINBALL_RESEAU: 'off', CYBERPINBALL_HORS_ECRAN: '1', CYBERPINBALL_FUTURE_PINBALL_SIMULE: fp, CYBERPINBALL_CAPTURE: capture, CYBERPINBALL_AUTOPILOT: steps.join(',') };
    delete env.ELECTRON_RUN_AS_NODE; delete env.CYBERPINBALL_A_L_ECRAN;
    const run = runElectron(electron!, ['app', `--user-data-dir=${path.join(dir, 'chromium')}`], { dir, env, cwd: REPO_ROOT, timeout: 80_000 });
    const output = run.stdout + run.stderr;
    assert.equal(run.status, 0, output);
    assert.doesNotMatch(output, /ReferenceError|TypeError|écriture refusée hors du bac|Root Access : fenêtre du plateau/, output);
    const opened = output.match(/Root Access : ouvert sur le plateau \((\d+)×(\d+), rotation (-?\d+)°\)/g) ?? [];
    assert.equal(opened.length, 1, `une seule ouverture, à la combinaison complète :\n${output}`);
    const states = fs.readFileSync(path.join(capture, 'son.txt'), 'utf8').trim().split('\n').map((line) => ({ name: line.slice(0, line.indexOf(' : ')), view: JSON.parse(line.slice(line.indexOf(' : ') + 3)) }));
    const phase = (name: string) => states.find((s) => s.name === name)?.view.ecrans.playfield.phase;
    assert.equal(phase(shotName(1, steps[0]!)), 'menu', 'la roue est là avant la combinaison');
    assert.equal(phase(shotName(4, steps[3]!)), 'menu', 'le jeu se pose sur la roue sans changer de phase');
    const game = (i: number) => path.join(capture, 'ecrans', `${shotName(i, steps[i - 1]!)}-root-access.png`);
    assert.ok(!fs.existsSync(game(2)) && !fs.existsSync(game(3)), 'la suite incomplète n’ouvre rien');
    assert.ok(fs.existsSync(game(4)), 'la combinaison complète ouvre le jeu');
    // La page du jeu dessinée (écran titre) : une image vide de PNG pèse quelques centaines d'octets.
    assert.ok(fs.statSync(game(5)).size > 8_000, `écran titre dessiné : ${fs.statSync(game(5)).size} octets`);
    assert.match(output, /Root Access : fermé\./, 'le jeu se ferme avec Cyber Pinball');
  } finally { removeTempDir(dir); }
});
