// Santé de la borne (health.ts) : l'état de chaque contrôle (OK, À vérifier, Bloquant) selon
// les faits relevés, et la règle de la page : chaque ligne mène à un écran réel qui répare
// (une entrée du menu système que l'application fournit, le médecin d'une table, la liste des
// tables à revoir, l'installation de VPX). Le rendu fait de chaque ligne une action, sans la
// répéter dans la liste des actions.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { addConfiguration } from '../configurations';
import { toPhysicalScreen } from '../fingerprint';
import {
  DISK_BLOCKING_BYTES,
  DISK_CHECK_BYTES,
  diskFacts,
  diskLines,
  HEALTH_CHECKS,
  HEALTH_TABLE_LINES,
  HEALTH_TARGET_KINDS,
  healthAge,
  healthAttention,
  healthLines,
  loadHealthFacts,
  mediaLines,
  saveHealthFacts,
  screensFacts,
  screensLines,
  tableLines,
  tablesFacts,
  targetReachable,
  vpxLines,
  type HealthFacts,
  type HealthLine,
  type HealthState,
} from '../health';
import { setLanguage } from '../i18n';
import type { Cabinet, ObservedDisplay } from '../model';
import { SYSTEM_ITEM_IDS } from '../systemmenu';
import { cabinetDisplays, devPcDisplays, emptyCabinet } from './fixtures';
import { menuRenderer } from './menu-renderer';

const REPO = path.join(__dirname, '..', '..', '..', '..');
const GB = 1024 ** 3;

const states = (lines: HealthLine[]) => lines.map((l) => l.state);

// ---------- Espace disque ----------

test('espace disque : OK, À vérifier sous 10 Go, Bloquant sous 2 Go ; un lecteur par racine', () => {
  setLanguage('fr');
  const free: Record<string, number> = { 'C:\\': 6 * GB, 'D:\\': 400 * GB, 'E:\\': 1 * GB };
  const disks = diskFacts({ tables: 'D:\\Pinball\\tables', downloads: 'D:\\Pinball\\downloads', data: 'C:\\Donnees\\Cyber' }, (dir) => ({ free: free[path.parse(dir).root.toUpperCase()]!, total: 500 * GB }));
  assert.deepEqual(disks.map((d) => [d.root, d.uses]), [['D:\\', ['tables', 'downloads']], ['C:\\', ['data']]]);
  assert.deepEqual(states(diskLines(disks)), ['ok', 'check']);
  assert.match(diskLines(disks)[0]!.title, /^D: — tables, téléchargements$/);
  assert.match(diskLines(disks)[1]!.detail!, /moins de 10 Go/);
  assert.deepEqual(states(diskLines([{ root: 'E:\\', uses: ['tables'], free: DISK_BLOCKING_BYTES - 1, total: 100 * GB }])), ['blocking']);
  // Juste au seuil : l'état d'au-dessus.
  assert.deepEqual(states(diskLines([{ root: 'E:\\', uses: ['tables'], free: DISK_CHECK_BYTES, total: 100 * GB }])), ['ok']);
  assert.deepEqual(states(diskLines([{ root: 'E:\\', uses: ['tables'], free: DISK_BLOCKING_BYTES, total: 100 * GB }])), ['check']);
});

test('espace disque : un lecteur qui ne répond plus bloque s’il porte les tables', () => {
  setLanguage('fr');
  assert.deepEqual(states(diskLines([{ root: 'F:\\', uses: ['tables'] }])), ['blocking']);
  assert.deepEqual(states(diskLines([{ root: 'F:\\', uses: ['downloads'] }])), ['check']);
  assert.match(diskLines([{ root: 'F:\\', uses: ['tables'] }])[0]!.detail!, /ne répond pas/);
});

// ---------- Tables ----------

const romMissing = { code: 'romMissing' as const, severity: 'error' as const, title: 'ROM mm_109c absente' };
const crash = { code: 'crashReport' as const, severity: 'warning' as const, title: 'La table a planté à la dernière partie' };
const misnamed = { code: 'mediaMisnamed' as const, severity: 'warning' as const, title: 'Média mal nommé' };

