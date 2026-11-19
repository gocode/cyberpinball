// Propositions traduites (19/11/2026) : chaque proposition de « Retours et propositions » se lit dans
// toutes les langues de l'interface, sans rien demander au joueur.
//
// Invariants fixés ici :
// - le service (worker.mjs) traduit vers les langues de l'interface : sa liste LANGS est LANGUAGES ;
// - la traduction se fait à la publication, après la réponse ; un échec (quota, panne) n'empêche pas
//   la publication et la traduction est retentée plus tard, pas avant TRANSLATE_RETRY_MS ;
// - toute version manquante se comble d'elle-même : propositions d'avant, langue ajoutée, original
//   modifié par l'équipe (l'ancienne traduction n'est plus rendue) ;
// - la réponse de l'équipe est traduite depuis sa propre langue ;
// - sur la borne : la version de la langue du joueur, la mention « Traduit du … », l'original à un
//   appui, le filtre de mots sur le texte traduit, les doublons comparés dans la langue du joueur.
// Rien ne sort sur le réseau : le Worker tourne en mémoire (fausse D1), le modèle est simulé.

import assert from 'node:assert/strict';
import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { REPO_ROOT } from './i18n-scan';
import { memoryD1 } from './fausse-d1';
import { fakeFeedbackService } from './doublures';
import { LANGUAGES, setLanguage } from '../i18n';
import { parseProposal, parseProposals, proposalIn, proposalOriginal, similarProposals, TRANSLATED_FROM, type Proposal } from '../feedback';

const SERVICE = path.join(REPO_ROOT, 'packages', 'service-telephone');
const NOW = Date.UTC(2026, 10, 19, 12);

interface WorkerModule {
  default: {
    fetch(request: Request, env: unknown, ctx: unknown, now?: number): Promise<Response>;
    scheduled(event: unknown, env: unknown, ctx: unknown, now?: number): Promise<void>;
  };
  RETOURS_PREFIX: string;
  ADMIN_PREFIX: string;
  LANGS: string[];
  TRANSLATE_MODEL: string;
  TRANSLATE_RETRY_MS: number;
  TRANSLATE_CALLS_ON_DEMAND: number;
  guessLang(text: string): string | undefined;
}
let loaded: Promise<WorkerModule> | undefined;
const loadWorker = () => (loaded ??= import(pathToFileURL(path.join(SERVICE, 'worker.mjs')).href) as Promise<WorkerModule>);

function keys() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync('ed25519');
  const pk = Buffer.from(publicKey.export({ format: 'jwk' }).x as string, 'base64url').toString('hex');
  return { pk, sign: (text: string) => crypto.sign(null, Buffer.from(text, 'utf8'), privateKey).toString('base64') };
}

interface Listed {
  id: string;
  title: string;
  text: string;
  lang: string;
  reply?: string;
  reply_lang?: string;
  translations?: Record<string, { title?: string; text?: string; reply?: string }>;
}

/** Le modèle simulé : « [en] texte » ; `fail` le fait échouer (quota du jour, panne). */
function fakeAi() {
  const calls: { model: string; text: string; from: string; to: string }[] = [];
  const ai = {
    fail: false,
    calls,
    async run(model: string, input: { text: string; source_lang: string; target_lang: string }) {
      calls.push({ model, text: input.text, from: input.source_lang, to: input.target_lang });
      if (ai.fail) throw new Error('4006: daily free allocation exceeded');
      return { translated_text: `[${input.target_lang}] ${input.text}` };
    },
  };
  return ai;
}

