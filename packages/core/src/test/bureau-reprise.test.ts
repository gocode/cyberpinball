// Aller-retour au bureau sans rien perdre (16/11/2026).
//
// 1. Ctrl+Maj+D ne déplace plus la sélection : Ctrl et Maj (MagnaSave et flipper sur un clavier)
//    n'agissent pas quand ils font partie d'un raccourci (modifier-chords.ts).
// 2. Le mode bureau garde l'écran ouvert : au retour, on est là où on l'avait quitté.
// 3. Une relance au retour (quart de tour de l'écran) ou une autre relance technique reprend la
//    table sélectionnée et la rubrique du menu système (menu-resume.ts).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { CHORD_HOLD_MS, createModifierChords, type ChordKey } from '../modifier-chords';
import { RESUME_FLAG, readResume, resumeArg, withoutResume } from '../menu-resume';
import { isAppShortcut, SHORTCUTS } from '../shortcuts';

const APP = path.join(__dirname, '..', '..', '..', '..', 'app');

/** Banc du filtre : horloge à la main, et ce que reçoit le menu. */
function bench() {
  const got: string[] = [];
  let pending: { run: () => void; ms: number } | undefined;
  const chords = createModifierChords<ChordKey>({
    down: (input) => (got.push(`down ${input.code}${input.isAutoRepeat ? ' (répété)' : ''}`), true),
    up: (input) => void got.push(`up ${input.code}`),
    isShortcut: isAppShortcut,
    setTimer: (run, ms) => (pending = { run, ms }),
    clearTimer: () => (pending = undefined),
  });
  const mods = { control: false, shift: false, alt: false, meta: false };
  const flag = (code: string) => (code.startsWith('Control') ? 'control' : code.startsWith('Shift') ? 'shift' : code.startsWith('Alt') ? 'alt' : code.startsWith('Meta') ? 'meta' : undefined);
  const key = (type: 'keyDown' | 'keyUp', code: string, isAutoRepeat = false): ChordKey => {
    const f = flag(code);
    if (f) mods[f] = type === 'keyDown';
    return { type, code, isAutoRepeat, ...mods };
  };
  return {
    got,
    down: (code: string, repeat = false) => chords.down(key('keyDown', code, repeat)),
    up: (code: string) => chords.up(key('keyUp', code)),
    /** Le délai court jusqu'au bout. */
    elapse: () => {
      const p = pending;
      pending = undefined;
      p?.run();
    },
    timerMs: () => pending?.ms,
  };
}

test('Ctrl+Maj+D : ni le MagnaSave gauche (Ctrl), ni le flipper gauche (Maj), seulement le raccourci', () => {
  const b = bench();
  assert.equal(b.down('ControlLeft'), true, 'la page ne voit pas l’appui en attente');
  b.down('ShiftLeft');
  b.down('KeyD');
  b.down('KeyD', true);
  b.up('KeyD');
  b.up('ShiftLeft');
  b.up('ControlLeft');
  // Ni leur appui, ni leur relâchement (MagnaSave relâché : bascule de zone dans les écrans de gestion).
  assert.deepEqual(b.got, ['down KeyD', 'down KeyD (répété)', 'up KeyD']);
});

test('Ctrl+Maj+D même lent : chaque modificateur de plus relance le délai', () => {
  const b = bench();
  b.down('ControlLeft');
  assert.equal(b.timerMs(), CHORD_HOLD_MS);
  b.down('ShiftLeft');
  assert.equal(b.timerMs(), CHORD_HOLD_MS);
  b.down('KeyD');
  b.elapse();
  assert.deepEqual(b.got, ['down KeyD']);
});

test('Maj seul (flipper au clavier) : agit au relâchement, ou tenu au-delà du délai, puis se répète', () => {
  const tap = bench();
  tap.down('ShiftLeft');
  assert.deepEqual(tap.got, []);
  tap.up('ShiftLeft');
  assert.deepEqual(tap.got, ['down ShiftLeft', 'up ShiftLeft']);

  const hold = bench();
  hold.down('ShiftRight');
  hold.down('ShiftRight', true);
  hold.elapse();
  hold.down('ShiftRight', true);
  hold.up('ShiftRight');
  assert.deepEqual(hold.got, ['down ShiftRight', 'down ShiftRight (répété)', 'up ShiftRight']);
});

test('Modificateur suivi d’une touche ordinaire (Maj puis une lettre) : il agit d’abord, comme avant', () => {
  const b = bench();
  b.down('ShiftLeft');
  b.down('KeyA');
  b.up('KeyA');
  b.up('ShiftLeft');
  assert.deepEqual(b.got, ['down ShiftLeft', 'down KeyA', 'up KeyA', 'up ShiftLeft']);
});

