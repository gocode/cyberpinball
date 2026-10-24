import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  addConfiguration,
  chooseConfiguration,
  configIniPath,
  explainChoice,
  forceConfiguration,
  rememberChoice,
  renameConfiguration,
  restoreConfiguration,
  trashConfiguration,
  type CabinetSet,
} from '../configurations';
import { toPhysicalScreen } from '../fingerprint';
import { IniDocument } from '../ini';
import type { Cabinet, ObservedDisplay } from '../model';
import { CABINET_V1_BACKUP, createConfiguration, loadCabinet, loadCabinetSet, loadOwnedMemory, saveCabinet, selectConfiguration, updateCabinetSet } from '../store';
import { writeVpxSync } from '../sync';
import { DEFAULT_VPX_PROFILE } from '../vpx';
import { cabinetDisplays, devPcDisplays, emptyCabinet, secondDeskDisplays } from './fixtures';

function tmpDir(): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-configurations-'));
}

/** Modèle de borne pour ces écrans : playfield sur le dernier, backglass sur le premier, DMD sur le troisième s'il y en a un. */
function cabinetFor(displays: ObservedDisplay[]): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  const fp = (i: number) => cabinet.screens[i]!.fingerprint;
  cabinet.roles = { playfield: fp(displays.length - 1), backglass: fp(0), ...(displays.length > 3 && { dmd: fp(2) }) };
  cabinet.playfield = { flipperEdge: 'bottom' };
  return cabinet;
}

/** Les trois postes de l'utilisateur : PC de développement (4 écrans), second poste (principal + 2), borne. */
function threeConfigurations(): CabinetSet {
  let set = addConfiguration(undefined, cabinetFor(devPcDisplays()), 'Développement').set;
  set = addConfiguration(set, cabinetFor(secondDeskDisplays()), 'Second poste').set;
  return addConfiguration(set, cabinetFor(cabinetDisplays()), 'Borne du salon').set;
}

test('migration : l’ancien cabinet.json devient la configuration « Borne », reprise telle quelle', () => {
  const dir = tmpDir();
  const old = { ...cabinetFor(devPcDisplays()), vpxManual: ['Player.BallTrail'], buttons: { start: 'Digit1' } };
  const raw = JSON.stringify(old, null, 2);
  fs.writeFileSync(path.join(dir, 'cabinet.json'), raw, 'utf8');
  fs.writeFileSync(path.join(dir, 'vpx-owned.json'), JSON.stringify({ iniPath: 'VPinballX.ini', values: { 'Player.BGSet': '1' } }), 'utf8');

  const cabinet = loadCabinet(dir)!;
  assert.deepEqual(cabinet, { ...old, id: 'borne', name: 'Borne' });
  // L'ancien fichier est gardé à côté, octet pour octet ; le nouveau a toutes les configurations.
  assert.equal(fs.readFileSync(path.join(dir, CABINET_V1_BACKUP), 'utf8'), raw);
  const saved = JSON.parse(fs.readFileSync(path.join(dir, 'cabinet.json'), 'utf8')) as CabinetSet;
  assert.equal(saved.version, 2);
  assert.equal(saved.active, 'borne');
  // La configuration reprise garde le VPinballX.ini de l'emplacement et sa mémoire des clés écrites.
  assert.equal(configIniPath('D:\\CyberPinball\\config\\VPinballX.ini', cabinet), 'D:\\CyberPinball\\config\\VPinballX.ini');
  assert.deepEqual(loadOwnedMemory(dir, 'VPinballX.ini'), { 'Player.BGSet': '1' });

  // Une seconde lecture ne refait rien : la sauvegarde de l'ancien n'est pas écrasée.
  fs.writeFileSync(path.join(dir, CABINET_V1_BACKUP), 'témoin', 'utf8');
  assert.deepEqual(loadCabinet(dir), cabinet);
  assert.equal(fs.readFileSync(path.join(dir, CABINET_V1_BACKUP), 'utf8'), 'témoin');
});

test('enregistrer le modèle sans configuration : la première s’appelle « Borne » et garde le VPinballX.ini de l’emplacement', () => {
  const dir = tmpDir();
  saveCabinet(dir, cabinetFor(cabinetDisplays()));
  const set = loadCabinetSet(dir)!;
  assert.deepEqual(set.configurations.map((c) => [c.id, c.name, c.iniFile]), [['borne', 'Borne', undefined]]);
  // L'assistant refait la configuration active sans la renommer.
  saveCabinet(dir, { ...cabinetFor(cabinetDisplays()), playfield: { flipperEdge: 'left' } });
  assert.equal(loadCabinet(dir)!.name, 'Borne');
  assert.equal(loadCabinet(dir)!.playfield?.flipperEdge, 'left');
});

