// Couleur de chaque table au menu (tabletint.ts, demande du 06/11/2026) : la teinte dominante d'un
// média, ses corrections (trop terne, trop sombre, trop proche du vert signal), et l'invariant de
// lisibilité : quelle que soit la teinte, l'encre reste lisible sur la lueur qu'elle dessine sous
// un texte, et les points du DMD restent visibles.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { DEFAULT_DMD_COLOR, DMD_TABLE_COLOR, dmdColorReadable, effectiveDmdColor } from '../dmdcolor';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings } from '../mediaview';
import type { RgbaImage } from '../png';
import { REPO_ROOT } from './i18n-scan';
import {
  awayFromSignal,
  blend,
  cachedTint,
  contrastRatio,
  correctTint,
  hexToRgb,
  hueDistance,
  LED_PALETTE_CHROMA_MIN,
  LED_PALETTE_MAX,
  LED_PALETTE_SEPARATION,
  measureLedPalette,
  measureTint,
  mergeLedPalettes,
  recordLeds,
  NEUTRAL_TINT,
  oklchToHex,
  rgbToOklch,
  SIGNAL_DISTANCE,
  SIGNAL_HUE,
  storeTint,
  tableTint,
  TINT_CHROMA_MAX,
  TINT_CHROMA_MIN,
  TINT_LIGHTNESS,
  TINT_MAX_ALPHA_UNDER_TEXT,
  tintCacheFile,
  tintRecord,
  type TableTint,
} from '../tabletint';

type Rgba = [number, number, number, number];

/** Image de `width` × `height` dont les pixels sont tirés, dans l'ordre, des parts données. */
function image(parts: [Rgba, number][], width = 40, height = 20): RgbaImage {
  const data = Buffer.alloc(width * height * 4);
  const total = width * height;
  let i = 0;
  for (const [color, share] of parts) {
    const n = Math.round(share * total);
    for (let k = 0; k < n && i < total; k++, i++) data.set(color, i * 4);
  }
  return { width, height, data };
}

const solid = (hex: string, alpha = 255): RgbaImage => image([[[...hexToRgb(hex), alpha], 1]]);
const tintOf = (img: RgbaImage): TableTint => {
  const r = tableTint([img]);
  assert.equal(typeof r, 'object', `une teinte attendue, vu ${String(r)}`);
  return r as TableTint;
};
const lch = (hex: string) => rgbToOklch(...hexToRgb(hex));

test('OKLCH : aller-retour fidèle, gamut tenu', () => {
  for (const hex of ['#36c9b4', '#8be23a', '#ff8a1f', '#5fb4cf', '#e6f0ec']) {
    const [L, C, h] = lch(hex);
    assert.equal(oklchToHex(L, C, h), hex, hex);
  }
  // Chroma impossible à cette clarté : réduite, la teinte et la clarté restent.
  const wild = oklchToHex(0.75, 0.4, 260);
  const [L, C, h] = lch(wild);
  assert.ok(Math.abs(L - 0.75) < 0.01 && C < 0.4 && hueDistance(h, 260) < 3, wild);
});

test('teinte dominante : la couleur qui couvre le plus l’emporte, le gris ne vote pas', () => {
  const blue = '#2a5bd7';
  const orange = '#e0782a';
  const t = tintOf(image([[[...hexToRgb(blue), 255], 0.55], [[...hexToRgb(orange), 255], 0.25], [[128, 128, 128, 255], 0.2]]));
  assert.ok(hueDistance(t.hue, lch(blue)[2]) < 5, `bleu attendu, vu ${t.hue}°`);
  // Le blanc et le noir ne comptent pas, même nombreux : la couleur, même minoritaire, décide.
  const r = tintOf(image([[[255, 255, 255, 255], 0.5], [[3, 3, 3, 255], 0.3], [[...hexToRgb(orange), 255], 0.2]]));
  assert.ok(hueDistance(r.hue, lch(orange)[2]) < 5, `orange attendu, vu ${r.hue}°`);
});

test('logo détouré : les pixels transparents ne comptent pas', () => {
  const pink = '#e0509a';
  const logo = image([[[0, 255, 0, 0], 0.85], [[...hexToRgb(pink), 255], 0.15]]);
  const t = tintOf(logo);
  assert.ok(hueDistance(t.hue, lch(pink)[2]) < 5, `${t.hue}°`);
  assert.equal(tableTint([solid('#ff0000', 0)]), 'vide', 'une image entièrement transparente ne donne rien');
});