test('Mode invité : les quatre boutons de la combinaison (Maj et Ctrl des deux côtés) arrivent tous, tenus ensemble, dans l’ordre', () => {
  const b = bench();
  for (const code of ['ShiftLeft', 'ControlLeft', 'ShiftRight', 'ControlRight']) b.down(code);
  assert.deepEqual(b.got, []);
  b.elapse();
  assert.deepEqual(b.got, ['down ShiftLeft', 'down ControlLeft', 'down ShiftRight', 'down ControlRight']);
  b.up('ControlRight');
  assert.deepEqual(b.got.at(-1), 'up ControlRight');
});

test('Relâchement perdu (fenêtre quittée) : un modificateur que l’appui suivant ne dit plus tenu n’agit pas', () => {
  const chords = createModifierChords<ChordKey>({ down: (i) => (got.push(i.code), true), up: () => undefined, isShortcut: isAppShortcut, setTimer: () => 1, clearTimer: () => undefined });
  const got: string[] = [];
  chords.down({ type: 'keyDown', code: 'ControlLeft', control: true });
  chords.down({ type: 'keyDown', code: 'Digit1' });
  assert.deepEqual(got, ['Digit1']);
});

test('Raccourcis de Cyber Pinball reconnus : Ctrl+Maj+D, Ctrl+Maj+K, Ctrl+Q ; pas Échap seul ni Maj+lettre', () => {
  assert.equal(isAppShortcut({ code: 'KeyD', control: true, shift: true }), true);
  assert.equal(isAppShortcut({ code: 'KeyK', control: true, shift: true }), true);
  assert.equal(isAppShortcut({ code: 'KeyQ', control: true }), true);
  assert.equal(isAppShortcut({ code: SHORTCUTS.vrExit.code }), false);
  assert.equal(isAppShortcut({ code: 'KeyD', shift: true }), false);
});

test('Reprise : la place passe par la ligne de commande et ne s’hérite pas d’une relance à l’autre', () => {
  const arg = resumeArg({ table: 'C:\\Tables\\Été « spécial » & co.vpx', system: { group: 'borne', chosen: 'desktop' } })!;
  assert.ok(arg.startsWith(RESUME_FLAG));
  assert.doesNotMatch(arg, /\s/, 'un seul argument, sans espace');
  assert.deepEqual(readResume(['app', '--sans-ouverture', arg]), { table: 'C:\\Tables\\Été « spécial » & co.vpx', system: { group: 'borne', chosen: 'desktop' } });
  assert.deepEqual(withoutResume(['app', arg, '--sans-ouverture']), ['app', '--sans-ouverture']);
  assert.equal(resumeArg({}), undefined);
  assert.equal(readResume(['app', `${RESUME_FLAG}%E0%A4%A`]), undefined, 'illisible : ignorée');
  assert.equal(readResume(['app', `${RESUME_FLAG}${encodeURIComponent('{"table":3}')}`]), undefined, 'valeurs d’un autre type : ignorées');
});

test('frontend : le bureau garde l’écran ouvert, la relance reprend sa place, D tenu ne repart pas au bureau', () => {
  const frontend = fs.readFileSync(path.join(APP, 'src', 'frontend.ts'), 'utf8');
  const showDesktop = /\nfunction showDesktop\(\): boolean \{([\s\S]*?)\r?\n\}/.exec(frontend)![1]!;
  assert.doesNotMatch(showDesktop, /library\.leave\(\)/, 'le bureau ne ferme pas l’écran ouvert');
  assert.match(frontend, /if \(moved\) return relaunchMenu\(\);/);
  assert.match(frontend, /resumeMenuPlace\(readResume\(process\.argv\), Boolean\(startupScreens\)\);/);
  assert.match(frontend, /if \(matchesShortcut\(input, SHORTCUTS\.desktop\)\) return input\.isAutoRepeat \? true :/);
  const library = fs.readFileSync(path.join(APP, 'src', 'library.ts'), 'utf8');
  // Reprise : la rubrique rouverte sur l'entrée, sans la relancer (« Bureau Windows » ne repart pas au bureau).
  const reopen = /\n  function reopenSystem\([^)]*\): boolean \{([\s\S]*?)\r?\n  \}/.exec(library)![1]!;
  assert.match(reopen, /openSystemGroup\(group, chosen\)/);
  assert.doesNotMatch(reopen, /runSystemEntry|\.run\(\)/);
});
