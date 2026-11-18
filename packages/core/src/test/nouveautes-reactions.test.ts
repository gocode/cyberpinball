// Réactions aux Nouveautés du front-end : le service (packages/service-telephone/worker.mjs, table
// « reactions_nouveautes »), la lecture côté borne (news.ts) et l'écran (app/src/news-menu.ts).
//
// Invariants fixés ici :
// - une réaction par borne et par nouveauté, l'une des sept des messages ; la changer remplace
//   l'ancienne, null la retire ; signée par la clé de la borne, datée, jamais rejouée ;
// - les totaux ne rendent jamais une clé ; « mine » seulement à la borne qui la demande ;
// - un compte supprimé emporte ses réactions ;
// - côté borne, une réponse inattendue n'entre pas dans les écrans, et ma réaction s'affiche tout
//   de suite (un seul compte qui bouge) ;
// - à l'écran, la nouveauté agrandie a ses sept tuiles avant « Essayer », la mienne repérée, Start
//   la pose ou la retire, et tout est grisé avec sa raison quand réagir est impossible.
// Rien ne sort sur le vrai réseau : le Worker tourne en mémoire, sur une fausse D1 en node:sqlite.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { DatabaseSync, type SQLInputValue } from 'node:sqlite';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { setLanguage } from '../i18n';
import { NEWS, parseNewsReaction, parseNewsReactions, withMyNewsReaction, type NewsReactions } from '../news';
import { REACTIONS, type Reaction } from '../reactions';
import { REPO_ROOT } from './i18n-scan';

const SERVICE = path.join(REPO_ROOT, 'packages', 'service-telephone');
const SCHEMA = fs.readFileSync(path.join(SERVICE, 'schema.sql'), 'utf8');
const NOW = Date.UTC(2026, 10, 18, 12);

interface WorkerModule {
  default: { fetch(request: Request, env: unknown, ctx: unknown, now?: number): Promise<Response> };
  RETOURS_PREFIX: string;
  NEWS_REACTIONS: string[];
}
const loadWorker = () => import(pathToFileURL(path.join(SERVICE, 'worker.mjs')).href) as Promise<WorkerModule>;

type Row = Record<string, unknown>;

