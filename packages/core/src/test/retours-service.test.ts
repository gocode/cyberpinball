// Retours des joueurs, côté service (packages/service-telephone/worker.mjs, base D1 « RETOURS ») :
// le tableau public des propositions et leurs votes, les rapports chiffrés, l'administration.
//
// Invariants fixés ici :
// - une écriture publique n'est acceptée que signée par la clé de la borne (protocole v1), datée à dix
//   minutes près, jamais rejouée (même une voix retirée puis rejouée) ;
// - une voix par borne et par proposition ; l'auteur vote pour la sienne ; une fusion additionne les
//   voix sans doublon et les voix données ensuite à la source vont à la cible ;
// - aucune réponse ne rend la clé publique d'un auteur ou d'un votant ;
// - un rapport n'est qu'une boîte « CPR1 » bornée, gardée sans auteur, les plus anciennes effacées ;
// - l'administration exige la signature de la clé d'administration (ici une clé de test, passée par
//   env.ADMIN_PUBLIC_KEY comme le ferait le déploiement) ;
// - sans base liée, les routes des retours répondent 503 et le relais du téléphone reste intact.
// Rien ne sort sur le vrai réseau : le Worker tourne en mémoire, sur une fausse D1 en node:sqlite.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './i18n-scan';
import { memoryD1 } from './fausse-d1';

const SERVICE = path.join(REPO_ROOT, 'packages', 'service-telephone');
const NOW = Date.UTC(2026, 10, 16, 12);
const DAY = 86_400_000;

interface WorkerModule {
  default: { fetch(request: Request, env: unknown, ctx: unknown, now?: number): Promise<Response> };
  RETOURS_PREFIX: string;
  ADMIN_PREFIX: string;
  ADMIN_PUBLIC_KEY: string;
  KINDS: string[];
  STATUSES: string[];
  TITLE_MAX: number;
  TEXT_MAX: number;
  REPORT_MAX: number;
  REPORTS_KEPT: number;
  PROPOSALS_PER_DAY: number;
  CLOCK_SKEW_MS: number;
  SIGNED_MAX: number;
}
let loaded: Promise<WorkerModule> | undefined;
const loadWorker = () => (loaded ??= import(pathToFileURL(path.join(SERVICE, 'worker.mjs')).href) as Promise<WorkerModule>);

