import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { readDofSetup } from '../dof';
import { DEFAULT_MENU_MEDIA_SETTINGS, normalizeMenuMediaSettings } from '../mediaview';
import {
  DEFAULT_NIGHT_MODE,
  NIGHT_CABINET_NAME,
  applyNightDof,
  nightCabinetXml,
  nightGlobalConfigXml,
  nightModeOn,
  nightVolumes,
  normalizeNightMode,
  planNightDof,
  readNightJournal,
  restoreNightDof,
  toggleNightMode,
  volumesToRestore,
  writeNightJournal,
} from '../modenuit';

// Mode nuit : ce qu'il change se remet toujours (sortie du mode, fin de partie, ou démarrage suivant
// après un plantage), et une config DOF écrite à la main n'est jamais touchée.

const OPTIONS = { toysOff: true, ledsOff: false, ledBrightness: 30 };
const CABINET = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<!-- Written by Cyber Pinball (LED et retours (DOF)), 2026-11-25T10:00:00.000Z. -->',
  '<Cabinet>',
  '  <Name>Cyber Pinball</Name>',
  '  <AutoConfigEnabled>true</AutoConfigEnabled>',
  '  <Toys>',
  '    <LedStrip>',
  '      <Name>Strip</Name>',
  '      <Width>10</Width>',
  '      <Height>1</Height>',
  '      <Brightness>80</Brightness>',
  '    </LedStrip>',
  '    <LedStrip>',
  '      <Name>Sans luminosité</Name>',
  '      <Width>5</Width>',
  '    </LedStrip>',
  '  </Toys>',
  '</Cabinet>',
  '',
].join('\r\n');
const GLOBAL = [
  '<?xml version="1.0" encoding="utf-8"?>',
  '<!-- Written by Cyber Pinball (LED et retours (DOF)), 2026-11-25T10:00:00.000Z. -->',
  '<GlobalConfig>',
  '  <IniFilesPath>{GlobalConfigDir}</IniFilesPath>',
  '  <CabinetConfigFilePattern>{GlobalConfigDir}\\Cabinet.xml</CabinetConfigFilePattern>',
  '</GlobalConfig>',
  '',
].join('\r\n');

function folder(files: Record<string, string>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'modenuit-'));
  for (const [name, text] of Object.entries(files)) fs.writeFileSync(path.join(dir, name), text);
  return dir;
}

test('réglages : valeurs invalides ramenées au défaut, medias.json ancien lu', () => {
  assert.deepEqual(normalizeNightMode(undefined), DEFAULT_NIGHT_MODE);
  assert.deepEqual(normalizeNightMode({ manual: 1, volume: 140, screenDim: -2, toysOff: 'x' }), DEFAULT_NIGHT_MODE);
  assert.equal(normalizeNightMode({ volume: 0 }).volume, 0, '0 % = muet : valeur valide');
  assert.deepEqual(normalizeMenuMediaSettings({}).nightMode, DEFAULT_NIGHT_MODE);
  assert.deepEqual(DEFAULT_MENU_MEDIA_SETTINGS.nightMode, DEFAULT_NIGHT_MODE);
});

test('activation : à la main, par l’horaire s’il est suivi, et le bouton bascule d’un appui', () => {
  const s = DEFAULT_NIGHT_MODE;
  assert.equal(nightModeOn(s, true), false, 'horaire non suivi : la nuit seule ne l’active pas');
  assert.equal(nightModeOn({ ...s, withHours: true }, true), true);
  assert.equal(nightModeOn({ ...s, withHours: true }, false), false);
  assert.equal(nightModeOn({ ...s, manual: true }, false), true);
  // Appui : allume, puis éteint.
  const on = toggleNightMode(s, false);
  assert.deepEqual([on.on, on.manual, on.override], [true, true, undefined]);
  const off = toggleNightMode({ ...s, manual: true }, false);
  assert.deepEqual([off.on, off.manual, off.override], [false, false, undefined]);
  // Éteint en pleine nuit de l’horaire : l’horaire ne le rallume pas (override), jusqu’à la nuit suivante.
  const linked = { ...s, withHours: true };
  const stop = toggleNightMode(linked, true);
  assert.deepEqual([stop.on, stop.override], [false, false]);
  assert.equal(nightModeOn(linked, true, stop.override), false);
});

