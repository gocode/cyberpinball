// Habillage FullDMD en partie (fulldmdframe.ts, fulldmdtable.ts) : le cadre du DMD trouvé dans
// le média FullDMD, la fenêtre du DMD de VPX posée dedans par le .ini de la table, et l'invariant
// signalé sur The Walking Dead (26 octobre 2026) : en partie, l'écran du FullDMD garde
// son habillage quand il en a un, le DMD dans le cadre ; sinon rien ne change.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, scriptFacts } from '../doctor';
import { applyOps } from '../fileops';
import {
  agreeingFrame,
  cachedFrame,
  detectDmdFrame,
  dressCoverage,
  DRESS_COVERED,
  dressRecord,
  dressUpdate,
  frameCacheFile,
  frameWindow,
  fullDmdPlan,
  pngFrame,
  storeFrame,
  tableDmdWindow,
  type FrameRect,
  type FullDmdInput,
} from '../fulldmdframe';
import { dressingMedia, dressingOps, dressScreen, liveDressCoverage, tableDressing, type DressOptions } from '../fulldmdtable';
import { IniDocument } from '../ini';
import { GAME_MEDIA_MODES } from '../mediaview';
import { momentScreen } from '../menumoments';
import type { Cabinet, PhysicalScreen } from '../model';
import { encodePng } from '../png';
import { readInfo, scanTables } from '../tables';
import { framedFullDmd, seeded } from './fixtures';

/** Écart toléré entre le cadre trouvé et le vrai, en part de l'image (un pixel de travail ≈ 0,2 %). */
const TOLERANCE = 0.015;

function near(found: FrameRect | undefined, inner: { x: number; y: number; width: number; height: number }, size: { width: number; height: number }): void {
  assert.ok(found, 'cadre attendu');
  assert.ok(Math.abs(found.x - inner.x / size.width) < TOLERANCE, `x ${found.x} / ${inner.x / size.width}`);
  assert.ok(Math.abs(found.y - inner.y / size.height) < TOLERANCE, `y ${found.y} / ${inner.y / size.height}`);
  assert.ok(Math.abs(found.width - inner.width / size.width) < TOLERANCE, `largeur ${found.width} / ${inner.width / size.width}`);
  assert.ok(Math.abs(found.height - inner.height / size.height) < TOLERANCE, `hauteur ${found.height} / ${inner.height / size.height}`);
}

test('cadre du DMD trouvé dans un FullDMD habillé : trait plein, pointillés, plusieurs tailles', () => {
  for (const opts of [{}, { dotted: true }, { width: 1920, height: 1080, seed: 3 }, { width: 1280, height: 720, dotted: true, seed: 11 }]) {
    const { image, inner } = framedFullDmd(opts);
    near(detectDmdFrame(image), inner, image);
  }
});

test('pas de cadre dans une image sans habillage (scène de film, illustration seule, bandes noires)', () => {
  const rnd = seeded(5);
  const width = 960;
  const height = 540;
  const noisy = Buffer.alloc(width * height * 4);
  for (let i = 0; i < noisy.length; i += 4) {
    const v = Math.round(rnd() * 255);
    noisy[i] = v;
    noisy[i + 1] = (v * 7) % 256;
    noisy[i + 2] = (v * 13) % 256;
    noisy[i + 3] = 255;
  }
  assert.equal(detectDmdFrame({ width, height, data: noisy }), undefined);
  // Film en 2,39:1 dans une image 16:9 : deux bords horizontaux, aucun vertical.
  const letterbox = Buffer.alloc(width * height * 4);
  for (let y = 0; y < height; y++)
    for (let x = 0; x < width; x++) {
      const o = (y * width + x) * 4;
      const inFilm = y > 69 && y < 470;
      letterbox[o] = inFilm ? 180 : 0;
      letterbox[o + 1] = inFilm ? 120 : 0;
      letterbox[o + 2] = inFilm ? 60 : 0;
      letterbox[o + 3] = 255;
    }
  assert.equal(detectDmdFrame({ width, height, data: letterbox }), undefined);
  // Un cadre trop étroit (un logo encadré au milieu d'une image large) n'est pas celui d'un DMD.
  const { image } = framedFullDmd();
  const small = { width: 2400, height: 540, data: Buffer.alloc(2400 * 540 * 4) };
  for (let y = 270; y < 540; y++) image.data.copy(small.data, (y * 2400 + 720) * 4, y * 960 * 4, (y + 1) * 960 * 4);
  for (let i = 3; i < small.data.length; i += 4) small.data[i] = 255;
  assert.equal(detectDmdFrame(small), undefined);
});

