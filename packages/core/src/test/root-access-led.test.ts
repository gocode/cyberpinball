// Root Access : les LED de la borne jouent le jeu (un effet par événement, une ambiance par étage), et le
// contrôleur des animations leur laisse la main tant que le jeu est ouvert. Pilote simulé : aucun port,
// aucun réseau, rien à l'écran.

import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { ROOT_ACCESS_SIGNALS, RootAccessLeds, parseRootAccessSignal, type CabinetLeds, type LedGrid, type RootAccessStatus } from '../index';
import { REPO_ROOT } from './i18n-scan';

const grid: LedGrid = { width: 1, height: 30, arrangement: 'TopDownLeftRight' };
const sum = (rgb: Uint8Array) => rgb.reduce((n, v) => n + v, 0);
const channels = (rgb: Uint8Array): [number, number, number] => {
  const s: [number, number, number] = [0, 0, 0];
  for (let i = 0; i < rgb.length; i++) s[i % 3]! += rgb[i]!;
  return s;
};
const jeu = (floor: number): RootAccessStatus => ({ screen: 'jeu', floor, floors: 6, name: 'x', score: 0 });

test('signaux du jeu : seuls les noms connus passent, l\'argument est borné', () => {
  assert.deepEqual(parseRootAccessSignal('flip', 'left'), { signal: 'flip', arg: 'left' });
  assert.deepEqual(parseRootAccessSignal('lance', 7), { signal: 'lance', arg: 1 });
  assert.deepEqual(parseRootAccessSignal('lance', -3), { signal: 'lance', arg: 0 });
  assert.deepEqual(parseRootAccessSignal('perdue'), { signal: 'perdue' });
  assert.equal(parseRootAccessSignal('inconnu'), undefined);
  assert.equal(parseRootAccessSignal(undefined), undefined);
  assert.equal((parseRootAccessSignal('flip', 'x'.repeat(100)) as { arg: string }).arg.length, 8);
});

test('LED du jeu : chaque signal allume quelque chose par-dessus l\'ambiance, jamais au-delà de la luminosité', () => {
  for (const name of ROOT_ACCESS_SIGNALS) {
    const seul = new RootAccessLeds(0);
    const avec = new RootAccessLeds(0);
    seul.setStatus(jeu(1), 0);
    avec.setStatus(jeu(1), 0);
    avec.signal(name, 1000, name === 'flip' ? 'left' : 1);
    // Un effet ponctuel (éclair, stroboscope) n'est pas allumé à chaque instant : on regarde la fenêtre
    // de ses 100 premières ms (le plus court, l'éclair d'un flip, dure 150 ms).
    let vu = false;
    let detail = '';
    for (const d of [10, 20, 30, 40, 50, 60, 70, 80, 90, 100]) {
      const a = seul.render(grid, 1000 + d);
      const b = avec.render(grid, 1000 + d);
      assert.equal(b.length, grid.width * grid.height * 3, name);
      assert.ok(Math.max(...b) <= 255);
      detail = `${sum(a)} -> ${sum(b)}`;
      if (sum(b) > sum(a)) vu = true;
    }
    assert.ok(vu, `${name} : l'effet se voit (${detail})`);
  }
});

test('LED du jeu : une rafale de flips ne sature pas les LED (un éclair toutes les 90 ms au plus)', () => {
  const un = new RootAccessLeds(0);
  const rafale = new RootAccessLeds(0);
  un.setStatus(jeu(1), 0);
  rafale.setStatus(jeu(1), 0);
  un.signal('flip', 1000, 'left');
  for (let i = 0; i < 5; i++) rafale.signal('flip', 1000 + i * 10, 'left');
  assert.deepEqual(rafale.render(grid, 1060), un.render(grid, 1060));
});

test('LED du jeu : l\'ambiance suit l\'étage, la défaite est rouge, la victoire éclate', () => {
  const rouge = (s: RootAccessStatus) => {
    const l = new RootAccessLeds(0);
    l.setStatus(jeu(2), 0);
    l.setStatus(s, 100);
    const [r, g] = channels(l.render(grid, 6000));
    return { r, g };
  };
  const vert = rouge(jeu(2));
  assert.ok(vert.g > vert.r, `étage 2 : vert (${vert.r} / ${vert.g})`);
  const mort = rouge({ ...jeu(2), screen: 'dead' });
  assert.ok(mort.r > mort.g, `partie perdue : rouge (${mort.r} / ${mort.g})`);
  const gagne = new RootAccessLeds(0);
  gagne.setStatus(jeu(6), 0);
  const avant = sum(gagne.render(grid, 1000));
  gagne.setStatus({ ...jeu(6), screen: 'won' }, 1000);
  assert.ok(sum(gagne.render(grid, 1300)) > avant, 'victoire : les LED s\'embrasent');
});