test('tables : ROM qui manque bloquant, plantage à vérifier, médias mal nommés laissés au médecin, script jamais lu compté à part', () => {
  setLanguage('fr');
  const facts = tablesFacts([
    { file: 'a.vpx', title: 'Attack from Mars', findings: [misnamed] },
    { file: 'm.vpx', title: 'Medieval Madness', findings: [misnamed, romMissing] },
    { file: 't.vpx', title: 'Terminator 2', findings: [crash] },
    { file: 'x.vpx', title: 'Xenon' },
  ]);
  assert.equal(facts.count, 4);
  assert.equal(facts.unanalysed, 1);
  assert.deepEqual(facts.flagged.map((f) => [f.title, f.blocking, f.reason]), [
    ['Medieval Madness', true, 'ROM mm_109c absente'],
    ['Terminator 2', false, 'La table a planté à la dernière partie'],
  ]);
  const lines = tableLines(facts);
  assert.deepEqual(states(lines), ['blocking', 'check', 'check']);
  assert.deepEqual(lines[0]!.target, { kind: 'doctor', file: 'm.vpx' });
  assert.deepEqual(lines[2]!.target, { kind: 'system', item: 'roms' });
});

test('tables : au-delà de cinq, une ligne mène à la liste complète ; aucune : ajouter une table ; toutes saines : OK', () => {
  setLanguage('fr');
  const many = tablesFacts(Array.from({ length: 8 }, (_, i) => ({ file: `${i}.vpx`, title: `Table ${i}`, findings: [i === 7 ? crash : romMissing] })));
  const lines = tableLines(many);
  assert.equal(lines.length, HEALTH_TABLE_LINES + 1);
  assert.deepEqual(lines.at(-1)!.target, { kind: 'tables' });
  assert.equal(lines.at(-1)!.state, 'blocking');
  assert.match(lines.at(-1)!.title, /et 3 autres tables/);
  assert.deepEqual(tableLines(tablesFacts([])).map((l) => [l.state, l.target]), [['check', { kind: 'system', item: 'add-table' }]]);
  assert.deepEqual(tableLines(tablesFacts([{ file: 'a.vpx', title: 'A', findings: [misnamed] }])).map((l) => [l.state, l.title]), [['ok', 'Aucune ROM demandée ne manque']]);
});

// ---------- Médias ----------

test('médias : jamais cherché à vérifier, rien à compléter OK, des médias à prendre à vérifier ; jamais bloquant', () => {
  setLanguage('fr');
  assert.deepEqual(states(mediaLines({ tables: 0, medias: 0 })), ['check']);
  assert.deepEqual(states(mediaLines({ index: '2026-10-24T10:00:00Z', tables: 0, medias: 0 })), ['ok']);
  const some = mediaLines({ index: '2026-10-24T10:00:00Z', tables: 12, medias: 30 });
  assert.deepEqual(states(some), ['check']);
  assert.match(some[0]!.title, /12 tables/);
  assert.match(some[0]!.detail!, /30 médias/);
  for (const l of [...mediaLines({ tables: 0, medias: 0 }), ...some]) assert.deepEqual(l.target, { kind: 'system', item: 'missing-media' });
});

// ---------- Écrans ----------

function cabinetFor(displays: ObservedDisplay[]): Cabinet {
  const cabinet = emptyCabinet();
  cabinet.screens = displays.map(toPhysicalScreen);
  const fp = (i: number) => cabinet.screens[i]!.fingerprint;
  cabinet.roles = { playfield: fp(displays.length - 1), backglass: fp(0) };
  cabinet.playfield = { flipperEdge: 'bottom' };
  return cabinet;
}

