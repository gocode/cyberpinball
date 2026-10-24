import assert from 'node:assert/strict';
import { test } from 'node:test';
import { IniDocument } from '../ini';

const SAMPLE = [
  '; réglages faits à la main',
  '[Player]',
  'PlayfieldDisplay = Ancien [0, 0]',
  'BallTrail=1',
  '',
  '[Standalone]',
  'Haptics = 0',
  '',
].join('\r\n');

test('relit le fichier à l’identique sans modification', () => {
  assert.equal(IniDocument.parse(SAMPLE).toString(), SAMPLE);
});

test('remplace une valeur en gardant la forme de la ligne et le reste du fichier', () => {
  const doc = IniDocument.parse(SAMPLE);
  doc.set('Player', 'PlayfieldDisplay', 'S22E450 [-1920, 0]');
  doc.set('player', 'balltrail', '0');
  assert.equal(
    doc.toString(),
    SAMPLE.replace('Ancien [0, 0]', 'S22E450 [-1920, 0]').replace('BallTrail=1', 'BallTrail=0'),
  );
});

test('ajoute une clé en fin de section, avant la ligne vide', () => {
  const doc = IniDocument.parse(SAMPLE);
  doc.set('Player', 'PlayfieldWidth', '1920');
  const lines = doc.toString().split('\r\n');
  assert.equal(lines[4], 'PlayfieldWidth = 1920');
  assert.equal(lines[5], '');
});

test('crée la section si elle n’existe pas', () => {
  const doc = IniDocument.parse(SAMPLE);
  doc.set('Topper', 'TopperOutput', '0');
  assert.ok(doc.toString().endsWith('\r\n[Topper]\r\nTopperOutput = 0\r\n'));
});

test('part d’un fichier vide', () => {
  const doc = IniDocument.parse('');
  doc.set('Player', 'PlayfieldFullScreen', '1');
  assert.equal(doc.toString(), '[Player]\nPlayfieldFullScreen = 1\n');
});
