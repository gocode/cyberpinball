// Autres versions de VPX (autres-vpx.ts) : un VPX déjà installé sur le PC (10.8.0…), choisi table par table.
// Invariants : la liste n'accepte qu'un exécutable de VPX 10 d'une autre version
// que celle de Cyber Pinball ; le choix d'une table vit dans son .info sans toucher au reste ; un choix dont le
// VPX a été retiré ne compte plus ; la base de Popper dit avec quel exécutable chaque table était jouée (dossier
// de l'émulateur, ALTEXE), sans rien deviner d'un ALTEXE propre au script de lancement ; une partie avec un autre
// VPX ne prépare rien de ce qui est propre au VPX de Cyber Pinball et n'écrit jamais dans le dossier de l'autre.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync } from 'node:sqlite';
import { test } from 'node:test';
import {
  addOtherVpx,
  checkOtherVpx,
  matchOtherVpx,
  otherVpxFor,
  otherVpxLabel,
  otherVpxRefusal,
  popperGameExe,
  readOtherVpx,
  removeOtherVpx,
  sameVpxVersion,
  vpxChoiceOf,
  withVpxChoice,
  writeOtherVpx,
  type OtherVpx,
} from '../autres-vpx';
import { programsDuringGame } from '../coexistence';
import { setLanguage } from '../i18n';
import { findInstallation, listInstallationTables } from '../installation';
import { NEWS } from '../news';
import { peFileVersion } from '../vc-runtime';
import { frontendSource } from './frontend-source';
import { REPO_ROOT } from './i18n-scan';

/** Le plus petit exécutable Windows (PE32+) qui porte une version de fichier, comme celle de VPinballX64.exe. */
function fakeExe(version: string): Buffer {
  const buf = Buffer.alloc(0x400);
  buf.write('MZ', 0, 'latin1');
  buf.writeUInt32LE(0x80, 0x3c);
  buf.write('PE\0\0', 0x80, 'latin1');
  buf.writeUInt16LE(1, 0x80 + 6); // une section
  buf.writeUInt16LE(0xf0, 0x80 + 20); // en-tête optionnel PE32+
  const opt = 0x98;
  buf.writeUInt16LE(0x20b, opt);
  buf.writeUInt32LE(16, opt + 112 - 4);
  const section = opt + 0xf0;
  buf.write('.rsrc', section, 'latin1');
  buf.writeUInt32LE(0x100, section + 8);
  buf.writeUInt32LE(0x1000, section + 12);
  buf.writeUInt32LE(0x100, section + 16);
  buf.writeUInt32LE(0x200, section + 20);
  const [a, b, c, d] = version.split('.').map(Number) as [number, number, number, number];
  Buffer.from([0xbd, 0x04, 0xef, 0xfe]).copy(buf, 0x200);
  buf.writeUInt32LE(((a << 16) | b) >>> 0, 0x208);
  buf.writeUInt32LE(((c << 16) | d) >>> 0, 0x20c);
  return buf;
}

function write(file: string, data: string | Buffer = 'x'): string {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, data);
  return file;
}

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-autres-vpx-'));

test('le faux exécutable porte bien sa version (comme VPinballX64.exe 10.8.0.2051)', () => {
  assert.equal(peFileVersion(fakeExe('10.8.0.2051')), '10.8.0.2051');
});

test('un autre VPX : un exécutable de VPX 10, d’une autre version que celle de Cyber Pinball', () => {
  const dir = tmp();
  const exe = write(path.join(dir, 'VPinballX64.exe'), fakeExe('10.8.0.2051'));
  assert.deepEqual(checkOtherVpx(exe, '10.8.1-5436'), { ok: true, version: '10.8.0.2051' });
  // La même version que celle de Cyber Pinball : la table n'y perdrait que ses fonctions.
  const same = write(path.join(dir, 'copie', 'VPinballX_BGFX64.exe'), fakeExe('10.8.1.5436'));
  assert.equal(checkOtherVpx(same, '10.8.1-5436').ok, false);
  // Pas l'exécutable de VPX, ou pas VPX 10.
  assert.equal(checkOtherVpx(write(path.join(dir, 'PinUpMenu.exe'), fakeExe('10.8.0.1')), undefined).ok, false);
  assert.equal(checkOtherVpx(write(path.join(dir, 'VPinball995.exe'), fakeExe('9.9.5.0')), undefined).ok, false);
  assert.equal(checkOtherVpx(write(path.join(dir, 'VPinballX_vide.exe'), 'pas un exécutable'), undefined).ok, false);
  assert.equal(checkOtherVpx(path.join(dir, 'VPinballX_absent.exe'), undefined).ok, false);
});

