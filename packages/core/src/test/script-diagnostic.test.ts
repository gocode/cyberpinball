// Une partie échouée reste visible au diagnostic, sans accuser une autre table ni une partie réparée.
import assert from 'node:assert/strict';
import { test } from 'node:test';
import { scriptRuntimeFinding } from '../scriptdiagnosis';

const TABLE = 'C:/Tables/League/League.vpx';
const LOAD = `INFO LoadGameFromFilename ${TABLE}`;
const FIRST = "ERROR [Player::OnScriptError@1235] Runtime error on line 199, col 1: ActiveX cannot create object: 'System.Collections.ArrayList'";
const CASCADE = "ERROR [Player::OnScriptError@1235] Runtime error on line 291, col 1: Object required: 'UltraDMD'";
const GAME = [LOAD, 'INFO Starting script', FIRST, ...Array(20).fill(CASCADE)].join('\r\n');

test('diagnostic script : première erreur avant la cascade, regroupée dans un seul constat', () => {
  const finding = scriptRuntimeFinding(TABLE, GAME)!;
  assert.equal(finding.code, 'scriptRuntimeError');
  assert.equal(finding.severity, 'warning');
  assert.match(finding.detail, /ligne 199/);
  assert.match(finding.detail, /System.Collections.ArrayList/);
  assert.match(finding.detail, /21 erreurs/);
  assert.ok(finding.detail.length < 400);
  assert.equal(finding.fix, undefined, 'ne prétend pas corriger toute erreur du script');
});

test('diagnostic script : seul le chemin complet de la bonne table compte, indépendamment de la casse', () => {
  assert.ok(scriptRuntimeFinding('c:\\tables\\league\\league.VPX', GAME));
  assert.equal(scriptRuntimeFinding('C:/Tables/Other/League.vpx', GAME), undefined);
  const other = `\nINFO LoadGameFromFilename C:/Tables/Other/League.vpx\nINFO Starting script\n${CASCADE}`;
  assert.match(scriptRuntimeFinding(TABLE, GAME + other)!.detail, /21 erreurs/);
  assert.equal(scriptRuntimeFinding(TABLE, `INFO LoadGameFromFilename C:/Tables/Other/League.vpx\n${FIRST}`), undefined);
  assert.equal(scriptRuntimeFinding(TABLE, FIRST), undefined, 'journal tronqué sans table attribuable');
});

test('diagnostic script : une nouvelle partie saine efface le constat, une extraction ne l’efface pas', () => {
  assert.equal(scriptRuntimeFinding(TABLE, `${GAME}\n${LOAD}\nINFO Starting script\nINFO Startup done`), undefined);
  assert.ok(scriptRuntimeFinding(TABLE, `${GAME}\n${LOAD}\nINFO PinTable Data loaded`));
  assert.equal(scriptRuntimeFinding(TABLE, `${LOAD}\nINFO Starting script\nINFO Startup done\n${LOAD}\nINFO PinTable Data loaded`), undefined);
});

test('diagnostic script : erreur de compilation avant le démarrage du joueur, sans faux constat sur journal vide', () => {
  assert.match(scriptRuntimeFinding(TABLE, `${LOAD}\nERROR Compile error on line 12, col 2: Expected statement`)!.detail, /ligne 12/);
  assert.equal(scriptRuntimeFinding(TABLE, ''), undefined);
});

test('diagnostic script : les scripts non chargés précèdent les erreurs en cascade', () => {
  const unloaded = (file: string) => `ERROR [Main] [ScriptGlobalTable::GetTextFile@366] Unable to load file: ${file}`;
  const broken = [LOAD, 'INFO Starting script', unloaded('LeagueCore.vbs'), unloaded('LeagueMusic.vbs'), unloaded('LeagueCore.vbs'), FIRST].join('\n');
  const finding = scriptRuntimeFinding(TABLE, broken)!;
  assert.equal(finding.code, 'scriptRuntimeError');
  assert.equal(finding.title, 'Script complémentaire non chargé');
  assert.match(finding.detail, /LeagueCore\.vbs, LeagueMusic\.vbs/);
  assert.equal(finding.detail.match(/LeagueCore\.vbs/g)?.length, 1);
  assert.doesNotMatch(finding.detail, /ArrayList/, 'la dépendance non chargée explique la cascade avant toute hypothèse ActiveX');
  assert.equal(finding.fix, undefined, 'le journal ne dit pas si le fichier est absent, inaccessible ou incompatible');
  assert.ok(scriptRuntimeFinding(TABLE, `${LOAD}\n${unloaded('controller.vbs')}`), 'un chargement refusé suffit même sans erreur runtime');
  assert.equal(scriptRuntimeFinding('C:/Tables/Other/League.vpx', broken), undefined);
  assert.equal(scriptRuntimeFinding(TABLE, `${broken}\n${LOAD}\nINFO Starting script\nINFO Startup done`), undefined);
  assert.ok(scriptRuntimeFinding(TABLE, `${broken}\n${LOAD}\nINFO PinTable Data loaded`), 'une extraction n’efface pas la dernière partie');
});
