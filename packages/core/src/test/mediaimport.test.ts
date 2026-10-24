import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  copyPlannedMedias,
  installedTables,
  matchMediaGame,
  mediaFolder,
  mediaGameNames,
  mediaSubFolder,
  planInstallationMedias,
  recognizeMedia,
  scanInstallation,
} from '../mediaimport';
import { resolveMedia } from '../medias';
import { applyImport, planImport } from '../tableimport';
import { scanTables } from '../tables';
import { createVpsDb } from '../vps';

function tmpRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-mediaimport-'));
  fs.mkdirSync(path.join(root, 'tables'));
  return root;
}

function write(file: string, content = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
  return file;
}

const slash = (p: string) => p.split(path.sep).join('/');
const T2 = 'Terminator 2 (Williams 1991)';

test('dossiers de médias : Popper sous POPMedia ou reconnaissable, PinballX, medias\\ de VPinFE', () => {
  assert.deepEqual(mediaFolder('Wheel'), { kind: 'type', frontend: 'popper', type: 'Wheel', emulator: undefined, order: 0 });
  assert.deepEqual(mediaFolder('Menu', ['PinUPSystem', 'POPMedia', 'Visual Pinball X']), {
    kind: 'type',
    frontend: 'popper',
    type: 'FullDMD',
    emulator: 'Visual Pinball X',
    order: 0,
  });
  // « DMD » seul dans une archive : plus souvent un dossier FlexDMD. À côté de « Wheel », c'est Popper.
  assert.equal(mediaFolder('DMD', ['Pack']), undefined);
  assert.equal(mediaFolder('Audio', ['Pack'], ['Audio', 'Scripts']), undefined);
  assert.equal((mediaFolder('DMD', ['Pack'], ['DMD', 'Wheel']) as { type: string }).type, 'DMD');
  assert.deepEqual(mediaFolder('Table Videos', ['PinballX', 'Media', 'Visual Pinball']), {
    kind: 'type',
    frontend: 'pinballx',
    type: 'Playfield',
    emulator: 'Visual Pinball',
    order: 0,
  });
  assert.deepEqual(mediaFolder('medias', ['tables', T2]), { kind: 'medias', owner: T2 });
  assert.equal(mediaFolder('Scripts'), undefined);

  // Prospectus de PinballX : Front, Back, Inside1… donnent l'ordre des pages.
  const flyers = mediaFolder('Flyer Images', ['PinballX', 'Media'])!;
  assert.equal((mediaSubFolder(flyers, 'Front') as { order: number }).order, 0);
  assert.equal((mediaSubFolder(flyers, 'Back') as { order: number }).order, 1);
  assert.equal((mediaSubFolder(flyers, 'Inside2') as { order: number }).order, 3);
  assert.equal(mediaSubFolder(flyers, 'Divers'), undefined);
  assert.equal(mediaSubFolder(mediaFolder('Wheel')!, 'Front'), undefined);
});

test('médias reconnus : nom du jeu, « (Type) » partout, noms fixes de VPinFE, autres émulateurs', () => {
  const wheel = mediaFolder('Wheel', ['POPMedia', 'Visual Pinball X'])!;
  assert.deepEqual(recognizeMedia(`${T2}.png`, wheel), { type: 'Wheel', frontend: 'popper', game: T2, ext: 'png', order: 0, emulator: 'Visual Pinball X', foreign: false });
  assert.equal(recognizeMedia('readme.txt', wheel), undefined);
  assert.equal(recognizeMedia('Thumbs.db', wheel), undefined);
  assert.equal(recognizeMedia(`${T2}.flv`, mediaFolder('PlayField', ['POPMedia', 'Visual Pinball X']))?.ext, 'flv');
  assert.equal(recognizeMedia(`${T2}.png`, mediaFolder('Wheel', ['POPMedia', 'Future Pinball']))?.foreign, true);
  assert.equal(recognizeMedia(`${T2}.png`, mediaFolder('Wheel Images', ['Media', 'Visual Pinball']))?.foreign, false);

  assert.deepEqual(recognizeMedia('(GameHelp) T2 2.png'), { type: 'GameHelp', frontend: 'vpx', game: 'T2 2', ext: 'png', order: 0, foreign: false });
  assert.equal(recognizeMedia('(Inconnu) T2.png'), undefined);
  const medias = mediaFolder('medias', [T2])!;
  assert.deepEqual(recognizeMedia('dmd.png', medias), { type: 'FullDMD', frontend: 'vpinfe', game: T2, ext: 'png', order: 0, foreign: false });
  assert.equal(recognizeMedia('bg.png'), undefined, 'un nom de VPinFE hors de medias\\ ne dit rien');
  assert.equal(recognizeMedia('photo.png', medias), undefined);
});

