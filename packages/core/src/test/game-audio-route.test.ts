// Sortie audio des jeux sans choix de sortie (Pinball FX, FX3, Midnight, Future Pinball), 28/11/2026 : « le son
// ne sort pas par les bonnes enceintes ». L'invariant : la partie joue sur la sortie de l'étape « Son »
// (playfield, sinon fronton), la sortie par défaut d'avant est rendue après, et rien n'est posé si la
// sortie voulue est absente ou déjà la bonne.
import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { gameAudioRoute, type CabinetAudio, type ObservedAudioOutput, type ObservedDisplay } from '../index';
import { REPO_ROOT } from './i18n-scan';

interface Deps {
  readDefault: () => string | undefined;
  setDefault: (id: string) => boolean;
}
// eslint-disable-next-line @typescript-eslint/no-require-imports
const { routeGameAudio, restoreLeftoverGameAudio } = require(path.join(REPO_ROOT, 'app', 'dist', 'game-audio-route.js')) as {
  routeGameAudio: (facts: { dataDir: string; label: string; audio: CabinetAudio | undefined; outputs: ObservedAudioOutput[]; log: (line: string) => void; deps: Deps }) => () => void;
  restoreLeftoverGameAudio: (dataDir: string, log: (line: string) => void, deps: Deps) => void;
};

const HEADSET = '{0.0.0.00000000}.{casque}';
const SPEAKERS = '{0.0.0.00000000}.{realtek}';
const outputs = [
  { endpointId: HEADSET, friendlyName: 'Casque (USB)' },
  { endpointId: SPEAKERS, friendlyName: 'Haut-parleurs (High Definition Audio Device)' },
] as unknown as ObservedAudioOutput[];
const audio = { roles: { playfield: SPEAKERS }, outputs: [] } as unknown as CabinetAudio;

/** Une machine : sa sortie par défaut, ce qu'on y pose. */
function windows(initial: string | undefined, refuse = false) {
  const state = { current: initial, sets: [] as string[] };
  const deps: Deps = {
    readDefault: () => state.current,
    setDefault: (id) => {
      state.sets.push(id);
      if (refuse) return false;
      state.current = id;
      return true;
    },
  };
  return { state, deps };
}
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), 'cp-gar-'));

test('décision : une sortie par défaut autre que celle de l’étape « Son » est remplacée, quel que soit le jeu', () => {
  const r = gameAudioRoute({ defaultId: HEADSET, outputs, audio });
  assert.equal(r.target?.id, SPEAKERS);
  assert.equal(r.target?.role, 'playfield');
  assert.match(r.line, /Haut-parleurs \(High Definition Audio Device\)/);
});

test('décision : déjà la bonne (casse de l’identifiant sans importance), sortie absente ou étape « Son » vide : rien à poser', () => {
  assert.equal(gameAudioRoute({ defaultId: SPEAKERS.toUpperCase(), outputs, audio }).target, undefined);
  assert.equal(gameAudioRoute({ defaultId: HEADSET, outputs: [outputs[0]!], audio }).target, undefined, 'carte débranchée : Windows garde la sienne');
  assert.match(gameAudioRoute({ defaultId: HEADSET, outputs: [outputs[0]!], audio }).line, /introuvable/);
  assert.equal(gameAudioRoute({ defaultId: HEADSET, outputs, audio: undefined }).target, undefined);
  // Sans playfield : le fronton.
  const backglass = { roles: { backglass: SPEAKERS }, outputs: [] } as unknown as CabinetAudio;
  assert.equal(gameAudioRoute({ defaultId: HEADSET, outputs, audio: backglass }).target?.role, 'backglass');
});

