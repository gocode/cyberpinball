import assert from 'node:assert/strict';
import { test } from 'node:test';
import { EN_MESSAGES } from '../i18n/en';

// Un texte anglais qui cite un écran ou un bouton le cite sous son nom anglais : le joueur ne voit
// jamais le nom français. Le 21/11/2026, l'avertissement du Teensy sans Cabinet.xml disait en anglais
// « Describe your LED strips in "LED et retours (DOF)" ». Ce test relève, dans chaque traduction, les
// passages entre guillemets qui sont eux-mêmes un texte traduit, resté en français.
const QUOTED = /[“"«]\s*([^“”"«»]{3,80}?)\s*[”"»]/g;

test('traductions : un nom d’écran cité dans un texte anglais est le nom anglais', () => {
  const fautifs: string[] = [];
  for (const [source, english] of Object.entries(EN_MESSAGES)) {
    for (const m of english.matchAll(QUOTED)) {
      const quoted = m[1]!;
      const translated = EN_MESSAGES[quoted];
      if (translated !== undefined && translated !== quoted) fautifs.push(`« ${source} » : cite « ${quoted} », à dire « ${translated} »`);
    }
  }
  assert.deepEqual(fautifs, []);
});