test('nom du jeu sans numéro de page : Popper (Elvis01), VPX (« … 2 »), chiffres du titre gardés', () => {
  assert.deepEqual(mediaGameNames('Elvis01'), ['Elvis01', 'Elvis']);
  assert.deepEqual(mediaGameNames(`${T2} 2`), [`${T2} 2`, T2]);
  assert.deepEqual(mediaGameNames('Apollo 13'), ['Apollo 13']);
  assert.deepEqual(mediaGameNames('Terminator 2'), ['Terminator 2']);
  assert.deepEqual(mediaGameNames(undefined), []);
});

test('archive rangée à la Popper : médias renommés « (Type) <dossier> », format illisible signalé et laissé', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const staging = path.join(root, 'staging', 'T2');
  write(path.join(staging, `${T2}.vpx`));
  const pop = path.join(staging, 'PinUPSystem', 'POPMedia', 'Visual Pinball X');
  write(path.join(pop, 'Wheel', `${T2}.png`));
  write(path.join(pop, 'Backglass', `${T2}.mp4`));
  write(path.join(pop, 'DMD', `${T2}.mp4`));
  write(path.join(pop, 'Menu', `${T2}.mp4`));
  write(path.join(pop, 'Topper', `${T2}.mp4`));
  write(path.join(pop, 'PlayField', `${T2}.f4v`));
  write(path.join(pop, 'Loading', `${T2}.mp4`));
  write(path.join(pop, 'Audio', `${T2}.mp3`));
  write(path.join(pop, 'AudioLaunch', `${T2}.mp3`));
  write(path.join(pop, 'GameInfo', `${T2}.png`));
  write(path.join(pop, 'GameHelp', `${T2}.png`));
  write(path.join(pop, 'GameHelp', `${T2}01.png`));
  write(path.join(pop, 'GameHelp', `${T2}02.mp4`));
  write(path.join(pop, 'Wheel', 'notes.txt'));

  const plan = planImport([{ path: staging, label: 'T2.zip', mode: 'move', unpacked: true }], { tablesDir });
  assert.equal(plan.tables.length, 1);
  const t = plan.tables[0]!;
  assert.equal(t.folderName, T2);
  const medias = t.steps.filter((s) => s.media).map((s) => slash(s.target));
  assert.deepEqual(medias, [
    `medias/(Wheel) ${T2}.png`,
    `medias/(Backglass) ${T2}.mp4`,
    `medias/(DMD) ${T2}.mp4`,
    `medias/(FullDMD) ${T2}.mp4`,
    `medias/(Topper) ${T2}.mp4`,
    `medias/(Loading) ${T2}.mp4`,
    `medias/(Audio) ${T2}.mp3`,
    `medias/(AudioLaunch) ${T2}.mp3`,
    `medias/(GameInfo) ${T2}.png`,
    `medias/(GameHelp) ${T2}.png`,
    `medias/(GameHelp) ${T2} 2.png`,
    `medias/(GameHelp) ${T2} 3.mp4`,
  ]);
  assert.ok(t.steps.filter((s) => s.media).every((s) => s.kind === 'media' && s.renamed && !s.replaces));
  // Le flv/f4v est dans le plan, mais n'est pas rangé.
  assert.ok(t.warnings.some((w) => w.includes(`${T2}.f4v`) && w.includes('le menu ne sait pas le lire')), t.warnings.join('\n'));
  assert.ok(!t.steps.some((s) => s.from.endsWith('.f4v')));
  // Ce qui n'est pas un média garde sa place habituelle.
  assert.ok(t.steps.some((s) => s.from.endsWith('notes.txt') && s.kind === 'doc'));

  applyImport(t, { trashDir: path.join(root, 'trash', 'i'), cleanupRoots: [path.join(root, 'staging')] });
  const folder = path.join(tablesDir, T2);
  assert.ok(fs.existsSync(path.join(folder, 'medias', `(Wheel) ${T2}.png`)));
  assert.ok(fs.existsSync(path.join(pop, 'PlayField', `${T2}.f4v`)), 'le format illisible reste où il est');

  // Ce que la résolution (T1) trouve ensuite : les noms écrits sont bien ceux qu'elle cherche.
  const [entry] = scanTables(tablesDir);
  assert.equal(resolveMedia(entry!, root, 'Wheel').source, 'vpx-name');
  assert.deepEqual(resolveMedia(entry!, root, 'GameHelp').files.map((f) => path.basename(f)), [`(GameHelp) ${T2}.png`, `(GameHelp) ${T2} 2.png`, `(GameHelp) ${T2} 3.mp4`]);
  fs.rmSync(root, { recursive: true });
});

