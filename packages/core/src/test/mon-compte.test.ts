// Mon compte (novembre 2026) : un compte de joueur qui ne se perd plus.
// - le code de récupération (recovery.ts) : liste de mots figée, aller-retour exact de la clé, mots
//   mal recopiés refusés, texte du QR ou liste numérotée relus ;
// - le paquet de compte et la copie de secours (account.ts), et l'invariant : tout ce qui fait le
//   compte entre dans une sauvegarde « Réglages et scores » (l'avatar en manquait, 18/11/2026) ;
// - le coffre (vault.ts) et le service (worker.mjs) ensemble, de bout en bout par le service du compte
//   (app/src/account-service.ts) : sur une fausse D1 en mémoire, jamais le vrai réseau.

import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { test } from 'node:test';
import { pathToFileURL } from 'node:url';
import { accountSummary, copyToOffer, listAccountCopies, parseAccountBundle, readAccountBundle, saveAccountCopy, saveProtection, writeAccountBundle, type AccountBundle, type AccountProtection } from '../account';
import { avatarPath } from '../avatar';
import { partOf } from '../backup';
import { LEVELS_FILE, emptyLevels } from '../levels';
import { normalizeRecoveryWord, parseRecoveryText, playerKeyFromSeed, recoveryCheckPositions, recoveryWords, seedFromWords, suggestRecoveryWords } from '../recovery';
import { RECOVERY_WORDS } from '../recoverywords';
import { createPlayerKey, type PlayerKey } from '../sharing';
import { hasDefaultName, newSocialState, playerSeed, saveSocial, type SocialState } from '../social';
import { signFeedback } from '../feedback';
import { openVault, signVault, passwordSetup, passwordKeys, sealVault, unwrapDataKey, vaultDataKey, vaultLogin } from '../vault';
import { memoryD1, SERVICE_DIR } from './fausse-d1';
import { REPO_ROOT } from './i18n-scan';

const T0 = new Date('2026-11-18T20:00:00Z');
const tmp = (prefix: string) => fs.mkdtempSync(path.join(os.tmpdir(), prefix));

// ---------------------------------------------------------------------------
// Code de récupération

test('la liste des mots est figée : 2 048 mots courts, sans accent, chacun une fois', () => {
  assert.equal(RECOVERY_WORDS.length, 2048);
  assert.equal(new Set(RECOVERY_WORDS).size, 2048);
  for (const w of RECOVERY_WORDS) assert.match(w, /^[a-z]{3,10}$/, w);
  // Un mot changé rendrait illisibles les codes déjà notés : l'empreinte ne bouge jamais.
  assert.equal(createHash('sha256').update(RECOVERY_WORDS.join('\n')).digest('hex'), '2a1062a32684e4222a6589350dbe0eb12271a1a75ee59becd7ff45002f8f89e4');
});

test('24 mots redonnent exactement la clé du joueur, même graine, même clé publique', () => {
  for (let i = 0; i < 20; i++) {
    const key = createPlayerKey();
    const words = recoveryWords(playerSeed(key));
    assert.equal(words.length, 24);
    const back = seedFromWords(words);
    assert.ok('seed' in back);
    assert.equal(playerKeyFromSeed(back.seed).publicKey, key.publicKey);
  }
});

test('un mot mal recopié, inconnu, ou deux mots inversés sont refusés', () => {
  const words = recoveryWords(playerSeed(createPlayerKey()));
  assert.deepEqual(seedFromWords(words.slice(0, 23)), { problem: { kind: 'count', count: 23 } });
  const unknown = [...words];
  unknown[4] = 'zzzz';
  assert.deepEqual(seedFromWords(unknown), { problem: { kind: 'unknown', position: 5, word: 'zzzz' } });
  // Inverser deux mots différents change la graine ou le contrôle : presque toujours refusé, jamais une autre clé valable en silence.
  let refused = 0;
  for (let i = 0; i < 50; i++) {
    const w = recoveryWords(playerSeed(createPlayerKey()));
    const swapped = [...w];
    [swapped[3], swapped[7]] = [swapped[7]!, swapped[3]!];
    if (swapped[3] !== w[3] && 'problem' in seedFromWords(swapped)) refused++;
  }
  assert.ok(refused >= 45, `inversions refusées : ${refused} sur 50`);
});