test('vidéo : le cadre que montrent la plupart des images, pas celui d’une scène qui passe', () => {
  const a = { x: 0.05, y: 0.55, width: 0.9, height: 0.38 };
  const b = { x: 0.051, y: 0.552, width: 0.899, height: 0.379 };
  const elsewhere = { x: 0.1, y: 0.1, width: 0.8, height: 0.2 };
  const mean = agreeingFrame([a, undefined, b, a]);
  assert.ok(mean && Math.abs(mean.x - 0.0503) < 0.001);
  assert.equal(agreeingFrame([a, undefined, elsewhere, undefined]), undefined);
  assert.equal(agreeingFrame([undefined, undefined, undefined, undefined]), undefined);
});

test('fenêtre du DMD : le cadre suit le média montré entier et centré dans la zone', () => {
  // 1920 × 1080 sur un écran 1920 × 1080 : pixel pour pixel (The Walking Dead).
  assert.deepEqual(frameWindow({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 1920, height: 1080 }, { x: 104 / 1920, y: 616 / 1080, width: 1716 / 1920, height: 416 / 1080 }), { x: 104, y: 616, width: 1716, height: 416 });
  // Vidéo 1590 × 738 (VPW) : agrandie à 1920 × 891,2, bandes noires de 94,4 px en haut et en bas.
  assert.deepEqual(frameWindow({ x: 0, y: 0, width: 1920, height: 1080 }, { width: 1590, height: 738 }, { x: 0, y: 0, width: 1, height: 1 }), { x: 0, y: 94, width: 1920, height: 892 });
  // FullDMD dans la bande du bas d'un écran partagé avec le fronton.
  assert.deepEqual(frameWindow({ x: 0, y: 720, width: 640, height: 360 }, { width: 1920, height: 1080 }, { x: 0.5, y: 0.5, width: 0.25, height: 0.25 }), { x: 320, y: 900, width: 160, height: 90 });
});

const BASE: FullDmdInput = {
  dmdKind: 'fulldmd',
  placement: 'screen',
  zone: { x: 0, y: 0, width: 1920, height: 1080 },
  media: { file: 'x.png', type: 'FullDMD', source: 'folder-name' },
  frame: { frame: { x: 0.05, y: 0.57, width: 0.9, height: 0.38 }, width: 1920, height: 1080 },
  drawsDmd: true,
  b2sFullDmd: false,
  pupInDmdWindow: false,
};

test('habillage : seulement un FullDMD de la table, avec un cadre, autour d’un DMD que personne d’autre n’habille', () => {
  assert.equal(fullDmdPlan(BASE).dressed, true);
  const reason = (input: Partial<FullDmdInput>) => {
    const plan = fullDmdPlan({ ...BASE, ...input });
    return plan.dressed ? 'habillé' : plan.reason;
  };
  assert.equal(reason({ dmdKind: 'dmd' }), 'notFullDmd');
  assert.equal(reason({ placement: 'embedded' }), 'embedded');
  assert.equal(reason({ media: undefined }), 'noMedia');
  assert.equal(reason({ media: { file: 'x.mp4', type: 'DMD', source: 'folder-name' } }), 'noMedia');
  assert.equal(reason({ media: { file: 'b2s.png', type: 'FullDMD', source: 'b2s' } }), 'noMedia');
  assert.equal(reason({ b2sFullDmd: true }), 'b2s');
  assert.equal(reason({ pupInDmdWindow: true }), 'pup');
  assert.equal(reason({ drawsDmd: false }), 'noDmd');
  assert.equal(reason({ frame: undefined }), 'notAnalysed');
  assert.equal(reason({ frame: { frame: null, width: 1920, height: 1080 } }), 'noFrame');
  // Script inconnu : l'habillage est posé (le DMD de la ROM le plus souvent).
  assert.equal(reason({ drawsDmd: undefined }), 'habillé');
  // Une zone fenêtrée (FullDMD sous le fronton) aussi.
  assert.equal(reason({ placement: 'window' }), 'habillé');
});

