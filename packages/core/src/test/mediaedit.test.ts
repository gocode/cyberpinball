// Gestionnaire des médias d'un jeu (T8) : plan des changements, renommage
// « (Type) <nom du dossier>.ext », corbeille, ordre des pages, .info.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { applyOps, trashDirFor } from '../fileops';
import {
  draftChangeCount,
  emptyMediaDraft,
  guessMediaType,
  MANAGED_MEDIA_TYPES,
  mediaCompetitors,
  mediaPlacement,
  mediaStateLabel,
  nextMemory,
  ownMediaPages,
  planMediaChanges,
  type MediaDraft,
} from '../mediaedit';
import { MEDIA_TYPES, mediaMemory, resolveMedia, type MediaMoment, type MediaType } from '../medias';
import type { Cabinet, PhysicalScreen } from '../model';
import { infoFileFor, readInfo, scanTables, type TableEntry } from '../tables';

const FOLDER = 'Terminator 2 (Williams 1991)';
const VPX = 'Terminator 2 (Williams 1991) g5k 1.25';

interface Fixture {
  root: string;
  tables: string;
  folder: string;
  medias: string;
  importDir: string;
  table: () => TableEntry;
  put: (dir: string, name: string, content?: string) => string;
}

function fixture(): Fixture {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-mediaedit-'));
  const tables = path.join(root, 'tables');
  const folder = path.join(tables, FOLDER);
  const medias = path.join(folder, 'medias');
  const importDir = path.join(root, 'import');
  fs.mkdirSync(medias, { recursive: true });
  fs.mkdirSync(importDir, { recursive: true });
  fs.writeFileSync(path.join(folder, `${VPX}.vpx`), '');
  fs.writeFileSync(
    path.join(folder, `${FOLDER}.info`),
    JSON.stringify({ Info: { Title: 'Terminator 2', Manufacturer: 'Williams', Year: 1991 }, User: { StartCount: 7 }, Autre: { garde: true } }, null, 2),
  );
  const put = (dir: string, name: string, content = name) => {
    const file = path.join(dir, name);
    fs.mkdirSync(path.dirname(file), { recursive: true });
    fs.writeFileSync(file, content);
    return file;
  };
  return { root, tables, folder, medias, importDir, table: () => scanTables(tables)[0]!, put };
}

function context(f: Fixture) {
  const t = f.table();
  return { infoFile: infoFileFor(t, f.tables), root: f.root };
}

function apply(f: Fixture, draft: MediaDraft) {
  const plan = planMediaChanges(f.table(), draft, context(f));
  assert.deepEqual(plan.problems, []);
  const trashDir = trashDirFor(path.join(f.root, 'trash'), 'Médias');
  applyOps(plan.ops, { trashDir });
  return { plan, trashDir };
}

const list = (dir: string) => (fs.existsSync(dir) ? fs.readdirSync(dir).sort() : []);
const read = (file: string) => fs.readFileSync(file, 'utf8');

/** État complet du bac à sable : chemins et contenus, pour vérifier que rien n'a bougé. */
function snapshot(dir: string): string[] {
  return fs
    .readdirSync(dir, { recursive: true, withFileTypes: true })
    .filter((d) => d.isFile())
    .map((d) => `${path.relative(dir, path.join(d.parentPath, d.name))}=${fs.readFileSync(path.join(d.parentPath, d.name), 'utf8')}`)
    .sort();
}

test('types gérés : ceux qui ont un écran ou le son, dans l’ordre du catalogue', () => {
  assert.deepEqual(MANAGED_MEDIA_TYPES, ['Wheel', 'Playfield', 'Backglass', 'DMD', 'FullDMD', 'Topper', 'Loading', 'Audio', 'AudioLaunch', 'GameInfo', 'GameHelp']);
});