/** Le service en mémoire, avec ou sans modèle ; `pending` : les tâches lancées après la réponse (ctx.waitUntil). */
async function service(options: { ai?: boolean } = {}) {
  const w = await loadWorker();
  const d1 = memoryD1();
  const ai = fakeAi();
  const admin = keys();
  const env: Record<string, unknown> = { RETOURS: d1, ADMIN_PUBLIC_KEY: admin.pk, ASSETS: { fetch: async () => new Response('page') }, ...(options.ai === false ? {} : { AI: ai }) };
  const state = { clock: NOW, seq: 0 };
  const pending: Promise<unknown>[] = [];
  const ctx = { waitUntil: (p: Promise<unknown>) => void pending.push(p) };
  /** Attend les tâches de fond (comme le runtime après la réponse). */
  const settle = async () => {
    while (pending.length) await pending.shift();
  };
  const call = (method: string, url: string, body?: string, headers: Record<string, string> = {}) =>
    w.default.fetch(new Request(new URL(url, 'https://t.cyberpinball.com'), { method, headers, ...(body === undefined ? {} : { body }) }), env, ctx, state.clock);
  const propose = async (k = keys(), fields: Record<string, unknown> = {}) => {
    const b = JSON.stringify({ v: 1, pk: k.pk, t: state.clock + ++state.seq, op: 'propose', kind: 'feature', title: 'Trier les tables par fabricant', text: 'Comme dans les autres menus.\n\nEt par année.', lang: 'fr', ...fields });
    const r = await call('POST', '/api/propositions', JSON.stringify({ b, s: k.sign(w.RETOURS_PREFIX + b) }));
    assert.equal(r.status, 201);
    return ((await r.json()) as { id: string }).id;
  };
  const list = async () => {
    const r = await call('GET', '/api/propositions');
    assert.equal(r.status, 200);
    return (await r.json()) as { propositions: Listed[] };
  };
  const edit = async (id: string, change: Record<string, unknown>) => {
    const body = JSON.stringify(change);
    const date = String(state.clock + ++state.seq);
    const hash = crypto.createHash('sha256').update(body).digest('hex');
    const r = await call('POST', `/api/admin/propositions/${id}`, body, { 'X-Retours-Date': date, 'X-Retours-Signature': admin.sign(`${w.ADMIN_PREFIX}POST\n/api/admin/propositions/${id}\n${date}\n${hash}`) });
    assert.equal(r.status, 200);
  };
  const cron = () => w.default.scheduled({}, env, ctx, state.clock).then(settle);
  return { w, d1, ai, env, state, settle, call, propose, list, edit, cron };
}

