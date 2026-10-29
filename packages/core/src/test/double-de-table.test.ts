// Double d'une table pour une partie entre amis (29/10/2026 : « ne jamais effacer ni réinitialiser
// la ROM des joueurs, rien écraser »). La preuve : l'empreinte de chaque octet du dossier habituel
// de la table, avant et après une partie jouée sur son double par un faux VPX qui écrit partout où
// VPX, PinMAME, PuP et B2S écrivent ; rien ne bouge, et la suppression du double ne suit aucun lien.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { folderChanges, folderPrint, makeTableDouble, planTableDouble, removeTableDouble, type TableDoublePlan } from '../index';

function write(file: string, content: string | Buffer): void {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
}

/** Une table comme celles de la borne : T2 avec sa ROM et sa mémoire, PuP, DMD, fronton, réglages. */
function terminator(root: string): string {
  const folder = path.join(root, 'tables', 'Terminator 2 (Williams 1991)');
  const files: Record<string, string> = {
    'Terminator 2 (Williams 1991).vpx': 'table',
    'Terminator 2 (Williams 1991).directb2s': 'fronton',
    'Terminator 2 (Williams 1991).ini': '[TableOverride]\nViewCabMode = 2\n',
    'Terminator 2 (Williams 1991).vbs': 'Option Explicit',
    'Terminator 2 (Williams 1991).info': '{"Info":{"Title":"Terminator 2"}}',
    'B2STableSettings.xml': '<B2STableSettings/>',
    'pinmame/roms/t2_l8.zip': 'rom',
    'pinmame/nvram/t2_l8.nv': 'mémoire de la ROM : 3 billes, records du joueur',
    'pinmame/cfg/t2_l8.cfg': 'dip',
    'pinmame/alias.txt': 't2_l8,t2_l8',
    'user/VPReg.stg': 'records enregistrés',
    'pupvideos/t2/attract/boucle.mp4': 'vidéo',
    'pupvideos/t2/screens.pup': 'écrans',
    'pupvideos/t2/play.bat': 'echo',
    't2.FlexDMD/logo.png': 'image',
    'cache/Terminator 2 (Williams 1991)/textures.bin': 'cache de VPX',
    'medias/(Wheel) Terminator 2 (Williams 1991).png': 'roue',
  };
  for (const [rel, content] of Object.entries(files)) write(path.join(folder, rel), content);
  return folder;
}

const table = (folder: string, extra: Partial<Parameters<typeof planTableDouble>[0]> = {}) => ({
  file: path.join(folder, `${path.basename(folder)}.vpx`),
  folder,
  ownFolder: true,
  roms: ['t2_l8'],
  usesPinmame: true,
  ...extra,
});

/** Un faux VPX : il écrit partout où VPX, PinMAME, PuP et B2S écrivent pendant une partie, et plus. */
function playOn(plan: TableDoublePlan): void {
  for (const step of plan.copies) fs.appendFileSync(step.to, ' ; écrit pendant la partie');
  write(path.join(plan.dir, 'pinmame', 'nvram', 't2_l8.nv'), 'mémoire réinitialisée : 5 billes');
  write(path.join(plan.dir, 'user', 'VPReg.stg'), 'nouveaux records');
  write(path.join(plan.dir, 'cache', 'Terminator 2 (Williams 1991)', 'shaders.bin'), 'cache refait');
  write(path.join(plan.dir, 'pinmame', 'hi', 't2_l8.hi'), 'nouveau');
  // Enregistrer par remplacement (fichier temporaire puis renommage) : le lien du double est remplacé, pas l'original.
  const b2s = path.join(plan.dir, 'Terminator 2 (Williams 1991).directb2s');
  write(`${b2s}.tmp`, 'fronton réenregistré');
  fs.renameSync(`${b2s}.tmp`, b2s);
  fs.unlinkSync(path.join(plan.dir, 'B2STableSettings.xml'));
}

test('double : liens pour ce que rien n’écrit, copies pour le reste ; la partie ne touche aucun octet du dossier de la table', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-double-'));
  const folder = terminator(root);
  const parties = path.join(root, 'parties', '0123456789abcdef');
  const before = folderPrint(folder, { full: true });
  const planned = planTableDouble(table(folder), parties);
  assert.ok(planned.ok, planned.ok ? '' : planned.reason);
  const plan = planned.plan;
  const rel = (steps: { to: string }[]) => steps.map((s) => path.relative(plan.dir, s.to).replace(/\\/g, '/')).sort();
  assert.deepEqual(rel(plan.links), [
    'Terminator 2 (Williams 1991).directb2s',
    'Terminator 2 (Williams 1991).vpx',
    'pinmame/roms/t2_l8.zip',
    'pupvideos/t2/attract/boucle.mp4',
    't2.FlexDMD/logo.png',
  ]);
  assert.deepEqual(rel(plan.copies), [
    'B2STableSettings.xml',
    'Terminator 2 (Williams 1991).info',
    'Terminator 2 (Williams 1991).ini',
    'Terminator 2 (Williams 1991).vbs',
    'pinmame/alias.txt',
    'pinmame/cfg/t2_l8.cfg',
    'pinmame/nvram/t2_l8.nv',
    'pupvideos/t2/play.bat',
    'pupvideos/t2/screens.pup',
    'user/VPReg.stg',
  ]);
  assert.ok(!plan.dirs.some((d) => /[\\/](cache|medias)$/.test(d)), 'le cache de VPX et les médias du menu restent');
  assert.equal(plan.file, path.join(parties, 'Terminator 2 (Williams 1991)', 'Terminator 2 (Williams 1991).vpx'));

  assert.deepEqual(makeTableDouble(plan, path.join(root, 'parties')), { ok: true });
  // Lié : le même fichier sur le disque ; copié : un autre.
  assert.equal(fs.statSync(plan.file).ino, fs.statSync(table(folder).file).ino);
  assert.notEqual(fs.statSync(path.join(plan.dir, 'pinmame', 'nvram', 't2_l8.nv')).ino, fs.statSync(path.join(folder, 'pinmame', 'nvram', 't2_l8.nv')).ino);

  playOn(plan);
  assert.deepEqual(folderChanges(before, folderPrint(folder, { full: true })), [], 'pendant la partie');
  assert.equal(fs.readFileSync(path.join(folder, 'pinmame', 'nvram', 't2_l8.nv'), 'utf8'), 'mémoire de la ROM : 3 billes, records du joueur');

  // Un piège : une jonction vers le dossier de la table, posée dans le double. Le ménage la retire sans la suivre.
  fs.symlinkSync(folder, path.join(plan.dir, 'piège'), 'junction');
  removeTableDouble(plan.dir, path.join(root, 'parties'));
  assert.ok(!fs.existsSync(plan.dir));
  assert.deepEqual(folderChanges(before, folderPrint(folder, { full: true })), [], 'après le ménage');
});