// « Où » du gestionnaire et moments du catalogue écrits à deux endroits : ce test les garde
// d'accord (le fronton, l'afficheur et le topper oubliaient le mode attente et la partie).
test('où s’affiche chaque média : chaque moment du catalogue est dit en clair', () => {
  const said: Record<MediaMoment, RegExp> = {
    browse: /liste|tant que la table est choisie/,
    sheet: /fiche/,
    loading: /charge|lancement/,
    game: /en partie/,
    attract: /mode attente/,
  };
  for (const info of MEDIA_TYPES.filter((t) => t.target)) {
    const where = mediaPlacement(info.type).where;
    for (const moment of info.moments) assert.match(where, said[moment], `${info.type} : ${moment} absent de « ${where} »`);
  }
});

test('prendre un fichier du dossier d’import : renommé « (Type) <nom du dossier>.ext », extension en minuscules, déplacé', () => {
  const f = fixture();
  const logo = f.put(f.importDir, 'logo final.PNG', 'nouveau logo');
  const draft = emptyMediaDraft();
  draft.pages.Wheel = [{ from: logo, mode: 'move' }];
  const { plan } = apply(f, draft);
  assert.deepEqual(plan.steps.map((s) => s.kind), ['add']);
  assert.equal(plan.steps[0]!.text, `logo final.PNG → (Wheel) ${FOLDER}.png`);
  assert.equal(plan.steps[0]!.detail, 'déplacé depuis le dossier d’import');
  assert.deepEqual(list(f.medias), [`(Wheel) ${FOLDER}.png`]);
  assert.deepEqual(list(f.importDir), [], 'le fichier a quitté le dossier d’import');
  assert.equal(read(path.join(f.medias, `(Wheel) ${FOLDER}.png`)), 'nouveau logo');
  assert.equal(resolveMedia(f.table(), f.root, 'Wheel').source, 'folder-name');
});

test('choisi sur ce PC : copié, l’original reste en place', () => {
  const f = fixture();
  const pc = f.put(path.join(f.root, 'ailleurs'), 'fronton.mp4', 'vidéo');
  const draft = emptyMediaDraft();
  draft.pages.Backglass = [{ from: pc, mode: 'copy' }];
  const { plan } = apply(f, draft);
  assert.equal(plan.steps[0]!.detail, 'copié, l’original reste en place');
  assert.ok(fs.existsSync(pc));
  assert.equal(read(path.join(f.medias, `(Backglass) ${FOLDER}.mp4`)), 'vidéo');
});

test('remplacer : l’ancien et ses concurrents de ce type vont à la corbeille, rien d’autre', () => {
  const f = fixture();
  // Montré aujourd'hui : le nom du .vpx passe avant celui du dossier, la vidéo avant l'image.
  f.put(f.medias, `(Backglass) ${VPX}.mp4`, 'ancien vpx');
  f.put(f.medias, `(Backglass) ${FOLDER}.png`, 'ancien dossier');
  f.put(f.medias, 'bg.png', 'vpinfe');
  f.put(f.medias, `(Backglass) ${FOLDER}.flv`, 'illisible');
  f.put(f.medias, `(Wheel) ${FOLDER}.png`, 'logo à garder');
  f.put(f.medias, '(Backglass) Une autre table.png', 'autre jeu');
  assert.deepEqual(ownMediaPages(f.table(), f.root, 'Backglass').map((p) => path.basename(p)), [`(Backglass) ${VPX}.mp4`]);
  assert.equal(mediaCompetitors(f.table(), 'Backglass').length, 4);

  const webm = f.put(f.importDir, 'nouveau.webm', 'nouveau');
  const draft = emptyMediaDraft();
  draft.pages.Backglass = [{ from: webm, mode: 'move' }];
  const { plan, trashDir } = apply(f, draft);
  assert.equal(plan.steps.filter((s) => s.kind === 'trash').length, 4);
  assert.equal(plan.steps.find((s) => s.text.startsWith(`(Backglass) ${VPX}.mp4`))!.detail, 'montré aujourd’hui');
  assert.equal(plan.steps.find((s) => s.text.startsWith('bg.png'))!.detail, 'même type, au nom de ce jeu');
  assert.deepEqual(list(f.medias), [`(Backglass) ${FOLDER}.webm`, '(Backglass) Une autre table.png', `(Wheel) ${FOLDER}.png`]);
  assert.deepEqual(list(trashDir), [`(Backglass) ${VPX}.mp4`, `(Backglass) ${FOLDER}.flv`, `(Backglass) ${FOLDER}.png`, 'bg.png']);
  const r = resolveMedia(f.table(), f.root, 'Backglass');
  assert.equal(path.basename(r.file!), `(Backglass) ${FOLDER}.webm`);
});