test('.ini de la table : posé, mis à jour, gardé quand l’utilisateur l’a réglé en partie, retiré sans habillage', () => {
  const plan = fullDmdPlan(BASE);
  assert.ok(plan.dressed);
  const keys = (text: string) => tableDmdWindow(IniDocument.parse(text));

  // Rien pour la table : posé, et retenu.
  const first = dressUpdate('[Player]\r\nScreenPlayerZ = 70\r\n', plan, undefined);
  assert.equal(first.state, 'placed');
  assert.deepEqual(first.record, plan.window);
  assert.deepEqual(keys(first.content!).rect, plan.window);
  assert.equal(keys(first.content!).fullScreen, '0');
  assert.match(first.content!, /ScreenPlayerZ = 70/);

  // Même place : rien à écrire.
  assert.deepEqual(dressUpdate(first.content!, plan, plan.window), { state: 'unchanged' });

  // Le cadre a changé (nouveau média, autre écran) : la place gérée suit.
  const moved = fullDmdPlan({ ...BASE, frame: { frame: { x: 0.1, y: 0.6, width: 0.8, height: 0.3 }, width: 1920, height: 1080 } });
  const second = dressUpdate(first.content!, moved, plan.window);
  assert.equal(second.state, 'placed');
  assert.deepEqual(keys(second.content!).rect, moved.dressed ? moved.window : undefined);

  // Réglée en partie (menu de VPX, « Save as Table Override ») : jamais touchée.
  const user = first.content!.replace(/ScoreViewWndX = \d+/, 'ScoreViewWndX = 120');
  const kept = dressUpdate(user, plan, plan.window);
  assert.equal(kept.state, 'kept');
  assert.equal(kept.content, undefined);
  assert.equal(kept.record, null);
  assert.equal(dressUpdate('[ScoreView]\r\nScoreViewFullScreen = 1\r\n', plan, undefined).state, 'kept');

  // Plus d'habillage (média retiré, écran devenu DMD seul) : la place gérée est retirée, le reste gardé.
  const none = fullDmdPlan({ ...BASE, media: undefined });
  const restored = dressUpdate(first.content!, none, plan.window);
  assert.equal(restored.state, 'restored');
  assert.equal(keys(restored.content!).keys.length, 0);
  assert.match(restored.content!, /ScreenPlayerZ = 70/);
  assert.equal(dressUpdate(first.content!.replace(/\[Player\][^[]*/, ''), none, plan.window).content, '');
  // Une place de l'utilisateur reste, habillage ou pas.
  assert.equal(dressUpdate(user, none, plan.window).state, 'unchanged');
});

test('recouvrement de l’habillage : 1 pour le DMD sur tout l’écran, 0 dans le cadre', () => {
  const zone = { x: 0, y: 0, width: 1920, height: 1080 };
  const frame = { x: 104, y: 616, width: 1716, height: 416 };
  assert.equal(dressCoverage(zone, zone, frame), 1);
  assert.equal(dressCoverage(frame, zone, frame), 0);
  assert.ok(dressCoverage({ x: 0, y: 540, width: 1920, height: 540 }, zone, frame) < DRESS_COVERED);
});

// ---------------------------------------------------------------------------
// Invariant, sur des écrans simulés : une table habillée, de la borne à la partie.

const screen = (fingerprint: string, label: string): PhysicalScreen => ({ fingerprint, strength: 'strong', label, widthPx: 1920, heightPx: 1080, widthCm: 48, heightCm: 27 });

/** Borne simulée : playfield sur l'AUO, FullDMD seul sur le PLX2283HSU (comme la borne du signalement). */
function fullDmdCabinet(): Cabinet {
  return {
    version: 1,
    screens: [screen('PF', 'Generic PnP Monitor (1920 × 1080)'), screen('DMD', 'PLX2283HSU (1920 × 1080)')],
    roles: { playfield: 'PF', dmd: 'DMD' },
    dmdKind: 'fulldmd',
    vpx: { iniPath: 'VPinballX.ini' },
    updatedAt: '',
  };
}

const TABLE = 'The Walking Dead (Limited Edition) (Stern 2014)';

function tableWith(opts: { ini?: string; script?: string } = {}) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-habillage-'));
  const folder = path.join(root, 'tables', TABLE);
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(path.join(folder, `${TABLE}.vpx`), 'vpx');
  fs.writeFileSync(path.join(folder, `${TABLE}.info`), '{}');
  const { image, inner } = framedFullDmd({ width: 1920, height: 1080 });
  fs.writeFileSync(path.join(folder, 'medias', `(FullDMD) ${TABLE}.png`), encodePng(image));
  if (opts.ini) fs.writeFileSync(path.join(folder, `${TABLE}.ini`), opts.ini);
  const facts = scriptFacts(opts.script ?? 'LoadVPM "01560000", "SAM.VBS", 3.26\r\nController.GameName = "twd_160h"\r\n');
  const entry = () => scanTables(path.join(root, 'tables'))[0]!;
  const options = (): DressOptions => {
    const cabinet = fullDmdCabinet();
    return { screen: dressScreen(cabinet), root, cabinet, facts, b2sFullDmd: false, frameOf: (media) => cachedFrame(frameCacheFile(path.join(root, 'data')), media) ?? pngFrame(media) };
  };
  return { root, folder, inner, entry, options, facts };
}