test('le texte du QR, une liste numérotée recopiée, des majuscules et des accents se relisent', () => {
  const key = createPlayerKey();
  const words = recoveryWords(playerSeed(key));
  const numbered = words.map((w, i) => `${i + 1} ${w.toUpperCase()}`).join('  ·  ');
  assert.deepEqual(parseRecoveryText(numbered), words);
  assert.deepEqual(parseRecoveryText(words.join('\n')), words);
  assert.equal(normalizeRecoveryWord('Éléphant'), 'elephant');
  assert.ok(suggestRecoveryWords('hu').every((w) => w.startsWith('hu')));
  assert.deepEqual(suggestRecoveryWords('h'), []);
  for (let i = 0; i < 50; i++) {
    const [a, b] = recoveryCheckPositions();
    assert.ok(a >= 1 && b <= 24 && a < b);
  }
});

// ---------------------------------------------------------------------------
// Paquet et copie de secours

function account(dir: string, name = 'Kiko', extra: Partial<SocialState> = {}): SocialState {
  const avatar = `${'b'.repeat(64)}.png`;
  const s: SocialState = { ...newSocialState(T0), name, country: 'FR', avatar, ...extra };
  saveSocial(dir, s);
  fs.mkdirSync(path.dirname(avatarPath(dir, avatar)), { recursive: true });
  fs.writeFileSync(avatarPath(dir, avatar), Buffer.from('image'));
  fs.writeFileSync(path.join(dir, LEVELS_FILE), JSON.stringify({ ...emptyLevels(), xp: 3450 }));
  saveProtection(dir, { v: 1, codeNotedAt: T0.toISOString() });
  return s;
}

test('le paquet reprend clé, pseudo, niveau, protection et avatar, et se pose ailleurs à l’identique', () => {
  const a = tmp('cp-compte-a-');
  const s = account(a);
  const bundle = readAccountBundle(a, { now: T0 })!;
  const summary = accountSummary(bundle)!;
  assert.equal(summary.key, s.key.publicKey);
  assert.equal(summary.name, 'Kiko');
  assert.equal(summary.xp, 3450);
  assert.equal(summary.level > 1, true);
  const b = tmp('cp-compte-b-');
  writeAccountBundle(b, parseAccountBundle(JSON.parse(JSON.stringify(bundle)))!);
  assert.deepEqual(readAccountBundle(b, { now: T0 }), bundle);
  assert.equal(fs.readFileSync(avatarPath(b, s.avatar!), 'utf8'), 'image');
});

test('le paquet léger laisse l’annuaire, qui se reremplit seul', () => {
  const a = tmp('cp-compte-leger-');
  account(a);
  const raw = JSON.parse(fs.readFileSync(path.join(a, 'social.json'), 'utf8'));
  assert.ok('directory' in raw);
  assert.ok(!('directory' in readAccountBundle(a, { lean: true })!.social));
});

test('copie de secours : réécrite seulement si le compte change ; une installation neuve propose un compte qui a servi', () => {
  const a = tmp('cp-compte-copie-');
  const copies = tmp('cp-comptes-');
  account(a);
  assert.equal(saveAccountCopy(copies, readAccountBundle(a, { now: T0 })!), true);
  assert.equal(saveAccountCopy(copies, readAccountBundle(a, { now: new Date(T0.getTime() + 60_000) })!), false, 'inchangé : pas réécrit');
  const list = listAccountCopies(copies);
  assert.equal(list.length, 1);
  // La borne neuve a son compte d'office (nom donné d'office, rien joué) : la copie est proposée.
  const fresh = newSocialState(T0);
  assert.equal(copyToOffer(list, fresh.key.publicKey, hasDefaultName)?.summary.name, 'Kiko');
  // Jamais son propre compte.
  assert.equal(copyToOffer(list, list[0]!.summary.key, hasDefaultName), undefined);
  // Un compte jamais utilisé (nom d'office, ni XP, ni badge, ni ami) ne vaut pas d'être repris.
  const unused = tmp('cp-compte-vide-');
  saveSocial(unused, newSocialState(T0));
  saveAccountCopy(copies, readAccountBundle(unused)!);
  assert.equal(listAccountCopies(copies).filter((c) => copyToOffer([c], fresh.key.publicKey, hasDefaultName)).length, 1);
});