test('supprimer : vers la corbeille, et le repli reprend la place', () => {
  const f = fixture();
  f.put(f.medias, `(Topper) ${FOLDER}.png`);
  const draft = emptyMediaDraft();
  draft.pages.Topper = [];
  const { trashDir } = apply(f, draft);
  assert.deepEqual(list(f.medias), []);
  assert.deepEqual(list(trashDir), [`(Topper) ${FOLDER}.png`]);
  const r = resolveMedia(f.table(), f.root, 'Topper');
  assert.equal(r.source, 'fallback');
  assert.deepEqual(mediaStateLabel(r), { label: 'Repli intégré', detail: 'Logo animé de Cyber Pinball avec le fabricant et l’année', present: false });
});

test('ordre des pages : renumérotées en deux temps, aucune n’en écrase une autre', () => {
  const f = fixture();
  f.put(f.medias, `(GameHelp) ${FOLDER}.png`, 'A');
  f.put(f.medias, `(GameHelp) ${FOLDER} 2.jpg`, 'B');
  f.put(f.medias, `(GameHelp) ${FOLDER} 3.png`, 'C');
  const pages = ownMediaPages(f.table(), f.root, 'GameHelp');
  assert.deepEqual(pages.map((p) => read(p)), ['A', 'B', 'C']);
  const draft = emptyMediaDraft();
  // C devient la première page : sa cible est occupée par A, qui devient la deuxième.
  draft.pages.GameHelp = [{ file: pages[2]! }, { file: pages[0]! }, { file: pages[1]! }];
  const { plan, trashDir } = apply(f, draft);
  assert.ok(plan.steps.every((s) => s.kind === 'rename'));
  assert.ok(plan.steps.some((s) => s.detail === 'la page 3 devient la page 1'));
  assert.deepEqual(list(trashDir), [], 'aucun fichier à la corbeille');
  assert.deepEqual(list(f.medias), [`(GameHelp) ${FOLDER} 2.png`, `(GameHelp) ${FOLDER} 3.jpg`, `(GameHelp) ${FOLDER}.png`]);
  assert.deepEqual(ownMediaPages(f.table(), f.root, 'GameHelp').map((p) => read(p)), ['C', 'A', 'B']);
});

test('pages : une page ajoutée prend la suite, une page retirée laisse les suivantes renumérotées', () => {
  const f = fixture();
  f.put(f.medias, `(GameInfo) ${FOLDER}.png`, 'A');
  f.put(f.medias, `(GameInfo) ${FOLDER} 2.png`, 'B');
  f.put(f.medias, `(GameInfo) ${FOLDER} 3.png`, 'C');
  const pages = ownMediaPages(f.table(), f.root, 'GameInfo');
  const extra = f.put(f.importDir, 'flyer verso.webp', 'D');
  const draft = emptyMediaDraft();
  draft.pages.GameInfo = [{ file: pages[0]! }, { file: pages[2]! }, { from: extra, mode: 'move' }];
  const { trashDir } = apply(f, draft);
  assert.deepEqual(list(trashDir), [`(GameInfo) ${FOLDER} 2.png`]);
  assert.deepEqual(ownMediaPages(f.table(), f.root, 'GameInfo').map((p) => `${path.basename(p)}=${read(p)}`), [
    `(GameInfo) ${FOLDER}.png=A`,
    `(GameInfo) ${FOLDER} 2.png=C`,
    `(GameInfo) ${FOLDER} 3.webp=D`,
  ]);
});