test('archive rangée à la PinballX : vidéo préférée à l’image, prospectus Front puis Back, autre émulateur écarté', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const staging = path.join(root, 'staging', 'MM');
  const game = 'Medieval Madness (Williams 1997)';
  write(path.join(staging, `${game}.vpx`));
  const media = path.join(staging, 'PinballX', 'Media');
  write(path.join(media, 'Visual Pinball', 'Wheel Images', `${game}.png`));
  write(path.join(media, 'Visual Pinball', 'Table Videos', `${game}.mp4`));
  write(path.join(media, 'Visual Pinball', 'Table Images', `${game}.png`));
  write(path.join(media, 'Visual Pinball', 'Backglass Images', `${game}.jpg`));
  write(path.join(media, 'Visual Pinball', 'Launch Audio', `${game}.mp3`));
  write(path.join(media, 'Visual Pinball', 'Real DMD Color Images', `${game}.png`));
  write(path.join(media, 'Flyer Images', 'Back', `${game}.png`));
  write(path.join(media, 'Flyer Images', 'Front', `${game}.jpg`));
  write(path.join(media, 'Future Pinball', 'Wheel Images', `${game}.png`));

  const plan = planImport([{ path: staging, label: 'MM.zip', mode: 'copy', unpacked: true }], { tablesDir });
  const t = plan.tables[0]!;
  assert.deepEqual(
    t.steps.filter((s) => s.media).map((s) => [slash(s.target), slash(path.relative(media, s.from))]),
    [
      [`medias/(Wheel) ${game}.png`, `Visual Pinball/Wheel Images/${game}.png`],
      [`medias/(Playfield) ${game}.mp4`, `Visual Pinball/Table Videos/${game}.mp4`],
      [`medias/(Backglass) ${game}.jpg`, `Visual Pinball/Backglass Images/${game}.jpg`],
      [`medias/(AudioLaunch) ${game}.mp3`, `Visual Pinball/Launch Audio/${game}.mp3`],
      [`medias/(GameInfo) ${game}.jpg`, `Flyer Images/Front/${game}.jpg`],
      [`medias/(GameInfo) ${game} 2.png`, `Flyer Images/Back/${game}.png`],
      [`medias/(RealColorDMD) ${game}.png`, `Visual Pinball/Real DMD Color Images/${game}.png`],
    ],
  );
  assert.ok(t.warnings.some((w) => w.includes('Table Images') && w.includes('Doublon')), t.warnings.join('\n'));
  assert.ok(t.warnings.some((w) => w.includes('Future Pinball') && w.includes('autre émulateur')), t.warnings.join('\n'));
  fs.rmSync(root, { recursive: true });
});

test('dossier de VPinFE et noms « (Type) » d’un autre nom : renommés au nom du dossier', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const src = path.join(root, 'import', T2);
  write(path.join(src, 'T2_v1.2.vpx'));
  write(path.join(src, 'medias', 'bg.png'));
  write(path.join(src, 'medias', 'wheel.png'));
  write(path.join(src, 'medias', 'table.mp4'));
  write(path.join(src, 'medias', 'dmd.png'));
  write(path.join(src, 'medias', '(Topper) T2.mp4'));
  write(path.join(src, 'medias', 'fond.png'));

  const plan = planImport([{ path: src, mode: 'copy' }], { tablesDir });
  const t = plan.tables[0]!;
  assert.equal(t.folderName, T2);
  assert.deepEqual(
    t.steps.filter((s) => s.kind === 'media').map((s) => [path.basename(s.from), slash(s.target)]),
    [
      // Fichier sans type reconnu : rangé tel quel, comme avant.
      ['fond.png', 'medias/fond.png'],
      ['wheel.png', `medias/(Wheel) ${T2}.png`],
      ['table.mp4', `medias/(Playfield) ${T2}.mp4`],
      ['bg.png', `medias/(Backglass) ${T2}.png`],
      ['dmd.png', `medias/(FullDMD) ${T2}.png`],
      ['(Topper) T2.mp4', `medias/(Topper) ${T2}.mp4`],
    ],
  );
  fs.rmSync(root, { recursive: true });
});