test('traduction : le service traduit vers les langues de l’interface, la même liste que la borne', async () => {
  const w = await loadWorker();
  assert.deepEqual(w.LANGS, [...LANGUAGES]);
  // Chaque langue a sa mention « Traduit du … » sur la borne.
  for (const lang of LANGUAGES) assert.ok(TRANSLATED_FROM[lang]().length > 5, lang);
  // Le modèle de traduction de Workers AI, et sa liaison dans wrangler.toml (avec le cron horaire).
  assert.equal(w.TRANSLATE_MODEL, '@cf/meta/m2m100-1.2b');
  const toml = fs.readFileSync(path.join(SERVICE, 'wrangler.toml'), 'utf8');
  assert.match(toml, /\[ai\]\s*\r?\nbinding = "AI"/);
  assert.match(toml, /\[triggers\]\s*\r?\ncrons = \["[^"]+"\]/);
  // La table des traductions est dans le schéma rejouable.
  assert.match(fs.readFileSync(path.join(SERVICE, 'schema.sql'), 'utf8'), /CREATE TABLE IF NOT EXISTS traductions/);
});

test('traduction : un déploiement réussi compte même si wrangler finit sur un code non nul (le rattrapage n’est pas sauté)', async () => {
  const script = (await import(pathToFileURL(path.join(REPO_ROOT, 'scripts', 'service-telephone.mjs')).href)) as { deployedOk(stdout: unknown): boolean };
  assert.equal(script.deployedOk('Total Upload: 45 KiB\nUploaded cyberpinball-telephone (70.74 sec)\nDeployed cyberpinball-telephone triggers (4.86 sec)\n'), true);
  assert.equal(script.deployedOk('Uploaded cyberpinball-telephone (70.74 sec)\n✘ [ERROR] triggers'), false);
  assert.equal(script.deployedOk(null), false);
});

test('traduction : une proposition est traduite à sa publication, ligne par ligne, vers les autres langues seulement', async () => {
  const s = await service();
  const id = await s.propose();
  // La publication n'attend pas la traduction : elle part en tâche de fond.
  assert.equal(s.ai.calls.length, 0);
  await s.settle();
  assert.deepEqual(
    s.ai.calls.map((c) => [c.model, c.from, c.to, c.text]),
    [
      ['@cf/meta/m2m100-1.2b', 'fr', 'en', 'Trier les tables par fabricant'],
      ['@cf/meta/m2m100-1.2b', 'fr', 'en', 'Comme dans les autres menus.'],
      ['@cf/meta/m2m100-1.2b', 'fr', 'en', 'Et par année.'],
    ],
  );
  const [p] = (await s.list()).propositions;
  assert.equal(p?.id, id);
  // L'original reste tel quel, la version anglaise à côté ; aucune version française d'un texte français.
  assert.equal(p?.title, 'Trier les tables par fabricant');
  assert.deepEqual(p?.translations, { en: { title: '[en] Trier les tables par fabricant', text: '[en] Comme dans les autres menus.\n\n[en] Et par année.' } });
  // Rien à refaire ensuite : lire la liste ne rappelle pas le modèle.
  await s.settle();
  assert.equal(s.ai.calls.length, 3);
  // Une proposition anglaise est traduite en français.
  await s.propose(undefined, { title: 'Sort tables by maker', text: '', lang: 'en' });
  await s.settle();
  const en = (await s.list()).propositions.find((x) => x.lang === 'en');
  assert.deepEqual(en?.translations, { fr: { title: '[fr] Sort tables by maker' } });
});

test('traduction : un échec (quota, panne) publie quand même, et la traduction est retentée plus tard', async () => {
  const s = await service();
  s.ai.fail = true;
  const id = await s.propose();
  await s.settle();
  assert.equal(s.ai.calls.length, 1, 'au premier échec, le passage s’arrête');
  let [p] = (await s.list()).propositions;
  assert.equal(p?.id, id, 'la proposition est publiée');
  assert.equal(p?.translations, undefined, 'dans la langue de son auteur');
  // Pas de nouvel essai avant le délai, même si les bornes relisent la liste.
  await s.settle();
  s.state.clock += s.w.TRANSLATE_RETRY_MS - 1000;
  await s.list();
  await s.settle();
  assert.equal(s.ai.calls.length, 1);
  // Le délai passé, la lecture de la liste relance la traduction ; elle réussit.
  s.ai.fail = false;
  s.state.clock += 2000;
  await s.list();
  await s.settle();
  [p] = (await s.list()).propositions;
  assert.equal(p?.translations?.en?.title, '[en] Trier les tables par fabricant');
  // Une réponse vide du modèle est un échec, pas une traduction vide.
  const empty = await service();
  (empty.ai as { run: unknown }).run = async () => ({ translated_text: '  ' });
  await empty.propose();
  await empty.settle();
  assert.equal((await empty.list()).propositions[0]?.translations, undefined);
});

test('traduction : les propositions d’avant (et une langue ajoutée) se comblent d’elles-mêmes, par la liste et par le cron', async () => {
  // Publiées sans traduction (service d'avant cette fonction) : aucune ligne dans « traductions »,
  // exactement comme pour une langue ajoutée plus tard à LANGUAGES.
  const s = await service({ ai: false });
  const ids = [];
  for (let i = 0; i < 4; i++) ids.push(await s.propose(undefined, { title: `Idée numéro ${i}`, text: '' }));
  await s.settle();
  assert.ok((await s.list()).propositions.every((p) => !p.translations));
  // Le service reçoit le modèle (déploiement) : le cron comble tout, sans rien relancer à la main.
  s.env.AI = s.ai;
  await s.cron();
  const after = (await s.list()).propositions;
  assert.equal(after.filter((p) => p.translations?.en?.title === `[en] ${p.title}`).length, 4);
  // Une proposition masquée ou fusionnée n'est pas traduite (personne ne la lit).
  const t = await service({ ai: false });
  const hidden = await t.propose(undefined, { title: 'Texte hors sujet' });
  await t.edit(hidden, { hidden: true });
  t.env.AI = t.ai;
  await t.cron();
  assert.equal(t.ai.calls.length, 0);
  // Sans cron, la première lecture de la liste suffit (à la demande).
  const u = await service({ ai: false });
  await u.propose();
  u.env.AI = u.ai;
  await u.list();
  await u.settle();
  assert.equal((await u.list()).propositions[0]?.translations?.en?.title, '[en] Trier les tables par fabricant');
});

test('traduction : un titre modifié par l’équipe est retraduit, la réponse est traduite depuis sa langue', async () => {
  const s = await service();
  const id = await s.propose(undefined, { text: '' });
  await s.settle();
  await s.edit(id, { title: 'Trier la roue par fabricant' });
  await s.settle();
  let [p] = (await s.list()).propositions;
  assert.equal(p?.translations?.en?.title, '[en] Trier la roue par fabricant', 'l’ancienne traduction n’est plus rendue');
  // Réponse en français à une proposition française : traduite en anglais.
  await s.edit(id, { reply: 'Merci, c’est prévu pour la prochaine version et nous vous tiendrons au courant.' });
  await s.settle();
  [p] = (await s.list()).propositions;
  assert.equal(p?.reply_lang, undefined);
  assert.equal(p?.translations?.en?.reply, '[en] Merci, c’est prévu pour la prochaine version et nous vous tiendrons au courant.');
  // Réponse en anglais à une proposition française : traduite en français, pas en anglais.
  await s.edit(id, { reply: 'Thanks, this is planned for the next version and we will keep you posted.' });
  await s.settle();
  [p] = (await s.list()).propositions;
  assert.equal(p?.reply_lang, 'en');
  assert.equal(p?.translations?.fr?.reply, '[fr] Thanks, this is planned for the next version and we will keep you posted.');
  assert.equal(p?.translations?.en?.reply, undefined);
  assert.equal(p?.translations?.en?.title, '[en] Trier la roue par fabricant');
  assert.equal(s.w.guessLang('Merci !'), undefined, 'trop court pour trancher : la langue de la proposition');
});

test('traduction : un compte supprimé emporte les traductions de ses propositions', async () => {
  const s = await service();
  const k = keys();
  await s.propose(k);
  await s.settle();
  assert.equal(Number((s.d1.db.prepare('SELECT COUNT(*) AS n FROM traductions').get() as { n: number }).n), 1);
  const b = JSON.stringify({ v: 1, pk: k.pk, t: s.state.clock + 99, op: 'forget' });
  assert.equal((await s.call('POST', '/api/oubli', JSON.stringify({ b, s: k.sign(s.w.RETOURS_PREFIX + b) }))).status, 200);
  assert.equal(Number((s.d1.db.prepare('SELECT COUNT(*) AS n FROM traductions').get() as { n: number }).n), 0);
});

test('traduction : la borne lit la version de sa langue, garde l’original, et compare les doublons dans sa langue', async () => {
  const s = await service();
  await s.propose(undefined, { title: 'Trier les tables par fabricant', text: 'Comme ailleurs.' });
  await s.settle();
  const [p] = parseProposals(await s.list());
  assert.ok(p);
  const en = proposalIn(p, 'en');
  assert.deepEqual([en.title, en.text, en.translatedFrom], ['[en] Trier les tables par fabricant', '[en] Comme ailleurs.', 'fr']);
  assert.deepEqual(en.original, { lang: 'fr', title: 'Trier les tables par fabricant', text: 'Comme ailleurs.' });
  const back = proposalOriginal(en);
  assert.deepEqual([back.title, back.text, back.translatedFrom], ['Trier les tables par fabricant', 'Comme ailleurs.', undefined]);
  const fr = proposalIn(p, 'fr');
  assert.deepEqual([fr.title, fr.translatedFrom], ['Trier les tables par fabricant', undefined]);
  // Une version illisible est écartée : l'original s'affiche.
  const odd = parseProposal({ id: 'abcdefghij', kind: 'bug', status: 'new', title: 'Bille perdue', text: '', lang: 'fr', translations: { en: { title: 'ab' }, de: { title: 'Kugel verloren' } } });
  assert.equal(odd?.translations, undefined);
  // Doublons entre langues : un joueur anglophone retrouve l'idée française.
  const ideas: Proposal[] = [
    { id: 'aaaaaaaaaa', kind: 'feature', title: 'Trier les tables par fabricant', text: '', lang: 'fr', votes: 3, status: 'new', at: 1, updated: 1, merged: 0, translations: { en: { title: 'Sort the tables by manufacturer', text: '' } } },
  ];
  assert.equal(similarProposals('Sort tables by manufacturer', ideas).length, 0, 'sans traduction, rien en commun');
  assert.deepEqual(similarProposals('Sort tables by manufacturer', ideas.map((x) => proposalIn(x, 'en'))).map((x) => x.id), ['aaaaaaaaaa']);
});

// ---------- Sur la borne : « Retours et propositions » (app/src/feedback-menu.ts, compilé) ----------

interface Row {
  text: string;
  detail?: string;
  tone?: string;
}
interface Built {
  heading: string;
  sections: { title?: string; rows: Row[] }[];
  actions: { label: string; detail?: string; key?: string; run: () => void }[];
}
/* eslint-disable @typescript-eslint/no-require-imports */
const { createFeedbackMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'feedback-menu.js')) as {
  createFeedbackMenu(ctx: object): { open(back?: () => void): void; openForm(context: object, back: () => void, kind?: string): void };
};
/* eslint-enable @typescript-eslint/no-require-imports */

