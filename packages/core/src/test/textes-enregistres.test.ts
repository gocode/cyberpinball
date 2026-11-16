// Textes enregistrés : jamais traduits sur le disque (i18n.ts, LaterText). Un fichier de données
// écrit en français se relit en anglais sans un mot de français ; un ancien fichier, qui tient
// déjà le texte traduit, se convertit à la lecture. Le parcours (parcours.json) a ses propres
// essais dans journey.test.ts.
//
// translatedStrings() sert de détecteur pour tout nouvel état enregistré : il relève, dans un
// fichier JSON, les chaînes qui sortent du catalogue des traductions (français ou anglais).

import assert from 'node:assert/strict';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import {
  activityText,
  addActivity,
  addToWaitList,
  badgeLabel,
  contentSummary,
  contentSummaryText,
  downloadJournalFile,
  downloadInventory,
  emptyActivity,
  laterNumber,
  loadActivity,
  loadDownloadQueue,
  loadWaitList,
  markReceived,
  messagesOf,
  noteDownloadUse,
  readContentCounts,
  readStoredText,
  recognizeText,
  saveActivity,
  saveDownloadQueue,
  saveWaitList,
  say,
  setLanguage,
  t,
  tLater,
  tn,
  tnLater,
  waitListFile,
  type ContentCounts,
  type DownloadJob,
  type StoredText,
  type WaitList,
} from '../index';
import { judgeWebFile } from '../webmedia';
import { SessionOrientation } from '../sessionorientation';

const en = (key: string) => messagesOf('en')[key]!;

/**
 * Chaînes d'un JSON qui sortent du catalogue des traductions : du texte traduit enregistré. La clé
 * d'un LaterText (le gabarit français, gardé exprès), un TextRef et les identifiants (« received »,
 * « Wheel ») ne comptent pas.
 */
function translatedStrings(json: string): string[] {
  const out: string[] = [];
  const walk = (v: unknown): void => {
    if (typeof v === 'string') {
      if (!/^[\w.-]+$/.test(v) && recognizeText(v)) out.push(v);
    } else if (Array.isArray(v)) v.forEach(walk);
    else if (v && typeof v === 'object') {
      const o = v as Record<string, unknown>;
      if (typeof o.ref === 'string' && typeof o.id === 'string') return;
      const later = typeof o.key === 'string' && Object.keys(o).every((k) => ['key', 'many', 'count', 'params'].includes(k));
      for (const [k, x] of Object.entries(o)) if (!(later && (k === 'key' || k === 'many'))) walk(x);
    }
  };
  walk(JSON.parse(json.replace(/^\uFEFF/, '')));
  return out;
}

function tmp(name: string): string {
  return fs.mkdtempSync(path.join(os.tmpdir(), `cyberpinball-${name}-`));
}

test('texte différé : clé et paramètres gardés, dits dans la langue du moment', () => {
  try {
    const later = tLater('Parties de {table}', { table: 'Terminator 2' });
    const plural = tnLater(3, '{n} image', '{n} images');
    const nested = tLater('Liste d’attente : {item}', { item: tLater('{kind} : {label}', { kind: { ref: 'need', id: 'b2s' }, label: 'VPW 1.0' }) });
    const stored = JSON.parse(JSON.stringify([later, plural, nested, { ref: 'mediaType', id: 'Wheel' }])) as StoredText[];
    setLanguage('fr');
    assert.equal(say(stored[0]), 'Parties de Terminator 2');
    assert.equal(say(stored[1]), '3 images');
    assert.equal(say(stored[2]), `Liste d’attente : ${t('Fronton (.directb2s)')} : VPW 1.0`);
    assert.equal(say(stored[3]), 'Logo');
    assert.equal(say(stored), `Parties de Terminator 2 3 images Liste d’attente : ${t('Fronton (.directb2s)')} : VPW 1.0 Logo`);
    setLanguage('en');
    assert.equal(say(stored[0]), 'Parts of Terminator 2');
    assert.equal(say(stored[1]), '3 images');
    assert.equal(say(stored[3]), t('Logo'));
    assert.equal(say(stored[2]), en('Liste d’attente : {item}').replace('{item}', en('{kind} : {label}').replace('{kind}', t('Fronton (.directb2s)')).replace('{label}', 'VPW 1.0')));
    // Un score gardé brut s'écrit à la façon de la langue du moment.
    const score = JSON.parse(JSON.stringify(tLater('Nouveau meilleur score sur {table} : {score}', { table: 'T2', score: laterNumber(84520310) }))) as StoredText;
    assert.equal(say(score), en('Nouveau meilleur score sur {table} : {score}').replace('{table}', 'T2').replace('{score}', '84,520,310'));
    setLanguage('fr');
    assert.match(say(score), /84\s520\s310$/u);
    setLanguage('en');
    // Un nom (table, fichier) n'est pas un texte de l'interface : dit tel quel.
    assert.equal(say('Attack from Mars.vpx'), 'Attack from Mars.vpx');
    assert.equal(say(undefined), '');
  } finally {
    setLanguage('fr');
  }
});