test('tout ce qui fait le compte entre dans une sauvegarde « Réglages et scores »', async () => {
  const { accountPaths } = (await import(pathToFileURL(path.join(REPO_ROOT, 'app', 'dist', 'account-delete.js')).href)) as { accountPaths(dataDir: string): string[] };
  const root = path.join(os.tmpdir(), 'racine');
  const data = path.join(root, 'data');
  const rels = [...accountPaths(data), path.join(data, LEVELS_FILE), path.join(data, 'compte.json')].map((p) => path.relative(root, p).split(path.sep).join('/'));
  for (const rel of rels) {
    // Un dossier (les avatars) : un fichier nommé comme ceux qu'il garde.
    const probe = rel.endsWith('avatars') ? `${rel}/${'c'.repeat(64)}.png` : rel;
    assert.ok(partOf(probe), `${probe} n’entre dans aucune sauvegarde`);
    assert.ok(['friends', 'settings', 'scores', 'cabinet'].includes(partOf(probe)!), probe);
  }
});

// ---------------------------------------------------------------------------
// Coffre

test('le coffre ne s’ouvre qu’avec la clé tirée de la graine ; le mot de passe n’ouvre que son enveloppe', () => {
  const a = tmp('cp-coffre-');
  const s = account(a);
  const bundle = readAccountBundle(a, { lean: true })!;
  const key = vaultDataKey(playerSeed(s.key));
  const sealed = sealVault(bundle, key);
  assert.equal(sealed.subarray(0, 4).toString(), 'CPC1');
  assert.ok(!sealed.includes(Buffer.from('Kiko')), 'rien en clair');
  assert.deepEqual(openVault(sealed, key), bundle);
  assert.equal(openVault(sealed, vaultDataKey(playerSeed(createPlayerKey()))), undefined);
  const setup = passwordSetup('Un bon mot de passe', key, Buffer.alloc(16, 7));
  assert.deepEqual(unwrapDataKey(setup.wrap, passwordKeys('Un bon mot de passe', Buffer.alloc(16, 7)).wrap), key);
  assert.equal(unwrapDataKey(setup.wrap, passwordKeys('Un autre', Buffer.alloc(16, 7)).wrap), undefined);
  assert.equal(vaultLogin('  Kiko  Le  Grand '), 'kiko le grand');
});

interface WorkerModule {
  default: { fetch(request: Request, env: unknown, ctx: unknown, now?: number): Promise<Response> };
  VAULT_TRIES: number;
  RETOURS_PREFIX: string;
}
type Transport = (method: 'GET' | 'POST', route: string, body?: string) => Promise<{ status: number; json?: unknown }>;
type Opened = { ok: true; bundle: AccountBundle; from: 'vault' | 'key' } | { ok: false; why: string };
interface AccountService {
  protection(): AccountProtection;
  words(): string[];
  noteCode(): void;
  syncVault(force?: boolean): Promise<string>;
  setPassword(password: string, login: string): Promise<{ ok: boolean; why?: string }>;
  openWithWords(words: readonly string[]): Promise<Opened>;
  openWithPassword(login: string, password: string): Promise<Opened>;
}
interface Service {
  createAccountService(o: { dataDir: string; copiesDir: string; key(): PlayerKey; transport?: Transport }): AccountService;
}

async function bench() {
  const w = (await import(pathToFileURL(path.join(SERVICE_DIR, 'worker.mjs')).href)) as WorkerModule;
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const svc = require(path.join(REPO_ROOT, 'app', 'dist', 'account-service.js')) as Service;
  const d1 = memoryD1();
  const env = { ADRESSES: {}, ASSETS: { fetch: async () => new Response('page') }, RETOURS: d1 };
  const transport = async (method: 'GET' | 'POST', route: string, body?: string) => {
    const res = await w.default.fetch(new Request(new URL(route, 'https://t.cyberpinball.com'), { method, ...(body === undefined ? {} : { body }) }), env, {});
    let json: unknown;
    try {
      json = await res.json();
    } catch {
      json = undefined;
    }
    return { status: res.status, json };
  };
  /** Une borne : son dossier de données, son compte, son service du compte. */
  const borne = (name: string, friends = 0) => {
    const dir = tmp('cp-borne-');
    const s = account(dir, name, { friends: Array.from({ length: friends }, (_, i) => ({ key: createPlayerKey().publicKey, name: `Ami ${i + 1}`, since: T0.toISOString(), events: [] })) });
    const service = svc.createAccountService({ dataDir: dir, copiesDir: tmp('cp-secours-'), key: () => s.key, transport });
    return { dir, s, service };
  };
  return { w, d1, transport, borne, svc };
}