test('trop terne : noir et blanc, gris, fronton presque sans couleur → la sarcelle de la marque', () => {
  assert.equal(tableTint([image([[[240, 240, 240, 255], 0.5], [[20, 20, 20, 255], 0.5]])]), 'terne');
  assert.equal(tableTint([solid('#7a7f80')]), 'terne');
  // Une touche de couleur sur 5 % de l'image ne suffit pas.
  assert.equal(tableTint([image([[[...hexToRgb('#d03030'), 255], 0.05], [[90, 90, 90, 255], 0.95]])]), 'terne');
  assert.equal(measureTint([]), 'vide');
});

test('trop sombre ou trop pâle : clarté imposée, chroma bornée', () => {
  for (const hex of ['#151050', '#401010', '#c8b8f0', '#ff2a00', '#0050ff']) {
    const t = tintOf(solid(hex));
    const [L, C] = lch(t.color);
    assert.ok(Math.abs(L - TINT_LIGHTNESS) < 0.01, `${hex} → ${t.color} : clarté ${L}`);
    assert.ok(C <= TINT_CHROMA_MAX + 0.005, `${hex} → ${t.color} : chroma ${C} trop forte`);
    assert.ok(hueDistance(t.hue, lch(hex)[2]) < 3, `${hex} : teinte gardée`);
  }
  // Une couleur passée, mais franche, est ravivée jusqu'au plancher de chroma (si le gamut le permet).
  const pale = tintOf(solid(oklchToHex(0.6, 0.07, 60)));
  assert.ok(lch(pale.color)[1] >= TINT_CHROMA_MIN - 0.01, `${pale.color} : chroma ${lch(pale.color)[1]}`);
});

test('trop proche du vert signal : écartée de lui, ou abandonnée si elle tombe dessus', () => {
  assert.equal(tableTint([solid('#8be23a')]), 'signal', 'le vert signal même : abandonné');
  assert.equal(awayFromSignal(SIGNAL_HUE + 3), 'signal');
  // Un vert-jaune ou un vert d'eau proches : poussés à la distance minimale, chacun de son côté.
  for (const delta of [-30, -15, 12, 25]) {
    const hue = awayFromSignal((SIGNAL_HUE + delta + 360) % 360);
    assert.equal(typeof hue, 'number');
    assert.ok(Math.abs(hueDistance(hue as number, SIGNAL_HUE) - SIGNAL_DISTANCE) < 0.01, `${delta}° → ${hue}°`);
    const side = Math.sign(((hue as number) - SIGNAL_HUE + 540) % 360 - 180);
    assert.equal(side, Math.sign(delta), `${delta}° : poussée du côté où elle était`);
  }
  // Assez loin : intacte.
  assert.equal(awayFromSignal((SIGNAL_HUE + 90) % 360), (SIGNAL_HUE + 90) % 360);
  const mint = tintOf(solid(oklchToHex(0.8, 0.14, SIGNAL_HUE + 20)));
  assert.ok(hueDistance(mint.hue, SIGNAL_HUE) >= SIGNAL_DISTANCE - 0.1, `${mint.hue}°`);
  assert.notEqual(mint.measured, mint.hue, 'la teinte mesurée est gardée à côté de la teinte corrigée');
});