test('décision : le haut-parleur d’un écran de la borne ne passe qu’après les enceintes (rapport du 28/11/2026 : le son sortait de l’écran)', () => {
  const SCREEN = '{0.0.0.00000000}.{ecran}';
  const CONTAINER = '{5C5D31D9-DA90-5984-B322-628AD26691C4}';
  const both = [
    { endpointId: SCREEN, friendlyName: 'PL4380UH (NVIDIA High Definition Audio)', containerId: CONTAINER, formFactor: 9 },
    { endpointId: SPEAKERS, friendlyName: 'Haut-parleurs (High Definition Audio Device)', containerId: '{00000000-0000-0000-FFFF-FFFFFFFFFFFF}', formFactor: 1 },
  ] as unknown as ObservedAudioOutput[];
  const displays = [{ containerId: CONTAINER.toLowerCase() }] as unknown as ObservedDisplay[];
  // Plateau sur l'écran, enceintes au fronton : les enceintes.
  const split = { roles: { playfield: SCREEN, backglass: SPEAKERS }, outputs: [] } as unknown as CabinetAudio;
  const r = gameAudioRoute({ defaultId: SCREEN, outputs: both, audio: split, displays });
  assert.equal(r.target?.id, SPEAKERS);
  assert.equal(r.target?.role, 'backglass');
  // Rien d'autre que l'écran : l'écran, faute de mieux.
  const onlyScreen = { roles: { playfield: SCREEN }, outputs: [] } as unknown as CabinetAudio;
  assert.equal(gameAudioRoute({ defaultId: SPEAKERS, outputs: both, audio: onlyScreen, displays }).target?.id, SCREEN);
  // Enceintes débranchées : l'écran qui est là passe avant une sortie absente.
  assert.equal(gameAudioRoute({ defaultId: SPEAKERS, outputs: [both[0]!], audio: split, displays }).target?.id, SCREEN);
});

test('partie : la sortie de l’étape « Son » est posée, puis l’ancienne rendue, témoin effacé', () => {
  const dir = tmp();
  const w = windows(HEADSET);
  const lines: string[] = [];
  const give = routeGameAudio({ dataDir: dir, label: 'Pinball FX (t)', audio, outputs, log: (l) => lines.push(l), deps: w.deps });
  assert.equal(w.state.current, SPEAKERS);
  assert.ok(fs.existsSync(path.join(dir, 'audio-defaut-avant-jeu.json')), 'témoin posé pendant la partie');
  give();
  assert.equal(w.state.current, HEADSET);
  assert.ok(!fs.existsSync(path.join(dir, 'audio-defaut-avant-jeu.json')));
  assert.deepEqual(w.state.sets, [SPEAKERS, HEADSET]);
  assert.match(lines.join('\n'), /Pinball FX \(t\) : Son : .*posée.*rendue/s);
});

test('partie : le joueur change de sortie pendant la partie : on ne défait pas ce qu’on n’a pas fait', () => {
  const dir = tmp();
  const w = windows(HEADSET);
  const give = routeGameAudio({ dataDir: dir, label: 'x', audio, outputs, log: () => undefined, deps: w.deps });
  w.state.current = HEADSET.toUpperCase();
  give();
  assert.equal(w.state.current, HEADSET.toUpperCase());
  assert.equal(w.state.sets.length, 1);
});

test('partie : déjà la bonne sortie ou Windows qui refuse : aucun témoin, aucun changement, la partie se lance', () => {
  const dir = tmp();
  const same = windows(SPEAKERS);
  routeGameAudio({ dataDir: dir, label: 'x', audio, outputs, log: () => undefined, deps: same.deps })();
  assert.deepEqual(same.state.sets, []);
  const refuse = windows(HEADSET, true);
  const lines: string[] = [];
  routeGameAudio({ dataDir: dir, label: 'x', audio, outputs, log: (l) => lines.push(l), deps: refuse.deps })();
  assert.equal(refuse.state.current, HEADSET);
  assert.ok(!fs.existsSync(path.join(dir, 'audio-defaut-avant-jeu.json')));
  assert.match(lines.join('\n'), /Windows a refusé/);
});

test('plantage en pleine partie : au démarrage suivant, la sortie d’avant est rendue', () => {
  const dir = tmp();
  const w = windows(HEADSET);
  routeGameAudio({ dataDir: dir, label: 'x', audio, outputs, log: () => undefined, deps: w.deps }); // jamais rendue : plantage
  assert.equal(w.state.current, SPEAKERS);
  restoreLeftoverGameAudio(dir, () => undefined, w.deps);
  assert.equal(w.state.current, HEADSET);
  assert.ok(!fs.existsSync(path.join(dir, 'audio-defaut-avant-jeu.json')));
  // Rien à rendre : rien n'est touché.
  restoreLeftoverGameAudio(dir, () => undefined, w.deps);
  assert.equal(w.state.sets.length, 2);
});
