// Cadrage des tables (21/11/2026). Le cadrage automatique de VPX était jugé « pas terrible » sur la borne de test, et les joueurs réclamaient les fichiers POV : un POV posé avec la table n'avait aucun effet (VPX ne lit un .pov que sans .ini de
// table, et le cadrage automatique imposé recalcule la vue).
// Invariants : la vue borne d'un POV (.pov XML ou .ini de POV) est reportée dans le .ini de la table, en cadrage manuel
// pour elle seule, avant la partie, si rien n'est choisi pour la table et si le sens de la partie reste le bon ; un
// cadrage choisi n'est jamais remplacé d'office (le POV est proposé) ; un POV qui mettrait la table de travers est
// écarté ; un .ini que le menu de VPX écrit en passant en manuel sans vue réglée (The Matrix sur le PinCab) n'est pas
// présenté comme un cadrage réglé pour la table ; un .ini de POV reçu ne prend jamais la place du .ini de la table.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { classifyContent } from '../acquisition';
import { diagnose, pupPlayRepairs, repairPupForPlay, scriptFacts, type DoctorContext } from '../doctor';
import { applyOps, type FileOp } from '../fileops';
import { IniDocument } from '../ini';
import { importPovOps, parsePovIni, parsePovXml, tablePovState } from '../povview';
import { classifyFile, isPovIniName } from '../tablefiles';
import { scanTables, type TableEntry } from '../tables';
import { devPcDisplays, vpxWithScript } from './fixtures';
import { REPO_ROOT } from './i18n-scan';

const TABLE = 'Hellboy (Original 2021)';
const SCRIPT = 'Sub Table1_Init\r\nEnd Sub\r\n';
const VIEW_CODES = ['povView', 'povOffered', 'povWrongWay', 'manualView', 'importedView', 'tableOrientation'];

/** .pov de VPX 10.7 : vue borne en mode « Window », tournée comme la fenêtre. */
const POV = [
  '<?xml version="1.0" encoding="UTF-8"?>',
  '<POV>',
  '  <desktop><xscale>1.5</xscale></desktop>',
  '  <fullscreen>',
  '    <inclination>2</inclination>',
  '    <LayoutMode>2</LayoutMode>',
  '    <rotation>0</rotation>',
  '    <xscale>1.15</xscale>',
  '    <yscale>1.08</yscale>',
  '    <ViewVOfs>-4.5</ViewVOfs>',
  '    <WindowTopZOfs>530</WindowTopZOfs>',
  '    <fov></fov>',
  '  </fullscreen>',
  '</POV>',
].join('\r\n');

/** Playfield paysage (joueur à droite de l'image), VPinballX.ini synchronisé (vue borne, cadrage automatique). */
function landscape(): NonNullable<DoctorContext['orientation']> {
  return { window: devPcDisplays()[3]!, edge: 'right', globalIni: '[Player]\nBGSet = 1\nCabinetAutofitMode = 1\n' };
}