test('son : un pourcentage du volume normal, 0 % coupe ; la sortie ne défait pas le choix du joueur', () => {
  const before = [{ id: 'a', level: 0.8, muted: false }, { id: 'b', level: 0.5, muted: false }];
  const set = nightVolumes(before, 50);
  assert.deepEqual(set.map((o) => o.level), [0.4, 0.25]);
  assert.deepEqual(nightVolumes(before, 100), before, '100 % : inchangé');
  assert.deepEqual(nightVolumes(before, 0).map((o) => o.muted), [true, true], '0 % : muet');
  assert.equal(before[0]!.muted, false, 'l’entrée n’est pas modifiée');
  // Personne n'y a touché : le volume d'avant revient.
  assert.deepEqual(volumesToRestore({ before, set }, set), before);
  // Le joueur a monté la sortie « a » aux boutons : elle reste, « b » revient.
  const touched = [{ id: 'a', level: 0.7, muted: false }, set[1]!];
  assert.deepEqual(volumesToRestore({ before, set }, touched), [before[1]]);
  // Même le son coupé par le mode nuit se rétablit.
  const mute = nightVolumes(before, 0);
  assert.deepEqual(volumesToRestore({ before, set: mute }, mute), before);
});

test('variante du Cabinet.xml : toys de la borne coupés, luminosité des bandes réduite', () => {
  const night = nightCabinetXml(CABINET, OPTIONS);
  assert.match(night, /<AutoConfigEnabled>false<\/AutoConfigEnabled>/);
  assert.match(night, /<Brightness>24<\/Brightness>/, '80 % × 30 %');
  assert.match(night, /<Name>Sans luminosité<\/Name>[\s\S]*<Brightness>30<\/Brightness>\s*<\/LedStrip>/, 'bande sans Brightness : 100 % × 30 %');
  assert.equal(nightCabinetXml(CABINET, { ...OPTIONS, ledsOff: true }).match(/<Brightness>0<\/Brightness>/g)?.length, 2, 'LED éteintes : toutes à 0');
  const keep = nightCabinetXml(CABINET, { toysOff: false, ledsOff: false, ledBrightness: 100 });
  assert.match(keep, /<AutoConfigEnabled>true<\/AutoConfigEnabled>/);
  assert.match(keep, /<Brightness>80<\/Brightness>/);
  assert.match(nightCabinetXml(undefined, OPTIONS), /<AutoConfigEnabled>false<\/AutoConfigEnabled>/, 'sans Cabinet.xml : un minimal');
  assert.match(nightGlobalConfigXml(GLOBAL, '{GlobalConfigDir}\\X.xml'), /<CabinetConfigFilePattern>\{GlobalConfigDir\}\\X\.xml<\/CabinetConfigFilePattern>/);
  assert.match(nightGlobalConfigXml('<GlobalConfig>\r\n</GlobalConfig>', 'P'), /<CabinetConfigFilePattern>P<\/CabinetConfigFilePattern>/, 'pattern absent : ajouté');
});

test('DOF : config écrite à la main jamais touchée, raison donnée', () => {
  const hand = folder({ 'GlobalConfig_B2SServer.xml': '<GlobalConfig><IniFilesPath>x</IniFilesPath></GlobalConfig>' });
  const plan = planNightDof(readDofSetup(hand), OPTIONS);
  assert.equal(plan.kind, 'refused');
  const handCabinet = folder({ 'GlobalConfig_B2SServer.xml': GLOBAL, 'Cabinet.xml': CABINET.replace(/<!--[^>]*-->\r\n/, '') });
  assert.equal(planNightDof(readDofSetup(handCabinet), OPTIONS).kind, 'refused');
  assert.equal(planNightDof(undefined, OPTIONS).kind, 'none', 'sans DOF');
  const ours = folder({ 'GlobalConfig_B2SServer.xml': GLOBAL, 'Cabinet.xml': CABINET });
  assert.equal(planNightDof(readDofSetup(ours), { toysOff: false, ledsOff: false, ledBrightness: 100 }).kind, 'none', 'rien à changer');
});

