// Écran annexe qui bride la partie (rapports du 20/11/2026). VPX 10.8.1 présente toutes ses fenêtres ensemble : un
// backglass à 50 Hz calait des parties visées à 120 sur 51 images/s, et le médecin disait « La table rame » pour toutes
// les tables à backglass. Sur une autre borne, écrans annexes à 60 Hz : exactement 60, et 120 sans fenêtre annexe.
// Invariants : l'écran est reconnu dans vpinball.log, la partie est jugée sur sa fréquence (sans les « images en
// retard » que l'alternance de deux durées fabrique), le journal et le constat nomment l'écran, jamais la table ; une
// table qui rame vraiment, ou sans écran annexe plus lent, reste « La table rame ».

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { HEALTH_CHECK_FINDINGS } from '../health';
import { slowTableFinding } from '../slowtable';
import { refreshImpact, refreshNote, type TechDisplay } from '../techsheet';
import { cadenceJournal, cadenceVerdict, parseVpxCadence, readScreenCap, readVpxTargetFps, readVpxWindows, recordGameCadence } from '../vpxcadence';

const at = (s: string) => `2026-11-20 20:28:${s} INFO  [Main] `;
/** Borne à playfield 119,91 Hz et backglass à 50 Hz (partie de 8 Ball). */
const BRIDEE_50 = [
  `${at('28.931')}[VPX::Window::Window@290] Window #0 (3840x2160) was created on display PL4380UH [3840x2160 119.91Hz SDL_PIXELFORMAT_XRGB8888]`,
  `${at('28.932')}[Player::Player@344] Synchronization mode: 3 with maximum FPS: 119.91, display FPS: 119.91`,
  `${at('29.278')}[VPX::Window::Window@290] Window #1 (1920x1080) was created on display 32W_LCD_TV [1920x1080 50Hz SDL_PIXELFORMAT_XRGB8888]`,
  `${at('31.400')}[Player::Player@832] Startup done`,
  "2026-11-20 20:38:46.513 INFO  [Main] [CyberPinballDmd:`anonymous-namespace'::direBilan@287] Cadence end: frames=20374 duration=408.0s fps=49.9 p50=17ms p95=27ms p99=42ms max=125ms late=12.9% stalls=34 worst10s=49.1fps mem=2166MB",
];
/** Autre borne : playfield 120 Hz, backglass et DMD à 60 Hz (Avatar). */
const BRIDEE_60 = [
  '2026-11-20 13:02:38.501 INFO  [Main] [VPX::Window::Window@290] Window #0 (3840x2160) was created on display LG TV SSCR2 [3840x2160 120Hz SDL_PIXELFORMAT_XRGB8888]',
  '2026-11-20 13:02:38.501 INFO  [Main] [Player::Player@344] Synchronization mode: 3 with maximum FPS: 120, display FPS: 120',
  '2026-11-20 13:02:38.901 INFO  [Main] [VPX::Window::Window@290] Window #1 (1920x1080) was created on display LS32DG30X [1920x1080 60Hz SDL_PIXELFORMAT_XRGB8888]',
  '2026-11-20 13:02:38.909 INFO  [Main] [VPX::Window::Window@290] Window #2 (1920x1080) was created on display REALTEK [1920x1080 60Hz SDL_PIXELFORMAT_XRGB8888]',
  "2026-11-20 13:10:19.719 INFO  [Main] [CyberPinballDmd:`anonymous-namespace'::direBilan@287] Cadence end: frames=27278 duration=454.5s fps=60.0 p50=17ms p95=17ms p99=25ms max=26ms late=0.1% stalls=0 worst10s=60.0fps mem=2556MB",
];
/** Même borne, Funhouse : 15 images/s à cause de l'antivirus, backglass à 60 Hz ouvert. Elle rame vraiment. */
const RAME_VRAIMENT = [
  ...BRIDEE_60.slice(0, 3),
  "2026-11-20 19:11:40.626 INFO  [Main] [CyberPinballDmd:`anonymous-namespace'::direBilan@287] Cadence end: frames=1013 duration=65.9s fps=15.4 p50=37ms p95=186ms p99=1358ms max=2178ms late=6.4% stalls=60 worst10s=0.7fps mem=3690MB",
];

const cadence = (lines: string[]) => parseVpxCadence(lines.at(-1)!)!;

test('fenêtres de VPX : le playfield est celle d’avant la synchronisation, les autres sont annexes', () => {
  assert.deepEqual(readVpxWindows(BRIDEE_60), [
    { display: 'LG TV SSCR2', hz: 120, playfield: true },
    { display: 'LS32DG30X', hz: 60, playfield: false },
    { display: 'REALTEK', hz: 60, playfield: false },
  ]);
  // Casque : pas de ligne de synchronisation, la première fenêtre est le playfield.
  assert.equal(readVpxWindows([BRIDEE_50[2]!, BRIDEE_50[0]!])[0]!.playfield, true);
});