test('ROM jouée depuis le dossier PinMAME commun : le double a la sienne et sa propre mémoire ; la mémoire commune ne bouge pas', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-double-commun-'));
  const folder = path.join(root, 'tables', 'Attack from Mars (Bally 1995)');
  write(path.join(folder, 'Attack from Mars (Bally 1995).vpx'), 'table');
  const shared = path.join(root, 'pinmame');
  write(path.join(shared, 'roms', 'afm_113.zip'), 'rom');
  write(path.join(shared, 'nvram', 'afm_113.nv'), 'mémoire commune');
  write(path.join(shared, 'nvram', 'autre.nv'), 'une autre table');
  const beforeShared = folderPrint(shared, { full: true });
  const parties = path.join(root, 'parties', 'x');
  const planned = planTableDouble(table(folder, { roms: ['AFM_113'], pinmameDir: shared }), parties);
  assert.ok(planned.ok);
  const plan = planned.plan;
  assert.deepEqual(makeTableDouble(plan, path.join(root, 'parties')), { ok: true });
  assert.equal(fs.readFileSync(path.join(plan.dir, 'pinmame', 'nvram', 'afm_113.nv'), 'utf8'), 'mémoire commune');
  assert.ok(!fs.existsSync(path.join(plan.dir, 'pinmame', 'nvram', 'autre.nv')), 'seulement la mémoire de cette ROM');
  write(path.join(plan.dir, 'pinmame', 'nvram', 'afm_113.nv'), 'écrit pendant la partie');
  removeTableDouble(plan.dir, path.join(root, 'parties'));
  assert.deepEqual(folderChanges(beforeShared, folderPrint(shared, { full: true })), []);
  // ROM introuvable : pas de double (PinMAME écrirait dans le dossier commun).
  assert.equal(planTableDouble(table(folder, { roms: [], pinmameDir: shared }), parties).ok, false);
  assert.equal(planTableDouble(table(folder, { roms: ['inconnue'], pinmameDir: shared }), parties).ok, false);
  // Une table sans PinMAME n'en a pas besoin.
  assert.equal(planTableDouble(table(folder, { roms: [], usesPinmame: false }), parties).ok, true);
});

test('pas de double plutôt que de jouer le dossier habituel : table rangée avec d’autres, lien dans son dossier', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-double-refus-'));
  const folder = terminator(root);
  const parties = path.join(root, 'parties', 'x');
  const shared = planTableDouble(table(folder, { ownFolder: false }), parties);
  assert.equal(shared.ok, false);
  fs.symlinkSync(path.join(root, 'ailleurs'), path.join(folder, 'pupvideos', 'lien'), 'junction');
  const linked = planTableDouble(table(folder), parties);
  assert.ok(!linked.ok && /lien vers un autre dossier/.test(linked.reason));
});

test('ménage : rien hors du dossier des parties', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-double-menage-'));
  const precious = path.join(root, 'tables', 'précieux.nv');
  write(precious, 'à garder');
  removeTableDouble(path.join(root, 'tables'), path.join(root, 'parties'));
  removeTableDouble(path.join(root, 'parties', '..', 'tables'), path.join(root, 'parties'));
  assert.equal(fs.readFileSync(precious, 'utf8'), 'à garder');
  const plan: TableDoublePlan = { dir: path.join(root, 'tables'), file: path.join(root, 'tables', 'x.vpx'), dirs: [], links: [], copies: [] };
  assert.equal(makeTableDouble(plan, path.join(root, 'parties')).ok, false, 'un double hors du dossier des parties est refusé');
  assert.equal(fs.readFileSync(precious, 'utf8'), 'à garder');
});

test('application : une partie entre amis joue le double, jamais le dossier habituel ; le journal compare les empreintes', () => {
  const front = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(front, /hooks\.double/);
  assert.match(front, /table: played\.file/);
  const doubles = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'table-double.ts'), 'utf8');
  assert.match(doubles, /folderChanges\(before, folderPrint\(/);
  assert.match(doubles, /removeTableDouble\(/);
});