test('écrans : la configuration retenue contre les écrans branchés', () => {
  setLanguage('fr');
  const borne = cabinetDisplays();
  let set = addConfiguration(undefined, cabinetFor(devPcDisplays()), 'Développement').set;
  set = addConfiguration(set, cabinetFor(borne), 'Borne du salon').set;
  // La borne retenue, tous ses écrans branchés.
  const ok = screensFacts(set, borne);
  // Puis le sens des tables en partie (gameorientation.test.ts).
  assert.deepEqual(states(screensLines(ok)), ['ok', 'ok']);
  assert.match(screensLines(ok)[0]!.title, /« Borne du salon » reconnue/);
  // Un écran éteint (pas le playfield) : retrouvée en partie.
  const partial = screensFacts(set, borne.slice(1));
  assert.deepEqual(states(screensLines(partial)), ['check', 'ok']);
  assert.match(screensLines(partial)[0]!.detail!, /introuvable/);
  // Le playfield débranché : bloquant.
  assert.deepEqual(states(screensLines(screensFacts(set, borne.slice(0, -1)))), ['blocking']);
  // Les écrans du poste de développement branchés, la borne retenue : bloquant (aucun de ses écrans), une autre conviendrait.
  const elsewhere = screensFacts(set, devPcDisplays());
  assert.equal(elsewhere.better, 'Développement');
  assert.deepEqual(states(screensLines(elsewhere)), ['blocking']);
  // Aucune configuration : bloquant, vers la configuration de la borne.
  const none = screensLines(screensFacts(undefined, borne));
  assert.deepEqual(none.map((l) => [l.state, l.target]), [['blocking', { kind: 'system', item: 'cabinet' }]]);
  // Une autre configuration correspondrait mieux, la retenue gardant une partie de ses écrans : à vérifier.
  assert.deepEqual(states(screensLines({ configurations: 2, plugged: 3, active: { name: 'Borne', total: 3, found: 2, missing: ['DMD'], extra: 1, playfieldFound: true }, better: 'Bureau' })), ['check']);
});

// ---------- VPX ----------

test('VPX : absent bloquant, plus ancien que celui que Cyber Pinball connaît à vérifier, sinon OK', () => {
  setLanguage('fr');
  assert.deepEqual(vpxLines({ known: '10.8.1-5436' }).map((l) => [l.state, l.target.kind]), [['blocking', 'install-vpx']]);
  const old = vpxLines({ installed: '10.8.0-2051', known: '10.8.1-5436' });
  assert.deepEqual(old.map((l) => [l.state, l.target.kind, l.go]), [['check', 'install-vpx', 'Installer VPX 10.8.1-5436']]);
  assert.deepEqual(vpxLines({ installed: '10.8.1-5436', known: '10.8.1-5436' }).map((l) => [l.state, l.target]), [['ok', { kind: 'system', item: 'vpx-settings' }]]);
  // Plus récent que le manifeste, ou numéro inconnu : rien à proposer.
  assert.deepEqual(states(vpxLines({ installed: '10.8.2-6000', known: '10.8.1-5436' })), ['ok']);
  assert.deepEqual(states(vpxLines({ installed: 'nightly', known: '10.8.1-5436' })), ['ok']);
});

// ---------- Chaque ligne mène à un écran réel ----------

/** Des relevés qui passent par chaque état de chaque contrôle. */
function everyCase(): HealthFacts[] {
  const at = '2026-10-26T10:00:00Z';
  const disks = [
    { root: 'C:\\', uses: ['data' as const], free: 100 * GB, total: 200 * GB },
    { root: 'D:\\', uses: ['downloads' as const], free: 5 * GB, total: 200 * GB },
    { root: 'E:\\', uses: ['tables' as const], free: GB, total: 200 * GB },
    { root: 'F:\\', uses: ['tables' as const] },
  ];
  const many = tablesFacts(Array.from({ length: 7 }, (_, i) => ({ file: `${i}.vpx`, title: `Table ${i}`, findings: [i % 2 ? crash : romMissing] })).concat([{ file: 'u.vpx', title: 'U', findings: undefined as never }]));
  const active = { name: 'Borne', total: 3, found: 3, missing: [], extra: 0, playfieldFound: true };
  return [
    { at, disks, tables: many, media: { tables: 0, medias: 0 }, screens: { configurations: 0, plugged: 3 }, vpx: { known: '10.8.1' } },
    { at, disks: [], tables: tablesFacts([]), media: { index: at, tables: 0, medias: 0 }, screens: { configurations: 1, plugged: 3, active }, vpx: { installed: '10.8.0', known: '10.8.1' } },
    { at, disks: [], tables: tablesFacts([{ file: 'a.vpx', title: 'A', findings: [] }]), media: { index: at, tables: 4, medias: 9 }, screens: { configurations: 2, plugged: 2, active: { ...active, found: 2, missing: ['DMD'] } }, vpx: { installed: '10.8.1', known: '10.8.1' } },
    { at, disks: [], screens: { configurations: 2, plugged: 2, active: { ...active, found: 2, missing: ['Playfield'], playfieldFound: false } }, vpx: { installed: '10.8.1' } },
    { at, disks: [], screens: { configurations: 2, plugged: 3, active: { ...active, found: 0, missing: ['A', 'B', 'C'] }, better: 'Bureau' }, vpx: {} },
    { at, disks: [], screens: { configurations: 2, plugged: 3, active, better: 'Bureau' }, vpx: {} },
  ];
}