test('un fichier mal nommé déjà dans medias\\ : renommé, pas copié ni mis à la corbeille', () => {
  const f = fixture();
  const stray = f.put(f.medias, 'wheel-t2.png', 'logo');
  const draft = emptyMediaDraft();
  draft.pages.Wheel = [{ from: stray, mode: 'copy' }];
  const { plan, trashDir } = apply(f, draft);
  assert.deepEqual(plan.steps.map((s) => s.kind), ['rename']);
  assert.deepEqual(list(f.medias), [`(Wheel) ${FOLDER}.png`]);
  assert.deepEqual(list(trashDir), []);
});

test('rien n’est écrit avant validation : planifier ne touche à aucun fichier', () => {
  const f = fixture();
  f.put(f.medias, `(Wheel) ${FOLDER}.png`);
  f.put(f.medias, `(GameHelp) ${FOLDER}.png`, 'A');
  f.put(f.medias, `(GameHelp) ${FOLDER} 2.png`, 'B');
  const incoming = f.put(f.importDir, 'logo.png');
  const before = snapshot(f.root);
  const pages = ownMediaPages(f.table(), f.root, 'GameHelp');
  const draft: MediaDraft = { pages: { Wheel: [{ from: incoming, mode: 'move' }], GameHelp: [{ file: pages[1]! }, { file: pages[0]! }] }, halfTurn: { Playfield: true }, volume: 50 };
  const plan = planMediaChanges(f.table(), draft, context(f));
  assert.ok(plan.ops.length > 0);
  assert.deepEqual(snapshot(f.root), before);
});

test('brouillon identique à aujourd’hui : aucun changement, aucune opération', () => {
  const f = fixture();
  f.put(f.medias, `(GameHelp) ${VPX}.png`, 'A');
  f.put(f.medias, `(GameHelp) ${VPX} 2.png`, 'B');
  const pages = ownMediaPages(f.table(), f.root, 'GameHelp');
  const draft = emptyMediaDraft();
  draft.pages.GameHelp = pages.map((file) => ({ file }));
  draft.halfTurn.Playfield = false;
  draft.volume = 100;
  const plan = planMediaChanges(f.table(), draft, context(f));
  assert.deepEqual(plan.ops, []);
  assert.deepEqual(plan.steps, []);
  const current = (type: MediaType) => ownMediaPages(f.table(), f.root, type);
  assert.equal(draftChangeCount(draft, current, mediaMemory(f.table().info)), 0);
  draft.volume = 80;
  assert.equal(draftChangeCount(draft, current, mediaMemory(f.table().info)), 1);
});

test('.info : demi-tour et volume écrits sous CyberPinball.medias, les autres champs conservés, l’ancien à la corbeille', () => {
  const f = fixture();
  const draft = emptyMediaDraft();
  draft.halfTurn.Playfield = true;
  draft.volume = 75;
  const { plan, trashDir } = apply(f, draft);
  assert.deepEqual(plan.steps.map((s) => [s.type, s.text]), [['Playfield', 'Demi-tour ajouté'], [undefined, 'Volume de ce jeu : 100 % → 75 %']]);
  assert.equal(plan.infoFile, path.join(f.folder, `${FOLDER}.info`));
  const info = readInfo(path.join(f.folder, `${FOLDER}.info`));
  assert.deepEqual(info.Info, { Title: 'Terminator 2', Manufacturer: 'Williams', Year: 1991 });
  assert.equal(info.User?.StartCount, 7);
  assert.deepEqual((info as Record<string, unknown>).Autre, { garde: true });
  assert.deepEqual(mediaMemory(info), { halfTurn: { Playfield: true }, volume: 75 });
  assert.deepEqual(list(trashDir), [`${FOLDER}.info`]);
  // Le menu tourne le plateau d'un demi-tour de plus.
  f.put(f.medias, `(Playfield) ${FOLDER}.png`);
  assert.equal(resolveMedia(f.table(), f.root, 'Playfield').rotation, 180);

  // Retour aux valeurs par défaut : les champs disparaissent.
  const back = emptyMediaDraft();
  back.halfTurn.Playfield = false;
  back.volume = 100;
  apply(f, back);
  assert.deepEqual(mediaMemory(readInfo(path.join(f.folder, `${FOLDER}.info`))), {});
});

