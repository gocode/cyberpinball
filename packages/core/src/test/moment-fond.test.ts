// Le fond du moment d'un badge ou d'un niveau (app/renderer/niveau.js) se répartit sur tout l'écran,
// centré sur la colonne du badge, en borne comme au bureau. Retour du 17/11/2026 : au bureau, les
// étoiles et les poussières se tassaient dans une bande à gauche, de la largeur de la colonne 9:16,
// parce que leurs positions étaient tirées entre 0 et 100 centièmes de colonne depuis le bord gauche.
// Ce test dessine chaque fond sur un canevas d'essai et relève où tombe ce qu'il trace.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { test } from 'node:test';
import { APP } from './menu-renderer';

interface Painter {
  W: number;
  H: number;
  S: number;
  span: number;
  rgb: number[];
  gain: number;
  rich: number;
  size(): void;
}
interface Fonds {
  SETUP: Record<string, (p: Painter) => unknown>;
  RENDER: Record<string, (p: Painter, t: number, data: unknown) => void>;
  painter(canvas: object): Painter;
}

/** Un contexte 2D d'essai : relève l'abscisse de chaque point, disque, trait et rectangle tracé. */
function recorder(xs: number[]) {
  const gradient = { addColorStop() {} };
  const fns: Record<string, (...a: number[]) => unknown> = {
    arc: (x) => void xs.push(x!),
    moveTo: (x) => void xs.push(x!),
    lineTo: (x) => void xs.push(x!),
    fillRect: (x, _y, w) => void xs.push(x! + w! / 2),
    createRadialGradient: () => gradient,
    createLinearGradient: () => gradient,
  };
  return new Proxy({} as Record<string, unknown>, {
    get: (target, key: string) => fns[key] ?? (key in target ? target[key] : () => gradient),
    set: (target, key: string, value) => ((target[key] = value), true),
  });
}

function loadFonds(): Fonds {
  const window: Record<string, unknown> = { devicePixelRatio: 1, matchMedia: () => ({ matches: false }) };
  window.window = window;
  vm.runInContext(fs.readFileSync(path.join(APP, 'renderer', 'niveau.js'), 'utf8'), vm.createContext(window), { filename: 'niveau.js' });
  return (window.CyberLevels as { fonds: Fonds }).fonds;
}

for (const [label, W, H] of [['bureau (paysage)', 1920, 1080], ['borne (portrait)', 1080, 1920]] as const) {
  test(`fond du moment, ${label} : chaque fond se répartit des deux côtés de la colonne, sur tout l'écran`, () => {
    const fonds = loadFonds();
    for (const bg of Object.keys(fonds.SETUP)) {
      const xs: number[] = [];
      const p = fonds.painter({ getContext: () => recorder(xs), offsetWidth: W, offsetHeight: H, width: 0, height: 0 });
      p.size();
      assert.ok(Math.abs(p.span * p.S - W) < 1, 'span : la largeur de l’écran dans l’unité de la colonne');
      const data = fonds.SETUP[bg]!(p);
      for (const t of [0.4, 0.9, 1.6, 2.5, 3.5, 4.5]) fonds.RENDER[bg]!(p, t, data);
      const shown = xs.filter((x) => Number.isFinite(x) && x >= 0 && x <= W);
      assert.ok(shown.length > 20, `${bg} : il trace quelque chose`);
      // Ce qui part du milieu même (le centre des rayons, de l'onde) n'est ni à gauche ni à droite.
      const left = shown.filter((x) => x < W / 2 - 1).length;
      const right = shown.filter((x) => x > W / 2 + 1).length;
      assert.ok(left / right > 0.6 && left / right < 1.65, `${bg} : autant à gauche (${left}) qu’à droite (${right}) du milieu`);
      const mean = shown.reduce((a, x) => a + x, 0) / shown.length;
      assert.ok(Math.abs(mean - W / 2) < W * 0.1, `${bg} : centré sur la colonne (moyenne ${Math.round(mean)} pour ${W / 2})`);
      // Au bureau, les poussières et les étoiles vont au-delà de la colonne, des deux côtés.
      const column = 100 * p.S;
      if (W > column + 1 && bg !== 'swarm') {
        const outer = (W - column) / 2;
        assert.ok(shown.some((x) => x < outer * 0.8), `${bg} : quelque chose à gauche de la colonne`);
        assert.ok(shown.some((x) => x > W - outer * 0.8), `${bg} : quelque chose à droite de la colonne`);
      }
    }
  });
}