// --- Contrôleur de l'application : le jeu prend la main -------------------------------------------------

interface Service {
  configure(l: CabinetLeds | undefined): void;
  stop(): Promise<void>;
  step(): Promise<void>;
  status(): { state: string };
  simulation: { device: { shownOutput(output: number, count: number): Uint8Array } } | undefined;
}
interface Controller {
  update(c: { phase: string }): void;
  dispose(): void;
}
/* eslint-disable @typescript-eslint/no-require-imports */
const driver = require(path.join(REPO_ROOT, 'app', 'dist', 'led-live.js')) as { createLedService(o: Record<string, unknown>): Service };
const animations = require(path.join(REPO_ROOT, 'app', 'dist', 'led-animations.js')) as { createLedAnimations(o: Record<string, unknown>): Controller };
/* eslint-enable @typescript-eslint/no-require-imports */
const settle = async () => {
  for (let i = 0; i < 12; i++) await new Promise<void>((resolve) => setImmediate(resolve));
};

test('animations LED : tant que le jeu est ouvert, ses images prennent la place de l\'ambiance, même hors d\'un menu', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-raled-'));
  try {
    const leds: CabinetLeds = { controller: 'TeensyStripController', port: 'COM7', strips: [{ name: 'Bande', output: 1, width: 1, height: 20, arrangement: 'TopDownLeftRight', colorOrder: 'GRB', brightness: 100, dofOutput: 1 }] };
    const service = driver.createLedService({ simulated: true, manual: true, resumeDelayMs: 10 });
    let beat: (() => void) | undefined;
    let open = true;
    let asked = 0;
    const controller = animations.createLedAnimations({
      service,
      dataDir: dir,
      leds: () => leds,
      idleFor: () => 10 * 3_600_000, // inactif depuis dix heures : l'ambiance serait éteinte
      seed: 7,
      setInterval: (run: () => void) => {
        beat = run;
        return 1;
      },
      clearInterval: () => {
        beat = undefined;
      },
      takeover: () => {
        if (!open) return undefined;
        return (g: LedGrid) => {
          asked++;
          return new Uint8Array(g.width * g.height * 3).fill(200); // blanc plein
        };
      },
    });
    // Un écran sans ambiance (la partie d'une table, par exemple) : le jeu garde pourtant les LED.
    controller.update({ phase: 'playing' });
    await settle();
    assert.equal(service.status().state, 'running', 'le jeu ouvert ouvre la liaison');
    beat?.();
    await service.step();
    assert.ok(asked > 0, 'les bandes demandent les images du jeu');
    const montre = service.simulation!.device.shownOutput(0, 20);
    assert.ok(sum(montre) > 0, 'les LED s\'allument');
    // Le jeu fermé : plus d'images du jeu.
    open = false;
    const avant = asked;
    controller.update({ phase: 'playing' });
    await settle();
    beat?.();
    assert.equal(asked, avant, 'jeu fermé : plus rien de lui');
    controller.dispose();
    await service.stop();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('branchement des LED : la page signale, la borne relaie, le contrôleur donne la main', () => {
  const read = (...p: string[]) => fs.readFileSync(path.join(REPO_ROOT, ...p), 'utf8');
  assert.match(read('app', 'renderer', 'root-access', 'fx.js'), /window\.borne\.signal\(nom, arg\)/);
  assert.match(read('app', 'renderer', 'root-access', 'fx.js'), /SFX\.flip\(fl\.side\)/);
  assert.match(read('app', 'src', 'root-access-preload.ts'), /'root-access:signal'/);
  assert.match(read('app', 'src', 'root-access.ts'), /ipcMain\.on\('root-access:signal'[\s\S]*?event\.sender !== win\.webContents/);
  const front = read('app', 'src', 'frontend.ts');
  assert.match(front, /signal: \(signal, arg\) => rootAccessLeds\.signal\(/);
  assert.match(front, /takeover: \(\) => \{[\s\S]{0,200}rootAccess\.isOpen\(\)/);
});
