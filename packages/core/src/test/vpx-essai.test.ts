// Mode d'essai de VPX (app/src/vpx-essai.ts, vpx-essai-menu.ts) : basculer sur la même installation entre le VPX de
// Cyber Pinball et une préversion décrite dans le manifeste (« trial »), réglages de VPX à part, jonction « current »
// intacte, réservé aux postes de développement et au canal d'essai privé, scores gardés sur la borne.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { SYSTEM_GROUPS, systemPathOf } from '../systemmenu';
import { componentPaths } from '../locations';

interface Entry {
  id: string;
  version: string;
  trial?: boolean;
  installDir: string;
  sha256: string;
  size: number;
}
const essai = require(path.join(REPO_ROOT, 'app', 'dist', 'vpx-essai.js')) as {
  trialVpxEntries(manifest?: Entry[]): Entry[];
  trialVpxAllowed(opts: { installed: boolean; privateChannel?: boolean }): boolean;
  readTrialChoice(dataDir: string): string | undefined;
  writeTrialChoice(dataDir: string, version: string | undefined): void;
  trialIniDir(baseIni: string, version: string): string;
  seedTrialIni(baseIni: string, version: string): string;
  trialVpxInUse(root: string, dataDir: string, opts: { allowed: boolean; manifest?: Entry[] }): { version: string; dir: string; trial: boolean } | undefined;
};
const installer = require(path.join(REPO_ROOT, 'packages', 'installer', 'dist', 'index.js')) as {
  findComponent(id: string): Entry;
  loadManifest(): Entry[];
  findLocalArchive(component: Entry, dirs: string[]): Promise<string | undefined>;
};

const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

test('le manifeste : la version d’essai existe, findComponent garde le VPX de Cyber Pinball', () => {
  const trials = essai.trialVpxEntries();
  assert.ok(trials.length >= 1);
  for (const e of trials) assert.equal(e.id, 'vpx');
  assert.equal(installer.findComponent('vpx').trial, undefined, 'installation, mise à jour et pare-feu ne voient jamais la version d’essai');
  assert.equal(installer.loadManifest().find((c) => c.id === 'vpx')!.trial, undefined, 'le VPX de Cyber Pinball reste en tête du manifeste');
});

test('permis seulement depuis les sources ou avec le canal d’essai privé', () => {
  assert.equal(essai.trialVpxAllowed({ installed: false }), true);
  assert.equal(essai.trialVpxAllowed({ installed: true, privateChannel: false }), false);
  assert.equal(essai.trialVpxAllowed({ installed: true, privateChannel: true }), true);
});

test('le choix : écrit, relu, retiré', () => {
  const data = tmp('cp-essai-');
  assert.equal(essai.readTrialChoice(data), undefined);
  essai.writeTrialChoice(data, '10.9.0-6948');
  assert.equal(essai.readTrialChoice(data), '10.9.0-6948');
  essai.writeTrialChoice(data, undefined);
  assert.equal(essai.readTrialChoice(data), undefined);
  fs.writeFileSync(path.join(data, 'vpx-essai.json'), '{ cassé');
  assert.equal(essai.readTrialChoice(data), undefined, 'un fichier abîmé ramène au mode habituel');
});

test('réglages de VPX à part : copiés au premier passage, jamais écrasés ensuite', () => {
  const config = tmp('cp-essai-config-');
  const base = path.join(config, 'VPinballX.ini');
  fs.writeFileSync(base, '[Player]\r\nBGSet = 1\r\n');
  fs.writeFileSync(path.join(config, 'Salon.ini'), '[Player]\r\nBGSet = 2\r\n');
  fs.writeFileSync(path.join(config, 'notes.txt'), 'pas un ini');
  const dir = essai.seedTrialIni(base, '10.9.0-6948');
  assert.equal(dir, path.join(config, 'vpx-10.9'));
  assert.deepEqual(fs.readdirSync(dir).sort(), ['Salon.ini', 'VPinballX.ini']);
  fs.writeFileSync(path.join(dir, 'VPinballX.ini'), '[Player]\r\nBGSet = 0\r\n');
  fs.writeFileSync(base, '[Player]\r\nBGSet = 1\r\nAutre = 1\r\n');
  essai.seedTrialIni(base, '10.9.0-6948');
  assert.equal(fs.readFileSync(path.join(dir, 'VPinballX.ini'), 'utf8'), '[Player]\r\nBGSet = 0\r\n', 'la version d’essai garde ses réglages');
  assert.equal(fs.readFileSync(base, 'utf8'), '[Player]\r\nBGSet = 1\r\nAutre = 1\r\n', 'et ne touche jamais à ceux de l’autre version');
});