function menuWith(lang: 'fr' | 'en', list: Proposal[]) {
  setLanguage(lang);
  const dataDir = fs.mkdtempSync(path.join(os.tmpdir(), 'cp-traduction-'));
  let shown: (() => Built) | undefined;
  let typed: string | undefined;
  const menu = createFeedbackMenu({
    dataDir,
    service: fakeFeedbackService({ list: () => list, net: () => 'ok', canWrite: () => true, refreshIfOld: async () => undefined, queuedCount: () => 0, supporters: () => ({ value: { people: [], others: 0 }, state: 'ok' }) }),
    version: '9.9.9',
    language: () => lang,
    openCustom: (build: () => Built) => (shown = build),
    openSystem: () => undefined,
    prompt: (_h: string, _l: string, _v: string, done: (value: string | undefined) => void) => done(typed),
    showing: (build: () => Built) => shown === build,
    techReport: () => undefined,
    log: () => undefined,
  });
  return {
    menu,
    screen: () => shown!(),
    type: (value: string) => (typed = value),
    press: (pick: (a: Built['actions'][number]) => boolean) => shown!().actions.find(pick)!.run(),
    rows: () => shown!().sections.flatMap((s) => s.rows),
    done: () => fs.rmSync(dataDir, { recursive: true, force: true }),
  };
}

