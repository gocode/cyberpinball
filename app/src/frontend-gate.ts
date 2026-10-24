// Autre menu de borne déjà ouvert (PinUP Popper, PinballX, PinballY) au démarrage : les
// deux se disputeraient les écrans, le DMD et les boutons de la borne. Avant de couvrir
// le moindre écran, Cyber Pinball le dit sur l'écran principal et attend : il démarre
// dès que l'autre menu est fermé, ou tout de suite si l'on choisit de continuer quand même.
// Rien n'est fermé ni arrêté chez l'autre menu.

import * as fs from 'node:fs';
import * as path from 'node:path';
import { BrowserWindow, type Input } from 'electron';
import { frontendNames, installedFrontends, t, loadCabinet, navigationKeys, runningFrontends, simulatedInstalledFrontends, simulatedProcessNames, type OtherFrontend } from '@cyberpinball/core';
import { runningProcessNames } from '@cyberpinball/win-displays';
import { coverDisplay } from './cover-display';
import { LayoutReport } from './layout-check';
import { createWindow, isShown, OFFSCREEN, primaryRect } from './offscreen';
import { onJoystickInput } from './joystick-input';
import { locations } from './paths';

const CHECK_MS = 1000;

/**
 * Menus que l'utilisateur a choisi de laisser ouverts (« Continuer quand même ») : on ne le
 * redemande pas, ni après une relance menu ↔ assistant (relaunchCovered transmet process.env).
 */
const ACCEPTED_ENV = 'CYBERPINBALL_AUTRES_MENUS_ACCEPTES';
const accepted = new Set<string>((process.env[ACCEPTED_ENV] ?? '').split(',').filter(Boolean));

/**
 * Menus de borne ouverts en ce moment. Pendant un essai sans opérateur, seulement ceux de
 * CYBERPINBALL_AUTRES_MENUS : le résultat ne dépend pas de ce qui tourne sur le poste.
 */
export function otherFrontendsRunning(): OtherFrontend[] {
  return runningFrontends(simulatedProcessNames(process.env, fs.existsSync) ?? (OFFSCREEN ? [] : runningProcessNames()));
}

/**
 * Menus de borne installés ou ouverts sur ce PC : ceux qu'un réglage commun de Windows
 * (l'orientation d'un écran) toucherait aussi. Pendant un essai sans opérateur, seulement
 * ceux de CYBERPINBALL_AUTRES_MENUS et CYBERPINBALL_AUTRES_MENUS_INSTALLES.
 */
export function otherFrontendsOnThisPc(): OtherFrontend[] {
  const installed = simulatedInstalledFrontends(process.env) ?? (OFFSCREEN ? [] : installedFrontends());
  const found = [...installed, ...otherFrontendsRunning()];
  return found.filter((f, i) => found.findIndex((g) => g.id === f.id) === i);
}

/** Menus ouverts que l'utilisateur n'a pas encore choisi de laisser ouverts. */
export function unacceptedFrontends(): OtherFrontend[] {
  return otherFrontendsRunning().filter((f) => !accepted.has(f.id));
}

/** « Continuer quand même » ou « Jouer quand même » : ces menus ne sont plus signalés. */
export function acceptFrontends(frontends: OtherFrontend[]): void {
  for (const f of frontends) accepted.add(f.id);
  process.env[ACCEPTED_ENV] = [...accepted].join(',');
}

export interface Gate {
  /** false : quitter Cyber Pinball. */
  proceed: boolean;
  /** Ferme l'écran d'attente, une fois les fenêtres de Cyber Pinball ouvertes par-dessus. */
  close(): void;
}

/**
 * Attend qu'aucun autre menu de borne ne soit ouvert, ou que l'utilisateur choisisse de
 * continuer quand même (Start) ou de quitter (Exit). Rien d'ouvert : réponse immédiate.
 */