test('sélection de plusieurs tables : chaque média à son jeu (nom, ROM, titre, VPS), les inconnus restent', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const importDir = path.join(root, 'import');
  const afm = 'Attack from Mars (Bally 1995)';
  // Table installée avec son jeu VPS dans le .info.
  const jp = path.join(tablesDir, 'JP (DE 1993)');
  write(path.join(jp, 'JP.vpx'));
  const files = [write(path.join(importDir, `${T2}.vpx`)), write(path.join(importDir, `${afm}.vpx`))];
  const pop = path.join(importDir, 'POPMedia', 'Visual Pinball X');
  write(path.join(pop, 'Wheel', `${T2}.png`));
  write(path.join(pop, 'Wheel', 'Attack From Mars.png'));
  write(path.join(pop, 'Wheel', 'afm_113b.png'));
  write(path.join(pop, 'Backglass', 'Jurassic Park (Data East 1993).mp4'));
  write(path.join(pop, 'Wheel', 'Twilight Zone (Bally 1993).png'));
  const vps = createVpsDb([{ id: 'i47o-Nvr', name: 'Jurassic Park', manufacturer: 'Data East', year: 1993 }]);

  const plan = planImport([...files, path.join(importDir, 'POPMedia')].map((p) => ({ path: p, mode: 'copy' as const })), {
    tablesDir,
    existing: [{ folder: jp, title: 'JP', roms: [], vpsId: 'i47o-Nvr' }],
    scripts: new Map([[files[1]!.toLowerCase(), { usesPinmame: true, roms: ['afm_113b'] }]]),
    vps,
  });
  const mediaOf = (folder: string) =>
    plan.tables.find((t) => t.folderName === folder)?.steps.filter((s) => s.media).map((s) => [path.basename(s.from), slash(s.target)]);
  assert.deepEqual(mediaOf(T2), [[`${T2}.png`, `medias/(Wheel) ${T2}.png`]]);
  // Deux logos pour AFM (titre et ROM) : un seul gardé, l'autre signalé.
  assert.equal(mediaOf(afm)!.length, 1);
  assert.ok(plan.tables.find((t) => t.folderName === afm)!.warnings.some((w) => w.includes('Doublon')));
  // Table installée sous un nom abrégé : son jeu VPS (.info) la désigne.
  assert.deepEqual(mediaOf('JP (DE 1993)'), [['Jurassic Park (Data East 1993).mp4', 'medias/(Backglass) JP (DE 1993).mp4']]);
  assert.ok(plan.leftovers.some((l) => l.source.endsWith('Twilight Zone (Bally 1993).png')));
  fs.rmSync(root, { recursive: true });
});

test('média qui remplace : l’ancien du même type part à la corbeille, même avec une autre extension', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const folder = path.join(tablesDir, T2);
  write(path.join(folder, `${T2}.vpx`));
  write(path.join(folder, 'medias', `(Backglass) ${T2}.png`), 'ancien');
  write(path.join(folder, 'medias', `(Wheel) ${T2}.png`), 'logo gardé');
  const src = write(path.join(root, 'import', 'POPMedia', 'Visual Pinball X', 'Backglass', `${T2}.mp4`), 'nouveau');

  const plan = planImport([{ path: path.join(root, 'import', 'POPMedia'), mode: 'move' }], {
    tablesDir,
    existing: [{ folder, title: 'Terminator 2', roms: [] }],
  });
  const t = plan.tables[0]!;
  assert.equal(t.isNew, false);
  const step = t.steps.find((s) => s.media)!;
  assert.equal(slash(step.target), `medias/(Backglass) ${T2}.mp4`);
  assert.equal(step.replaces, true);
  assert.deepEqual(step.media!.trash, [path.join(folder, 'medias', `(Backglass) ${T2}.png`)]);

  const trashDir = path.join(root, 'trash', 'i');
  applyImport(t, { trashDir, cleanupRoots: [path.join(root, 'import')] });
  assert.equal(fs.readFileSync(path.join(folder, 'medias', `(Backglass) ${T2}.mp4`), 'utf8'), 'nouveau');
  assert.ok(!fs.existsSync(path.join(folder, 'medias', `(Backglass) ${T2}.png`)));
  assert.equal(fs.readFileSync(path.join(trashDir, `(Backglass) ${T2}.png`), 'utf8'), 'ancien');
  assert.ok(fs.existsSync(path.join(folder, 'medias', `(Wheel) ${T2}.png`)));
  assert.ok(!fs.existsSync(src));
  fs.rmSync(root, { recursive: true });
});