test('invariant : en partie, l’écran du FullDMD garde son habillage, le DMD dans le cadre', () => {
  const t = tableWith();
  const entry = t.entry();
  const opts = t.options();
  assert.equal(opts.screen.placement, 'screen');
  assert.deepEqual(opts.screen.zone, { x: 0, y: 0, width: 1920, height: 1080 });
  assert.ok(dressingMedia(entry, opts.screen, t.root, opts.cabinet));

  // Avant la partie : la fenêtre du DMD posée dans le cadre, pour cette table seule.
  const before = tableDressing(entry, opts);
  assert.ok(before.plan.dressed, before.plan.dressed ? '' : before.plan.reason);
  const plan = before.plan;
  for (const [key, value] of [['x', t.inner.x], ['y', t.inner.y], ['width', t.inner.width], ['height', t.inner.height]] as const) {
    assert.ok(Math.abs(plan.window[key] - value) <= 1920 * TOLERANCE, `${key} ${plan.window[key]} / ${value}`);
  }
  const { state, ops } = dressingOps(entry, before);
  assert.equal(state, 'placed');
  applyOps(ops, { trashDir: path.join(t.root, 'corbeille') });
  const after = tableDressing(t.entry(), opts);
  assert.ok(after.ours, 'place écrite et retenue dans le .info');
  assert.deepEqual(dressRecord(readInfo(t.entry().infoFile)), plan.window);
  assert.deepEqual(after.current.rect, plan.window);
  // Une seconde partie ne réécrit rien.
  assert.equal(dressingOps(t.entry(), after).ops.length, 0);

  // Pendant la partie : le fond de l'écran du DMD montre l'habillage, jamais éteint, quel que
  // soit le réglage des médias pendant la partie et ce que VPX occupe.
  for (const game of GAME_MEDIA_MODES) {
    for (const occupied of [false, true]) {
      assert.notEqual(momentScreen('game', 'dmd', { game, occupied, dressed: true }).play, 'off', `${game}, occupé : ${occupied}`);
    }
  }
  assert.equal(momentScreen('game', 'dmd', { game: 'animated', dressed: true }).play, 'animated');
  // Sans habillage, rien ne change.
  assert.equal(momentScreen('game', 'dmd', { game: 'off', dressed: false }).play, 'off');

  // Et la pile des fenêtres de Windows : le DMD de VPX dans le cadre laisse l'habillage visible ;
  // étiré sur tout l'écran (le défaut signalé), il le recouvre, et c'est détecté.
  const dmd = { x: 1920, y: 0, width: 1920, height: 1080 };
  const vpx = (rect: typeof dmd) => [{ pid: 4242, rect, minimized: false }, { pid: 1, rect: dmd, minimized: false }];
  const inFrame = { x: 1920 + plan.window.x, y: plan.window.y, width: plan.window.width, height: plan.window.height };
  assert.ok(liveDressCoverage(vpx(inFrame), 1, dmd, after) < DRESS_COVERED);
  assert.ok(liveDressCoverage(vpx(dmd), 1, dmd, after) >= DRESS_COVERED);
  // Une fenêtre sous la nôtre ne se voit pas.
  assert.equal(liveDressCoverage([{ pid: 1, rect: dmd, minimized: false }, { pid: 4242, rect: dmd, minimized: false }], 1, dmd, after), 0);
  fs.rmSync(t.root, { recursive: true });
});