test('code noté : le coffre part ; sur un autre PC, les 24 mots redonnent tout le compte', async () => {
  const { borne } = await bench();
  const kiko = borne('Kiko', 6);
  kiko.service.noteCode();
  assert.equal(await kiko.service.syncVault(), 'sent');
  const ailleurs = borne('Joueur neuf');
  const opened = await ailleurs.service.openWithWords(kiko.service.words());
  assert.ok(opened.ok);
  assert.equal(opened.from, 'vault');
  const summary = accountSummary(opened.bundle)!;
  assert.deepEqual([summary.key, summary.name, summary.friends, summary.xp], [kiko.s.key.publicKey, 'Kiko', 6, 3450]);
  assert.ok(opened.bundle.avatar, 'l’avatar revient');
});

test('sans coffre, les mots redonnent au moins la clé : les amis reconnaissent le joueur', async () => {
  const { borne } = await bench();
  const kiko = borne('Kiko');
  const ailleurs = borne('Autre');
  const opened = await ailleurs.service.openWithWords(kiko.service.words());
  assert.ok(opened.ok);
  assert.equal(opened.from, 'key');
  assert.equal(accountSummary(opened.bundle)!.key, kiko.s.key.publicKey);
});

test('mot de passe : le pseudo devient l’identifiant, réservé ; le bon mot de passe ouvre le coffre', async () => {
  const { borne, w } = await bench();
  const kiko = borne('Kiko', 2);
  assert.deepEqual(await kiko.service.setPassword('Un bon mot de passe', 'Kiko'), { ok: true });
  assert.equal(kiko.service.protection().password?.name, 'Kiko');
  // Un autre joueur ne peut pas prendre le même identifiant, même en changeant la casse.
  const other = borne('KIKO');
  assert.deepEqual(await other.service.setPassword('autre mot de passe', 'KIKO'), { ok: false, why: 'taken' });
  const ailleurs = borne('Neuf');
  const opened = await ailleurs.service.openWithPassword('kiko', 'Un bon mot de passe');
  assert.ok(opened.ok);
  assert.equal(accountSummary(opened.bundle)!.friends, 2);
  assert.deepEqual(await ailleurs.service.openWithPassword('Kiko', 'pas le bon'), { ok: false, why: 'wrong' });
  assert.deepEqual(await ailleurs.service.openWithPassword('Personne', 'peu importe'), { ok: false, why: 'unknown' });
  // Au-delà de dix essais manqués dans l'heure, l'identifiant attend, même avec le bon mot de passe.
  for (let i = 1; i < w.VAULT_TRIES; i++) await ailleurs.service.openWithPassword('Kiko', `faux ${i}`);
  assert.deepEqual(await ailleurs.service.openWithPassword('Kiko', 'Un bon mot de passe'), { ok: false, why: 'tries' });
});

test('le service ne garde ni le mot de passe, ni la clé, ni rien de lisible ; supprimer le compte efface le coffre', async () => {
  const { borne, d1, transport, w } = await bench();
  const kiko = borne('Kiko', 1);
  assert.deepEqual(await kiko.service.setPassword('Un bon mot de passe', 'Kiko'), { ok: true });
  const dump = JSON.stringify([d1.db.prepare('SELECT * FROM coffres').all(), d1.db.prepare('SELECT * FROM coffres_mdp').all()], (_k, v) => (v instanceof Uint8Array ? Buffer.from(v).toString('latin1') : v));
  for (const secret of ['Un bon mot de passe', 'Kiko', 'PRIVATE KEY', kiko.s.key.privateKey.slice(40, 80)]) assert.ok(!dump.includes(secret), secret);
  // L'oubli (Supprimer mon compte) : signé par la clé, il emporte coffre et mot de passe.
  const r = await transport('POST', '/api/oubli', JSON.stringify(signFeedback(kiko.s.key, { op: 'forget' })));
  assert.equal(r.status, 200);
  assert.equal(Number((d1.db.prepare('SELECT COUNT(*) AS n FROM coffres').get() as { n: number }).n), 0);
  assert.equal(Number((d1.db.prepare('SELECT COUNT(*) AS n FROM coffres_mdp').get() as { n: number }).n), 0);
  assert.ok(w.RETOURS_PREFIX);
});