interface Keys {
  pk: string;
  sign(text: string): string;
}
function keys(): Keys {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pk = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url').toString('hex');
  return { pk, sign: (text) => crypto.sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64') };
}

interface Proposition {
  id: string;
  kind: string;
  title: string;
  text: string;
  lang: string;
  votes: number;
  status: string;
  at: number;
  updated: number;
  reply?: string;
  merged: number;
  mine?: boolean;
  voted?: boolean;
  hidden?: boolean;
  merged_into?: string | null;
}

/** Le service en mémoire : sa base, son horloge, et des appels de borne et d'administration. */
async function service(options: { retours?: boolean } = {}) {
  const w = await loadWorker();
  const d1 = memoryD1();
  const admin = keys();
  const env: Record<string, unknown> = {
    ADRESSES: { get: async () => null, put: async () => undefined, delete: async () => undefined },
    ASSETS: { fetch: async () => new Response('page', { status: 200 }) },
    ADMIN_PUBLIC_KEY: admin.pk,
    ...(options.retours === false ? {} : { RETOURS: d1 }),
  };
  const state = { clock: NOW, seq: 0 };
  const call = (method: string, url: string, body?: string | Uint8Array, headers: Record<string, string> = {}): Promise<Response> =>
    w.default.fetch(new Request(new URL(url, 'https://t.cyberpinball.com'), { method, headers, ...(body === undefined ? {} : { body }) }), env, {}, state.clock);
  /** Corps signé d'une borne. `t` : la date signée (par défaut l'horloge, plus un pas pour rester unique). */
  const signed = (k: Keys, fields: Record<string, unknown>, t = state.clock + ++state.seq): string => {
    const b = JSON.stringify({ v: 1, pk: k.pk, t, ...fields });
    return JSON.stringify({ b, s: k.sign(w.RETOURS_PREFIX + b) });
  };
  const propose = async (k: Keys, fields: Record<string, unknown> = {}, t?: number) => {
    const r = await call('POST', '/api/propositions', signed(k, { op: 'propose', kind: 'bug', title: 'Le lanceur se bloque', text: '', lang: 'fr', ...fields }, t));
    return { status: r.status, json: (await r.json()) as { id?: string; erreur?: string } };
  };
  const vote = async (k: Keys, id: string, on: boolean, t?: number) => {
    const r = await call('POST', '/api/votes', signed(k, { op: 'vote', id, on }, t));
    return { status: r.status, json: (await r.json()) as { id?: string; votes?: number; voted?: boolean; erreur?: string } };
  };
  const list = async (pk?: string) => {
    const r = await call('GET', `/api/propositions${pk ? `?pk=${pk}` : ''}`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('Cache-Control'), 'no-store');
    const text = await r.text();
    return { text, propositions: (JSON.parse(text) as { propositions: Proposition[] }).propositions };
  };
  /** Requête d'administration signée (par défaut avec la clé de test, datée de l'horloge). */
  const adminCall = (method: string, target: string, body?: string, opts: { key?: Keys; date?: number; signedPath?: string } = {}): Promise<Response> => {
    const date = String(opts.date ?? state.clock + ++state.seq);
    const hash = crypto.createHash('sha256').update(body ?? '').digest('hex');
    const text = `${w.ADMIN_PREFIX}${method}\n${opts.signedPath ?? target}\n${date}\n${hash}`;
    return call(method, target, body, { 'X-Retours-Date': date, 'X-Retours-Signature': (opts.key ?? admin).sign(text) });
  };
  const adminList = async () => {
    const r = await adminCall('GET', '/api/admin/propositions');
    assert.equal(r.status, 200);
    const text = await r.text();
    return { text, propositions: (JSON.parse(text) as { propositions: Proposition[] }).propositions };
  };
  const edit = async (id: string, change: Record<string, unknown>) => {
    const r = await adminCall('POST', `/api/admin/propositions/${id}`, JSON.stringify(change));
    return { status: r.status, json: (await r.json()) as Proposition & { erreur?: string } };
  };
  return { w, d1, env, admin, state, call, signed, propose, vote, list, adminCall, adminList, edit };
}

const report = (size: number, head = 'CPR1') => {
  const bytes = crypto.randomBytes(size);
  bytes.write(head, 0, 'latin1');
  return new Uint8Array(bytes);
};

test('retours : une proposition signée est publiée tout de suite, nettoyée, et son auteur vote pour elle', async () => {
  const s = await service();
  const author = keys();
  const other = keys();
  const made = await s.propose(author, { kind: 'feature', title: '  Un   mode\tnuit \n pour le DMD  ', text: '  Plus sombre.\r\nMoins de reflets.  ', lang: 'fr' });
  assert.equal(made.status, 201);
  assert.match(made.json.id ?? '', /^[A-Za-z0-9_-]{10}$/);
  const mine = (await s.list(author.pk)).propositions;
  assert.equal(mine.length, 1);
  assert.deepEqual(mine[0], { id: made.json.id, kind: 'feature', title: 'Un mode nuit pour le DMD', text: 'Plus sombre.\nMoins de reflets.', lang: 'fr', votes: 1, status: 'new', at: NOW, updated: NOW, merged: 0, mine: true, voted: true });
  const theirs = (await s.list(other.pk)).propositions;
  assert.equal(theirs[0]?.mine, false);
  assert.equal(theirs[0]?.voted, false);
  // Sans clé (ou avec une clé mal formée) : ni « mine » ni « voted ».
  for (const pk of [undefined, 'zz']) {
    const anon = (await s.list(pk)).propositions[0];
    assert.ok(anon && !('mine' in anon) && !('voted' in anon));
  }
  // Le texte est facultatif.
  assert.equal((await s.propose(author, { text: undefined, title: 'Sans texte' })).status, 201);
});

test('retours : une proposition mal formée est refusée (400)', async () => {
  const s = await service();
  const k = keys();
  const w = s.w;
  for (const fields of [
    { kind: 'autre' },
    { kind: undefined },
    { title: 'abc' },
    { title: '   a   b   ' },
    { title: 'x'.repeat(w.TITLE_MAX + 1) },
    { title: 'Titre avec \u0007 cloche' },
    { title: 42 },
    { text: 'nul \u0000 ici' },
    { text: 'tab\tici' },
    { text: 'x'.repeat(w.TEXT_MAX + 1) },
    { lang: 'de' },
    { lang: undefined },
  ]) {
    const r = await s.propose(k, fields);
    assert.equal(r.status, 400, JSON.stringify(fields));
    assert.equal(r.json.erreur, 'forme');
  }
  // Un vote présenté comme une proposition, une clé mal formée, une version inconnue.
  const bad = async (fields: Record<string, unknown>) => (await s.call('POST', '/api/propositions', s.signed(k, { op: 'propose', kind: 'bug', title: 'Valable', lang: 'fr', ...fields }))).status;
  assert.equal(await bad({ op: 'vote' }), 400);
  assert.equal(await bad({ v: 2 }), 400);
  assert.equal(await bad({ t: 'maintenant' }), 400);
  assert.equal((await s.call('POST', '/api/propositions', 'pas du json')).status, 400);
  assert.equal((await s.call('POST', '/api/propositions', JSON.stringify({ b: '{}', s: 'x' }))).status, 400);
  assert.equal((await s.list()).propositions.length, 0);
});

test('retours : signature, date, rejeu, taille et quota sont contrôlés', async () => {
  const s = await service();
  const k = keys();
  const intruder = keys();
  // Signée par une autre clé que `pk` : 403.
  const b = JSON.stringify({ v: 1, op: 'propose', pk: k.pk, t: NOW, kind: 'bug', title: 'Usurpée', lang: 'fr' });
  let r = await s.call('POST', '/api/propositions', JSON.stringify({ b, s: intruder.sign(s.w.RETOURS_PREFIX + b) }));
  assert.equal(r.status, 403);
  assert.deepEqual(await r.json(), { erreur: 'signature' });
  // Texte modifié après signature : 403.
  const genuine = JSON.parse(s.signed(k, { op: 'propose', kind: 'bug', title: 'Vraie', lang: 'fr' })) as { b: string; s: string };
  r = await s.call('POST', '/api/propositions', JSON.stringify({ b: genuine.b.replace('Vraie', 'Faux!'), s: genuine.s }));
  assert.equal(r.status, 403);
  // Signée sans le préfixe du protocole : 403.
  r = await s.call('POST', '/api/propositions', JSON.stringify({ b, s: k.sign(b) }));
  assert.equal(r.status, 403);
  // Date hors des dix minutes : 422.
  const late = await s.propose(k, {}, NOW - s.w.CLOCK_SKEW_MS - 1);
  assert.deepEqual(late, { status: 422, json: { erreur: 'date' } });
  // Rejeu exact : 409.
  const once = s.signed(k, { op: 'propose', kind: 'bug', title: 'Une seule fois', lang: 'fr' });
  assert.equal((await s.call('POST', '/api/propositions', once)).status, 201);
  r = await s.call('POST', '/api/propositions', once);
  assert.equal(r.status, 409);
  assert.deepEqual(await r.json(), { erreur: 'rejeu' });
  // Texte signé trop long : 413.
  const huge = s.signed(k, { op: 'propose', kind: 'bug', title: 'Trop long', lang: 'fr', pad: 'x'.repeat(s.w.SIGNED_MAX) });
  assert.equal((await s.call('POST', '/api/propositions', huge)).status, 413);
  // Quota : PROPOSALS_PER_DAY sur 24 heures glissantes (la première ci-dessus compte).
  for (let i = 1; i < s.w.PROPOSALS_PER_DAY; i++) assert.equal((await s.propose(k, { title: `Idée numéro ${i}` })).status, 201);
  assert.deepEqual(await s.propose(k, { title: 'Une de trop' }), { status: 429, json: { erreur: 'quota' } });
  assert.equal((await s.propose(keys(), { title: 'Une autre borne' })).status, 201, 'le quota est par borne');
  s.state.clock += DAY + 1;
  assert.equal((await s.propose(k, { title: 'Le lendemain' })).status, 201);
  // La limite d'écritures par adresse IP, si elle est liée.
  s.env.LIMITE = { limit: async () => ({ success: false }) };
  assert.deepEqual(await s.propose(keys()), { status: 429, json: { erreur: 'trop' } });
});

test('retours : la liste est triée par voix puis date, sans aucune clé, sans les masquées ni les fusionnées', async () => {
  const s = await service();
  const [a, b, c, d] = [keys(), keys(), keys(), keys()];
  const first = (await s.propose(a, { title: 'Première' })).json.id as string;
  s.state.clock += 1000;
  const second = (await s.propose(b, { title: 'Deuxième', kind: 'improvement', lang: 'en' })).json.id as string;
  s.state.clock += 1000;
  const third = (await s.propose(c, { title: 'Troisième' })).json.id as string;
  s.state.clock += 1000;
  const hidden = (await s.propose(d, { title: 'Masquée' })).json.id as string;
  assert.equal((await s.vote(d, first, true)).status, 200);
  assert.equal((await s.vote(c, first, true)).status, 200);
  assert.equal((await s.edit(hidden, { hidden: true })).status, 200);
  const { text, propositions } = await s.list(a.pk);
  // Trois voix d'abord ; à égalité (une voix), la plus récente d'abord.
  assert.deepEqual(
    propositions.map((p) => [p.id, p.votes]),
    [
      [first, 3],
      [third, 1],
      [second, 1],
    ],
  );
  for (const k of [a, b, c, d, s.admin]) assert.ok(!text.includes(k.pk), 'clé publique dans la liste');
  assert.ok(!/author|voter|"pk"/.test(text));
  const all = await s.adminList();
  for (const k of [a, b, c, d, s.admin]) assert.ok(!all.text.includes(k.pk), "clé publique dans la liste d'administration");
  assert.equal(all.propositions.find((p) => p.id === hidden)?.hidden, true);
});

test('retours : une voix par borne et par proposition, retirable, jamais rejouée', async () => {
  const s = await service();
  const [author, fan] = [keys(), keys()];
  const id = (await s.propose(author)).json.id as string;
  assert.deepEqual((await s.vote(fan, id, true)).json, { id, votes: 2, voted: true });
  // Revoter : toujours une seule voix.
  assert.deepEqual((await s.vote(fan, id, true)).json, { id, votes: 2, voted: true });
  assert.deepEqual((await s.vote(author, id, true)).json, { id, votes: 2, voted: true });
  // Retirer.
  const off = s.signed(fan, { op: 'vote', id, on: false });
  let r = await s.call('POST', '/api/votes', off);
  assert.deepEqual(await r.json(), { id, votes: 1, voted: false });
  assert.equal((await s.list(fan.pk)).propositions[0]?.voted, false);
  // Rejouer le retrait : 409.
  assert.equal((await s.call('POST', '/api/votes', off)).status, 409);
  // Revoter, puis rejouer une voix plus ancienne que la dernière : 409 ; un retrait puis le rejeu de la voix : 409.
  const on = s.signed(fan, { op: 'vote', id, on: true });
  assert.equal((await s.call('POST', '/api/votes', on)).status, 200);
  assert.equal((await s.vote(fan, id, false, NOW - 60_000)).status, 409);
  assert.equal((await s.vote(fan, id, false)).status, 200);
  r = await s.call('POST', '/api/votes', on);
  assert.equal(r.status, 409, 'une voix retirée ne revient pas par rejeu');
  assert.equal((await s.list()).propositions[0]?.votes, 1);
  // Proposition inconnue : 404 ; identifiant mal formé ou `on` absent : 400 ; mauvaise opération : 400.
  assert.equal((await s.vote(fan, 'AAAAAAAAAA', true)).status, 404);
  assert.equal((await s.vote(fan, 'court', true)).status, 400);
  assert.equal((await s.call('POST', '/api/votes', s.signed(fan, { op: 'vote', id }))).status, 400);
  assert.equal((await s.call('POST', '/api/votes', s.signed(fan, { op: 'propose', id, on: true }))).status, 400);
  // Masquée : 404.
  assert.equal((await s.edit(id, { hidden: true })).status, 200);
  assert.equal((await s.vote(fan, id, true)).status, 404);
  assert.equal((await s.call('GET', '/api/votes')).status, 405);
});

test('retours : un rapport chiffré « CPR1 » est gardé tel quel, borné, les plus anciens effacés', async () => {
  const s = await service();
  const box = report(300);
  let r = await s.call('POST', '/api/rapports', box, { 'Content-Type': 'application/octet-stream' });
  assert.equal(r.status, 201);
  const { id } = (await r.json()) as { id: string };
  assert.match(id, /^[A-Za-z0-9_-]{10}$/);
  // Mauvais en-tête, trop court : 400 ; trop gros : 413.
  assert.deepEqual([(await s.call('POST', '/api/rapports', report(300, 'CPR2'))).status, (await s.call('POST', '/api/rapports', report(63))).status], [400, 400]);
  assert.equal((await s.call('POST', '/api/rapports', report(64))).status, 201);
  r = await s.call('POST', '/api/rapports', report(s.w.REPORT_MAX + 1));
  assert.deepEqual([r.status, await r.json()], [413, { erreur: 'taille' }]);
  assert.equal((await s.call('POST', '/api/rapports', report(s.w.REPORT_MAX))).status, 201);
  // Rien d'autre que l'identifiant, la date, la taille et la boîte.
  assert.deepEqual(Object.keys(s.d1.db.prepare('SELECT * FROM rapports LIMIT 1').get() ?? {}).sort(), ['at', 'data', 'id', 'size']);
  // Au-delà de REPORTS_KEPT, les plus anciens partent.
  const insert = s.d1.db.prepare('INSERT INTO rapports (id, at, size, data) VALUES (?, ?, ?, ?)');
  const count = () => Number((s.d1.db.prepare('SELECT COUNT(*) AS n FROM rapports').get() as { n: number }).n);
  for (let i = count(); i < s.w.REPORTS_KEPT; i++) insert.run(`old${String(i).padStart(7, '0')}`, NOW - DAY - i, 64, new Uint8Array(64));
  const oldest = `old${String(s.w.REPORTS_KEPT - 1).padStart(7, '0')}`;
  s.state.clock += 1000;
  assert.equal((await s.call('POST', '/api/rapports', report(100))).status, 201);
  assert.equal(count(), s.w.REPORTS_KEPT);
  assert.equal(s.d1.db.prepare('SELECT 1 FROM rapports WHERE id = ?').get(oldest), undefined, 'le plus ancien est effacé');
  assert.ok(s.d1.db.prepare('SELECT 1 FROM rapports WHERE id = ?').get(id), 'les récents restent');
  assert.equal((await s.call('GET', '/api/rapports')).status, 405);
});

test("retours : l'administration exige la signature de sa clé", async () => {
  const s = await service();
  const id = (await s.propose(keys())).json.id as string;
  // Sans en-têtes, autre clé, autre chemin signé, date hors des dix minutes, corps modifié : 403.
  assert.equal((await s.call('GET', '/api/admin/propositions')).status, 403);
  assert.equal((await s.adminCall('GET', '/api/admin/propositions', undefined, { key: keys() })).status, 403);
  assert.equal((await s.adminCall('GET', '/api/admin/rapports', undefined, { signedPath: '/api/admin/propositions' })).status, 403);
  assert.equal((await s.adminCall('GET', '/api/admin/propositions', undefined, { date: NOW - s.w.CLOCK_SKEW_MS - 1 })).status, 403);
  const date = String(NOW + 5);
  const hash = crypto.createHash('sha256').update('{"status":"done"}').digest('hex');
  const sig = s.admin.sign(`${s.w.ADMIN_PREFIX}POST\n/api/admin/propositions/${id}\n${date}\n${hash}`);
  const r = await s.call('POST', `/api/admin/propositions/${id}`, '{"status":"declined"}', { 'X-Retours-Date': date, 'X-Retours-Signature': sig });
  assert.equal(r.status, 403);
  // La clé de production n'est pas celle de test : sans env.ADMIN_PUBLIC_KEY, la clé de test est refusée.
  delete s.env.ADMIN_PUBLIC_KEY;
  assert.equal((await s.adminCall('GET', '/api/admin/propositions')).status, 403);
  assert.match(s.w.ADMIN_PUBLIC_KEY, /^[0-9a-f]{64}$/);
});

test("retours : l'administrateur change le statut, répond, masque, corrige, et ne rejoue pas", async () => {
  const s = await service();
  const author = keys();
  const id = (await s.propose(author, { title: 'Bille perdue au démarrage' })).json.id as string;
  s.state.clock += 5000;
  let r = await s.edit(id, { status: 'planned', reply: '  Merci, prévu pour la 0.2.\r\nÀ suivre.  ' });
  assert.equal(r.status, 200);
  assert.equal(r.json.status, 'planned');
  assert.equal(r.json.reply, 'Merci, prévu pour la 0.2.\nÀ suivre.');
  assert.equal(r.json.updated, NOW + 5000);
  assert.equal(r.json.hidden, false);
  assert.equal(r.json.merged_into, null);
  let pub = (await s.list()).propositions[0];
  assert.equal(pub?.status, 'planned');
  assert.equal(pub?.reply, 'Merci, prévu pour la 0.2.\nÀ suivre.');
  // Réponse vide : retirée.
  r = await s.edit(id, { reply: '' });
  assert.ok(!('reply' in r.json));
  // Corrections du titre, du texte, du genre.
  r = await s.edit(id, { title: '  Bille   perdue ', text: 'Détail', kind: 'improvement' });
  assert.deepEqual([r.json.title, r.json.text, r.json.kind], ['Bille perdue', 'Détail', 'improvement']);
  // Refus : statut, genre, masquage, titre ou réponse invalides.
  for (const bad of [{ status: 'fini' }, { kind: 'autre' }, { hidden: 'oui' }, { title: 'ab' }, { reply: 'x'.repeat(1001) }, { text: 'a\u0000b' }]) assert.equal((await s.edit(id, bad)).status, 400, JSON.stringify(bad));
  assert.equal((await s.adminCall('POST', `/api/admin/propositions/${id}`, 'pas du json')).status, 400);
  assert.equal((await s.edit('AAAAAAAAAA', { status: 'done' })).status, 404);
  // Masquer : hors de la liste publique ; démasquer : de retour.
  assert.equal((await s.edit(id, { hidden: true })).json.hidden, true);
  assert.equal((await s.list()).propositions.length, 0);
  assert.equal((await s.edit(id, { hidden: false })).status, 200);
  pub = (await s.list()).propositions[0];
  assert.equal(pub?.id, id);
  // Une écriture d'administration ne se rejoue pas.
  const date = s.state.clock + 100;
  assert.equal((await s.adminCall('POST', `/api/admin/propositions/${id}`, '{"status":"done"}', { date })).status, 200);
  assert.equal((await s.adminCall('POST', `/api/admin/propositions/${id}`, '{"status":"done"}', { date })).status, 409);
});

test('retours : une fusion additionne les voix sans doublon, et les voix suivantes vont à la cible', async () => {
  const s = await service();
  const [k1, k2, k3, k4] = [keys(), keys(), keys(), keys()];
  const source = (await s.propose(k1, { title: 'Doublon' })).json.id as string;
  const target = (await s.propose(k3, { title: 'Original' })).json.id as string;
  await s.vote(k2, source, true);
  await s.vote(k2, target, true);
  // Source : k1, k2 ; cible : k2, k3 → trois voix distinctes.
  s.state.clock += 1000;
  const r = await s.edit(source, { mergeInto: target });
  assert.equal(r.status, 200);
  assert.equal(r.json.merged_into, target);
  assert.equal(r.json.votes, 0);
  const pub = (await s.list(k1.pk)).propositions;
  assert.deepEqual(
    pub.map((p) => [p.id, p.votes, p.merged, p.voted]),
    [[target, 3, 1, true]],
  );
  // Une voix sur la source fusionnée va à la cible.
  assert.deepEqual((await s.vote(k4, source, true)).json, { id: target, votes: 4, voted: true });
  assert.deepEqual((await s.vote(k2, source, true)).json, { id: target, votes: 4, voted: true });
  // Refus : dans elle-même, dans une proposition fusionnée, une source déjà fusionnée, une cible inconnue.
  const third = (await s.propose(k4, { title: 'Troisième' })).json.id as string;
  assert.equal((await s.edit(third, { mergeInto: third })).status, 400);
  assert.equal((await s.edit(third, { mergeInto: source })).status, 400);
  assert.equal((await s.edit(source, { mergeInto: third })).status, 400);
  assert.equal((await s.edit(third, { mergeInto: 'AAAAAAAAAA' })).status, 400);
  // Fusionner la cible ailleurs entraîne ses doublons : tout aboutit à la nouvelle cible.
  assert.equal((await s.edit(target, { mergeInto: third })).status, 200);
  const all = await s.adminList();
  assert.equal(all.propositions.find((p) => p.id === source)?.merged_into, third);
  assert.deepEqual(
    (await s.list()).propositions.map((p) => [p.id, p.votes, p.merged]),
    [[third, 4, 2]],
  );
});

test('retours : un compte supprimé efface ses propositions et ses votes, signé par sa clé, jamais rejoué', async () => {
  const s = await service();
  const [gone, other, fan] = [keys(), keys(), keys()];
  const mine = (await s.propose(gone, { title: 'Ma proposition' })).json.id as string;
  const theirs = (await s.propose(other, { title: 'Celle d’un autre' })).json.id as string;
  const dup = (await s.propose(other, { title: 'Doublon de la mienne' })).json.id as string;
  await s.vote(fan, mine, true);
  await s.vote(gone, theirs, true);
  s.state.clock += 1000;
  assert.equal((await s.edit(dup, { mergeInto: mine })).status, 200);
  const body = s.signed(gone, { op: 'forget' });
  const r = await s.call('POST', '/api/oubli', body);
  assert.equal(r.status, 200);
  assert.deepEqual(await r.json(), { propositions: 1 });
  // Plus rien de lui : ni sa proposition, ni son vote ; le doublon d'un autre fusionné chez lui redevient visible seul.
  const pub = (await s.list(gone.pk)).propositions;
  assert.deepEqual(pub.map((p) => [p.title, p.votes, p.voted, p.mine]).sort(), [['Celle d’un autre', 1, false, false], ['Doublon de la mienne', 0, false, false]].sort());
  assert.equal(await s.d1.prepare('SELECT COUNT(*) AS n FROM votes WHERE voter = ?1').bind(gone.pk).first('n'), 0);
  // Rejoué : refusé ; signé par une autre clé que celle qu'il prétend effacer : refusé.
  assert.equal((await s.call('POST', '/api/oubli', body)).status, 409);
  const forged = JSON.parse(s.signed(other, { op: 'forget' })) as { b: string; s: string };
  assert.equal((await s.call('POST', '/api/oubli', JSON.stringify({ b: forged.b.replace(other.pk, fan.pk), s: forged.s }))).status, 403);
});

test("retours : l'administrateur relève, lit et efface les rapports", async () => {
  const s = await service();
  const box = report(500);
  const first = ((await (await s.call('POST', '/api/rapports', box)).json()) as { id: string }).id;
  s.state.clock += 1000;
  const second = ((await (await s.call('POST', '/api/rapports', report(80))).json()) as { id: string }).id;
  let r = await s.adminCall('GET', '/api/admin/rapports');
  assert.deepEqual(await r.json(), {
    rapports: [
      { id: second, at: NOW + 1000, size: 80 },
      { id: first, at: NOW, size: 500 },
    ],
  });
  r = await s.adminCall('GET', `/api/admin/rapports/${first}`);
  assert.equal(r.status, 200);
  assert.equal(r.headers.get('Content-Type'), 'application/octet-stream');
  assert.deepEqual(new Uint8Array(await r.arrayBuffer()), box);
  assert.equal((await s.call('GET', `/api/admin/rapports/${first}`)).status, 403);
  r = await s.adminCall('DELETE', `/api/admin/rapports/${first}`);
  assert.equal(r.status, 204);
  assert.equal((await s.adminCall('GET', `/api/admin/rapports/${first}`)).status, 404);
  assert.deepEqual(((await (await s.adminCall('GET', '/api/admin/rapports')).json()) as { rapports: { id: string }[] }).rapports.map((x) => x.id), [second]);
  assert.equal((await s.adminCall('GET', '/api/admin/inconnue')).status, 404);
});

test('retours : sans base liée, 503 ; le relais du téléphone reste intact', async () => {
  const s = await service({ retours: false });
  for (const [method, url] of [
    ['GET', '/api/propositions'],
    ['POST', '/api/propositions'],
    ['POST', '/api/votes'],
    ['POST', '/api/rapports'],
    ['GET', '/api/admin/propositions'],
  ] as const) {
    const r = await s.call(method, url, method === 'POST' ? '{}' : undefined);
    assert.equal(r.status, 503, url);
    assert.deepEqual(await r.json(), { erreur: 'indisponible' });
  }
  assert.equal((await s.call('GET', '/api/b/court')).status, 404);
  assert.equal((await s.call('GET', `/api/b/${'A'.repeat(22)}`)).status, 404);
  assert.equal(await (await s.call('GET', '/')).text(), 'page');
});

// Les deux côtés du protocole tenus ensemble : ce qu'écrit la borne (feedback.ts) est ce qu'accepte le service.
test('retours : la borne (feedback.ts) et le service parlent le même protocole', async () => {
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const core = require('../index') as typeof import('../index');
  const svc = await service();
  const w = svc.w;
  assert.equal(w.RETOURS_PREFIX, core.FEEDBACK_PREFIX);
  assert.equal(w.ADMIN_PREFIX, core.FEEDBACK_ADMIN_PREFIX);
  assert.equal(w.ADMIN_PUBLIC_KEY, core.FEEDBACK_KEYS.sign);
  assert.deepEqual(w.KINDS, [...core.PROPOSAL_KINDS]);
  assert.deepEqual(w.STATUSES, [...core.PROPOSAL_STATUSES]);
  assert.equal(w.TITLE_MAX, core.PROPOSAL_TITLE_MAX);
  assert.equal(w.TEXT_MAX, core.PROPOSAL_TEXT_MAX);
  assert.equal(w.REPORT_MAX, core.REPORT_SEALED_MAX);
  const player = core.createPlayerKey();
  const post = (route: string, op: Parameters<typeof core.signFeedback>[1], t: number) => svc.call('POST', route, JSON.stringify(core.signFeedback(player, op, t)));
  const made = await post('/api/propositions', { op: 'propose', kind: 'feature', title: 'Trier les tables par fabricant', text: 'Et par année.', lang: 'fr' }, NOW + 1);
  assert.equal(made.status, 201);
  const { id } = (await made.json()) as { id: string };
  const r = await svc.call('GET', `/api/propositions?pk=${player.publicKey}`);
  const list = core.parseProposals(await r.json());
  assert.equal(list.length, 1);
  assert.deepEqual({ id: list[0]!.id, votes: list[0]!.votes, mine: list[0]!.mine, voted: list[0]!.voted }, { id, votes: 1, mine: true, voted: true });
  assert.equal((await post('/api/votes', { op: 'vote', id, on: false }, NOW + 2)).status, 200);
  // Un rapport scellé par la borne passe tel quel ; la gestion signée par feedback.ts le relit.
  const sealed = core.sealReport({ v: 1, kind: 'crash', signature: 'vpx:0xC0000005:t', version: '0', lang: 'fr', borne: 'AbCdEfGhIjKl', at: NOW }, new Uint8Array(2000));
  const sent = await svc.call('POST', '/api/rapports', sealed, { 'Content-Type': 'application/octet-stream' });
  assert.equal(sent.status, 201);
  const adminPair = crypto.generateKeyPairSync('ed25519');
  svc.env.ADMIN_PUBLIC_KEY = Buffer.from(adminPair.publicKey.export({ format: 'jwk' }).x as string, 'base64url').toString('hex');
  const pem = adminPair.privateKey.export({ format: 'pem', type: 'pkcs8' }).toString();
  const listed = await svc.call('GET', '/api/admin/rapports', undefined, core.signFeedbackAdmin(pem, 'GET', '/api/admin/rapports', '', NOW));
  assert.equal(listed.status, 200);
  const { rapports } = (await listed.json()) as { rapports: { id: string }[] };
  const got = await svc.call('GET', `/api/admin/rapports/${rapports[0]!.id}`, undefined, core.signFeedbackAdmin(pem, 'GET', `/api/admin/rapports/${rapports[0]!.id}`, '', NOW + 1));
  assert.ok(Buffer.from(await got.arrayBuffer()).equals(sealed));
});
