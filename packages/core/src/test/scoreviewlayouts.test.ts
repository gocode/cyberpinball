// Mises en page de ScoreView qui remplissent la fenêtre du DMD (scoreviewlayouts.ts). Le choix de
// la mise en page est rejoué comme ScoreView::Select (VPX 10.8.1) : la plus proche en proportions,
// puis posée en « Contain » dans la fenêtre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { vpxFolderDefaults } from '../dmd';
import { MIN_FILL_ASPECT, prepareScoreViewLayouts, SCOREVIEW_LAYOUTS_DIR, scoreViewFillRange, scoreViewLayouts, type ScvFile } from '../scoreviewlayouts';

const DMD = `# Default layout for 128x32 DMD

Width: 128
Height: 32
Fit: Contain

Visuals:
\t- DMD:
\t\tRect: [0,0,128,32]
\t\tStyle: Neon Plasma
\t\tSize: [128, 32]
\t\tGlass:
\t\t\tRoughness: 0.1
\t\t\tImage:     ./Glass-Dirty-1.webp
\t\t\tArea:      [0,0,1024,256]
\t\t\tAmbient:   [0.4,0.4,0.4]
`;

const ALPHA = `# alphanumeric

Width: 301.5
Height: 75
Fit: Contain

Visuals:
\t- SegDisplay:
\t\tRect: [0,6,310,32]
\t\tSrc: ctrl://default/seg?id=0
`;

const top = (text: string, key: string) => Number(new RegExp(`^${key}:\\s*([0-9.]+)`, 'm').exec(text)![1]);
const rectOf = (text: string) => /Rect:\s*\[([^\]]*)\]/.exec(text)![1]!.split(',').map(Number);

/** ScoreView::Select puis Render : la mise en page retenue, et la place du DMD dans la fenêtre (fractions). */
function render(layouts: readonly ScvFile[], aspect: number) {
  const fit = (f: ScvFile) => {
    const a = top(f.content, 'Width') / top(f.content, 'Height');
    return aspect > a ? a / aspect : aspect / a;
  };
  const best = layouts.reduce((a, b) => (fit(b) > fit(a) ? b : a));
  const W = top(best.content, 'Width');
  const H = top(best.content, 'Height');
  // Contain : la mise en page entière dans la fenêtre, centrée.
  const srcW = aspect > W / H ? H * aspect : W;
  const srcH = aspect > W / H ? H : W / aspect;
  const [x, y, w, h] = rectOf(best.content) as [number, number, number, number];
  return { best, x: (x + (srcW - W) / 2) / srcW, y: (y + (srcH - H) / 2) / srcH, width: w / srcW, height: h / srcH };
}

test('ScoreView : une fenêtre réglée autour du 4:1 est remplie, à moins de 1 % près', () => {
  const layouts = scoreViewLayouts([{ name: 'lay4x1-dmd128x32.scv', content: DMD }]).filter((f) => !/alpha/.test(f.name));
  for (const aspect of [4, 4.5, 3, 2.2, 5.3, 7.9, 1.95]) {
    const r = render(layouts, aspect);
    assert.ok(r.width > 0.99 && r.height > 0.99, `${aspect}:1 rempli (${r.width.toFixed(3)} × ${r.height.toFixed(3)}, ${r.best.name})`);
    // Seuls Width, Height et les rectangles changent : verre, style, taille du DMD restent.
    assert.match(r.best.content, /Size: \[128, 32\]/);
    assert.match(r.best.content, /Area:\s+\[0,0,1024,256\]/);
    assert.match(r.best.content, /^Fit: Contain$/m, 'ScoreView refuse toute autre valeur de Fit');
  }
});

