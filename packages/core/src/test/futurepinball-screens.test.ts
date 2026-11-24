// Écrans de Future Pinball (packages/core/src/futurepinball-screens.ts, app/src/futurepinball-screens.ts) :
// les préférences du jeu visent le nom GDI du moment de l'écran de chaque rôle. Cas relevé sur un PinCab
// le 24/11/2026 : PlayfieldMonitorID « \\.\DISPLAY2 » alors que le playfield 4K était « \\.\DISPLAY1 » et que
// « \\.\DISPLAY2 » était l'écran du DMD.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { futurePinballScreenChanges, type FuturePinballScreenRoles } from '../futurepinball-screens';
import { REPO_ROOT } from './i18n-scan';

const PLAYFIELD = { gdiName: '\\\\.\\DISPLAY1', width: 3840, height: 2160 };
const BACKGLASS = { gdiName: '\\\\.\\DISPLAY3', width: 1920, height: 1080 };
const ROLES: FuturePinballScreenRoles = { playfield: PLAYFIELD, backglass: BACKGLASS };

/** Préférences du jeu sur le PinCab fautif. */
const STALE: Record<string, string | number> = {
  PlayfieldMonitorID: '\\\\.\\DISPLAY2',
  Width: 3840,
  Height: 2160,
  SecondMonitorEnable: 1,
  BackboxMonitorID: '\\\\.\\DISPLAY3',
  SecondMonitorWidth: 1920,
  SecondMonitorHeight: 1080,
  FullScreen: 1,
  RotateDegrees: 3,
};
const reader = (values: Record<string, string | number>) => (name: string) => values[name];

test('le playfield pointé sur l\'écran du DMD est ramené sur l\'écran du rôle', () => {
  const changes = futurePinballScreenChanges(ROLES, reader(STALE));
  assert.deepEqual(changes, [{ name: 'PlayfieldMonitorID', from: '\\\\.\\DISPLAY2', to: '\\\\.\\DISPLAY1' }]);
});

test('des préférences déjà justes ne changent rien (comparaison sans casse)', () => {
  const ok = { ...STALE, PlayfieldMonitorID: '\\\\.\\display1' };
  assert.deepEqual(futurePinballScreenChanges(ROLES, reader(ok)), []);
});

test('le fronton suit son écran quand le jeu l\'a activé, pas sinon', () => {
  const moved = { ...STALE, PlayfieldMonitorID: '\\\\.\\DISPLAY1', BackboxMonitorID: '\\\\.\\DISPLAY2' };
  assert.deepEqual(futurePinballScreenChanges(ROLES, reader(moved)), [{ name: 'BackboxMonitorID', from: '\\\\.\\DISPLAY2', to: '\\\\.\\DISPLAY3' }]);
  assert.deepEqual(futurePinballScreenChanges(ROLES, reader({ ...moved, SecondMonitorEnable: 0 })), []);
});

test('les résolutions ne changent que si elles ne sont ni droites ni couchées', () => {
  const wrong = { ...STALE, PlayfieldMonitorID: '\\\\.\\DISPLAY1', Width: 1920, Height: 1080 };
  assert.deepEqual(futurePinballScreenChanges(ROLES, reader(wrong)), [
    { name: 'Width', from: 1920, to: 3840 },
    { name: 'Height', from: 1080, to: 2160 },
  ]);
  const turned = { ...STALE, PlayfieldMonitorID: '\\\\.\\DISPLAY1', Width: 2160, Height: 3840 };
  assert.deepEqual(futurePinballScreenChanges(ROLES, reader(turned)), []);
});

test('un jeu jamais lancé (aucune préférence d\'écran) n\'en reçoit pas', () => {
  assert.deepEqual(futurePinballScreenChanges(ROLES, reader({})), []);
});

test('un rôle sans écran ne touche pas aux préférences, et le fronton jamais sur l\'écran du playfield', () => {
  assert.deepEqual(futurePinballScreenChanges({}, reader(STALE)), []);
  const twice = { playfield: PLAYFIELD, backglass: { ...PLAYFIELD } };
  assert.deepEqual(futurePinballScreenChanges(twice, reader({ ...STALE, PlayfieldMonitorID: '\\\\.\\DISPLAY1' })), []);
});

test('applyFuturePinballScreens écrit chaque correction et dit celles que Windows refuse', () => {
  const app = require(path.join(REPO_ROOT, 'app', 'dist', 'futurepinball-screens.js')) as {
    applyFuturePinballScreens(
      roles: FuturePinballScreenRoles,
      read: (name: string) => unknown,
      write: (name: string, value: string | number) => void,
    ): { written: { name: string; from: string | number | undefined; to: string | number }[]; failed: { change: { name: string }; reason: string }[] };
    describeFuturePinballScreenChanges(changes: { name: string; from: string | number | undefined; to: string | number }[]): string;
  };
  const store: Record<string, string | number> = { ...STALE, BackboxMonitorID: '\\\\.\\DISPLAY2' };
  const done = app.applyFuturePinballScreens(ROLES, reader(store), (name, value) => {
    if (name === 'BackboxMonitorID') throw new Error('accès refusé');
    store[name] = value;
  });
  assert.equal(store.PlayfieldMonitorID, '\\\\.\\DISPLAY1');
  assert.deepEqual(done.written.map((c) => c.name), ['PlayfieldMonitorID']);
  assert.deepEqual(done.failed.map((f) => [f.change.name, f.reason]), [['BackboxMonitorID', 'accès refusé']]);
  assert.match(app.describeFuturePinballScreenChanges(done.written), /PlayfieldMonitorID .*DISPLAY2.* → .*DISPLAY1/);
});

test('le lancement d\'une partie de Future Pinball règle ses écrans avant de le lancer, jamais sur des écrans simulés', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const call = source.indexOf('applyFuturePinballScreens(');
  assert.ok(call > 0, 'frontend.ts doit appeler applyFuturePinballScreens avant la partie');
  assert.ok(call < source.indexOf('launchPinballFx({'), 'le réglage doit précéder le lancement du jeu');
  assert.match(source.slice(call - 400, call), /!simulatedDisplays\(\)/, 'jamais le vrai registre sur des écrans simulés');
});