test('le service refuse un coffre non signé par sa clé, ou plus ancien que celui qu’il garde', async () => {
  const { borne, transport } = await bench();
  const kiko = borne('Kiko');
  kiko.service.noteCode();
  assert.equal(await kiko.service.syncVault(true), 'sent');
  const intrus = createPlayerKey();
  const forged = signVault(intrus, { op: 'coffre', data: Buffer.alloc(64).toString('base64'), hash: 'a'.repeat(64) });
  const tampered = { b: forged.b.replace(intrus.publicKey, kiko.s.key.publicKey), s: forged.s };
  assert.equal((await transport('POST', '/api/coffre', JSON.stringify(tampered))).status, 403);
  const old = signVault(kiko.s.key, { op: 'coffre', data: Buffer.alloc(64).toString('base64'), hash: 'a'.repeat(64) }, Date.now() - 60_000);
  assert.equal((await transport('POST', '/api/coffre', JSON.stringify(old))).status, 409);
});

// ---------------------------------------------------------------------------
// L'écran (app/src/account-menu.ts), sur une fausse bibliothèque

interface MenuAction { label: string; tone?: string; qr?: { url: string; hint?: string }; run(): void | Promise<void> }
interface MenuBuilt { heading: string; actions: MenuAction[]; sections: { rows: { text: string }[] }[] }
interface AccountMenuModule {
  createAccountMenu(host: object): { items: Record<string, { detail?: string; attention?: boolean; run(): void }>; openCopy(copy: unknown, back: () => void): void; attention(): boolean };
}

test('écran : le code se vérifie par deux mots ; une copie se reprend après confirmation, curseur sur Annuler', async () => {
  const { borne } = await bench();
  const kiko = borne('Kiko', 3);
  saveProtection(kiko.dir, { v: 1 });
  // eslint-disable-next-line @typescript-eslint/no-require-imports
  const { createAccountMenu } = require(path.join(REPO_ROOT, 'app', 'dist', 'account-menu.js')) as AccountMenuModule;
  let screen: { build: () => MenuBuilt; at?: number } | undefined;
  const prompts: { label: string; done: (v: string | undefined) => void }[] = [];
  const applied: AccountBundle[] = [];
  const service = (await import(pathToFileURL(path.join(REPO_ROOT, 'app', 'dist', 'account-service.js')).href)) as Service;
  const svc = service.createAccountService({ dataDir: kiko.dir, copiesDir: tmp('cp-secours-'), key: () => kiko.s.key });
  const menu = createAccountMenu({
    library: {
      openCustom: (build: () => MenuBuilt, at?: number) => (screen = { build, at }),
      openPrompt: (_h: string, label: string, _v: string, done: (v: string | undefined) => void) => prompts.push({ label, done }),
      runSystemItem: () => undefined,
      openSystem: () => (screen = undefined),
    },
    net: { state: () => kiko.s, rename: () => true, avatarFile: () => undefined, country: () => 'FR', setCountry: () => undefined, setShareScores: () => undefined, setPublicProfile: () => undefined, setPublicPresence: () => undefined },
    service: svc,
    level: () => ({ level: 12, xp: 3450 }),
    openDelete: () => undefined,
    apply: async (b: AccountBundle) => void applied.push(b),
  });
  assert.equal(menu.attention(), true, 'code pas noté : la pastille');
  menu.items.account!.run();
  const act = (label: string) => screen!.build().actions.find((a) => a.label === label)!;
  await act('Noter mon code de récupération…').run();
  const code = screen!.build();
  assert.equal(code.sections[0]!.rows.length, 6, '24 mots en six lignes');
  assert.equal(code.actions[0]!.qr?.url, svc.words().join(' '), 'le QR : les mots en texte');
  await act('Je l’ai noté').run();
  const words = svc.words();
  for (const p of [prompts.shift()!, null]) {
    const ask = p ?? prompts.shift()!;
    const n = Number(/\d+/.exec(ask.label)![0]);
    ask.done(words[n - 1]!.toUpperCase());
  }
  assert.ok(svc.protection().codeNotedAt, 'code noté après deux mots justes');
  assert.equal(menu.attention(), false);
  // Une copie d'un autre compte : confirmation, curseur sur « Annuler », puis le paquet part à l'application.
  const other = borne('Léa', 1);
  const copy = { file: '', bundle: readAccountBundle(other.dir)!, summary: accountSummary(readAccountBundle(other.dir)!)! };
  menu.openCopy(copy, () => undefined);
  assert.equal(screen!.at, 1);
  assert.equal(screen!.build().actions[1]!.label, 'Annuler');
  await screen!.build().actions[0]!.run();
  assert.equal(accountSummary(applied[0]!)!.name, 'Léa');
});