test('sans habillage, la table garde son comportement : DMD seul, pas de cadre, table sans DMD', () => {
  const t = tableWith({ script: 'Sub Table1_Init : End Sub\r\n' });
  const opts = t.options();
  const noDmd = tableDressing(t.entry(), opts);
  assert.deepEqual(noDmd.plan, { dressed: false, reason: 'noDmd' });
  assert.equal(dressingOps(t.entry(), noDmd).ops.length, 0);
  const band = tableDressing(t.entry(), { ...opts, facts: t.facts, screen: { ...opts.screen, dmdKind: 'dmd' } });
  assert.deepEqual(band.plan, { dressed: false, reason: 'notFullDmd' });
  // Média sans cadre (scène de film) : cherché une fois, retenu comme tel.
  const cache = frameCacheFile(path.join(t.root, 'data'));
  const media = path.join(t.folder, 'medias', `(FullDMD) ${TABLE}.png`);
  storeFrame(cache, media, { frame: null, width: 1920, height: 1080 });
  const film = tableDressing(t.entry(), { ...opts, facts: scriptFacts('LoadVPM "01560000", "SAM.VBS", 3.26\r\n') });
  assert.deepEqual(film.plan, { dressed: false, reason: 'noFrame' });
  fs.rmSync(t.root, { recursive: true });
});

test('médecin : le DMD réglé sur tout l’écran pour la table cacherait l’habillage ; la correction le pose dans le cadre', () => {
  const t = tableWith({ ini: '[ScoreView]\r\nScoreViewFullScreen = 1\r\n' });
  const opts = t.options();
  const dressing = tableDressing(t.entry(), opts);
  const tablesDir = path.join(t.root, 'tables');
  const findings = diagnose(t.entry(), { tablesDir, script: t.facts, dressing });
  const hidden = findings.find((f) => f.code === 'fullDmdHidden');
  assert.ok(hidden?.fix, findings.map((f) => f.code).join(', '));
  // Un seul constat sur la fenêtre du DMD : « Écrans placés pour cette table » ne la propose pas aussi.
  assert.ok(!findings.some((f) => f.code === 'tableWindows'));
  applyOps(hidden.fix.ops, { trashDir: path.join(t.root, 'corbeille') });
  const fixed = tableDressing(t.entry(), opts);
  assert.ok(fixed.ours);
  const again = diagnose(t.entry(), { tablesDir, script: t.facts, dressing: fixed });
  assert.ok(!again.some((f) => f.code === 'fullDmdHidden' || f.code === 'tableWindows'), again.map((f) => f.code).join(', '));
  fs.rmSync(t.root, { recursive: true });
});