test('version d’essai utilisée seulement si choisie, permise, décrite et installée', () => {
  const root = tmp('cp-essai-racine-');
  const data = tmp('cp-essai-data-');
  const entry: Entry = { id: 'vpx', version: '10.9.0-1', trial: true, installDir: 'emulators/vpx', sha256: '', size: 0 };
  const manifest = [{ ...entry, version: '10.8.1-1', trial: undefined }, entry];
  const use = (allowed = true) => essai.trialVpxInUse(root, data, { allowed, manifest });
  assert.equal(use(), undefined, 'aucun choix');
  essai.writeTrialChoice(data, '10.9.0-1');
  assert.equal(use(), undefined, 'pas encore installée');
  const dir = componentPaths(root, 'emulators/vpx', '10.9.0-1').version;
  fs.mkdirSync(dir, { recursive: true });
  assert.deepEqual(use(), { version: '10.9.0-1', entry, dir, trial: true });
  assert.equal(use(false), undefined, 'poste d’un joueur : le fichier de choix est ignoré');
  essai.writeTrialChoice(data, '10.9.0-2');
  assert.equal(use(), undefined, 'version que le manifeste ne décrit plus');
});

test('archive de la version d’essai retrouvée à sa taille et à son empreinte, quel que soit son nom', async () => {
  const dir = tmp('cp-essai-dl-');
  const content = Buffer.from('archive de VPX');
  fs.writeFileSync(path.join(dir, 'autre.zip'), Buffer.from('autre chose !'));
  fs.writeFileSync(path.join(dir, 'VPinballX (1).zip'), content);
  const entry: Entry = { id: 'vpx', version: '10.9.0-1', trial: true, installDir: 'emulators/vpx', size: content.length, sha256: crypto.createHash('sha256').update(content).digest('hex') };
  assert.equal(await installer.findLocalArchive(entry, [path.join(dir, 'absent'), dir]), path.join(dir, 'VPinballX (1).zip'));
  assert.equal(await installer.findLocalArchive({ ...entry, sha256: '0'.repeat(64) }, [dir]), undefined);
});

test('menu système : « VPX d’essai » dans Borne, fourni seulement quand le mode est permis', () => {
  assert.ok(Object.values(SYSTEM_GROUPS).some((g) => (g.entries as readonly string[]).includes('vpx-trial')));
  assert.ok(systemPathOf('vpx-trial'));
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  assert.match(frontend, /if \(trialVpxAllowedHere\(\)\) \{\s*library\.provideSystemItem\('vpx-trial'/);
});

test('scores faits avec le VPX d’essai : jamais publiés dans les classements', () => {
  const frontend = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'frontend.ts'), 'utf8');
  const body = frontend.slice(frontend.indexOf('async function publishScores'), frontend.indexOf('socialNet.publishScore('));
  assert.match(body, /if \(vpxInstall\(loc\)\?\.trial\) return/);
});

test('la jonction « current » n’est jamais repointée vers la version d’essai', () => {
  const src = fs.readFileSync(path.join(REPO_ROOT, 'app', 'src', 'vpx-essai-menu.ts'), 'utf8');
  for (const m of src.matchAll(/installComponent\(([^;]*)\);/g)) assert.match(m[1]!, /activate: false/);
});