test('lisibilité : quelle que soit la teinte, l’encre reste lisible sur sa lueur, et le DMD visible', () => {
  const ink = hexToRgb('#e6f0ec');
  const muted = hexToRgb('#9bada7');
  const grounds = ['#030807', '#07110f', '#0c1a17'].map(hexToRgb);
  for (let hue = 0; hue < 360; hue += 3) {
    for (const chroma of [0.02, 0.1, 0.3]) {
      const t = correctTint({ hue, chroma, share: 1, dominance: 1 });
      if (t === 'signal') {
        assert.ok(hueDistance(hue, SIGNAL_HUE) < SIGNAL_DISTANCE, `${hue}° refusé loin du signal`);
        continue;
      }
      assert.ok(hueDistance(t.hue, SIGNAL_HUE) >= SIGNAL_DISTANCE - 0.1, `${hue}° : ${t.hue}° trop près du vert signal`);
      for (const ground of grounds) {
        const under = blend(hexToRgb(t.color), TINT_MAX_ALPHA_UNDER_TEXT, ground);
        assert.ok(contrastRatio(ink, under) >= 7, `${hue}° ${t.color} : encre à ${contrastRatio(ink, under).toFixed(2)}:1`);
        assert.ok(contrastRatio(muted, under) >= 4.5, `${hue}° ${t.color} : texte atténué à ${contrastRatio(muted, under).toFixed(2)}:1`);
      }
      assert.ok(dmdColorReadable(t.dmd), `${hue}° : points du DMD ${t.dmd} trop sombres`);
      assert.ok(dmdColorReadable(t.color));
    }
  }
  // La sarcelle de la marque passe la même épreuve.
  const under = blend(hexToRgb(NEUTRAL_TINT), TINT_MAX_ALPHA_UNDER_TEXT, grounds[0]!);
  assert.ok(contrastRatio(ink, under) >= 7);
});

