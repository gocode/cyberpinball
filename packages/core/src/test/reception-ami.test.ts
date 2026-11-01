// Récupérer une table chez un ami, retours du 01/11/2026 à la borne :
// - la ROM n'était pas claire : l'écran des parties s'ouvrait le curseur sur « Récupérer… », hors
//   de la liste, et rien ne disait qu'on pouvait y revenir cocher la ROM (attestation des droits) ;
// - la même table partait trois fois : après « Continuer en arrière-plan », rien ne montrait que la
//   réception tournait, et Start sur la table la relançait.
// Invariants fixés ici, sur le vrai menu (app/src/friend-library-menu.ts, compilé) et le vrai
// gestionnaire de téléchargements, avec un ami et un transport simulés (aucun réseau) :
// - une réception (DownloadJob.dedupe) ne se lance jamais deux fois tant qu'elle tourne, attend ou
//   n'est pas installée ; Start sur la table mène à son écran ;
// - son état « en cours » se voit là où on l'a lancée : la ligne de la table dans la bibliothèque
//   de l'ami (badge, barre), la fiche de la table (« Voir la réception… »), la fiche de l'ami ;
// - l'écran des parties s'ouvre dans la liste, sur la première partie ; chaque ligne dit « Cochée »
//   ou « Non cochée » ; la ROM se coche par Start, l'attestation, puis revient sur sa ligne, cochée ;
// - la classe : tout `manager.add(` de l'application porte sa clé `dedupe`, et le navigateur intégré
//   ne relance pas un lien qui se télécharge déjà.

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { REPO_ROOT } from './i18n-scan';
import { createDownloadManager, downloadReasonText, encodePng, jobBytes, layoutOf, partLabel, pendingDownload, scanTables, screenZones, setLanguage, skippedFiles, tableContents, type DownloadJob, type DownloadTransport } from '../index';
import type { TableEntry } from '../tables';

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFriendLibraryMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'friend-library-menu.js')) as {
  createFriendLibraryMenu(host: object): { open(key: string, back: () => void): void; detail(key: string): string; openMatching(key: string, identity: object, back: () => void, want?: string[]): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

interface Row {
  text: string;
  detail?: string;
  badges?: string[];
  action?: number;
  pick?: boolean;
  progress?: { value?: number };
  note?: { text: string; tone: string };
}
interface Built {
  heading: string;
  sections: { title?: string; rows: Row[] }[];
  actions: { label: string; detail?: string; run(): void }[];
  hint?: string;
  back(): void;
}

const tick = () => new Promise((r) => setImmediate(r));
const job = (over: Partial<DownloadJob>): DownloadJob => ({ id: 'j', kind: 'friend-table', title: 'T', source: { kind: 'friend', label: 'Ami', key: 'ami' }, files: [], state: 'queued', back: { screen: 'downloads' }, created: '', updated: '', tries: 0, resumable: true, ...over });

test('file : une clé déjà en cours, en attente ou pas encore rendue n’est jamais relancée', () => {
  const k = 'friend-table:ami:t1';
  for (const state of ['queued', 'running', 'waiting', 'paused'] as const) assert.equal(pendingDownload([job({ dedupe: k, state })], k)?.state, state, state);
  assert.ok(pendingDownload([job({ dedupe: k, state: 'done', delivered: false })], k), 'reçue, pas encore installée');
  for (const over of [{ state: 'done' as const, delivered: true }, { state: 'failed' as const }, { state: 'cancelled' as const }]) assert.equal(pendingDownload([job({ dedupe: k, ...over })], k), undefined, over.state);
  assert.equal(pendingDownload([job({ dedupe: 'autre', state: 'running' })], k), undefined, 'une autre table');
  // La plus récente des deux : une annulée, puis une relancée.
  assert.equal(pendingDownload([job({ id: 'a', dedupe: k, state: 'cancelled' }), job({ id: 'b', dedupe: k, state: 'running' })], k)?.id, 'b');
});

test('gestionnaire : add() d’une clé déjà demandée rend la même, sans doublon dans la file', () => {
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reception-'));
  const lines: string[] = [];
  const manager = createDownloadManager({ dataDir, transports: {}, log: (l) => lines.push(l) });
  try {
    const spec = { kind: 'friend-table' as const, title: 'Toute la table : Comet', source: { kind: 'friend' as const, label: 'Ami', key: 'ami' }, files: [{ ref: 'f', name: 'f.vpx', part: path.join(dataDir, 'f.part') }], back: { screen: 'downloads' as const }, resumable: true, dedupe: 'friend-table:ami:t1' };
    const first = manager.add(spec);
    const again = manager.add(spec);
    assert.equal(again.id, first.id);
    assert.equal(manager.jobs().length, 1);
    assert.match(lines.join('\n'), /déjà demandé/, 'le journal le dit');
    assert.equal(manager.pending('friend-table:ami:t1')?.id, first.id);
    // Annulée : on peut la redemander, c'est un nouveau téléchargement.
    manager.cancel(first.id);
    assert.equal(manager.pending('friend-table:ami:t1'), undefined);
    assert.notEqual(manager.add(spec).id, first.id);
    // Sans clé, rien ne change : chaque add() ajoute.
    const { dedupe: _, ...plain } = spec;
    manager.add(plain);
    manager.add(plain);
    assert.equal(manager.jobs().length, 4);
  } finally {
    manager.stop();
  }
});

/** Un ami simulé, sa table « Comet Lounge » (pas sur la borne) : table, fronton, ROM, PuP-Pack. */
function setup() {
  setLanguage('fr');
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-reception-ami-'));
  // Transport de l'ami : la moitié du premier fichier arrive, puis il se tait (la réception tourne).
  const transport: DownloadTransport = {
    available: () => true,
    fetch: (run) =>
      new Promise((resolve) => {
        fs.mkdirSync(path.dirname(run.file.part), { recursive: true });
        fs.writeFileSync(run.file.part, Buffer.alloc(Math.floor((run.file.bytes ?? 0) / 2)));
        run.progress(Math.floor((run.file.bytes ?? 0) / 2));
        run.signal.addEventListener('abort', () => resolve({ ok: false, reason: 'network' }));
      }),
  };
  const manager = createDownloadManager({ dataDir: dir, transports: { friend: transport } });
  let shown: { build: () => Built; at: number } | undefined;
  const files = [
    { id: 'f1', rel: 'Comet Lounge.vpx', bytes: 40_000, part: 'table' },
    { id: 'f2', rel: 'Comet Lounge.directb2s', bytes: 20_000, part: 'b2s' },
    { id: 'f3', rel: 'roms/comet.zip', bytes: 4_000, part: 'rom' },
    { id: 'f4', rel: 'pupvideos/comet/a.mp4', bytes: 9_000, part: 'pup' },
  ];
  let listings = 0;
  const steps = new Map<string, (job: DownloadJob) => unknown>();
  const menu = createFriendLibraryMenu({
    library: {
      openCustom: (build: () => Built, at = 0) => (shown = { build, at }),
      isShowing: (build: () => Built) => shown?.build === build,
      openSystem() {},
      openMediasWith() {},
      catalogFor() {},
      installReceived() {},
    },
    net: { state: () => ({ friends: [{ key: 'ami', name: 'Ami' }] }), online: () => true },
    content: {
      library: () => ({ state: 'ready', library: { at: new Date().toISOString(), tables: [{ id: 't1', table: { title: 'Comet Lounge', manufacturer: 'Halcyon', year: 1990 }, medias: [] }] } }),
      refresh() {},
      tableVersions: () => new Map(),
      tableFiles: async () => (listings++, files),
      tableDir: (folder: string) => path.join(dir, 'amis', 'tables', folder),
      receivedDir: () => path.join(dir, 'amis', 'recus'),
      stop() {},
    },
    downloads: { manager, finisher() {}, deliverer() {}, opener() {}, deliver() {}, openReturn() {}, nextStep: (kind: string, fn: (job: DownloadJob) => unknown) => steps.set(kind, fn) },
    live: { inviteOn() {} },
    tables: () => [],
    root: () => dir,
    redraw() {},
  });
  const view = () => {
    assert.ok(shown, 'un écran est ouvert');
    return shown.build();
  };
  const act = (label: string) => {
    const b = view();
    const a = b.actions.find((x) => x.label.startsWith(label));
    assert.ok(a, `pas d’action « ${label} » (${b.actions.map((x) => x.label).join(' | ')})`);
    a.run();
  };
  return { manager, menu, view, act, steps, at: () => shown!.at, listings: () => listings, stop: () => manager.stop() };
}

test('écran des parties : ouvert dans la liste, cochée ou non en toutes lettres, la ROM par l’attestation', async () => {
  const s = setup();
  try {
    s.menu.open('ami', () => undefined);
    s.act('Comet Lounge');
    s.act('Récupérer toute la table');
    await tick();
    s.view();
    await tick(); // les parties arrivées, l'écran se rouvre sur sa première action
    let parts = s.view();
    assert.equal(parts.heading, 'Récupérer toute la table');
    // Les parties d'abord : le curseur (0) est dans la liste, sur la table.
    assert.equal(s.at(), 0);
    assert.equal(parts.actions[0]!.label, partLabel('table'));
    const zones = screenZones(parts as never, parts.actions.length);
    assert.ok(zones && zones.list[0] === 0 && zones.list.length === 4, 'la liste des parties porte la première action');
    // Les flippers descendent de la dernière partie à « Récupérer… », puis « Retour ».
    assert.match(parts.actions[4]!.label, /^Récupérer les 2 parties cochées/);
    assert.equal(parts.actions[5]!.label, 'Retour');
    assert.equal((parts as { listStart?: string }).listStart, 'cocher ou décocher la partie', 'le bandeau de la liste dit que Start coche');
    const row = (part: string) => parts.sections.flatMap((x) => x.rows).find((r) => r.text === partLabel(part as never))!;
    assert.deepEqual(row('table').badges, ['Cochée']);
    assert.deepEqual(row('rom').badges, ['Non cochée']);
    assert.match(row('rom').note?.text ?? '', /Start, puis l’attestation/, 'la ROM dit comment la prendre');
    assert.match(row('pup').note?.text ?? '', /Start, puis l’attestation/);
    assert.match(parts.sections.find((x) => x.title)!.title!, /2 cochées sur 4/);
    // Start sur la ROM : l'attestation ; cochée, le curseur passe sur « Prendre la ROM ».
    s.act(partLabel('rom'));
    assert.equal(s.view().heading, 'La ROM : vos droits');
    s.act('Prendre la ROM');
    assert.equal(s.view().heading, 'La ROM : vos droits', 'sans attestation cochée, rien ne se prend');
    s.act('J’atteste');
    assert.equal(s.at(), 1, 'curseur sur « Prendre la ROM »');
    s.act('Prendre la ROM');
    parts = s.view();
    assert.equal(parts.heading, 'Récupérer toute la table');
    assert.equal(parts.actions[s.at()]!.label, partLabel('rom'), 'retour sur la ligne de la ROM');
    assert.deepEqual(row('rom').badges, ['Cochée']);
    assert.match(row('rom').note?.text ?? '', /Droits attestés/);
    assert.match(parts.actions[4]!.label, /^Récupérer les 3 parties cochées/);
    s.act('Récupérer les 3');
    const queued = s.manager.jobs();
    assert.equal(queued.length, 1);
    assert.ok(queued[0]!.files.some((f) => f.name === 'roms/comet.zip'), 'la ROM attestée part avec la table');
    assert.ok(!queued[0]!.files.some((f) => f.name.startsWith('pupvideos/')), 'le PuP-Pack non attesté reste chez l’ami');
    // Tout fichier sauf la table elle-même est facultatif : refusé, il serait sauté sans arrêter les autres.
    assert.deepEqual(queued[0]!.files.map((f) => `${f.name}:${f.optional ? 'facultatif' : 'requis'}`), ['Comet Lounge.vpx:requis', 'Comet Lounge.directb2s:facultatif', 'roms/comet.zip:facultatif']);
  } finally {
    s.stop();
  }
});

test('toute partie décochée d’office, une seule règle : elle dit qu’elle est là et comment la cocher ; ROM et PuP-Pack par leur attestation', async () => {
  const s = setup();
  try {
    s.menu.open('ami', () => undefined);
    s.act('Comet Lounge');
    s.act('Récupérer toute la table');
    await tick();
    s.view();
    await tick();
    const rows = () => s.view().sections.flatMap((x) => x.rows).filter((r) => r.pick);
    const row = (part: string) => rows().find((r) => r.text === partLabel(part as never))!;
    // Décocher une partie libre : elle aussi dit comment la reprendre.
    s.act(partLabel('b2s'));
    for (const r of rows()) {
      if (r.badges?.[0] === 'Cochée') continue;
      assert.match(r.note?.text ?? '', /^Disponible/, `« ${r.text} », non cochée, dit qu’elle est disponible`);
      assert.match(r.note?.text ?? '', /Start/, `« ${r.text} » dit comment la cocher`);
    }
    assert.equal(row('b2s').note?.text, 'Disponible : Start pour la cocher');
    // Chaque partie sous droits, la même attestation, puis retour sur sa ligne, cochée.
    for (const [part, heading, take] of [['rom', 'La ROM : vos droits', 'Prendre la ROM'], ['pup', 'Le PuP-Pack : vos droits', 'Prendre le PuP-Pack']] as const) {
      assert.equal(row(part).note?.text, 'Disponible, à cocher vous-même : Start, puis l’attestation de vos droits');
      s.act(partLabel(part));
      assert.equal(s.view().heading, heading);
      s.act('J’atteste');
      assert.equal(s.view().actions[s.at()]!.label, take, 'le curseur sur le geste qui suit');
      s.act(take);
      assert.equal(s.view().actions[s.at()]!.label, partLabel(part), 'retour sur sa ligne');
      assert.deepEqual(row(part).badges, ['Cochée']);
      assert.match(row(part).note?.text ?? '', /^Droits attestés/);
    }
    s.act('Récupérer les 3');
    assert.deepEqual(s.manager.jobs()[0]!.data?.attested, ['rom', 'pup']);
  } finally {
    s.stop();
  }
});

test('réception : jamais deux fois, son état « en cours » se voit sur la table, Start y mène', async () => {
  const s = setup();
  try {
    const home = () => s.menu.open('ami', () => undefined);
    home();
    s.act('Comet Lounge');
    s.act('Récupérer toute la table');
    await tick();
    s.view();
    await tick();
    s.act('Récupérer les 2');
    assert.equal(s.view().heading, 'Réception de la table');
    for (let i = 0; i < 20 && s.manager.jobs()[0]?.state !== 'running'; i++) await tick();
    await new Promise((r) => setTimeout(r, 50));
    const transfer = s.view();
    const rows = transfer.sections.flatMap((x) => x.rows);
    assert.ok(rows.some((r) => r.text === 'Réception en cours' && r.progress), 'la barre de la réception');
    assert.ok(rows.some((r) => /^Lancée à .* rien d’autre à faire$/.test(r.text)), 'elle est lancée, une fois pour toutes');
    // « Continuer en arrière-plan » : la fiche de la table la montre, sans « Récupérer toute la table ».
    s.act('Continuer en arrière-plan');
    let table = s.view();
    assert.equal(table.actions[0]!.label, 'Voir la réception de la table', 'le curseur est sur la réception');
    assert.ok(!table.actions.some((a) => a.label === 'Récupérer toute la table'), 'plus rien pour la relancer');
    assert.ok(table.sections.flatMap((x) => x.rows).some((r) => r.text === 'Table : Réception en cours' && r.progress?.value !== undefined && r.progress.value > 0));
    // La bibliothèque de l'ami : la ligne de la table, son badge et sa barre ; Start mène à la réception.
    home();
    const line = s.view().sections.flatMap((x) => x.rows).find((r) => r.text.startsWith('Comet Lounge'))!;
    assert.deepEqual(line.badges, ['Réception en cours']);
    assert.ok(line.progress, 'sa barre');
    assert.match(line.detail ?? '', /%.*Start : voir la réception/);
    s.act('Comet Lounge');
    assert.equal(s.view().heading, 'Réception de la table');
    // Toutes les entrées qui la lanceraient mènent à la même : l'invitation (openMatching), la fiche de l'ami.
    s.menu.openMatching('ami', { title: 'Comet Lounge', manufacturer: 'Halcyon', year: 1990 }, () => undefined, ['rom']);
    s.act('Voir la réception de la table');
    assert.equal(s.view().heading, 'Réception de la table');
    assert.match(s.menu.detail('ami'), /1 réception en cours/);
    assert.equal(s.manager.jobs().length, 1, 'une seule réception dans la file');
    assert.equal(s.listings(), 1, 'ses parties n’ont été redemandées à aucun moment');
    // Annulée : la table se récupère de nouveau.
    s.act('Annuler la réception');
    table = s.view();
    assert.ok(table.actions.some((a) => a.label === 'Récupérer toute la table'));
  } finally {
    s.stop();
  }
});

test('la classe : chaque téléchargement lancé d’un menu porte sa clé, le navigateur ne relance pas un lien en cours', () => {
  const dir = path.join(REPO_ROOT, 'app', 'src');
  for (const file of fs.readdirSync(dir).filter((f) => f.endsWith('.ts'))) {
    const src = fs.readFileSync(path.join(dir, file), 'utf8');
    for (const m of src.matchAll(/manager\.add\(\{/g)) {
      const call = src.slice(m.index, src.indexOf('\n    });', m.index));
      assert.match(call, /\n\s+dedupe: /, `${file} : manager.add sans clé dedupe (une action longue ne se lance qu’une fois)`);
    }
  }
  const browser = fs.readFileSync(path.join(dir, 'acquire-window.ts'), 'utf8');
  assert.match(browser, /d\.item\.getURL\(\) === item\.getURL\(\) && d\.item\.getState\(\) === 'progressing'[\s\S]{0,80}_event\.preventDefault\(\)/);
});

// ---------------------------------------------------------------------------
// Ce qui est annoncé est ce qui est servi (01/11/2026, The Goonies : un « (GameInfo) ….png » qui était
// un JPEG, annoncé comme fichier de la table puis refusé à l'envoi : la table s'arrêtait au fichier
// 365 sur 368, « ne le partage plus »).

/* eslint-disable @typescript-eslint/no-require-imports */
const { createFriendContent } = require(path.join(REPO_ROOT, 'app', 'dist', 'friend-content.js')) as { createFriendContent(o: object): { stop(): void } };
const sources = require(path.join(REPO_ROOT, 'app', 'dist', 'download-sources.js')) as { friendReason(r: string): string; friendDetail(r: string, file: string): string | undefined };
const { createDownloadCenter } = require(path.join(REPO_ROOT, 'app', 'dist', 'download-center.js')) as { createDownloadCenter(o: object): { openJob(id: string): void; open(): void } };
/* eslint-enable @typescript-eslint/no-require-imports */

test('annonce et service cohérents : un média que l’envoi refuserait n’est annoncé ni dans la bibliothèque ni dans sa table', async () => {
  setLanguage('fr');
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-annonce-'));
  const root = path.join(base, 'borne');
  const folder = path.join(layoutOf(root).tables, 'The Goonies (VPW 2021)');
  fs.mkdirSync(path.join(folder, 'medias'), { recursive: true });
  fs.writeFileSync(path.join(folder, 'The Goonies (VPW 2021).vpx'), Buffer.alloc(5000, 7));
  fs.writeFileSync(path.join(folder, 'medias', '(Wheel) The Goonies (VPW 2021).png'), encodePng({ width: 8, height: 8, data: Buffer.alloc(8 * 8 * 4, 200) }));
  // Un JPEG nommé .png : les contrôles de l'import le refusent.
  fs.writeFileSync(path.join(folder, 'medias', '(GameInfo) The Goonies (VPW 2021).png'), Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(3000, 1)]));
  const sent: { t: string; req?: number; files?: { id: string; rel: string }[]; tables?: { id: string; medias: { id: string; type: string }[] }[] }[] = [];
  let handler: (key: string, message: object) => void = () => undefined;
  const lines: string[] = [];
  const content = createFriendContent({
    net: { state: () => ({ shareLibrary: true }), online: () => true, send: (_k: string, m: never) => (sent.push(m), true), sendChunk: async () => true, onMessage: (fn: typeof handler) => ((handler = fn), () => undefined), onChunk: () => () => undefined },
    dataDir: path.join(base, 'donnees'),
    tables: () => scanTables(layoutOf(root).tables),
    root: () => root,
    contents: (table: TableEntry) => tableContents(table.file, { ownFolder: true, romLibrary: layoutOf(root).roms }),
    log: (l: string) => lines.push(l),
  });
  try {
    handler('ami', { t: 'library-get' });
    const library = sent.filter((m) => m.t === 'library').flatMap((m) => m.tables ?? []);
    assert.equal(library.length, 1);
    assert.deepEqual(library[0]!.medias.map((m) => m.type), ['Wheel'], 'le GameInfo refusé n’est pas dans la bibliothèque');
    handler('ami', { t: 'table-files-get', req: 1, table: library[0]!.id });
    const files = sent.filter((m) => m.t === 'table-files').flatMap((m) => m.files ?? []);
    assert.ok(files.some((f) => f.rel.endsWith('.vpx')) && files.some((f) => f.rel.includes('(Wheel)')));
    assert.ok(!files.some((f) => f.rel.includes('(GameInfo)')), 'ni dans les fichiers de sa table');
    assert.match(lines.join('\n'), /« \(GameInfo\) The Goonies \(VPW 2021\)\.png » n'est pas annoncé \(le contenu ne correspond pas à son nom/);
    // Tout ce qui est annoncé est servi : un en-tête de fichier, jamais un refus.
    let req = 10;
    for (const id of [...files.map((f) => f.id), ...library[0]!.medias.map((m) => m.id)]) {
      const n = ++req;
      handler('ami', { t: 'file-get', req: n, table: library[0]!.id, file: id });
      // Un fichier à la fois par ami : le suivant attend la fin de celui-ci.
      for (let i = 0; i < 200 && !sent.some((m) => m.req === n && (m.t === 'file-end' || m.t === 'file-refused')); i++) await tick();
      assert.ok(sent.some((m) => m.req === n && m.t === 'file-head'), `annoncé, donc servi : ${id}`);
      assert.ok(!sent.some((m) => m.req === n && m.t === 'file-refused'));
    }
  } finally {
    content.stop();
  }
});

test('un fichier facultatif refusé est sauté avec sa raison exacte ; la table elle-même, jamais', async () => {
  setLanguage('fr');
  // La raison de l'ami, dans les mots du gestionnaire : ses contrôles, pas « ne le partage plus ».
  assert.equal(sources.friendReason('refused'), 'check');
  assert.equal(sources.friendDetail('refused', 'medias/(GameInfo) X.png'), 'média refusé par les contrôles : medias/(GameInfo) X.png');
  assert.equal(sources.friendReason('not-shared'), 'refused');
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-saute-'));
  const transport: DownloadTransport = {
    available: () => true,
    fetch: async (run) => {
      if (run.file.ref.startsWith('bad')) return { ok: false, reason: 'check', detail: sources.friendDetail('refused', run.file.name)! };
      fs.writeFileSync(run.file.dest!, 'ok');
      return { ok: true, file: run.file.dest! };
    },
  };
  const manager = createDownloadManager({ dataDir, transports: { friend: transport } });
  try {
    const file = (ref: string, optional: boolean) => ({ ref, name: `${ref}.png`, bytes: 2, dest: path.join(dataDir, ref), part: path.join(dataDir, `${ref}.part`), ...(optional ? { optional } : {}) });
    const spec = { kind: 'friend-table' as const, title: 'T', back: { screen: 'downloads' as const }, resumable: true };
    // Deux amis : la file n'envoie qu'un fichier à la fois par source.
    const ok = manager.add({ ...spec, source: { kind: 'friend', label: 'Ami', key: 'ami' }, files: [file('a', false), file('bad1', true), file('c', true)] });
    const blocked = manager.add({ ...spec, source: { kind: 'friend', label: 'Autre', key: 'autre' }, files: [file('bad2', false), file('d', true)] });
    for (let i = 0; i < 300 && [ok, blocked].some((j) => !['done', 'failed'].includes(manager.get(j.id)!.state)); i++) await new Promise((r) => setTimeout(r, 10));
    const done = manager.get(ok.id)!;
    assert.equal(done.state, 'done', 'un média refusé n’arrête pas la table');
    assert.deepEqual(done.files[1]!.skipped, { reason: 'check', detail: 'média refusé par les contrôles : bad1.png' });
    assert.ok(done.files[2]!.done && !done.files[2]!.skipped, 'la suite est arrivée');
    assert.deepEqual(skippedFiles(done).map((x) => x.why), ['média refusé par les contrôles : bad1.png']);
    assert.equal(jobBytes(done).total, 4, 'un fichier sauté ne compte pas dans l’attendu');
    const failed = manager.get(blocked.id)!;
    assert.equal(failed.state, 'failed', 'le fichier requis (la table) refusé : échec');
    assert.equal(downloadReasonText(failed), 'média refusé par les contrôles : bad2.png', 'la vraie raison, jamais « ne le partage plus »');
  } finally {
    manager.stop();
  }
});

test('un travail fini propose d’abord sa suite : « Installer dans ma bibliothèque », « Reçue, pas encore installée »', async () => {
  const s = setup();
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-suite-'));
  const manager = createDownloadManager({ dataDir, transports: { friend: { available: () => true, fetch: async (run) => (fs.writeFileSync(run.file.part, 'x'), { ok: true, file: run.file.part }) } } });
  try {
    const dir = path.join(dataDir, 'recue');
    fs.mkdirSync(dir);
    const job = manager.add({ kind: 'friend-table', title: 'Toute la table : Comet', source: { kind: 'friend', label: 'Ami', key: 'ami' }, files: [{ ref: 'f', name: 'f.vpx', part: path.join(dir, 'f.vpx') }], back: { screen: 'friend-library', friend: 'ami' }, data: { dir }, resumable: true });
    for (let i = 0; i < 200 && manager.get(job.id)!.state !== 'done'; i++) await new Promise((r) => setTimeout(r, 10));
    // La bibliothèque d'un ami pose la suite de ses téléchargements.
    const step = s.steps.get('friend-table')!;
    type Shown = { actions: { label: string }[]; sections: { rows: { text: string; detail?: string; note?: { text: string } }[] }[] };
    let shown: () => Shown = () => ({ actions: [], sections: [] });
    const center = createDownloadCenter({
      manager,
      show: (build: () => Shown) => (shown = build),
      world: { hasTable: () => false, hasFriend: () => true, tableTitle: () => undefined, friendName: () => 'Ami' },
      nextStep: (j: DownloadJob) => step(j),
      deliver() {},
      files: { detail: () => '', open() {} },
      back() {},
    });
    center.openJob(job.id);
    assert.equal(shown().actions[0]!.label, 'Installer dans ma bibliothèque', 'la suite d’abord');
    assert.ok(!shown().actions.some((a) => a.label.startsWith('Revenir à')), 'pas de retour à la bibliothèque de l’ami');
    assert.ok(shown().sections[0]!.rows.some((r) => r.detail?.includes('Reçue, pas encore installée')));
    center.open();
    assert.match(shown().sections.flatMap((x) => x.rows).find((r) => r.text === job.title)!.note!.text, /^Reçue, pas encore installée · Start : Installer dans ma bibliothèque/);
    // Installée (le plan d'ajout a rangé le dossier reçu) : plus de suite, le retour habituel.
    fs.rmSync(dir, { recursive: true });
    center.openJob(job.id);
    assert.ok(shown().actions[0]!.label.startsWith('Revenir à'));
  } finally {
    manager.stop();
    s.stop();
  }
});