test('backglass à 50 Hz : partie bridée, tenue sur 50, nommée dans le journal', () => {
  const c = cadence(BRIDEE_50);
  const target = readVpxTargetFps(BRIDEE_50);
  const cap = readScreenCap(BRIDEE_50, c, target);
  assert.deepEqual(cap, { display: '32W_LCD_TV', hz: 50 });
  // Sans l'écran : « RAME » (49,9 pour 119,9). Avec : tenue, les 12,9 % « en retard » ne comptent pas.
  assert.equal(cadenceVerdict(c, target)!.slow, true);
  assert.deepEqual(cadenceVerdict(c, target, cap), { slow: false, stutters: true });
  assert.match(cadenceJournal('8 Ball', c, target, [], cap), /^Cadence de la partie \(8 Ball\) : BRIDÉE par l'écran « 32W_LCD_TV » à 50 Hz \(À-COUPS\) — 49,9 images\/s pour 119,9 visées/);
});

test('écrans annexes à 60 Hz : bridée à 60, le constat nomme l’écran et pas la table', () => {
  const c = cadence(BRIDEE_60);
  const target = readVpxTargetFps(BRIDEE_60);
  const cap = readScreenCap(BRIDEE_60, c, target)!;
  assert.equal(cap.hz, 60);
  const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ecran-bride-'));
  try {
    const file = path.join(logs, 'Avatar.vpx');
    recordGameCadence(logs, file, c, target, new Date('2026-11-20T13:10:20Z'), false, [], cap);
    const finding = slowTableFinding(logs, file)!;
    assert.equal(finding.code, 'screenCap');
    assert.match(finding.title, /^Partie limitée à 60 images par seconde par l’écran « (LS32DG30X|REALTEK) »$/);
    assert.match(finding.detail, /La table n’y est pour rien/);
    assert.match(finding.detail, /Affichage avancé/);
    assert.doesNotMatch(finding.title, /rame/);
    assert.ok((HEALTH_CHECK_FINDINGS as readonly string[]).includes('screenCap'), 'la Santé signale la table à revoir, avec la bonne raison');
    // Partie suivante sans écran annexe (backglass à 120 Hz) et tenue : plus de constat.
    recordGameCadence(logs, file, parseVpxCadence(BRIDEE_60.at(-1)!.replace('fps=60.0', 'fps=119.9').replace('worst10s=60.0', 'worst10s=119.7'))!, 120, new Date('2026-11-20T14:00:00Z'));
    assert.equal(slowTableFinding(logs, file), undefined);
  } finally {
    fs.rmSync(logs, { recursive: true, force: true });
  }
});

test('table qui rame vraiment, ou sans écran annexe plus lent : toujours « La table rame »', () => {
  const c = cadence(RAME_VRAIMENT);
  assert.equal(readScreenCap(RAME_VRAIMENT, c, 120), undefined, '15 images/s ne sont pas la fréquence d’un écran à 60 Hz');
  assert.equal(readScreenCap(BRIDEE_50.filter((l) => !l.includes('Window #1')), cadence(BRIDEE_50), 119.91), undefined, 'sans backglass ouvert, rien ne bride');
  assert.equal(readScreenCap(BRIDEE_50, cadence(BRIDEE_50), undefined), undefined);
  // Rapport du 21/11/2026 : Daredevil, 62,5 i/s de moyenne près d'un fronton à 60 Hz, mais une image toutes les 8 ms
  // entre 49 arrêts de l'antivirus. Pas bridé par l'écran : la table rame.
  const daredevil = [
    '2026-11-21 14:08:38.235 INFO  [Main] [VPX::Window::Window@290] Window #0 (3840x2160) was created on display PL4380UH [3840x2160 119.91Hz SDL_PIXELFORMAT_XRGB8888]',
    '2026-11-21 14:08:38.235 INFO  [Main] [Player::Player@344] Synchronization mode: 3 with maximum FPS: 119.91, display FPS: 119.91',
    '2026-11-21 14:08:38.542 INFO  [Main] [VPX::Window::Window@290] Window #1 (1920x1080) was created on display 32W_LCD_TV [1920x1080 60Hz SDL_PIXELFORMAT_XRGB8888]',
    "2026-11-21 14:09:28.000 INFO  [Main] [CyberPinballDmd:`anonymous-namespace'::direBilan@287] Cadence end: frames=3150 duration=50.4s fps=62.5 p50=8ms p95=120ms p99=260ms max=1045ms late=20.1% stalls=49 worst10s=23.4fps mem=5770MB",
  ];
  assert.equal(readScreenCap(daredevil, cadence(daredevil), 119.91), undefined);
  const logs = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-ecran-bride-'));
  try {
    const file = path.join(logs, 'Funhouse.vpx');
    recordGameCadence(logs, file, c, 120);
    assert.equal(slowTableFinding(logs, file)!.code, 'slowTable');
  } finally {
    fs.rmSync(logs, { recursive: true, force: true });
  }
});

test('fiche technique : un écran annexe plus lent que le playfield dit qu’il bride toute la partie', () => {
  const backglass: TechDisplay = { role: 'backglass', name: '32W_LCD_TV', width: 1920, height: 1080, hz: 50, offeredMaxHz: 60, connection: 'hdmi', rotation: 0, primary: false };
  const playfield = (hz: number): TechDisplay => ({ role: 'playfield', name: 'PL4380UH', width: 3840, height: 2160, hz, offeredMaxHz: hz, rotation: 0, primary: true });
  assert.equal(refreshImpact(backglass, [playfield(119.91), backglass]), 'cap');
  assert.match(refreshNote(backglass, { kind: 'windows', max: 60 }, 'cap').detail!, /toute la partie suit sa fréquence, playfield compris/);
  // Playfield aussi lent, ou VPX corrigé : sans effet sur la partie.
  assert.equal(refreshImpact(backglass, [playfield(50), backglass]), 'none');
  assert.equal(refreshImpact(backglass, [playfield(119.91), backglass], true), 'none');
  assert.doesNotMatch(refreshNote({ ...backglass, role: 'playfield' }, { kind: 'windows', max: 60 }, 'ball').detail!, /playfield compris/);
});