test('ancien texte déjà traduit : reconnu dans le catalogue, en français ou en anglais', () => {
  try {
    setLanguage('fr');
    assert.deepEqual(recognizeText('Parties de Terminator 2'), { key: 'Parties de {table}', params: { table: 'Terminator 2' } });
    assert.deepEqual(recognizeText('Parts of Terminator 2'), { key: 'Parties de {table}', params: { table: 'Terminator 2' } });
    assert.deepEqual(recognizeText('Étape 3 sur 4'), { key: 'Étape {n} sur {total}', params: { n: 3, total: '4' } });
    assert.deepEqual(recognizeText('version sans auteur'), { key: 'version sans auteur' });
    // Le gabarit le plus précis l'emporte sur un plus vague.
    assert.equal(recognizeText('Ajout d’une ROM')?.key, 'Ajout d’une ROM');
    // Pas un texte de l'interface : gardé tel quel.
    assert.equal(recognizeText('Attack from Mars'), undefined);
    assert.equal(readStoredText('Attack from Mars'), 'Attack from Mars');
    setLanguage('en');
    assert.equal(say(readStoredText('Ajout d’une ROM')), 'Adding a ROM');
    assert.equal(say(readStoredText('place 2')), 'rank 2');
  } finally {
    setLanguage('fr');
  }
});