test('versions : celle du fichier et celle du manifeste se comparent', () => {
  assert.ok(sameVpxVersion('10.8.1.5436', '10.8.1-5436'));
  assert.ok(!sameVpxVersion('10.8.0.2051', '10.8.1-5436'));
  assert.ok(!sameVpxVersion('10.8.1.5436', '10.8.1-5437'));
  assert.equal(otherVpxLabel({ version: '10.8.0.2051' }), 'VPX 10.8.0');
});

test('la liste : un exécutable n’y est qu’une fois, chaque entrée a un identifiant stable', () => {
  const dir = tmp();
  let { list, id } = addOtherVpx([], 'C:\\vPinball\\VisualPinball\\VPinballX64.exe', '10.8.0.2051');
  assert.equal(id, 'vpx-10.8.0-2051');
  ({ list, id } = addOtherVpx(list, 'c:\\vpinball\\visualpinball\\vpinballx64.exe', '10.8.0.2051'));
  assert.equal(list.length, 1);
  assert.equal(id, 'vpx-10.8.0-2051');
  ({ list, id } = addOtherVpx(list, 'D:\\Autre\\VPinballX64.exe', '10.8.0.2051'));
  assert.equal(id, 'vpx-10.8.0-2051-2');
  writeOtherVpx(dir, list);
  assert.deepEqual(readOtherVpx(dir), list);
  assert.deepEqual(readOtherVpx(dir).map((v) => v.id), ['vpx-10.8.0-2051', 'vpx-10.8.0-2051-2']);
  assert.deepEqual(removeOtherVpx(list, 'vpx-10.8.0-2051').map((v) => v.id), ['vpx-10.8.0-2051-2']);
  // Un fichier abîmé : liste vide, jamais d'exception (la borne joue avec son VPX).
  fs.writeFileSync(path.join(dir, 'autres-vpx.json'), '{ abîmé');
  assert.deepEqual(readOtherVpx(dir), []);
  fs.writeFileSync(path.join(dir, 'autres-vpx.json'), JSON.stringify({ versions: [{ id: 'x' }, { id: 'y', exe: 'C:\\a\\VPinballX.exe', version: '10.7.4.1' }] }));
  assert.deepEqual(readOtherVpx(dir).map((v) => v.id), ['y']);
});

test('le choix d’une table : dans son .info, sans toucher au reste ; un VPX retiré ne compte plus', () => {
  const list: OtherVpx[] = [{ id: 'vpx-10.8.0-2051', exe: 'C:\\vPinball\\VisualPinball\\VPinballX64.exe', version: '10.8.0.2051' }];
  const info = { Info: { Title: 'T' }, User: { Favorite: true }, CyberPinball: { source: { kind: 'catalog' } } };
  const chosen = withVpxChoice(info, 'vpx-10.8.0-2051');
  assert.equal(vpxChoiceOf(chosen), 'vpx-10.8.0-2051');
  assert.deepEqual(chosen.CyberPinball, { source: { kind: 'catalog' }, vpx: 'vpx-10.8.0-2051' });
  assert.deepEqual(chosen.User, { Favorite: true });
  assert.equal(otherVpxFor(chosen, list)?.exe, list[0]!.exe);
  assert.equal(otherVpxFor(chosen, []), undefined);
  const back = withVpxChoice(chosen, undefined);
  assert.equal(vpxChoiceOf(back), undefined);
  assert.deepEqual(back.CyberPinball, { source: { kind: 'catalog' } });
  // Rien d'autre dans CyberPinball : la section disparaît.
  assert.equal('CyberPinball' in withVpxChoice(withVpxChoice({ Info: {} }, 'x'), undefined), false);
});

test('l’exécutable d’une autre installation retrouve son VPX dans la liste : le même fichier, sinon la même version', () => {
  const list: OtherVpx[] = [{ id: 'a', exe: 'D:\\Copie\\VPinballX64.exe', version: '10.8.0.2051' }];
  assert.equal(matchOtherVpx(list, 'd:\\copie\\vpinballx64.exe', undefined)?.id, 'a');
  assert.equal(matchOtherVpx(list, 'C:\\vPinball\\VisualPinball\\VPinballX_GL64.exe', '10.8.0.2051')?.id, 'a');
  assert.equal(matchOtherVpx(list, 'C:\\vPinball\\VisualPinball\\VPinballX64.exe', '10.8.1.5436'), undefined);
});