test('chaque contrôle passe par ses états, et chaque ligne mène à un écran réel', () => {
  setLanguage('fr');
  const lines = everyCase().flatMap(healthLines);
  const seen = new Map<string, Set<HealthState>>();
  for (const l of lines) {
    (seen.get(l.check) ?? seen.set(l.check, new Set()).get(l.check)!).add(l.state);
    assert.ok(l.title, `${l.check} : ligne sans titre`);
    assert.ok(l.go, `${l.check} « ${l.title} » : ce qu'elle ouvre n'est pas dit`);
    assert.ok((HEALTH_TARGET_KINDS as readonly string[]).includes(l.target.kind), `${l.check} « ${l.title} » : cible inconnue`);
    assert.ok(targetReachable(l.target), `${l.check} « ${l.title} » : l'entrée ${JSON.stringify(l.target)} n'est dans aucune rubrique du menu système`);
  }
  const expected: Record<string, HealthState[]> = { disk: ['ok', 'check', 'blocking'], tables: ['ok', 'check', 'blocking'], media: ['ok', 'check'], screens: ['ok', 'check', 'blocking'], vpx: ['ok', 'check', 'blocking'] };
  for (const check of HEALTH_CHECKS) assert.deepEqual([...(seen.get(check) ?? [])].sort(), [...expected[check]!].sort(), `états du contrôle ${check}`);
  // Chaque sorte de cible sert.
  assert.deepEqual([...new Set(lines.map((l) => l.target.kind))].sort(), [...HEALTH_TARGET_KINDS].sort());
});