test('liste d’attente : enregistrée en français, relue en anglais ; un ancien acquisition.json converti', () => {
  const dir = tmp('attente-langue');
  try {
    setLanguage('fr');
    const list: WaitList = { items: [] };
    const game = { id: 'g1', name: 'Medieval Madness' };
    const item = addToWaitList(list, game, { kind: 'b2s' }, { id: 'f1', urls: [] }, 'https://vpuniverse.com/files/file/1-x/');
    assert.equal(item.label, 'version sans auteur');
    markReceived(item, 'D:\\acq\\pack.zip', 'manual', new Date('2026-11-16T10:00:00Z'), undefined, { content: 'media', summary: contentSummary('pack.zip', ['a.png', 'b.mp4', 'c.mp4', 'd.mp3']) });
    saveWaitList(dir, list);
    const saved = fs.readFileSync(waitListFile(dir), 'utf8');
    assert.deepEqual(translatedStrings(saved), []);
    setLanguage('en');
    const back = loadWaitList(dir).items[0]!;
    assert.equal(back.label, 'version with no author');
    assert.equal(contentSummaryText(back.received!.summary), '1 image, 2 videos, 1 sound, no .vpx');

    // Ancien fichier : libellé et résumé déjà traduits (en français).
    const old = JSON.parse(saved) as { items: Record<string, unknown>[]; strays?: unknown[] };
    old.items[0]!.label = 'version sans auteur';
    (old.items[0]!.received as Record<string, unknown>).summary = '1 image, 3 vidéos, aucun .vpx';
    old.strays = [{ file: 'D:\\acq\\TheMatrix.zip', via: 'window', at: '2026-10-27T15:33:17Z', content: 'pup', summary: '18 fichiers .pup' }];
    fs.writeFileSync(waitListFile(dir), JSON.stringify(old));
    const converted = loadWaitList(dir);
    assert.equal(converted.items[0]!.label, 'version with no author');
    assert.deepEqual(converted.items[0]!.received!.summary, { files: 4, vpx: 0, b2s: 0, pup: 0, images: 1, videos: 3, sounds: 0 } satisfies ContentCounts);
    assert.equal(contentSummaryText(converted.items[0]!.received!.summary), '1 image, 3 videos, no .vpx');
    assert.equal(contentSummaryText(converted.strays![0]!.summary), '18 .pup files, no .vpx');
    saveWaitList(dir, converted);
    assert.deepEqual(translatedStrings(fs.readFileSync(waitListFile(dir), 'utf8')), []);
    // Résumé illisible : oublié, jamais une erreur.
    assert.equal(readContentCounts('n’importe quoi'), undefined);
  } finally {
    setLanguage('fr');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('journal des téléchargements : utilisation notée en français, relue en anglais ; ancien journal converti', () => {
  const dir = tmp('journal-langue');
  try {
    setLanguage('fr');
    const rom = path.join(dir, 'acquisition', 'mm_109c.zip');
    const vpx = path.join(dir, 'acquisition', 'mm.vpx');
    fs.mkdirSync(path.dirname(rom), { recursive: true });
    fs.writeFileSync(rom, 'rom');
    fs.writeFileSync(vpx, 'vpx');
    noteDownloadUse(dir, rom, tLater('Ajout d’une ROM'));
    assert.deepEqual(translatedStrings(fs.readFileSync(downloadJournalFile(dir), 'utf8')), []);
    setLanguage('en');
    const use = (name: string) => downloadInventory({ downloadsDir: dir }).find((e) => e.name === name)!.use;
    assert.deepEqual(use('mm_109c.zip'), { state: 'used', text: 'Adding a ROM' });
    // Ancien journal : le texte noté en français.
    fs.writeFileSync(downloadJournalFile(dir), JSON.stringify({ notes: [{ file: vpx, at: '2026-10-01T00:00:00Z', text: 'Ajout d’une ROM' }] }));
    assert.deepEqual(use('mm.vpx'), { state: 'used', text: 'Adding a ROM' });
  } finally {
    setLanguage('fr');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('file des téléchargements : titre et noms gardés sans traduction ; ancien telechargements.json converti', () => {
  const dir = tmp('file-langue');
  try {
    setLanguage('fr');
    const job = (title: StoredText, name: StoredText): DownloadJob => ({
      id: 'j1',
      kind: 'friend-media',
      title,
      source: { kind: 'friend', label: 'Chloé', key: 'k' },
      files: [{ ref: 'm1', name, part: path.join(dir, 'j1.part') }],
      state: 'failed',
      reason: 'check',
      detail: tLater('morceau inconnu'),
      back: { screen: 'downloads' },
      created: '2026-11-16T10:00:00Z',
      updated: '2026-11-16T10:00:00Z',
      tries: 0,
      resumable: true,
    });
    saveDownloadQueue(dir, { version: 1, jobs: [job(tLater('Parties de {table}', { table: 'Terminator 2' }), tLater('{label}, page {page}', { label: { ref: 'mediaType', id: 'Wheel' }, page: 2 }))] });
    assert.deepEqual(translatedStrings(fs.readFileSync(path.join(dir, 'telechargements.json'), 'utf8')), []);
    setLanguage('en');
    const [back] = loadDownloadQueue(dir).jobs;
    assert.equal(say(back!.title), 'Parts of Terminator 2');
    assert.equal(say(back!.files[0]!.name), en('{label}, page {page}').replace('{label}', t('Logo')).replace('{page}', '2'));
    assert.equal(say(back!.detail), en('morceau inconnu'));
    // Ancien fichier : titre déjà traduit en français, nom de fichier tel quel.
    saveDownloadQueue(dir, { version: 1, jobs: [job('Parties de Terminator 2', 'T2.vpx')] });
    const [old] = loadDownloadQueue(dir).jobs;
    assert.equal(say(old!.title), 'Parts of Terminator 2');
    assert.equal(say(old!.files[0]!.name), 'T2.vpx');
  } finally {
    setLanguage('fr');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('activité récente : record et badge d’un ami gardés sans traduction ; ancienne ligne convertie', () => {
  const dir = tmp('activite-langue');
  const file = path.join(dir, 'activite.json');
  try {
    setLanguage('fr');
    const log = emptyActivity();
    const at = Date.parse('2026-11-16T10:00:00Z');
    addActivity(log, { kind: 'friend-record', at, facts: { key: 'e1', who: 'Chloé', subject: 'Terminator 2', extra: tLater('place {rank}', { rank: 2 }) } });
    addActivity(log, { kind: 'friend-badge', at: at + 1, facts: { key: 'e2', who: 'Chloé', extra: { ref: 'badge', id: 'first-game' } } });
    addActivity(log, { kind: 'note', at: at + 2, facts: { key: 'n1', text: tLater('Ajout d’une ROM') } });
    saveActivity(file, log);
    assert.deepEqual(translatedStrings(fs.readFileSync(file, 'utf8')), []);
    setLanguage('en');
    const entries = loadActivity(file).log.entries;
    const of = (key: string) => activityText(entries.find((e) => e.key === key)!);
    assert.match(of('e1').detail ?? '', /rank 2/);
    assert.equal(of('e2').detail, badgeLabel('first-game'));
    assert.equal(of('n1').title, 'Adding a ROM');
    // Ancienne ligne : la place déjà traduite en français.
    const raw = JSON.parse(fs.readFileSync(file, 'utf8')) as { entries: Record<string, unknown>[] };
    raw.entries.find((e) => e.key === 'e1')!.extra = 'place 3';
    fs.writeFileSync(file, JSON.stringify(raw));
    assert.match(activityText(loadActivity(file).log.entries.find((e) => e.key === 'e1')!).detail ?? '', /rank 3/);
  } finally {
    setLanguage('fr');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('médias web refusés : la raison se dit dans la langue du moment', () => {
  const dir = tmp('web-langue');
  try {
    const page = path.join(dir, 'logo.png');
    fs.writeFileSync(page, '<!doctype html><html><body>connexion</body></html>');
    setLanguage('fr');
    const verdict = judgeWebFile(page, 'Wheel');
    assert.equal(verdict.status, 'refused');
    const stored = JSON.parse(JSON.stringify(verdict.status === 'refused' ? verdict.reason : '')) as StoredText;
    assert.deepEqual(translatedStrings(JSON.stringify(stored)), []);
    setLanguage('en');
    assert.equal(say(stored), en('page web enregistrée sous un nom de fichier : le site a renvoyé une page au lieu du fichier'));
  } finally {
    setLanguage('fr');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('orientation des écrans : ce que la sortie n’a pas pu rendre est redit dans la langue du démarrage suivant', () => {
  const dir = tmp('orientation-langue');
  const file = path.join(dir, 'orientation.json');
  try {
    // Ancien fichier : un problème déjà traduit en français, l'écran nommé en français.
    fs.writeFileSync(
      file,
      JSON.stringify({
        version: 1,
        screens: [{ fingerprint: 'fp', gdiName: '\\\\.\\DISPLAY2', label: 'écran du playfield (\\\\.\\DISPLAY2)', origin: 0, applied: 90, since: '2026-11-16T10:00:00Z' }],
        problems: ['Écran introuvable : son orientation n’a pas été rendue à Windows.'],
      }),
    );
    setLanguage('en');
    const session = new SessionOrientation({ file, screens: () => [], rotate: () => undefined });
    const report = session.start([]);
    const said = report.problems.map(say).join(' ');
    assert.ok(said.startsWith(en('À la dernière fermeture de Cyber Pinball : {problem}').split('{problem}')[0]!), said);
    assert.ok(said.includes(en('Écran introuvable : son orientation n’a pas été rendue à Windows.')), said);
    assert.doesNotMatch(said, /Écran|écran/);
    // L'écran débranché reste noté : à la sortie, son nom se dit en anglais, et le fichier ne tient aucun texte traduit.
    const end = session.end();
    assert.match(end.problems.map(say).join(' '), new RegExp(en('écran du playfield ({name})').split(' (')[0]!));
    if (fs.existsSync(file)) assert.deepEqual(translatedStrings(fs.readFileSync(file, 'utf8')), []);
  } finally {
    setLanguage('fr');
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('détecteur : un texte traduit dans un fichier de données est relevé', () => {
  setLanguage('fr');
  assert.deepEqual(translatedStrings(JSON.stringify({ position: t('Étape {n} sur {total}', { n: 3, total: 4 }), title: 'Terminator 2', n: tn(2, '{n} image', '{n} images') })), ['Étape 3 sur 4', '2 images']);
});