test('mémoire : les autres champs de CyberPinball.medias (sources des téléchargements) sont gardés', () => {
  assert.deepEqual(nextMemory({ sources: { Wheel: { origin: 'VPinMediaDB', url: 'https://github.com/superhac/vpinmediadb/raw/refs/heads/main/BunvWvh9/wheel.png', date: '2026-10-21T12:00:00.000Z' } }, halfTurn: { Loading: true } }, { pages: {}, halfTurn: { Loading: false, Playfield: true } }), {
    sources: { Wheel: { origin: 'VPinMediaDB', url: 'https://github.com/superhac/vpinmediadb/raw/refs/heads/main/BunvWvh9/wheel.png', date: '2026-10-21T12:00:00.000Z' } },
    halfTurn: { Playfield: true },
  });
});

test('plan refusé : format que le menu ne lit pas pour ce type, fichier disparu, plusieurs fichiers pour un type à page unique', () => {
  const f = fixture();
  const draft = emptyMediaDraft();
  draft.pages.Wheel = [{ from: f.put(f.importDir, 'logo.mp4'), mode: 'move' }];
  draft.pages.Backglass = [{ from: path.join(f.importDir, 'disparu.png'), mode: 'move' }];
  draft.pages.Topper = [{ from: f.put(f.importDir, 'a.png'), mode: 'move' }, { from: f.put(f.importDir, 'b.png'), mode: 'move' }];
  const plan = planMediaChanges(f.table(), draft, context(f));
  assert.equal(plan.problems.length, 3);
  assert.match(plan.problems[0]!, /logo\.mp4 : format \.mp4 non lu pour Logo/);
  assert.match(plan.problems[1]!, /disparu\.png a disparu/);
  assert.match(plan.problems[2]!, /Topper : une seule image ou vidéo possible/);
});

test('plusieurs versions dans le dossier : écrit au nom du dossier, il sert aux deux ; le nom propre d’une version reste à l’autre', () => {
  const f = fixture();
  const other = 'Terminator 2 (Williams 1991) VPW 1.0';
  fs.writeFileSync(path.join(f.folder, `${other}.vpx`), '');
  f.put(f.medias, `(Wheel) ${other}.png`, 'logo propre à VPW');
  f.put(f.medias, `(Wheel) ${VPX}.png`, 'logo propre à g5k');
  const versions = scanTables(f.tables);
  const g5k = versions.find((e) => e.file.endsWith('g5k 1.25.vpx'))!;
  const vpw = versions.find((e) => e.file.endsWith('VPW 1.0.vpx'))!;
  const draft = emptyMediaDraft();
  draft.pages.Wheel = [{ from: f.put(f.importDir, 'logo.png', 'commun'), mode: 'copy' }];
  const plan = planMediaChanges(g5k, draft, { infoFile: infoFileFor(g5k, f.tables), root: f.root });
  applyOps(plan.ops, { trashDir: path.join(f.root, 'trash', 'x') });
  assert.deepEqual(list(f.medias), [`(Wheel) ${other}.png`, `(Wheel) ${FOLDER}.png`]);
  assert.equal(read(resolveMedia(g5k, f.root, 'Wheel').file!), 'commun');
  assert.equal(read(resolveMedia(vpw, f.root, 'Wheel').file!), 'logo propre à VPW');
});