test('chaque entrée du menu système visée est fournie par l’application, et chaque sorte de cible a son ouverture', () => {
  setLanguage('fr');
  const app = path.join(REPO, 'app', 'src');
  const sources = fs.readdirSync(app).filter((f) => f.endsWith('.ts')).map((f) => fs.readFileSync(path.join(app, f), 'utf8')).join('\n');
  const items = new Set(everyCase().flatMap(healthLines).flatMap((l) => (l.target.kind === 'system' ? [l.target.item] : [])));
  for (const id of items) {
    assert.ok((SYSTEM_ITEM_IDS as readonly string[]).includes(id), id);
    const provided = new RegExp(`provideSystemItem\\(\\s*'${id}',`).test(sources) || new RegExp(`\\[\\s*(?://[^\\n]*\\s*)?'${id}',\\s*\\{`).test(sources);
    assert.ok(provided, `la santé de la borne mène à « ${id} », que l'application ne fournit pas`);
  }
  // app/src/health.ts : une ouverture par sorte de cible (le type l'impose, le test le rappelle).
  const health = fs.readFileSync(path.join(app, 'health.ts'), 'utf8');
  const open = /const OPEN[\s\S]*?\} = \{([\s\S]*?)\r?\n {2}\};/.exec(health)?.[1];
  assert.ok(open, 'table OPEN introuvable dans app/src/health.ts');
  const kinds = [...open!.matchAll(/^ {4}'?([\w-]+)'?: /gm)].map((m) => m[1]);
  assert.deepEqual(kinds.sort(), [...HEALTH_TARGET_KINDS].sort());
  // La santé elle-même est une entrée fournie, avec sa pastille.
  assert.match(sources, /provideSystemItem\('health', \{[\s\S]*?get attention\(\) \{\s*return health\.attention\(\);/);
});

test('pastille : seulement quand une ligne est bloquante', () => {
  setLanguage('fr');
  const at = '2026-10-26T10:00:00Z';
  assert.equal(healthAttention(undefined), false);
  assert.equal(healthAttention({ at, disks: [], vpx: { installed: '10.8.0', known: '10.8.1' } }), false);
  assert.equal(healthAttention({ at, disks: [], vpx: { known: '10.8.1' } }), true);
  assert.equal(healthAttention({ at, disks: [{ root: 'D:\\', uses: ['tables'], free: GB, total: 9 * GB }], vpx: { installed: '10.8.1' } }), true);
});

// ---------- Cache et date ----------

test('relevé gardé d’un lancement à l’autre ; un fichier abîmé est ignoré', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyberpinball-sante-'));
  assert.equal(loadHealthFacts(dir), undefined);
  const facts = everyCase()[0]!;
  saveHealthFacts(dir, facts);
  assert.deepEqual(loadHealthFacts(dir), facts);
  fs.writeFileSync(path.join(dir, 'cache', 'sante.json'), '{"at": 3');
  assert.equal(loadHealthFacts(dir), undefined);
  fs.writeFileSync(path.join(dir, 'cache', 'sante.json'), '{"at": "x"}');
  assert.equal(loadHealthFacts(dir), undefined);
});

test('date du relevé : à l’instant, en minutes, en heures, puis la date', () => {
  setLanguage('fr');
  const at = Date.parse('2026-10-26T10:00:00Z');
  assert.equal(healthAge(new Date(at).toISOString(), at + 20_000), 'Vérifié à l’instant');
  assert.equal(healthAge(new Date(at).toISOString(), at + 3 * 60_000), 'Vérifié il y a 3 min');
  assert.equal(healthAge(new Date(at).toISOString(), at + 5 * 3600_000), 'Vérifié il y a 5 h');
  assert.match(healthAge(new Date(at).toISOString(), at + 3 * 86400_000), /^Vérifié le 26 octobre 2026$/);
  setLanguage('en');
  assert.equal(healthAge(new Date(at).toISOString(), at + 3 * 60_000), 'Checked 3 min ago');
  setLanguage('fr');
});

// ---------- Rendu ----------

test('rendu : chaque ligne est une action, choisie seule, jamais répétée dans la liste des actions', () => {
  const { document, send } = menuRenderer();
  // Le rendu garde la ligne choisie visible : linkedom ne fait pas défiler.
  let proto = Object.getPrototypeOf(document.createElement('li'));
  while (proto && proto.constructor.name !== 'Element') proto = Object.getPrototypeOf(proto);
  proto.scrollIntoView = () => {};
  const line = (state: string, title: string, action: number) => ({ state, title, detail: 'détail', go: 'Ouvrir', word: state, sign: '!', tone: 'warning', action });
  send({
    role: 'playfield',
    phase: 'library',
    help: false,
    count: 1,
    position: 1,
    neighbors: [],
    footer: [],
    gameKeys: [],
    menuKeys: [],
    nav: {},
    library: {
      screen: 'custom',
      heading: 'Santé de la borne',
      icon: 'health',
      back: 'Retour',
      sections: [],
      cursor: 1,
      actions: [{ label: 'Téléchargements' }, { label: 'Téléchargements' }, { label: 'Médecin' }, { label: 'Vérifier maintenant', icon: 'refresh' }, { label: 'Retour', icon: 'back' }],
      health: {
        counts: [{ state: 'blocking', n: 1, word: 'Bloquant', sign: '✕', tone: 'error' }, { state: 'check', n: 0, word: 'À vérifier', sign: '!', tone: 'warning' }],
        when: 'Vérifié il y a 2 min',
        busy: false,
        groups: [
          { title: 'Espace disque', icon: 'drive', lines: [line('ok', 'C:', 0), line('check', 'D:', 1)] },
          { title: 'Tables', icon: 'tables', lines: [line('blocking', 'Medieval Madness', 2)] },
        ],
      },
    },
  });
  const lines = [...document.querySelectorAll('.health-line')];
  assert.equal(lines.length, 3);
  assert.deepEqual(lines.map((l) => JSON.parse(l.getAttribute('data-act')!).index), [0, 1, 2]);
  // Deux lignes mènent au même écran : une seule est choisie, celle du curseur.
  assert.deepEqual(lines.map((l) => l.classList.contains('selected')), [false, true, false]);
  // La liste des actions ne garde que les actions générales.
  assert.deepEqual([...document.querySelectorAll('.lib-action')].map((a) => a.getAttribute('data-label')), ['Vérifier maintenant', 'Retour']);
  // Un compte à zéro reste lisible, sans la couleur de l'alerte.
  assert.ok(document.querySelector('.health-count.tone-warning')!.classList.contains('none'));
  assert.equal(document.querySelector('.lib-body')!.className, 'lib-body lib-health');
});
