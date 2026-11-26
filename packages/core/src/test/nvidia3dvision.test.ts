// Lunettes actives NVIDIA 3D Vision (nvidia3dvision.ts) : un manque par constat, avec sa marche à suivre ;
// les réglages de la partie (mode direct, Direct3D 11) ; le bilan tiré du journal du VPX corrigé ;
// le choix des lunettes gardé dans le réglage des Lunettes 3D ; le journal relu depuis le lancement de la
// partie (app/src/anaglyph.ts, chargé compilé).
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { anaglyphGameSettings, anaglyphWheelRelief, DEFAULT_ANAGLYPH, isAnaglyphKey, parseAnaglyphSetting, type AnaglyphSetting } from '../anaglyph';
import {
  cutStereoAtStart,
  fixManagerRunning,
  isNvidia3dVisionEmitter,
  STARTUP_STEREO_SETTLE_MS,
  NVIDIA_3DVISION_LAST_DRIVER,
  nvidia3dVisionModeUnsupported,
  NVIDIA_STEREO_MODE,
  nvidia3dVisionGameSettings,
  nvidia3dVisionIssues,
  nvidia3dVisionOutcome,
  nvidia3dVisionOutcomeText,
  nvidia3dVisionReadyText,
  nvidia3dVisionUnchecked,
  nvidiaDriverLabel,
  playfieldOnPrimary,
  type Nvidia3dVisionFacts,
} from '../nvidia3dvision';
import { VR_REFUSED_FXAA, VR_STEREO_FXAA } from '../vr';
import { NOTICE_DETAIL_MAX, NOTICE_RULES, noticeText } from '../notices';

const NV: AnaglyphSetting = { ...DEFAULT_ANAGLYPH, mode: 'on', kind: 'nvidia' };
const READY: Nvidia3dVisionFacts = { nvapi: true, driver: 45206, stereo: true, emitter: true, playfieldPrimary: true, vpxSupported: true };
const ids = (f: Nvidia3dVisionFacts, platform = 'win32') => nvidia3dVisionIssues(f, platform).map((i) => i.id);
const get = (settings: { key: string; value: string }[], key: string) => settings.find((s) => s.key === key)?.value;

test('tout est là : aucun manque', () => {
  assert.deepEqual(ids(READY), []);
});

test('hors Windows, ou sans pilote NVIDIA, un seul constat : le reste ne se lit pas', () => {
  assert.deepEqual(ids(READY, 'linux'), ['not-windows']);
  assert.deepEqual(ids({ nvapi: false, emitter: false, playfieldPrimary: false }), ['no-nvidia']);
});

test('un pilote après le 452.06 : à remplacer, sans constat sur la stéréo qu’il ne peut pas avoir', () => {
  assert.equal(NVIDIA_3DVISION_LAST_DRIVER, 45206);
  assert.deepEqual(ids({ ...READY, driver: 58092, stereo: undefined }), ['driver-too-new']);
  const [issue] = nvidia3dVisionIssues({ ...READY, driver: 58092 }, 'win32');
  assert.ok(issue);
  assert.match(issue.title, /580\.92/);
  assert.ok(issue.steps.some((s) => s.includes('452.06')));
  assert.ok(issue.steps.some((s) => s.includes('Enable Driver Hack')));
  assert.deepEqual(ids({ ...READY, driver: 42531 }), [], 'un pilote plus ancien convient');
});

// Essais sur la borne, 24 et 25/11/2026 : Cyber Pinball active lui-même la stéréo globale avant une partie
// en relief et la coupe après (active pendant une partie à plat, des éléments des tables disparaissent).
// Coupée n'est donc pas un manque ; seulement son pilote muet, ou une activation restée sans effet
// (3D Fix Manager ouvert, son bouton « Enable 3D » sur Off), avec la marche à suivre qui le dit.
test('stéréo coupée : pas un manque, Cyber Pinball l’active ; muette ou refusée : un constat', () => {
  assert.deepEqual(ids({ ...READY, stereo: false }), []);
  assert.deepEqual(ids({ ...READY, stereo: undefined }), ['stereo-disabled']);
  const [refused] = nvidia3dVisionIssues({ ...READY, stereo: false, stereoRefused: true }, 'win32');
  assert.equal(refused?.id, 'stereo-disabled');
  assert.ok(refused.steps.some((s) => s.includes('3D Fix Manager') && s.includes('Enable 3D')));
  assert.deepEqual(ids({ ...READY, stereo: true, stereoRefused: true }), [], 'activée malgré tout : rien à dire');
  assert.match(nvidia3dVisionReadyText({ ...READY, stereo: false }).detail, /activée pour chaque partie en relief/);
});