test('DOF : la variante se pose, le journal garde l’original, la fin de partie le remet', () => {
  const dir = folder({ 'GlobalConfig_B2SServer.xml': GLOBAL, 'Cabinet.xml': CABINET });
  const journal = path.join(dir, 'modenuit.json');
  const plan = planNightDof(readDofSetup(dir), OPTIONS);
  assert.equal(plan.kind, 'apply');
  if (plan.kind !== 'apply') return;
  applyNightDof(journal, plan);
  assert.match(fs.readFileSync(path.join(dir, 'GlobalConfig_B2SServer.xml'), 'utf8'), new RegExp(NIGHT_CABINET_NAME.replace('.', '\\.')));
  assert.ok(fs.existsSync(path.join(dir, NIGHT_CABINET_NAME)));
  assert.equal(fs.readFileSync(path.join(dir, 'Cabinet.xml'), 'utf8'), CABINET, 'le Cabinet.xml de la borne n’est jamais réécrit');
  // Deuxième partie dans la nuit : l'original du journal reste celui d'avant la nuit.
  const again = planNightDof(readDofSetup(dir), OPTIONS);
  if (again.kind === 'apply') applyNightDof(journal, again);
  assert.equal(readNightJournal(journal)?.dof?.globalOriginal, GLOBAL);
  assert.equal(restoreNightDof(journal), true);
  assert.equal(fs.readFileSync(path.join(dir, 'GlobalConfig_B2SServer.xml'), 'utf8'), GLOBAL);
  assert.equal(fs.existsSync(path.join(dir, NIGHT_CABINET_NAME)), false);
  assert.equal(fs.existsSync(journal), false, 'plus rien à remettre : journal supprimé');
  assert.equal(restoreNightDof(journal), false, 'sans journal : sans effet');
});

test('DOF : sans GlobalConfig, il est créé pour la nuit puis supprimé', () => {
  const dir = folder({});
  const journal = path.join(dir, 'modenuit.json');
  const plan = planNightDof(readDofSetup(dir), OPTIONS);
  assert.equal(plan.kind, 'apply');
  if (plan.kind !== 'apply') return;
  applyNightDof(journal, plan);
  assert.ok(fs.existsSync(path.join(dir, 'GlobalConfig_B2SServer.xml')));
  restoreNightDof(journal);
  assert.deepEqual(fs.readdirSync(dir), [], 'dossier comme avant');
});

test('plantage : au démarrage suivant, le journal seul suffit à tout remettre (DOF et volumes)', () => {
  const dir = folder({ 'GlobalConfig_B2SServer.xml': GLOBAL, 'Cabinet.xml': CABINET });
  const journal = path.join(dir, 'modenuit.json');
  const volumes = { before: [{ id: 'a', level: 0.8, muted: false }], set: nightVolumes([{ id: 'a', level: 0.8, muted: false }], 40) };
  writeNightJournal(journal, { volumes });
  const plan = planNightDof(readDofSetup(dir), OPTIONS);
  if (plan.kind === 'apply') applyNightDof(journal, plan);
  // (le processus meurt ici : rien en mémoire)
  const found = readNightJournal(journal);
  assert.ok(found?.volumes && found.dof, 'état d’avant écrit avant tout changement');
  assert.equal(restoreNightDof(journal), true);
  assert.equal(fs.readFileSync(path.join(dir, 'GlobalConfig_B2SServer.xml'), 'utf8'), GLOBAL);
  const left = readNightJournal(journal);
  assert.ok(left?.volumes && !left.dof, 'le volume reste au journal jusqu’à ce que l’app l’ait remis');
  assert.deepEqual(volumesToRestore(left.volumes, volumes.set), volumes.before);
  writeNightJournal(journal, {});
  assert.equal(fs.existsSync(journal), false);
  fs.writeFileSync(journal, '{ illisible');
  assert.equal(readNightJournal(journal), undefined, 'journal abîmé : ignoré, sans plantage');
});
