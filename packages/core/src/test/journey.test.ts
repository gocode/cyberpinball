// Parcours « Ce qu'il manque pour jouer » : plan calculé sans réseau, d'une table à qui
// il manque sa ROM jusqu'à « Jouer », sur de vraies tables piégées analysées par le
// médecin, une base VPS de quelques jeux et la liste d'attente.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { addToWaitList, markReceived, type CabinetScreens, type WaitList } from '../acquisition';
import { diagnose, scriptFacts, type ScriptFacts } from '../doctor';
import {
  forgetJourney,
  journeyChoices,
  journeyPosition,
  journeyRecord,
  journeySummary,
  loadJourneys,
  planJourney,
  rememberJourney,
  romSources,
  saveJourneys,
  type Journey,
  type JourneyInput,
} from '../journey';
import { scanTables } from '../tables';
import { createVpsDb, type VpsGame } from '../vps';

const TABLE = 'Terminator 2 (Williams 1991)';
const SCRIPT = 'Const cGameName="t2_l8"\r\nLoadVPM "01560000", "WPC.VBS", 3.26\r\nController.GameName = cGameName\r\n';
const SCREENS: CabinetScreens = { backglass: true, dmd: 'small', topper: false };
const vpf = (n: number) => ({ url: `https://www.vpforums.org/index.php?app=downloads&showfile=${n}` });
const vpu = (n: number) => ({ url: `https://vpuniverse.com/files/file/${n}-fichier/` });

const T2: VpsGame = {
  id: 'BunvWvh9',
  name: 'Terminator 2 - Judgment Day',
  manufacturer: 'Williams',
  year: 1991,
  type: 'SS',
  romFiles: [
    { version: 't2_l6', urls: [vpf(7300)], updatedAt: 50 },
    { version: 't2_l8', urls: [vpf(7318)], updatedAt: 100 },
    { version: 't2_l8', urls: [{ url: 'https://example.com/mort', broken: true }] },
  ],
  tableFiles: [{ id: 't200', tableFormat: 'VPX', authors: ['G5k', 'VPW'], version: '1.25', updatedAt: 2000, urls: [vpu(200)] }],
  b2sFiles: [{ id: 'b2', authors: ['HauntFreaks'], features: ['3Screens'], updatedAt: 100, urls: [vpu(77)] }],
};
/** Un autre jeu qui a, lui aussi, une ROM du même nom (copie de la base) : le jeu de la table passe d'abord. */
const COPY: VpsGame = { id: 'autre', name: 'Terminator 2 (copie)', romFiles: [{ version: 't2_l8', urls: [vpf(9999)], updatedAt: 500 }] };

function write(file: string, content: string | Buffer = ''): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Racine factice : tables\<T2> (sans ROM), bibliothèque de ROM à côté. */
function sandbox() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-parcours-'));
  const tablesDir = path.join(root, 'tables');
  const library = path.join(root, 'pinmame', 'roms');
  const folder = path.join(tablesDir, TABLE);
  write(path.join(folder, `${TABLE}.vpx`), 'vpx');
  write(path.join(folder, `${TABLE}.directb2s`), 'b2s');
  write(path.join(folder, `${TABLE}.info`), JSON.stringify({ Info: { Title: 'Terminator 2', VPSId: T2.id } }));
  fs.mkdirSync(library, { recursive: true });
  return { root, tablesDir, library, folder, file: path.join(folder, `${TABLE}.vpx`) };
}

type Box = ReturnType<typeof sandbox>;

function inputOf(box: Box, extra: Partial<JourneyInput> = {}, script: ScriptFacts = scriptFacts(SCRIPT)): JourneyInput {
  const entry = scanTables(box.tablesDir)[0]!;
  const findings = diagnose(entry, { tablesDir: box.tablesDir, script, romLibrary: box.library });
  return {
    file: entry.file,
    vpsId: T2.id,
    vpxInstalled: true,
    cabinetConfigured: true,
    screens: SCREENS,
    script,
    findings,
    vps: createVpsDb([COPY, T2]),
    waitList: { items: [] },
    ...extra,
  };
}