export function otherFrontendsGate(): Promise<Gate> {
  const open = unacceptedFrontends();
  if (!open.length) return Promise.resolve({ proceed: true, close: () => undefined });

  const keys = navigationKeys(loadCabinet(locations().dataDir)?.buttons);
  const win = createWindow({
    frame: false,
    show: false,
    skipTaskbar: true,
    backgroundColor: '#030807',
    webPreferences: { preload: path.join(__dirname, 'preload.js'), contextIsolation: true, sandbox: true },
  });
  coverDisplay(win, primaryRect());
  console.log(`${frontendNames(open)} ouvert : Cyber Pinball attend qu'il soit fermé (Start : continuer quand même · Exit : quitter).`);

  return new Promise<Gate>((resolve) => {
    let timer: NodeJS.Timeout | undefined;
    const done = (proceed: boolean) => {
      if (timer === undefined) return;
      clearInterval(timer);
      timer = undefined;
      if (proceed) acceptFrontends(otherFrontendsRunning());
      resolve({ proceed, close: () => closeWhenCovered(win) });
    };
    const show = (frontends: OtherFrontend[]) => win.webContents.send('state', gateView(frontends));
    win.webContents.ipc.on('ready', () => show(open));
    win.webContents.ipc.on('action', (_event, action: { type?: string; action?: string }) => {
      if (action?.type === 'buttons') done(action.action === 'continue');
    });
    const answer = (input: Input): boolean => {
      if (input.type !== 'keyDown') return false;
      if (keys.confirm.includes(input.code)) done(true);
      else if (keys.exit.includes(input.code) || (input.control && input.code === 'KeyQ')) done(false);
      else return false;
      return true;
    };
    win.webContents.on('before-input-event', (event, input: Input) => {
      if (answer(input)) event.preventDefault();
    });
    onJoystickInput(win, answer);
    win.on('closed', () => done(false));
    timer = setInterval(() => {
      const still = unacceptedFrontends();
      if (!still.length) {
        console.log(`${frontendNames(open)} fermé : Cyber Pinball démarre.`);
        done(true);
      } else show(still);
    }, CHECK_MS);
    void win.loadFile(path.join(__dirname, '..', 'renderer', 'screen.html'));
    win.once('ready-to-show', () => {
      win.show();
      win.focus();
      void capture(win);
    });
  });
}

/** État de l'écran d'attente, rendu par screen.html comme une étape de l'assistant. */
function gateView(open: OtherFrontend[]) {
  const names = frontendNames(open);
  const one = open.length === 1;
  return {
    phase: 'gate',
    highlight: true,
    color: '#36c9b4',
    rotation: 0,
    prompt: one ? t('{names} est ouvert', { names }) : t('{names} sont ouverts', { names }),
    name: '',
    details: one
      ? t('Les deux menus se disputeraient les écrans, l’afficheur DMD et les boutons de la borne. Fermez {names} depuis son menu (Quitter) : Cyber Pinball démarre tout seul dès qu’il est fermé.', { names })
      : t('Les menus se disputeraient les écrans, l’afficheur DMD et les boutons de la borne. Fermez {names} depuis leur menu (Quitter) : Cyber Pinball démarre tout seul dès qu’ils sont fermés.', { names }),
    step: t('Rien n’est fermé ni modifié chez {names}.', { names }),
    hint: t('Start : continuer quand même · Exit : quitter Cyber Pinball'),
    actions: [
      { id: 'continue', label: t('Continuer quand même'), selected: false },
      { id: 'quit', label: t('Quitter Cyber Pinball'), selected: false },
    ],
  };
}

/**
 * Essais sans opérateur (CYBERPINBALL_CAPTURE = dossier) : capture et garde-fou de mise en
 * page dans <dossier>utre-menu, à part de ceux du menu ou de l'assistant qui suit.
 */
async function capture(win: BrowserWindow): Promise<void> {
  const base = process.env.CYBERPINBALL_CAPTURE;
  if (!base) return;
  const dir = path.join(base, 'autre-menu');
  await new Promise((r) => setTimeout(r, 800));
  if (win.isDestroyed()) return;
  fs.mkdirSync(dir, { recursive: true });
  const layout = new LayoutReport(dir);
  await layout.check(win.webContents, 'autre-menu-ouvert');
  layout.save();
  fs.writeFileSync(path.join(dir, 'autre-menu-ouvert.png'), (await win.webContents.capturePage()).toPNG());
}

/**
 * L'écran d'attente reste jusqu'à ce qu'une fenêtre de Cyber Pinball soit affichée : sans
 * fenêtre entre les deux, l'application se fermerait (window-all-closed). 10 s au plus.
 */
function closeWhenCovered(win: BrowserWindow): void {
  const started = Date.now();
  const timer = setInterval(() => {
    const covered = BrowserWindow.getAllWindows().some((w) => w !== win && isShown(w));
    if (!covered && Date.now() - started < 10_000 && !win.isDestroyed()) return;
    clearInterval(timer);
    if (!win.isDestroyed()) win.destroy();
  }, 200);
}