function setup(files: Record<string, string>) {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadrage-pov-'));
  const folder = path.join(tablesDir, TABLE);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${TABLE}.vpx`), vpxWithScript(SCRIPT));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(folder, name), text);
  const ini = path.join(folder, `${TABLE}.ini`);
  const entry = () => scanTables(tablesDir)[0]!;
  /** null : borne pas décrite (sens de la partie inconnu). */
  const ctx = (orientation: DoctorContext['orientation'] | null = landscape()): DoctorContext => ({ tablesDir, script: scriptFacts(SCRIPT), orientation: orientation ?? undefined });
  const views = () => diagnose(entry(), ctx()).filter((f) => VIEW_CODES.includes(f.code));
  const trashDir = `${tablesDir}-corbeille`;
  const done = () => {
    fs.rmSync(tablesDir, { recursive: true, force: true });
    fs.rmSync(trashDir, { recursive: true, force: true });
  };
  return { ini, entry, ctx, views, trashDir, done };
}

test('.pov : la vue borne lue comme VPX l’importe (section fullscreen, champs renommés, valeurs vides ignorées)', () => {
  assert.deepEqual(parsePovXml(POV), [
    { key: 'ViewCabLookAt', value: '2' },
    { key: 'ViewCabMode', value: '2' },
    { key: 'ViewCabRotation', value: '0' },
    { key: 'ViewCabScaleX', value: '1.15' },
    { key: 'ViewCabScaleY', value: '1.08' },
    { key: 'ViewCabVOfs', value: '-4.5' },
    { key: 'ViewCabWindowTop', value: '530' },
  ]);
  assert.deepEqual(parsePovXml('<Settings><fullscreen><xscale>1</xscale></fullscreen></Settings>'), [], 'pas un POV');
  assert.deepEqual(parsePovIni('[TableOverride]\r\nViewCabScaleX = 1.2\r\nViewDTScaleX = 1.4\r\nViewCabVOfs = abc\r\n[Player]\r\nCabinetAutofitMode = 0\r\n'), [{ key: 'ViewCabScaleX', value: '1.2' }]);
});

test('POV fourni, rien de choisi pour la table : repris avant la partie, puis la table suit le cadrage choisi', () => {
  const s = setup({ [`${TABLE}.pov`]: POV, [`${TABLE}.ini`]: '[TableOption]\r\nVR Room = 1\r\n' });
  assert.deepEqual(s.views().map((f) => [f.code, f.severity]), [['povView', 'info']]);
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()).map((f) => f.code), ['povView']);
  // Sans le sens de la borne, rien n'est posé d'office.
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx(null)), []);
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  const doc = IniDocument.parse(fs.readFileSync(s.ini, 'utf8'));
  assert.equal(doc.get('Player', 'CabinetAutofitMode'), '0');
  assert.equal(doc.get('TableOverride', 'ViewCabScaleX'), '1.15');
  assert.equal(doc.get('TableOverride', 'ViewCabVOfs'), '-4.5');
  assert.equal(doc.get('TableOption', 'VR Room'), '1', 'le reste du .ini de la table est gardé');
  // Repris : un cadrage réglé pour la table, plus rien à poser avant la partie.
  assert.deepEqual(s.views().map((f) => [f.code, f.severity]), [['manualView', 'info']]);
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()), []);
  // Retour au cadrage de la borne depuis la fiche : il tient, le POV n'est plus que proposé.
  applyOps(s.views().find((f) => f.code === 'manualView')!.fix!.ops, { trashDir: s.trashDir });
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  assert.equal(IniDocument.parse(fs.readFileSync(s.ini, 'utf8')).get('Player', 'CabinetAutofitMode'), '1');
  const offered = s.views();
  assert.deepEqual(offered.map((f) => f.code), ['povOffered']);
  // Et le POV se reprend d'un geste.
  applyOps(offered[0]!.fix!.ops, { trashDir: s.trashDir });
  assert.equal(IniDocument.parse(fs.readFileSync(s.ini, 'utf8')).get('Player', 'CabinetAutofitMode'), '0');
  assert.deepEqual(s.views().map((f) => f.code), ['manualView']);
  s.done();
});

test('POV qui mettrait la table de travers sur cette borne : écarté, jamais posé', () => {
  // Vue « Legacy » tournée d'un quart de tour : flippers à gauche d'une image où le joueur est à droite.
  const legacy = POV.replace('<LayoutMode>2</LayoutMode>', '<LayoutMode>0</LayoutMode>').replace('<rotation>0</rotation>', '<rotation>90</rotation>');
  const s = setup({ [`${TABLE}.pov`]: legacy });
  assert.deepEqual(s.views().map((f) => [f.code, Boolean(f.fix)]), [['povWrongWay', false]]);
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()), []);
  assert.ok(!fs.existsSync(s.ini));
  // Sans mode ni rotation, le sens ne se vérifie pas : écarté aussi.
  const s2 = setup({ [`${TABLE}.pov`]: POV.replace('<LayoutMode>2</LayoutMode>', '').replace('<rotation>0</rotation>', '') });
  assert.match(s2.views()[0]!.detail, /ne dit pas dans quel sens la tourner/);
  s.done();
  s2.done();
});

test('.ini de POV (VPX 10.8, « <table> POV.ini ») : repris comme un .pov, sans remplacer le .ini de la table', () => {
  const s = setup({ 'Hellboy POV.ini': '[TableOverride]\r\nViewCabMode = 2\r\nViewCabRotation = 0\r\nViewCabScaleX = 1.2\r\nViewCabScaleY = 1.1\r\n' });
  assert.deepEqual(s.views().map((f) => f.code), ['povView']);
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  assert.equal(IniDocument.parse(fs.readFileSync(s.ini, 'utf8')).get('TableOverride', 'ViewCabScaleY'), '1.1');
  s.done();
  // Reconnaissance du fichier reçu : un POV, jamais les réglages de la table.
  assert.equal(isPovIniName('Hellboy POV.ini'), true);
  assert.equal(isPovIniName('pov.ini'), true);
  assert.equal(isPovIniName(`${TABLE}.ini`), false);
  assert.equal(isPovIniName('Povray.ini'), false);
  assert.equal(classifyFile('Hellboy POV.ini'), 'pov');
  assert.equal(classifyFile(`${TABLE}.ini`), 'tableIni');
  assert.equal(classifyContent('Hellboy POV.ini'), 'pov');
  assert.equal(classifyContent('POVs.zip', ['POVs/', 'POVs/Hellboy (Original 2021).ini', 'POVs/lisez-moi.txt']), 'pov');
});

test('.ini écrit par le menu de VPX en passant en manuel, sans vue réglée (The Matrix, PinCab) : pas un cadrage réglé', () => {
  const matrix = '[Player]\r\nCabinetAutofitMode = 0\r\n\r\n[TableOverride]\r\nViewCabMode = 2\r\nViewCabRotation = 0.0\r\nViewCabWindowTop = 530\r\nViewCabWindowBot = 185\r\n';
  const s = setup({ [`${TABLE}.ini`]: matrix });
  const found = s.views();
  assert.deepEqual(found.map((f) => [f.code, f.severity, f.title]), [['manualView', 'info', 'Cadrage manuel sans vue réglée']]);
  applyOps(found[0]!.fix!.ops, { trashDir: s.trashDir });
  assert.equal(IniDocument.parse(fs.readFileSync(s.ini, 'utf8')).get('Player', 'CabinetAutofitMode'), undefined);
  // Rendu au cadrage de la borne, et rien ne le repasse en manuel avant la partie.
  assert.deepEqual(s.views(), []);
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()), []);
  s.done();
});

test('fiche > Point de vue : le cadrage choisi pour la table, le retour à celui de la borne, l’import d’un POV', () => {
  const s = setup({});
  const orientation = landscape();
  // Rien de fourni : le cadrage de la borne, rien à rendre.
  assert.deepEqual(tablePovState(s.entry().file, orientation), { framing: 'cabinet' });
  // Import d'un POV trouvé ailleurs : rangé sous un nom de POV, jamais à la place du .ini de la table.
  const elsewhere = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-pov-source-'));
  const source = path.join(elsewhere, 'Hellboy cabinet.pov');
  fs.writeFileSync(source, POV);
  const plan = importPovOps(s.entry().file, source);
  assert.ok('ops' in plan);
  applyOps(plan.ops, { trashDir: s.trashDir });
  assert.ok(fs.existsSync(path.join(path.dirname(s.ini), `${TABLE}.pov`)));
  // Pas encore appliqué, rien de choisi : il cadrera la table à la prochaine partie, et la fiche le dit.
  const pending = tablePovState(s.entry().file, orientation);
  assert.equal(pending.framing, 'pov');
  applyOps(pending.applyOps!, { trashDir: s.trashDir });
  const applied = tablePovState(s.entry().file, orientation);
  assert.equal(applied.framing, 'pov');
  assert.equal(applied.applyOps, undefined, 'déjà appliqué');
  // Retour au cadrage de la borne, avec son mode (« Remplir » ici) : il tient, le POV n'est pas repris avant la partie.
  const fill = { ...orientation, globalIni: '[Player]\nBGSet = 1\nCabinetAutofitMode = 2\n' };
  applyOps(tablePovState(s.entry().file, fill).cabinetOps!, { trashDir: s.trashDir });
  assert.equal(IniDocument.parse(fs.readFileSync(s.ini, 'utf8')).get('Player', 'CabinetAutofitMode'), '2');
  assert.equal(tablePovState(s.entry().file, fill).framing, 'cabinet');
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()), []);
  // Un .ini de POV importé remplace le .pov de la table (à la corbeille).
  const ini = path.join(elsewhere, 'Hellboy.ini');
  fs.writeFileSync(ini, '[TableOverride]\r\nViewCabMode = 2\r\nViewCabRotation = 0\r\nViewCabScaleX = 1.3\r\n');
  const second = importPovOps(s.entry().file, ini);
  assert.ok('ops' in second);
  applyOps(second.ops, { trashDir: s.trashDir });
  assert.deepEqual(fs.readdirSync(path.dirname(s.ini)).filter((n) => /pov/i.test(n)), [`${TABLE} POV.ini`]);
  assert.equal(tablePovState(s.entry().file, orientation).pov?.values.find((v) => v.key === 'ViewCabScaleX')?.value, '1.3');
  // Refusés : pas un POV, ou pas de vue borne.
  fs.writeFileSync(path.join(elsewhere, 'rien.ini'), '[TableOption]\r\nVR Room = 1\r\n');
  assert.match(String((importPovOps(s.entry().file, path.join(elsewhere, 'rien.ini')) as { error: string }).error), /ne contient pas de point de vue de borne/);
  assert.match(String((importPovOps(s.entry().file, path.join(elsewhere, 'a.txt')) as { error: string }).error), /n’est pas un fichier de point de vue/);
  // Sans le sens de la borne : jamais appliqué.
  assert.match(tablePovState(s.entry().file).refused ?? '', /relance l’assistant d’écrans/);
  fs.rmSync(elsewhere, { recursive: true, force: true });
  s.done();
});

test('écran « Point de vue » : choisir le POV, revenir à la borne, importer (sans Electron)', async () => {
  type Shown = { heading: string; actions: { label: string; detail?: string; badge?: string; run(): void }[]; sections: { rows: { text: string }[] }[] };
  const mod = require(path.join(REPO_ROOT, 'app', 'dist', 'table-pov.js')) as {
    createTablePov(ctx: {
      show(build: () => Shown): void;
      pick(): Promise<string[] | undefined>;
      orientation(): DoctorContext['orientation'];
      apply(ops: FileOp[]): void;
      back(): void;
      fresh(table: TableEntry): TableEntry;
      dataDir(): string;
    }): { detail(table: TableEntry): string; open(table: TableEntry, back?: () => void): void };
  };
  const s = setup({ [`${TABLE}.pov`]: POV, [`${TABLE}.ini`]: '[Player]\r\nCabinetAutofitMode = 1\r\n' });
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadrage-pov-donnees-'));
  let shown: Shown | undefined;
  let picked: string[] | undefined;
  let backs = 0;
  const pov = mod.createTablePov({
    show: (build) => (shown = build()),
    pick: async () => picked,
    orientation: () => landscape(),
    apply: (ops) => applyOps(ops, { trashDir: s.trashDir }),
    back: () => backs++,
    fresh: () => s.entry(),
    dataDir: () => dataDir,
  });
  const action = (label: string | RegExp) => shown!.actions.find((a) => (typeof label === 'string' ? a.label === label : label.test(a.label)))!;
  const table = s.entry();
  assert.equal(pov.detail(table), 'Cadrage de la borne');
  pov.open(table);
  assert.deepEqual(shown!.actions.map((a) => [a.label, a.badge ?? '']), [['Cadrage de la borne', ''], [`POV « ${TABLE}.pov »`, 'beta'], ['Importer un POV…', 'beta'], ['Retour', '']]);
  assert.match(shown!.actions[0]!.detail!, /choix actuel/);
  action(/^POV/).run();
  assert.equal(pov.detail(s.entry()), `POV « ${TABLE}.pov »`);
  assert.match(shown!.sections[0]!.rows[0]!.text, /choisi pour cette table/);
  // Retour arrière : le cadrage d'avant (celui de la borne) rétabli.
  action('Rétablir le cadrage précédent').run();
  assert.equal(pov.detail(s.entry()), 'Cadrage de la borne');
  assert.equal(fs.readFileSync(path.join(path.dirname(table.file), `${TABLE}.ini`), 'utf8'), '[Player]\r\nCabinetAutofitMode = 1\r\n');
  action(/^POV/).run();
  action('Cadrage de la borne').run();
  assert.equal(pov.detail(s.entry()), 'Cadrage de la borne');
  // Import annulé : l'écran revient tel quel.
  action('Importer un POV…').run();
  await new Promise((r) => setImmediate(r));
  assert.equal(shown!.heading, 'Point de vue');
  action('Retour').run();
  assert.equal(backs, 1);
  // Une entrée depuis une autre fonction garde son retour après une action et un import annulé.
  let origin = 0;
  pov.open(table, () => origin++);
  action(/^POV/).run();
  action('Importer un POV…').run();
  await new Promise((r) => setImmediate(r));
  action('Retour').run();
  assert.equal(origin, 1);
  assert.equal(backs, 1);
  pov.open(table);
  action('Retour').run();
  assert.equal(backs, 2, 'ouvrir depuis la fiche oublie le retour externe');
  fs.rmSync(dataDir, { recursive: true, force: true });
  s.done();
});