// PinCab, 25/11/2026 : 3D Fix Manager resté ouvert (réduit), chaque partie lancée en relief s'est jouée à plat,
// la raison seulement dans le journal ; et après un refus, Cyber Pinball ne retentait plus jusqu'à sa relance.
// Désormais : 3D Fix Manager nommé quand il tourne, la raison dite par-dessus VPX, un nouvel essai à chaque partie.
test('partie en relief jouée à plat : la raison à l’écran, 3D Fix Manager nommé, un nouvel essai à chaque partie', () => {
  assert.ok(fixManagerRunning(['explorer.exe', '3DFixManager.exe']));
  assert.ok(fixManagerRunning(['3dfixmanager']));
  assert.ok(!fixManagerRunning(['VPinballX_BGFX64.exe', 'FixManager.exe']));
  const [named] = nvidia3dVisionIssues({ ...READY, stereo: false, stereoRefused: true, fixManagerOpen: true }, 'win32');
  assert.equal(named?.id, 'stereo-disabled');
  assert.match(named.title, /3D Fix Manager bloque la 3D : ferme-le/);
  assert.ok(named.title.length <= NOTICE_DETAIL_MAX, 'tient dans le détail d’une annonce');
  const [generic] = nvidia3dVisionIssues({ ...READY, stereo: false, stereoRefused: true, fixManagerOpen: false }, 'win32');
  assert.match(generic!.title, /n’a pas pu activer/);
  // L'annonce : par-dessus VPX, hors de l'Activité récente.
  const rule = NOTICE_RULES['stereo-flat'];
  assert.equal(rule.away, true);
  assert.equal(rule.journal, false);
  const view = noticeText('stereo-flat', [{ kind: 'stereo-flat', key: 'stereo-flat|x', at: 0, subject: named.title }]);
  assert.match(view.title, /Partie à plat/);
  assert.match(view.detail ?? '', /3D Fix Manager/);
  // Le front-end : la raison annoncée, et le refus précédent ignoré pour décider d'essayer encore.
  const app = path.join(REPO_ROOT, 'app', 'src');
  const menu = fs.readFileSync(path.join(app, 'anaglyph-menu.ts'), 'utf8');
  assert.match(menu, /nvidia3dVisionIssues\(\{ \.\.\.facts, stereoRefused: false \}\)/);
  assert.match(menu, /ctx\.flatNotice\(issues\[0\]!\)/);
  assert.match(fs.readFileSync(path.join(app, 'frontend.ts'), 'utf8'), /flatNotice: \(issue\) => menuNotices\.push\(\[\{ kind: 'stereo-flat'/);
  assert.match(fs.readFileSync(path.join(app, 'nvidia-3dvision.ts'), 'utf8'), /stereoRefused: true, \.\.\.fixManagerFact\(\)/);
});

// NVAPI garde dans un même processus l'état de la stéréo lu la première fois : Cyber Pinball le lisait
// « coupé » pendant qu'une sonde neuve le lisait « activé ». Le front-end ne charge jamais nvapi64.dll
// lui-même : la sonde, un processus neuf à chaque lecture, fabriquée à part.
test('le pilote NVIDIA se lit par un processus neuf, jamais dans le front-end', () => {
  const app = path.join(REPO_ROOT, 'app', 'src');
  const front = fs.readFileSync(path.join(app, 'nvidia-3dvision.ts'), 'utf8');
  assert.doesNotMatch(front, /from 'koffi'|require\('koffi'\)/);
  assert.match(front, /path\.join\(__dirname, 'sonde-nvidia-3dvision\.js'\)/);
  const sonde = fs.readFileSync(path.join(app, 'sonde-nvidia-3dvision.ts'), 'utf8');
  for (const id of ['0x239c4545', '0x2ec50c2b', '0x348ff8e1']) assert.ok(sonde.includes(id), id);
});

// PinCab, 25/11/2026 : la stéréo globale activée par 3D Fix Manager figeait chaque lancement sur la première
// image de l'ouverture. Coupée au lancement, avant toute fenêtre, et seulement quand elle est active ;
// relue après coup, pour dire quand un programme ouvert la remet aussitôt.
test('au lancement, la stéréo globale active est coupée, puis relue', async () => {
  const run = async (states: (boolean | undefined)[], nvapi = true) => {
    const ops: string[] = [];
    let waited = 0;
    const result = await cutStereoAtStart(
      async (op) => {
        ops.push(op);
        const stereo = op === 'read' ? states.shift() : undefined;
        return { nvapi, ...(stereo !== undefined ? { stereo } : {}) };
      },
      async (ms) => void (waited += ms),
    );
    return { result, ops, waited };
  };
  assert.deepEqual(await run([false]), { result: { before: false }, ops: ['read'], waited: 0 }, 'déjà coupée : une seule lecture');
  assert.deepEqual(await run([undefined]), { result: {}, ops: ['read'], waited: 0 }, 'pas de pilote 3D : rien');
  assert.deepEqual(await run([true], false), { result: {}, ops: ['read'], waited: 0 }, 'pas de pilote NVIDIA : rien');
  assert.deepEqual(await run([true, false]), { result: { before: true, after: false }, ops: ['read', 'disable', 'read'], waited: STARTUP_STEREO_SETTLE_MS });
  assert.deepEqual((await run([true, true])).result, { before: true, after: true }, '3D Fix Manager la remet : dit');
  // Lancée avant ready, attendue avant toute fenêtre : demarrage-bloquant.test.ts.
});

// La table de l'émetteur stocke la fréquence pixel sur 32 bits (relevé sur une borne réelle, 25/11/2026) :
// la 4K à 120 Hz (1 075 MHz) y entre, seul NvTimingsEd plafonne sa saisie à 650 MHz. La définition n'exclut
// donc rien ; seule une fréquence sous 100 Hz rend les lunettes inutilisables, et se dit.
test('seul un playfield sous 100 Hz est dit hors de portée des lunettes', () => {
  assert.equal(nvidia3dVisionModeUnsupported({ width: 3840, height: 2160, hz: 119.91 }), undefined, 'la 4K à 120 Hz n’est pas exclue');
  assert.equal(nvidia3dVisionModeUnsupported({ width: 3840, height: 2160, hz: 99.9 }), undefined);
  assert.equal(nvidia3dVisionModeUnsupported({ width: 3840, height: 2160, hz: 60 }), 'hz');
  assert.equal(nvidia3dVisionModeUnsupported({ width: 2560, height: 1440, hz: 120 }), undefined);
  assert.equal(nvidia3dVisionModeUnsupported({ width: 1920, height: 1080, hz: 119.98 }), undefined);
  assert.equal(nvidia3dVisionModeUnsupported({ width: 1920, height: 1080, hz: 59.94 }), 'hz');
  assert.deepEqual(ids({ ...READY, primaryMode: { width: 3840, height: 2160, hz: 119.91 } }), []);
  const [issue] = nvidia3dVisionIssues({ ...READY, primaryMode: { width: 3840, height: 2160, hz: 60 } }, 'win32');
  assert.equal(issue?.id, 'mode-unsupported');
  assert.match(issue.title, /3840x2160 à 60 Hz/);
  assert.deepEqual(ids({ ...READY, playfieldPrimary: false, primaryMode: { width: 3840, height: 2160, hz: 60 } }), ['playfield-not-primary'], 'l’écran principal n’est pas le playfield : son mode ne dit rien');
});

test('émetteur, écran principal, version de VPX : chacun son constat et sa marche à suivre', () => {
  assert.deepEqual(ids({ ...READY, emitter: false }), ['no-emitter']);
  assert.deepEqual(ids({ ...READY, emitterProblem: 28 }), ['emitter-driver'], 'branché, pilote NvStUSB absent');
  assert.match(nvidia3dVisionIssues({ ...READY, emitterProblem: 28 }, 'win32')[0]!.title, /code 28/);
  assert.deepEqual(ids({ ...READY, playfieldPrimary: false }), ['playfield-not-primary']);
  assert.deepEqual(ids({ ...READY, vpxSupported: false }), ['vpx-unsupported']);
  assert.deepEqual(ids({ ...READY, emitter: undefined, playfieldPrimary: undefined, vpxSupported: undefined }), [], 'ce qui n’a pas pu être lu ne bloque pas');
  const all = nvidia3dVisionIssues({ nvapi: true, driver: 45206, stereo: false, stereoRefused: true, emitter: false, playfieldPrimary: false, vpxSupported: false }, 'win32');
  assert.deepEqual(
    all.map((i) => i.id),
    ['stereo-disabled', 'no-emitter', 'playfield-not-primary', 'vpx-unsupported'],
  );
  for (const i of all) {
    assert.ok(i.title.length > 0, i.id);
    assert.ok(i.steps.length > 0 && i.steps.every((s) => s.length > 0), i.id);
  }
});

test('ce qui n’a pas pu être vérifié est dit : jamais « prête » sans tout avoir vu', () => {
  assert.deepEqual(nvidia3dVisionUnchecked(READY), []);
  assert.deepEqual(nvidia3dVisionUnchecked({ nvapi: false }), [], 'sans pilote, le manque suffit');
  assert.deepEqual(nvidia3dVisionUnchecked({ nvapi: true, stereo: true }), ['version du pilote', 'émetteur', 'écran du playfield', 'VPX']);
  const ready = nvidia3dVisionReadyText(READY);
  assert.ok(ready.complete);
  assert.equal(ready.text, 'NVIDIA 3D Vision prête');
  assert.match(ready.detail, /452\.06/);
  const partial = nvidia3dVisionReadyText({ ...READY, emitter: undefined, vpxSupported: undefined });
  assert.ok(!partial.complete);
  assert.doesNotMatch(partial.text, /prête/);
  assert.match(partial.detail, /émetteur, VPX/);
});

test('version du pilote écrite comme NVIDIA', () => {
  assert.equal(nvidiaDriverLabel(45206), '452.06');
  assert.equal(nvidiaDriverLabel(58092), '580.92');
  assert.equal(nvidiaDriverLabel(42531), '425.31');
});

test('playfield en écran principal : l’écran que VPX choisit par son nom, sinon le principal', () => {
  assert.equal(playfieldOnPrimary(undefined), true);
  assert.equal(playfieldOnPrimary('  '), true, 'vide : VPX prend l’écran principal');
  // Sans la liste des écrans : seule la position d'un « Nom [x, y] » renseigne.
  assert.equal(playfieldOnPrimary('G4380 [0, 0]'), true);
  assert.equal(playfieldOnPrimary('G4380 [3840, 0]'), false);
  assert.equal(playfieldOnPrimary('DMD [-1920, 0]'), false);
  assert.equal(playfieldOnPrimary('PL4380UH'), undefined, 'nom seul, écrans inconnus');
  assert.equal(playfieldOnPrimary('PL4380UH', []), undefined);
  // Une borne réelle (VPX 10.8.1-5436 n'écrit que le nom) : playfield principal, DMD à côté.
  const screen = (name: string, x: number, primary: boolean) => ({ ids: [name, `${name} [${x}, 0]`], primary });
  const cab = [screen('PL4380UH', 0, true), screen('TYPEC', 3840, false)];
  assert.equal(playfieldOnPrimary('PL4380UH', cab), true);
  assert.equal(playfieldOnPrimary('TYPEC', cab), false);
  assert.equal(playfieldOnPrimary('TYPEC [3840, 0]', cab), false, 'ancien format');
  assert.equal(playfieldOnPrimary('G4380', cab), true, 'écran absent ou renommé : VPX prend l’écran principal');
  assert.equal(playfieldOnPrimary('PL4380UH [3840, 0]', [screen('PL4380UH', 0, true)]), true, 'position périmée : écran absent');
  const twins = [screen('PLX2283HSU', 0, true), screen('PLX2283HSU', 1920, false)];
  assert.equal(playfieldOnPrimary('PLX2283HSU', twins), undefined, 'deux écrans du même nom : on ne sait pas lequel VPX prend');
  assert.equal(playfieldOnPrimary('PLX2283HSU [1920, 0]', twins), false);
});

test('l’émetteur : NVIDIA 0955:0007, ou un périphérique NVIDIA qui se dit 3D Vision', () => {
  const usb = (vid: number, pid: number, name?: string) => ({ instanceId: `USB\\VID_${vid.toString(16)}&PID_${pid.toString(16)}\\1`, vid, pid, name });
  assert.ok(isNvidia3dVisionEmitter(usb(0x0955, 0x0007)));
  assert.ok(isNvidia3dVisionEmitter(usb(0x0955, 0x7002, 'NVIDIA 3D Vision Controller')));
  assert.ok(!isNvidia3dVisionEmitter(usb(0x0955, 0x7210, 'NVIDIA Shield Controller')));
  assert.ok(!isNvidia3dVisionEmitter(usb(0x1a86, 0x0007, '3D Vision')), 'un autre constructeur');
});

test('réglages de la partie : Side by Side de VPX, mode direct, Direct3D 11, profondeur des Lunettes 3D', () => {
  const s = nvidia3dVisionGameSettings(NV, '', '');
  assert.equal(get(s, 'Stereo3D'), String(NVIDIA_STEREO_MODE));
  assert.equal(get(s, 'Stereo3DEnabled'), '1');
  assert.equal(get(s, 'Stereo3DNvidiaDirect'), '1');
  assert.equal(get(s, 'GfxBackend'), 'Direct3D11');
  assert.equal(get(s, 'Stereo3DEyeSeparation'), '63');
  assert.equal(get(nvidia3dVisionGameSettings({ ...NV, depth: 1.5 }, '', ''), 'Stereo3DEyeSeparation'), '94.5');
  assert.ok(!s.some((x) => x.key.startsWith('Anaglyph')), 'aucun profil de couleurs');
  assert.ok(s.every((x) => x.section === 'Player'));
  assert.equal(get(nvidia3dVisionGameSettings(NV, '', `[Player]\nFXAA = ${VR_REFUSED_FXAA}\n`), 'FXAA'), VR_STEREO_FXAA);
  assert.equal(get(nvidia3dVisionGameSettings(NV, '[Player]\nFXAA = 2\n', ''), 'FXAA'), undefined);
});

test('les Lunettes 3D passent la main au mode NVIDIA, et rien de lui ne reste dans le fichier de la table', () => {
  assert.deepEqual(anaglyphGameSettings(NV, '', ''), nvidia3dVisionGameSettings(NV, '', ''));
  for (const s of anaglyphGameSettings(NV, '', `[Player]\nFXAA = ${VR_REFUSED_FXAA}\n`)) assert.ok(isAnaglyphKey(s.section, s.key), s.key);
  assert.equal(anaglyphWheelRelief(NV), undefined, 'pas de relief à filtres colorés dans la roue');
});

test('le choix des lunettes est gardé ; une valeur inconnue revient aux filtres colorés', () => {
  assert.equal(parseAnaglyphSetting({ mode: 'on', kind: 'nvidia' }).kind, 'nvidia');
  assert.equal(parseAnaglyphSetting({ mode: 'on', kind: 'shutter' }).kind, 'anaglyph');
  assert.equal(parseAnaglyphSetting({ mode: 'on' }).kind, 'anaglyph');
  assert.equal(DEFAULT_ANAGLYPH.kind, 'anaglyph');
});

const LOG = (lines: string[]) => lines.map((l, i) => `2026-11-24 21:00:0${i}.000 INFO [RenderDevice.cpp:1] ${l}`).join('\r\n');

test('bilan d’une partie : les lignes du VPX corrigé après la dernière demande', () => {
  assert.equal(nvidia3dVisionOutcome(LOG(['Startup done'])), undefined);
  const requested = 'NVIDIA 3D Vision: direct mode requested (Direct3D 11, exclusive fullscreen)';
  const ready = 'NVIDIA 3D Vision: direct mode ready, 3840x2160 per eye';
  assert.equal(nvidia3dVisionOutcome(LOG([requested, ready]))?.state, 'ready');
  assert.equal(nvidia3dVisionOutcome(LOG([requested, ready, 'NVIDIA 3D Vision: stereo activated']))?.state, 'active');
  assert.equal(nvidia3dVisionOutcome(LOG([requested, ready, 'NVIDIA 3D Vision: stereo not activated (check the emitter and the glasses)']))?.state, 'not-activated');
  const fallback = nvidia3dVisionOutcome(LOG([requested, 'NVIDIA 3D Vision: creating the stereo swapchain failed (0x887A0004), falling back to plain side by side rendering', 'NVIDIA 3D Vision: stereo activated']));
  assert.equal(fallback?.state, 'fallback', 'un repli l’emporte');
  assert.match(fallback?.line ?? '', /^creating the stereo swapchain failed/);
  // Le plein écran exclusif : raté au départ puis obtenu, ou perdu en cours de partie, ce n'est pas un repli.
  const failed = 'NVIDIA 3D Vision: exclusive fullscreen failed (0x887A0004), showing both views side by side until the playfield window is in front again';
  const fullscreen = 'NVIDIA 3D Vision: exclusive fullscreen 3840x2160 at 120000/1001 Hz';
  const lost = 'NVIDIA 3D Vision: exclusive fullscreen lost, showing both views side by side until the playfield window is in front again';
  const activated = 'NVIDIA 3D Vision: stereo activated';
  assert.equal(nvidia3dVisionOutcome(LOG([requested, failed, ready, fullscreen, activated]))?.state, 'active');
  assert.equal(nvidia3dVisionOutcome(LOG([requested, fullscreen, ready, activated, lost]))?.state, 'active');
  const never = nvidia3dVisionOutcome(LOG([requested, failed, ready]));
  assert.equal(never?.state, 'fallback', 'plein écran jamais obtenu');
  assert.match(never?.line ?? '', /^exclusive fullscreen failed/);
  assert.equal(nvidia3dVisionOutcome(LOG([requested, fullscreen, ready, 'NVIDIA 3D Vision: NvAPI_Stereo_SetActiveEye error -140, showing both views side by side']))?.state, 'fallback');
  assert.equal(nvidia3dVisionOutcome(LOG(['NVIDIA 3D Vision: NVAPI error -2 (NvAPI_Initialize), using plain side by side rendering']))?.state, 'fallback');
  assert.equal(nvidia3dVisionOutcome(LOG(['NVIDIA 3D Vision: stereo is disabled in the NVIDIA control panel, using plain side by side rendering']))?.state, 'fallback');
  // Une partie plus ancienne, repliée, ne compte plus après une nouvelle demande.
  assert.equal(nvidia3dVisionOutcome(LOG(['NVIDIA 3D Vision: NVAPI error -2 (NvAPI_Initialize), using plain side by side rendering', requested, ready, 'NVIDIA 3D Vision: stereo activated']))?.state, 'active');
});

test('le bilan ne lit que la partie lancée : journal ajouté, recréé ou tourné à 5 Mo', () => {
  type Mark = { file: string; size: number };
  const app = require(path.join(REPO_ROOT, 'app', 'dist', 'anaglyph.js')) as {
    markVpxLog(file: string | undefined): Mark | undefined;
    readVpxLogSince(file: string | undefined, since: Mark | undefined): string | undefined;
  };
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-nv3d-'));
  try {
    const log = path.join(dir, 'vpinball.log');
    assert.equal(app.markVpxLog(undefined), undefined);
    assert.deepEqual(app.markVpxLog(log), { file: log, size: 0 }, 'pas encore de journal');
    assert.equal(app.readVpxLogSince(log, undefined), undefined, 'toujours pas de journal');
    const old = 'partie précédente : NVIDIA 3D Vision: stereo activated\n';
    fs.writeFileSync(log, old);
    const mark = app.markVpxLog(log);
    fs.appendFileSync(log, 'cette partie\n');
    assert.equal(app.readVpxLogSince(log, mark), 'cette partie\n');
    assert.equal(app.readVpxLogSince(log, { file: path.join(dir, 'autre.log'), size: 3 }), old + 'cette partie\n', 'autre journal : tout');
    // Rotation pendant la partie : le début est à la fin de vpinball.1.log.
    fs.renameSync(log, path.join(dir, 'vpinball.1.log'));
    fs.writeFileSync(log, 'suite\n');
    assert.equal(app.readVpxLogSince(log, mark), 'cette partie\n\nsuite\n');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('le bilan dit au joueur, avec le bon ton', () => {
  assert.equal(nvidia3dVisionOutcomeText({ state: 'active', line: '' }).tone, 'ok');
  assert.equal(nvidia3dVisionOutcomeText({ state: 'not-activated', line: '' }).tone, 'warning');
  const fb = nvidia3dVisionOutcomeText({ state: 'fallback', line: 'exclusive fullscreen failed' });
  assert.equal(fb.tone, 'warning');
  assert.equal(fb.detail, 'exclusive fullscreen failed');
  assert.equal(nvidia3dVisionOutcomeText({ state: 'ready', line: '' }).tone, 'quiet');
  const unknown = nvidia3dVisionOutcomeText({ state: 'unknown', line: '' });
  assert.equal(unknown.tone, 'warning');
  assert.match(unknown.text, /inconnu/);
});
