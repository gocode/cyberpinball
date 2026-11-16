import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  KEYBOARD_EMOJIS,
  afterCaret,
  atWordStart,
  beforeCaret,
  caretOf,
  cleanInserted,
  eraseAfterCaret,
  eraseBeforeCaret,
  insertAtCaret,
  moveCaret,
  type CaretText,
} from '../textedit';

// Clavier à l'écran (novembre 2026) : les flèches déplacent un point d'insertion, et un emoji
// compte pour un seul caractère, jamais coupé en deux.

test('Sans point d’insertion posé, tout s’ajoute à la fin, comme avant', () => {
  const t: CaretText = { value: 'Salu' };
  insertAtCaret(t, 't');
  assert.equal(t.value, 'Salut');
  assert.equal(t.at, undefined);
  assert.equal(caretOf(t), 5);
});

test('Flèche gauche puis une lettre : elle s’insère au milieu, le point la suit', () => {
  const t: CaretText = { value: 'Bnjour' };
  moveCaret(t, 'start');
  moveCaret(t, 1);
  insertAtCaret(t, 'o');
  assert.equal(t.value, 'Bonjour');
  assert.equal(beforeCaret(t), 'Bo');
  assert.equal(afterCaret(t), 'njour');
});

test('Retour arrière et Suppr de part et d’autre du point', () => {
  const t: CaretText = { value: 'abcd', at: 2 };
  assert.ok(eraseBeforeCaret(t));
  assert.equal(t.value, 'acd');
  assert.equal(caretOf(t), 1);
  assert.ok(eraseAfterCaret(t));
  assert.equal(t.value, 'ad');
  assert.equal(caretOf(t), 1);
  moveCaret(t, 'start');
  assert.equal(eraseBeforeCaret(t), false, 'rien avant le début');
  moveCaret(t, 'end');
  assert.equal(eraseAfterCaret(t), false, 'rien après la fin');
  assert.equal(t.at, undefined, 'la fin n’est pas retenue');
});

test('Un emoji se traverse et s’efface d’un seul coup, même composé', () => {
  for (const emoji of ['😀', '❤️', '🕹️', '👍🏽']) {
    const t: CaretText = { value: `a${emoji}b` };
    moveCaret(t, -1);
    moveCaret(t, -1);
    assert.equal(beforeCaret(t), 'a', emoji);
    moveCaret(t, 1);
    assert.equal(beforeCaret(t), `a${emoji}`, emoji);
    assert.ok(eraseBeforeCaret(t));
    assert.equal(t.value, 'ab', emoji);
  }
  // Un point posé au milieu d'un emoji recule à son début.
  assert.equal(caretOf({ value: 'x😀', at: 2 }), 1);
});

test('Le point ne sort jamais du texte', () => {
  const t: CaretText = { value: 'ab' };
  moveCaret(t, 1);
  assert.equal(caretOf(t), 2);
  moveCaret(t, 'start');
  moveCaret(t, -1);
  assert.equal(caretOf(t), 0);
});

test('Majuscule en début de mot : d’après le texte avant le point', () => {
  assert.ok(atWordStart({ value: '' }));
  assert.ok(atWordStart({ value: 'bon jour', at: 4 }));
  assert.ok(!atWordStart({ value: 'bon jour', at: 2 }));
});

test('Texte inséré sans touche : une seule ligne, sans caractère de commande', () => {
  assert.equal(cleanInserted('un\r\ndeux\tel\u0007'), 'un deux el');
  assert.equal(cleanInserted('🎉'), '🎉');
});

test('Panneau des emojis : quatre rangées de dix, chacun un seul caractère affiché', () => {
  assert.equal(KEYBOARD_EMOJIS.length, 40);
  assert.equal(new Set(KEYBOARD_EMOJIS).size, 40);
  const seg = new Intl.Segmenter(undefined, { granularity: 'grapheme' });
  for (const e of KEYBOARD_EMOJIS) assert.equal([...seg.segment(e)].length, 1, e);
});
