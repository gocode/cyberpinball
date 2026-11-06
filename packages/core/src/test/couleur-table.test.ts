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
  measureTint,
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
