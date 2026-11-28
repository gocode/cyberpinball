// Constats du lancement de Future Pinball (packages/core/src/futurepinball-diagnostics.ts) : où jouera le son,
// quelle vue de BAM sera lue. Cas relevé sur un PinCab le 24/11/2026 : sortie par défaut = écran HDMI du
// playfield à 0 % pendant que l'étape « Son » visait les haut-parleurs ; vues réglées dans l'ancienne
// installation non reprises, BAM en avait créé des neuves.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { copyTree, futurePinballSoundReport, futurePinballTurnDegrees, futurePinballViewFacts, futurePinballViewReport, type CabinetAudio, type ObservedAudioOutput } from '../index';
import { REPO_ROOT } from './i18n-scan';

// eslint-disable-next-line @typescript-eslint/no-require-imports
const { logFuturePinballView } = require(path.join(REPO_ROOT, 'app', 'dist', 'futurepinball-diagnostics.js')) as {
  logFuturePinballView: (facts: { tableId: string; log: (line: string) => void; read?: (name: string) => unknown }) => void;
};

const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-fpd-'));
const put = (file: string, content = 'x') => {
  fs.mkdirSync(path.dirname(file), { recursive: true });
  fs.writeFileSync(file, content);
};

const HDMI = '{0.0.0.00000000}.{hdmi}';
const SPEAKERS = '{0.0.0.00000000}.{realtek}';
const outputs = [
  { endpointId: HDMI, friendlyName: 'Écran du playfield (HDMI)' },
  { endpointId: SPEAKERS, friendlyName: 'Haut-parleurs (Realtek)' },
] as unknown as ObservedAudioOutput[];
const audio = { roles: { playfield: SPEAKERS }, outputs: [] } as unknown as CabinetAudio;

test('son : la sortie par défaut est dite, avec son niveau', () => {
  const r = futurePinballSoundReport({ defaultOutput: { id: SPEAKERS, level: 0.5, muted: false }, outputs, audio });
  assert.equal(r.elsewhere, false);
  assert.equal(r.silent, false);
  assert.match(r.lines.join('\n'), /« Haut-parleurs \(Realtek\) » \(50 %\)/);
  assert.equal(r.lines.length, 1);
});

test('son : une sortie par défaut autre que celle de l’étape « Son », à 0 %, est dite muette sans rien changer à Windows', () => {
  const r = futurePinballSoundReport({ defaultOutput: { id: HDMI, level: 0, muted: false }, outputs, audio });
  assert.equal(r.elsewhere, true);
  assert.equal(r.silent, true);
  const text = r.lines.join('\n');
  assert.match(text, /Écran du playfield \(HDMI\)/);
  assert.match(text, /vise « Haut-parleurs \(Realtek\) » \(playfield\)/);
  assert.doesNotMatch(text, /ne change ni la sortie par défaut/, 'Cyber Pinball la pose désormais (game-audio-route.ts)');
  assert.match(text, /à 0 %.*muette/);
  // Coupée : même constat.
  assert.equal(futurePinballSoundReport({ defaultOutput: { id: HDMI, level: 0.8, muted: true }, outputs, audio }).silent, true);
  // Casse de l'identifiant sans importance.
  assert.equal(futurePinballSoundReport({ defaultOutput: { id: SPEAKERS.toUpperCase(), level: 0.5, muted: false }, outputs, audio }).elsewhere, false);
});

test('son : sans étape « Son » ni lecture de Core Audio, un constat honnête et pas d’invention', () => {
  const none = futurePinballSoundReport({ outputs, audio });
  assert.equal(none.silent, false);
  assert.match(none.lines.join('\n'), /n’a pas pu être lue/);
  const noAudio = futurePinballSoundReport({ defaultOutput: { id: HDMI, level: 0.5, muted: false }, outputs });
  assert.equal(noAudio.elsewhere, false, 'rien à comparer : pas de reproche');
  assert.equal(noAudio.lines.length, 1);
});

test('vue : pas de vue pour la table, vue créée par BAM, vue enregistrée', () => {
  const game = tmp();
  const table = path.join(tmp(), 'Ghostbusters.fpt');
  assert.match(futurePinballViewReport({ gameDir: game }, table).join('\n'), /pas de vue de BAM pour « Ghostbusters » ; BAM crée la vue par défaut/);
  put(path.join(game, 'BAM', 'default.cfg'));
  assert.match(futurePinballViewReport({ gameDir: game }, table).join('\n'), /d’après son default\.cfg/);
  const cfg = path.join(game, 'BAM', 'cfg', 'Ghostbusters.cfg');
  put(cfg);
  assert.match(futurePinballViewReport({ gameDir: game }, table).join('\n'), /vue par défaut que BAM a créée/);
  const born = fs.statSync(cfg).birthtimeMs;
  fs.utimesSync(cfg, new Date(born + 120_000), new Date(born + 120_000));
  assert.match(futurePinballViewReport({ gameDir: game }, table).join('\n'), /a sa vue de BAM, enregistrée/);
});