const step = (j: Journey, id: string) => [...j.steps, ...j.extras].find((s) => s.id === id)!;
const primary = (j: Journey) => j.steps[j.current]!.choices.find((c) => c.primary)!;

test('ROM absente : le parcours mène à sa page dans la base VPS, puis reçue, installée, jusqu’à « Jouer »', () => {
  const box = sandbox();
  try {
    // 1. Rien sur la borne : l'étape ROM est la courante, son geste ouvre la fiche vpforums de t2_l8.
    let j = planJourney(inputOf(box));
    assert.deepEqual(j.steps.map((s) => s.id), ['setup', 'table', 'rom', 'play']);
    assert.deepEqual(j.extras.map((s) => s.id), ['backglass']);
    assert.equal(j.steps[j.current]!.id, 'rom');
    assert.equal(j.ready, false);
    assert.equal(journeyPosition(j), 'Étape 3 sur 4');
    assert.equal(journeySummary(j), '2 étapes réglées · 1 indispensable à faire');
    assert.equal(step(j, 'rom').state, 'todo');
    assert.equal(step(j, 'rom').title, 'ROM t2_l8');
    assert.match(step(j, 'rom').detail, /Ouvrez sa page sur vpforums\.org/);
    assert.match(step(j, 'rom').note!, /droit d’auteur/);
    const fetch = primary(j);
    assert.equal(fetch.action.kind, 'fetch');
    assert.ok(fetch.action.kind === 'fetch' && fetch.action.source.url.endsWith('showfile=7318'), 'le fichier du jeu de la table, pas la copie');
    assert.equal(fetch.label, 'Récupérer la ROM t2_l8 (vpforums.org)');
    assert.match(fetch.detail!, /compte nécessaire/);
    // La révision voisine que donne VPS vient après, avec son avertissement ; « J'ai déjà le fichier » toujours là.
    const labels = step(j, 'rom').choices.map((c) => c.label);
    assert.ok(labels.includes('Récupérer t2_l6, révision voisine'));
    assert.ok(labels.includes('J’ai déjà le fichier'));
    assert.equal(step(j, 'play').state, 'pending');
    assert.equal(step(j, 'play').detail, 'Dès que l’étape 3 est réglée.');

    // 2. Page ouverte : l'élément attendu est rattaché à la table ; le geste est de rouvrir la page.
    const list: WaitList = { items: [] };
    const source = fetch.action.kind === 'fetch' ? fetch.action.source : undefined!;
    const item = addToWaitList(list, source.game, { kind: 'rom' }, source.file, source.url, new Date('2026-10-25T10:00:00Z'), box.file);
    assert.equal(item.table, box.file);
    assert.equal(item.rom, 't2_l8');
    j = planJourney(inputOf(box, { waitList: list }));
    assert.equal(step(j, 'rom').state, 'waiting');
    assert.equal(primary(j).action.kind, 'reopen');
    assert.ok(step(j, 'rom').choices.some((c) => c.action.kind === 'scanDownloads'));

    // 3. Fichier reçu : l'installer est le geste suivant.
    const zip = path.join(box.root, 'downloads', 'acquisition', 't2_l8.zip');
    write(zip, 'rom');
    markReceived(item, zip, 'window');
    j = planJourney(inputOf(box, { waitList: list }));
    assert.equal(step(j, 'rom').state, 'received');
    const install = primary(j);
    assert.equal(install.action.kind, 'install');
    assert.equal(install.label, 'Installer le fichier reçu');
    assert.match(step(j, 'rom').detail, /Reçu : t2_l8\.zip \(vpforums\.org\)/);

    // 4. Installée (bibliothèque + lien dans la table) : tout l'indispensable est là, « Jouer ».
    write(path.join(box.library, 't2_l8.zip'), 'rom');
    write(path.join(box.folder, 'pinmame', 'roms', 't2_l8.zip'), 'rom');
    item.state = 'installed';
    j = planJourney(inputOf(box, { waitList: list }));
    assert.equal(j.ready, true);
    assert.equal(step(j, 'rom').state, 'done');
    assert.equal(j.steps[j.current]!.id, 'play');
    assert.equal(primary(j).action.kind, 'play');
    assert.equal(journeyPosition(j), 'Étape 4 sur 4');
    assert.equal(journeySummary(j), '3 étapes réglées · prête à jouer');
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test('révision voisine déjà sur la borne : la ROM exacte d’abord si VPS la donne, sinon l’alias', () => {
  const box = sandbox();
  try {
    write(path.join(box.library, 't2_l6.zip'), 'rom');
    let j = planJourney(inputOf(box));
    let rom = step(j, 'rom');
    assert.equal(rom.state, 'todo');
    assert.equal(primary(j).action.kind, 'fetch');
    const alias = rom.choices.find((c) => c.action.kind === 'repair')!;
    assert.equal(alias.label, 'Jouer avec t2_l6, révision voisine');
    // VPS ne connaît pas t2_l8 : l'alias devient le geste conseillé, avec son avertissement.
    const noLink: VpsGame = { ...T2, romFiles: [] };
    j = planJourney(inputOf(box, { vps: createVpsDb([noLink]) }));
    rom = step(j, 'rom');
    assert.equal(primary(j).action.kind, 'repair');
    assert.match(rom.detail, /t2_l6\.zip, du même jeu, est déjà sur la borne/);
    assert.match(rom.note!, /NVRAM/);
    // L'alias écrit (correction du médecin appliquée) : la table joue, le rappel reste.
    write(path.join(box.folder, 'pinmame', 'alias.txt'), 't2_l8,t2_l6\r\n');
    write(path.join(box.folder, 'pinmame', 'roms', 't2_l6.zip'), 'rom');
    j = planJourney(inputOf(box));
    assert.equal(step(j, 'rom').state, 'done');
    assert.match(step(j, 'rom').detail, /Révision voisine t2_l6 chargée à la place de t2_l8/);
    assert.equal(j.ready, true);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test('ROM dans la bibliothèque mais pas liée : la correction du médecin, sur place', () => {
  const box = sandbox();
  try {
    write(path.join(box.library, 't2_l8.zip'), 'rom');
    fs.mkdirSync(path.join(box.folder, 'pinmame', 'roms'), { recursive: true });
    const j = planJourney(inputOf(box));
    const rom = step(j, 'rom');
    assert.equal(rom.state, 'todo');
    assert.equal(rom.required, true);
    const repair = primary(j);
    assert.equal(repair.action.kind, 'repair');
    assert.ok(repair.action.kind === 'repair' && repair.action.finding.code === 'romNotLinked');
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test('sans base VPS ni lien : ajouter le fichier soi-même, ou chercher dans le catalogue', () => {
  const box = sandbox();
  try {
    let j = planJourney(inputOf(box, { vps: undefined }));
    let rom = step(j, 'rom');
    assert.equal(primary(j).action.kind, 'addFile');
    assert.match(rom.detail, /La base VPS n’est pas sur cette borne/);
    assert.ok(!rom.choices.some((c) => c.action.kind === 'search'));
    j = planJourney(inputOf(box, { vps: createVpsDb([{ ...T2, romFiles: [] }]) }));
    rom = step(j, 'rom');
    const search = rom.choices.find((c) => c.action.kind === 'search')!;
    assert.deepEqual(search.action, { kind: 'search', text: 't2_l8' });
    assert.match(rom.detail, /ne connaît aucun lien/);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test('VPX absent : installer VPX d’abord, la ROM attend de lire le script', () => {
  const box = sandbox();
  try {
    const base = inputOf(box);
    const j = planJourney({ ...base, vpxInstalled: false, script: undefined, findings: base.findings.filter((f) => !f.code.startsWith('rom')) });
    assert.equal(j.steps[j.current]!.id, 'setup');
    assert.equal(primary(j).action.kind, 'installVpx');
    assert.equal(step(j, 'rom').state, 'pending');
    assert.equal(step(j, 'play').detail, 'Dès que les étapes 1 et 3 sont réglées.');
    // Borne pas configurée non plus : deux gestes, VPX d'abord.
    const both = planJourney({ ...base, vpxInstalled: false, cabinetConfigured: false, script: undefined, findings: [] });
    assert.deepEqual(both.steps[0]!.choices.map((c) => c.action.kind), ['installVpx', 'setup']);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test('dossier du DMD absent : facultatif, « Jouer » tout de suite, la table d’origine proposée pour aller plus loin', () => {
  const box = sandbox();
  try {
    write(path.join(box.folder, 'pinmame', 'roms', 't2_l8.zip'), 'rom');
    const script = { ...scriptFacts(SCRIPT), dmdFolder: 'T2DMD' };
    const input = inputOf(box, {}, script);
    // Le médecin le signale sans le dire bloquant.
    const finding = input.findings.find((f) => f.code === 'dmdFolderMissing')!;
    assert.equal(finding.severity, 'warning');
    assert.match(finding.detail, /Facultatif/);
    const j = planJourney(input);
    assert.equal(j.ready, true);
    assert.equal(j.steps[j.current]!.id, 'play');
    assert.equal(journeyChoices(j)[0]!.choice.action.kind, 'play');
    assert.ok(!j.steps.some((s) => s.id === 'dmd'), 'pas dans le chemin');
    const dmd = step(j, 'dmd');
    assert.equal(dmd.required, false);
    assert.equal(dmd.state, 'optional');
    assert.match(dmd.detail, /Le DMD de la ROM s’affiche à sa place/);
    const fetch = dmd.choices.find((c) => c.primary)!;
    assert.equal(fetch.label, 'Récupérer la table d’origine (G5k, VPW 1.25)');
    assert.ok(fetch.action.kind === 'fetch' && fetch.action.source.kind === 'table');
    assert.ok(dmd.choices.some((c) => c.label === 'J’ai l’archive de la table'));
    // Proposée après « Jouer », sans être allumée ; comptée en amélioration, pas en étape.
    const later = journeyChoices(j).find((c) => c.step.id === 'dmd')!;
    assert.equal(later.choice.primary, false);
    assert.equal(journeyPosition(j), 'Étape 4 sur 4');
    assert.match(journeySummary(j), /prête à jouer · 1 amélioration proposée/);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test('table sans ROM, sans contenu du DMD ni fronton : « Jouer » est proposé tout de suite', () => {
  const box = sandbox();
  try {
    fs.rmSync(path.join(box.folder, `${TABLE}.directb2s`));
    // Table originale qui dessine son DMD avec FlexDMD, livrée sans son dossier.
    const script = scriptFacts('Set FlexDMD = CreateObject("FlexDMD.FlexDMD")\r\nFlexDMD.ProjectFolder = "./OrigDMD/"\r\n');
    assert.equal(script.usesPinmame, false);
    assert.equal(script.dmdFolder, 'OrigDMD');
    const j = planJourney(inputOf(box, {}, script));
    assert.equal(j.ready, true);
    assert.deepEqual(j.steps.map((s) => s.id), ['setup', 'table', 'play']);
    assert.equal(journeyPosition(j), 'Étape 3 sur 3');
    assert.deepEqual(j.extras.map((s) => s.id), ['dmd', 'backglass']);
    assert.ok(j.extras.every((s) => !s.required));
    assert.match(step(j, 'dmd').detail, /La table se lance sans lui/);
    const first = journeyChoices(j)[0]!;
    assert.equal(first.choice.action.kind, 'play');
    assert.equal(first.choice.primary, true);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test('fronton absent : facultatif, ne bloque pas « Jouer », proposé après', () => {
  const box = sandbox();
  try {
    write(path.join(box.folder, 'pinmame', 'roms', 't2_l8.zip'), 'rom');
    fs.rmSync(path.join(box.folder, `${TABLE}.directb2s`));
    const j = planJourney(inputOf(box));
    const b2s = step(j, 'backglass');
    assert.equal(b2s.state, 'optional');
    assert.equal(j.ready, true);
    const choices = journeyChoices(j);
    assert.equal(choices[0]!.choice.action.kind, 'play');
    assert.equal(choices[0]!.choice.primary, true);
    // Le fronton suit, sans être allumé.
    const next = choices.find((c) => c.step.id === 'backglass')!;
    assert.equal(next.choice.label, 'Récupérer le fronton : HauntFreaks');
    assert.equal(next.choice.primary, false);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
  }
});

test('parcours repris : une étape réglée depuis reste dans la liste, cochée, le décompte ne bouge pas', () => {
  const box = sandbox();
  const data = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-parcours-donnees-'));
  try {
    // Script remplacé par un .vbs : « Rangement de la table » conseillé (pas indispensable), puis réglé.
    const before = planJourney(inputOf(box, { findings: [{ code: 'scriptOverride', severity: 'warning', title: 'Script de la table remplacé', detail: 'x', fix: { label: 'Corbeille', ops: [] } }, ...inputOf(box).findings] }));
    assert.equal(step(before, 'tidy').state, 'todo');
    assert.equal(step(before, 'table').state, 'done');
    // La ROM est réglée par un fichier glissé : l'étape « ROM » reste, réglée.
    const memory = loadJourneys(data);
    rememberJourney(memory, box.file, 'Terminator 2', before, new Date('2026-10-25T10:00:00Z'));
    saveJourneys(data, memory);
    write(path.join(box.folder, 'pinmame', 'roms', 't2_l8.zip'), 'rom');
    const reloaded = loadJourneys(data);
    const record = journeyRecord(reloaded, box.file.toUpperCase())!;
    assert.deepEqual(record.steps, ['setup', 'table', 'rom', 'tidy', 'backglass', 'play']);
    assert.equal(record.position, 'Étape 3 sur 4');
    assert.equal(step(before, 'tidy').required, false);
    const after = planJourney(inputOf(box, { seen: record.steps }));
    assert.equal(after.steps.length, 4);
    assert.equal(after.extras.length, 2);
    assert.ok([...after.steps, ...after.extras].every((s) => s.id === 'play' || s.state === 'done'));
    assert.equal(after.ready, true);
    assert.equal(forgetJourney(reloaded, box.file), true);
    assert.equal(journeyRecord(reloaded, box.file), undefined);
  } finally {
    fs.rmSync(box.root, { recursive: true, force: true });
    fs.rmSync(data, { recursive: true, force: true });
  }
});

test('romSources : nom exact et jeu de la table d’abord, liens morts écartés, révisions voisines ensuite', () => {
  const db = createVpsDb([COPY, T2]);
  const sources = romSources(db, ['t2_l8'], T2.id);
  assert.deepEqual(
    sources.map((s) => `${s.game.id}:${s.rom}${s.neighbour ? ' (voisine)' : ''}`),
    ['BunvWvh9:t2_l8', 'autre:t2_l8', 'BunvWvh9:t2_l6 (voisine)'],
  );
  // Même identifiant de fichier que le catalogue : un élément de la liste d'attente sert aux deux.
  assert.equal(sources[0]!.file.id, 'rom:t2_l8');
  assert.deepEqual(romSources(db, ['afm_113b'], T2.id), []);
  assert.deepEqual(romSources(undefined, ['t2_l8']), []);
});