/** Fausse D1 sur node:sqlite (la même que retours-service.test.ts). */
function memoryD1() {
  const db = new DatabaseSync(':memory:');
  db.exec(SCHEMA);
  const input = (v: unknown): SQLInputValue => {
    if (v === undefined) throw new TypeError('D1_TYPE_ERROR: undefined');
    if (typeof v === 'boolean') return v ? 1 : 0;
    return v as SQLInputValue;
  };
  class Statement {
    constructor(
      readonly sql: string,
      readonly params: SQLInputValue[] = [],
    ) {}
    bind(...params: unknown[]) {
      return new Statement(this.sql, params.map(input));
    }
    rows(): Row[] {
      return db.prepare(this.sql).all(...this.params) as Row[];
    }
    async all() {
      return { results: this.rows(), success: true, meta: {} };
    }
    async first(column?: string) {
      const row = this.rows()[0];
      if (!row) return null;
      return column === undefined ? row : (row[column] ?? null);
    }
    async run() {
      db.prepare(this.sql).run(...this.params);
      return { results: [], success: true, meta: {} };
    }
  }
  return {
    db,
    prepare: (sql: string) => new Statement(sql),
    batch: async (statements: Statement[]) => {
      db.exec('BEGIN');
      try {
        const out = statements.map((s) => ({ results: s.rows(), success: true, meta: {} }));
        db.exec('COMMIT');
        return out;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
  };
}

function keys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pk = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url').toString('hex');
  return { pk, sign: (text: string) => crypto.sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64') };
}
type Keys = ReturnType<typeof keys>;

async function service() {
  const w = await loadWorker();
  const d1 = memoryD1();
  const env = { ADRESSES: {}, ASSETS: { fetch: async () => new Response('page') }, RETOURS: d1 };
  let seq = 0;
  const call = (method: string, url: string, body?: string) => w.default.fetch(new Request(new URL(url, 'https://t.cyberpinball.com'), { method, ...(body === undefined ? {} : { body }) }), env, {}, NOW);
  const signed = (k: Keys, fields: Record<string, unknown>, t = NOW + ++seq) => {
    const b = JSON.stringify({ v: 1, pk: k.pk, t, ...fields });
    return JSON.stringify({ b, s: k.sign(w.RETOURS_PREFIX + b) });
  };
  const react = async (k: Keys, item: string, kind: string | null, t?: number) => {
    const r = await call('POST', '/api/nouveautes', signed(k, { op: 'news-react', item, kind }, t));
    return { status: r.status, json: (await r.json()) as { item?: string; counts?: Record<string, number>; mine?: string; erreur?: string } };
  };
  const list = async (pk?: string) => {
    const r = await call('GET', `/api/nouveautes${pk ? `?pk=${pk}` : ''}`);
    assert.equal(r.status, 200);
    const text = await r.text();
    return { text, reactions: (JSON.parse(text) as { reactions: Record<string, { counts: Record<string, number>; mine?: string }> }).reactions };
  };
  const forget = (k: Keys) => call('POST', '/api/oubli', signed(k, { op: 'forget' }));
  return { w, d1, call, react, list, forget, signed };
}

test('réactions aux nouveautés, service : les sept réactions, les mêmes que celles des messages', async () => {
  const { w } = await service();
  assert.deepEqual(w.NEWS_REACTIONS, [...REACTIONS]);
});

test('réactions aux nouveautés, service : une par borne et par nouveauté, changée, retirée, sans jamais rendre une clé', async () => {
  const s = await service();
  const [alice, bruno, chloe] = [keys(), keys(), keys()];
  assert.equal((await s.react(alice, 'niveaux', 'love')).status, 200);
  assert.equal((await s.react(bruno, 'niveaux', 'love')).status, 200);
  const r = await s.react(chloe, 'niveaux', 'wow');
  assert.deepEqual(r.json, { item: 'niveaux', counts: { love: 2, wow: 1 }, mine: 'wow' });
  // Changer remplace ; null retire.
  assert.deepEqual((await s.react(alice, 'niveaux', 'haha')).json.counts, { love: 1, wow: 1, haha: 1 });
  assert.deepEqual((await s.react(bruno, 'niveaux', null)).json, { item: 'niveaux', counts: { wow: 1, haha: 1 } });
  const seen = await s.list(alice.pk);
  assert.deepEqual(seen.reactions.niveaux, { counts: { haha: 1, wow: 1 }, mine: 'haha' });
  const anonymous = await s.list();
  assert.equal(anonymous.reactions.niveaux!.mine, undefined, 'sans clé, pas de « mine »');
  for (const k of [alice, bruno, chloe]) assert.ok(!seen.text.includes(k.pk) && !anonymous.text.includes(k.pk), 'aucune clé dans une réponse');
});

test('réactions aux nouveautés, service : forme, signature, rejeu', async () => {
  const s = await service();
  const k = keys();
  assert.equal((await s.react(k, 'Niveaux!', 'like')).status, 400, 'identifiant de nouveauté hors forme');
  assert.equal((await s.react(k, 'niveaux', 'bravo')).status, 400, 'réaction inconnue');
  const forged = JSON.parse(s.signed(k, { op: 'news-react', item: 'niveaux', kind: 'like' })) as { b: string; s: string };
  assert.equal((await s.call('POST', '/api/nouveautes', JSON.stringify({ b: forged.b.replace('like', 'love'), s: forged.s }))).status, 403, 'signature qui ne colle pas');
  assert.equal((await s.react(k, 'niveaux', 'like', NOW + 1000)).status, 200);
  assert.equal((await s.react(k, 'niveaux', 'love', NOW + 1000)).status, 409, 'même date : rejeu');
  assert.equal((await s.react(k, 'niveaux', 'love', NOW + 500)).status, 409, 'date plus ancienne : rejeu');
  assert.equal((await s.react(k, 'niveaux', 'like', NOW + 60 * 60_000)).status, 422, 'date hors de l’écart permis');
  assert.equal((await s.call('PUT', '/api/nouveautes', '{}')).status, 405);
});

test('réactions aux nouveautés, service : un compte supprimé emporte ses réactions', async () => {
  const s = await service();
  const [alice, bruno] = [keys(), keys()];
  await s.react(alice, 'niveaux', 'like');
  await s.react(alice, 'groupes', 'love');
  await s.react(bruno, 'niveaux', 'like');
  assert.equal((await s.forget(alice)).status, 200);
  const after = await s.list();
  assert.deepEqual(after.reactions.niveaux, { counts: { like: 1 } });
  assert.equal(after.reactions.groupes, undefined);
});

test('réactions aux nouveautés, borne : une réponse inattendue n’entre pas, ma réaction tout de suite', () => {
  const parsed = parseNewsReactions({ reactions: { niveaux: { counts: { like: 3, bravo: 9, love: -2, wow: 1.5 }, mine: 'like' }, 'Pas Bon': { counts: { like: 1 } }, groupes: 'x' } });
  assert.deepEqual(parsed, { niveaux: { counts: { like: 3 }, mine: 'like' } });
  assert.deepEqual(parseNewsReaction({ counts: { sad: 2 }, mine: 'nope' }), { counts: { sad: 2 } });
  assert.deepEqual(parseNewsReactions(null), {});
  const before: NewsReactions = { counts: { like: 3, love: 1 }, mine: 'love' };
  assert.deepEqual(withMyNewsReaction(before, 'like'), { counts: { like: 4 }, mine: 'like' });
  assert.deepEqual(withMyNewsReaction(before, null), { counts: { like: 3 } });
  assert.deepEqual(withMyNewsReaction(undefined, 'wow'), { counts: { wow: 1 }, mine: 'wow' });
});

/* eslint-disable @typescript-eslint/no-require-imports */
interface Built {
  sections: { kind?: string; options?: boolean; rows: { text: string; emoji?: string; badges?: string[]; current?: boolean; tone?: string; action?: number; pick?: boolean }[] }[];
  actions: { label: string; tone?: string; detail?: string; run: () => void }[];
  newsPage?: { note?: string };
}
const { createNewsMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'news-menu.js')) as {
  createNewsMenu(host: object): { open(back?: () => void): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function screen(world: { net?: 'ok' | 'offline'; closed?: string } = {}) {
  setLanguage('fr');
  const opened: { build: () => Built; at?: number }[] = [];
  const store: Record<string, NewsReactions> = { [NEWS[0]!.id]: { counts: { like: 4, love: 2 } } };
  const sent: { item: string; kind: Reaction | null }[] = [];
  let changed = 0;
  const menu = createNewsMenu({
    dataDir: fs.mkdtempSync(path.join(os.tmpdir(), 'nouveautes-reactions-')),
    library: { openCustom: (build: () => Built, at?: number) => opened.push({ build, at }), openSystem: () => undefined },
    reach: () => ({ run: () => undefined }),
    reactions: {
      of: (item: string) => store[item] ?? { counts: {} },
      net: () => world.net ?? 'ok',
      refresh: () => undefined,
      react: async (item: string, kind: Reaction | null) => {
        sent.push({ item, kind });
        store[item] = withMyNewsReaction(store[item], kind);
        return { ok: true };
      },
      closed: () => world.closed,
    },
    changed: () => changed++,
    now: () => NOW,
  });
  menu.open();
  // La première nouveauté, agrandie.
  opened.at(-1)!.build().actions[0]!.run();
  return { page: () => opened.at(-1)!.build(), at: () => opened.at(-1)!.at, sent, changed: () => changed };
}

test('réactions aux nouveautés, écran : sept tuiles avant « Essayer », la mienne repérée, Start la pose ou la retire', () => {
  const s = screen();
  const view = s.page();
  const tiles = view.sections.find((x) => x.kind === 'news-reactions')!;
  assert.ok(tiles.options, 'des options, pas une liste de contenu');
  assert.deepEqual(tiles.rows.map((r) => r.emoji), ['👍', '❤️', '🥰', '😆', '😮', '😢', '😡']);
  assert.deepEqual(tiles.rows.map((r) => r.badges), [['4'], ['2'], [], [], [], [], []]);
  assert.deepEqual(tiles.rows.map((r) => r.action), [0, 1, 2, 3, 4, 5, 6], 'les tuiles d’abord, dans l’ordre des flippers');
  assert.ok(tiles.rows.every((r) => r.pick));
  assert.match(view.actions[7]!.label, /^Essayer : /);
  assert.equal(s.at(), 7, 'ouverte sur « Essayer »');
  assert.equal(view.newsPage!.note, '6 joueurs ont réagi');
  // Start sur 😮 : posée, comptée, repérée ; puis Start sur elle : retirée.
  view.actions[4]!.run();
  assert.deepEqual(s.sent.at(-1), { item: NEWS[0]!.id, kind: 'wow' });
  assert.ok(s.changed() > 0, 'l’écran se redessine tout de suite');
  const after = s.page();
  const wow = after.sections[0]!.rows[4]!;
  assert.ok(wow.current);
  assert.deepEqual(wow.badges, ['1']);
  assert.match(after.newsPage!.note!, /^Votre réaction : 😮 Waouh/);
  after.actions[4]!.run();
  assert.deepEqual(s.sent.at(-1), { item: NEWS[0]!.id, kind: null });
  assert.ok(!s.page().sections[0]!.rows[4]!.current);
});

test('réactions aux nouveautés, écran : grisées avec leur raison quand réagir est impossible', () => {
  for (const world of [{ net: 'offline' as const }, { closed: 'Réagir est fermé en mode invité' }]) {
    const s = screen(world);
    const view = s.page();
    const tiles = view.sections[0]!.rows;
    assert.ok(tiles.every((r) => r.tone === 'quiet'));
    assert.ok(view.actions.slice(0, 7).every((a) => a.tone === 'quiet' && a.detail));
    assert.equal(view.newsPage!.note, world.closed ?? 'Réactions hors ligne : elles reviennent dès que le service répond');
    view.actions[0]!.run();
    assert.equal(s.sent.length, 0, 'rien ne part');
  }
});