test('vue : les vues réglées d’une ancienne installation et non reprises sont signalées, celle de la table en particulier', () => {
  const game = tmp();
  const old = tmp();
  const table = path.join(tmp(), 'Ghostbusters.fpt');
  put(path.join(old, 'BAM', 'cfg', 'Ghostbusters.cfg'), 'reglee');
  put(path.join(old, 'BAM', 'cfg', 'Autre.cfg'), 'reglee');
  const text = futurePinballViewReport({ gameDir: game }, table, { gameDir: old }).join('\n');
  assert.match(text, /2 réglage\(s\) de vue de BAM .* ne sont pas repris ici, dont celui de « Ghostbusters »/);
  assert.match(text, /Reprendre les tables et les vues de BAM/);
  // Une fois reprises : plus rien à dire. La même installation n'est pas sa propre « ancienne ».
  copyTree(path.join(old, 'BAM'), path.join(game, 'BAM'));
  assert.ok(!futurePinballViewReport({ gameDir: game }, table, { gameDir: old }).join('\n').includes('réglage(s)'));
  assert.ok(!futurePinballViewReport({ gameDir: game }, table, { gameDir: game }).join('\n').includes('réglage(s)'));
});

test('cadrage : résolution, mode, rotation, arcade et caméra sont dits ; ce qui ne va pas ensemble est signalé, rien n’est corrigé', () => {
  // Les préférences relevées sur une borne le 24/11/2026.
  const borne = { Width: 3840, Height: 2160, FullScreen: 1, AspectRatio: 169, ArcadeMode: 1, RotateDegrees: 3, CameraFollowsTheBall: 1, ArcadeCameraX: 0, ArcadeCameraY: 500, ArcadeCameraZ: 650 };
  const ok = futurePinballViewFacts({ prefs: borne, screen: { width: 3840, height: 2160, rotation: 180 }, flipperEdge: 'right' }).join('\n');
  assert.match(ok, /rend en 3840 x 2160, plein écran, proportions 16:9/);
  assert.match(ok, /tournée de 270°, mode arcade oui, caméra arcade 0 \/ 500 \/ 650, la caméra suit la bille/);
  assert.match(ok, /écran du playfield 3840 x 2160 \(rotation de la session 180°\), joueur côté droit de l’image de Windows, soit 270°/);
  assert.doesNotMatch(ok, /ne remplit pas|en fenêtre|mode arcade du jeu est coupé|bande étroite/);
  // Résolution qui n'est ni celle de l'écran ni celle de l'écran couché.
  assert.match(futurePinballViewFacts({ prefs: { ...borne, Width: 1920, Height: 1080 }, screen: { width: 3840, height: 2160, rotation: 0 } }).join('\n'), /1920 x 1080 sur un écran de 3840 x 2160 : la table ne remplit pas l’écran/);
  // Écran couché : la résolution du jeu est celle de l'écran tourné.
  assert.match(futurePinballViewFacts({ prefs: { ...borne, Width: 2160, Height: 3840 }, screen: { width: 3840, height: 2160, rotation: 0 } }).join('\n'), /celle de l’écran couché/);
  // Fenêtre, arcade coupé, table non tournée sur un écran en largeur.
  const poor = futurePinballViewFacts({ prefs: { ...borne, FullScreen: 0, ArcadeMode: 0, RotateDegrees: 0 }, screen: { width: 3840, height: 2160, rotation: 0 } }).join('\n');
  assert.match(poor, /le jeu est en fenêtre/);
  assert.match(poor, /mode arcade du jeu est coupé/);
  assert.match(poor, /bande étroite/);
  // Jeu jamais lancé : aucune préférence, pas d'invention.
  assert.match(futurePinballViewFacts({ prefs: {} }).join('\n'), /jamais lancé/);
  assert.equal(futurePinballTurnDegrees(2), 180);
  assert.equal(futurePinballTurnDegrees(7), undefined);
  assert.equal(futurePinballTurnDegrees('3'), undefined);
});

test('cadrage : relevé au registre en lecture seule, le constat ne lève jamais', () => {
  const lines: string[] = [];
  logFuturePinballView({ tableId: 't', log: (l) => lines.push(l), read: (name) => ({ Width: 3840, Height: 2160, FullScreen: 1, RotateDegrees: 3, ArcadeMode: 1 })[name as 'Width'] });
  assert.ok(lines.length >= 2 && lines.every((l) => l.startsWith('Future Pinball (t) : ')));
  const failed: string[] = [];
  logFuturePinballView({ tableId: 't', log: (l) => failed.push(l), read: () => { throw new Error('registre illisible'); } });
  assert.match(failed.join('\n'), /constat impossible \(registre illisible\)/);
  // Lecture seule : ni écriture au registre, ni réglage de Windows dans le module.
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'futurepinball-diagnostics.ts'), 'utf8');
  assert.doesNotMatch(source, /hkcuSetValue|reg add|SetDefaultEndpoint|IPolicyConfig/);
});

test('le lancement d’une partie écrit son constat de son et de vue, jamais sur des écrans simulés', () => {
  const source = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const at = source.indexOf('logFuturePinballLaunch(');
  assert.ok(at > 0 && at < source.indexOf('launchPinballFx({'), 'frontend.ts constate avant de lancer le jeu');
  const guard = source.indexOf('if (simulated === undefined && fp && !simulatedDisplays()');
  assert.ok(guard > 0 && guard < at, 'le constat est dans le bloc qui exclut les écrans simulés');
});