test('reconnaissance : chaque poste désigne sa configuration, avec un score expliqué', () => {
  const set = threeConfigurations();
  const dev = chooseConfiguration(set, devPcDisplays());
  assert.deepEqual([dev.status, 'id' in dev && dev.id, dev.status === 'recognized' && dev.partial], ['recognized', 'borne', false]);
  assert.match(explainChoice(set, dev), /« Développement » reconnue : 4 écrans sur 4 retrouvés \(3 par numéro de série, 1 par modèle et port\) — score 360, devant « Second poste »/);

  const desk = chooseConfiguration(set, secondDeskDisplays());
  assert.equal('id' in desk && desk.id, 'second-poste');
  assert.match(explainChoice(set, desk), /3 écrans sur 3 retrouvés \(2 par numéro de série, 1 par modèle et port\)/);

  const cabinet = chooseConfiguration(set, cabinetDisplays());
  assert.equal('id' in cabinet && cabinet.id, 'borne-du-salon');
});

test('écran éteint : la configuration reste choisie, avec un avertissement', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'cabinet.json'), JSON.stringify(threeConfigurations()), 'utf8');
  // Le Philips (DMD) du PC de développement est éteint.
  const observed = devPcDisplays().filter((d) => d.friendlyName !== 'Philips 192E');
  const selection = selectConfiguration(dir, observed)!;
  assert.equal(selection.choice.status, 'recognized');
  assert.equal(selection.choice.status === 'recognized' && selection.choice.partial, true);
  assert.equal(selection.configuration?.name, 'Développement');
  assert.deepEqual(selection.findings.map((f) => f.severity), ['warning']);
  assert.match(selection.findings[0]!.message, /retrouvée en partie : 3 écrans sur 4 retrouvés .* introuvable : « Philips 192E \(1366 × 768\) »/);
  // La synchronisation avertit aussi pour le rôle, sans bloquer.
  const plan = writeVpxSync(dir, path.join(dir, 'VPinballX.ini'), selection.configuration!, observed, DEFAULT_VPX_PROFILE, {}, path.join(dir, 'backups')).plan;
  assert.deepEqual(plan.findings.filter((f) => f.severity === 'blocking'), []);
  assert.ok(plan.findings.some((f) => f.severity === 'warning' && f.message.startsWith('DMD : l\'écran « Philips 192E')));
});