test('ScoreView : un écran 16:9 entier (FullDMD sans cadre) garde le DMD à ses proportions, au milieu', () => {
  const layouts = scoreViewLayouts([{ name: 'lay4x1-dmd128x32.scv', content: DMD }]);
  for (const aspect of [16 / 9, 16 / 10, 4 / 3, 1.88, 20]) {
    const r = render(layouts, aspect);
    const pxAspect = (r.width * aspect) / r.height;
    assert.ok(Math.abs(pxAspect - 4) < 1e-3, `${aspect.toFixed(2)}:1 : DMD en 4:1 (${pxAspect.toFixed(3)}, ${r.best.name})`);
    assert.ok(Math.abs(r.x + r.width / 2 - 0.5) < 1e-3 && Math.abs(r.y + r.height / 2 - 0.5) < 1e-3, 'centré');
  }
  assert.ok(scoreViewFillRange(4).min >= MIN_FILL_ASPECT && scoreViewFillRange(16 / 9).min === MIN_FILL_ASPECT);
  assert.ok(MIN_FILL_ASPECT > 16 / 9);
});

test('ScoreView : les afficheurs alphanumériques restent tels quels', () => {
  const layouts = scoreViewLayouts([{ name: 'lay4x1-alpha2x16.scv', content: ALPHA }]);
  assert.deepEqual(layouts, [{ name: 'lay4x1-alpha2x16.scv', content: ALPHA }]);
});

test('ScoreView : le dossier se prépare depuis VPX, une seule fois, et LayoutFolder n’est proposé que vide', () => {
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-scoreview-'));
  try {
    const vpx = path.join(tmp, 'vpx', 'plugins', 'scoreview', 'layouts');
    fs.mkdirSync(vpx, { recursive: true });
    fs.writeFileSync(path.join(vpx, 'lay4x1-dmd128x32.scv'), DMD);
    fs.writeFileSync(path.join(vpx, 'lay4x1-alpha2x16.scv'), ALPHA);
    fs.writeFileSync(path.join(vpx, 'Glass-Dirty-1.webp'), Buffer.from([1, 2, 3]));
    const data = path.join(tmp, 'data');
    const dir = prepareScoreViewLayouts(vpx, data);
    assert.equal(dir, path.join(data, SCOREVIEW_LAYOUTS_DIR));
    const names = fs.readdirSync(dir!);
    assert.ok(names.includes('Glass-Dirty-1.webp'), 'le verre, nommé par un chemin relatif');
    assert.ok(names.includes('lay4x1-alpha2x16.scv') && names.includes('lay4x1-dmd128x32.scv'), 'celles de VPX, à l’identique');
    assert.ok(names.filter((n) => n.endsWith('.scv')).length > 50 && names.length < 400, `${names.length} fichiers`);
    // Rien de changé : rien de réécrit.
    const before = fs.statSync(path.join(dir!, 'lay4x1-dmd128x32.scv')).mtimeMs;
    fs.writeFileSync(path.join(dir!, 'marque.txt'), 'x');
    prepareScoreViewLayouts(vpx, data);
    assert.ok(fs.existsSync(path.join(dir!, 'marque.txt')), 'pas réécrit');
    assert.equal(fs.statSync(path.join(dir!, 'lay4x1-dmd128x32.scv')).mtimeMs, before);
    // Une autre version de VPX : refait.
    fs.writeFileSync(path.join(vpx, 'lay4x1-dmd128x32.scv'), DMD.replace('Neon Plasma', 'Pixelated'));
    prepareScoreViewLayouts(vpx, data);
    assert.ok(!fs.existsSync(path.join(dir!, 'marque.txt')), 'refait');
    // Sans mises en page chez VPX : rien (ScoreView garde les siennes).
    assert.equal(prepareScoreViewLayouts(path.join(tmp, 'absent'), data), undefined);
    assert.deepEqual(vpxFolderDefaults({ scoreview: dir! }), [{ section: 'Plugin.ScoreView', key: 'LayoutFolder', value: dir! }]);
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
});

test('DMD du menu : les points remplissent la place réglée (pas de bandes noires)', () => {
  const renderer = path.join(__dirname, '..', '..', '..', '..', 'app', 'renderer');
  const front = fs.readFileSync(path.join(renderer, 'frontend.js'), 'utf8');
  assert.match(front, /CyberFallback\.dotMatrix\(box, \{ fill: true \}\)/);
  const fallback = fs.readFileSync(path.join(renderer, 'fallback.js'), 'utf8');
  assert.match(fallback, /const px = this\.fill \? W \/ this\.cols : this\.pitch;/);
  assert.match(fallback, /const py = this\.fill \? H \/ this\.rows : this\.pitch;/);
});