test('cache : une mesure par média, refaite quand le fichier change', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teintes-'));
  try {
    const cache = tintCacheFile(dir);
    const media = path.join(dir, 'Copper Comet.png');
    fs.writeFileSync(media, 'image');
    assert.equal(cachedTint(cache, media), undefined, 'jamais lu');
    const t = tintOf(solid('#2a5bd7'));
    storeTint(cache, media, { tint: t });
    assert.deepEqual(cachedTint(cache, media), { tint: t });
    const dull = path.join(dir, 'Noir et blanc.png');
    fs.writeFileSync(dull, 'image');
    storeTint(cache, dull, { refused: 'terne' });
    assert.deepEqual(cachedTint(cache, dull), { refused: 'terne' }, 'un refus se garde aussi : il n’est pas recalculé');
    // Média remplacé (autre taille) : relu.
    fs.writeFileSync(media, 'une autre image');
    assert.equal(cachedTint(cache, media), undefined);
    // Cache d'une autre version : ignoré.
    fs.writeFileSync(cache, JSON.stringify({ version: 0, entries: {} }));
    assert.equal(cachedTint(cache, dull), undefined);
    // Cache abîmé : ignoré, sans erreur.
    fs.writeFileSync(cache, '{');
    assert.equal(cachedTint(cache, dull), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('réglages : couleur de chaque table affichée par défaut, DMD au vert signal tant qu’on ne choisit pas « couleur de la table »', () => {
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.tableColor, true);
  assert.equal(DEFAULT_MENU_MEDIA_SETTINGS.dmdColor, DEFAULT_DMD_COLOR, 'le DMD reste au vert signal par défaut');
  assert.equal(normalizeMenuMediaSettings({}).tableColor, true, 'une borne d’avant ce réglage voit la couleur');
  assert.equal(normalizeMenuMediaSettings({ tableColor: false }).tableColor, false);
  assert.equal(normalizeMenuMediaSettings({ tableColor: 'non' }).tableColor, true);
  assert.equal(normalizeMenuMediaSettings({ dmdColor: DMD_TABLE_COLOR }).dmdColor, DMD_TABLE_COLOR);
  // Points du DMD : la teinte de la table montrée, le vert signal sans teinte ; une couleur réglée ne bouge pas.
  assert.equal(effectiveDmdColor(DMD_TABLE_COLOR, '#ffa09d'), '#ffa09d');
  assert.equal(effectiveDmdColor(DMD_TABLE_COLOR, undefined), DEFAULT_DMD_COLOR);
  assert.equal(effectiveDmdColor('#ff8a1f', '#ffa09d'), '#ff8a1f');
});

test('menu : rien n’est mesuré pendant le défilement, la teinte suit la table arrêtée, fronton puis plateau, une mesure par média', async () => {
  interface Tints {
    follow(subject: { key: string; files: readonly string[] } | undefined): void;
    current(): TableTint | undefined;
    dispose(): void;
  }
  type Converter = { mediaFrames(file: string): Promise<{ width: number; height: number; images: RgbaImage[] }> };
  const { TableTints } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-tint.js')) as {
    TableTints: new (opts: { dataDir: string; settleMs?: number; onChange(): void; converter(): Converter }) => Tints;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teintes-menu-'));
  try {
    const files: Record<string, string> = {};
    // Fronton bleu, fronton en noir et blanc, plateau rose ; le nom dit l'image que rend le faux convertisseur.
    for (const name of ['bleu-backglass.png', 'gris-backglass.png', 'rose-playfield.png']) fs.writeFileSync((files[name] = path.join(dir, name)), name);
    const images: Record<string, RgbaImage> = { bleu: solid('#2a5bd7'), gris: image([[[240, 240, 240, 255], 0.5], [[20, 20, 20, 255], 0.5]]), rose: solid('#e0509a') };
    const measured: string[] = [];
    let changes = 0;
    const tints = new TableTints({
      dataDir: dir,
      settleMs: 30,
      onChange: () => changes++,
      converter: () => ({
        mediaFrames: async (file: string) => {
          measured.push(path.basename(file));
          return { width: 40, height: 20, images: [images[path.basename(file).split('-')[0]!]!] };
        },
      }),
    });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const blue = { key: 'bleu', files: [files['bleu-backglass.png']!, files['rose-playfield.png']!] };
    const grey = { key: 'gris', files: [files['gris-backglass.png']!, files['rose-playfield.png']!] };
    // Défilement rapide : dix crans en moins de l'attente, rien n'est mesuré.
    for (let i = 0; i < 10; i++) {
      tints.follow(i % 2 ? blue : grey);
      await wait(5);
    }
    assert.deepEqual(measured, [], 'aucune mesure pendant le défilement');
    tints.follow(blue);
    await wait(80);
    assert.deepEqual(measured, ['bleu-backglass.png'], 'le fronton suffit');
    assert.ok(hueDistance(tints.current()!.hue, lch('#2a5bd7')[2]) < 5);
    assert.equal(changes, 1);
    // Fronton sans couleur : le plateau la donne.
    tints.follow(grey);
    await wait(80);
    assert.deepEqual(measured, ['bleu-backglass.png', 'gris-backglass.png', 'rose-playfield.png']);
    assert.ok(hueDistance(tints.current()!.hue, lch('#e0509a')[2]) < 5);
    // Retour sur une table déjà vue : rien n'est remesuré, ni par ce menu ni par un autre (cache sur disque).
    tints.follow(blue);
    await wait(80);
    const again = new TableTints({ dataDir: dir, settleMs: 1, onChange() {}, converter: () => ({ mediaFrames: async () => assert.fail('mesuré deux fois') }) });
    again.follow(grey);
    await wait(30);
    assert.equal(measured.length, 3);
    assert.ok(again.current(), 'teinte reprise du cache');
    // Plus de table (menu système, couleur coupée) : la sarcelle, sans attendre.
    tints.follow(undefined);
    assert.equal(tints.current(), undefined);
    tints.dispose();
    again.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 21/11/2026 : même connue, la teinte attendait toujours SETTLE_MS, puis repartait dans un second envoi
// de tout l'état ; son fondu tombait en plein atterrissage de la roue, après celui des médias.
test('menu : appui isolé sur une table déjà mesurée, sa teinte part tout de suite, dans l’état envoyé ; en rafale, elle attend l’arrêt', async () => {
  interface Tints {
    follow(subject: { key: string; files: readonly string[] } | undefined): void;
    current(): TableTint | undefined;
    dispose(): void;
  }
  type Converter = { mediaFrames(file: string): Promise<{ width: number; height: number; images: RgbaImage[] }> };
  const { TableTints } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-tint.js')) as {
    TableTints: new (opts: { dataDir: string; settleMs?: number; onChange(): void; converter(): Converter }) => Tints;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teintes-isole-'));
  try {
    const at = (name: string) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, name);
      return file;
    };
    const images: Record<string, RgbaImage> = { bleu: solid('#2a5bd7'), rose: solid('#e0509a') };
    let changes = 0;
    const tints = new TableTints({
      dataDir: dir,
      settleMs: 40,
      onChange: () => changes++,
      converter: () => ({ mediaFrames: async (file: string) => ({ width: 40, height: 20, images: [images[path.basename(file).split('-')[0]!]!] }) }),
    });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const blue = { key: 'bleu', files: [at('bleu-backglass.png')] };
    const pink = { key: 'rose', files: [at('rose-backglass.png')] };
    const hueOf = () => tints.current()?.hue ?? -1;
    // Premières visites : jamais mesurées, la teinte vient après l'attente et la mesure (un envoi de plus).
    tints.follow(blue);
    await wait(120);
    tints.follow(pink);
    await wait(120);
    assert.equal(changes, 2);
    assert.ok(hueDistance(hueOf(), lch('#e0509a')[2]) < 5);
    // Appui isolé, table connue : la teinte est là tout de suite, sans second envoi.
    tints.follow(blue);
    assert.ok(hueDistance(hueOf(), lch('#2a5bd7')[2]) < 5, 'teinte montrée dans l’état en cours');
    assert.equal(changes, 2, 'aucun envoi de plus');
    // Rafale (appui suivant aussitôt) : la teinte d'avant reste jusqu'à l'arrêt, puis la nouvelle arrive.
    tints.follow(pink);
    assert.ok(hueDistance(hueOf(), lch('#2a5bd7')[2]) < 5, 'en rafale, pas de changement de couleur à chaque cran');
    await wait(120);
    assert.ok(hueDistance(hueOf(), lch('#e0509a')[2]) < 5);
    assert.equal(changes, 3);
    tints.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('menu : les points du DMD prennent d’abord la couleur du média de l’écran du DMD, l’ambiance celle du fronton (12/11/2026)', async () => {
  interface Tints {
    follow(subject: { key: string; files: readonly string[]; dmdFiles?: readonly string[] } | undefined): void;
    current(): Partial<TableTint> | undefined;
    dispose(): void;
  }
  type Converter = { mediaFrames(file: string): Promise<{ width: number; height: number; images: RgbaImage[] }> };
  const { TableTints } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-tint.js')) as {
    TableTints: new (opts: { dataDir: string; settleMs?: number; onChange(): void; converter(): Converter }) => Tints;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teintes-dmd-'));
  try {
    const at = (name: string) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, name);
      return file;
    };
    const backglass = at('bleu-backglass.png');
    const orange = at('orange-fulldmd.png');
    const grey = at('gris-fulldmd.png');
    // FullDMD : le cadre noir ne vote pas, les points orange du DMD donnent la teinte.
    const images: Record<string, RgbaImage> = {
      bleu: solid('#2a5bd7'),
      orange: image([[[0, 0, 0, 255], 0.7], [[255, 120, 20, 255], 0.3]]),
      gris: image([[[240, 240, 240, 255], 0.5], [[20, 20, 20, 255], 0.5]]),
    };
    const tints = new TableTints({
      dataDir: dir,
      settleMs: 1,
      onChange() {},
      converter: () => ({ mediaFrames: async (file: string) => ({ width: 40, height: 20, images: [images[path.basename(file).split('-')[0]!]!] }) }),
    });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    tints.follow({ key: 'orange', files: [backglass], dmdFiles: [orange] });
    await wait(60);
    const shown = tints.current()!;
    assert.equal(shown.color, tintOf(images.bleu!).color, 'l’ambiance reste celle du fronton');
    assert.equal(shown.dmd, tintOf(images.orange!).dmd, 'les points prennent l’orange du DMD');
    assert.ok(hueDistance(lch(shown.dmd!)[2], lch('#ff7814')[2]) < 15);
    // Média du DMD sans couleur : les points reprennent celle du fronton.
    tints.follow({ key: 'gris', files: [backglass], dmdFiles: [grey] });
    await wait(60);
    assert.equal(tints.current()!.dmd, tintOf(images.bleu!).dmd);
    // Fronton sans couleur mais DMD orange : les points orange, l’ambiance garde la sarcelle (pas de color).
    tints.follow({ key: 'seul', files: [grey], dmdFiles: [orange] });
    await wait(60);
    assert.equal(tints.current()!.color, undefined);
    assert.equal(tints.current()!.dmd, tintOf(images.orange!).dmd);
    tints.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 25/11/2026 : les LED de la roue prennent les couleurs du visuel de la table, pas une seule teinte.
test('LED : les couleurs dominantes du visuel, de la plus présente à la moins présente, distinctes et franches', () => {
  // Fronton à trois couleurs : moitié bleu, un tiers rouge, le reste jaune ; plus un peu de gris.
  const img = image([
    [[...hexToRgb('#1f4fe0'), 255], 0.45],
    [[...hexToRgb('#d82020'), 255], 0.3],
    [[...hexToRgb('#f0c020'), 255], 0.15],
    [[128, 128, 128, 255], 0.1],
  ]);
  const leds = measureLedPalette([img]);
  assert.equal(leds.length, 3, leds.join());
  const hues = leds.map((h) => lch(h)[2]);
  assert.ok(hueDistance(hues[0]!, lch('#1f4fe0')[2]) < 6, 'le bleu, le plus présent, d’abord');
  assert.ok(hueDistance(hues[1]!, lch('#d82020')[2]) < 6, 'puis le rouge');
  assert.ok(hueDistance(hues[2]!, lch('#f0c020')[2]) < 6, 'puis le jaune');
  for (const hex of leds) assert.ok(lch(hex)[1] >= LED_PALETTE_CHROMA_MIN - 0.02, `${hex} franche`);
  for (let i = 0; i < hues.length; i++) for (let j = i + 1; j < hues.length; j++) assert.ok(hueDistance(hues[i]!, hues[j]!) >= LED_PALETTE_SEPARATION / 2);
  // Les nuances d'une même couleur ne font qu'une ; une trace infime ne compte pas ; jamais plus de LED_PALETTE_MAX.
  assert.equal(measureLedPalette([image([[[...hexToRgb('#2050e0'), 255], 0.5], [[...hexToRgb('#3060f0'), 255], 0.49], [[...hexToRgb('#e02020'), 255], 0.01]])]).length, 1);
  assert.ok(measureLedPalette([image(Array.from({ length: 8 }, (_, i) => [[...hexToRgb(oklchToHex(0.65, 0.18, i * 45)), 255] as Rgba, 1 / 8]))]).length <= LED_PALETTE_MAX);
  // Gris, vide : aucune couleur (les LED gardent la couleur réglée).
  assert.deepEqual(measureLedPalette([solid('#7a7f80')]), []);
  assert.deepEqual(measureLedPalette([solid('#ff0000', 0)]), []);
  // La teinte d'interface porte la palette ; la première couleur est de la même famille.
  const tint = tintOf(img);
  assert.deepEqual(tint.leds, leds);
  assert.ok(hueDistance(lch(tint.leds![0]!)[2], tint.measured) < 10);
});

test('LED : une table toute verte n’a pas de teinte d’interface (vert signal), mais ses LED restent vertes', () => {
  const green = [solid('#8be23a')];
  assert.equal(tableTint(green), 'signal');
  const record = tintRecord(green);
  assert.equal('refused' in record && record.refused, 'signal');
  assert.ok(hueDistance(lch(recordLeds(record)![0]!)[2], lch('#8be23a')[2]) < 8, 'vert gardé pour les LED');
  assert.deepEqual(tintRecord([solid('#7a7f80')]), { refused: 'terne' }, 'un gris ne donne rien');
});

test('LED : la roue transmet les couleurs de la table, même refusée pour l’interface', async () => {
  interface Tints {
    follow(subject: { key: string; files: readonly string[] } | undefined): void;
    current(): (Partial<TableTint> & { leds?: string[] }) | undefined;
    dispose(): void;
  }
  type Converter = { mediaFrames(file: string): Promise<{ width: number; height: number; images: RgbaImage[] }> };
  const { TableTints } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-tint.js')) as {
    TableTints: new (opts: { dataDir: string; settleMs?: number; onChange(): void; converter(): Converter }) => Tints;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teintes-led-'));
  try {
    const at = (name: string) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, name);
      return file;
    };
    const images: Record<string, RgbaImage> = {
      duo: image([[[...hexToRgb('#1f4fe0'), 255], 0.6], [[...hexToRgb('#d82020'), 255], 0.4]]),
      vert: solid('#8be23a'),
    };
    const duo = at('duo-backglass.png');
    const vert = at('vert-backglass.png');
    const tints = new TableTints({
      dataDir: dir,
      settleMs: 10,
      onChange() {},
      converter: () => ({ mediaFrames: async (file: string) => ({ width: 40, height: 20, images: [images[path.basename(file).split('-')[0]!]!] }) }),
    });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    tints.follow({ key: 'duo', files: [duo] });
    await wait(60);
    assert.deepEqual(tints.current()!.leds, measureLedPalette([images.duo!]));
    tints.follow({ key: 'vert', files: [vert] });
    await wait(60);
    assert.equal(tints.current()!.color, undefined, 'pas de teinte d’interface');
    assert.deepEqual(tints.current()!.leds, measureLedPalette([images.vert!]), 'les LED gardent le vert');
    tints.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// 25/11/2026, borne d'essai : fronton vert refusé pour l'interface, la roue donnait seule les couleurs des LED
// et le plateau n'était jamais lu. Invariant : les LED mêlent les dominantes du fronton et du plateau ; la
// roue ne sert qu'en dernier.
test('LED : les dominantes du fronton et du plateau se mêlent, la roue en dernier recours', async () => {
  const merged = mergeLedPalettes([['#20d040', '#2060ff'], ['#2a6aff', '#e02020'], undefined]);
  assert.deepEqual(merged, ['#20d040', '#2a6aff', '#e02020'], 'la dominante de chacun d’abord, puis les suivantes, sans doublon proche');
  assert.equal(mergeLedPalettes([['#ff0000', '#00ff00', '#0000ff', '#ffff00'], ['#ff00ff', '#00ffff']]).length, LED_PALETTE_MAX);
  assert.deepEqual(mergeLedPalettes([[], undefined]), []);

  interface Tints {
    follow(subject: { key: string; files: readonly string[]; ledFiles?: readonly string[] } | undefined): void;
    current(): (Partial<TableTint> & { leds?: string[] }) | undefined;
    dispose(): void;
  }
  type Converter = { mediaFrames(file: string): Promise<{ width: number; height: number; images: RgbaImage[] }> };
  const { TableTints } = require(path.join(REPO_ROOT, 'app', 'dist', 'table-tint.js')) as {
    TableTints: new (opts: { dataDir: string; settleMs?: number; onChange(): void; converter(): Converter }) => Tints;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'teintes-led-'));
  try {
    const at = (name: string) => {
      const file = path.join(dir, name);
      fs.writeFileSync(file, name);
      return file;
    };
    const images: Record<string, RgbaImage> = { vert: solid('#8be23a'), bleu: solid('#1f4fe0'), rouge: solid('#d82020') };
    const backglass = at('vert-backglass.png');
    const playfield = at('bleu-playfield.png');
    const wheel = at('rouge-wheel.png');
    const measured: string[] = [];
    const converter = () => ({
      mediaFrames: async (file: string) => {
        measured.push(path.basename(file));
        return { width: 40, height: 20, images: [images[path.basename(file).split('-')[0]!]!] };
      },
    });
    const tints = new TableTints({ dataDir: dir, settleMs: 10, onChange() {}, converter });
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    const subject = { key: 'matrice', files: [backglass, playfield, wheel], ledFiles: [backglass, playfield] };
    tints.follow(subject);
    await wait(80);
    const shown = tints.current()!;
    const hues = shown.leds!.map((h) => lch(h)[2]);
    assert.ok(hueDistance(hues[0]!, lch('#8be23a')[2]) < 15, `fronton d'abord : ${shown.leds!.join()}`);
    assert.ok(hues.some((h) => hueDistance(h, lch('#1f4fe0')[2]) < 15), `plateau mêlé : ${shown.leds!.join()}`);
    assert.ok(!hues.some((h) => hueDistance(h, lch('#d82020')[2]) < 15), 'pas la roue');
    assert.ok(hueDistance(lch(shown.color!)[2], lch('#1f4fe0')[2]) < 25, 'interface : le plateau avant la roue');
    assert.ok(!measured.includes('rouge-wheel.png'), 'roue pas mesurée : inutile');
    tints.dispose();
    // Déjà mesurée (cache) : montrée aussitôt, mêmes couleurs.
    const again = new TableTints({ dataDir: dir, settleMs: 10, onChange() {}, converter: () => ({ mediaFrames: async () => assert.fail('mesuré deux fois') }) });
    again.follow(subject);
    assert.deepEqual(again.current()?.leds, shown.leds);
    again.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