test('aucune correspondance : rien n’est choisi d’office, la plus proche est expliquée', () => {
  const set = threeConfigurations();
  // L'écran intégré seul : commun aux deux postes, mais il manque à chacun plus d'un écran.
  const laptop = [secondDeskDisplays()[0]!];
  const choice = chooseConfiguration(set, laptop);
  assert.equal(choice.status, 'unknown');
  assert.match(explainChoice(set, choice), /Aucune configuration ne correspond aux écrans branchés \(la plus proche : « Second poste », 1 écran sur 3 retrouvé/);

  // Une configuration à un seul écran ne s'impose pas quand trois écrans inconnus s'y ajoutent.
  const alone = addConfiguration(set, cabinetFor(laptop), 'Portable seul').set;
  assert.equal(chooseConfiguration(alone, laptop).status, 'recognized');
  assert.equal(chooseConfiguration(alone, [...laptop, ...strangers()]).status, 'unknown');

  // Sans écran commun du tout.
  const selection = selectConfiguration(writeSet(alone), strangers())!;
  assert.equal(selection.configuration, undefined);
  assert.deepEqual(selection.findings.map((f) => f.severity), ['blocking']);
});

test('ambiguïté : deux configurations sur les mêmes écrans, l’utilisateur choisit et le choix est retenu', () => {
  let set = threeConfigurations();
  set = addConfiguration(set, { ...cabinetFor(cabinetDisplays()), playfield: { flipperEdge: 'left' } }, 'Borne couchée').set;
  const before = chooseConfiguration(set, cabinetDisplays());
  assert.equal(before.status, 'ambiguous');
  assert.deepEqual(before.status === 'ambiguous' && [...before.tied].sort(), ['borne-couchee', 'borne-du-salon']);
  assert.match(explainChoice(set, before), /« Borne du salon » et « Borne couchée » correspondent autant/);

  set = rememberChoice(set, cabinetDisplays(), 'borne-couchee');
  const after = chooseConfiguration(set, cabinetDisplays());
  assert.deepEqual([after.status, 'id' in after && after.id], ['remembered', 'borne-couchee']);
  // Les écrans renumérotés par Windows restent les mêmes écrans.
  const renumbered = cabinetDisplays().reverse().map((d, i) => ({ ...d, gdiName: `\\\\.\\DISPLAY${20 + i}` }));
  assert.equal(chooseConfiguration(set, renumbered).status, 'remembered');
  // Un autre poste n'est pas concerné par ce choix.
  assert.equal(chooseConfiguration(set, devPcDisplays()).status, 'recognized');
});

test('configuration forcée : utilisée quels que soient les écrans, jusqu’au retour à la reconnaissance automatique', () => {
  let set = forceConfiguration(threeConfigurations(), 'second-poste');
  const forced = chooseConfiguration(set, devPcDisplays());
  assert.deepEqual([forced.status, 'id' in forced && forced.id], ['forced', 'second-poste']);
  assert.match(explainChoice(set, forced), /imposée depuis le menu/);
  set = forceConfiguration(set, undefined);
  assert.equal(set.forced, undefined);
  assert.equal(chooseConfiguration(set, devPcDisplays()).status, 'recognized');
});

test('renommer, supprimer (corbeille) et restaurer', () => {
  let set = threeConfigurations();
  set = renameConfiguration(set, 'borne', 'Bureau');
  assert.equal(set.configurations[0]!.name, 'Bureau');
  // Un nom déjà pris reçoit un numéro ; l'identifiant (et donc le VPinballX.ini) ne change pas.
  set = renameConfiguration(set, 'second-poste', 'bureau');
  assert.deepEqual(set.configurations.map((c) => [c.id, c.name]).slice(0, 2), [['borne', 'Bureau'], ['second-poste', 'bureau 2']]);

  set = forceConfiguration(set, 'second-poste');
  set = trashConfiguration(set, 'second-poste', new Date('2026-10-21T10:00:00Z'));
  assert.deepEqual(set.configurations.map((c) => c.id), ['borne', 'borne-du-salon']);
  assert.equal(set.forced, undefined);
  assert.equal(set.trash?.[0]?.deletedAt, '2026-10-21T10:00:00.000Z');
  assert.equal(chooseConfiguration(set, secondDeskDisplays()).status, 'unknown');
  // Une nouvelle configuration ne reprend pas l'identifiant d'une configuration à la corbeille.
  assert.equal(addConfiguration(set, cabinetFor(secondDeskDisplays()), 'Second poste').configuration.id, 'second-poste-2');

  set = restoreConfiguration(set, 'second-poste');
  assert.equal(set.trash?.length, 0);
  assert.equal(chooseConfiguration(set, secondDeskDisplays()).status, 'recognized');
  // La dernière configuration ne se supprime pas.
  const single = addConfiguration(undefined, cabinetFor(cabinetDisplays())).set;
  assert.equal(trashConfiguration(single, 'borne'), single);
});

test('bascule aller-retour entre deux postes : aucun réglage fait à la main n’est perdu', () => {
  const dir = tmpDir();
  const baseIni = path.join(dir, 'config', 'VPinballX.ini');
  const backups = path.join(dir, 'backups');
  /** Ce que font le démarrage et chaque partie : reconnaître la configuration, puis synchroniser son fichier. */
  const sync = (observed: ObservedDisplay[]) => {
    const selection = selectConfiguration(dir, observed)!;
    const iniPath = configIniPath(baseIni, selection.configuration);
    return { selection, iniPath, ...writeVpxSync(dir, iniPath, selection.configuration!, observed, DEFAULT_VPX_PROFILE, {}, backups) };
  };
  const handEdit = (file: string, section: string, key: string, value: string) => {
    const doc = IniDocument.parse(fs.readFileSync(file, 'utf8'));
    doc.set(section, key, value);
    fs.writeFileSync(file, doc.toString(), 'utf8');
  };

  // PC de développement : la configuration reprise, avec le VPinballX.ini de l'emplacement.
  saveCabinet(dir, cabinetFor(devPcDisplays()));
  const first = sync(devPcDisplays());
  assert.equal(first.iniPath, baseIni);
  // Réglages faits à la main dans VPX : un réglage propre (qualité) et une clé gérée (écran du backglass).
  handEdit(baseIni, 'Player', 'AAFactor', '1.5');
  handEdit(baseIni, 'Backglass', 'BackglassOutput', '0');

  // Second poste : nouvelle configuration (assistant), son fichier part d'une copie du premier.
  const desk = createConfiguration(dir, baseIni, cabinetFor(secondDeskDisplays()), secondDeskDisplays(), 'Second poste');
  assert.equal(configIniPath(baseIni, desk), path.join(dir, 'config', 'VPinballX-second-poste.ini'));
  assert.equal(IniDocument.parse(fs.readFileSync(configIniPath(baseIni, desk), 'utf8')).get('Player', 'AAFactor'), '1.5');
  const devIni = fs.readFileSync(baseIni, 'utf8');
  const onDesk = sync(secondDeskDisplays());
  assert.equal(onDesk.selection.configuration?.id, 'second-poste');
  assert.equal(onDesk.iniPath, configIniPath(baseIni, desk));
  assert.equal(IniDocument.parse(fs.readFileSync(onDesk.iniPath, 'utf8')).get('Player', 'PlayfieldDisplay'), 'BenQ GW2480 [3840, 0]');
  handEdit(onDesk.iniPath, 'Player', 'NudgeStrength', '0.03');
  // Le fichier du PC de développement n'a pas été touché.
  assert.equal(fs.readFileSync(baseIni, 'utf8'), devIni);

  // Retour au PC de développement : constat du changement, réglages faits à la main intacts.
  const back = sync(devPcDisplays());
  assert.equal(back.selection.configuration?.id, 'borne');
  assert.equal(back.selection.previous?.id, 'second-poste');
  assert.match(back.selection.findings[0]!.message, /^Configuration changée : « Borne » à la place de « Second poste »/);
  const devDoc = IniDocument.parse(fs.readFileSync(baseIni, 'utf8'));
  assert.equal(devDoc.get('Player', 'AAFactor'), '1.5');
  assert.equal(devDoc.get('Backglass', 'BackglassOutput'), '0');
  assert.equal(devDoc.get('Player', 'PlayfieldDisplay'), 'PLX2283HSU [1920, 0]');
  // La clé gérée changée à la main est signalée, pas écrasée ; aucune autre ne passe pour une modification.
  assert.deepEqual(back.plan.manualEdits.map((e) => `${e.section}.${e.key}`), ['Backglass.BackglassOutput']);

  // Et de nouveau le second poste : son propre réglage est toujours là, sans fausse modification à la main.
  const again = sync(secondDeskDisplays());
  assert.equal(IniDocument.parse(fs.readFileSync(again.iniPath, 'utf8')).get('Player', 'NudgeStrength'), '0.03');
  assert.deepEqual(again.plan.manualEdits, []);
  assert.equal(again.report, undefined);
  // Chaque fichier a sa mémoire des clés écrites.
  assert.equal(loadOwnedMemory(dir, baseIni)?.['Player.PlayfieldDisplay'], 'PLX2283HSU [1920, 0]');
  assert.equal(loadOwnedMemory(dir, again.iniPath)?.['Player.PlayfieldDisplay'], 'BenQ GW2480 [3840, 0]');
});

test('choix sur l’écran de choix : la configuration devient active pour ces écrans', () => {
  const dir = writeSet(threeConfigurations());
  const laptop = [secondDeskDisplays()[0]!];
  assert.equal(selectConfiguration(dir, laptop)!.configuration, undefined);
  updateCabinetSet(dir, (set) => rememberChoice(set, laptop, 'second-poste'));
  const selection = selectConfiguration(dir, laptop)!;
  assert.equal(selection.configuration?.id, 'second-poste');
  assert.equal(loadCabinet(dir)?.id, 'second-poste');
});

/** Trois écrans qu'aucune configuration ne connaît. */
function strangers(): ObservedDisplay[] {
  return cabinetDisplays().map((d, i) => ({ ...d, edid: undefined, devicePath: d.devicePath.replace(/UID\d+/, `UID${7000 + i}`) }));
}

function writeSet(set: CabinetSet): string {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'cabinet.json'), JSON.stringify(set), 'utf8');
  return dir;
}

test('garde-fou : l’application n’écrit jamais dans le VPinballX.ini de l’emplacement sans passer par la configuration', () => {
  // Locations.vpxIni n'est que le dossier et le fichier de la première configuration : le lire
  // directement ferait lire ou écrire à VPX, aux réglages ou à l'assistant le fichier d'une autre.
  const appDir = path.join(__dirname, '..', '..', '..', '..', 'app', 'src');
  const misuses: string[] = [];
  for (const file of fs.readdirSync(appDir).filter((f) => f.endsWith('.ts'))) {
    fs.readFileSync(path.join(appDir, file), 'utf8')
      .split('\n')
      .forEach((line, i) => {
        if (/\.vpxIni\b/.test(line) && !/(configIniPath|createConfiguration)\([^)]*\.vpxIni\b/.test(line)) misuses.push(`${file}:${i + 1} ${line.trim()}`);
      });
  }
  assert.deepEqual(misuses, []);
});
