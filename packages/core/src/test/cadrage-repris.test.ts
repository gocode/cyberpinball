// Cadrage d'une table reprise (17/11/2026, joueur venu de PinUP Popper : « je mets en manuel et tout est nickel », mais
// « Enregistrer » restait grisé et la table revenait déréglée). Son .ini portait la vue réglée pour sa borne sous
// VPX 10.8.0 ([TableOverride] ViewCab…), que le cadrage automatique imposé par Cyber Pinball ne lit pas.
// Invariants : une vue de borne enregistrée pour la table sans mode de cadrage (VPX d'avant 10.8.1) est jouée en
// cadrage manuel pour elle seule, avant chaque partie, si le sens de la partie reste le bon ; un cadrage choisi pour la
// table (clé présente, ce qu'écrit le point de vue de VPX 10.8.1) n'est jamais touché ; revenir au cadrage automatique
// tient d'une partie à l'autre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { diagnose, pupPlayRepairs, repairPupForPlay, scriptFacts, type DoctorContext } from '../doctor';
import { applyOps } from '../fileops';
import { scanTables } from '../tables';
import { devPcDisplays, vpxWithScript } from './fixtures';

const TABLE = 'Hellboy (Original 2021)';
/** Vue réglée pour la borne sous VPX 10.8.0 : décalages et échelle, sans mode de cadrage. */
const OLD_VIEW = '[TableOverride]\r\nViewCabMode = 2\r\nViewCabHOfs = 1.5\r\nViewCabVOfs = 8\r\nViewCabScaleX = 1.04\r\nViewCabScaleY = 1.04\r\nViewCabRotation = 0\r\n';
const SCRIPT = 'Sub Table1_Init\r\nEnd Sub\r\n';

/** Playfield paysage (écran couché dans la borne, joueur à droite de l'image), VPinballX.ini synchronisé (vue borne, cadrage automatique). */
function landscape(): NonNullable<DoctorContext['orientation']> {
  return { window: devPcDisplays()[3]!, edge: 'right', globalIni: '[Player]\nBGSet = 1\nCabinetAutofitMode = 1\n' };
}
function setup(iniText: string) {
  const tablesDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-cadrage-'));
  const folder = path.join(tablesDir, TABLE);
  fs.mkdirSync(folder, { recursive: true });
  fs.writeFileSync(path.join(folder, `${TABLE}.vpx`), vpxWithScript(SCRIPT));
  const ini = path.join(folder, `${TABLE}.ini`);
  fs.writeFileSync(ini, iniText);
  const entry = () => scanTables(tablesDir)[0]!;
  const ctx = (orientation = landscape()): DoctorContext => ({ tablesDir, script: scriptFacts(SCRIPT), orientation });
  const trashDir = `${tablesDir}-corbeille`;
  const done = () => {
    fs.rmSync(tablesDir, { recursive: true, force: true });
    fs.rmSync(trashDir, { recursive: true, force: true });
  };
  return { ini, entry, ctx, trashDir, done };
}

test('vue reprise d’un VPX d’avant 10.8.1 : jouée en cadrage manuel avant la partie, rien d’autre ne change', () => {
  const s = setup(OLD_VIEW);
  const found = diagnose(s.entry(), s.ctx()).find((f) => f.code === 'importedView');
  assert.equal(found?.severity, 'info');
  assert.equal(found?.title, 'Cadrage réglé pour cette table');
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  assert.equal(fs.readFileSync(s.ini, 'utf8'), `[TableOverride]\r\nViewCabMode = 2\r\nViewCabHOfs = 1.5\r\nViewCabVOfs = 8\r\nViewCabScaleX = 1.04\r\nViewCabScaleY = 1.04\r\nViewCabRotation = 0\r\n\r\n[Player]\r\nCabinetAutofitMode = 0\r\n`);
  // Ensuite : un cadrage réglé pour la table, signalé pour information, plus rien à réparer avant la partie.
  const after = diagnose(s.entry(), s.ctx()).filter((f) => ['importedView', 'manualView', 'tableOrientation'].includes(f.code));
  assert.deepEqual(after.map((f) => [f.code, f.severity]), [['manualView', 'info']]);
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()), []);
  s.done();
});

test('vue reprise qui mettrait la table de travers sur cette borne : laissée au cadrage automatique', () => {
  // Vue tournée d'un quart de tour (réglée pour un écran monté autrement) : flippers en bas d'une image où le joueur est à droite.
  const turned = OLD_VIEW.replace('ViewCabRotation = 0', 'ViewCabRotation = 90');
  const s = setup(turned);
  assert.equal(diagnose(s.entry(), s.ctx()).find((f) => f.code === 'importedView'), undefined);
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()), []);
  // Sans le sens de la borne (pas de playfield branché), rien n'est posé avant la partie.
  assert.deepEqual(pupPlayRepairs(s.entry(), { tablesDir: s.ctx().tablesDir, script: scriptFacts(SCRIPT) }), []);
  assert.equal(fs.readFileSync(s.ini, 'utf8'), turned);
  s.done();
});

test('cadrage choisi pour la table dans VPX 10.8.1 (manuel ou automatique) : jamais touché, et le retour à l’automatique tient', () => {
  // Enregistré par le point de vue de VPX (« Save as Table Override ») : mode et vue ensemble.
  const saved = `[Player]\r\nCabinetAutofitMode = 0\r\n\r\n${OLD_VIEW}`;
  const s = setup(saved);
  assert.deepEqual(pupPlayRepairs(s.entry(), s.ctx()), []);
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  assert.equal(fs.readFileSync(s.ini, 'utf8'), saved);
  // Le joueur repasse la table au cadrage automatique depuis la fiche : la clé est écrite, la vue reprise ne revient pas.
  const manual = diagnose(s.entry(), s.ctx()).find((f) => f.code === 'manualView')!;
  applyOps(manual.fix!.ops, { trashDir: s.trashDir });
  repairPupForPlay(s.entry(), s.ctx(), { trashDir: s.trashDir });
  assert.match(fs.readFileSync(s.ini, 'utf8'), /CabinetAutofitMode = 1/);
  assert.deepEqual(diagnose(s.entry(), s.ctx()).filter((f) => ['importedView', 'manualView'].includes(f.code)), []);
  s.done();
});

test('rien à reprendre : .ini sans vue de borne, ou vue de bureau seulement', () => {
  for (const text of ['[TableOverride]\r\nViewCabRotation = 0\r\n', '[TableOverride]\r\nViewDTScaleX = 1.2\r\nViewDTPlayerZ = -300\r\n', '[TableOption]\r\nVR Room = 1\r\n']) {
    const s = setup(text);
    assert.equal(diagnose(s.entry(), s.ctx()).find((f) => f.code === 'importedView'), undefined, text);
    s.done();
  }
});