const FRENCH: Proposal = {
  id: 'frfrfrfrfr',
  kind: 'feature',
  title: 'Ce flipper est trop lent',
  text: 'La bille traîne.',
  lang: 'fr',
  votes: 2,
  status: 'new',
  at: NOW,
  updated: NOW,
  merged: 0,
  reply: 'Merci, nous regardons cela pour la prochaine version.',
  translations: { en: { title: 'What the fuck, this flipper is slow', text: 'The ball drags.', reply: 'Thanks, we are looking at this for the next version.' } },
};
const ENGLISH: Proposal = { id: 'enenenenen', kind: 'bug', title: 'Sound cuts out after a game', text: '', lang: 'en', votes: 1, status: 'new', at: NOW, updated: NOW, merged: 0, translations: { fr: { title: 'Le son se coupe après une partie', text: '' } } };

test('traduction (borne, EN) : la liste et la fiche montrent la version anglaise, la mention, l’original, le filtre', () => {
  const m = menuWith('en', [FRENCH, ENGLISH]);
  try {
    m.menu.open();
    const row = m.rows().find((r) => r.text.includes('flipper is slow'));
    assert.ok(row, 'le titre traduit dans la liste');
    assert.equal(row.text, 'What the ****, this flipper is slow', 'le filtre de mots s’applique au texte traduit');
    assert.match(row.detail ?? '', /translated from French$/);
    const own = m.rows().find((r) => r.text === 'Sound cuts out after a game');
    assert.ok(own && !/[Tt]ranslated/.test(own.detail ?? ''), 'une proposition dans ma langue n’a pas de mention');
    // La fiche : titre, description et réponse traduits, la mention, et « See the original ».
    m.press((a) => a.key === `feedback:${FRENCH.id}`);
    assert.equal(m.screen().heading, 'What the ****, this flipper is slow');
    const texts = m.rows().map((r) => r.text);
    assert.ok(texts.includes('The ball drags.'));
    assert.ok(texts.includes('Translated from French'));
    assert.ok(texts.includes('Thanks, we are looking at this for the next version.'));
    const original = m.screen().actions.find((a) => a.key === 'feedback:original');
    assert.deepEqual([original?.label, original?.detail], ['See the original', 'Français']);
    original!.run();
    assert.equal(m.screen().heading, 'Ce flipper est trop lent');
    assert.ok(m.rows().some((r) => r.text === 'La bille traîne.'));
    assert.ok(m.rows().some((r) => r.text === 'Merci, nous regardons cela pour la prochaine version.'));
    assert.ok(m.rows().some((r) => r.text === 'Original text, as the author wrote it'));
    const again = m.screen().actions.find((a) => a.key === 'feedback:original');
    assert.deepEqual([again?.label, again?.detail], ['See the translation', 'English']);
    again!.run();
    assert.equal(m.screen().heading, 'What the ****, this flipper is slow');
    // Une proposition sans traduction n'a pas l'action.
    const plain = menuWith('en', [{ ...FRENCH, translations: undefined }]);
    plain.menu.open();
    plain.press((a) => a.key === `feedback:${FRENCH.id}`);
    assert.equal(plain.screen().heading, 'Ce flipper est trop lent');
    assert.ok(!plain.screen().actions.some((a) => a.key === 'feedback:original'));
    plain.done();
  } finally {
    m.done();
    setLanguage('fr');
  }
});

test('traduction (borne, FR) : une idée anglaise se lit en français, et « Déjà proposé ? » la retrouve', () => {
  const m = menuWith('fr', [FRENCH, ENGLISH]);
  try {
    m.menu.open();
    const row = m.rows().find((r) => r.text === 'Le son se coupe après une partie');
    assert.ok(row);
    assert.match(row.detail ?? '', /traduit de l’anglais$/);
    m.press((a) => a.key === `feedback:${ENGLISH.id}`);
    assert.ok(m.rows().some((r) => r.text === 'Traduit de l’anglais'));
    assert.deepEqual(m.screen().actions.find((a) => a.key === 'feedback:original')?.detail, 'English');
    // Le formulaire : un joueur francophone décrit le même problème, l'idée anglaise est proposée.
    m.menu.openForm({}, () => undefined, 'bug');
    m.type('Le son se coupe après chaque partie');
    m.press((a) => a.key === 'feedback:title');
    assert.ok(m.screen().actions.some((a) => a.key === `feedback-near:${ENGLISH.id}` && a.label === 'Le son se coupe après une partie'));
  } finally {
    m.done();
  }
});
