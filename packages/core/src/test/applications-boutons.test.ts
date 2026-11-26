// Applications (26/11/2026) : les boutons de la borne relayés à Edge (app/src/applications-browser.ts,
// compilé), comme dans le Juke-box : un flipper appuyé passe à l'élément cliquable voisin (Maj+Tab, Tab),
// tenu il recule ou avance dans la vidéo (flèches au rythme de seekPressStep), sans que le Maj d'un
// flipper d'encodeur se mêle aux flèches ni que son relâché éclair passe pour le flipper relâché.

import { test } from 'node:test';
import * as assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { appSeekKeyCount, isModifierVk, windowsVk, JUKEBOX_SEEK_HOLD_MS } from '..';

const APP_DIST = path.join(__dirname, '..', '..', '..', '..', 'app', 'dist');
const { watchAppButtons } = require(path.join(APP_DIST, 'applications-browser.js'));
const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

test('la grille route Maj+Tab : flipper gauche, élément précédent', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'app', 'src', 'applications-menu.ts'), 'utf8');
  assert.match(src, /key === 'TabBack' \? session\.key\('Tab', \{ shift: true \}\)/);
});

test('avance : une flèche par 5 s, les modificateurs reconnus', () => {
  assert.deepEqual([5, -10, 30].map(appSeekKeyCount), [1, 2, 6]);
  assert.ok(isModifierVk(windowsVk('ShiftLeft')!) && isModifierVk(windowsVk('ControlRight')!));
  assert.ok(!isModifierVk(windowsVk('KeyZ')!));
});

function cabinet(keys: Record<string, string>, focus = true) {
  const down = new Set<number>();
  const sent: { key: string; lift?: number }[] = [];
  const stop = watchAppButtons({
    keys,
    keysDown: (vks: number[]) => vks.filter((v) => down.has(v)),
    watchJoystick: () => () => undefined,
    browserHasFocus: () => focus,
    key: (key: string, lift?: number) => {
      sent.push({ key, lift });
      // Le vrai geste relâche Maj le temps de la flèche : le relevé suivant peut le voir levé.
      if (lift !== undefined) {
        down.delete(lift);
        setTimeout(() => down.add(lift), 20);
      }
    },
    quit: () => undefined,
    pollMs: 5,
  });
  return { down, sent, stop };
}

test('flipper appuyé : élément précédent, sans avance', async () => {
  const c = cabinet({ leftFlipper: 'ShiftLeft', rightFlipper: 'ShiftRight' });
  c.down.add(windowsVk('ShiftLeft')!);
  await wait(120);
  c.down.delete(windowsVk('ShiftLeft')!);
  await wait(60);
  c.stop();
  assert.deepEqual(c.sent, [{ key: 'TabBack', lift: undefined }]);
});

test('flipper tenu : flèches de l’avance, Maj relâché autour, aucun Tab au relâché', async () => {
  const shift = windowsVk('ShiftRight')!;
  const c = cabinet({ leftFlipper: 'ShiftLeft', rightFlipper: 'ShiftRight' });
  c.down.add(shift);
  await wait(JUKEBOX_SEEK_HOLD_MS + 650);
  c.down.delete(shift);
  await wait(150);
  c.stop();
  assert.ok(c.sent.length >= 2, JSON.stringify(c.sent));
  assert.ok(c.sent.every((s) => s.key === 'ArrowRight' && s.lift === shift), JSON.stringify(c.sent));
});

test('flipper qui envoie déjà une flèche, ou navigateur sans la main : rien de relayé', async () => {
  const native = cabinet({ leftFlipper: 'ArrowLeft' });
  native.down.add(windowsVk('ArrowLeft')!);
  await wait(JUKEBOX_SEEK_HOLD_MS + 400);
  native.down.delete(windowsVk('ArrowLeft')!);
  await wait(40);
  native.stop();
  assert.deepEqual(native.sent, []);

  const away = cabinet({ rightFlipper: 'ShiftRight' }, false);
  away.down.add(windowsVk('ShiftRight')!);
  await wait(JUKEBOX_SEEK_HOLD_MS + 400);
  away.down.delete(windowsVk('ShiftRight')!);
  await wait(40);
  away.stop();
  assert.deepEqual(away.sent, []);
});