test('type deviné au dépôt : « (Type) », noms de VPinFE, dossiers de Popper et de PinballX ; format refusé', () => {
  assert.equal(guessMediaType('C:\\x\\(Wheel) n’importe quoi.png'), 'Wheel');
  assert.equal(guessMediaType('C:\\x\\bg.mp4'), 'Backglass');
  assert.equal(guessMediaType('C:\\POPMedia\\Visual Pinball X\\Wheel\\T2.png'), 'Wheel');
  assert.equal(guessMediaType('C:\\PinballX\\Media\\Visual Pinball\\Backglass Images\\T2.jpg'), 'Backglass');
  assert.equal(guessMediaType('C:\\x\\(Wheel) T2.mp4'), undefined, 'un logo ne peut pas être une vidéo');
  assert.equal(guessMediaType('C:\\x\\photo.png'), undefined);
});

function screen(fingerprint: string, widthPx: number, heightPx: number): PhysicalScreen {
  return { fingerprint, strength: 'strong', label: fingerprint, widthPx, heightPx, widthCm: 0, heightCm: 0 };
}

test('où s’affiche le média : écran et moment, et s’il apparaît sur cette borne', () => {
  const cabinet: Cabinet = {
    version: 1,
    screens: [screen('pf', 3840, 2160), screen('bg', 1920, 1080), screen('dmd', 1280, 320)],
    roles: { playfield: 'pf', backglass: 'bg', dmd: 'dmd' },
    vpx: { iniPath: '' },
    updatedAt: '',
  };
  for (const type of MANAGED_MEDIA_TYPES) assert.ok(mediaPlacement(type).where.length > 20, type);
  assert.deepEqual(mediaPlacement('Wheel', cabinet), { where: 'Écran du plateau, dans la liste des tables, et en mode attente', shown: true });
  assert.equal(mediaPlacement('DMD', cabinet).shown, true);
  const full = mediaPlacement('FullDMD', cabinet);
  assert.equal(full.shown, false);
  assert.match(full.note!, /étroit \(4:1\)/);
  const topper = mediaPlacement('Topper', cabinet);
  assert.equal(topper.shown, false);
  assert.match(topper.note!, /pas d’écran topper/);
  // Sans modèle de borne : on ne sait pas, on suppose que oui.
  assert.equal(mediaPlacement('Topper').shown, true);
});

test('état : présent, ou le repli utilisé et lequel', () => {
  const f = fixture();
  f.put(f.medias, `(FullDMD) ${FOLDER}.png`);
  f.put(path.join(f.root, 'media'), '(Topper).png');
  const t = f.table();
  assert.deepEqual(mediaStateLabel(resolveMedia(t, f.root, 'FullDMD')), { label: 'Présent', detail: `(FullDMD) ${FOLDER}.png`, present: true });
  assert.deepEqual(mediaStateLabel(resolveMedia(t, f.root, 'DMD')), { label: 'Repli : Afficheur large', detail: `(FullDMD) ${FOLDER}.png, adapté à cet écran`, present: false });
  assert.deepEqual(ownMediaPages(t, f.root, 'DMD'), [], 'le FullDMD n’est pas le fichier propre du DMD');
  assert.deepEqual(mediaStateLabel(resolveMedia(t, f.root, 'Topper'), f.root), { label: 'Repli : défaut de la borne', detail: path.join('media', '(Topper).png'), present: false });
  const b2s = f.put(path.join(f.root, 'data', 'cache'), 'bg.png');
  assert.equal(mediaStateLabel(resolveMedia(t, f.root, 'Backglass', { b2sImage: () => b2s })).label, 'Repli : image du .directb2s');
  assert.equal(mediaStateLabel(resolveMedia(t, f.root, 'AudioLaunch')).label, 'Absent');
});