test('un dossier DMD que charge le script reste un dossier DMD, même à côté de « Wheel »', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const staging = path.join(root, 'staging', 'G');
  const vpx = write(path.join(staging, 'The Goonies (VPW 2021).vpx'));
  write(path.join(staging, 'DMD', 'intro.png'));
  write(path.join(staging, 'Wheel', 'The Goonies (VPW 2021).png'));
  const plan = planImport([{ path: staging, label: 'G.zip', mode: 'copy', unpacked: true }], {
    tablesDir,
    scripts: new Map([[vpx.toLowerCase(), { usesPinmame: false, roms: [], dmdFolder: 'DMD' }]]),
  });
  const targets = plan.tables[0]!.steps.map((s) => [s.kind, slash(s.target)]);
  assert.ok(targets.some(([k, t]) => k === 'dmdFolder' && t === 'DMD'), JSON.stringify(targets));
  assert.ok(targets.some(([k, t]) => k === 'media' && t === 'medias/(Wheel) The Goonies (VPW 2021).png'), JSON.stringify(targets));
  fs.rmSync(root, { recursive: true });
});

test('reprise d’une installation de Popper : rapprochement table par table, copie sans toucher à l’origine', async () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  const afm = 'Attack from Mars (Bally 1995)';
  write(path.join(tablesDir, T2, `${T2}.vpx`));
  write(path.join(tablesDir, T2, 'medias', `(Wheel) ${T2}.apng`), 'ancien logo');
  write(path.join(tablesDir, afm, 'AFM_VPW_2.0.vpx'));
  write(path.join(tablesDir, 'Jurassic Park (Data East 1993)', 'JP.vpx'));
  write(path.join(tablesDir, 'Jurassic Park (Data East 1993)', 'Jurassic Park (Data East 1993).info'), JSON.stringify({ Info: { Title: 'Jurassic Park', VPSId: 'i47o-Nvr' } }));
  write(path.join(tablesDir, 'Loose.vpx'));

  const pinup = path.join(root, 'vPinball', 'PinUPSystem');
  const vpx = path.join(pinup, 'POPMedia', 'Visual Pinball X');
  write(path.join(vpx, 'Wheel', `${T2}.png`), 'logo');
  write(path.join(vpx, 'Backglass', `${T2}.mp4`));
  write(path.join(vpx, 'PlayField', `${T2}.flv`));
  write(path.join(vpx, 'Wheel', 'AFM_VPW_2.0.png'));
  write(path.join(vpx, 'Wheel', 'Attack from Mars (Bally 1995)01.png'));
  write(path.join(vpx, 'GameHelp', 'Jurassic Park (DE 93).png'));
  write(path.join(vpx, 'Wheel', 'Loose.png'));
  write(path.join(vpx, 'Wheel', 'Funhouse (Williams 1990).png'));
  write(path.join(vpx, 'System', 'Backglass.mp4'));
  write(path.join(pinup, 'POPMedia', 'Future Pinball', 'Wheel', `${T2}.png`));
  write(path.join(pinup, 'POPMedia', 'Default', 'System', 'Loading.mp4'));
  // Un PuP-Pack a lui aussi des dossiers « Backglass » : jamais parcouru.
  write(path.join(pinup, 'PUPVideos', 't2_l8', 'Backglass', 'intro.mp4'));

  const scan = scanInstallation(pinup);
  assert.deepEqual(scan.frontends, ['popper']);
  assert.ok(!scan.files.some((f) => f.source.includes('PUPVideos') || f.source.includes('System')));
  assert.deepEqual(scan.ignored.map((i) => [i.source, i.count]), [['Future Pinball', 1]]);

  const vps = createVpsDb([{ id: 'i47o-Nvr', name: 'Jurassic Park', manufacturer: 'Data East', year: 1993 }]);
  const tables = installedTables(scanTables(tablesDir));
  const plan = planInstallationMedias(scan, tables, { vps });
  const summary = Object.fromEntries(plan.tables.map((t) => [t.table.dest.name, [t.how.join('+'), t.planned.map((m) => m.target)]]));
  assert.deepEqual(summary, {
    [afm]: ['name', [`(Wheel) ${afm}.png`]],
    'Jurassic Park (Data East 1993)': ['vps', ['(GameHelp) Jurassic Park (Data East 1993).png']],
    Loose: ['name', ['(Wheel) Loose.png']],
    [T2]: ['name', [`(Wheel) ${T2}.png`, `(Backglass) ${T2}.mp4`]],
  });
  const t2 = plan.tables.find((t) => t.table.dest.name === T2)!;
  assert.ok(t2.skipped.some((s) => s.unreadable && s.source.endsWith('.flv')));
  assert.deepEqual(t2.planned[0]!.trash, [path.join(tablesDir, T2, 'medias', `(Wheel) ${T2}.apng`)]);
  assert.ok(plan.tables.find((t) => t.table.dest.name === afm)!.skipped.some((s) => s.reason.startsWith('Doublon')));
  assert.deepEqual(plan.unmatched.map((u) => u.game), ['Funhouse (Williams 1990)']);
  // Table en vrac à la racine des tables : ses médias vont dans tables\medias.
  assert.equal(plan.tables.find((t) => t.table.dest.name === 'Loose')!.planned[0]!.to, path.join(tablesDir, 'medias', '(Wheel) Loose.png'));

  const trashDir = path.join(root, 'trash', 'r');
  await copyPlannedMedias(plan.tables.flatMap((t) => t.planned), { trashDir });
  assert.equal(fs.readFileSync(path.join(tablesDir, T2, 'medias', `(Wheel) ${T2}.png`), 'utf8'), 'logo');
  assert.ok(fs.existsSync(path.join(vpx, 'Wheel', `${T2}.png`)), 'l’original reste dans Popper');
  assert.equal(fs.readFileSync(path.join(trashDir, `(Wheel) ${T2}.apng`), 'utf8'), 'ancien logo');
  assert.ok(!fs.existsSync(path.join(tablesDir, T2, 'medias', `(PlayField) ${T2}.flv`)));
  fs.rmSync(root, { recursive: true });
});