test('PinUP Popper : l’exécutable de chaque table d’après son émulateur et son ALTEXE, rien de deviné', () => {
  const root = tmp();
  const vp = path.join(root, 'vPinball');
  const vpx = path.join(vp, 'VisualPinball');
  const old = path.join(vp, 'VisualPinball107');
  const tables = path.join(vpx, 'Tables');
  write(path.join(vpx, 'VPinballX64.exe'), fakeExe('10.8.1.5436'));
  write(path.join(vpx, 'VPinballX_GL64.exe'), fakeExe('10.8.0.2051'));
  write(path.join(old, 'VPinballX.exe'), fakeExe('10.7.4.433'));
  for (const name of ['Habituelle', 'En GL', 'Script maison', 'Ancienne', 'Inconnue de Popper']) write(path.join(tables, `${name}.vpx`));
  const db = new DatabaseSync(write(path.join(vp, 'PinUPSystem', 'PUPDatabase.db'), ''));
  db.exec('create table Emulators (EMUID integer, EmuName text, DirGames text, DirMedia text, DirRoms text, GamesExt text, DirEmulator text)');
  db.exec('create table Games (GameID integer, EMUID integer, GameName text, GameFileName text, ROM text, ALTEXE text)');
  db.prepare('insert into Emulators values (1, ?, ?, ?, ?, ?, ?)').run('Visual Pinball X', tables, path.join(vp, 'POPMedia'), '', 'vpx', vpx);
  db.prepare('insert into Emulators values (2, ?, ?, ?, ?, ?, ?)').run('Visual Pinball 10.7', tables, path.join(vp, 'POPMedia'), '', 'vpx', old);
  db.prepare('insert into Games values (1, 1, ?, ?, null, null)').run('Habituelle', 'Habituelle.vpx');
  db.prepare('insert into Games values (2, 1, ?, ?, null, ?)').run('En GL', 'En GL.vpx', 'VPinballX_GL64');
  db.prepare('insert into Games values (3, 1, ?, ?, null, ?)').run('Script maison', 'Script maison.vpx', 'VPX 10.6');
  db.prepare('insert into Games values (4, 2, ?, ?, null, ?)').run('Ancienne', 'Ancienne.vpx', '');
  db.close();

  const layout = findInstallation(tables)!;
  assert.ok(layout, 'installation reconnue');
  const exeOf = (title: string) => listInstallationTables(layout).find((x) => x.title === title)?.vpxExe;
  assert.equal(exeOf('Habituelle'), path.join(vpx, 'VPinballX64.exe'));
  assert.equal(exeOf('En GL'), path.join(vpx, 'VPinballX_GL64.exe'));
  // Un ALTEXE qui ne nomme aucun fichier : propre au script de lancement de cette installation.
  assert.equal(exeOf('Script maison'), undefined);
  assert.equal(exeOf('Ancienne'), path.join(old, 'VPinballX.exe'));
  // Une table que Popper ne connaît pas : le VPX de l'installation.
  assert.equal(exeOf('Inconnue de Popper'), path.join(vpx, 'VPinballX64.exe'));
  // Ce qu'on propose d'ajouter dans Menu système > Borne > Autres versions de VPX.
  assert.deepEqual(
    [...layout.vpxExes!].sort(),
    [path.join(vpx, 'VPinballX64.exe'), path.join(vpx, 'VPinballX_GL64.exe'), path.join(old, 'VPinballX.exe')].sort(),
  );
  assert.equal(popperGameExe('relatif\\dossier', ''), undefined);
  assert.equal(popperGameExe(vpx, '..\\VisualPinball107\\VPinballX.exe'), undefined);
});

test('une partie refusée avec un autre VPX : introuvable, réglage de l’affichage, partie entre amis', () => {
  const v: OtherVpx = { id: 'a', exe: 'C:\\vPinball\\VisualPinball\\VPinballX64.exe', version: '10.8.0.2051' };
  assert.equal(otherVpxRefusal(v, { exists: true }), undefined);
  assert.match(otherVpxRefusal(v, { exists: false })!.title, /VPX 10\.8\.0/);
  assert.ok(otherVpxRefusal(v, { exists: false })!.lines.includes(v.exe));
  assert.ok(otherVpxRefusal(v, { exists: true, display: true }));
  assert.ok(otherVpxRefusal(v, { exists: true, friends: true }));
});

test('avec un autre VPX, le lecteur des PuP-Packs, dmdext et B2S Server font la partie ; un menu de borne reste un intrus', () => {
  const open = ['PinUpPlayer.exe', 'dmdext.exe', 'B2SBackglassServerEXE.exe', 'PinUpMenu.exe'];
  assert.deepEqual(programsDuringGame(open), ['PinUP Popper', 'PinUP Player', 'dmdext', 'B2S Server']);
  assert.deepEqual(programsDuringGame(open, true), ['PinUP Popper']);
});

