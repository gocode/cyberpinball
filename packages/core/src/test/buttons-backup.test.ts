// Garde-fous de la remise aux touches par défaut des encodeurs (packages/core/src/buttons-backup.ts,
// app/src/buttons-reset.ts) : le 19/11/2026, une seule pression avait remplacé le relevé Pinscape d'un
// PinCab par des touches de clavier, sans confirmation ni copie ; plus aucun bouton ne répondait.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  BUTTONS_BACKUP_FILE,
  clearButtonsBackup,
  DEFAULT_BUTTONS,
  defaultButtonsRefusal,
  defaultNavigation,
  joystickButtonCount,
  loadButtonsBackup,
  saveButtonsBackup,
  withButtonsBackup,
  withDefaultButtons,
  type Cabinet,
} from '..';
import { REPO_ROOT } from './i18n-scan';

const JOY = (n: number) => `SDLJoy_03004c80fafa0000f700000000000000_1;${n}`;
// Relevé du PinCab du 19/11/2026.
const PINCAB = {
  id: 'borne',
  buttons: { leftFlipper: JOY(5), rightFlipper: JOY(4), start: JOY(12), exit: JOY(8), credit: JOY(1), plunger: JOY(9), rightMagna: JOY(6), leftMagna: JOY(7), pause: JOY(13), coinDoor: JOY(10), volumeDown: JOY(23), volumeUp: JOY(11) },
  navigation: { previous: JOY(5), next: JOY(4), confirm: JOY(6), back: JOY(7) },
  vpxManual: ['Input.Mapping.Tilt', 'Player.FXAA'],
} as unknown as Cabinet & { id: string };

test('borne aux boutons de joystick : les touches par défaut sont refusées, avec la raison', () => {
  assert.equal(joystickButtonCount(PINCAB), 12, 'boutons distincts, ceux de l’interface sont les mêmes');
  const reason = defaultButtonsRefusal(PINCAB);
  assert.ok(reason);
  assert.match(reason, /joystick \(12/);
  assert.match(reason, /étape « Boutons »/);
});

test('borne au clavier, ou relevé mêlé : refus seulement s’il y a un bouton de joystick', () => {
  assert.equal(defaultButtonsRefusal({ buttons: { ...DEFAULT_BUTTONS }, navigation: defaultNavigation(DEFAULT_BUTTONS) }), undefined);
  assert.equal(defaultButtonsRefusal(undefined), undefined);
  assert.ok(defaultButtonsRefusal({ buttons: { ...DEFAULT_BUTTONS, volumeUp: JOY(11) } }), 'un seul bouton de joystick suffit : il cesserait de répondre');
});

test('copie avant la remise, puis rétablissement à l’identique', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-boutons-'));
  try {
    assert.equal(loadButtonsBackup(dir), undefined, 'rien de gardé au départ');
    saveButtonsBackup(dir, PINCAB, new Date('2026-11-19T17:47:52Z'));
    const reset = withDefaultButtons(PINCAB);
    assert.equal(reset.buttons?.leftFlipper, 'ShiftLeft');
    const backup = loadButtonsBackup(dir, 'borne');
    assert.ok(backup);
    assert.equal(backup.at, '2026-11-19T17:47:52.000Z');
    const back = withButtonsBackup(reset, backup);
    assert.deepEqual(back.buttons, PINCAB.buttons);
    assert.deepEqual(back.navigation, PINCAB.navigation);
    assert.deepEqual([...(back.vpxManual ?? [])].sort(), [...PINCAB.vpxManual!].sort(), 'réglages [Input] laissés à la main rétablis, les autres gardés');
    assert.equal(loadButtonsBackup(dir, 'autre-configuration'), undefined, 'jamais le relevé d’une autre configuration');
    clearButtonsBackup(dir);
    assert.equal(fs.existsSync(path.join(dir, BUTTONS_BACKUP_FILE)), false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('copie illisible ou vide : rien à rétablir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-boutons-'));
  try {
    fs.writeFileSync(path.join(dir, BUTTONS_BACKUP_FILE), 'pas du JSON');
    assert.equal(loadButtonsBackup(dir), undefined);
    fs.writeFileSync(path.join(dir, BUTTONS_BACKUP_FILE), JSON.stringify({ at: '2026-11-19T00:00:00Z' }));
    assert.equal(loadButtonsBackup(dir), undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('aucune remise sans confirmation : seul « Remplacer » la lance, dans le menu comme dans les réglages', () => {
  const sources = {
    frontend: fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8'),
    settings: fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'settings.ts'), 'utf8'),
  };
  for (const [name, src] of Object.entries(sources)) {
    const direct = [...src.matchAll(/^.*run: \(\) => (resetButtonsFromMenu|resetButtonsHere)\(\).*$/gm)].map((m) => m[0]);
    assert.ok(direct.length >= 1, `${name} : l’action qui remet les touches existe`);
    for (const line of direct) assert.match(line, /label: t\('Remplacer'\)/, `${name} : remise lancée ailleurs que par « Remplacer » : ${line.trim()}`);
    assert.doesNotMatch(src, /[^.\w]resetButtons\(\)/, `${name} : resetButtons sans origine (le journal doit dire qui l’a demandée)`);
  }
});