test('reprise d’une installation de PinballX, et nom ambigu jamais deviné', () => {
  const root = tmpRoot();
  const tablesDir = path.join(root, 'tables');
  write(path.join(tablesDir, 'Fathom (Bally 1981)', 'Fathom (Bally 1981).vpx'));
  write(path.join(tablesDir, 'Fathom (Bally 1981) LED', 'Fathom LED.vpx'));
  write(path.join(tablesDir, 'Gorgar (Williams 1979)', 'Gorgar (Williams 1979).vpx'));
  const pbx = path.join(root, 'PinballX');
  write(path.join(pbx, 'Media', 'Visual Pinball', 'Wheel Images', 'Fathom.png'));
  write(path.join(pbx, 'Media', 'Visual Pinball', 'Table Videos', 'Gorgar (Williams 1979).mp4'));
  write(path.join(pbx, 'Media', 'Visual Pinball', 'Table Videos', 'Gorgar (Williams 1979).avi'));
  write(path.join(pbx, 'Media', 'Flyer Images', 'Front', 'Gorgar (Williams 1979).jpg'));
  write(path.join(pbx, 'Media', 'Flyer Images', 'Inside1', 'Gorgar (Williams 1979).jpg'));

  const scan = scanInstallation(pbx);
  assert.deepEqual(scan.frontends, ['pinballx']);
  const tables = installedTables(scanTables(tablesDir));
  const fathom = matchMediaGame('Fathom', tables);
  assert.ok(fathom && 'ambiguous' in fathom && fathom.ambiguous.length === 2);
  const plan = planInstallationMedias(scan, tables);
  assert.deepEqual(plan.tables.map((t) => [t.table.dest.name, t.planned.map((m) => m.target)]), [
    ['Gorgar (Williams 1979)', ['(Playfield) Gorgar (Williams 1979).mp4', '(GameInfo) Gorgar (Williams 1979).jpg', '(GameInfo) Gorgar (Williams 1979) 2.jpg']],
  ]);
  assert.ok(plan.tables[0]!.skipped.some((s) => s.unreadable && s.source.endsWith('.avi')));
  assert.equal(plan.unmatched.length, 1);
  assert.match(plan.unmatched[0]!.reason, /Plusieurs tables possibles/);
  assert.equal(plan.count, 3);
  fs.rmSync(root, { recursive: true });
});