test('une partie avec un autre VPX ne prépare rien du VPX de Cyber Pinball et n’écrit pas dans son dossier', () => {
  const src = frontendSource();
  const body = src.slice(src.indexOf('async function play('), src.indexOf('const stopGame = game.stop;'));
  assert.match(body, /const otherVpx = table\.emulator === 'vpx' \? otherVpxFor\(table\.info, readOtherVpx\(loc\.dataDir\)\) : undefined;/);
  // Chaque préparation propre au VPX 10.8.1 de Cyber Pinball est gardée par !otherVpx.
  for (const [what, pattern] of [
    ['PuP-Pack', /if \(!otherVpx\) preparePupPack\(table\);/],
    ['volume de la ROM', /const romVolumeWatched = [^;\n]*!otherVpx;/],
    ['habillage FullDMD', /dressing = loc\.root && !otherVpx/],
    ['position du DMD, réglages en partie', /const configuration = otherVpx \? undefined : loadCabinet/],
    ['réalité virtuelle', /const vrGame = [^;\n]*!otherVpx \? (vrFront\.)?prepareVr/],
    ['plugin du DMD copié dans VPX', /if \(simulated === undefined && !otherVpx\) \{\n\s*const dmdPlugin = installVpxPlugin/],
    ['Vision 3D', /const vision3dSource = [^;\n]*!otherVpx \? prepareVision3d/],
    ['INI de l’enregistrement', /const recordIni = [^;\n]*!otherVpx \? prepareRecordingIni/],
    ['INI de Cyber Pinball', /launchVpx\(\{ exe: install\.exe, ini: otherVpx \? undefined : /],
  ] as const) {
    assert.match(body, pattern, what);
  }
  // Pas de partie dont on ne saurait pas dire pourquoi elle ne se lance pas.
  assert.match(body, /const otherRefused = otherVpx && otherVpxRefusal\(/);
});

// Décision du 18/11/2026 : la fonction dit ce qu'elle fait, sans nommer PinUP Popper ni s'y comparer.
// Popper ne se nomme que dans la reprise d'une autre installation et des médias (installation-import.ts, media-import.ts).
test('les textes visibles des autres versions de VPX ne citent pas PinUP Popper, en français ni en anglais', () => {
  const popper = /popper/i;
  const read = (rel: string) => fs.readFileSync(path.join(REPO_ROOT, rel), 'utf8');

  // La ligne des Nouveautés : titre, détail, suite et chemin, dans les deux langues.
  try {
    for (const lang of ['fr', 'en'] as const) {
      setLanguage(lang);
      const item = NEWS.find((n) => n.id === 'autres-vpx');
      assert.ok(item, 'la ligne autres-vpx des Nouveautés');
      for (const text of [item.title, item.detail, ...item.more, item.where]) assert.doesNotMatch(text, popper, `Nouveautés (${lang}) : ${text}`);
    }
  } finally {
    setLanguage('fr');
  }

  // Les textes de l'écran, de la fiche et du plan d'installation (français), puis leur dictionnaire anglais, qui
  // ne sert qu'à cette fonction (clés françaises et traductions).
  for (const rel of ['app/src/autres-vpx-menu.ts', 'packages/core/src/autres-vpx.ts']) {
    for (const [, text] of read(rel).matchAll(/\b(?:t|tn|tLater)\(\s*'((?:[^'\\]|\\.)*)'/g)) {
      assert.doesNotMatch(text!, popper, `${rel} : ${text}`);
    }
  }
  for (const line of read('packages/core/src/i18n/en/autresvpx.ts').split(/\r?\n/)) {
    if (!line.trim().startsWith('//')) assert.doesNotMatch(line, popper, `i18n/en/autresvpx.ts : ${line.trim()}`);
  }

  // Les notes de version de la fonction : en attente dans changements/, puis rassemblées dans les CHANGELOG.
  const feature = /Autres versions de VPX|cet autre VPX|VPX qui la jouait|Other VPX versions|that other VPX|VPX that played it/;
  const notes = [
    'CHANGELOG.md',
    'CHANGELOG.en.md',
    ...fs.readdirSync(path.join(REPO_ROOT, 'changements')).filter((f) => f.endsWith('.md') && f !== 'LISEZMOI.md').map((f) => `changements/${f}`),
  ];
  let seen = 0;
  for (const rel of notes) {
    for (const line of read(rel).split(/\r?\n/)) {
      if (!line.startsWith('- ') || !feature.test(line)) continue;
      seen++;
      assert.doesNotMatch(line, popper, `${rel} : ${line}`);
    }
  }
  assert.ok(seen >= 6, `notes de version de la fonction retrouvées (${seen})`);
});
